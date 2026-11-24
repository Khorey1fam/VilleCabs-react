// VilleCoins wallet: top-ups, paying for rides, refunds when a ride doesn't happen.
// Run: cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const store = new Map();
let auto = 0;
const isTs = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function';
const TS = (ms) => ({ __ms: ms, toMillis() { return this.__ms; } });
function resolve(v) {
  if (v && v.__server) return TS(Date.now());
  if (v && v.__del) return undefined;
  if (v && typeof v === 'object' && !Array.isArray(v) && !isTs(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { const r = resolve(x); if (r !== undefined) o[k] = r; } return o; }
  return v;
}
const docRef = (path) => ({
  path, id: path.split('/').pop(),
  async get() { const d = store.get(path); return { exists: !!d, id: path.split('/').pop(), data: () => d && { ...d }, get: (k) => d && d[k] }; },
  async set(v, o) { const prev = store.get(path); if (!(o && o.merge)) { store.set(path, resolve(v)); return; } const n = { ...(prev || {}), ...resolve(v) }; for (const [k, x] of Object.entries(v)) if (x && x.__del) delete n[k]; store.set(path, n); },
  async update(v) { const prev = store.get(path); if (!prev) throw new Error(`no doc ${path}`); const n = { ...prev }; for (const [k, x] of Object.entries(v)) { const r = resolve(x); if (r === undefined) delete n[k]; else n[k] = r; } store.set(path, n); },
});
const colQuery = (c, f) => ({
  where: (k, op, v) => colQuery(c, [...f, [k, v]]),
  async get() { const docs = [...store].filter(([p, d]) => p.startsWith(`${c}/`) && f.every(([k, v]) => d[k] === v)).map(([p, d]) => ({ id: p.split('/').pop(), data: () => ({ ...d }) })); return { size: docs.length, docs, empty: !docs.length }; },
});
const col = (c) => ({ doc: (id) => docRef(`${c}/${id || `auto${++auto}`}`), async add(v) { const r = docRef(`${c}/auto${++auto}`); await r.set(v); return r; }, where: (k, op, v) => colQuery(c, [[k, v]]), get: () => colQuery(c, []).get() });
const fakeDb = {
  doc: docRef, collection: col,
  async runTransaction(fn) { const ops = []; const tx = { get: (r) => r.get(), set: (r, v, o) => ops.push(() => r.set(v, o)), update: (r, v) => ops.push(() => r.update(v)) }; const out = await fn(tx); for (const o of ops) await o(); return out; },
};
const W = require('./index');
W.internal.setDeps({ db: () => fakeDb, serverTime: () => ({ __server: true }), del: () => ({ __del: true }) });
const { onBookingCreated, onBookingUpdated, adminAdjust, createTopup, creditTopupInTx, bankCreate, bankUpdate, bankDecide, codeCreate, codeCancel, codeRedeem, cashbackFor, firstRide, onCustomerCreated, welcomeAll, welcomeSeen } = W.internal;
const ADMIN = { uid: 'a', token: { email: 'admin@villecabs.com' } };
const ME = { uid: 'c1', token: { email: 'c1@x.jm' } };
const bal = () => ((store.get('wallets/c1') || {}).balance) || 0;
const txs = () => [...store].filter(([p]) => p.startsWith('wallet_tx/')).map(([, d]) => d);
const noFirst = () => store.set('wallets/c1', { ...(store.get('wallets/c1') || { balance: 0 }), firstRide: { status: 'earlier' } });
function seed(coins) { store.clear(); auto = 0; store.set('customers/c1', { name: 'Kim' }); if (coins != null) store.set('wallets/c1', { balance: coins }); }
async function book(id, over = {}) {
  const b = { customerId: 'c1', status: 'searching', fare: 1200, paymentMethod: 'Cash', walletCoins: 1200, ...over };
  store.set(`bookings/${id}`, b);
  await onBookingCreated(id, b);
  return store.get(`bookings/${id}`);
}
async function move(id, status) {
  const before = store.get(`bookings/${id}`); const after = { ...before, status };
  store.set(`bookings/${id}`, after); return onBookingUpdated(id, before, after);
}

test('admin adds coins with a reason; customer is notified', async () => {
  seed();
  await assert.rejects(adminAdjust(ADMIN, { uid: 'c1', coins: 2000 }), /short reason/);
  await assert.rejects(adminAdjust(ME, { uid: 'c1', coins: 2000, reason: 'x' }), /Admins only/);
  const r = await adminAdjust(ADMIN, { uid: 'c1', coins: 2000, reason: 'Paid cash at office' });
  assert.equal(r.balance, 2000);
  assert.equal(txs()[0].type, 'admin_credit');
  assert.ok([...store].some(([p, d]) => p.startsWith('notifications/') && /2,000 VilleCoins/.test(d.message)));
  await assert.rejects(adminAdjust(ADMIN, { uid: 'c1', coins: -5000, reason: 'mistake' }), /Not enough VilleCoins/);
  assert.equal((await adminAdjust(ADMIN, { uid: 'c1', coins: -500, reason: 'mistake' })).balance, 1500);
});

test('coins cover the whole ride', async () => {
  seed(2000);
  const b = await book('B1');
  assert.deepEqual(b.wallet, { applied: 1200, status: 'held', cashDue: 0 });
  assert.equal(bal(), 800);
  assert.equal(await move('B1', 'completed'), 'paid');
  assert.equal(store.get('bookings/B1').wallet.status, 'paid');
  assert.equal(bal(), 874);   // 800 left + 24 (2% back on J$1,200) + 50 (first ride)
});

test('short balance: coins first, cash for the rest', async () => {
  seed(500);
  const b = await book('B1');
  assert.deepEqual(b.wallet, { applied: 500, status: 'held', cashDue: 700 });
  assert.equal(bal(), 0);
});

test('ride cancelled or no driver: coins go back, once', async () => {
  seed(2000);
  await book('B1');
  assert.equal(await move('B1', 'cancelled'), 'refunded');
  assert.equal(bal(), 2000);
  assert.equal(await move('B1', 'expired'), null);
  assert.equal(bal(), 2000);
  await book('B2'); assert.equal(await move('B2', 'no_driver'), 'refunded'); assert.equal(bal(), 2000);
  assert.deepEqual(txs().map((t) => t.type), ['ride_payment', 'ride_refund', 'ride_payment', 'ride_refund']);
});

test('no coins, card rides, and faked wallet fields are ignored', async () => {
  seed(0);
  assert.equal((await book('B1')).wallet.status, 'not_used');
  seed(2000);
  assert.equal((await book('B2', { paymentMethod: 'Card', payment: { method: 'card' } })).wallet.reason, 'card');
  assert.equal(bal(), 2000);
  const fake = { customerId: 'c1', status: 'searching', fare: 1200, wallet: { applied: 1200, status: 'held', cashDue: 0 } };
  store.set('bookings/B3', fake); await onBookingCreated('B3', fake);
  assert.equal(store.get('bookings/B3').wallet, undefined);
  assert.equal((await book('B4', { walletCoins: 99999 })).wallet.applied, 1200);
});

test('card top-up: limits, card switch, and crediting', async () => {
  seed();
  const yes = async () => true; const no = async () => false;
  await assert.rejects(createTopup(ME, { coins: 100 }, yes), /between 500/);
  await assert.rejects(createTopup(ME, { coins: 1000 }, no), /aren’t available yet/);
  const r = await createTopup(ME, { coins: 1000 }, yes);
  const t = store.get(`wallet_topups/${r.id}`);
  assert.deepEqual([t.amountCents, t.status, t.payment.method], [100000, 'awaiting_payment', 'card']);
  await fakeDb.runTransaction(async (tx) => { const ws = await tx.get(docRef('wallets/c1')); creditTopupInTx(tx, ws, r.id, t); });
  assert.equal(bal(), 1000);
  assert.equal(txs()[0].type, 'topup_card');
});

test('bank transfer: request, receipt, approve credits once', async () => {
  seed();
  await assert.rejects(bankCreate(ME, { coins: 2000 }), /aren’t set up yet/);
  store.set('config/wallet', { bankName: 'Test Bank', accountNumber: '000111' });
  await assert.rejects(bankCreate(null, { coins: 2000 }), /sign in/);
  await assert.rejects(bankCreate(ME, { coins: 100 }), /between 500/);
  await assert.rejects(bankCreate(ME, { coins: 2000, receiptPath: 'wallet_receipts/other/x.jpg' }), /receipt photo/);
  const r = await bankCreate(ME, { coins: 2000 });
  assert.match(r.code, /^VC-[A-HJ-NP-Z2-9]{6}$/);
  const req = () => store.get(`wallet_bank_requests/${r.id}`);
  assert.deepEqual([req().status, req().coins, req().customerName, req().receiptPath], ['pending', 2000, 'Kim', null]);
  assert.equal(bal(), 0);                                   // nothing credited until admin approves
  // Receipt: only the owner, only into their own folder
  await assert.rejects(bankUpdate({ uid: 'c2', token: {} }, { id: r.id, receiptPath: 'wallet_receipts/c2/a.jpg' }), /not found/i);
  await assert.rejects(bankUpdate(ME, { id: r.id, receiptPath: 'wallet_receipts/c2/a.jpg' }), /receipt photo/);
  await bankUpdate(ME, { id: r.id, receiptPath: 'wallet_receipts/c1/a.jpg' });
  assert.equal(req().receiptPath, 'wallet_receipts/c1/a.jpg');
  // Only admin decides
  await assert.rejects(bankDecide(ME, { id: r.id, approve: true }), /Admins only/);
  const d = await bankDecide(ADMIN, { id: r.id, approve: true });
  assert.deepEqual([d.status, d.balance, bal(), req().status, req().creditedCoins], ['approved', 2000, 2000, 'approved', 2000]);
  assert.equal(txs()[0].type, 'topup_bank');
  assert.ok([...store].some(([p, x]) => p.startsWith('notifications/') && /2,000 VilleCoins were added/.test(x.message)));
  await assert.rejects(bankDecide(ADMIN, { id: r.id, approve: true }), /already been checked/);
  await assert.rejects(bankUpdate(ME, { id: r.id, cancel: true }), /already been checked/);
  assert.equal(bal(), 2000);
});

test('bank transfer: reject needs a reason, admin can credit what arrived, limits, cancel', async () => {
  seed();
  store.set('config/wallet', { accountNumber: '000111' });
  const a = await bankCreate(ME, { coins: 5000 });
  await assert.rejects(bankDecide(ADMIN, { id: a.id, approve: false }), /short reason/);
  await bankDecide(ADMIN, { id: a.id, approve: false, note: 'No transfer received' });
  assert.equal(store.get(`wallet_bank_requests/${a.id}`).status, 'rejected');
  assert.equal(bal(), 0);
  assert.ok([...store].some(([p, x]) => p.startsWith('notifications/') && /No transfer received/.test(x.message)));
  const b = await bankCreate(ME, { coins: 5000 });
  assert.equal((await bankDecide(ADMIN, { id: b.id, approve: true, coins: 4500, note: 'J$4,500 arrived' })).balance, 4500);
  const c = await bankCreate(ME, { coins: 500 });
  await bankUpdate(ME, { id: c.id, cancel: true });
  assert.equal(store.get(`wallet_bank_requests/${c.id}`).status, 'cancelled');
  await assert.rejects(bankDecide(ADMIN, { id: c.id, approve: true }), /already been checked/);
  await bankCreate(ME, { coins: 500 }); await bankCreate(ME, { coins: 500 }); await bankCreate(ME, { coins: 500 });
  await assert.rejects(bankCreate(ME, { coins: 500 }), /waiting to be checked/);
  assert.equal(bal(), 4500);
});

test('redeem code: admin makes codes; each works once for one person', async () => {
  seed();
  await assert.rejects(codeCreate(ME, { coins: 1000 }), /Admins only/);
  await assert.rejects(codeCreate(ADMIN, { coins: 0 }), /worth 1 to/);
  await assert.rejects(codeCreate(ADMIN, { coins: 1000, count: 51 }), /1 to 50 codes/);
  const { codes } = await codeCreate(ADMIN, { coins: 1000, count: 3, note: 'Office sale' });
  assert.equal(codes.length, 3); assert.equal(new Set(codes).size, 3);
  assert.match(codes[0], /^VC-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  // Typed loosely (lower case, no dashes, spaces) still works
  const r = await codeRedeem(ME, { code: ` ${codes[0].toLowerCase().replace(/-/g, ' ')} ` });
  assert.deepEqual([r.coins, r.balance, bal()], [1000, 1000, 1000]);
  assert.equal(txs()[0].type, 'code_redeem');
  assert.deepEqual([store.get(`wallet_codes/${codes[0]}`).status, store.get(`wallet_codes/${codes[0]}`).redeemedBy], ['redeemed', 'c1']);
  await assert.rejects(codeRedeem(ME, { code: codes[0] }), /already used this code/);
  await assert.rejects(codeRedeem({ uid: 'c2', token: {} }, { code: codes[0] }), /already been used/);
  assert.equal(bal(), 1000);
  // Cancelled codes don't work; used codes can't be cancelled
  await codeCancel(ADMIN, { code: codes[1] });
  await assert.rejects(codeRedeem(ME, { code: codes[1] }), /no longer valid/);
  await assert.rejects(codeCancel(ADMIN, { code: codes[0] }), /already been used or cancelled/);
  await assert.rejects(codeCancel(ME, { code: codes[2] }), /Admins only/);
  assert.equal((await codeRedeem(ME, { code: codes[2] })).balance, 2000);
});

test('redeem code: wrong guesses are limited per hour', async () => {
  seed();
  const { codes } = await codeCreate(ADMIN, { coins: 500 });
  const t0 = 1_800_000_000_000;
  for (let i = 0; i < 8; i += 1) await assert.rejects(codeRedeem(ME, { code: 'VC-AAAA-AAA' + (i % 2 ? 'B' : 'C') }, t0 + i), /isn’t right/);
  await assert.rejects(codeRedeem(ME, { code: codes[0] }, t0 + 100), /Too many wrong codes/);   // even a real code waits
  assert.equal(bal(), 0);
  await assert.rejects(codeRedeem(null, { code: codes[0] }), /sign in/);
  assert.equal((await codeRedeem(ME, { code: codes[0] }, t0 + 61 * 60 * 1000)).balance, 500);   // after an hour
});

test('2% back: completed rides earn coins once; cancelling takes them back', async () => {
  seed(0); noFirst();
  assert.deepEqual([cashbackFor(1200), cashbackFor(999), cashbackFor(40), cashbackFor(10000000), cashbackFor('x')], [24, 19, 0, 1000, 0]);
  await book('B1', { walletCoins: 0 });
  assert.equal(await move('B1', 'active'), null);
  assert.equal(bal(), 0);                                  // nothing until the ride is completed
  assert.equal(await move('B1', 'completed'), 'cashback');
  assert.equal(bal(), 24);
  const cb = store.get('bookings/B1').cashback; assert.deepEqual([cb.coins, cb.pct, cb.status], [24, 2, 'credited']);
  assert.ok([...store].some(([p, x]) => p.startsWith('notifications/') && /earned 24 VilleCoins \(2% back\)/.test(x.message)));
  // A repeat "completed" write doesn't pay twice
  const b = store.get('bookings/B1'); assert.equal(await onBookingUpdated('B1', { ...b, status: 'arrived' }, b), null);
  assert.equal(bal(), 24);
  // Admin changes it to cancelled: coins removed
  assert.equal(await move('B1', 'cancelled'), 'cashback_reversed');
  assert.equal(bal(), 0);
  assert.equal(store.get('bookings/B1').cashback.status, 'reversed');
  assert.deepEqual(txs().map((t) => t.type), ['ride_cashback', 'ride_cashback_reversed']);
  assert.ok([...store].some(([p, x]) => p.startsWith('notifications/') && /reward was removed/.test(x.message)));
  // Cancelled again later: nothing more taken
  assert.equal(await move('B1', 'expired'), null);
  assert.equal(bal(), 0);
});

test('2% back: rides that never completed earn nothing; spent coins are taken only as far as the balance goes', async () => {
  seed(0); noFirst();
  await book('B1', { walletCoins: 0 }); assert.equal(await move('B1', 'cancelled'), null);
  await book('B2', { walletCoins: 0, fare: 40 }); assert.equal(await move('B2', 'completed'), null);   // under 1 coin
  assert.equal(bal(), 0);
  await book('B3', { walletCoins: 0, fare: 5000 }); await move('B3', 'completed');
  assert.equal(bal(), 100);
  // Customer spends 70 of them on another ride, then admin cancels B3
  await book('B4', { fare: 70, walletCoins: 70 }); assert.equal(bal(), 30);
  await move('B3', 'cancelled');
  assert.equal(bal(), 0);
  assert.deepEqual([store.get('bookings/B3').cashback.reversedCoins, store.get('bookings/B3').cashback.shortBy], [30, 70]);
  // Card-paid completed rides earn too
  seed(0); noFirst(); await book('C1', { paymentMethod: 'Card', payment: { method: 'card' }, fare: 2500 }); await move('C1', 'completed');
  assert.equal(bal(), 50);
});

test('first completed ride: 50 coins once; cancelled gives it back to the next ride', async () => {
  seed(0);
  await book('B1', { walletCoins: 0, fare: 1000 });
  await move('B1', 'completed');
  assert.equal(bal(), 70);                                   // 20 (2%) + 50
  assert.equal(store.get('wallets/c1').firstRide.bookingId, 'B1');
  assert.ok([...store].some(([p, x]) => p.startsWith('notifications/') && /first ride! 50 VilleCoins/.test(x.message)));
  await book('B2', { walletCoins: 0, fare: 1000 }); await move('B2', 'completed');
  assert.equal(bal(), 90);                                   // second ride: only 2%
  // Admin cancels the first ride: 20 + 50 come off, and the next ride can earn the 50
  await move('B1', 'cancelled');
  assert.equal(bal(), 20);
  assert.equal(store.get('wallets/c1').firstRide, undefined);
  assert.equal(store.get('bookings/B1').firstRideBonus.status, 'reversed');
  // B2 is already completed, so a new ride B3 is the next "first" — but B2 already
  // counts as a completed ride, so no second bonus.
  await book('B3', { walletCoins: 0, fare: 1000 }); await move('B3', 'completed');
  assert.equal(bal(), 40);
  assert.deepEqual(store.get('wallets/c1').firstRide, { status: 'earlier' });
});

test('first ride: customers who already finished a ride before don\'t get it', async () => {
  seed(0);
  store.set('bookings/OLD', { customerId: 'c1', status: 'completed', fare: 800 });
  await book('B1', { walletCoins: 0, fare: 1000 }); await move('B1', 'completed');
  assert.equal(bal(), 20);
  assert.deepEqual(txs().map((t) => t.type), ['ride_cashback']);
});

test('welcome coins: off by default; on gives new and existing customers 200 once', async () => {
  seed(); store.set('customers/c2', { name: 'Pat' }); store.set('customers/c3', { name: 'Lee' });
  assert.equal(await onCustomerCreated('c1'), null);       // off
  assert.equal(bal(), 0);
  await assert.rejects(welcomeAll(ADMIN), /Turn welcome coins on first/);
  store.set('config/wallet', { welcomeOn: true });           // default 200
  assert.equal(await onCustomerCreated('c1'), 'granted');
  assert.equal(bal(), 200);
  assert.deepEqual([store.get('wallets/c1').welcome.coins, store.get('wallets/c1').welcome.seen, store.get('wallets/c1').welcome.how], [200, false, 'signup']);
  assert.equal(await onCustomerCreated('c1'), 'skipped');  // never twice
  await assert.rejects(welcomeAll(ME), /Admins only/);
  const r = await welcomeAll(ADMIN);
  assert.deepEqual([r.given, r.had, r.coins], [2, 1, 200]);
  assert.equal(store.get('wallets/c2').balance, 200);
  assert.equal(store.get('wallets/c3').welcome.how, 'existing');
  assert.deepEqual((await welcomeAll(ADMIN)).given, 0);   // running it again gives nothing
  assert.equal(bal(), 200);
  // Pop-up seen
  await assert.rejects(welcomeSeen(null), /sign in/);
  await welcomeSeen(ME);
  assert.equal(store.get('wallets/c1').welcome.seen, true);
  assert.equal(store.get('wallets/c1').balance, 200);
  // Turned off: new customers get nothing; custom amount respected when on
  store.set('config/wallet', { welcomeOn: false }); store.set('customers/c4', {});
  assert.equal(await onCustomerCreated('c4'), null);
  store.set('config/wallet', { welcomeOn: true, welcomeCoins: 300 });
  assert.equal(await onCustomerCreated('c4'), 'granted');
  assert.equal(store.get('wallets/c4').balance, 300);
});
