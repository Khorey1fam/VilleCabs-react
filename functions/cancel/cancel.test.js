// Ride cancellations: who pays, when, and how the fee reaches the driver.
// Run: cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic');

// ── Minimal in-memory Firestore ──────────────────────────────────────────────
const store = new Map();
let auto = 0;
let clock = Date.UTC(2026, 9, 20, 15);
const isTs = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function';
const TS = (ms) => ({ __ms: ms, toMillis() { return this.__ms; } });
function resolve(v, prev) {
  if (v && v.__server) return TS(clock);
  if (v && v.__inc !== undefined) return (prev || 0) + v.__inc;
  if (v && v.__union) return [...new Set([...(prev || []), ...v.__union])];
  if (v && typeof v === 'object' && !Array.isArray(v) && !isTs(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { const r = resolve(x, prev && prev[k]); if (r !== undefined) o[k] = r; } return o; }
  return v;
}
const docRef = (path) => ({
  path, id: path.split('/').pop(),
  async get() { const d = store.get(path); return { exists: !!d, id: path.split('/').pop(), data: () => d && { ...d }, get: (k) => d && d[k] }; },
  async set(v, o) { const prev = store.get(path); store.set(path, o && o.merge ? { ...(prev || {}), ...resolve(v, prev) } : resolve(v)); },
  async update(v) {
    const prev = store.get(path); if (!prev) throw new Error(`no doc ${path}`);
    const n = JSON.parse(JSON.stringify(prev, (k, x) => x)); Object.keys(prev).forEach((k) => { if (isTs(prev[k])) n[k] = prev[k]; });
    for (const [k, x] of Object.entries(v)) {
      const parts = k.split('.'); let o = n; parts.slice(0, -1).forEach((p) => { o[p] = o[p] || {}; o = o[p]; });
      const last = parts[parts.length - 1]; o[last] = resolve(x, o[last]);
    }
    store.set(path, n);
  },
});
function query(col, filters = []) {
  return {
    where(f, op, v) { return query(col, [...filters, [f, v]]); },
    async get() {
      const docs = [];
      for (const [p, d] of store) {
        if (!p.startsWith(`${col}/`) || p.slice(col.length + 1).includes('/')) continue;
        if (filters.every(([f, v]) => d[f] === v)) docs.push({ id: p.split('/').pop(), data: () => ({ ...d }), get: (k) => d[k] });
      }
      return { docs, size: docs.length, empty: !docs.length };
    },
    async add(v) { const id = `auto${++auto}`; await docRef(`${col}/${id}`).set(v); return docRef(`${col}/${id}`); },
  };
}
const fakeDb = {
  doc: docRef,
  collection: (c) => query(c),
  async runTransaction(fn) { const ops = []; const tx = { get: (r) => r.get(), set: (r, v, o) => ops.push(() => r.set(v, o)), update: (r, v) => ops.push(() => r.update(v)) }; const out = await fn(tx); for (const o of ops) await o(); return out; },
};
const X = require('./index');
X.internal.setDeps({ db: () => fakeDb, now: () => clock, inc: (n) => ({ __inc: n }), union: (...v) => ({ __union: v }), serverTime: () => ({ __server: true }) });
const { onBookingCreated, onBookingUpdated, driverCancel, adminFee } = X.internal;

const MIN = 60e3;
const DRIVER = { uid: 'd1', token: {} };
const ADMIN = { uid: 'a', token: { email: 'admin@villecabs.com' } };
function seed() { store.clear(); auto = 0; clock = Date.UTC(2026, 9, 20, 15); store.set('drivers/d1', { name: 'Dwayne', currentRideId: 'B1' }); }
// A ride accepted `ago` minutes ago (optionally arrived `arrived` minutes ago).
function ride(id, { ago = 5, arrived = null, status, pay } = {}) {
  const b = { customerId: 'c1', customerName: 'Kim', driverId: 'd1', driverName: 'Dwayne', fare: 1000, status: status || (arrived != null ? 'arrived' : 'active'),
    acceptedAt: TS(clock - ago * MIN), ...(arrived != null ? { arrivedAt: TS(clock - arrived * MIN) } : {}), ...(pay ? { paymentMethod: 'Card', payment: { status: 'paid' } } : {}) };
  store.set(`bookings/${id}`, b);
  return b;
}
async function customerCancels(id, reasonKey) {
  const before = store.get(`bookings/${id}`);
  const after = { ...before, status: 'cancelled', cancelledBy: 'customer', cancelReasonKey: reasonKey };
  store.set(`bookings/${id}`, after);
  return onBookingUpdated(id, before, after);
}
const owed = () => (store.get('customer_balances/c1') || {}).cancelFeeOwedJmd || 0;

test('rules: free while searching and for 2 minutes after a driver accepts', () => {
  const now = clock;
  assert.equal(L.decide({ by: 'customer', stage: 'searching', nowMs: now }).feeJmd, 0);
  assert.equal(L.decide({ by: 'customer', stage: 'active', acceptedMs: now - 1 * MIN, nowMs: now }).feeJmd, 0);
  assert.equal(L.decide({ by: 'customer', stage: 'active', acceptedMs: now - 3 * MIN, nowMs: now }).feeJmd, 300);
  assert.equal(L.decide({ by: 'customer', stage: 'scheduled', acceptedMs: now - 3 * 86400e3, nowMs: now }).feeJmd, 0);
});
test('rules: driver very late means no fee; driver-blame reasons go to review', () => {
  const now = clock;
  assert.equal(L.decide({ by: 'customer', reasonKey: 'driver_late', stage: 'active', acceptedMs: now - 16 * MIN, nowMs: now }).feeJmd, 0);
  assert.equal(L.decide({ by: 'customer', reasonKey: 'driver_late', stage: 'active', acceptedMs: now - 6 * MIN, nowMs: now }).feeJmd, 300);
  assert.equal(L.decide({ by: 'customer', reasonKey: 'driver_asked', stage: 'active', acceptedMs: now - 6 * MIN, nowMs: now }).feeStatus, 'review');
  assert.equal(L.decide({ by: 'customer', stage: 'active', acceptedMs: now - 6 * MIN, nowMs: now, cfg: { enabled: false } }).feeJmd, 0);
  assert.equal(L.decide({ by: 'customer', stage: 'active', acceptedMs: now - 6 * MIN, nowMs: now, cfg: { feeJmd: 450 } }).feeJmd, 450);
});

test('customer cancels after the free window: J$300 owed, driver share 85%', async () => {
  seed(); ride('B1', { ago: 5 });
  await customerCancels('B1', 'changed_mind');
  const fee = store.get('cancel_fees/B1');
  assert.deepEqual([fee.amountJmd, fee.driverShareJmd, fee.status, fee.collectVia, fee.driverId], [300, 255, 'owed', 'next_ride', 'd1']);
  assert.equal(owed(), 300);
  assert.equal(store.get('bookings/B1').cancelFee.amountJmd, 300);
  assert.equal(store.get('drivers/d1').currentRideId, null);
  assert.ok([...store].some(([p, d]) => p.startsWith('notifications/') && /J\$300 cancellation fee will be added/.test(d.message)));
});

test('customer cancels inside 2 minutes: no fee', async () => {
  seed(); ride('B1', { ago: 1 });
  await customerCancels('B1', 'changed_mind');
  assert.equal(store.get('cancel_fees/B1'), undefined);
  assert.equal(store.get('bookings/B1').cancelFee.why, 'free_window');
});

test('owed fee rides along on the next cash ride and is collected on completion', async () => {
  seed(); ride('B1', { ago: 5 }); await customerCancels('B1', 'changed_mind');
  const next = { customerId: 'c1', status: 'searching', fare: 800, paymentMethod: 'cash' };
  store.set('bookings/B2', next);
  assert.equal(await onBookingCreated('B2', next), 300);
  assert.deepEqual(store.get('bookings/B2').cancelFeeCollect, { amountJmd: 300, feeIds: ['B1'] });
  assert.equal(store.get('cancel_fees/B1').status, 'collecting');
  // A second booking at the same time doesn't pick up the same fee.
  store.set('bookings/B3', { ...next });
  assert.equal(await onBookingCreated('B3', next), null);
  const before = { ...store.get('bookings/B2'), status: 'enroute', driverId: 'd2' };
  const after = { ...before, status: 'completed' };
  store.set('bookings/B2', after);
  await onBookingUpdated('B2', before, after);
  assert.equal(store.get('cancel_fees/B1').status, 'collected');
  assert.equal(store.get('cancel_fees/B1').collectedByDriverId, 'd2');
  assert.equal(owed(), 0);
});

test('if the next ride is cancelled or expires, the fee goes back to owed', async () => {
  seed(); ride('B1', { ago: 5 }); await customerCancels('B1', 'changed_mind');
  const next = { customerId: 'c1', status: 'searching', fare: 800 };
  store.set('bookings/B2', next); await onBookingCreated('B2', next);
  const before = store.get('bookings/B2'); const after = { ...before, status: 'expired' };
  store.set('bookings/B2', after); await onBookingUpdated('B2', before, after);
  assert.equal(store.get('cancel_fees/B1').status, 'owed');
  assert.equal(owed(), 300);
});

test('card-paid ride: fee is kept from the refund, not added to the next ride', async () => {
  seed(); ride('B1', { ago: 5, pay: true });
  await customerCancels('B1', 'changed_mind');
  assert.equal(store.get('cancel_fees/B1').collectVia, 'card_refund');
  assert.equal(owed(), 0);
});

test('driver cancels for their own reason: ride goes back to other drivers, no fee', async () => {
  seed(); ride('B1', { ago: 6 });
  const r = await driverCancel(DRIVER, { bookingId: 'B1', reasonKey: 'vehicle' });
  assert.equal(r.outcome, 'redispatch');
  const b = store.get('bookings/B1');
  assert.deepEqual([b.status, b.driverId, b.redispatchCount], ['searching', null, 1]);
  assert.ok(b.declinedBy.includes('d1'));
  assert.ok(b.searchStartedAt);
  assert.equal(b.lastDriverCancel.reasonKey, 'vehicle');
  assert.equal(store.get('cancel_fees/B1'), undefined);
  assert.equal(store.get('drivers/d1').currentRideId, null);
  assert.ok([...store].some(([p, d]) => p.startsWith('driver_cancellations/') && d.fault === 'driver'));
});

test('no-show: only after waiting 5 minutes at the pickup, then the rider pays', async () => {
  seed(); ride('B1', { ago: 10, arrived: 2 });
  await assert.rejects(driverCancel(DRIVER, { bookingId: 'B1', reasonKey: 'rider_no_show' }), /after waiting 5 minutes/);
  clock += 4 * MIN;
  const r = await driverCancel(DRIVER, { bookingId: 'B1', reasonKey: 'rider_no_show' });
  assert.deepEqual([r.outcome, r.feeJmd], ['cancel', 300]);
  assert.equal(store.get('bookings/B1').cancelledBy, 'driver');
  assert.equal(store.get('cancel_fees/B1').status, 'owed');
  assert.equal(owed(), 300);
  // The trigger that sees this update doesn't charge twice.
  await onBookingUpdated('B1', { ...store.get('bookings/B1'), status: 'arrived' }, store.get('bookings/B1'));
  assert.equal(owed(), 300);
});

test('drivers can only cancel their own ride, before the rider is on board', async () => {
  seed(); ride('B1', { ago: 6 });
  await assert.rejects(driverCancel({ uid: 'd9', token: {} }, { bookingId: 'B1', reasonKey: 'vehicle' }), /isn’t your ride/);
  await assert.rejects(driverCancel(DRIVER, { bookingId: 'B1', reasonKey: 'nonsense' }), /Choose a reason/);
  store.set('bookings/B1', { ...store.get('bookings/B1'), status: 'enroute' });
  await assert.rejects(driverCancel(DRIVER, { bookingId: 'B1', reasonKey: 'vehicle' }), /already on board/);
});

test('safety cancel: no fee, flagged for review', async () => {
  seed(); ride('B1', { ago: 6 });
  await driverCancel(DRIVER, { bookingId: 'B1', reasonKey: 'safety', note: 'Rider was aggressive' });
  const b = store.get('bookings/B1');
  assert.deepEqual([b.status, b.needsReview, b.cancelFee.amountJmd], ['cancelled', true, 0]);
});

test('admin: review fee confirmed or waived', async () => {
  seed(); ride('B1', { ago: 6 });
  await customerCancels('B1', 'driver_asked');
  assert.equal(store.get('cancel_fees/B1').status, 'review');
  assert.equal(owed(), 0);
  await adminFee(ADMIN, { feeId: 'B1', action: 'confirm' });
  assert.equal(owed(), 300);
  await adminFee(ADMIN, { feeId: 'B1', action: 'waive' });
  assert.equal(store.get('cancel_fees/B1').status, 'waived');
  assert.equal(store.get('bookings/B1').cancelFee.status, 'waived');
  assert.equal(owed(), 0);
  await assert.rejects(adminFee(DRIVER, { feeId: 'B1', action: 'waive' }), /Admins only/);
});
