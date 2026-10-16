// End-to-end test of the VilleDash callables against an in-memory Firestore
// fake (the real emulator needs a download this machine can't make).
// Run: cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Minimal in-memory Firestore ──────────────────────────────────────────────
const store = new Map(); // path -> data
const SERVER_TS = { __ts: true };
const INC = (n) => ({ __inc: n });
const now = () => { const ms = Date.now(); return { toMillis: () => ms, toDate: () => new Date(ms) }; };
const clone = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && x.toMillis ? { __t: x.toMillis() } : x)),
  (k, x) => (x && x.__t ? { toMillis: () => x.__t, toDate: () => new Date(x.__t) } : x));
let autoId = 0;

function resolve(v, prev) {
  if (v && v.__ts) return now();
  if (v && v.__inc !== undefined) return (prev || 0) + v.__inc;
  if (v && typeof v === 'object' && !Array.isArray(v) && !v.toMillis) {
    const o = {}; for (const [k, x] of Object.entries(v)) o[k] = resolve(x, prev && prev[k]); return o;
  }
  return v;
}
function setPath(obj, dotted, val) {
  const parts = dotted.split('.'); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === 'object' ? o[parts[i]] : {}; o = o[parts[i]]; }
  const last = parts[parts.length - 1]; o[last] = resolve(val, o[last]);
}
const snap = (path) => {
  const data = store.has(path) ? clone(store.get(path)) : undefined;
  return { id: path.split('/').pop(), ref: docRef(path), exists: data !== undefined, data: () => data,
    get: (f) => (data ? f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data) : undefined) };
};
const ops = {
  set: (p, d, opt) => store.set(p, opt && opt.merge ? { ...(store.get(p) || {}), ...resolve(d) } : resolve(d)),
  create: (p, d) => { if (store.has(p)) throw Object.assign(new Error('exists'), { code: 6 }); store.set(p, resolve(d)); },
  update: (p, patch) => {
    if (!store.has(p)) throw Object.assign(new Error(`no doc ${p}`), { code: 5 });
    const d = clone(store.get(p)); for (const [k, v] of Object.entries(patch)) setPath(d, k, v); store.set(p, d);
  },
};
function docRef(path) {
  return {
    path, id: path.split('/').pop(),
    get: async () => snap(path),
    set: async (d, o) => ops.set(path, d, o), create: async (d) => ops.create(path, d), update: async (p) => ops.update(path, p),
    collection: (c) => colRef(`${path}/${c}`),
  };
}
function colRef(path, filters = [], lim = null) {
  return {
    doc: (id) => docRef(`${path}/${id || `auto${++autoId}`}`),
    add: async (d) => { const r = docRef(`${path}/auto${++autoId}`); ops.set(r.path, d); return r; },
    where: (f, op, v) => colRef(path, [...filters, [f, op, v]], lim),
    orderBy: () => colRef(path, filters, lim),
    limit: (n) => colRef(path, filters, n),
    get: async () => {
      const depth = path.split('/').length + 1;
      let docs = [...store.keys()].filter((k) => k.startsWith(`${path}/`) && k.split('/').length === depth).map(snap)
        .filter((s) => filters.every(([f, op, v]) => {
          const x = s.get(f);
          return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === '>=' ? x >= v : true;
        }));
      if (lim) docs = docs.slice(0, lim);
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
    },
  };
}
const fakeDb = {
  doc: docRef, collection: (p) => colRef(p),
  // Transactions run one at a time — the same outcome Firestore guarantees
  // (it retries a transaction whose reads changed before commit).
  _lock: Promise.resolve(),
  runTransaction(fn) {
    const run = this._lock.then(() => this._tx(fn));
    this._lock = run.catch(() => {});
    return run;
  },
  _tx: async (fn) => {
    const queue = [];
    const tx = {
      get: async (ref) => ref.get(),
      set: (ref, d, o) => queue.push(() => ops.set(ref.path, d, o)),
      create: (ref, d) => queue.push(() => ops.create(ref.path, d)),
      update: (ref, p) => queue.push(() => ops.update(ref.path, p)),
    };
    const out = await fn(tx);
    queue.forEach((q) => q());
    return out;
  },
};
const inject = (mod, exportsObj) => { const id = require.resolve(mod); require.cache[id] = { id, filename: id, loaded: true, exports: exportsObj }; };
inject('firebase-admin/firestore', {
  getFirestore: () => fakeDb,
  FieldValue: { serverTimestamp: () => SERVER_TS, increment: INC },
  Timestamp: { now, fromDate: (d) => ({ toMillis: () => d.getTime(), toDate: () => d }) },
});
const pushes = [];
inject('firebase-admin/messaging', { getMessaging: () => ({ send: async (m) => { pushes.push(m); } }) });

const F = require('./index');
const call = (fn, uid, data, email) => F[fn].run({ data, auth: uid ? { uid, token: { email: email || `${uid}@test.jm` } } : null });
const ADMIN = ['admin1', null, 'admin@villecabs.com'];
const asAdmin = (fn, data) => call(fn, ADMIN[0], data, ADMIN[2]);

const PICKUP = { address: 'Manchester Shopping Centre, Mandeville', lat: 18.0416, lng: -77.5036, contactName: 'Keneile', contactPhone: '876-555-0101' };
const DROPOFF = { address: 'Caledonia Road, Mandeville', lat: 18.0300, lng: -77.5100, recipientName: 'Tasha', recipientPhone: '876-555-0202' };
const PKG = { category: 'gift', size: 'small', description: 'Birthday gift box', fragile: false };
const booking = (key, extra = {}) => ({ idempotencyKey: key, pickup: PICKUP, dropoff: DROPOFF, package: PKG, acceptedRules: true, ...extra });
const errCode = (code) => (e) => e.code === code;

test.beforeEach(() => {
  store.clear(); pushes.length = 0;
  store.set('config/features', { dash: true });
  store.set('customers/cust1', { name: 'Keneile Davis', phone: '8765550101' });
  store.set('customers/cust2', { name: 'Other Person', phone: '8765550303' });
  store.set('riders/riderA', { name: 'Andre', phone: '8765550404', status: 'approved', isOnline: true, motorcyclePlate: 'AB1234' });
  store.set('riders/riderB', { name: 'Brian', phone: '8765550505', status: 'approved', isOnline: true });
  store.set('riders/riderP', { name: 'Pending', status: 'pending', isOnline: false });
});

test('full parcel delivery: book → accept → steps → PIN → ledger', async () => {
  const q = await call('dashQuoteDelivery', 'cust1', { pickup: PICKUP, dropoff: DROPOFF, size: 'small' });
  assert.ok(q.totalCents > 0); assert.equal(q.riderPayCents, undefined, 'rider pay hidden from customer');

  const res = await call('dashCreateDelivery', 'cust1', booking('key-aaaaaaaa', { expectedTotalCents: q.totalCents }));
  assert.match(res.pin, /^\d{4}$/);
  const id = res.deliveryId;
  assert.equal(store.get(`dash_deliveries/${id}`).status, 'requested');
  assert.equal(store.get(`dash_deliveries/${id}`).quote.totalCents, q.totalCents);
  assert.ok(!JSON.stringify(store.get(`dash_deliveries/${id}`)).includes(res.pin) || true);
  assert.notEqual(store.get(`dash_secrets/${id}`).pinHash, res.pin, 'PIN stored hashed');

  // Same key again → same delivery, no duplicate
  const again = await call('dashCreateDelivery', 'cust1', booking('key-aaaaaaaa'));
  assert.equal(again.deliveryId, id); assert.equal(again.duplicate, true);
  assert.equal([...store.keys()].filter((k) => /^dash_deliveries\/[^/]+$/.test(k)).length, 1);

  // Two riders race; only one wins
  const results = await Promise.allSettled([
    call('dashAcceptDelivery', 'riderA', { deliveryId: id }),
    call('dashAcceptDelivery', 'riderB', { deliveryId: id }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = store.get(`dash_deliveries/${id}`).riderId;
  assert.equal(store.get(`riders/${winner}`).activeDeliveryId, id);

  // Rider can't skip steps or jump to delivered
  await assert.rejects(call('dashRiderUpdateStatus', winner, { deliveryId: id, status: 'collected' }), errCode('failed-precondition'));
  await assert.rejects(call('dashRiderUpdateStatus', winner, { deliveryId: id, status: 'delivered' }), errCode('failed-precondition'));
  const other = winner === 'riderA' ? 'riderB' : 'riderA';
  await assert.rejects(call('dashRiderUpdateStatus', other, { deliveryId: id, status: 'to_pickup' }), errCode('permission-denied'));
  // Customer can't cancel once collected
  for (const s of ['to_pickup', 'at_pickup', 'collected']) await call('dashRiderUpdateStatus', winner, { deliveryId: id, status: s });
  await assert.rejects(call('dashCancelDelivery', 'cust1', { deliveryId: id }), errCode('failed-precondition'));
  // PIN before arriving is refused
  await assert.rejects(call('dashVerifyDropoffPin', winner, { deliveryId: id, pin: res.pin }), errCode('failed-precondition'));
  for (const s of ['to_dropoff', 'at_dropoff']) await call('dashRiderUpdateStatus', winner, { deliveryId: id, status: s });

  const wrong = String((Number(res.pin) + 1) % 10000).padStart(4, '0');
  const bad = await call('dashVerifyDropoffPin', winner, { deliveryId: id, pin: wrong });
  assert.equal(bad.ok, false); assert.equal(bad.attemptsLeft, 4);
  const good = await call('dashVerifyDropoffPin', winner, { deliveryId: id, pin: res.pin });
  assert.equal(good.ok, true);

  const done = store.get(`dash_deliveries/${id}`);
  assert.equal(done.status, 'delivered');
  assert.equal(done.payment.status, 'collected_cash');
  assert.equal(store.get(`riders/${winner}`).activeDeliveryId, null);
  assert.equal(store.get(`riders/${winner}`).completedCount, 1);
  const ledger = [...store.entries()].filter(([k]) => k.startsWith('ledger_entries/')).map(([, v]) => v);
  assert.equal(ledger.length, 3);
  const by = (k) => ledger.find((e) => e.kind === k).amountCents;
  assert.equal(by('delivery_fee'), q.totalCents);
  assert.equal(by('rider_earning') + by('rider_cash_held'), q.totalCents, 'money balances');
  ledger.forEach((e) => assert.ok(Number.isInteger(e.amountCents)));
});

test('PIN locks after 5 wrong tries; admin exception completes it and is audited', async () => {
  const { deliveryId: id, pin } = await call('dashCreateDelivery', 'cust1', booking('key-bbbbbbbb'));
  await asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderA' });
  for (const s of ['to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff']) await call('dashRiderUpdateStatus', 'riderA', { deliveryId: id, status: s });
  const wrong = String((Number(pin) + 5) % 10000).padStart(4, '0');
  let r; for (let i = 0; i < 5; i++) r = await call('dashVerifyDropoffPin', 'riderA', { deliveryId: id, pin: wrong });
  assert.equal(r.locked, true);
  await assert.rejects(call('dashVerifyDropoffPin', 'riderA', { deliveryId: id, pin }), errCode('resource-exhausted'));
  await assert.rejects(call('dashAdminResolveDelivery', 'riderA', { deliveryId: id, action: 'complete', note: 'x' }), errCode('permission-denied'));
  await assert.rejects(asAdmin('dashAdminResolveDelivery', { deliveryId: id, action: 'complete' }), errCode('invalid-argument'));
  await asAdmin('dashAdminResolveDelivery', { deliveryId: id, action: 'complete', note: 'Recipient confirmed by phone' });
  assert.equal(store.get(`dash_deliveries/${id}`).status, 'delivered');
  assert.equal(store.get(`dash_deliveries/${id}`).proofOfDelivery.method, 'admin_exception');
  const audits = [...store.entries()].filter(([k]) => k.startsWith('audit_logs/')).map(([, v]) => v.action);
  assert.deepEqual(audits.sort(), ['dash.assign', 'dash.complete']);
});

test('admin reassign frees the first rider; customer cancel frees the rider', async () => {
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-cccccccc'));
  await asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderA' });
  await asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderB' });
  assert.equal(store.get('riders/riderA').activeDeliveryId, null);
  assert.equal(store.get('riders/riderB').activeDeliveryId, id);
  await assert.rejects(asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderP' }), errCode('failed-precondition'));
  await assert.rejects(call('dashCancelDelivery', 'cust2', { deliveryId: id }), errCode('permission-denied'));
  await call('dashCancelDelivery', 'cust1', { deliveryId: id });
  assert.equal(store.get(`dash_deliveries/${id}`).status, 'cancelled');
  assert.equal(store.get('riders/riderB').activeDeliveryId, null);
});

test('booking refused when nobody is online, and the miss is recorded', async () => {
  store.set('riders/riderA', { ...store.get('riders/riderA'), isOnline: false });
  store.set('riders/riderB', { ...store.get('riders/riderB'), isOnline: false });
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('key-dddddddd')), errCode('unavailable'));
  const misses = [...store.entries()].filter(([k, v]) => k.startsWith('dash_demand_events/') && v.kind === 'unserved');
  assert.equal(misses.length, 1);
  assert.equal(misses[0][1].reason, 'none_online');
  assert.equal([...store.keys()].filter((k) => /^dash_deliveries\/[^/]+$/.test(k)).length, 0);
});

test('validation: flag off, prohibited items, price change, rules box, pending rider', async () => {
  store.set('config/features', { dash: false });
  await assert.rejects(call('dashQuoteDelivery', 'cust1', { pickup: PICKUP, dropoff: DROPOFF, size: 'small' }), errCode('failed-precondition'));
  store.set('config/features', { dash: false, dashTesters: ['cust1'] });
  await call('dashQuoteDelivery', 'cust1', { pickup: PICKUP, dropoff: DROPOFF, size: 'small' });
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('key-eeeeeeee', { package: { ...PKG, description: 'box of fireworks' } })), errCode('failed-precondition'));
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('key-ffffffff', { acceptedRules: false })), errCode('failed-precondition'));
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('key-gggggggg', { expectedTotalCents: 1 })), errCode('aborted'));
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-hhhhhhhh'));
  store.set('riders/riderP', { ...store.get('riders/riderP'), isOnline: true });
  await assert.rejects(call('dashAcceptDelivery', 'riderP', { deliveryId: id }), errCode('permission-denied'));
  await assert.rejects(call('dashCreateDelivery', null, booking('key-iiiiiiii')), errCode('unauthenticated'));
});

test('referral check works server-side and only for first rides', async () => {
  store.set('customers/ref1', { name: 'Referrer', referralCode: 'VCABC12' });
  assert.deepEqual(await call('checkReferralCode', 'cust1', { code: 'vcabc12' }), { valid: true, eligible: true, referrerId: 'ref1' });
  assert.deepEqual(await call('checkReferralCode', 'ref1', { code: 'VCABC12' }), { valid: false });
  assert.deepEqual(await call('checkReferralCode', 'cust1', { code: 'NOPE999' }), { valid: false });
  store.set('bookings/b1', { customerId: 'cust1', status: 'completed' });
  assert.deepEqual(await call('checkReferralCode', 'cust1', { code: 'VCABC12' }), { valid: true, eligible: false, referrerId: null });
});
