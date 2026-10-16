// Run: cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic');

const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };
const NEARBY = { lat: 18.0300, lng: -77.5100 };       // ~1.4 km away
const KINGSTON = { lat: 18.0179, lng: -76.8099 };

test('quote is whole cents and at least the minimum', () => {
  const q = L.quoteParcel({ pickup: MANDEVILLE, dropoff: NEARBY, size: 'small' });
  assert.ok(Number.isInteger(q.totalCents));
  assert.ok(q.totalCents >= L.DEFAULT_PRICING.minimumCents);
  assert.equal(q.totalCents % L.DEFAULT_PRICING.roundToCents, 0);
  const sum = q.lines.reduce((s, l) => s + l.cents, 0);
  assert.equal(sum, q.totalCents, 'breakdown lines add up to the total');
  q.lines.forEach((l) => assert.ok(Number.isInteger(l.cents)));
});

test('size and fragile surcharges are added', () => {
  const far = { lat: 18.08, lng: -77.53 };
  const a = L.quoteParcel({ pickup: MANDEVILLE, dropoff: far, size: 'small' });
  const b = L.quoteParcel({ pickup: MANDEVILLE, dropoff: far, size: 'large', fragile: true });
  assert.ok(b.totalCents >= a.totalCents + 30000 + 10000 - 1000);
});

test('admin pricing overrides defaults', () => {
  const q = L.quoteParcel({ pickup: MANDEVILLE, dropoff: NEARBY, size: 'small' },
    { minimumCents: 99900, roundToCents: 100, version: 7, placeholder: false });
  assert.equal(q.totalCents, 99900);
  assert.equal(q.pricingVersion, 7);
  assert.equal(q.pricingPlaceholder, false);
});

test('out of area, too heavy and bad input are refused', () => {
  assert.throws(() => L.quoteParcel({ pickup: MANDEVILLE, dropoff: KINGSTON, size: 'small' }), { code: 'out-of-area' });
  assert.throws(() => L.quoteParcel({ pickup: MANDEVILLE, dropoff: NEARBY, size: 'small', weightKg: 12 }), { code: 'too-heavy' });
  assert.throws(() => L.quoteParcel({ pickup: MANDEVILLE, dropoff: NEARBY, size: 'huge' }), { code: 'bad-size' });
  assert.throws(() => L.quoteParcel({ pickup: { lat: 'x' }, dropoff: NEARBY, size: 'small' }), { code: 'bad-location' });
  assert.throws(() => L.quoteParcel({ pickup: MANDEVILLE, dropoff: MANDEVILLE, size: 'small' }), { code: 'same-place' });
});

test('PIN hashing verifies only the right PIN', () => {
  const r = L.newPinRecord();
  assert.match(r.pin, /^\d{4}$/);
  assert.ok(L.pinMatches(r.pin, r.salt, r.hash));
  const wrong = String((Number(r.pin) + 1) % 10000).padStart(4, '0');
  assert.ok(!L.pinMatches(wrong, r.salt, r.hash));
  assert.ok(!L.pinMatches('12a4', r.salt, r.hash));
  assert.ok(!L.pinMatches('', r.salt, r.hash));
});

test('rider can only move one step forward and never straight to delivered', () => {
  assert.ok(L.canRiderMove('assigned', 'to_pickup'));
  assert.ok(L.canRiderMove('to_dropoff', 'at_dropoff'));
  assert.ok(!L.canRiderMove('assigned', 'collected'));
  assert.ok(!L.canRiderMove('at_dropoff', 'delivered'));
  assert.ok(!L.canRiderMove('delivered', 'to_pickup'));
});

test('prohibited items are flagged without false positives', () => {
  assert.deepEqual(L.findProhibited('Box of fireworks'), ['firework']);
  assert.deepEqual(L.findProhibited('Bag of cashews and a card'), []);
  assert.deepEqual(L.findProhibited('Envelope with cash'), ['cash']);
});

test('text and phone cleaning', () => {
  assert.equal(L.cleanText('  hi\u0000there  '), 'hi there');
  assert.equal(L.cleanText('x'.repeat(500), 10).length, 10);
  assert.equal(L.cleanPhone('(876) 555-1234'), '8765551234');
  assert.equal(L.cleanPhone('12'), '');
});

test('coarse area rounds to two decimals', () => {
  assert.deepEqual(L.coarseArea({ lat: 18.04163, lng: -77.50361 }), { lat: 18.04, lng: -77.5 });
});

// ── Marketplace ──────────────────────────────────────────────────────────────
const HOURS = { 1: { open: '08:00', close: '20:00' }, 5: { open: '18:00', close: '02:00' } }; // Mon, Fri late
const jm = (iso) => new Date(`${iso}-05:00`);

test('opening hours use Jamaica time and handle past-midnight shifts', () => {
  assert.ok(L.isOpenAt(HOURS, jm('2026-10-19T09:00:00')));   // Monday 9am
  assert.ok(!L.isOpenAt(HOURS, jm('2026-10-19T20:00:00')));  // Monday 8pm closes
  assert.ok(!L.isOpenAt(HOURS, jm('2026-10-20T09:00:00')));  // Tuesday: no hours
  assert.ok(L.isOpenAt(HOURS, jm('2026-10-16T23:30:00')));   // Friday late
  assert.ok(L.isOpenAt(HOURS, jm('2026-10-17T01:30:00')));   // Saturday 1:30am, Friday's shift
  assert.ok(!L.isOpenAt(HOURS, jm('2026-10-17T02:30:00')));
  assert.ok(!L.isOpenAt(null));
});

const PRODUCTS = {
  p1: { name: 'Jerk chicken', priceCents: 120000, available: true, stock: null,
    options: [{ name: 'Size', required: true, maxSelect: 1, choices: [{ label: 'Small', priceCents: 0 }, { label: 'Large', priceCents: 40000 }] },
              { name: 'Extras', required: false, maxSelect: 2, choices: [{ label: 'Festival', priceCents: 15000 }, { label: 'Plantain', priceCents: 20000 }] }] },
  p2: { name: 'Bottled water', priceCents: 15000, available: true, stock: 3 },
  p3: { name: 'Soup', priceCents: 50000, available: false },
};

test('cart is priced from stored prices, with options', () => {
  const r = L.priceCart([
    { productId: 'p1', qty: 2, options: { Size: ['Large'], Extras: ['Festival', 'Plantain'] }, priceCents: 1 },
    { productId: 'p2', qty: 3 },
  ], PRODUCTS);
  assert.equal(r.lines[0].unitCents, 120000 + 40000 + 15000 + 20000);
  assert.equal(r.subtotalCents, 2 * 195000 + 3 * 15000);
});

test('cart refuses sold-out, unavailable, missing options and stale items', () => {
  assert.throws(() => L.priceCart([{ productId: 'p2', qty: 4 }], PRODUCTS), { code: 'stock' });
  assert.throws(() => L.priceCart([{ productId: 'p3', qty: 1 }], PRODUCTS), { code: 'unavailable' });
  assert.throws(() => L.priceCart([{ productId: 'p1', qty: 1 }], PRODUCTS), { code: 'option' });
  assert.throws(() => L.priceCart([{ productId: 'p1', qty: 1, options: { Size: ['Huge'] } }], PRODUCTS), { code: 'option' });
  assert.throws(() => L.priceCart([{ productId: 'p1', qty: 1, options: { Size: ['Small'], Sauce: ['Hot'] } }], PRODUCTS), { code: 'option' });
  assert.throws(() => L.priceCart([{ productId: 'gone', qty: 1 }], PRODUCTS), { code: 'missing' });
  assert.throws(() => L.priceCart([{ productId: 'p2', qty: 0 }], PRODUCTS), { code: 'bad-qty' });
  assert.throws(() => L.priceCart([], PRODUCTS), { code: 'empty' });
});

test('15% commission split balances to the cent', () => {
  const s = L.marketSplit({ subtotalCents: 435001, deliveryCents: 60000, serviceCents: 0, riderPayCents: 26000, commissionPct: 15 });
  assert.equal(s.commissionCents, 65250);
  assert.equal(s.merchantPayableCents + s.commissionCents, 435001);
  assert.equal(s.totalCents, 495001);
  assert.equal(s.riderCashHeldCents + s.riderPayCents, s.totalCents);
  assert.equal(s.merchantPayableCents + s.riderPayCents + s.platformGrossCents, s.totalCents);
});

test('shift windows use Jamaica time and run past midnight', () => {
  const w = L.shiftWindow({ date: '2026-10-16', start: '17:00', end: '22:00' });
  assert.equal(new Date(w.start).toISOString(), '2026-10-16T22:00:00.000Z');
  assert.equal(w.end - w.start, 5 * 3600000);
  const late = L.shiftWindow({ date: '2026-10-16', start: '20:00', end: '02:00' });
  assert.equal(late.end - late.start, 6 * 3600000);
});

test('attendance needs real online time inside the shift', () => {
  const shift = { date: '2026-10-16', start: '09:00', end: '12:00' };
  const { start } = L.shiftWindow(shift);
  const h = 3600000;
  assert.ok(L.attendedShift(shift, [{ start: start - h, end: start + h }]));
  assert.ok(!L.attendedShift(shift, [{ start: start - 2 * h, end: start + 10 * 60000 }]));       // 10 min only
  assert.ok(!L.attendedShift(shift, [{ start: start + 4 * h, end: start + 5 * h }]));            // after
  assert.ok(L.attendedShift(shift, [{ start: start + 2 * h, end: null }], start + 3 * h));        // still online
  assert.ok(!L.attendedShift(shift, []));
});
