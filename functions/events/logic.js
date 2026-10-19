// VilleEvents: pure helpers (no Firebase) so they can be unit-tested.
//
// Times: every event start is stored as an absolute instant (Firestore
// Timestamp). Jamaica (America/Jamaica) is UTC-5 all year with no daylight
// saving, so local wall-clock times convert with a fixed offset.

const JM_OFFSET_H = 5;                       // Jamaica = UTC-5
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const REMINDERS = {
  '1w': { ms: 7 * DAY, label: '1 week before' },
  '1d': { ms: DAY, label: '1 day before' },
  '3h': { ms: 3 * HOUR, label: '3 hours before' },
  '1h': { ms: HOUR, label: '1 hour before' },
};
const DAY_LEVEL = ['1w', '1d'];              // the only ones that make sense without a start time
const CUSTOM_MIN = 15;                       // custom reminder: 15 min … 14 days before
const CUSTOM_MAX = 14 * 24 * 60;

const CATEGORIES = {
  parties: 'Parties & Nightlife',
  food: 'Food & Dining',
  music: 'Concerts & Live Music',
  sports: 'Sports',
  community: 'Community',
  family: 'Family-Friendly',
  other: 'Other',
};
const STATUSES = ['draft', 'published', 'cancelled', 'archived'];

// Wall-clock time in Jamaica → epoch ms.
function jamaicaMs(y, mo, d, h = 0, mi = 0) { return Date.UTC(y, mo - 1, d, h + JM_OFFSET_H, mi); }
// Epoch ms → Jamaica wall-clock parts.
function jamaicaParts(ms) {
  const t = new Date(ms - JM_OFFSET_H * HOUR);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), dow: t.getUTCDay() };
}

// "9pm", "9:30 PM", "21:00", "9 PM - 2 AM", "from 8pm" → { h, mi } (first time found).
function parseClock(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.toLowerCase();
  let m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/);
  if (m) {
    let h = Number(m[1]) % 12; const mi = Number(m[2] || 0);
    if (m[3].startsWith('p')) h += 12;
    if (h > 23 || mi > 59) return null;
    return { h, mi };
  }
  m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { h: Number(m[1]), mi: Number(m[2]) };
  if (/\bnoon\b/.test(s)) return { h: 12, mi: 0 };
  if (/\bmidnight\b/.test(s)) return { h: 0, mi: 0 };
  return null;
}

// Legacy partner flyers store "YYYY-MM-DD" + free-text time.
function parseLegacyStart(dateStr, timeStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { startMs: null, timeKnown: false };
  const c = parseClock(timeStr);
  if (c) return { startMs: jamaicaMs(+m[1], +m[2], +m[3], c.h, c.mi), timeKnown: true };
  // Date only: anchor at noon so "1 day before" lands at a sensible hour.
  return { startMs: jamaicaMs(+m[1], +m[2], +m[3], 12, 0), timeKnown: false };
}

// Which reminders a customer may choose for this event.
function allowedReminders(timeKnown) { return timeKnown ? Object.keys(REMINDERS).concat('custom') : DAY_LEVEL.slice(); }

// Clean a client-supplied reminder list. Returns { reminders, customMinutes }.
function cleanReminders(list, customMinutes, timeKnown) {
  const ok = new Set(allowedReminders(timeKnown));
  const reminders = [...new Set((Array.isArray(list) ? list : []).filter((k) => ok.has(k)))];
  let cm = null;
  if (reminders.includes('custom')) {
    cm = Math.round(Number(customMinutes));
    if (!Number.isFinite(cm) || cm < CUSTOM_MIN || cm > CUSTOM_MAX) { reminders.splice(reminders.indexOf('custom'), 1); cm = null; }
  }
  return { reminders, customMinutes: cm };
}

// When each chosen reminder is due. Only future ones are returned.
function dueTimes(startMs, reminders, customMinutes, timeKnown, nowMs = Date.now()) {
  if (!Number.isFinite(startMs)) return [];
  const { reminders: keys, customMinutes: cm } = cleanReminders(reminders, customMinutes, timeKnown);
  return keys.map((key) => ({ key, dueAt: startMs - (key === 'custom' ? cm * 60e3 : REMINDERS[key].ms) }))
    .filter((r) => r.dueAt > nowMs);
}

function formatJamaica(ms, withTime = true) {
  const p = jamaicaParts(ms);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = `${days[p.dow]} ${p.d} ${months[p.mo - 1]}`;
  if (!withTime) return date;
  const h12 = p.h % 12 || 12;
  return `${date}, ${h12}${p.mi ? `:${String(p.mi).padStart(2, '0')}` : ''} ${p.h < 12 ? 'am' : 'pm'}`;
}

// Reminder wording. Never promises a driver will be available.
function reminderMessage(key, title, startMs, timeKnown) {
  const name = title || 'Your saved event';
  const at = Number.isFinite(startMs) ? formatJamaica(startMs, timeKnown) : '';
  switch (key) {
    case '1w': return { title: `📅 ${name} is one week away`, body: `It's on ${at}. View the details in VilleEvents.` };
    case '1d': return { title: `🎉 Tomorrow's the day!`, body: `${name} is happening tomorrow${timeKnown ? ` (${at})` : ''}. View details in VilleEvents.` };
    case '3h': return { title: `⏰ ${name} starts in 3 hours!`, body: 'Need transportation? Book your ride with VilleCabs.' };
    case '1h': return { title: `🚕 ${name} is coming up!`, body: 'It starts in about an hour. View the location or arrange your ride.' };
    default: return { title: `⏰ Reminder: ${name}`, body: `It starts ${at}. View details in VilleEvents.` };
  }
}
function cancelledMessage(title) {
  return { title: `Cancelled: ${title || 'an event you saved'}`, body: 'The organiser has cancelled this event. Your reminders for it have been turned off.' };
}
function changedMessage(title, startMs, timeKnown) {
  return { title: `Time change: ${title || 'an event you saved'}`, body: `It's now on ${formatJamaica(startMs, timeKnown)}. Your reminders have been moved to match.` };
}

// Public visibility.
const isListed = (ev) => !!ev && (ev.status === 'published' || ev.status === 'cancelled');
const isLive = (ev) => !!ev && ev.status === 'published';

// Legacy approved partner flyer (partnerRequests, bizType Events) → event shape.
function legacyToEvent(id, p) {
  const { startMs, timeKnown } = parseLegacyStart(p.eventDate, p.eventTime);
  const uploads = (Array.isArray(p.uploads) ? p.uploads : []).filter((u) => typeof u === 'string' && !/\.pdf($|\?)/i.test(u));
  return {
    id: `pr_${id}`,
    legacyId: id,
    title: p.bizName || 'Event',
    description: p.description || '',
    posters: uploads,
    startMs, timeKnown, endMs: null,
    timeText: p.eventTime || '',
    venueName: p.venueName || '',
    address: p.address || '',
    lat: Number.isFinite(p.lat) ? p.lat : null,
    lng: Number.isFinite(p.lng) ? p.lng : null,
    category: 'other',
    admission: 'unknown',
    status: (p.status === 'approved' || p.status === 'featured') && p.slot ? 'published' : 'draft',
    featured: p.status === 'featured',
    source: 'partner',
  };
}

module.exports = {
  JM_OFFSET_H, HOUR, DAY, REMINDERS, DAY_LEVEL, CUSTOM_MIN, CUSTOM_MAX, CATEGORIES, STATUSES,
  jamaicaMs, jamaicaParts, parseClock, parseLegacyStart, allowedReminders, cleanReminders, dueTimes,
  formatJamaica, reminderMessage, cancelledMessage, changedMessage, isListed, isLive, legacyToEvent,
};
