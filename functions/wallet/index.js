// VilleCoins wallet. 1 VilleCoin = J$1. Coins pay for VilleCabs rides; cash
// covers whatever the coins don't. Coins can't be withdrawn.
//
// • wallets/{uid}            { balance }            owner reads, functions write
// • wallet_tx/{id}           one line per change     owner reads, functions write
// • wallet_topups/{id}       a card top-up waiting for / paid through WiPay
//
// Coins come in two ways: a card top-up (paid through the existing WiPay flow,
// credited in payments.js by creditTopupInTx) or an admin credit. A ride that
// asks to use coins has them taken when it is booked; if the ride never
// happens they go straight back.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const ADMIN_EMAILS = ['admin@villecabs.com'];
const ENDED = ['cancelled', 'expired', 'no_driver', 'declined'];
const TOPUP_MIN = 500;
const TOPUP_MAX = 50000;
const ADJUST_MAX = 100000;
let deps = {
  db: () => getFirestore(),
  serverTime: () => FieldValue.serverTimestamp(),
  del: () => FieldValue.delete(),
};
const db = () => deps.db();
const isAdmin = (auth) => !!auth && (auth.token.admin === true || ADMIN_EMAILS.includes(String(auth.token.email || '').toLowerCase()));
const coinsOf = (n) => (Number.isFinite(Number(n)) ? Math.floor(Number(n)) : 0);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Change a balance inside a transaction. `walletSnap` must have been read in
// the same transaction. Returns the new balance; refuses to go below zero.
function applyInTx(tx, walletSnap, uid, delta, entry) {
  const before = walletSnap.exists ? coinsOf(walletSnap.get('balance')) : 0;
  const after = before + delta;
  if (after < 0) throw new HttpsError('failed-precondition', 'Not enough VilleCoins.');
  tx.set(db().doc(`wallets/${uid}`), { balance: after, updatedAt: deps.serverTime() }, { merge: true });
  tx.set(db().collection('wallet_tx').doc(), { uid, amount: delta, balanceAfter: after, at: deps.serverTime(), ...entry });
  return after;
}

// Used by payments.js when WiPay confirms a top-up (inside its transaction).
function creditTopupInTx(tx, walletSnap, topupId, t) {
  const coins = coinsOf(t.coins);
  return applyInTx(tx, walletSnap, t.customerId, coins, { type: 'topup_card', topupId, note: 'Card top-up' });
}

// ── Customer: start a card top-up ───────────────────────────────────────────
async function createTopup(auth, { coins } = {}, cardAllowed) {
  if (!auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const n = coinsOf(coins);
  if (n < TOPUP_MIN || n > TOPUP_MAX) throw new HttpsError('invalid-argument', `Top up between ${fmt(TOPUP_MIN)} and ${fmt(TOPUP_MAX)} VilleCoins.`);
  if (!(await cardAllowed(auth.uid))) throw new HttpsError('failed-precondition', 'Card top-ups aren’t available yet.');
  const ref = db().collection('wallet_topups').doc();
  await ref.set({
    customerId: auth.uid, coins: n, amountCents: n * 100, status: 'awaiting_payment',
    payment: { method: 'card', status: 'unpaid' }, createdAt: deps.serverTime(),
  });
  return { ok: true, id: ref.id };
}

// ── Ride booked: take the coins it asked to use ─────────────────────────────
async function onBookingCreated(id, b) {
  const ref = db().doc(`bookings/${id}`);
  const want = coinsOf(b && b.walletCoins);
  if (!b || want <= 0) {
    if (b && b.wallet) await ref.update({ wallet: deps.del() });  // only the server sets this
    return null;
  }
  const byCard = String(b.paymentMethod || '').toLowerCase() === 'card' || (b.payment && b.payment.method === 'card');
  if (byCard || !b.customerId || !['searching', 'scheduled'].includes(b.status)) {
    await ref.update({ wallet: { applied: 0, status: 'not_used', reason: byCard ? 'card' : 'not_bookable' } });
    return null;
  }
  return db().runTransaction(async (tx) => {
    const ws = await tx.get(db().doc(`wallets/${b.customerId}`));
    const balance = ws.exists ? coinsOf(ws.get('balance')) : 0;
    const fare = Math.max(0, Math.round(Number(b.fare) || 0));
    const applied = Math.min(want, balance, fare);
    if (applied <= 0) {
      tx.update(ref, { wallet: { applied: 0, status: 'not_used', reason: 'no_balance' } });
      return 0;
    }
    applyInTx(tx, ws, b.customerId, -applied, { type: 'ride_payment', bookingId: id, note: 'VilleCabs ride' });
    tx.update(ref, { wallet: { applied, status: 'held', cashDue: fare - applied } });
    return applied;
  });
}

// ── Ride finished: keep the coins, or give them back ────────────────────────
async function onBookingUpdated(id, before, after) {
  if (!before || !after || before.status === after.status) return null;
  if (!after.wallet || after.wallet.status !== 'held') return null;
  const done = after.status === 'completed';
  if (!done && !ENDED.includes(after.status)) return null;
  const ref = db().doc(`bookings/${id}`);
  return db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const w = cur.exists ? cur.get('wallet') : null;
    if (!w || w.status !== 'held') return 'skipped';
    if (done) { tx.update(ref, { wallet: { ...w, status: 'paid' } }); return 'paid'; }
    const ws = await tx.get(db().doc(`wallets/${after.customerId}`));
    applyInTx(tx, ws, after.customerId, coinsOf(w.applied), { type: 'ride_refund', bookingId: id, note: 'Ride didn’t go ahead' });
    tx.update(ref, { wallet: { ...w, status: 'refunded' } });
    return 'refunded';
  });
}

// ── Admin: add or remove coins ──────────────────────────────────────────────
async function adminAdjust(auth, { uid, coins, reason } = {}) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const n = coinsOf(coins);
  const why = String(reason || '').trim().slice(0, 200);
  if (!uid || typeof uid !== 'string') throw new HttpsError('invalid-argument', 'Choose a customer.');
  if (!n || Math.abs(n) > ADJUST_MAX) throw new HttpsError('invalid-argument', `Enter an amount between 1 and ${fmt(ADJUST_MAX)} coins.`);
  if (!why) throw new HttpsError('invalid-argument', 'Write a short reason (for example “Paid J$2,000 cash at the office”).');
  const cust = await db().doc(`customers/${uid}`).get();
  if (!cust.exists) throw new HttpsError('not-found', 'Customer not found.');
  const balance = await db().runTransaction(async (tx) => {
    const ws = await tx.get(db().doc(`wallets/${uid}`));
    return applyInTx(tx, ws, uid, n, { type: n > 0 ? 'admin_credit' : 'admin_debit', note: why, by: auth.token.email || null });
  });
  if (n > 0) {
    await db().collection('notifications').add({ customerId: uid, type: 'wallet', read: false, createdAt: deps.serverTime(), message: `${fmt(n)} VilleCoins were added to your wallet.` }).catch(() => {});
  }
  return { ok: true, balance };
}

exports.walletTopupCreate = onCall(async (req) => {
  const { mergePayments, cardAllowedFor } = require('../dash/logic');
  const cardAllowed = async (uid) => { const s = await db().doc('config/payments').get(); return cardAllowedFor(mergePayments(s.exists ? s.data() : {}), uid); };
  return createTopup(req.auth, req.data || {}, cardAllowed);
});
exports.walletBookingCreated = onDocumentCreated('bookings/{id}', (e) => (e.data ? onBookingCreated(e.params.id, e.data.data()) : null));
exports.walletBookingUpdated = onDocumentUpdated('bookings/{id}', (e) => onBookingUpdated(e.params.id, e.data.before.data(), e.data.after.data()));
exports.walletAdminAdjust = onCall((req) => adminAdjust(req.auth, req.data || {}));

exports.creditTopupInTx = creditTopupInTx;
exports.internal = { setDeps: (d) => { deps = { ...deps, ...d }; }, applyInTx, creditTopupInTx, createTopup, onBookingCreated, onBookingUpdated, adminAdjust };
