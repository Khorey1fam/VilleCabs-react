// Turns past demand into "riders needed" per hour, and compares it with the
// shifts planned. Pure functions — tested in src/dash/coverage.test.mjs.

const H = 3600000;
// Jamaica is UTC-5 all year.
export const jmParts = (ms) => { const d = new Date(ms - 5 * H); return { day: d.getUTCDay(), hour: d.getUTCHours(), date: d.toISOString().slice(0, 10) }; };
const toMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : typeof t === 'number' ? t : null);

/**
 * events: dash_demand_events docs ({ kind, at }). Only real requests count:
 * 'booked' (a delivery or order was placed) and 'unserved' (someone tried but
 * no rider was free). Quotes alone are not demand.
 * Returns grid[day][hour] = average requests in that hour over `weeks` weeks.
 */
export function demandGrid(events, weeks = 4) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  (events || []).forEach((e) => {
    if (e.kind !== 'booked' && e.kind !== 'unserved') return;
    const ms = toMs(e.at); if (ms == null) return;
    const { day, hour } = jmParts(ms);
    grid[day][hour] += 1;
  });
  return grid.map((row) => row.map((n) => Math.round((n / Math.max(1, weeks)) * 10) / 10));
}

export function ridersNeeded(requestsPerHour, perRiderHour = 2) {
  if (!(requestsPerHour > 0)) return 0;
  return Math.ceil(requestsPerHour / Math.max(0.5, perRiderHour));
}

const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** Which hours (0–23) of `date` a shift covers, counting a shift that runs past midnight. */
export function shiftHoursOn(shift, date) {
  const s = toMin(shift.start); let e = toMin(shift.end);
  if (s == null || e == null) return [];
  if (e <= s) e += 24 * 60;
  const out = [];
  const prev = new Date(Date.parse(`${date}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  for (let h = 0; h < 24; h++) {
    const a = h * 60; const b = a + 60;
    if (shift.date === date && s < b && e > a) out.push(h);
    // tail of yesterday's late shift
    if (shift.date === prev && e > 24 * 60 && s < b + 24 * 60 && e > a + 24 * 60) out.push(h);
  }
  return [...new Set(out)];
}

export const COUNTED = ['scheduled', 'confirmed', 'completed'];
/** Per hour of `date`: planned riders (scheduled+confirmed), confirmed only, and backups. */
export function coverageFor(shifts, date) {
  const rows = Array.from({ length: 24 }, () => ({ planned: 0, confirmed: 0, backup: 0 }));
  (shifts || []).forEach((sh) => {
    if (!COUNTED.includes(sh.status)) return;
    shiftHoursOn(sh, date).forEach((h) => {
      if (sh.isBackup) rows[h].backup += 1;
      else { rows[h].planned += 1; if (sh.status !== 'scheduled') rows[h].confirmed += 1; }
    });
  });
  return rows;
}

/** Hours where planned riders fall short of what demand suggests. */
export function gaps(coverage, demandRow, perRiderHour = 2) {
  return coverage.map((c, h) => ({ hour: h, need: ridersNeeded(demandRow[h], perRiderHour), have: c.planned }))
    .filter((g) => g.need > g.have);
}

/** Copy a week of shifts forward by 7 days (new shifts start as 'scheduled'). */
export function shiftWeekForward(shifts) {
  return (shifts || []).filter((s) => !['cancelled', 'declined'].includes(s.status)).map((s) => ({
    riderId: s.riderId, riderName: s.riderName, start: s.start, end: s.end, type: s.type || 'custom',
    isBackup: !!s.isBackup, notes: s.notes || '', status: 'scheduled',
    date: new Date(Date.parse(`${s.date}T12:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10),
  }));
}
