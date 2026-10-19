// Creator program: code checks, one use per customer, pay on completed rides only.
// Run: cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic');

// ── Minimal in-memory Firestore ──────────────────────────────────────────────
const store = new Map();
let auto = 0;
const isTs = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function';
const TS = (ms) => ({ __ms: ms, toMillis() { return this.__ms; } });
function resolve(v, prev) {
  if (v && v.__server) return TS(Date.now());
  if (v && v.__inc !== undefined) return (prev || 0) + v.__inc;
  if (v && v.__del) return undefined;
  if (v && typeof v === 'object' && !Array.isArray(v) && !isTs(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { const r = resolve(x, prev && prev[k]); if (r !== undefined) o[k] = r; } return o; }
  return v;
}
const docRef = (path) => ({
  path, id: path.split('/').pop(),
  async get() { const d = store.get(path); return { exists: !!d, id: path.split('/').pop(), data: () => d && { ...d }, get: (k) => d && d[k], ref: docRef(path) }; },
  async set(v) { store.set(path, resolve(v)); },
  async update(v) { const prev = store.get(path); if (!prev) throw new Error(`no doc ${path}`); const n = { ...prev }; for (const [k, x] of Object.entries(v)) { const r = resolve(x, prev[k]); if (r === undefined) delete n[k]; else n[k] = r; } store.set(path, n); },
});
function query(col, filters = [], lim = Infinity) {
  return {
    where(f, op, v) { return query(col, [...filters, [f, op, v]], lim); },
    limit(n) { return query(col, filters, n); },
    doc(id) { return docRef(`${col}/${id || `auto${++auto}`}`); },
    async get() {
      const docs = [];
      for (const [p, d] of store) {
        if (!p.startsWith(`${col}/`) || p.slice(col.length + 1).includes('/')) continue;
        if (filters.every(([f, , v]) => d[f] === v)) docs.push({ id: p.split('/').pop(), data: () => ({ ...d }), get: (k) => d[k] });
      }
      const out = docs.slice(0, lim);
      return { docs: out, size: out.length, empty: !out.length };
    },
  };
}
const fakeDb = {
  doc: docRef,
  collection: (c) => query(c),
  batch() { const ops = []; return { update: (r, v) => ops.push(() => r.update(v)), async commit() { for (const o of ops) await o(); } }; },
  async runTransaction(fn) { const ops = []; const tx = { get: (r) => r.get(), set: (r, v) => ops.push(() => r.set(v)), update: (r, v) => ops.push(() => r.update(v)) }; const out = await fn(tx); for (const o of ops) await o(); return out; },
};
const C = require('./index');
let tok = 0;
C.internal.setDeps({ db: () => fakeDb, inc: (n) => ({ __inc: n }), serverTime: () => ({ __server: true }), del: () => ({ __del: true }), token: () => `tok_${++tok}_abcdefghijklmnop` });
const { checkCode, onBookingCreated, onBookingUpdated, saveCreator, recordPayout, statsFor, rotateLink } = C.internal;

const ADMIN = { uid: 'a', token: { email: 'admin@villecabs.com' } };
const USER = { uid: 'u1', token: { email: 'rider@x.jm' } };
let creatorId;
async function seed(extra = {}) {
  store.clear(); auto = 0;
  store.set('promo_codes/p1', { code: 'LAUNCH10', discount: 10, active: true });
  const r = await saveCreator(ADMIN, { name: 'Shanice Vlogs', handle: '@shanicevlogs', code: 'shanice', discountType: 'percent', discount: 10, payoutJmd: 200, ...extra });
  creatorId = r.id;
}
// A booking as the app writes it: J$1,000 ride, 10% off with the creator code.
async function book(id, uid = 'u1', over = {}) {
  const b = { customerId: uid, status: 'searching', originalFare: 1000, fare: 900, promoCode: 'SHANICE', creatorCode: 'SHANICE', ...over };
  store.set(`bookings/${id}`, b);
  await onBookingCreated(id, b);
  return store.get(`bookings/${id}`);
}
async function move(id, status) {
  const before = store.get(`bookings/${id}`);
  const after = { ...before, status };
  store.set(`bookings/${id}`, after);
  return onBookingUpdated(id, before, after);
}
const creator = () => store.get(`creators/${creatorId}`);

test('discount maths: percent and fixed, never more than the fare', () => {
  assert.equal(L.discountFor(1000, 'percent', 10), 100);
  assert.equal(L.discountFor(1000, 'fixed', 300), 300);
  assert.equal(L.discountFor(200, 'fixed', 300), 200);
});

test('admin creates a creator: code is private, unique and stored upper-case', async () => {
  await seed();
  assert.equal(creator().code, 'SHANICE');
  assert.equal(store.get('creator_codes/SHANICE').creatorId, creatorId);
  assert.ok(creator().statsToken.length >= 16);
  await assert.rejects(saveCreator(ADMIN, { name: 'B', code: 'SHANICE', discount: 5, payoutJmd: 100 }), /already has that code/);
  await assert.rejects(saveCreator(ADMIN, { name: 'B', code: 'launch10', discount: 5, payoutJmd: 100 }), /public promo code/);
  await assert.rejects(saveCreator(USER, { name: 'B', code: 'NEWONE', discount: 5, payoutJmd: 100 }), /Admins only/);
  await assert.rejects(saveCreator(ADMIN, { name: 'B', code: 'X', discount: 5, payoutJmd: 100 }), /3–20/);
});

test('rider check: valid code returns the discount; unknown code gives no hint', async () => {
  await seed();
  const ok = await checkCode('u1', ' shanice ');
  assert.deepEqual([ok.ok, ok.code, ok.discount, ok.label], [true, 'SHANICE', 10, '10% off']);
  assert.equal((await checkCode('u1', 'NOPE123')).message, 'Invalid promo code.');
});

test('booked ride locks the one use; completed ride pays the creator once', async () => {
  await seed();
  const b = await book('B1');
  assert.equal(b.creator.status, 'pending');
  assert.equal(b.discountCoveredBy, 'villecabs');
  assert.equal(b.creator.discountJmd, 100);
  assert.equal(creator().booked, 1);
  assert.equal((await checkCode('u1', 'SHANICE')).message, 'You have already used this promo code.');
  assert.equal(await move('B1', 'accepted'), null);
  assert.equal(await move('B1', 'completed'), 'earned');
  const use = store.get('creator_uses/B1');
  assert.deepEqual([use.payoutJmd, use.discountJmd, use.paid], [200, 100, false]);
  assert.equal(creator().completed, 1);
  assert.equal(creator().earnedJmd, 200);
  assert.equal(store.get('bookings/B1').creator.status, 'earned');
  // A repeated completion event never pays twice.
  const again = { ...store.get('bookings/B1'), creator: { ...store.get('bookings/B1').creator, status: 'pending' } };
  assert.equal(await onBookingUpdated('B1', { ...again, status: 'arrived' }, again), 'skipped');
  assert.equal(creator().earnedJmd, 200);
});

test('second booking by the same customer is not counted', async () => {
  await seed();
  await book('B1');
  const b2 = await book('B2');
  assert.equal(b2.creator.status, 'rejected');
  assert.equal(b2.creator.reason, 'already_used');
  assert.equal(b2.discountCoveredBy, undefined);
  assert.equal(creator().booked, 1);
});

test('cancelled ride earns nothing and frees the customer to use the code again', async () => {
  await seed();
  await book('B1');
  assert.equal(await move('B1', 'cancelled'), 'released');
  assert.equal(creator().released, 1);
  assert.equal(creator().earnedJmd, 0);
  assert.equal(store.get('creator_uses/B1'), undefined);
  assert.equal((await checkCode('u1', 'SHANICE')).ok, true);
  const b2 = await book('B2');
  assert.equal(b2.creator.status, 'pending');
});

test('tampered fare or inactive creator is rejected; client cannot fake creator fields', async () => {
  await seed();
  assert.equal((await book('B1', 'u1', { fare: 500 })).creator.reason, 'fare_mismatch');
  store.set(`creators/${creatorId}`, { ...creator(), active: false });
  assert.equal((await book('B2', 'u2')).creator.reason, 'inactive');
  assert.equal((await checkCode('u3', 'SHANICE')).ok, false);
  const fake = { customerId: 'u4', status: 'searching', fare: 900, originalFare: 1000, discountCoveredBy: 'villecabs', creator: { status: 'pending' } };
  store.set('bookings/B3', fake);
  await onBookingCreated('B3', fake);
  assert.equal(store.get('bookings/B3').creator, undefined);
  assert.equal(store.get('bookings/B3').discountCoveredBy, undefined);
});

test('fixed J$ discount codes work end to end', async () => {
  await seed({ discountType: 'fixed', discount: 300 });
  const b = await book('B1', 'u1', { fare: 700 });
  assert.equal(b.creator.status, 'pending');
  assert.equal(b.creator.discountJmd, 300);
});

test('payout marks owed rides paid; private stats show counts, never customers', async () => {
  await seed();
  await book('B1', 'u1'); await move('B1', 'completed');
  await book('B2', 'u2'); await move('B2', 'completed');
  await book('B3', 'u3'); // still in progress
  await book('B4', 'u4'); await move('B4', 'no_driver');
  const p = await recordPayout(ADMIN, { creatorId, method: 'Bank transfer' });
  assert.deepEqual([p.amountJmd, p.rides], [400, 2]);
  assert.ok(store.get('creator_uses/B1').paid && store.get('creator_uses/B2').paid);
  await assert.rejects(recordPayout(ADMIN, { creatorId }), /Nothing owed/);
  await book('B5', 'u5'); await move('B5', 'completed');
  const s = await statsFor(creator().statsToken);
  assert.deepEqual([s.booked, s.completed, s.inProgress, s.released], [5, 3, 1, 1]);
  assert.deepEqual([s.earnedJmd, s.paidJmd, s.balanceJmd], [600, 400, 200]);
  assert.equal(s.recent.length, 3);
  assert.ok(!JSON.stringify(s).includes('u1'));
  await assert.rejects(statsFor('bogus-token-0000000000'), /isn’t valid/);
  const old = creator().statsToken;
  await rotateLink(ADMIN, creatorId);
  await assert.rejects(statsFor(old), /isn’t valid/);
});
