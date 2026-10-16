// Shift reminders and attendance — kept apart from fleet.js so it can be tested
// without registering a Cloud Function.
const { FieldValue } = require('firebase-admin/firestore');
const L = require('./logic');
const { db, pushTo } = require('./common');

// ── Every 15 minutes: reminders, then mark finished shifts completed/missed ─
function jamaicaDate(ms) { return new Date(ms - 5 * 3600000).toISOString().slice(0, 10); }
async function runShiftJobs(now = Date.now()) {
  const dates = [jamaicaDate(now - 864e5), jamaicaDate(now)];
  const snap = await db().collection('rider_shifts').where('date', 'in', dates).get();
  const open = snap.docs.filter((d) => ['scheduled', 'confirmed'].includes(d.get('status')));
  let reminded = 0; let closed = 0;
  for (const d of open) {
    const s = d.data();
    const w = L.shiftWindow(s);
    if (!s.reminderSent && w.start > now && w.start - now <= 60 * 60000) {
      await pushTo('riders', s.riderId, '⏰ Shift starting soon', `Your VilleDash shift starts at ${s.start}. Go online when you're ready.`, { tag: 'vd-shift-reminder' });
      await d.ref.update({ reminderSent: true });
      reminded += 1;
    }
    if (w.end <= now) {
      const sessSnap = await db().collection('rider_online_sessions').where('riderId', '==', s.riderId).orderBy('end', 'desc').limit(50).get();
      const ms = (t) => (t && t.toMillis ? t.toMillis() : null);
      const sessions = sessSnap.docs.map((x) => ({ start: ms(x.get('start')), end: ms(x.get('end')) })).filter((x) => x.start);
      const rider = await db().doc(`riders/${s.riderId}`).get();
      if (rider.exists && rider.get('isOnline') && ms(rider.get('onlineSince'))) sessions.push({ start: ms(rider.get('onlineSince')), end: null });
      const attended = L.attendedShift(s, sessions, now);
      await d.ref.update({ status: attended ? 'completed' : 'missed', closedAt: FieldValue.serverTimestamp(), autoClosed: true });
      closed += 1;
    }
  }
  return { reminded, closed };
}
module.exports = { runShiftJobs, jamaicaDate };
