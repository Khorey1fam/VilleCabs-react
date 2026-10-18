/* ═══════════════════════════════════════════════════════════════════════════
   VilleCabs — extra fare requests.
   FILE LOCATION: functions/dash/extras.js

   A driver (during the ride) or an admin (any time) asks the customer for an
   extra amount — waiting time, an extra stop, a detour, a toll… — with a
   reason. The customer approves or declines in the app. If they approve they
   pay cash to the driver, or by card through WiPay when card payments are on
   for them. Nothing is added to what the customer owes without their tap.

   bookings/{rideId}/extras/{extraId}
     { customerId, driverId, amountCents, reason, note, requestedBy, status }
     status: pending → declined | approved_cash | awaiting_payment → paid
   The ride keeps running totals (whole J$): extrasApprovedTotal,
   extrasCashTotal, extrasCardTotal, and extraPending while one awaits an answer.
   ═══════════════════════════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { FieldValue } = require('firebase-admin/firestore');
const L = require('./logic');
const { db, requireAuth, isAdminToken, audit, pushTo } = require('./common');
const payments = require('./payments');

const REASONS = {
  waiting: 'Waiting time', extra_stop: 'Extra stop', route_change: 'Route change or detour', toll: 'Toll or parking',
  luggage: 'Extra luggage', extra_passenger: 'Extra passenger', cleaning: 'Cleaning fee', other: 'Other',
};
const DRIVER_STATUSES = ['active', 'arrived', 'enroute'];
const CLOSED = ['cancelled', 'expired', 'no_driver', 'declined'];
const MAX_JMD = 20000;
const MAX_OPEN = 3;
const MAX_TOTAL = 6;

exports.rideExtraRequest = onCall(async (req) => {
  const auth = requireAuth(req);
  const admin = isAdminToken(auth);
  const d = req.data || {};
  const rideId = L.cleanText(d.bookingId, 64);
  const reason = REASONS[d.reason] ? d.reason : null;
  const note = L.cleanText(d.note, 200);
  const amount = Number(d.amount);
  if (!reason) throw new HttpsError('invalid-argument', 'Choose a reason.');
  if (reason === 'other' && note.length < 3) throw new HttpsError('invalid-argument', 'Say what the extra charge is for.');
  if (!Number.isInteger(amount) || amount < 50 || amount > MAX_JMD) throw new HttpsError('invalid-argument', `Enter a whole amount from J$50 to J$${MAX_JMD.toLocaleString('en-JM')}.`);
  const rideRef = db().doc(`bookings/${rideId}`);
  const ref = rideRef.collection('extras').doc();
  await db().runTransaction(async (tx) => {
    const s = await tx.get(rideRef);
    if (!s.exists) throw new HttpsError('not-found', 'Ride not found.');
    const r = s.data();
    if (!admin) {
      if (r.driverId !== auth.uid) throw new HttpsError('permission-denied', 'Only the driver on this ride can ask for an extra fare.');
      if (!DRIVER_STATUSES.includes(r.status)) throw new HttpsError('failed-precondition', 'You can ask for an extra fare only during the ride. Contact VilleCabs admin afterwards.');
    } else if (CLOSED.includes(r.status)) {
      throw new HttpsError('failed-precondition', 'This ride didn’t happen, so there’s nothing to charge.');
    }
    if (!r.customerId) throw new HttpsError('failed-precondition', 'This ride has no customer account to ask.');
    if ((r.extrasOpenCount || 0) >= MAX_OPEN) throw new HttpsError('resource-exhausted', 'The customer already has extra-fare requests waiting. Wait for an answer first.');
    if ((r.extrasCount || 0) >= MAX_TOTAL) throw new HttpsError('resource-exhausted', 'Too many extra-fare requests on this ride. Contact VilleCabs admin.');
    tx.set(ref, {
      bookingId: rideId, customerId: r.customerId, driverId: r.driverId || null, driverName: r.driverName || null,
      amountCents: amount * 100, reason, reasonLabel: REASONS[reason], note: note || null,
      requestedBy: admin ? 'admin' : 'driver', requestedById: auth.uid, status: 'pending',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(rideRef, { extraPending: true, extrasOpenCount: FieldValue.increment(1), extrasCount: FieldValue.increment(1) });
    if (admin) audit(tx, { actor: auth.uid, role: 'admin', action: 'ride.extra_request', target: rideId, details: { amount, reason } });
  });
  return { ok: true, extraId: ref.id };
});

exports.rideExtraRespond = onCall(async (req) => {
  const auth = requireAuth(req);
  const d = req.data || {};
  const rideId = L.cleanText(d.bookingId, 64);
  const extraId = L.cleanText(d.extraId, 64);
  const decision = d.decision === 'approve' ? 'approve' : d.decision === 'decline' ? 'decline' : null;
  const payWith = d.payWith === 'card' ? 'card' : 'cash';
  if (!decision) throw new HttpsError('invalid-argument', 'Approve or decline the request.');
  if (decision === 'approve' && payWith === 'card') await payments.internal.assertCardAllowed(auth.uid);
  const rideRef = db().doc(`bookings/${rideId}`);
  const ref = rideRef.collection('extras').doc(extraId);
  const out = await db().runTransaction(async (tx) => {
    const [rs, es] = await Promise.all([tx.get(rideRef), tx.get(ref)]);
    if (!rs.exists || !es.exists) throw new HttpsError('not-found', 'Request not found.');
    const r = rs.data(); const e = es.data();
    if (r.customerId !== auth.uid || e.customerId !== auth.uid) throw new HttpsError('permission-denied', 'Not your ride.');
    if (e.status !== 'pending') throw new HttpsError('failed-precondition', 'You already answered this request.');
    if (payWith === 'card' && decision === 'approve' && e.amountCents < L.WIPAY_MIN_CENTS) {
      throw new HttpsError('failed-precondition', `Card payments need at least ${L.formatJMD(L.WIPAY_MIN_CENTS)}. Please pay this in cash.`);
    }
    const open = Math.max(0, (r.extrasOpenCount || 1) - 1);
    const ridePatch = { extrasOpenCount: open, extraPending: open > 0 };
    let status;
    if (decision === 'decline') {
      status = 'declined';
      tx.update(ref, { status, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), declineNote: L.cleanText(d.note, 200) || null });
    } else if (payWith === 'cash') {
      status = 'approved_cash';
      const j = Math.round(e.amountCents / 100);
      tx.update(ref, { status, payment: { method: 'cash', status: 'unpaid' }, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      Object.assign(ridePatch, { extrasApprovedTotal: FieldValue.increment(j), extrasCashTotal: FieldValue.increment(j) });
    } else {
      status = 'awaiting_payment';
      tx.update(ref, { status, payment: { method: 'card', status: 'pending', provider: 'wipay' }, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(rideRef, ridePatch);
    return { status };
  });
  return { ok: true, ...out, payId: `${rideId}/${extraId}` };
});

// Tell the customer about a new request, and the driver about the answer.
exports.rideExtraNotifyNew = onDocumentCreated('bookings/{rideId}/extras/{extraId}', async (event) => {
  const e = event.data && event.data.data();
  if (!e) return;
  await pushTo('customers', e.customerId, `Extra fare request: ${L.formatJMD(e.amountCents)}`,
    `${e.requestedBy === 'admin' ? 'VilleCabs' : e.driverName || 'Your driver'} asks for ${L.formatJMD(e.amountCents)} for ${String(e.reasonLabel || '').toLowerCase()}. Open VilleCabs to approve or decline.`,
    { tag: `vc-extra-${event.params.extraId}`, bookingId: event.params.rideId });
});
const ANSWER = {
  declined: (e) => ['Extra fare declined', `The customer declined ${L.formatJMD(e.amountCents)} for ${String(e.reasonLabel || '').toLowerCase()}. VilleCabs admin can review it.`],
  approved_cash: (e) => ['Extra fare approved', `Collect ${L.formatJMD(e.amountCents)} cash from the customer.`],
  paid: (e) => ['Extra fare paid by card', `${L.formatJMD(e.amountCents)} was paid by card. Don’t collect cash for it.`],
};
exports.rideExtraNotifyAnswer = onDocumentUpdated('bookings/{rideId}/extras/{extraId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status || !ANSWER[after.status] || !after.driverId) return;
  const [title, body] = ANSWER[after.status](after);
  await pushTo('drivers', after.driverId, title, body, { tag: `vc-extra-${event.params.extraId}`, bookingId: event.params.rideId });
});

module.exports.REASONS = REASONS;
