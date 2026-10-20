// Ride cancellation rules (pure). Mirrored in src/cancel/cancelRules.js for the
// fee preview the customer sees before confirming.
const DEFAULTS = { enabled: true, feeJmd: 300, freeMinutes: 2, noShowWaitMinutes: 5, lateMinutes: 15, driverSharePct: 85 };

// fault: 'customer' (fee after the free window) · 'late' (free if the driver is
// very late) · 'review' (fee held for admin review)
const CUSTOMER_REASONS = {
  changed_mind: { label: 'I changed my mind', fault: 'customer' },
  found_other: { label: 'I found another ride', fault: 'customer' },
  wrong_pickup: { label: 'Wrong pickup location', fault: 'customer' },
  booked_by_mistake: { label: 'I booked by mistake', fault: 'customer' },
  search_too_long: { label: 'It’s taking too long to find a driver', fault: 'customer' },
  driver_late: { label: 'Driver is taking too long', fault: 'late' },
  driver_asked: { label: 'Driver asked me to cancel', fault: 'review' },
  driver_problem: { label: 'Problem with the driver or vehicle', fault: 'review' },
  other: { label: 'Other', fault: 'customer' },
};
// outcome: 'cancel' ends the ride · 'redispatch' sends it back to other drivers
const DRIVER_REASONS = {
  rider_no_show: { label: 'Rider didn’t show up', outcome: 'cancel', fault: 'no_show' },
  rider_asked: { label: 'Rider asked me to cancel', outcome: 'cancel', fault: 'customer' },
  safety: { label: 'Safety concern', outcome: 'cancel', fault: 'none', review: true },
  vehicle: { label: 'Problem with my vehicle', outcome: 'redispatch', fault: 'driver' },
  emergency: { label: 'Emergency', outcome: 'redispatch', fault: 'driver' },
  too_far: { label: 'Pickup is too far / heavy traffic', outcome: 'redispatch', fault: 'driver' },
  personal: { label: 'Personal reason', outcome: 'redispatch', fault: 'driver' },
  other: { label: 'Other', outcome: 'redispatch', fault: 'driver' },
};
const FEE_STAGES = ['active', 'arrived']; // a fee is only possible once a driver is on the way

const mergeCfg = (c) => {
  const o = { ...DEFAULTS, ...(c || {}) };
  const num = (k, lo, hi) => { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULTS[k]; };
  num('feeJmd', 0, 5000); num('freeMinutes', 0, 30); num('noShowWaitMinutes', 1, 30); num('lateMinutes', 5, 120); num('driverSharePct', 0, 100);
  o.enabled = o.enabled !== false;
  return o;
};

// Decide the fee for a cancellation.
// by: 'customer' | 'driver' | other; stage: booking status just before cancelling.
// Returns { feeJmd, feeStatus: 'owed'|'review'|null, fault, why }
function decide({ by, reasonKey, stage, acceptedMs, arrivedMs, nowMs, cfg: rawCfg }) {
  const cfg = mergeCfg(rawCfg);
  const none = (fault, why) => ({ feeJmd: 0, feeStatus: null, fault, why });
  const fee = (status, fault, why) => (cfg.enabled && cfg.feeJmd > 0 ? { feeJmd: Math.round(cfg.feeJmd), feeStatus: status, fault, why } : none(fault, 'fees_off'));
  const sinceAccept = acceptedMs ? nowMs - acceptedMs : 0;
  const sinceArrive = arrivedMs ? nowMs - arrivedMs : 0;
  const inWindow = !acceptedMs || sinceAccept < cfg.freeMinutes * 60e3;

  if (by === 'customer') {
    if (!FEE_STAGES.includes(stage) || !acceptedMs) return none('none', 'before_driver');
    if (inWindow) return none('none', 'free_window');
    const r = CUSTOMER_REASONS[reasonKey] || CUSTOMER_REASONS.other;
    if (r.fault === 'late') {
      if (!arrivedMs && sinceAccept >= cfg.lateMinutes * 60e3) return none('driver', 'driver_late');
      return fee('owed', 'customer', 'after_window');
    }
    if (r.fault === 'review') return fee('review', 'review', 'needs_review');
    return fee('owed', 'customer', 'after_window');
  }
  if (by === 'driver') {
    const r = DRIVER_REASONS[reasonKey];
    if (!r) return none('driver', 'unknown_reason');
    if (r.fault === 'no_show') {
      if (stage === 'arrived' && arrivedMs && sinceArrive >= cfg.noShowWaitMinutes * 60e3) return fee('owed', 'customer', 'no_show');
      return none('driver', 'no_show_too_soon');
    }
    if (r.fault === 'customer') {
      if (inWindow) return none('none', 'free_window');
      return fee('owed', 'customer', 'rider_asked');
    }
    return none(r.fault, r.review ? 'safety_review' : 'driver_cancelled');
  }
  return none('none', 'admin_or_system');
}

// Can the driver use "Rider didn't show up" yet? Returns ms still to wait (0 = yes).
function noShowWaitLeft({ stage, arrivedMs, nowMs, cfg }) {
  const c = mergeCfg(cfg);
  if (stage !== 'arrived' || !arrivedMs) return c.noShowWaitMinutes * 60e3;
  return Math.max(0, arrivedMs + c.noShowWaitMinutes * 60e3 - nowMs);
}

const driverShare = (feeJmd, cfg) => Math.round(feeJmd * mergeCfg(cfg).driverSharePct / 100);

module.exports = { DEFAULTS, CUSTOMER_REASONS, DRIVER_REASONS, FEE_STAGES, mergeCfg, decide, noShowWaitLeft, driverShare };
