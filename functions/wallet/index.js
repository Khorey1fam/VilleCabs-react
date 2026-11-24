// VilleCoins wallet. 1 VilleCoin = J$1. Coins pay for VilleCabs rides; cash
// covers whatever the coins don't. Coins can't be withdrawn.
//
// • wallets/{uid}            { balance }            owner reads, functions write
// • wallet_tx/{id}           one line per change     owner reads, functions write
// • wallet_topups/{id}       a card top-up waiting for / paid through WiPay
// • wallet_bank_requests/{id} a bank-transfer top-up waiting for admin to check
// • config/wallet            bank details + contact numbers shown to customers
// • wallet_codes/{CODE}      a redeem code worth coins; works once, for one person
// • wallet_code_tries/{uid}  wrong-code counter so codes can't be guessed
// Rewards: 2% back on completed rides, 50 coins on a first completed ride,
// welcome coins (config/wallet.welcomeOn / welcomeCoins).
//
// Coins come in three ways: a card top-up (paid through the existing WiPay
// flow, credited in payments.js by creditTopupInTx), a bank transfer that an
// admin approves after checking the bank account, or an admin credit. A ride that
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
  const held = await settleHeld(id, after);
  const back = await cashback(id, before, after);
  await firstRide(id, before, after);
  return held || back;
}

// Coins held at booking: paid on completion, returned if the ride didn't happen.
async function settleHeld(id, after) {
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

// ── 2% back ─────────────────────────────────────────────────────────────────
// A completed ride earns 2% of its fare in VilleCoins (rounded down). If the
// ride is later changed to cancelled (e.g. by admin), the coins come back off
// the wallet — as many as are still there if some were already spent.
const CASHBACK_PCT = 2;
const CASHBACK_MAX = 1000; // per ride
const cashbackFor = (fare) => Math.min(CASHBACK_MAX, Math.floor((coinsOf(fare) * CASHBACK_PCT) / 100));

async function cashback(id, before, after) {
  const uid = after.customerId;
  if (!uid || typeof uid !== 'string') return null;
  const earn = after.status === 'completed';
  const undo = before.status === 'completed' && ENDED.includes(after.status);
  if (!earn && !undo) return null;
  const ref = db().doc(`bookings/${id}`);
  const out = await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists) return null;
    const b = cur.data();
    const cb = b.cashback || null;
    if (earn) {
      if (b.status !== 'completed' || (cb && cb.status === 'credited')) return null;
      const n = cashbackFor(b.fare);
      if (n < 1) return null;
      const ws = await tx.get(db().doc(`wallets/${uid}`));
      const balance = applyInTx(tx, ws, uid, n, { type: 'ride_cashback', bookingId: id, note: `${CASHBACK_PCT}% back on a completed ride` });
      tx.update(ref, { cashback: { coins: n, pct: CASHBACK_PCT, status: 'credited', at: deps.serverTime() } });
      return { kind: 'credited', coins: n, balance };
    }
    if (!cb || cb.status !== 'credited' || !ENDED.includes(b.status)) return null;
    const ws = await tx.get(db().doc(`wallets/${uid}`));
    const have = ws.exists ? coinsOf(ws.get('balance')) : 0;
    const take = Math.min(have, coinsOf(cb.coins));
    if (take > 0) applyInTx(tx, ws, uid, -take, { type: 'ride_cashback_reversed', bookingId: id, note: 'Ride was cancelled' });
    tx.update(ref, { cashback: { ...cb, status: 'reversed', reversedCoins: take, shortBy: coinsOf(cb.coins) - take, reversedAt: deps.serverTime() } });
    return { kind: 'reversed', coins: take };
  });
  if (!out) return null;
  const message = out.kind === 'credited'
    ? `You earned ${fmt(out.coins)} VilleCoins (${CASHBACK_PCT}% back) on your ride.`
    : `Your ride was cancelled, so the ${CASHBACK_PCT}% back reward was removed from your wallet.`;
  if (out.kind === 'credited' || out.coins > 0) {
    await db().collection('notifications').add({ customerId: uid, type: 'wallet', read: false, createdAt: deps.serverTime(), message }).catch(() => {});
  }
  return out.kind === 'credited' ? 'cashback' : 'cashback_reversed';
}

// ── First completed ride: 50 coins ──────────────────────────────────────────
// Once per customer, on their first completed ride. If that ride is changed to
// cancelled, the coins come back off (as far as the balance allows) and the
// next completed ride can earn it instead.
const FIRST_RIDE_COINS = 50;

async function firstRide(id, before, after) {
  const uid = after.customerId;
  if (!uid || typeof uid !== 'string') return null;
  const earn = after.status === 'completed';
  const undo = before.status === 'completed' && ENDED.includes(after.status);
  if (!earn && !undo) return null;
  const wRef = db().doc(`wallets/${uid}`);
  const bRef = db().doc(`bookings/${id}`);
  if (earn) {
    const w0 = await wRef.get();
    if (w0.exists && w0.get('firstRide')) return null;
    // Customers who already finished a ride before this reward started don't get it.
    const done = await db().collection('bookings').where('customerId', '==', uid).where('status', '==', 'completed').get();
    if (done.docs.some((d) => d.id !== id)) {
      await wRef.set({ firstRide: { status: 'earlier' } }, { merge: true });
      return null;
    }
  }
  const out = await db().runTransaction(async (tx) => {
    const ws = await tx.get(wRef);
    const b = await tx.get(bRef);
    if (!b.exists) return null;
    const fr = ws.exists ? ws.get('firstRide') : null;
    if (earn) {
      if (fr || b.get('status') !== 'completed') return null;
      const balance = applyInTx(tx, ws, uid, FIRST_RIDE_COINS, { type: 'first_ride_bonus', bookingId: id, note: 'First ride reward' });
      tx.set(wRef, { firstRide: { status: 'credited', bookingId: id, coins: FIRST_RIDE_COINS } }, { merge: true });
      tx.update(bRef, { firstRideBonus: { coins: FIRST_RIDE_COINS, status: 'credited' } });
      return { kind: 'credited', balance };
    }
    const fb = b.get('firstRideBonus');
    if (!fb || fb.status !== 'credited' || !ENDED.includes(b.get('status'))) return null;
    const have = ws.exists ? coinsOf(ws.get('balance')) : 0;
    const take = Math.min(have, coinsOf(fb.coins));
    if (take > 0) applyInTx(tx, ws, uid, -take, { type: 'first_ride_bonus_reversed', bookingId: id, note: 'Ride was cancelled' });
    tx.set(wRef, { firstRide: deps.del() }, { merge: true });
    tx.update(bRef, { firstRideBonus: { ...fb, status: 'reversed', reversedCoins: take } });
    return { kind: 'reversed', coins: take };
  });
  if (!out) return null;
  if (out.kind === 'credited') {
    await db().collection('notifications').add({ customerId: uid, type: 'wallet', read: false, createdAt: deps.serverTime(), message: `Thanks for your first ride! ${FIRST_RIDE_COINS} VilleCoins were added to your wallet.` }).catch(() => {});
  }
  return out.kind;
}

// ── Welcome coins ───────────────────────────────────────────────────────────
// config/wallet: { welcomeOn: true|false, welcomeCoins: 200 }. While on, every
// new customer gets the coins when their account is created. Admin can also
// give them to every customer who already has an account. Each customer gets
// them once; wallets/{uid}.welcome records it and whether the pop-up was seen.
const WELCOME_DEFAULT = 200;
const WELCOME_MAX = 5000;
async function welcomeConfig() {
  const c = await db().doc('config/wallet').get();
  const on = c.exists && c.get('welcomeOn') === true;
  const n = c.exists && c.get('welcomeCoins') != null ? coinsOf(c.get('welcomeCoins')) : WELCOME_DEFAULT;
  return { on, coins: Math.max(0, Math.min(WELCOME_MAX, n)) };
}
async function grantWelcome(uid, coins, how) {
  if (!uid || coins < 1) return false;
  const wRef = db().doc(`wallets/${uid}`);
  return db().runTransaction(async (tx) => {
    const ws = await tx.get(wRef);
    if (ws.exists && ws.get('welcome')) return false;
    applyInTx(tx, ws, uid, coins, { type: 'welcome_bonus', note: 'Welcome gift' });
    tx.set(wRef, { welcome: { coins, how, seen: false, at: deps.serverTime() } }, { merge: true });
    return true;
  });
}
async function onCustomerCreated(uid) {
  const cfg = await welcomeConfig();
  if (!cfg.on) return null;
  return (await grantWelcome(uid, cfg.coins, 'signup')) ? 'granted' : 'skipped';
}
async function welcomeAll(auth) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const cfg = await welcomeConfig();
  if (!cfg.on) throw new HttpsError('failed-precondition', 'Turn welcome coins on first.');
  const all = await db().collection('customers').get();
  let given = 0; let had = 0;
  for (const d of all.docs) {
    // eslint-disable-next-line no-await-in-loop
    if (await grantWelcome(d.id, cfg.coins, 'existing')) given += 1; else had += 1;
  }
  return { ok: true, given, had, coins: cfg.coins };
}
async function welcomeSeen(auth) {
  if (!auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const wRef = db().doc(`wallets/${auth.uid}`);
  return db().runTransaction(async (tx) => {
    const ws = await tx.get(wRef);
    const w = ws.exists ? ws.get('welcome') : null;
    if (!w || w.seen) return { ok: true };
    tx.set(wRef, { welcome: { ...w, seen: true } }, { merge: true });
    return { ok: true };
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

// ── Bank transfer top-ups ───────────────────────────────────────────────────
// The customer asks for an amount and gets a reference code to put on the
// transfer, then attaches a photo of the receipt. Nothing is credited until an
// admin has checked the bank account and approved it.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const makeCode = () => `VC-${Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')}`;
const BANK_OPEN_MAX = 3;
const receiptOk = (uid, path) => typeof path === 'string' && path.length < 300 && path.startsWith(`wallet_receipts/${uid}/`) && !path.includes('..');

async function bankCreate(auth, { coins, receiptPath } = {}) {
  if (!auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const n = coinsOf(coins);
  if (n < TOPUP_MIN || n > TOPUP_MAX) throw new HttpsError('invalid-argument', `Top up between ${fmt(TOPUP_MIN)} and ${fmt(TOPUP_MAX)} VilleCoins.`);
  if (receiptPath != null && !receiptOk(auth.uid, receiptPath)) throw new HttpsError('invalid-argument', 'That receipt photo can’t be used.');
  const cfg = await db().doc('config/wallet').get();
  if (!cfg.exists || !String(cfg.get('accountNumber') || '').trim()) throw new HttpsError('failed-precondition', 'Bank transfers aren’t set up yet. Please contact VilleCabs.');
  const open = await db().collection('wallet_bank_requests').where('uid', '==', auth.uid).where('status', '==', 'pending').get();
  if (open.size >= BANK_OPEN_MAX) throw new HttpsError('resource-exhausted', 'You already have bank transfers waiting to be checked. Finish or cancel one first.');
  const cust = await db().doc(`customers/${auth.uid}`).get();
  const ref = db().collection('wallet_bank_requests').doc();
  const code = makeCode();
  await ref.set({
    uid: auth.uid, coins: n, amountJ: n, code, status: 'pending', receiptPath: receiptPath || null,
    customerName: cust.exists ? (cust.get('name') || '') : '', customerPhone: cust.exists ? (cust.get('phone') || '') : '',
    customerEmail: auth.token.email || '', createdAt: deps.serverTime(),
  });
  return { ok: true, id: ref.id, code };
}

async function bankUpdate(auth, { id, receiptPath, cancel } = {}) {
  if (!auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  if (!id || typeof id !== 'string') throw new HttpsError('invalid-argument', 'Missing request.');
  const ref = db().doc(`wallet_bank_requests/${id}`);
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.get('uid') !== auth.uid) throw new HttpsError('not-found', 'Request not found.');
    if (s.get('status') !== 'pending') throw new HttpsError('failed-precondition', 'This transfer has already been checked.');
    if (cancel === true) { tx.update(ref, { status: 'cancelled', decidedAt: deps.serverTime() }); return { ok: true, status: 'cancelled' }; }
    if (!receiptOk(auth.uid, receiptPath)) throw new HttpsError('invalid-argument', 'That receipt photo can’t be used.');
    tx.update(ref, { receiptPath, receiptAt: deps.serverTime() });
    return { ok: true, status: 'pending' };
  });
}

async function bankDecide(auth, { id, approve, coins, note } = {}) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  if (!id || typeof id !== 'string') throw new HttpsError('invalid-argument', 'Missing request.');
  const why = String(note || '').trim().slice(0, 200);
  if (approve !== true && !why) throw new HttpsError('invalid-argument', 'Write a short reason the customer will see.');
  const ref = db().doc(`wallet_bank_requests/${id}`);
  const out = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Request not found.');
    const r = s.data();
    if (r.status !== 'pending') throw new HttpsError('failed-precondition', 'This transfer has already been checked.');
    const by = auth.token.email || null;
    if (approve !== true) {
      tx.update(ref, { status: 'rejected', note: why, decidedBy: by, decidedAt: deps.serverTime() });
      return { status: 'rejected', uid: r.uid, code: r.code, why };
    }
    // The admin can credit what actually arrived if it differs from what was asked.
    const n = coins == null ? coinsOf(r.coins) : coinsOf(coins);
    if (n < 1 || n > TOPUP_MAX) throw new HttpsError('invalid-argument', `Enter between 1 and ${fmt(TOPUP_MAX)} coins.`);
    const ws = await tx.get(db().doc(`wallets/${r.uid}`));
    const balance = applyInTx(tx, ws, r.uid, n, { type: 'topup_bank', requestId: id, note: `Bank transfer ${r.code}`, by });
    tx.update(ref, { status: 'approved', creditedCoins: n, note: why || null, decidedBy: by, decidedAt: deps.serverTime() });
    return { status: 'approved', uid: r.uid, code: r.code, coins: n, balance };
  });
  const message = out.status === 'approved'
    ? `Your bank transfer ${out.code} was confirmed. ${fmt(out.coins)} VilleCoins were added to your wallet.`
    : `We couldn’t confirm bank transfer ${out.code}: ${out.why}`;
  await db().collection('notifications').add({ customerId: out.uid, type: 'wallet', read: false, createdAt: deps.serverTime(), message }).catch(() => {});
  return { ok: true, status: out.status, balance: out.balance == null ? null : out.balance };
}

// ── Redeem codes ────────────────────────────────────────────────────────────
// Admin makes codes worth a set number of coins (gift vouchers, cash sold at
// the office). Each code works once, for one person.
const CODES_MAX = 50;
const TRIES_MAX = 8;                 // wrong codes allowed per hour
const HOUR = 60 * 60 * 1000;
const giftCode = () => { const r = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); return `VC-${r()}-${r()}`; };
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeId = (c) => { const x = cleanCode(c); return /^VC[A-Z0-9]{8}$/.test(x) ? `VC-${x.slice(2, 6)}-${x.slice(6)}` : null; };

async function codeCreate(auth, { coins, count, note } = {}) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const n = coinsOf(coins); const k = count == null ? 1 : coinsOf(count);
  if (n < 1 || n > TOPUP_MAX) throw new HttpsError('invalid-argument', `Each code can be worth 1 to ${fmt(TOPUP_MAX)} coins.`);
  if (k < 1 || k > CODES_MAX) throw new HttpsError('invalid-argument', `Make 1 to ${CODES_MAX} codes at a time.`);
  const why = String(note || '').trim().slice(0, 120);
  const codes = [];
  for (let i = 0; i < k; i += 1) {
    let id = giftCode();
    while ((await db().doc(`wallet_codes/${id}`).get()).exists) id = giftCode(); // eslint-disable-line no-await-in-loop
    await db().doc(`wallet_codes/${id}`).set({ coins: n, status: 'active', note: why, createdBy: auth.token.email || null, createdAt: deps.serverTime() }); // eslint-disable-line no-await-in-loop
    codes.push(id);
  }
  return { ok: true, codes };
}

async function codeCancel(auth, { code } = {}) {
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const id = codeId(code);
  if (!id) throw new HttpsError('invalid-argument', 'Missing code.');
  const ref = db().doc(`wallet_codes/${id}`);
  return db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Code not found.');
    if (s.get('status') !== 'active') throw new HttpsError('failed-precondition', 'This code has already been used or cancelled.');
    tx.update(ref, { status: 'cancelled', cancelledBy: auth.token.email || null, cancelledAt: deps.serverTime() });
    return { ok: true };
  });
}

async function codeRedeem(auth, { code } = {}, now = Date.now()) {
  if (!auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const triesRef = db().doc(`wallet_code_tries/${auth.uid}`);
  const t = await triesRef.get();
  const since = t.exists ? Number(t.get('since')) || 0 : 0;
  const fresh = now - since > HOUR;
  const tries = t.exists && !fresh ? coinsOf(t.get('count')) : 0;
  if (tries >= TRIES_MAX) throw new HttpsError('resource-exhausted', 'Too many wrong codes. Please try again in an hour, or contact VilleCabs.');
  const miss = async (msg) => { await triesRef.set({ count: tries + 1, since: fresh || !since ? now : since }); throw new HttpsError('not-found', msg); };
  const id = codeId(code);
  if (!id) return miss('That code isn’t right. Check it and try again.');
  const ref = db().doc(`wallet_codes/${id}`);
  const out = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return { miss: 'That code isn’t right. Check it and try again.' };
    const c = s.data();
    if (c.status === 'redeemed') return { miss: c.redeemedBy === auth.uid ? 'You’ve already used this code.' : 'This code has already been used.' };
    if (c.status !== 'active') return { miss: 'This code is no longer valid.' };
    const n = coinsOf(c.coins);
    const ws = await tx.get(db().doc(`wallets/${auth.uid}`));
    const balance = applyInTx(tx, ws, auth.uid, n, { type: 'code_redeem', code: id, note: 'Redeemed a code' });
    tx.update(ref, { status: 'redeemed', redeemedBy: auth.uid, redeemedEmail: auth.token.email || null, redeemedAt: deps.serverTime() });
    return { coins: n, balance };
  });
  if (out.miss) return miss(out.miss);
  return { ok: true, coins: out.coins, balance: out.balance };
}

exports.walletTopupCreate = onCall(async (req) => {
  const { mergePayments, cardAllowedFor } = require('../dash/logic');
  const cardAllowed = async (uid) => { const s = await db().doc('config/payments').get(); return cardAllowedFor(mergePayments(s.exists ? s.data() : {}), uid); };
  return createTopup(req.auth, req.data || {}, cardAllowed);
});
exports.walletBookingCreated = onDocumentCreated('bookings/{id}', (e) => (e.data ? onBookingCreated(e.params.id, e.data.data()) : null));
exports.walletBookingUpdated = onDocumentUpdated('bookings/{id}', (e) => onBookingUpdated(e.params.id, e.data.before.data(), e.data.after.data()));
exports.walletCustomerCreated = onDocumentCreated('customers/{uid}', (e) => onCustomerCreated(e.params.uid));
exports.walletWelcomeAll = onCall({ timeoutSeconds: 540 }, (req) => welcomeAll(req.auth));
exports.walletWelcomeSeen = onCall((req) => welcomeSeen(req.auth));
exports.walletAdminAdjust = onCall((req) => adminAdjust(req.auth, req.data || {}));
exports.walletBankCreate = onCall((req) => bankCreate(req.auth, req.data || {}));
exports.walletBankUpdate = onCall((req) => bankUpdate(req.auth, req.data || {}));
exports.walletBankDecide = onCall((req) => bankDecide(req.auth, req.data || {}));
exports.walletCodeCreate = onCall((req) => codeCreate(req.auth, req.data || {}));
exports.walletCodeCancel = onCall((req) => codeCancel(req.auth, req.data || {}));
exports.walletRedeem = onCall((req) => codeRedeem(req.auth, req.data || {}));

exports.creditTopupInTx = creditTopupInTx;
exports.internal = { setDeps: (d) => { deps = { ...deps, ...d }; }, applyInTx, creditTopupInTx, createTopup, onBookingCreated, onBookingUpdated, adminAdjust, bankCreate, bankUpdate, bankDecide, codeCreate, codeCancel, codeRedeem, cashbackFor, CASHBACK_PCT, firstRide, onCustomerCreated, welcomeAll, welcomeSeen, FIRST_RIDE_COINS };
