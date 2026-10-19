// VilleEvents data: events (new ville_events + approved legacy flyers),
// the customer's saves, inbox and recently viewed. All live from Firestore.
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import { fromDoc, fromLegacy, allowedReminders, jamaicaParts, DAY } from './eventTime';

const db = () => dashDb();

export function useEvents() {
  const [fresh, setFresh] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => onSnapshot(query(collection(db(), 'ville_events'), where('status', 'in', ['published', 'cancelled'])),
    (s) => { setError(false); setFresh(s.docs.map((d) => fromDoc(d.id, d.data()))); },
    () => { setFresh([]); setError(true); }), []);
  useEffect(() => onSnapshot(query(collection(db(), 'partnerRequests'), where('status', '==', 'approved')),
    (s) => setLegacy(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.bizType === 'Events' && p.slot).map((p) => fromLegacy(p.id, p))),
    () => setLegacy([])), []);
  const events = useMemo(() => {
    if (fresh === null || legacy === null) return null;
    const migrated = new Set(fresh.map((e) => e.legacyId).filter(Boolean));
    const ids = new Set(fresh.map((e) => e.id));
    return [...fresh, ...legacy.filter((e) => !migrated.has(e.legacyId) && !ids.has(e.id))];
  }, [fresh, legacy]);
  return { events, loading: events === null, error: error && (!events || events.length === 0) };
}

export function useMySaves(uid) {
  const [saves, setSaves] = useState(uid ? null : []);
  useEffect(() => {
    if (!uid) { setSaves([]); return undefined; }
    return onSnapshot(query(collection(db(), 'event_saves'), where('uid', '==', uid)),
      (s) => setSaves(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSaves([]));
  }, [uid]);
  const byEvent = useMemo(() => new Map((saves || []).map((s) => [s.eventId, s])), [saves]);
  return { saves, byEvent };
}

export function useInbox(uid) {
  const [items, setItems] = useState(uid ? null : []);
  useEffect(() => {
    if (!uid) { setItems([]); return undefined; }
    return onSnapshot(query(collection(db(), 'customer_notifications'), where('uid', '==', uid)),
      (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => ((b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0)))),
      () => setItems([]));
  }, [uid]);
  return items;
}
export const markRead = (id) => updateDoc(doc(db(), 'customer_notifications', id), { read: true, readAt: serverTimestamp() }).catch(() => {});
export async function markAllRead(items) {
  const unread = (items || []).filter((n) => !n.read);
  if (!unread.length) return;
  const b = writeBatch(db());
  unread.slice(0, 400).forEach((n) => b.update(doc(db(), 'customer_notifications', n.id), { read: true, readAt: serverTimestamp() }));
  await b.commit().catch(() => {});
}

export function useRecent(uid) {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    if (!uid) { setIds([]); return undefined; }
    return onSnapshot(doc(db(), 'event_recent', uid), (s) => setIds(s.exists() ? (s.data().ids || []) : []), () => setIds([]));
  }, [uid]);
  return ids;
}
export function pushRecent(uid, ids, eventId) {
  if (!uid || !eventId) return;
  const next = [eventId, ...(ids || []).filter((x) => x !== eventId)].slice(0, 12);
  setDoc(doc(db(), 'event_recent', uid), { ids: next, updatedAt: serverTimestamp() }).catch(() => {});
}

// Save (or update reminders on) an event. The document id uid_eventId means a
// second save of the same event can never create a duplicate.
export async function saveEvent(uid, ev, { reminders = [], customMinutes = null, remindersOn = true } = {}, existing) {
  const ok = new Set(allowedReminders(ev.timeKnown));
  const list = [...new Set(reminders.filter((k) => ok.has(k)))];
  const cm = list.includes('custom') ? Math.round(Number(customMinutes)) : null;
  const data = {
    uid, eventId: ev.id, reminders: list, customMinutes: cm, remindersOn: !!remindersOn,
    eventTitle: String(ev.title || '').slice(0, 200), eventStartMs: ev.startMs || null,
    createdAt: existing && existing.createdAt ? existing.createdAt : serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db(), 'event_saves', `${uid}_${ev.id}`), data);
}
export const unsaveEvent = (uid, eventId) => deleteDoc(doc(db(), 'event_saves', `${uid}_${eventId}`));

// Aggregate engagement only (no personal data). Never blocks the UI.
export function track(eventId, kind) {
  try { httpsCallable(getFunctions(getApp()), 'eventTrack')({ eventId, kind }).catch(() => {}); } catch (e) { /* offline */ }
}

// Shareable link (served by the eventPage function for link previews).
export const shareUrl = (ev) => `${window.location.origin}/e/${ev.id}`;

// ── Calendar ─────────────────────────────────────────────────────────────────
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDay = (ms) => { const p = jamaicaParts(ms); return `${p.y}${String(p.mo).padStart(2, '0')}${String(p.d).padStart(2, '0')}`; };
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
function span(ev) {
  if (!ev.timeKnown) return { allDay: true, start: ev.startMs, end: ev.startMs + DAY };
  return { allDay: false, start: ev.startMs, end: ev.endMs || ev.startMs + 3 * 3600e3 };
}
export function icsFor(ev) {
  const sp = span(ev);
  const where = [ev.venueName, ev.address].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VILLE//VilleEvents//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${ev.id}@villeevents`, `DTSTAMP:${icsDate(Date.now())}`,
    sp.allDay ? `DTSTART;VALUE=DATE:${icsDay(sp.start)}` : `DTSTART:${icsDate(sp.start)}`,
    sp.allDay ? `DTEND;VALUE=DATE:${icsDay(sp.end)}` : `DTEND:${icsDate(sp.end)}`,
    `SUMMARY:${icsText(ev.title)}`, where ? `LOCATION:${icsText(where)}` : null,
    `DESCRIPTION:${icsText(`${ev.description ? `${ev.description}\n\n` : ''}${ev.endMs || !ev.timeKnown ? '' : 'End time not announced; 3 hours shown.\n'}${shareUrl(ev)}`)}`,
    `URL:${shareUrl(ev)}`, 'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}
export function downloadIcs(ev) {
  const blob = new Blob([icsFor(ev)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(ev.title || 'event').replace(/[^\w-]+/g, '-').slice(0, 50)}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function googleCalUrl(ev) {
  const sp = span(ev);
  const dates = sp.allDay ? `${icsDay(sp.start)}/${icsDay(sp.end)}` : `${icsDate(sp.start)}/${icsDate(sp.end)}`;
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', ev.title);
  u.searchParams.set('dates', dates);
  u.searchParams.set('ctz', 'America/Jamaica');
  u.searchParams.set('details', `${ev.description ? `${ev.description}\n\n` : ''}${shareUrl(ev)}`);
  const where = [ev.venueName, ev.address].filter(Boolean).join(', ');
  if (where) u.searchParams.set('location', where);
  return u.toString();
}
export function directionsUrl(ev) {
  if (ev.lat != null && ev.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}`;
  const q = [ev.venueName, ev.address, 'Mandeville Jamaica'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
