// Ride cancellations: driver cancel button, reasons, and the customer fee.
//
// • Customer cancels (the app writes status 'cancelled'): the server decides the
//   fee from the ride's own timestamps, so the app can't skip it.
// • Driver cancels through rideDriverCancel: their own reasons send the ride
//   back to other drivers (no fee); "rider didn't show up" (after waiting) and
//   "rider asked me to cancel" end the ride and can charge the fee.
// • Fees on cash rides are added to the customer's next ride: when that ride is
//   booked the server attaches the owed fees, the driver collects them, and they
//   are marked collected when the ride completes (released if it doesn't).
// • The cancelled driver earns the fee minus VilleCabs' 15%.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const L = require('./logic');

const ADMIN_EMAILS = ['admin@villecabs.com'];
const ENDED = ['cancelled', 'expired', 'no_driver', 'declined'];
let deps = {
  db: () => getFirestore(),
  now: () => Date.now(),
  inc: (n) => FieldValue.increment(n),
  union: (...v) => FieldValue.arrayUnion(...v),
  serverTime: () => FieldValue.serverTimestamp(),
};
const db = () => deps.db();
const isAdmin = (auth) => !!auth && (auth.token.admin === true || ADMIN_EMAILS.includes(String(auth.token.email || '').toLowerCase()));
const msOf = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : Number.isFinite(t) ? t : null);
const loadCfg = async () => { const s = await db().doc('config/cancellation').get(); return L.mergeCfg(s.exists ? s.data() : null); };
// A scheduled ride is accepted days early; its clock starts when the driver starts it.
const acceptMs = (b) => Math.max(msOf(b.acceptedAt) || 0, msOf(b.startedAt) || 0) || null;
const fmt = (n) => `J$${Math.round(n).toLocaleString('en-US')}`;

async function notifyCustomer(customerId, message, extra = {}) {
  if (!customerId) return;
  await db().collection('notifications').add({ customerId, message, read: false, createdAt: deps.serverTime(), ...extra }).catch(() => {});
}

// One fee record per cancelled booking (idempotent).
async function recordFee(bookingId, b, d, by, reasonKey, reasonLabel, cfg) {
  if (!d.feeJmd || !d.feeStatus || !b.customerId) return null;
  const byCard = !!(b.payment && b.payment.status === 'paid');
  const collectVia = byCard ? 'card_refund' : 'next_ride';
  const feeRef = db().doc(`cancel_fees/${bookingId}`);
  const created = await db().runTransaction(async (tx) => {
    if ((await tx.get(feeRef)).exists) return false;
    tx.set(feeRef, {
      bookingId, customerId: b.customerId, customerName: b.customerName || '', driverId: b.driverId || null, driverName: b.driverName || '',
      amountJmd: d.feeJmd, driverShareJmd: L.driverShare(d.feeJmd, cfg), status: d.feeStatus, collectVia,
      reasonKey: reasonKey || null, reasonLabel: reasonLabel || '', cancelledBy: by, why: d.why,
      collectBookingId: null, createdAt: deps.serverTime(),
    });
    if (d.feeStatus === 'owed' && collectVia === 'next_ride') {
      tx.set(db().doc(`customer_balances/${b.customerId}`), { cancelFeeOwedJmd: deps.inc(d.feeJmd), updatedAt: deps.serverTime() }, { merge: true });
    }
    return true;
  });
  if (created) {
    const msg = d.feeStatus === 'review'
      ? `We’re reviewing your cancellation. If a ${fmt(d.feeJmd)} cancellation fee applies, it will be added to your next ride.`
      : collectVia === 'card_refund'
        ? `A ${fmt(d.feeJmd)} cancellation fee applies to your cancelled ride and will be kept from your card refund.`
        : `A ${fmt(d.feeJmd)} cancellation fee will be added to your next ride.`;
    await notifyCustomer(b.customerId, msg, { type: 'cancel_fee', bookingId });
  }
  return created;
}

// ── Booking created: attach owed fees to the customer's next cash ride ──────
async function onBookingCreated(id, b) {
  if (!b || !b.customerId) return null;
  if (!['searching', 'scheduled'].includes(b.status)) return null;   // card rides wait as awaiting_payment
  if (b.paymentMethod && String(b.paymentMethod).toLowerCase() === 'card') return null;
  const q = db().collection('cancel_fees').where('customerId', '==', b.customerId).where('status', '==', 'owed').where('collectVia', '==', 'next_ride');
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(q);
    const fees = snap.docs.filter((d) => d.get('status') === 'owed');
    if (!fees.length) return null;
    const amountJmd = fees.reduce((s, d) => s + (Number(d.get('amountJmd')) || 0), 0);
    fees.forEach((d) => tx.update(db().doc(`cancel_fees/${d.id}`), { status: 'collecting', collectBookingId: id }));
    tx.update(db().doc(`bookings/${id}`), { cancelFeeCollect: { amountJmd, feeIds: fees.map((d) => d.id) } });
    return amountJmd;
  });
}

// ── Booking updated: customer cancellations + collecting owed fees ──────────
async function onBookingUpdated(id, before, after) {
  if (!before || !after || before.status === after.status) return null;
  const out = {};
  // 1) Customer cancelled: decide the fee on the server.
  if (after.status === 'cancelled' && after.cancelledBy === 'customer' && !after.cancelHandled) {
    const cfg = await loadCfg();
    const reasonKey = after.cancelReasonKey || null;
    const d = L.decide({ by: 'customer', reasonKey, stage: before.status, acceptedMs: acceptMs(after), arrivedMs: msOf(after.arrivedAt), nowMs: deps.now(), cfg });
    const label = (L.CUSTOMER_REASONS[reasonKey] || {}).label || after.cancelReason || '';
    await db().doc(`bookings/${id}`).update({ cancelHandled: true, cancelFault: d.fault, cancelFee: { amountJmd: d.feeJmd, status: d.feeStatus, why: d.why } });
    if (d.feeJmd) await recordFee(id, after, d, 'customer', reasonKey, label, cfg);
    if (after.driverId) await db().doc(`drivers/${after.driverId}`).update({ currentRideId: null }).catch(() => {});
    out.fee = d;
  }
  // 2) This ride was carrying fees from an earlier cancellation.
  const carry = after.cancelFeeCollect;
  if (carry && Array.isArray(carry.feeIds) && carry.feeIds.length) {
    if (after.status === 'completed') {
      out.collected = await db().runTransaction(async (tx) => {
        const refs = carry.feeIds.map((f) => db().doc(`cancel_fees/${f}`));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        let total = 0;
        snaps.forEach((s, i) => {
          if (!s.exists || s.get('status') !== 'collecting' || s.get('collectBookingId') !== id) return;
          total += Number(s.get('amountJmd')) || 0;
          tx.update(refs[i], { status: 'collected', collectedByDriverId: after.driverId || null, collectedAt: deps.serverTime() });
        });
        if (total) tx.set(db().doc(`customer_balances/${after.customerId}`), { cancelFeeOwedJmd: deps.inc(-total), updatedAt: deps.serverTime() }, { merge: true });
        return total;
      });
    } else if (ENDED.includes(after.status)) {
      out.released = await db().runTransaction(async (tx) => {
        const refs = carry.feeIds.map((f) => db().doc(`cancel_fees/${f}`));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        let n = 0;
        snaps.forEach((s, i) => { if (s.exists && s.get('status') === 'collecting' && s.get('collectBookingId') === id) { n += 1; tx.update(refs[i], { status: 'owed', collectBookingId: null }); } });
        return n;
      });
    }
  }
  return out;
}

// ── Driver cancels ──────────────────────────────────────────────────────────
async function driverCancel(auth, { bookingId, reasonKey, note } = {}) {
  if (!auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const r = L.DRIVER_REASONS[reasonKey];
  if (!r) throw new HttpsError('invalid-argument', 'Choose a reason for cancelling.');
  const ref = db().doc(`bookings/${String(bookingId || '')}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ride not found.');
  const b = snap.data();
  if (b.driverId !== auth.uid) throw new HttpsError('permission-denied', 'This isn’t your ride.');
  if (!L.FEE_STAGES.includes(b.status)) throw new HttpsError('failed-precondition', b.status === 'enroute' ? 'The rider is already on board. Contact VilleCabs support if you need to end this trip.' : 'This ride can’t be cancelled now.');
  const cfg = await loadCfg();
  const nowMs = deps.now();
  const d = L.decide({ by: 'driver', reasonKey, stage: b.status, acceptedMs: acceptMs(b), arrivedMs: msOf(b.arrivedAt), nowMs, cfg });
  if (reasonKey === 'rider_no_show' && d.why === 'no_show_too_soon') {
    throw new HttpsError('failed-precondition', `You can mark a no-show after waiting ${cfg.noShowWaitMinutes} minutes at the pickup.`);
  }
  const cleanNote = String(note || '').trim().slice(0, 300);
  const info = { driverId: auth.uid, driverName: b.driverName || '', reasonKey, reason: r.label, note: cleanNote, at: nowMs };

  await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const c = cur.data() || {};
    if (c.driverId !== auth.uid || !L.FEE_STAGES.includes(c.status)) throw new HttpsError('failed-precondition', 'This ride has already changed.');
    if (r.outcome === 'redispatch') {
      tx.update(ref, {
        status: 'searching', driverId: null, driverName: null, driverPhone: null, vehicleMake: null, vehicleModel: null, vehicleColor: null,
        licensePlate: null, profilePhotoUrl: null, vehiclePhotoUrl: null, rating: null, ratingCount: null,
        acceptedAt: null, arrivedAt: null, startedAt: null, driverArrived: false, driverLocation: null,
        searchStartedAt: deps.serverTime(), declinedBy: deps.union(auth.uid), redispatchCount: deps.inc(1), lastDriverCancel: info,
      });
    } else {
      tx.update(ref, {
        status: 'cancelled', cancelledBy: 'driver', cancelReasonKey: reasonKey, cancelReason: r.label, cancelNote: cleanNote,
        cancelledAt: deps.serverTime(), cancelHandled: true, cancelFault: d.fault, cancelFee: { amountJmd: d.feeJmd, status: d.feeStatus, why: d.why },
        ...(r.review ? { needsReview: true } : {}),
      });
    }
  });
  if (r.outcome === 'cancel' && d.feeJmd) await recordFee(ref.id, b, d, 'driver', reasonKey, r.label, cfg);
  await db().doc(`drivers/${auth.uid}`).update({ currentRideId: null }).catch(() => {});
  await db().collection('driver_cancellations').add({
    driverId: auth.uid, driverName: b.driverName || '', bookingId: ref.id, customerId: b.customerId || null,
    reasonKey, reason: r.label, note: cleanNote, outcome: r.outcome, fault: d.fault, feeJmd: d.feeJmd, stage: b.status,
    review: !!r.review, at: deps.serverTime(),
  });
  if (r.outcome === 'cancel') {
    await notifyCustomer(b.customerId, reasonKey === 'rider_no_show'
      ? 'Your driver waited at the pickup but couldn’t find you, so the ride was cancelled.'
      : `Your driver cancelled the ride: ${r.label}.`, { type: 'driver_cancelled', bookingId: ref.id });
  }
  return { ok: true, outcome: r.outcome, feeJmd: d.feeJmd };
}

// ── Admin: review or waive a fee ────────────────────────────────────────────
async function adminFee(auth, { feeId, action } = {}) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const ref = db().doc(`cancel_fees/${String(feeId || '')}`);
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Fee not found.');
    const f = s.data();
    const bal = db().doc(`customer_balances/${f.customerId}`);
    const nextRide = f.collectVia === 'next_ride';
    if (action === 'waive') {
      if (!['owed', 'review'].includes(f.status)) throw new HttpsError('failed-precondition', f.status === 'collecting' ? 'This fee is being collected on the customer’s current ride.' : `This fee is already ${f.status}.`);
      tx.update(ref, { status: 'waived', waivedBy: auth.token.email || null, waivedAt: deps.serverTime() });
      if (f.status === 'owed' && nextRide) tx.set(bal, { cancelFeeOwedJmd: deps.inc(-f.amountJmd), updatedAt: deps.serverTime() }, { merge: true });
      tx.update(db().doc(`bookings/${f.bookingId}`), { 'cancelFee.status': 'waived' });
      return { ok: true, status: 'waived' };
    }
    if (action === 'confirm') {
      if (f.status !== 'review') throw new HttpsError('failed-precondition', 'Only fees under review can be confirmed.');
      tx.update(ref, { status: 'owed', reviewedBy: auth.token.email || null, reviewedAt: deps.serverTime() });
      if (nextRide) tx.set(bal, { cancelFeeOwedJmd: deps.inc(f.amountJmd), updatedAt: deps.serverTime() }, { merge: true });
      tx.update(db().doc(`bookings/${f.bookingId}`), { 'cancelFee.status': 'owed' });
      return { ok: true, status: 'owed' };
    }
    throw new HttpsError('invalid-argument', 'Unknown action.');
  });
}

exports.cancelBookingCreated = onDocumentCreated('bookings/{id}', (e) => (e.data ? onBookingCreated(e.params.id, e.data.data()) : null));
exports.cancelBookingUpdated = onDocumentUpdated('bookings/{id}', (e) => onBookingUpdated(e.params.id, e.data.before.data(), e.data.after.data()));
exports.rideDriverCancel = onCall((req) => driverCancel(req.auth, req.data || {}));
exports.cancelFeeAdmin = onCall((req) => adminFee(req.auth, req.data || {}));

exports.internal = { setDeps: (d) => { deps = { ...deps, ...d }; }, onBookingCreated, onBookingUpdated, driverCancel, adminFee, recordFee };
