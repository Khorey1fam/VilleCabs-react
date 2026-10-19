// Creator program: private promo codes for social media creators.
//
// • Codes live in creators / creator_codes (admin-only), never in the public
//   promo_codes list, so they don't show on the website.
// • A rider checks a code through creatorCodeCheck; each customer can use a
//   given creator code once (released again if that ride never happens).
// • When a booking with a creator code is created, the server re-checks it and
//   locks the customer's one use. When the ride is COMPLETED, the creator earns
//   their fixed J$ payout, recorded once per ride in creator_uses.
// • VilleCabs covers the rider's discount: the booking is marked
//   discountCoveredBy 'villecabs' so the driver is paid on the full fare.
// • Each creator gets a private stats link (/creator/<token>) with counts and
//   earnings only, never customer details.
const crypto = require('crypto');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const L = require('./logic');

const ADMIN_EMAILS = ['admin@villecabs.com'];
let deps = {
  db: () => getFirestore(),
  inc: (n) => FieldValue.increment(n),
  serverTime: () => FieldValue.serverTimestamp(),
  del: () => FieldValue.delete(),
  token: () => crypto.randomBytes(18).toString('base64url'),
};
const db = () => deps.db();
const isAdmin = (auth) => !!auth && (auth.token.admin === true || ADMIN_EMAILS.includes(String(auth.token.email || '').toLowerCase()));
const msOf = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : Number.isFinite(t) ? t : null);
const GENERIC = 'Invalid promo code.';

// ── Rider: check a code before booking ──────────────────────────────────────
async function checkCode(uid, rawCode) {
  const code = L.normCode(rawCode);
  if (!L.validCode(code)) return { ok: false, message: GENERIC };
  const cs = await db().doc(`creator_codes/${code}`).get();
  if (!cs.exists) return { ok: false, message: GENERIC };
  const cr = await db().doc(`creators/${cs.get('creatorId')}`).get();
  if (!cr.exists || cr.get('active') === false) return { ok: false, message: 'This promo code is no longer active.' };
  const red = await db().doc(`creator_redemptions/${code}_${uid}`).get();
  if (red.exists && ['active', 'completed'].includes(red.get('status'))) return { ok: false, message: 'You have already used this promo code.' };
  const c = cr.data();
  return { ok: true, code, discountType: c.discountType, discount: c.discount, label: L.discountLabel(c.discountType, c.discount) };
}

// ── Booking created: lock the customer's one use ────────────────────────────
async function onBookingCreated(id, b) {
  const ref = db().doc(`bookings/${id}`);
  const code = L.normCode(b && b.creatorCode);
  if (!code) {
    // Only the server may mark a ride as creator-discounted.
    if (b && (b.discountCoveredBy || b.creator)) await ref.update({ discountCoveredBy: deps.del(), creator: deps.del() });
    return null;
  }
  const result = await db().runTransaction(async (tx) => {
    const reject = (reason) => ({ status: 'rejected', reason, code });
    const cs = await tx.get(db().doc(`creator_codes/${code}`));
    if (!cs.exists) return reject('unknown_code');
    const creatorId = cs.get('creatorId');
    const crRef = db().doc(`creators/${creatorId}`);
    const cr = await tx.get(crRef);
    if (!cr.exists || cr.get('active') === false) return reject('inactive');
    if (!b.customerId) return reject('no_customer');
    const redRef = db().doc(`creator_redemptions/${code}_${b.customerId}`);
    const red = await tx.get(redRef);
    if (red.exists && ['active', 'completed'].includes(red.get('status')) && red.get('bookingId') !== id) return reject('already_used');
    const c = cr.data();
    if (!L.fareMatches(b, c)) return reject('fare_mismatch');
    const discountJmd = Math.max(0, Math.round(Number(b.originalFare) - Number(b.fare)));
    tx.set(redRef, { code, creatorId, uid: b.customerId, bookingId: id, status: 'active', at: deps.serverTime() });
    tx.update(crRef, { booked: deps.inc(1), updatedAt: deps.serverTime() });
    return { status: 'pending', creatorId, code, discountJmd, payoutJmd: c.payoutJmd };
  });
  await ref.update({
    creator: { ...result, checkedAt: deps.serverTime() },
    discountCoveredBy: result.status === 'pending' ? 'villecabs' : deps.del(),
  });
  return result;
}

// ── Booking status changes: pay on completion, release on cancellation ──────
async function onBookingUpdated(id, before, after) {
  if (!after || !after.creator || after.creator.status !== 'pending') return null;
  if (before && before.status === after.status) return null;
  const done = after.status === 'completed';
  const ended = L.ENDED.includes(after.status);
  if (!done && !ended) return null;
  const { code, creatorId } = after.creator;
  const bookingRef = db().doc(`bookings/${id}`);
  return db().runTransaction(async (tx) => {
    const redRef = db().doc(`creator_redemptions/${code}_${after.customerId}`);
    const red = await tx.get(redRef);
    if (!red.exists || red.get('bookingId') !== id || red.get('status') !== 'active') return 'skipped';
    const useRef = db().doc(`creator_uses/${id}`);
    const use = await tx.get(useRef);
    const crRef = db().doc(`creators/${creatorId}`);
    if (done) {
      if (use.exists) return 'already';
      const payoutJmd = Math.round(Number(after.creator.payoutJmd) || 0);
      const discountJmd = Math.round(Number(after.creator.discountJmd) || 0);
      tx.set(useRef, {
        creatorId, code, bookingId: id, customerId: after.customerId || null,
        fare: after.fare || 0, fareBeforeDiscount: after.originalFare || 0, discountJmd, payoutJmd,
        completedAt: after.completedAt || deps.serverTime(), paid: false, payoutId: null, createdAt: deps.serverTime(),
      });
      tx.update(redRef, { status: 'completed', completedAt: deps.serverTime() });
      tx.update(crRef, { completed: deps.inc(1), earnedJmd: deps.inc(payoutJmd), discountJmd: deps.inc(discountJmd), updatedAt: deps.serverTime() });
      tx.update(bookingRef, { creator: { ...after.creator, status: 'earned' } });
      return 'earned';
    }
    tx.update(redRef, { status: 'released', releasedAt: deps.serverTime() });
    tx.update(crRef, { released: deps.inc(1), updatedAt: deps.serverTime() });
    tx.update(bookingRef, { creator: { ...after.creator, status: 'released' } });
    return 'released';
  });
}

// ── Admin: create / edit creators ───────────────────────────────────────────
async function saveCreator(auth, input) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const { errs, data } = L.cleanCreator(input);
  if (errs.length) throw new HttpsError('invalid-argument', errs[0]);
  if (input && input.id) {
    const ref = db().doc(`creators/${String(input.id)}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Creator not found.');
    await ref.update({ ...data, updatedAt: deps.serverTime(), updatedBy: auth.token.email || null });
    return { ok: true, id: snap.id, code: snap.get('code') };
  }
  const code = L.normCode(input && input.code);
  if (!L.validCode(code)) throw new HttpsError('invalid-argument', 'Codes are 3–20 letters or numbers, no spaces.');
  const promo = await db().collection('promo_codes').where('code', '==', code).limit(1).get();
  if (!promo.empty) throw new HttpsError('already-exists', 'A public promo code already uses that code.');
  const ref = db().collection('creators').doc();
  await db().runTransaction(async (tx) => {
    const codeRef = db().doc(`creator_codes/${code}`);
    if ((await tx.get(codeRef)).exists) throw new HttpsError('already-exists', 'Another creator already has that code.');
    tx.set(codeRef, { creatorId: ref.id, createdAt: deps.serverTime() });
    tx.set(ref, {
      ...data, code, statsToken: deps.token(),
      booked: 0, completed: 0, released: 0, earnedJmd: 0, paidJmd: 0, discountJmd: 0,
      createdAt: deps.serverTime(), updatedAt: deps.serverTime(), createdBy: auth.token.email || null,
    });
  });
  return { ok: true, id: ref.id, code };
}

async function rotateLink(auth, creatorId) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const ref = db().doc(`creators/${String(creatorId)}`);
  if (!(await ref.get()).exists) throw new HttpsError('not-found', 'Creator not found.');
  const statsToken = deps.token();
  await ref.update({ statsToken, updatedAt: deps.serverTime() });
  return { ok: true, statsToken };
}

// Pay everything owed so far: marks each unpaid completed ride as paid.
async function recordPayout(auth, { creatorId, method, note } = {}) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const crRef = db().doc(`creators/${String(creatorId)}`);
  const cr = await crRef.get();
  if (!cr.exists) throw new HttpsError('not-found', 'Creator not found.');
  const unpaid = await db().collection('creator_uses').where('creatorId', '==', cr.id).where('paid', '==', false).get();
  if (unpaid.empty) throw new HttpsError('failed-precondition', 'Nothing owed right now.');
  const amountJmd = unpaid.docs.reduce((s, d) => s + (Number(d.get('payoutJmd')) || 0), 0);
  const payRef = db().collection('creator_payouts').doc();
  for (let i = 0; i < unpaid.docs.length; i += 400) {
    const b = db().batch();
    unpaid.docs.slice(i, i + 400).forEach((d) => b.update(db().doc(`creator_uses/${d.id}`), { paid: true, payoutId: payRef.id, paidAt: deps.serverTime() }));
    await b.commit(); // eslint-disable-line no-await-in-loop
  }
  await payRef.set({
    creatorId: cr.id, creatorName: cr.get('name') || '', code: cr.get('code'), amountJmd, rides: unpaid.size,
    method: String(method || '').slice(0, 40), note: String(note || '').slice(0, 300),
    paidAt: deps.serverTime(), by: auth.token.email || null,
  });
  await crRef.update({ paidJmd: deps.inc(amountJmd), lastPaidAt: deps.serverTime(), updatedAt: deps.serverTime() });
  return { ok: true, amountJmd, rides: unpaid.size, payoutId: payRef.id };
}

// ── Creator: private stats link (no sign-in, token only) ────────────────────
async function statsFor(token) {
  const t = String(token || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) throw new HttpsError('not-found', 'This link isn’t valid.');
  const q = await db().collection('creators').where('statsToken', '==', t).limit(1).get();
  if (q.empty) throw new HttpsError('not-found', 'This link isn’t valid.');
  const doc = q.docs[0];
  const c = doc.data();
  const uses = (await db().collection('creator_uses').where('creatorId', '==', doc.id).get()).docs.map((d) => d.data());
  const pays = (await db().collection('creator_payouts').where('creatorId', '==', doc.id).get()).docs.map((d) => d.data());
  const months = {};
  uses.forEach((u) => {
    const ms = msOf(u.completedAt) || msOf(u.createdAt);
    if (!ms) return;
    const d = new Date(ms - 5 * 3600e3); // Jamaica
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    months[k] = months[k] || { month: k, rides: 0, earnedJmd: 0 };
    months[k].rides += 1; months[k].earnedJmd += Number(u.payoutJmd) || 0;
  });
  const earned = Number(c.earnedJmd) || 0;
  const paid = Number(c.paidJmd) || 0;
  return {
    name: c.name, handle: c.handle || '', code: c.code, active: c.active !== false,
    discountLabel: L.discountLabel(c.discountType, c.discount), payoutJmd: c.payoutJmd,
    booked: c.booked || 0, completed: c.completed || 0, released: c.released || 0,
    inProgress: Math.max(0, (c.booked || 0) - (c.completed || 0) - (c.released || 0)),
    earnedJmd: earned, paidJmd: paid, balanceJmd: Math.max(0, earned - paid),
    months: Object.values(months).sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 12),
    recent: uses.map((u) => ({ at: msOf(u.completedAt) || msOf(u.createdAt), payoutJmd: u.payoutJmd || 0, paid: !!u.paid }))
      .sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30),
    payouts: pays.map((p) => ({ at: msOf(p.paidAt), amountJmd: p.amountJmd || 0, rides: p.rides || 0 })).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 24),
  };
}

// ── Exports ─────────────────────────────────────────────────────────────────
exports.creatorCodeCheck = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return checkCode(req.auth.uid, req.data && req.data.code);
});
exports.creatorBookingCreated = onDocumentCreated('bookings/{id}', (e) => (e.data ? onBookingCreated(e.params.id, e.data.data()) : null));
exports.creatorBookingUpdated = onDocumentUpdated('bookings/{id}', (e) => onBookingUpdated(e.params.id, e.data.before.data(), e.data.after.data()));
exports.creatorSave = onCall((req) => saveCreator(req.auth, req.data || {}));
exports.creatorRotateLink = onCall((req) => rotateLink(req.auth, req.data && req.data.creatorId));
exports.creatorRecordPayout = onCall((req) => recordPayout(req.auth, req.data || {}));
exports.creatorStats = onCall((req) => statsFor(req.data && req.data.token));

exports.internal = {
  setDeps: (d) => { deps = { ...deps, ...d }; },
  checkCode, onBookingCreated, onBookingUpdated, saveCreator, rotateLink, recordPayout, statsFor,
};
