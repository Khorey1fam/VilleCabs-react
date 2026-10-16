/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash — pure business logic (no Firebase calls)
   FILE LOCATION: functions/dash/logic.js

   Everything here is deterministic and unit-tested (functions/dash/logic.test.js).
   All money is integer CENTS of JMD (J$1 = 100). Never floats for money.
   ═══════════════════════════════════════════════════════════════════════════ */

const crypto = require('crypto');

// ── Default pricing ──────────────────────────────────────────────────────────
// PLACEHOLDER VALUES. Keneile asked for defaults until real prices are set.
// They are only used when dash_pricing/current is missing a field; the admin
// "VilleDash → Pricing" screen writes the real values to that document.
const DEFAULT_PRICING = Object.freeze({
  version: 0,
  placeholder: true,
  currency: 'JMD',
  baseFeeCents:          30000,   // J$300 flat start
  perKmCents:             6000,   // J$60 per road km
  minimumCents:          50000,   // J$500 minimum charge
  roundToCents:           1000,   // round totals UP to the next J$10
  fragileSurchargeCents: 10000,   // J$100
  roadFactor:              1.3,   // straight line × 1.3 ≈ road distance
  maxDistanceKm:            25,
  serviceArea: { lat: 18.0416, lng: -77.5036, radiusKm: 15 }, // Mandeville centre
  sizes: {
    small:  { label: 'Small — fits in a backpack',      maxKg: 5,  surchargeCents: 0 },
    medium: { label: 'Medium — shoebox to small box',   maxKg: 10, surchargeCents: 15000 },
    large:  { label: 'Large — strapped to the bike',    maxKg: 20, surchargeCents: 30000 },
  },
  // Rider pay — per delivery (contractors). Also placeholders.
  riderBaseCents:  20000,          // J$200 per completed delivery
  riderPerKmCents:  3000,          // + J$30 per km
  // Marketplace (confirmed by Keneile)
  merchantCommissionPct: 15,
  settlementPeriodDays:  14,
  marketServiceFeeCents:  0,       // optional customer service fee
  marketDeliverySize: 'medium',    // store orders are priced as a medium parcel
  maxPrepMinutes: 120,
  requireMotorcycle: true,         // riders need an assigned bike to take jobs
  deliveriesPerRiderHour: 2,       // used to turn demand into riders needed
  // Operations
  maxActivePerCustomer:  3,
  allowQueueWhenNoRiders: false,   // refuse a booking when nobody is online
  pinMaxAttempts: 5,
});

const PACKAGE_CATEGORIES = ['documents', 'small_parcel', 'gift', 'clothing', 'retail', 'other'];

// Words that suggest an item a motorcycle courier must not carry. This is a
// first filter only — riders can still refuse at pickup.
const PROHIBITED_WORDS = [
  'gun', 'firearm', 'ammo', 'ammunition', 'bullet', 'explosive', 'firework',
  'gas cylinder', 'propane', 'gasoline', 'petrol', 'kerosene', 'acid', 'bleach',
  'ganja', 'weed', 'marijuana', 'cocaine', 'drugs', 'cash', 'money', 'live animal',
  'battery acid', 'lithium battery pack', 'knife', 'machete',
];

function mergePricing(stored) {
  const s = stored || {};
  return {
    ...DEFAULT_PRICING,
    ...s,
    serviceArea: { ...DEFAULT_PRICING.serviceArea, ...(s.serviceArea || {}) },
    sizes: s.sizes && Object.keys(s.sizes).length ? s.sizes : DEFAULT_PRICING.sizes,
  };
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isCoord(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

function roundUp(cents, step) {
  if (!step || step <= 1) return Math.ceil(cents);
  return Math.ceil(cents / step) * step;
}

class QuoteError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Price a parcel delivery. Throws QuoteError for anything we can't serve.
 * Returns integer cents only.
 */
function quoteParcel({ pickup, dropoff, size, fragile, weightKg }, storedPricing) {
  const p = mergePricing(storedPricing);
  if (!isCoord(pickup) || !isCoord(dropoff)) throw new QuoteError('bad-location', 'Pickup and drop-off need a map location.');
  const sz = p.sizes[size];
  if (!sz) throw new QuoteError('bad-size', 'Please choose a package size.');
  if (weightKg != null && (!Number.isFinite(weightKg) || weightKg <= 0)) throw new QuoteError('bad-weight', 'Weight must be a positive number.');
  if (weightKg != null && weightKg > sz.maxKg) {
    throw new QuoteError('too-heavy', `${sz.label} packages can weigh up to ${sz.maxKg} kg.`);
  }

  const area = p.serviceArea;
  const inArea = (pt) => haversineKm(pt, area) <= area.radiusKm;
  if (!inArea(pickup) || !inArea(dropoff)) {
    throw new QuoteError('out-of-area', `VilleDash currently delivers within ${area.radiusKm} km of Mandeville.`);
  }

  const straight = haversineKm(pickup, dropoff);
  const distanceKm = Math.round(straight * p.roadFactor * 10) / 10;
  if (distanceKm > p.maxDistanceKm) throw new QuoteError('too-far', `Deliveries are limited to ${p.maxDistanceKm} km.`);
  if (straight < 0.05) throw new QuoteError('same-place', 'Pickup and drop-off are the same place.');

  const lines = [];
  lines.push({ key: 'base', label: 'Base delivery', cents: p.baseFeeCents });
  lines.push({ key: 'distance', label: `Distance (${distanceKm} km)`, cents: Math.round(p.perKmCents * distanceKm) });
  if (sz.surchargeCents) lines.push({ key: 'size', label: `Size: ${sz.label.split(' —')[0]}`, cents: sz.surchargeCents });
  if (fragile) lines.push({ key: 'fragile', label: 'Fragile handling', cents: p.fragileSurchargeCents });

  const subtotal = lines.reduce((s, l) => s + l.cents, 0);
  let total = Math.max(subtotal, p.minimumCents);
  if (total > subtotal) lines.push({ key: 'minimum', label: 'Minimum charge adjustment', cents: total - subtotal });
  const rounded = roundUp(total, p.roundToCents);
  if (rounded > total) lines.push({ key: 'rounding', label: 'Rounding', cents: rounded - total });
  total = rounded;

  const riderPayCents = p.riderBaseCents + Math.round(p.riderPerKmCents * distanceKm);

  return {
    currency: 'JMD',
    distanceKm,
    distanceIsEstimate: true,          // straight line × road factor, not a road route
    lines,
    totalCents: total,
    riderPayCents,
    pricingVersion: p.version || 0,
    pricingPlaceholder: !!p.placeholder,
  };
}

function findProhibited(text) {
  const t = String(text || '').toLowerCase();
  return PROHIBITED_WORDS.filter((w) => new RegExp(`(^|[^a-z])${w}s?([^a-z]|$)`).test(t));
}

// ── Delivery status machine ──────────────────────────────────────────────────
// requested → assigned → to_pickup → at_pickup → collected → to_dropoff →
// at_dropoff → delivered.  Side exits: cancelled, failed.
const STATUSES = ['requested', 'assigned', 'to_pickup', 'at_pickup', 'collected',
  'to_dropoff', 'at_dropoff', 'delivered', 'cancelled', 'failed'];
const FINAL = ['delivered', 'cancelled', 'failed'];
const ACTIVE = STATUSES.filter((s) => !FINAL.includes(s));

// Steps a RIDER may take, from → to. 'delivered' is not here: it only happens
// through PIN verification (or an admin exception).
const RIDER_STEPS = {
  assigned:   ['to_pickup'],
  to_pickup:  ['at_pickup'],
  at_pickup:  ['collected'],
  collected:  ['to_dropoff'],
  to_dropoff: ['at_dropoff'],
};

// A customer may cancel until the rider has the package.
const CUSTOMER_CANCELLABLE = ['requested', 'assigned', 'to_pickup'];
// An admin may (re)assign until the package is collected.
const ADMIN_ASSIGNABLE = ['requested', 'assigned', 'to_pickup', 'at_pickup'];

function canRiderMove(from, to) {
  return (RIDER_STEPS[from] || []).includes(to);
}

// ── Delivery PIN ─────────────────────────────────────────────────────────────
function generatePin() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}
function hashPin(pin, salt) {
  return crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}
function newPinRecord() {
  const pin = generatePin();
  const salt = crypto.randomBytes(16).toString('hex');
  return { pin, salt, hash: hashPin(pin, salt) };
}
function pinMatches(pin, salt, hash) {
  if (!/^\d{4}$/.test(String(pin || ''))) return false;
  const a = Buffer.from(hashPin(String(pin), salt), 'hex');
  const b = Buffer.from(String(hash || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Input clean-up ───────────────────────────────────────────────────────────
function cleanText(v, max = 300) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function cleanPhone(v) {
  const digits = String(v || '').replace(/[^\d+]/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

// General area for analytics — rounds to ~1 km so no exact addresses are kept.
function coarseArea(pt) {
  if (!isCoord(pt)) return null;
  return { lat: Math.round(pt.lat * 100) / 100, lng: Math.round(pt.lng * 100) / 100 };
}

function formatJMD(cents) {
  return `J$${(Math.round(cents) / 100).toLocaleString('en-JM', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}


// ── Marketplace ──────────────────────────────────────────────────────────────
const MERCHANT_CATEGORIES = ['restaurant', 'fast_food', 'cafe_bakery', 'supermarket', 'convenience', 'boutique', 'gift_shop', 'retail'];
// Regulated categories stay off until compliance is sorted.
const DISABLED_CATEGORIES = ['pharmacy', 'alcohol', 'tobacco'];
const JAMAICA_OFFSET_MIN = -5 * 60; // UTC-5 all year, no daylight saving

function jamaicaClock(date) {
  const d = new Date(date.getTime() + JAMAICA_OFFSET_MIN * 60000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** hours = { "0": {open:"08:00", close:"20:00"}, … } keyed by weekday (0 = Sunday), Jamaica time.
 *  A missing day = closed. close < open means it runs past midnight. */
function isOpenAt(hours, date = new Date()) {
  if (!hours) return false;
  const { day, minutes } = jamaicaClock(date);
  const today = hours[String(day)];
  if (today) {
    const o = toMin(today.open); const c = toMin(today.close);
    if (o != null && c != null) {
      if (c > o && minutes >= o && minutes < c) return true;
      if (c <= o && minutes >= o) return true; // late-night shift, before midnight
    }
  }
  const y = hours[String((day + 6) % 7)];
  if (y) {
    const o = toMin(y.open); const c = toMin(y.close);
    if (o != null && c != null && c <= o && minutes < c) return true; // after midnight
  }
  return false;
}

class CartError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Price a cart against products as stored in the database. Never trusts a
 * price from the phone. products = { [productId]: productDoc }.
 * items = [{ productId, qty, options: { [groupName]: [choiceLabel, …] }, note }]
 */
function priceCart(items, products) {
  if (!Array.isArray(items) || items.length === 0) throw new CartError('empty', 'Your cart is empty.');
  if (items.length > 50) throw new CartError('too-many', 'Too many items in one order.');
  const lines = [];
  for (const it of items) {
    const p = products[it.productId];
    const qty = Number(it.qty);
    if (!p) throw new CartError('missing', 'An item in your cart is no longer sold.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new CartError('bad-qty', `Check the quantity for ${p.name}.`);
    if (p.available === false) throw new CartError('unavailable', `${p.name} is unavailable right now.`);
    if (Number.isInteger(p.stock) && p.stock < qty) throw new CartError('stock', p.stock > 0 ? `Only ${p.stock} × ${p.name} left.` : `${p.name} is sold out.`);
    if (!Number.isInteger(p.priceCents) || p.priceCents < 0) throw new CartError('bad-price', `${p.name} has no valid price.`);
    let unit = p.priceCents;
    const chosen = [];
    const picked = it.options || {};
    for (const g of p.options || []) {
      const want = Array.isArray(picked[g.name]) ? picked[g.name] : [];
      const max = Number.isInteger(g.maxSelect) && g.maxSelect > 0 ? g.maxSelect : 1;
      if (g.required && want.length === 0) throw new CartError('option', `Choose ${g.name} for ${p.name}.`);
      if (want.length > max) throw new CartError('option', `Pick up to ${max} for ${g.name}.`);
      for (const label of want) {
        const c = (g.choices || []).find((x) => x.label === label);
        if (!c) throw new CartError('option', `${label} is no longer offered for ${p.name}.`);
        if (c.available === false) throw new CartError('option', `${label} is unavailable right now.`);
        unit += Number.isInteger(c.priceCents) ? c.priceCents : 0;
        chosen.push({ group: g.name, label, priceCents: c.priceCents || 0 });
      }
    }
    for (const name of Object.keys(picked)) {
      if (!(p.options || []).some((g) => g.name === name)) throw new CartError('option', `${p.name} has changed. Please re-add it.`);
    }
    lines.push({
      productId: it.productId, name: p.name, qty, unitCents: unit, lineCents: unit * qty,
      options: chosen, note: cleanText(it.note, 200),
    });
  }
  const subtotalCents = lines.reduce((s, l) => s + l.lineCents, 0);
  return { lines, subtotalCents };
}

/** How one delivered marketplace order splits. Integer cents throughout. */
function marketSplit({ subtotalCents, deliveryCents, serviceCents, riderPayCents, commissionPct }) {
  const commissionCents = Math.round(subtotalCents * commissionPct / 100);
  const merchantPayableCents = subtotalCents - commissionCents;
  const totalCents = subtotalCents + deliveryCents + serviceCents;
  return {
    totalCents, commissionCents, merchantPayableCents,
    riderPayCents,
    // The rider collects all the cash, keeps their pay, and owes VilleDash the rest.
    riderCashHeldCents: totalCents - riderPayCents,
    // What VilleDash keeps once the merchant and rider are paid.
    platformGrossCents: commissionCents + deliveryCents + serviceCents - riderPayCents,
  };
}

const ORDER_STATUSES = ['awaiting_merchant', 'accepted', 'preparing', 'ready', 'collected', 'delivered', 'rejected', 'cancelled', 'failed'];
const ORDER_FINAL = ['delivered', 'rejected', 'cancelled', 'failed'];
const MERCHANT_STEPS = { awaiting_merchant: ['accepted', 'rejected'], accepted: ['preparing', 'ready'], preparing: ['ready'] };


// ── Fleet & shifts ───────────────────────────────────────────────────────────
const BIKE_STATUSES = ['available', 'assigned', 'in_service', 'maintenance', 'unavailable', 'removed'];
const BIKE_ASSIGNABLE = ['available', 'assigned', 'in_service'];
const SHIFT_STATUSES = ['scheduled', 'confirmed', 'declined', 'missed', 'completed', 'cancelled'];

/** Jamaica date + "HH:MM" → epoch ms. A shift ending at or before its start runs past midnight. */
function shiftWindow(shift) {
  const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00-05:00`);
  const start = at(shift.date, shift.start);
  let end = at(shift.date, shift.end);
  if (!(end > start)) end += 24 * 3600000;
  return { start, end };
}
/** Did the rider spend at least `minMinutes` online during the shift? sessions = [{start, end}] in ms (end null = still online). */
function attendedShift(shift, sessions, now = Date.now(), minMinutes = 30) {
  const w = shiftWindow(shift);
  let overlap = 0;
  for (const s of sessions || []) {
    const a = Math.max(w.start, s.start);
    const b = Math.min(w.end, s.end == null ? now : s.end);
    if (b > a) overlap += b - a;
  }
  return overlap >= Math.min(minMinutes, (w.end - w.start) / 60000) * 60000;
}

module.exports = {
  DEFAULT_PRICING, PACKAGE_CATEGORIES, PROHIBITED_WORDS,
  mergePricing, haversineKm, isCoord, quoteParcel, QuoteError, findProhibited,
  STATUSES, FINAL, ACTIVE, RIDER_STEPS, CUSTOMER_CANCELLABLE, ADMIN_ASSIGNABLE, canRiderMove,
  generatePin, hashPin, newPinRecord, pinMatches,
  cleanText, cleanPhone, coarseArea, formatJMD,
  MERCHANT_CATEGORIES, DISABLED_CATEGORIES, isOpenAt, CartError, priceCart, marketSplit,
  ORDER_STATUSES, ORDER_FINAL, MERCHANT_STEPS,
  BIKE_STATUSES, BIKE_ASSIGNABLE, SHIFT_STATUSES, shiftWindow, attendedShift,
};
