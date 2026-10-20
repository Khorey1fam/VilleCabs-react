// Browser copy of functions/cancel/logic.js — used only to PREVIEW the fee
// before the customer confirms. The server makes the final decision.
export const DEFAULTS = { enabled: true, feeJmd: 300, freeMinutes: 2, noShowWaitMinutes: 5, lateMinutes: 15, driverSharePct: 85 };
export const CUSTOMER_REASONS = {
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
export const DRIVER_REASONS = {
  rider_no_show: { label: 'Rider didn’t show up', outcome: 'cancel', fault: 'no_show' },
  rider_asked: { label: 'Rider asked me to cancel', outcome: 'cancel', fault: 'customer' },
  safety: { label: 'Safety concern', outcome: 'cancel', fault: 'none', review: true },
  vehicle: { label: 'Problem with my vehicle', outcome: 'redispatch', fault: 'driver' },
  emergency: { label: 'Emergency', outcome: 'redispatch', fault: 'driver' },
  too_far: { label: 'Pickup is too far / heavy traffic', outcome: 'redispatch', fault: 'driver' },
  personal: { label: 'Personal reason', outcome: 'redispatch', fault: 'driver' },
  other: { label: 'Other', outcome: 'redispatch', fault: 'driver' },
};
export const FEE_STAGES = ['active', 'arrived'];
export function mergeCfg(c) {
  const o = { ...DEFAULTS, ...(c || {}) };
  const num = (k, lo, hi) => { const v = Number(o[k]); o[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : DEFAULTS[k]; };
  num('feeJmd', 0, 5000); num('freeMinutes', 0, 30); num('noShowWaitMinutes', 1, 30); num('lateMinutes', 5, 120); num('driverSharePct', 0, 100);
  o.enabled = o.enabled !== false;
  return o;
}
const msOf = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : t && t.seconds ? t.seconds * 1000 : Number.isFinite(t) ? t : null);
export const acceptMs = (b) => Math.max(msOf(b && b.acceptedAt) || 0, msOf(b && b.startedAt) || 0) || null;
export const arriveMs = (b) => msOf(b && b.arrivedAt);
export function decide({ by, reasonKey, stage, acceptedMs, arrivedMs, nowMs, cfg: rawCfg }) {
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
    if (r.fault === 'customer') return inWindow ? none('none', 'free_window') : fee('owed', 'customer', 'rider_asked');
    return none(r.fault, r.review ? 'safety_review' : 'driver_cancelled');
  }
  return none('none', 'admin_or_system');
}
// ms left in the customer's free window (0 = window over or not started)
export function freeWindowLeft(b, cfg, nowMs) {
  const a = acceptMs(b);
  if (!a || !FEE_STAGES.includes(b.status)) return 0;
  return Math.max(0, a + mergeCfg(cfg).freeMinutes * 60e3 - nowMs);
}
export function noShowWaitLeft(b, cfg, nowMs) {
  const c = mergeCfg(cfg); const a = arriveMs(b);
  if (!b || b.status !== 'arrived' || !a) return c.noShowWaitMinutes * 60e3;
  return Math.max(0, a + c.noShowWaitMinutes * 60e3 - nowMs);
}
export const jmd = (n) => `J$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
export const mmss = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
