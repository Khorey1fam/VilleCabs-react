/* VilleEvents backend: saved-event reminders, notifications, stats and share
   previews.

   Collections
     ville_events/{id}                 events (admin-written). status: draft |
                                       published | cancelled | archived.
                                       startAt / endAt are absolute Timestamps.
     ville_events/{id}/audit/{id}      change history (written here)
     event_saves/{uid}_{eventId}       one save per customer per event (the id
                                       makes duplicates impossible). Holds the
                                       reminder choices.
     event_reminders/{saveId}_{key}    one job per chosen reminder. status:
                                       pending | sent | cancelled | failed
     customer_notifications/{id}       in-app inbox (owner reads / marks read)
     ville_event_stats/{eventId}       aggregate counters (admin reads)

   Legacy approved partner flyers (partnerRequests, bizType "Events") keep
   working as events with ids "pr_<partnerId>".                              */
const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const L = require('./logic');

const ADMIN_EMAILS = ['admin@villecabs.com'];
const MAX_ATTEMPTS = 3;
let deps = {
  db: () => getFirestore(),
  messaging: () => getMessaging(),
  now: () => Date.now(),
  ts: (ms) => Timestamp.fromMillis(ms),
  inc: (n) => FieldValue.increment(n),
  serverTime: () => FieldValue.serverTimestamp(),
  del: () => FieldValue.delete(),
};
const db = () => deps.db();
const msOf = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : Number.isFinite(t) ? t : null);
const isAdmin = (auth) => !!auth && (auth.token.admin === true || ADMIN_EMAILS.includes(String(auth.token.email || '').toLowerCase()));

// ── Event lookup (new collection, falling back to legacy partner flyers) ────
function fromDoc(id, d) {
  return { ...d, id, startMs: msOf(d.startAt), endMs: msOf(d.endAt), timeKnown: d.timeKnown !== false };
}
async function getEvent(id) {
  const snap = await db().doc(`ville_events/${id}`).get();
  if (snap.exists) return fromDoc(id, snap.data());
  if (String(id).startsWith('pr_')) {
    const p = await db().doc(`partnerRequests/${String(id).slice(3)}`).get();
    if (p.exists && p.get('bizType') === 'Events') return L.legacyToEvent(p.id, p.data());
  }
  return null;
}

async function bumpStats(eventId, fields) {
  if (!eventId) return;
  const patch = { updatedAt: deps.serverTime() };
  Object.entries(fields).forEach(([k, v]) => { patch[k] = deps.inc(v); });
  await db().doc(`ville_event_stats/${eventId}`).set(patch, { merge: true }).catch((e) => console.error('stats', e.message));
}

// ── Push + inbox ─────────────────────────────────────────────────────────────
async function pushToCustomer(uid, { title, body, url, tag }) {
  const ref = db().doc(`customers/${uid}`);
  const snap = await ref.get();
  const token = snap.exists ? snap.get('fcmToken') : null;
  if (!token) return 'no_token';
  try {
    await deps.messaging().send({
      token,
      notification: { title, body },
      data: { title, body, url: url || '/', tag: tag || 'ville-event', icon: '/ville-icon-192.png' },
      webpush: { headers: { Urgency: 'high' }, notification: { icon: '/ville-icon-192.png', badge: '/ville-icon-192.png' }, fcmOptions: { link: url || '/' } },
    });
    return 'sent';
  } catch (e) {
    const code = (e && (e.code || e.errorInfo && e.errorInfo.code)) || '';
    if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) {
      await ref.update({ fcmToken: deps.del(), pushTokenExpiredAt: deps.serverTime() }).catch(() => {});
      return 'token_expired';
    }
    console.error('event push failed', code || e.message);
    return 'failed';
  }
}
// Writes the inbox item once (fixed id), then pushes. Returns push status or 'duplicate'.
async function notifyOnce(id, uid, msg, extra = {}) {
  const ref = db().doc(`customer_notifications/${id}`);
  const created = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.exists) return false;
    tx.set(ref, { uid, title: msg.title, body: msg.body, url: extra.url || '/', kind: extra.kind || 'event', eventId: extra.eventId || null, read: false, createdAt: deps.serverTime() });
    return true;
  });
  if (!created) return 'duplicate';
  return pushToCustomer(uid, { title: msg.title, body: msg.body, url: extra.url, tag: id });
}

// ── Reminder jobs for one save ───────────────────────────────────────────────
// Brings event_reminders in line with the save and the event. Safe to run any
// number of times.
async function syncSave(saveId, save, ev) {
  const event = ev !== undefined ? ev : (save ? await getEvent(save.eventId) : null);
  const now = deps.now();
  const jobs = await db().collection('event_reminders').where('saveId', '==', saveId).get();
  const existing = new Map(jobs.docs.map((d) => [d.id, d.data()]));
  const want = new Map();
  if (save && event && L.isLive(event) && save.remindersOn !== false) {
    L.dueTimes(event.startMs, save.reminders, save.customMinutes, event.timeKnown, now)
      .forEach((r) => want.set(`${saveId}_${r.key}`, r));
  }
  const batch = db().batch();
  let writes = 0;
  existing.forEach((job, id) => {
    const ref = db().doc(`event_reminders/${id}`);
    const w = want.get(id);
    if (!w) {
      if (job.status === 'pending') { batch.update(ref, { status: 'cancelled', cancelledAt: deps.serverTime() }); writes++; }
      return;
    }
    const sameTime = msOf(job.dueAt) === w.dueAt;
    if (job.status === 'pending' && !sameTime) { batch.update(ref, { dueAt: deps.ts(w.dueAt), startMs: event.startMs }); writes++; }
    // Re-arm after a postponement or a reminder turned back on.
    if ((job.status === 'sent' && job.startMs !== event.startMs) || job.status === 'cancelled' || job.status === 'failed') {
      batch.set(ref, { ...job, status: 'pending', attempts: 0, dueAt: deps.ts(w.dueAt), startMs: event.startMs, rearmedAt: deps.serverTime() });
      writes++;
    }
  });
  want.forEach((w, id) => {
    if (existing.has(id)) return;
    batch.set(db().doc(`event_reminders/${id}`), {
      uid: save.uid, eventId: save.eventId, saveId, key: w.key, dueAt: deps.ts(w.dueAt), startMs: event.startMs,
      status: 'pending', attempts: 0, createdAt: deps.serverTime(),
    });
    writes++;
  });
  if (writes) await batch.commit();
  return { want: [...want.keys()], writes };
}

// ── Deliver one due reminder (idempotent) ────────────────────────────────────
async function deliverJob(jobId) {
  const ref = db().doc(`event_reminders/${jobId}`);
  const first = await ref.get();
  if (!first.exists || first.get('status') !== 'pending') return 'skip';
  const job = first.data();
  const ev = await getEvent(job.eventId);
  if (!ev || !L.isLive(ev) || ev.startMs !== job.startMs) {
    // Event cancelled, unpublished or moved: never send the old reminder.
    await ref.update({ status: 'cancelled', cancelledAt: deps.serverTime(), cancelReason: !ev ? 'event_missing' : L.isLive(ev) ? 'rescheduled' : `event_${ev.status}` });
    if (ev && L.isLive(ev)) { const s = await db().doc(`event_saves/${job.saveId}`).get(); if (s.exists) await syncSave(job.saveId, s.data(), ev); }
    return 'cancelled';
  }
  try {
    const claimed = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists || s.get('status') !== 'pending') return false;
      tx.update(ref, { status: 'sent', sentAt: deps.serverTime(), attempts: (s.get('attempts') || 0) + 1 });
      return true;
    });
    if (!claimed) return 'skip';
    const msg = L.reminderMessage(job.key, ev.title, ev.startMs, ev.timeKnown);
    const push = await notifyOnce(`rem_${jobId}`, job.uid, msg, { url: `/events/${job.eventId}`, kind: 'event_reminder', eventId: job.eventId });
    await ref.update({ pushStatus: push });
    await bumpStats(job.eventId, { remindersSent: 1, ...(push === 'failed' || push === 'token_expired' ? { pushFailures: 1 } : {}) });
    return 'sent';
  } catch (e) {
    const attempts = (job.attempts || 0) + 1;
    await ref.update({ attempts, lastError: String(e.message || e).slice(0, 200), status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' }).catch(() => {});
    if (attempts >= MAX_ATTEMPTS) await bumpStats(job.eventId, { remindersFailed: 1 });
    return 'error';
  }
}

async function sweep(limit = 300) {
  const due = await db().collection('event_reminders')
    .where('status', '==', 'pending').where('dueAt', '<=', deps.ts(deps.now())).limit(limit).get();
  const out = { sent: 0, cancelled: 0, skip: 0, error: 0 };
  for (const d of due.docs) out[await deliverJob(d.id)]++; // eslint-disable-line no-await-in-loop
  return out;
}

// ── Event changed (admin edit) ───────────────────────────────────────────────
const AUDITED = ['title', 'description', 'startAt', 'endAt', 'timeKnown', 'venueName', 'address', 'lat', 'lng', 'category', 'admission', 'ticketUrl', 'organizer', 'featured', 'status', 'posters'];
async function onEventWrite(eventId, before, after) {
  if (after) {
    const changed = AUDITED.filter((k) => JSON.stringify((before || {})[k] === undefined ? null : before[k]) !== JSON.stringify(after[k] === undefined ? null : after[k]));
    if (changed.length) {
      await db().collection(`ville_events/${eventId}/audit`).add({ at: deps.serverTime(), by: after.updatedBy || null, action: before ? 'update' : 'create', fields: changed, status: after.status || null });
    }
  }
  const b = before ? fromDoc(eventId, before) : null;
  const a = after ? fromDoc(eventId, after) : null;
  const timeChanged = b && a && b.startMs !== a.startMs;
  const statusChanged = (b && b.status) !== (a && a.status);
  if (!timeChanged && !statusChanged) return { resynced: 0 };
  const saves = await db().collection('event_saves').where('eventId', '==', eventId).get();
  for (const s of saves.docs) await syncSave(s.id, s.data(), a); // eslint-disable-line no-await-in-loop
  let notified = 0;
  if (a && a.status === 'cancelled' && b && b.status !== 'cancelled') {
    for (const s of saves.docs) { // eslint-disable-line no-restricted-syntax
      await notifyOnce(`cancel_${eventId}_${s.get('uid')}`, s.get('uid'), L.cancelledMessage(a.title), { url: `/events/${eventId}`, kind: 'event_cancelled', eventId }); // eslint-disable-line no-await-in-loop
      notified++;
    }
  } else if (timeChanged && L.isLive(a) && L.isLive(b) && Math.abs(a.startMs - b.startMs) >= 15 * 60e3) {
    for (const s of saves.docs) { // eslint-disable-line no-restricted-syntax
      await notifyOnce(`moved_${eventId}_${s.get('uid')}_${a.startMs}`, s.get('uid'), L.changedMessage(a.title, a.startMs, a.timeKnown), { url: `/events/${eventId}`, kind: 'event_changed', eventId }); // eslint-disable-line no-await-in-loop
      notified++;
    }
  }
  return { resynced: saves.size, notified };
}

// ── Save written by a customer ───────────────────────────────────────────────
async function onSaveWrite(saveId, before, after) {
  await syncSave(saveId, after || null);
  const eventId = (after || before || {}).eventId;
  const on = (x) => !!x && x.remindersOn !== false && Array.isArray(x.reminders) && x.reminders.length > 0;
  const stats = {};
  if (!before && after) stats.saves = 1;
  if (before && !after) stats.saves = -1;
  if (!on(before) && on(after)) stats.reminderOptIns = 1;
  if (on(before) && !on(after)) stats.reminderOptIns = -1;
  if (Object.keys(stats).length) await bumpStats(eventId, stats);
}

// ── Exports ──────────────────────────────────────────────────────────────────
exports.eventSaveSync = onDocumentWritten('event_saves/{saveId}', (e) =>
  onSaveWrite(e.params.saveId, e.data.before.exists ? e.data.before.data() : null, e.data.after.exists ? e.data.after.data() : null));

exports.eventChangeSync = onDocumentWritten('ville_events/{eventId}', (e) =>
  onEventWrite(e.params.eventId, e.data.before.exists ? e.data.before.data() : null, e.data.after.exists ? e.data.after.data() : null));

exports.eventRemindersSweep = onSchedule({ schedule: 'every 5 minutes', timeZone: 'America/Jamaica', retryCount: 2 }, async () => {
  const r = await sweep();
  if (r.sent || r.error) console.log('event reminders', r);
});

// Aggregate engagement. Views/shares/calendar/ride taps are counted, never names.
const TRACK = { view: 'views', share: 'shares', calendar: 'calendarAdds', ride_click: 'rideClicks' };
exports.eventTrack = onCall(async (req) => {
  const { eventId, kind } = req.data || {};
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(eventId) || !TRACK[kind]) throw new HttpsError('invalid-argument', 'Bad event or kind.');
  await bumpStats(eventId, { [TRACK[kind]]: 1 });
  return { ok: true };
});

// Rides booked from an event page, and those that were actually completed.
exports.eventRideBooked = onDocumentCreated('bookings/{id}', async (e) => {
  const b = e.data && e.data.data();
  if (b && typeof b.eventId === 'string') await bumpStats(b.eventId, { ridesBooked: 1 });
});
exports.eventRideCompleted = onDocumentUpdated('bookings/{id}', async (e) => {
  const b = e.data.before.data(); const a = e.data.after.data();
  if (a && typeof a.eventId === 'string' && b.status !== 'completed' && a.status === 'completed') await bumpStats(a.eventId, { ridesCompleted: 1 });
});

// Admin: copy approved legacy event flyers into ville_events (originals untouched).
exports.eventsImportLegacy = onCall(async (req) => {
  if (!isAdmin(req.auth)) throw new HttpsError('permission-denied', 'Admins only.');
  const snap = await db().collection('partnerRequests').where('bizType', '==', 'Events').get();
  let created = 0, skipped = 0;
  for (const d of snap.docs) { // eslint-disable-line no-restricted-syntax
    const ev = L.legacyToEvent(d.id, d.data());
    const ref = db().doc(`ville_events/${ev.id}`);
    const exists = await ref.get(); // eslint-disable-line no-await-in-loop
    if (exists.exists) { skipped++; continue; } // eslint-disable-line no-continue
    await ref.set({ // eslint-disable-line no-await-in-loop
      title: ev.title, description: ev.description, posters: ev.posters,
      startAt: ev.startMs ? deps.ts(ev.startMs) : null, endAt: null, timeKnown: ev.timeKnown,
      venueName: ev.venueName, address: ev.address, lat: ev.lat, lng: ev.lng,
      category: 'other', admission: 'unknown', ticketUrl: '', organizer: { name: '', contact: '', showContact: false },
      featured: ev.featured, status: ev.status, source: 'partner', legacyId: d.id,
      createdAt: deps.serverTime(), updatedAt: deps.serverTime(), updatedBy: req.auth.token.email || null,
    });
    created++;
  }
  return { created, skipped };
});

// Link previews: /e/<id> serves the event's title and poster to WhatsApp etc.,
// then sends people on to the event page.
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
exports.eventPage = onRequest(async (req, res) => {
  const id = String(req.query.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').replace(/[^A-Za-z0-9.-]/g, '');
  const origin = /(^|\.)(villeapp\.org|villecabs\.com|vercel\.app)$/.test(host) ? `https://${host}` : 'https://villecabs.com';
  const target = `${origin}/events/${id}`;
  let ev = null;
  try { ev = id ? await getEvent(id) : null; } catch (e) { ev = null; }
  const ok = ev && L.isListed(ev);
  const title = ok ? `${ev.title}${ev.status === 'cancelled' ? ' (cancelled)' : ''} · VilleEvents` : 'VilleEvents · Mandeville';
  const desc = ok ? `${ev.startMs ? L.formatJamaica(ev.startMs, ev.timeKnown) : 'Date to be announced'}${ev.venueName ? ` · ${ev.venueName}` : ''}` : 'Discover what’s happening in Mandeville.';
  const img = ok && ev.posters && ev.posters[0] ? ev.posters[0] : `${origin}/ville-icon-512.png`;
  res.set('Cache-Control', 'public, max-age=300');
  res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(`${origin}/e/${id}`)}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><a href="${esc(target)}">Open ${esc(title)}</a></body></html>`);
});

exports.internal = { syncSave, deliverJob, sweep, onEventWrite, onSaveWrite, getEvent, setDeps: (d) => { deps = { ...deps, ...d }; } };
