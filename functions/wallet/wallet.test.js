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
  async set(v, o) { const prev = store.get(path); store.set(path, o && o.merge ? { ...(prev || {}), ...resolve(v) } : resolve(v)); },
  async update(v) { const prev = store.get(path); if (!prev) throw new Error(`no doc ${path}`); const n = { ...prev }; for (const [k, x] of Object.entries(v)) { const r = resolve(x); if (r === undefined) delete n[k]; else n[k] = r; } store.set(path, n); },
});
const col = (c) => ({ doc: (id) => docRef(`${c}/${id || `auto${++auto}`}`), async add(v) { const r = docRef(`${c}/auto${++auto}`); await r.set(v); return r; } });
const fakeDb = {
  doc: docRef, collection: col,
  async runTransaction(fn) { const ops = []; const tx = { get: (r) => r.get(), set: (r, v, o) => ops.push(() => r.set(v, o)), update: (r, v) => ops.push(() => r.update(v)) }; const out = await fn(tx); for (const o of ops) await o(); return out; },
};
const W = require('./index');
W.internal.setDeps({ db: () => fakeDb, serverTime: () => ({ __server: true }), del: () => ({ __del: true }) });
const { onBookingCreated, onBookingUpdated, adminAdjust, createTopup, creditTopupInTx } = W.internal;
const ADMIN = { uid: 'a', token: { email: 'admin@villecabs.com' } };
const ME = { uid: 'c1', token: { email: 'c1@x.jm' } };
const bal = () => ((store.get('wallets/c1') || {}).balance) || 0;
const txs = () => [...store].filter(([p]) => p.startsWith('wallet_tx/')).map(([, d]) => d);
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
  assert.equal(bal(), 800);
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
