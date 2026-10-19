// Creator program: pure rules (no Firestore). Shared by the functions and tests.
const CODE_RE = /^[A-Z0-9]{3,20}$/;
const ENDED = ['cancelled', 'no_driver', 'declined', 'expired'];

const normCode = (c) => String(c || '').toUpperCase().replace(/\s+/g, '').trim();
const validCode = (c) => CODE_RE.test(c);

// Rider discount in whole J$ for a fare before discount.
function discountFor(fareBefore, discountType, discount) {
  const base = Math.max(0, Math.round(Number(fareBefore) || 0));
  const d = Number(discount) || 0;
  if (discountType === 'fixed') return Math.min(base, Math.round(d));
  return Math.min(base, Math.round(base * d / 100));
}

// Does the fare the app saved match what this code allows? (1 J$ rounding slack.)
function fareMatches(booking, creator) {
  const before = Number(booking.originalFare);
  const fare = Number(booking.fare);
  if (!Number.isFinite(before) || !Number.isFinite(fare) || before <= 0) return false;
  const expected = before - discountFor(before, creator.discountType, creator.discount);
  return fare >= expected - 1;
}

function cleanCreator(input) {
  const o = input || {};
  const errs = [];
  const name = String(o.name || '').trim().slice(0, 80);
  if (!name) errs.push('Add the creator’s name.');
  const discountType = o.discountType === 'fixed' ? 'fixed' : 'percent';
  const discount = Math.round(Number(o.discount));
  if (!Number.isFinite(discount) || discount <= 0) errs.push('Set the rider discount.');
  else if (discountType === 'percent' && discount > 50) errs.push('Percent discount can’t be more than 50%.');
  else if (discountType === 'fixed' && discount > 5000) errs.push('Fixed discount can’t be more than J$5,000.');
  const payoutJmd = Math.round(Number(o.payoutJmd));
  if (!Number.isFinite(payoutJmd) || payoutJmd <= 0 || payoutJmd > 10000) errs.push('Set the payout per completed ride (J$1 – J$10,000).');
  return {
    errs,
    data: {
      name,
      handle: String(o.handle || '').trim().replace(/^@+/, '').slice(0, 60),
      platform: String(o.platform || '').trim().slice(0, 40),
      phone: String(o.phone || '').trim().slice(0, 30),
      email: String(o.email || '').trim().slice(0, 120),
      notes: String(o.notes || '').trim().slice(0, 500),
      discountType, discount, payoutJmd,
      active: o.active !== false,
    },
  };
}

const discountLabel = (type, d) => (type === 'fixed' ? `J$${Number(d).toLocaleString('en-US')} off` : `${d}% off`);

module.exports = { CODE_RE, ENDED, normCode, validCode, discountFor, fareMatches, cleanCreator, discountLabel };
