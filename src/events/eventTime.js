// VilleEvents time + event helpers for the browser. Mirrors functions/events/logic.js
// (Jamaica is UTC-5 all year, no daylight saving).
export const TZ = 'America/Jamaica';
const OFF = 5 * 3600e3;
export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export const REMINDER_OPTIONS = [
  { key: '1w', label: '1 week before' },
  { key: '1d', label: '1 day before' },
  { key: '3h', label: '3 hours before' },
  { key: '1h', label: '1 hour before' },
];
export const CUSTOM_CHOICES = [30, 90, 120, 240, 360, 720, 2880];
export const CATEGORIES = [
  { key: 'parties', label: 'Parties & Nightlife' },
  { key: 'food', label: 'Food & Dining' },
  { key: 'music', label: 'Concerts & Live Music' },
  { key: 'sports', label: 'Sports' },
  { key: 'community', label: 'Community' },
  { key: 'family', label: 'Family-Friendly' },
  { key: 'other', label: 'Other' },
];
export const catLabel = (k) => (CATEGORIES.find((c) => c.key === k) || {}).label || 'Other';

export const jamaicaMs = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h + 5, mi);
export function jamaicaParts(ms) {
  const t = new Date(ms - OFF);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() };
}
// Midnight (Jamaica) of the day containing ms.
export function jmDayStart(ms) { const p = jamaicaParts(ms); return jamaicaMs(p.y, p.mo, p.d); }

const fmt = (ms, opts) => new Intl.DateTimeFormat('en-JM', { timeZone: TZ, ...opts }).format(new Date(ms));
export const fmtDate = (ms) => fmt(ms, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtLongDate = (ms) => fmt(ms, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (ms) => fmt(ms, { hour: 'numeric', minute: '2-digit' });
export const fmtMonth = (ms) => fmt(ms, { month: 'long', year: 'numeric' });

export function parseClock(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.toLowerCase();
  let m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/);
  if (m) { let h = Number(m[1]) % 12; const mi = Number(m[2] || 0); if (m[3].startsWith('p')) h += 12; return h > 23 || mi > 59 ? null : { h, mi }; }
  m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { h: Number(m[1]), mi: Number(m[2]) };
  return null;
}
export function parseLegacyStart(dateStr, timeStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { startMs: null, timeKnown: false };
  const c = parseClock(timeStr);
  if (c) return { startMs: jamaicaMs(+m[1], +m[2], +m[3], c.h, c.mi), timeKnown: true };
  return { startMs: jamaicaMs(+m[1], +m[2], +m[3], 12, 0), timeKnown: false };
}

const msOf = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : Number.isFinite(t) ? t : null);
// ville_events doc → normalised event.
export function fromDoc(id, d) {
  return {
    id, title: d.title || 'Event', description: d.description || '', posters: Array.isArray(d.posters) ? d.posters.filter(Boolean) : [],
    startMs: msOf(d.startAt), endMs: msOf(d.endAt), timeKnown: d.timeKnown !== false, timeText: d.timeText || '',
    venueName: d.venueName || '', address: d.address || '', lat: Number.isFinite(d.lat) ? d.lat : null, lng: Number.isFinite(d.lng) ? d.lng : null,
    category: d.category || 'other', admission: d.admission || 'unknown', admissionNote: d.admissionNote || '', ticketUrl: d.ticketUrl || '',
    organizer: d.organizer || null, featured: !!d.featured, status: d.status || 'draft', source: d.source || 'admin', legacyId: d.legacyId || null,
  };
}
// Legacy approved partner flyer → normalised event (id "pr_<id>").
export function fromLegacy(id, p) {
  const { startMs, timeKnown } = parseLegacyStart(p.eventDate, p.eventTime);
  return {
    id: `pr_${id}`, legacyId: id, title: p.bizName || 'Event', description: p.description || '',
    posters: (Array.isArray(p.uploads) ? p.uploads : []).filter((u) => typeof u === 'string' && !/\.pdf($|\?)/i.test(u)),
    startMs, endMs: null, timeKnown, timeText: p.eventTime || '', venueName: p.venueName || '', address: p.address || '',
    lat: Number.isFinite(p.lat) ? p.lat : null, lng: Number.isFinite(p.lng) ? p.lng : null,
    category: 'other', admission: 'unknown', admissionNote: '', ticketUrl: '', organizer: null,
    featured: p.status === 'featured', status: 'published', source: 'partner',
  };
}

export const allowedReminders = (timeKnown) => (timeKnown ? ['1w', '1d', '3h', '1h', 'custom'] : ['1w', '1d']);

// Lifecycle of an event relative to now.
export function phase(ev, now = Date.now()) {
  if (ev.status === 'cancelled') return 'cancelled';
  if (!ev.startMs) return 'tba';
  const end = ev.endMs || (ev.timeKnown ? ev.startMs + 6 * HOUR : jmDayStart(ev.startMs) + DAY);
  if (now < (ev.timeKnown ? ev.startMs : jmDayStart(ev.startMs))) return 'upcoming';
  if (now < end) return 'live';
  return 'past';
}
export function countdown(ev, now = Date.now()) {
  const ph = phase(ev, now);
  if (ph === 'cancelled') return 'Cancelled';
  if (ph === 'tba') return 'Date to be announced';
  if (ph === 'live') return 'Happening now';
  if (ph === 'past') return 'Ended';
  const target = ev.timeKnown ? ev.startMs : jmDayStart(ev.startMs);
  const diff = target - now;
  const days = Math.floor((jmDayStart(target) - jmDayStart(now)) / DAY);
  if (diff < HOUR) return `Starts in ${Math.max(1, Math.round(diff / 60e3))} min`;
  if (days === 0) return ev.timeKnown ? `Today · in ${Math.round(diff / HOUR)} h` : 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  return `In ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'}`;
}
export function whenLine(ev) {
  if (!ev.startMs) return 'Date to be announced';
  const date = fmtDate(ev.startMs);
  if (!ev.timeKnown) return ev.timeText ? `${date} · ${ev.timeText}` : date;
  return `${date} · ${fmtTime(ev.startMs)}${ev.endMs ? `–${fmtTime(ev.endMs)}` : ''}`;
}

// Date-range filters, all in Jamaica time.
export function inRange(ev, key, now = Date.now()) {
  if (!ev.startMs) return false;
  const today = jmDayStart(now);
  const day = jmDayStart(ev.startMs);
  if (key === 'today') return day === today;
  if (key === 'tomorrow') return day === today + DAY;
  if (key === 'weekend') {
    const dow = jamaicaParts(now).dow;                  // 0 Sun … 6 Sat
    const fri = dow === 0 ? today - 2 * DAY : today + ((5 - dow + 7) % 7) * DAY;
    const start = dow === 6 || dow === 0 ? today : fri;
    const sunEnd = (dow === 0 ? today : fri + 2 * DAY) + DAY;
    return day >= start && day < sunEnd;
  }
  if (key === 'week') return day >= today && day < today + 7 * DAY;
  if (key === 'month') { const a = jamaicaParts(now); const b = jamaicaParts(ev.startMs); return a.y === b.y && a.mo === b.mo && day >= today; }
  return true;
}
