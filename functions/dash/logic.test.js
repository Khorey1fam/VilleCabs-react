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
