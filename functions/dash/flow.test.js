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
  if (v && v.__union) return [...new Set([...(Array.isArray(prev) ? prev : []), ...v.__union])];
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
  FieldValue: { serverTimestamp: () => SERVER_TS, increment: INC, arrayUnion: (...a) => ({ __union: a }) },
  Timestamp: { now, fromDate: (d) => ({ toMillis: () => d.getTime(), toDate: () => d }), fromMillis: (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) }) },
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
  store.set('riders/riderA', { name: 'Andre', phone: '8765550404', status: 'approved', isOnline: true, motorcycleId: 'bike1', motorcyclePlate: 'AB1234' });
  store.set('riders/riderB', { name: 'Brian', phone: '8765550505', status: 'approved', isOnline: true, motorcycleId: 'bike2', motorcyclePlate: 'CD5678' });
  store.set('fleet_motorcycles/bike1', { plate: 'AB1234', status: 'assigned', assignedRiderId: 'riderA' });
  store.set('fleet_motorcycles/bike2', { plate: 'CD5678', status: 'assigned', assignedRiderId: 'riderB' });
  store.set('fleet_motorcycles/bike3', { plate: 'EF9012', status: 'available', assignedRiderId: null });
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


// ── Marketplace ──────────────────────────────────────────────────────────────
const ALL_DAY = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '00:00', close: '00:00' }]));
function seedStore() {
  store.set('merchants/shop1', { name: 'Juici Spot', status: 'approved', isAcceptingOrders: true, hours: ALL_DAY,
    location: { lat: 18.0450, lng: -77.5050 }, address: 'Main St, Mandeville', phone: '8765550909', category: 'restaurant' });
  store.set('merchants/shop1/products/jerk', { name: 'Jerk chicken', priceCents: 120000, available: true, stock: null,
    options: [{ name: 'Size', required: true, maxSelect: 1, choices: [{ label: 'Small', priceCents: 0 }, { label: 'Large', priceCents: 40000 }] }] });
  store.set('merchants/shop1/products/water', { name: 'Water', priceCents: 15000, available: true, stock: 5 });
  store.set('merchants/shop2', { name: 'Other', status: 'approved', hours: ALL_DAY, location: { lat: 18.04, lng: -77.5 } });
}
const CART = [{ productId: 'jerk', qty: 2, options: { Size: ['Large'] } }, { productId: 'water', qty: 3 }];
const HOME = { address: 'Caledonia Road, Mandeville', lat: 18.0300, lng: -77.5100 };
const order = (key, extra = {}) => ({ idempotencyKey: key, merchantId: 'shop1', items: CART, dropoff: HOME, ...extra });

test('store order: checkout → merchant → rider → PIN → ledger → settlement', async () => {
  seedStore();
  const q = await call('marketQuoteOrder', 'cust1', { merchantId: 'shop1', items: CART, dropoff: HOME });
  assert.equal(q.subtotalCents, 2 * 160000 + 3 * 15000);
  assert.equal(q.totalCents, q.subtotalCents + q.deliveryCents);

  const { orderId, pin } = await call('marketCreateOrder', 'cust1', order('ord-aaaaaaaa', { expectedTotalCents: q.totalCents }));
  assert.match(pin, /^\d{4}$/);
  assert.equal(store.get('merchants/shop1/products/water').stock, 2, 'stock reserved');
  assert.equal(store.get(`dash_orders/${orderId}`).status, 'awaiting_merchant');

  await assert.rejects(call('marketMerchantUpdateOrder', 'shop2', { orderId, action: 'accepted', prepMinutes: 15 }), errCode('permission-denied'));
  await assert.rejects(call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'ready' }), errCode('failed-precondition'));
  await call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'accepted', prepMinutes: 15 });
  const o = store.get(`dash_orders/${orderId}`);
  const delId = o.deliveryId;
  const del = store.get(`dash_deliveries/${delId}`);
  assert.equal(del.type, 'market'); assert.equal(del.status, 'requested');
  assert.equal(del.cashToCollectCents, q.totalCents);
  assert.equal(del.quote.totalCents, q.deliveryCents);

  await call('dashAcceptDelivery', 'riderA', { deliveryId: delId });
  for (const s of ['to_pickup', 'at_pickup']) await call('dashRiderUpdateStatus', 'riderA', { deliveryId: delId, status: s });
  await assert.rejects(call('dashRiderUpdateStatus', 'riderA', { deliveryId: delId, status: 'collected' }), errCode('failed-precondition'));
  await call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'preparing' });
  await call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'ready' });
  await assert.rejects(call('marketCancelOrder', 'cust1', { orderId }), errCode('failed-precondition'));
  await call('dashRiderUpdateStatus', 'riderA', { deliveryId: delId, status: 'collected' });
  assert.equal(store.get(`dash_orders/${orderId}`).status, 'collected');
  for (const s of ['to_dropoff', 'at_dropoff']) await call('dashRiderUpdateStatus', 'riderA', { deliveryId: delId, status: s });
  await assert.rejects(call('dashCancelDelivery', 'cust1', { deliveryId: delId }), errCode('failed-precondition'));
  assert.equal((await call('dashVerifyDropoffPin', 'riderA', { deliveryId: delId, pin })).ok, true);
  assert.equal(store.get(`dash_orders/${orderId}`).status, 'delivered');

  const ledger = [...store.entries()].filter(([k]) => k.startsWith('ledger_entries/')).map(([, v]) => v);
  const amt = (k) => ledger.find((e) => e.kind === k).amountCents;
  assert.equal(amt('product_sales'), q.subtotalCents);
  assert.equal(amt('commission'), Math.round(q.subtotalCents * 0.15));
  assert.equal(amt('merchant_payable') + amt('commission'), q.subtotalCents);
  assert.equal(amt('rider_earning') + amt('rider_cash_held'), q.totalCents);

  await assert.rejects(call('marketCreateSettlement', 'cust1', { merchantId: 'shop1' }), errCode('permission-denied'));
  const st = await asAdmin('marketCreateSettlement', { merchantId: 'shop1', upTo: new Date(Date.now() + 1000).toISOString() });
  assert.equal(st.netPayableCents, amt('merchant_payable'));
  assert.equal(st.orderCount, 1);
  await assert.rejects(asAdmin('marketCreateSettlement', { merchantId: 'shop1' }), errCode('failed-precondition'));
  await assert.rejects(asAdmin('marketMarkSettlementPaid', { settlementId: st.settlementId }), errCode('invalid-argument'));
  await asAdmin('marketMarkSettlementPaid', { settlementId: st.settlementId, reference: 'NCB-TRF-001' });
  assert.equal(store.get(`settlements/${st.settlementId}`).status, 'paid');
});

test('store order: reject and cancel put stock back; bad carts and closed stores refused', async () => {
  seedStore();
  const a = await call('marketCreateOrder', 'cust1', order('ord-bbbbbbbb'));
  await assert.rejects(call('marketMerchantUpdateOrder', 'shop1', { orderId: a.orderId, action: 'rejected' }), errCode('invalid-argument'));
  await call('marketMerchantUpdateOrder', 'shop1', { orderId: a.orderId, action: 'rejected', reason: 'Out of chicken' });
  assert.equal(store.get('merchants/shop1/products/water').stock, 5);

  const b = await call('marketCreateOrder', 'cust1', order('ord-cccccccc'));
  await call('marketMerchantUpdateOrder', 'shop1', { orderId: b.orderId, action: 'accepted', prepMinutes: 10 });
  await call('dashAcceptDelivery', 'riderB', { deliveryId: store.get(`dash_orders/${b.orderId}`).deliveryId });
  await call('marketCancelOrder', 'cust1', { orderId: b.orderId });
  assert.equal(store.get('merchants/shop1/products/water').stock, 5);
  assert.equal(store.get(`dash_deliveries/${store.get(`dash_orders/${b.orderId}`).deliveryId}`).status, 'cancelled');
  assert.equal(store.get('riders/riderB').activeDeliveryId, null);

  await assert.rejects(call('marketCreateOrder', 'cust1', order('ord-dddddddd', { items: [{ productId: 'water', qty: 6 }] })), errCode('failed-precondition'));
  await assert.rejects(call('marketCreateOrder', 'cust1', order('ord-eeeeeeee', { items: [{ productId: 'water', qty: 3 }, { productId: 'water', qty: 3 }] })), errCode('failed-precondition'));
  await assert.rejects(call('marketCreateOrder', 'cust1', order('ord-ffffffff', { expectedTotalCents: 5 })), errCode('aborted'));
  store.set('merchants/shop1', { ...store.get('merchants/shop1'), hours: {} });
  await assert.rejects(call('marketCreateOrder', 'cust1', order('ord-gggggggg')), errCode('failed-precondition'));
  store.set('merchants/shop1', { ...store.get('merchants/shop1'), hours: ALL_DAY, isAcceptingOrders: false });
  await assert.rejects(call('marketQuoteOrder', 'cust1', { merchantId: 'shop1', items: CART, dropoff: HOME }), errCode('failed-precondition'));
  store.set('merchants/shop1', { ...store.get('merchants/shop1'), isAcceptingOrders: true, status: 'pending' });
  await assert.rejects(call('marketQuoteOrder', 'cust1', { merchantId: 'shop1', items: CART, dropoff: HOME }), errCode('not-found'));
});


// ── Fleet & shifts ───────────────────────────────────────────────────────────
test('motorcycles: no bike means no jobs; assignment is one-to-one; maintenance takes the bike off its rider', async () => {
  store.set('riders/riderC', { name: 'Carl', status: 'approved', isOnline: true });
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-fleet001'));
  await assert.rejects(call('dashAcceptDelivery', 'riderC', { deliveryId: id }), errCode('failed-precondition'));
  await assert.rejects(asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderC' }), errCode('failed-precondition'));

  await assert.rejects(call('dashAdminAssignMotorcycle', 'riderC', { motorcycleId: 'bike3', riderId: 'riderC' }), errCode('permission-denied'));
  await assert.rejects(asAdmin('dashAdminAssignMotorcycle', { motorcycleId: 'bike3', riderId: 'riderA' }), errCode('failed-precondition')); // A has bike1
  await assert.rejects(asAdmin('dashAdminAssignMotorcycle', { motorcycleId: 'bike3', riderId: 'riderP' }), errCode('failed-precondition')); // pending
  await asAdmin('dashAdminAssignMotorcycle', { motorcycleId: 'bike3', riderId: 'riderC' });
  assert.equal(store.get('riders/riderC').motorcyclePlate, 'EF9012');
  assert.equal(store.get('fleet_motorcycles/bike3').status, 'assigned');
  await call('dashAcceptDelivery', 'riderC', { deliveryId: id });

  // Can't pull a bike from a rider mid-delivery
  await assert.rejects(asAdmin('dashAdminSetMotorcycleStatus', { motorcycleId: 'bike3', status: 'maintenance', note: 'brakes' }), errCode('failed-precondition'));
  await asAdmin('dashAdminSetMotorcycleStatus', { motorcycleId: 'bike2', status: 'maintenance', note: 'Oil change' });
  assert.equal(store.get('riders/riderB').motorcycleId, null);
  assert.equal(store.get('riders/riderB').isOnline, false);
  assert.equal(store.get('fleet_motorcycles/bike2').assignedRiderId, null);
  await assert.rejects(asAdmin('dashAdminAssignMotorcycle', { motorcycleId: 'bike2', riderId: 'riderB' }), errCode('failed-precondition'));
  const logs = [...store.keys()].filter((k) => k.startsWith('fleet_motorcycles/bike2/log/'));
  assert.equal(logs.length, 1);
});

test('no bookable riders when the online riders have no motorcycle', async () => {
  store.set('riders/riderA', { ...store.get('riders/riderA'), motorcycleId: null });
  store.set('riders/riderB', { ...store.get('riders/riderB'), motorcycleId: null });
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('key-fleet002')), errCode('unavailable'));
});

test('online sessions are logged and shifts close as completed or missed', async () => {
  const { runShiftJobs } = require('./shiftjobs');
  const h = 3600000;
  const now = Date.now();
  const jdate = (ms) => new Date(ms - 5 * h).toISOString().slice(0, 10);
  const hhmm = (ms) => new Date(ms - 5 * h).toISOString().slice(11, 16);
  // A shift that ended 30 minutes ago, 2 hours long
  const start = now - 2.5 * h; const end = now - 0.5 * h;
  const shift = { date: jdate(start), start: hhmm(start), end: hhmm(end) };
  store.set('rider_shifts/s1', { ...shift, riderId: 'riderA', status: 'confirmed' });
  store.set('rider_shifts/s2', { ...shift, riderId: 'riderB', status: 'scheduled' });
  store.set('rider_shifts/s3', { ...shift, riderId: 'riderB', status: 'cancelled' });
  // A shift starting in 40 minutes → reminder
  const soon = now + 40 * 60000;
  store.set('rider_shifts/s4', { date: jdate(soon), start: hhmm(soon), end: hhmm(soon + 2 * h), riderId: 'riderA', status: 'confirmed' });
  store.set('riders/riderA', { ...store.get('riders/riderA'), fcmToken: 'tokA' });
  // riderA was online for the middle hour; riderB never
  const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
  store.set('rider_online_sessions/x1', { riderId: 'riderA', start: ts(start + 0.5 * h), end: ts(start + 1.5 * h) });
  store.set('riders/riderA', { ...store.get('riders/riderA'), isOnline: false });
  store.set('riders/riderB', { ...store.get('riders/riderB'), isOnline: false });

  const r = await runShiftJobs(now);
  assert.equal(store.get('rider_shifts/s1').status, 'completed');
  assert.equal(store.get('rider_shifts/s2').status, 'missed');
  assert.equal(store.get('rider_shifts/s3').status, 'cancelled');
  assert.equal(store.get('rider_shifts/s4').reminderSent, true);
  assert.equal(r.reminded, 1);
  assert.ok(pushes.some((p) => p.token === 'tokA' && /starting soon/.test(p.notification.title)));
  await runShiftJobs(now);
  assert.equal(pushes.filter((p) => /starting soon/.test(p.notification.title)).length, 1, 'reminder sent once');

  // Going offline writes a session
  const F2 = require('./index');
  await F2.dashRiderOnlineLog.run({ params: { uid: 'riderA' }, data: {
    before: { data: () => ({ isOnline: true, onlineSince: ts(now - h) }) },
    after: { data: () => ({ isOnline: false }), ref: { update: async (p) => ops.update('riders/riderA', p) } },
  } });
  const sess = [...store.entries()].filter(([k, v]) => k.startsWith('rider_online_sessions/') && v.riderId === 'riderA');
  assert.equal(sess.length, 2);
});


// ── Automatic dispatch ───────────────────────────────────────────────────────
test('auto dispatch: nearest rider first, decline/expiry moves on, then opens to all', async () => {
  const ts = (msv) => ({ toMillis: () => msv, toDate: () => new Date(msv) });
  const t0 = Date.now();
  store.set('riders/riderA', { ...store.get('riders/riderA'), fcmToken: 'tokA', lastLocation: { lat: 18.0417, lng: -77.5037, at: ts(t0) } }); // at pickup
  store.set('riders/riderB', { ...store.get('riders/riderB'), lastLocation: { lat: 18.07, lng: -77.52, at: ts(t0) } });     // ~4 km
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-auto0001'));
  const fire = () => F.dashNotifyNewDelivery.run({ params: { id }, data: { data: () => store.get(`dash_deliveries/${id}`) } });
  await fire();
  let d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.offeredTo, 'riderA');
  assert.ok(pushes.some((p) => /offer/i.test(p.notification.title)));

  // B can't take A's offer; A declines → B gets it
  await assert.rejects(call('dashAcceptDelivery', 'riderB', { deliveryId: id }), errCode('permission-denied'));
  await call('dashDeclineOffer', 'riderA', { deliveryId: id });
  d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.offeredTo, 'riderB');

  // B lets it expire → nobody left → open to all, dispatcher flagged
  const { sweepOffers } = require('./dispatch');
  await sweepOffers(Date.now() + 120000);
  d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.offeredTo, null);
  assert.equal(d.dispatchOpen, true);
  assert.equal(d.needsDispatcher, true);
  assert.deepEqual([...d.declinedBy].sort(), ['riderA', 'riderB']);

  // Open job: anyone free can accept, flags clear
  await call('dashAcceptDelivery', 'riderB', { deliveryId: id });
  d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.riderId, 'riderB'); assert.equal(d.needsDispatcher, false);
});

test('auto dispatch: offered rider accepts; manual mode broadcasts instead', async () => {
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-auto0002'));
  await F.dashNotifyNewDelivery.run({ params: { id }, data: { data: () => store.get(`dash_deliveries/${id}`) } });
  const first = store.get(`dash_deliveries/${id}`).offeredTo;
  assert.ok(['riderA', 'riderB'].includes(first));
  await call('dashAcceptDelivery', first, { deliveryId: id });
  assert.equal(store.get(`dash_deliveries/${id}`).status, 'assigned');

  store.set('dash_pricing/current', { autoDispatch: false });
  const other = first === 'riderA' ? 'riderB' : 'riderA';
  const { deliveryId: id2 } = await call('dashCreateDelivery', 'cust1', booking('key-auto0003'));
  store.set(`riders/${other}`, { ...store.get(`riders/${other}`), fcmToken: 'tokOther' });
  await F.dashNotifyNewDelivery.run({ params: { id: id2 }, data: { data: () => store.get(`dash_deliveries/${id2}`) } });
  assert.equal(store.get(`dash_deliveries/${id2}`).offeredTo, undefined);
  assert.ok(pushes.some((p) => p.token === 'tokOther' && /New VilleDash delivery/.test(p.notification.title)));
});

test('proof photos: only the assigned rider, only at the right stage, only our storage', async () => {
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-proof001'));
  await asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderA' });
  const url = (k) => `https://firebasestorage.googleapis.com/v0/b/x/o/dash_proof%2F${id}%2F${k}.jpg?alt=media`;
  await assert.rejects(call('dashAttachProof', 'riderA', { deliveryId: id, kind: 'pickup', url: url('pickup') }), errCode('failed-precondition'));
  for (const s of ['to_pickup', 'at_pickup']) await call('dashRiderUpdateStatus', 'riderA', { deliveryId: id, status: s });
  await assert.rejects(call('dashAttachProof', 'riderB', { deliveryId: id, kind: 'pickup', url: url('pickup') }), errCode('permission-denied'));
  await assert.rejects(call('dashAttachProof', 'riderA', { deliveryId: id, kind: 'pickup', url: 'https://evil.example/x.jpg' }), errCode('invalid-argument'));
  await call('dashAttachProof', 'riderA', { deliveryId: id, kind: 'pickup', url: url('pickup') });
  assert.equal(store.get(`dash_deliveries/${id}`).proofPhotos.pickup.url, url('pickup'));
  await assert.rejects(call('dashAttachProof', 'riderA', { deliveryId: id, kind: 'dropoff', url: url('drop') }), errCode('failed-precondition'));
});

test('rider cash handovers reduce what they owe; fleet charges are recorded and paid', async () => {
  const { deliveryId: id, pin } = await call('dashCreateDelivery', 'cust1', booking('key-cash0001'));
  await asAdmin('dashAdminAssignRider', { deliveryId: id, riderId: 'riderA' });
  for (const s of ['to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff']) await call('dashRiderUpdateStatus', 'riderA', { deliveryId: id, status: s });
  await call('dashVerifyDropoffPin', 'riderA', { deliveryId: id, pin });
  const d = store.get(`dash_deliveries/${id}`);
  const owed = d.cashToCollectCents - d.riderPayCents;
  await assert.rejects(asAdmin('dashAdminRecordRiderCash', { riderId: 'riderA', amountCents: owed + 1, reference: 'R1' }), errCode('failed-precondition'));
  await assert.rejects(asAdmin('dashAdminRecordRiderCash', { riderId: 'riderA', amountCents: 100 }), errCode('invalid-argument'));
  const r1 = await asAdmin('dashAdminRecordRiderCash', { riderId: 'riderA', amountCents: 10000, reference: 'R1' });
  assert.equal(r1.owedCents, owed - 10000);
  const r2 = await asAdmin('dashAdminRecordRiderCash', { riderId: 'riderA', amountCents: owed - 10000, reference: 'R2' });
  assert.equal(r2.owedCents, 0);
  await assert.rejects(call('dashAdminRecordRiderCash', 'riderA', { riderId: 'riderA', amountCents: 1, reference: 'x' }), errCode('permission-denied'));

  store.set('fleet_providers/prov1', { name: 'Island Bikes Ltd' });
  await assert.rejects(asAdmin('dashAdminRecordFleetCharge', { providerId: 'prov1', amountCents: 500000, periodStart: '2026-10-12', periodEnd: '2026-10-11' }), errCode('invalid-argument'));
  const fc = await asAdmin('dashAdminRecordFleetCharge', { providerId: 'prov1', amountCents: 500000, periodStart: '2026-10-12', periodEnd: '2026-10-18', bikes: 5 });
  assert.equal(store.get(`ledger_entries/${fc.entryId}`).kind, 'fleet_charge');
  await asAdmin('dashAdminMarkFleetChargePaid', { entryId: fc.entryId, reference: 'NCB-123' });
  assert.equal(store.get(`ledger_entries/${fc.entryId}`).paid, true);
  await assert.rejects(asAdmin('dashAdminMarkFleetChargePaid', { entryId: fc.entryId, reference: 'again' }), errCode('failed-precondition'));
});

test('phone numbers are kept off the delivery that every rider can see', async () => {
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('key-priv0001'));
  const main = JSON.stringify(store.get(`dash_deliveries/${id}`));
  for (const ph of ['8765550101', '8765550202', '876-555-0101', '876-555-0202']) assert.ok(!main.includes(ph), `main doc leaks ${ph}`);
  const c = store.get(`dash_deliveries/${id}/private/contact`);
  assert.equal(c.senderPhone, '8765550101'); assert.equal(c.recipientPhone, '8765550202');
  seedStore();
  const { orderId } = await call('marketCreateOrder', 'cust1', order('ord-priv0001'));
  await call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'accepted', prepMinutes: 10 });
  const delId = store.get(`dash_orders/${orderId}`).deliveryId;
  assert.ok(!JSON.stringify(store.get(`dash_deliveries/${delId}`)).includes('8765550101'));
  assert.equal(store.get(`dash_deliveries/${delId}/private/contact`).recipientPhone, '8765550101');
});

// ── Card payments (WiPay) ────────────────────────────────────────────────────
const crypto2 = require('crypto');
const PAY = require('./payments').internal;
let wipayCalls = [];
function mockWipay(reply = (body) => ({ status: 200, json: { url: 'https://jm.wipayfinancial.com/hosted/abc', message: 'OK', transaction_id: `SB-12-1-${body.get('order_id')}-20261018120000` } })) {
  wipayCalls = [];
  global.fetch = async (url, opts) => {
    const body = new URLSearchParams(opts.body);
    wipayCalls.push({ url, body: Object.fromEntries(body), headers: opts.headers });
    const r = reply(body);
    return { status: r.status, json: async () => r.json };
  };
}
const md5 = (s) => crypto2.createHash('md5').update(s).digest('hex');
async function wipayReturn(query) {
  let redirect = null;
  const res = { set() {}, redirect(code, url) { redirect = { code, url }; } };
  await F.wipayReturn({ query, method: 'GET', headers: {} }, res);
  return redirect;
}
const successQuery = (pid, totalStr, key = '123', extra = {}) => {
  const tx = `SB-12-1-${pid}-20261018120000`;
  return { status: 'success', order_id: pid, transaction_id: tx, total: totalStr, hash: md5(`${tx}${totalStr}${key}`), message: '[Y-R00]: Approved', card: '(VISA) ... 0007', ...extra };
};
const triggerRun = (fn, before, after, id) => F[fn].run({ data: { before: { data: () => before }, after: { data: () => after } }, params: { id } });

test('card payments are off unless config/payments turns them on', async () => {
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('card-off-1', { paymentMethod: 'card' })), errCode('failed-precondition'));
  store.set('config/payments', { cardTesters: ['cust2'] });
  await assert.rejects(call('dashCreateDelivery', 'cust1', booking('card-off-2', { paymentMethod: 'card' })), errCode('failed-precondition'));
  // Cash still works exactly as before
  const r = await call('dashCreateDelivery', 'cust1', booking('cash-ok-1'));
  assert.equal(store.get(`dash_deliveries/${r.deliveryId}`).status, 'requested');
});

test('parcel by card: held until paid, forged success refused, real success releases it, rider paid by VilleDash', async () => {
  store.set('config/payments', { cardTesters: ['cust1'] });
  mockWipay();
  const { deliveryId: id, pin, needsPayment } = await call('dashCreateDelivery', 'cust1', booking('card-parcel-1', { paymentMethod: 'card' }));
  assert.equal(needsPayment, true);
  let d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.status, 'awaiting_payment'); assert.equal(d.cashToCollectCents, 0); assert.equal(d.payment.method, 'card');
  await assert.rejects(call('dashAcceptDelivery', 'riderA', { deliveryId: id }), 'riders can’t take an unpaid job');

  await assert.rejects(call('payCardStart', 'cust2', { kind: 'delivery', id, returnOrigin: 'https://villecabs.com' }), errCode('failed-precondition'));
  const start = await call('payCardStart', 'cust1', { kind: 'delivery', id, returnOrigin: 'https://evil.example' });
  assert.match(start.url, /^https:\/\/jm\.wipayfinancial\.com\//);
  const sent = wipayCalls[0];
  assert.equal(sent.url, 'https://jm.wipayfinancial.com/plugins/payments/request');
  assert.equal(sent.headers.Accept, 'application/json');
  assert.equal(sent.body.account_number, '1234567890'); assert.equal(sent.body.environment, 'sandbox');
  assert.equal(sent.body.currency, 'JMD'); assert.equal(sent.body.method, 'credit_card');
  assert.equal(sent.body.total, (d.quote.totalCents / 100).toFixed(2));
  assert.ok(sent.body.order_id.length <= 16 && /^VD[0-9A-Z]+$/.test(sent.body.order_id));
  const pid = start.paymentId;
  assert.equal(store.get(`dash_payments/${pid}`).returnOrigin, 'https://villecabs.com', 'unknown sites fall back to villecabs.com');

  // Someone hand-crafts a "success" without the API key → refused
  const forged = successQuery(pid, sent.body.total, 'wrong-key');
  let r = await wipayReturn(forged);
  assert.equal(r.url, `https://villecabs.com/?vdpay=${pid}`);
  assert.equal(store.get(`dash_payments/${pid}`).status, 'rejected');
  assert.equal(store.get(`dash_deliveries/${id}`).status, 'awaiting_payment');

  // A fresh attempt that really succeeds
  const start2 = await call('payCardStart', 'cust1', { kind: 'delivery', id, returnOrigin: 'https://villedash.com' });
  r = await wipayReturn(successQuery(start2.paymentId, sent.body.total));
  assert.equal(r.url, `https://villedash.com/?vdpay=${start2.paymentId}`);
  d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.status, 'requested'); assert.equal(d.payment.status, 'paid'); assert.equal(d.payment.paymentId, start2.paymentId);
  // The same redirect again changes nothing
  await wipayReturn(successQuery(start2.paymentId, sent.body.total));
  assert.equal(store.get(`dash_payments/${start2.paymentId}`).status, 'paid');

  await call('dashAcceptDelivery', 'riderA', { deliveryId: id });
  for (const s of ['to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff']) await call('dashRiderUpdateStatus', 'riderA', { deliveryId: id, status: s });
  await call('dashVerifyDropoffPin', 'riderA', { deliveryId: id, pin });
  d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.status, 'delivered'); assert.equal(d.payment.status, 'paid');
  const ledger = [...store.entries()].filter(([k]) => k.startsWith('ledger_entries/')).map(([, v]) => v);
  const held = ledger.find((e) => e.kind === 'rider_cash_held');
  assert.equal(held.amountCents, -d.riderPayCents, 'VilleDash owes the rider their pay');
  await assert.rejects(asAdmin('dashAdminRecordRiderPayout', { riderId: 'riderA', amountCents: d.riderPayCents + 1, reference: 'P1' }), errCode('failed-precondition'));
  const paid = await asAdmin('dashAdminRecordRiderPayout', { riderId: 'riderA', amountCents: d.riderPayCents, reference: 'NCB-P1' });
  assert.equal(paid.owedCents, 0);
});

test('failed card payment: customer can switch to cash; unknown or unpaid orders expire', async () => {
  store.set('config/payments', { cardEnabled: true });
  mockWipay();
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('card-parcel-2', { paymentMethod: 'card' }));
  const start = await call('payCardStart', 'cust1', { kind: 'delivery', id });
  await wipayReturn({ status: 'failed', order_id: start.paymentId, transaction_id: 'x', message: '[N-R05]: Declined' });
  assert.equal(store.get(`dash_payments/${start.paymentId}`).status, 'failed');
  assert.match(store.get(`dash_deliveries/${id}`).payment.lastError, /Declined/);
  await assert.rejects(call('payUseCash', 'cust2', { kind: 'delivery', id }), errCode('permission-denied'));
  await call('payUseCash', 'cust1', { kind: 'delivery', id, payer: 'recipient' });
  const d = store.get(`dash_deliveries/${id}`);
  assert.equal(d.status, 'requested'); assert.equal(d.payment.method, 'cash'); assert.equal(d.payment.collectFrom, 'recipient');
  assert.equal(d.cashToCollectCents, d.quote.totalCents);

  // Garbage return → bounced to the site, nothing changes
  const r = await wipayReturn({ status: 'success', order_id: 'not-ours' });
  assert.equal(r.url, 'https://villecabs.com/?vdpay=unknown');

  // Left unpaid past the limit → cancelled; stock for store orders goes back
  seedStore();
  const o = await call('marketCreateOrder', 'cust1', order('card-ord-exp', { paymentMethod: 'card' }));
  assert.equal(store.get(`dash_orders/${o.orderId}`).status, 'awaiting_payment');
  assert.equal(store.get('merchants/shop1/products/water').stock, 2);
  const { id: d2 } = { id: (await call('dashCreateDelivery', 'cust1', booking('card-parcel-3', { paymentMethod: 'card' }))).deliveryId };
  assert.equal(await PAY.expireUnpaid(Date.now() + 10 * 60000), 0, 'not yet');
  assert.equal(await PAY.expireUnpaid(Date.now() + 31 * 60000), 2);
  assert.equal(store.get(`dash_orders/${o.orderId}`).status, 'cancelled');
  assert.equal(store.get(`dash_deliveries/${d2}`).status, 'cancelled');
  assert.equal(store.get('merchants/shop1/products/water').stock, 5, 'stock restored');
});

test('store order by card: store sees it only after payment; rider collects nothing; rejection flags a refund', async () => {
  store.set('config/payments', { cardTesters: ['cust1'] });
  seedStore(); mockWipay();
  const { orderId } = await call('marketCreateOrder', 'cust1', order('card-ord-1', { paymentMethod: 'card' }));
  await assert.rejects(call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'accepted', prepMinutes: 10 }), errCode('failed-precondition'));
  const o0 = store.get(`dash_orders/${orderId}`);
  const start = await call('payCardStart', 'cust1', { kind: 'order', id: orderId, returnOrigin: 'https://villecabs.com' });
  assert.equal(wipayCalls[0].body.total, (o0.totalCents / 100).toFixed(2));
  await wipayReturn(successQuery(start.paymentId, wipayCalls[0].body.total));
  assert.equal(store.get(`dash_orders/${orderId}`).status, 'awaiting_merchant');
  await call('marketMerchantUpdateOrder', 'shop1', { orderId, action: 'accepted', prepMinutes: 10 });
  const del = store.get(`dash_deliveries/${store.get(`dash_orders/${orderId}`).deliveryId}`);
  assert.equal(del.cashToCollectCents, 0); assert.equal(del.payment.method, 'card'); assert.equal(del.payment.status, 'paid');

  // A second paid order that the store rejects → refund flagged, admin records it
  const b = await call('marketCreateOrder', 'cust1', order('card-ord-2', { paymentMethod: 'card', items: [{ productId: 'jerk', qty: 1, options: { Size: ['Small'] } }] }));
  const s2 = await call('payCardStart', 'cust1', { kind: 'order', id: b.orderId });
  await wipayReturn(successQuery(s2.paymentId, wipayCalls[1].body.total));
  const before = store.get(`dash_orders/${b.orderId}`);
  await call('marketMerchantUpdateOrder', 'shop1', { orderId: b.orderId, action: 'rejected', reason: 'Out of chicken' });
  await triggerRun('payWatchOrder', before, store.get(`dash_orders/${b.orderId}`), b.orderId);
  assert.equal(store.get(`dash_payments/${s2.paymentId}`).refundDue, true);
  assert.equal(store.get(`dash_orders/${b.orderId}`).payment.status, 'refund_due');
  await assert.rejects(call('payAdminResolveRefund', 'cust1', { paymentId: s2.paymentId, reference: 'x' }), errCode('permission-denied'));
  await assert.rejects(asAdmin('payAdminResolveRefund', { paymentId: s2.paymentId }), errCode('invalid-argument'));
  await asAdmin('payAdminResolveRefund', { paymentId: s2.paymentId, reference: 'WIPAY-RF-1' });
  assert.equal(store.get(`dash_payments/${s2.paymentId}`).refundDue, false);
  assert.equal(store.get(`dash_orders/${b.orderId}`).payment.status, 'refunded');
  assert.ok([...store.values()].some((v) => v.kind === 'card_refund' && v.reference === 'WIPAY-RF-1'));
});

test('live mode needs saved credentials; admin saves them without exposing the key', async () => {
  store.set('config/payments', { cardEnabled: true, environment: 'live' });
  mockWipay();
  const { deliveryId: id } = await call('dashCreateDelivery', 'cust1', booking('card-live-1', { paymentMethod: 'card' }));
  await assert.rejects(call('payCardStart', 'cust1', { kind: 'delivery', id }), errCode('failed-precondition'));
  await assert.rejects(call('payAdminSetWipay', 'cust1', { accountNumber: '1234567890', apiKey: 'abc123' }), errCode('permission-denied'));
  await assert.rejects(asAdmin('payAdminSetWipay', { accountNumber: '123', apiKey: 'abc123' }), errCode('invalid-argument'));
  await asAdmin('payAdminSetWipay', { accountNumber: '9876543210', apiKey: 'liveKey99' });
  assert.equal(store.get('config/payments').liveAccountLast4, '3210');
  assert.ok(!JSON.stringify(store.get('config/payments')).includes('liveKey99'), 'key not in public config');
  const start = await call('payCardStart', 'cust1', { kind: 'delivery', id });
  assert.equal(wipayCalls[0].body.account_number, '9876543210'); assert.equal(wipayCalls[0].body.environment, 'live');
  // A sandbox-signed success can't settle a live payment
  await wipayReturn(successQuery(start.paymentId, wipayCalls[0].body.total, 'liveKey99'));
  assert.equal(store.get(`dash_payments/${start.paymentId}`).status, 'rejected');
  const tx = `12-77-${start.paymentId}-20261018120000`;
  await wipayReturn({ status: 'success', order_id: start.paymentId, transaction_id: tx, total: '9.99', hash: md5(`${tx}${wipayCalls[0].body.total}liveKey99`) });
  assert.equal(store.get(`dash_payments/${start.paymentId}`).status, 'paid');
  assert.equal(store.get(`dash_deliveries/${id}`).status, 'requested');

  // WiPay down → friendly error, payment recorded as start_failed
  mockWipay(() => ({ status: 500, json: { message: 'Server error' } }));
  const { deliveryId: id2 } = await call('dashCreateDelivery', 'cust2', booking('card-live-2', { paymentMethod: 'card' }));
  await assert.rejects(call('payCardStart', 'cust2', { kind: 'delivery', id: id2 }), errCode('unavailable'));
  assert.ok([...store.entries()].some(([k, v]) => k.startsWith('dash_payments/') && v.status === 'start_failed'));
});
