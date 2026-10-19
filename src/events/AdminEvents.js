// Admin → VilleEvents: create and edit events, upload the organiser's original
// posters, publish / cancel / archive, see change history and real engagement.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { getStorage, ref as sref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { dashDb } from '../dash/dashApi';
import { C, st, Pill, Spinner } from '../dash/ui';
import { CATEGORIES, catLabel, fromDoc, jamaicaMs, jamaicaParts, fmtDate, fmtTime } from './eventTime';

const small = { padding: '7px 11px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer', fontWeight: 600, border: `1px solid ${C.line}`, background: C.white, color: C.ink };
const STATUS_TONE = { draft: 'grey', published: 'green', cancelled: 'red', archived: 'grey' };
const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (ms) => { if (!ms) return ''; const p = jamaicaParts(ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
const toTimeInput = (ms) => { if (!ms) return ''; const p = jamaicaParts(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const fromInputs = (date, time, fallbackH = 12) => {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = String(time || '').match(/^(\d{2}):(\d{2})$/);
  return jamaicaMs(+m[1], +m[2], +m[3], t ? +t[1] : fallbackH, t ? +t[2] : 0);
};
const EMPTY = { title: '', description: '', category: 'parties', date: '', time: '', endTime: '', timeKnown: true, venueName: '', address: '', lat: '', lng: '',
  admission: 'unknown', admissionNote: '', ticketUrl: '', orgName: '', orgContact: '', orgShow: false, featured: false, status: 'draft', posters: [] };

function Editor({ ev, onClose }) {
  const isNew = !ev;
  const [id] = useState(() => (ev ? ev.id : doc(collection(dashDb(), 'ville_events')).id));
  const [f, setF] = useState(() => (ev ? {
    title: ev.title, description: ev.description, category: ev.category, date: toDateInput(ev.startMs), time: ev.timeKnown ? toTimeInput(ev.startMs) : '',
    endTime: ev.endMs ? toTimeInput(ev.endMs) : '', timeKnown: ev.timeKnown, venueName: ev.venueName, address: ev.address,
    lat: ev.lat ?? '', lng: ev.lng ?? '', admission: ev.admission, admissionNote: ev.admissionNote || '', ticketUrl: ev.ticketUrl,
    orgName: (ev.organizer && ev.organizer.name) || '', orgContact: (ev.organizer && ev.organizer.contact) || '', orgShow: !!(ev.organizer && ev.organizer.showContact),
    featured: ev.featured, status: ev.status, posters: ev.posters,
  } : EMPTY));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e });

  const upload = async (files) => {
    setBusy(true); setMsg('');
    try {
      const urls = [];
      for (const file of [...files].slice(0, 6)) { // eslint-disable-line no-restricted-syntax
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMsg('Posters must be PNG, JPG or WebP images.'); continue; } // eslint-disable-line no-continue
        if (file.size > 8 * 1024 * 1024) { setMsg('Each poster must be under 8 MB.'); continue; } // eslint-disable-line no-continue
        const r = sref(getStorage(getApp()), `ville_events/${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`);
        await uploadBytes(r, file, { contentType: file.type }); // eslint-disable-line no-await-in-loop
        urls.push(await getDownloadURL(r)); // eslint-disable-line no-await-in-loop
      }
      setF((x) => ({ ...x, posters: [...x.posters, ...urls] }));
    } catch (e) { setMsg('Upload failed. Check you are signed in as admin.'); }
    setBusy(false);
  };

  const save = async (statusOverride) => {
    setMsg('');
    const status = statusOverride || f.status;
    const startMs = fromInputs(f.date, f.timeKnown ? f.time : '', 12);
    if (!f.title.trim()) { setMsg('Add the event name.'); return; }
    if (status === 'published') {
      if (!startMs) { setMsg('Add the event date before publishing.'); return; }
      if (f.timeKnown && !f.time) { setMsg('Add the start time, or untick “Start time confirmed”.'); return; }
      if (!f.venueName.trim() && !f.address.trim()) { setMsg('Add the venue or address before publishing.'); return; }
    }
    if (f.ticketUrl && !/^https:\/\/[^\s]+$/.test(f.ticketUrl.trim())) { setMsg('The ticket link must be the organiser’s https:// link.'); return; }
    const lat = f.lat === '' ? null : Number(f.lat); const lng = f.lng === '' ? null : Number(f.lng);
    if ((lat !== null && (!Number.isFinite(lat) || lat < 17 || lat > 19)) || (lng !== null && (!Number.isFinite(lng) || lng < -79 || lng > -76))) { setMsg('Map coordinates should be in Jamaica (lat 17–19, lng −79 to −76).'); return; }
    let endMs = null;
    if (f.timeKnown && f.endTime && startMs) { endMs = fromInputs(f.date, f.endTime); if (endMs <= startMs) endMs += 24 * 3600e3; }
    setBusy(true);
    try {
      await setDoc(doc(dashDb(), 'ville_events', id), {
        title: f.title.trim().slice(0, 140), description: f.description.trim().slice(0, 4000), category: f.category,
        startAt: startMs ? Timestamp.fromMillis(startMs) : null, endAt: endMs ? Timestamp.fromMillis(endMs) : null, timeKnown: !!f.timeKnown,
        venueName: f.venueName.trim(), address: f.address.trim(), lat, lng,
        admission: f.admission, admissionNote: f.admissionNote.trim().slice(0, 200), ticketUrl: f.ticketUrl.trim(),
        organizer: { name: f.orgName.trim(), contact: f.orgContact.trim(), showContact: !!f.orgShow },
        featured: !!f.featured, status, posters: f.posters,
        ...(isNew ? { createdAt: serverTimestamp(), source: 'admin' } : {}),
        updatedAt: serverTimestamp(), updatedBy: (getAuth(getApp()).currentUser || {}).email || null,
      }, { merge: true });
      onClose(status === 'published' ? 'Published.' : `Saved as ${status}.`);
    } catch (e) { setMsg('Could not save. Check you are signed in as admin.'); setBusy(false); }
  };

  return (
    <div style={{ ...st.card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={st.h2}>{isNew ? 'New event' : `Edit: ${ev.title}`}</div>
        <button type="button" style={small} onClick={() => onClose()}>Close</button>
      </div>
      <label style={st.label}>Event name</label><input style={st.input} value={f.title} onChange={set('title')} maxLength={140} />
      <label style={st.label}>Description</label><textarea style={{ ...st.input, minHeight: 110 }} value={f.description} onChange={set('description')} maxLength={4000} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        <div><label style={st.label}>Category</label><select style={st.input} value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div><label style={st.label}>Date (Jamaica)</label><input type="date" style={st.input} value={f.date} onChange={set('date')} /></div>
        <div><label style={st.label}>Start time</label><input type="time" style={st.input} value={f.time} onChange={set('time')} disabled={!f.timeKnown} /></div>
        <div><label style={st.label}>End time (optional)</label><input type="time" style={st.input} value={f.endTime} onChange={set('endTime')} disabled={!f.timeKnown} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 8 }}><input type="checkbox" checked={f.timeKnown} onChange={set('timeKnown')} /> Start time confirmed (needed for 3-hour and 1-hour reminders)</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <div><label style={st.label}>Venue name</label><input style={st.input} value={f.venueName} onChange={set('venueName')} /></div>
        <div><label style={st.label}>Address</label><input style={st.input} value={f.address} onChange={set('address')} /></div>
        <div><label style={st.label}>Latitude</label><input style={st.input} value={f.lat} onChange={set('lat')} placeholder="18.04" inputMode="decimal" /></div>
        <div><label style={st.label}>Longitude</label><input style={st.input} value={f.lng} onChange={set('lng')} placeholder="-77.50" inputMode="decimal" /></div>
      </div>
      <div style={{ fontSize: 12, color: C.quiet, marginTop: 4 }}>Coordinates let customers book a ride straight to the venue. In Google Maps, press and hold the venue and copy the numbers shown.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <div><label style={st.label}>Admission</label><select style={st.input} value={f.admission} onChange={set('admission')}><option value="unknown">Not stated</option><option value="free">Free (confirmed)</option><option value="paid">Paid (confirmed)</option></select></div>
        <div><label style={st.label}>Admission details (from organiser)</label><input style={st.input} value={f.admissionNote} onChange={set('admissionNote')} placeholder="e.g. Pre-sold $1,500, gate $2,000" /></div>
        <div><label style={st.label}>Ticket link (organiser’s, https)</label><input style={st.input} value={f.ticketUrl} onChange={set('ticketUrl')} placeholder="https://…" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <div><label style={st.label}>Organiser</label><input style={st.input} value={f.orgName} onChange={set('orgName')} /></div>
        <div><label style={st.label}>Organiser contact</label><input style={st.input} value={f.orgContact} onChange={set('orgContact')} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 8 }}><input type="checkbox" checked={f.orgShow} onChange={set('orgShow')} /> Organiser agreed to show their contact publicly</label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 6 }}><input type="checkbox" checked={f.featured} onChange={set('featured')} /> Featured on VilleEvents</label>

      <label style={st.label}>Posters (organiser’s original artwork)</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {f.posters.map((p, i) => (
          <div key={p} style={{ position: 'relative' }}>
            <img src={p} alt={`Poster ${i + 1}`} style={{ width: 90, height: 112, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.line}` }} />
            <button type="button" onClick={() => setF({ ...f, posters: f.posters.filter((x) => x !== p) })} style={{ ...small, position: 'absolute', top: 4, right: 4, padding: '2px 7px', color: C.red }} aria-label="Remove poster">×</button>
            {i > 0 && <button type="button" onClick={() => setF({ ...f, posters: [p, ...f.posters.filter((x) => x !== p)] })} style={{ ...small, position: 'absolute', bottom: 4, left: 4, padding: '2px 6px', fontSize: 11 }}>Main</button>}
          </div>
        ))}
        <label style={{ ...small, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 90, height: 112, borderStyle: 'dashed', textAlign: 'center' }}>
          {busy ? '…' : '+ Upload'}<input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: 'none' }} onChange={(e) => upload(e.target.files)} />
        </label>
      </div>

      <label style={st.label}>Status</label>
      <select style={st.input} value={f.status} onChange={set('status')}>
        <option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="cancelled">Cancelled (shown as cancelled; savers are told)</option><option value="archived">Archived (hidden)</option>
      </select>
      {msg && <div style={st.err}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" style={{ ...st.btn, width: 'auto', padding: '11px 18px' }} disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save'}</button>
        {f.status !== 'published' && <button type="button" style={{ ...st.btnGhost, width: 'auto', padding: '11px 18px' }} disabled={busy} onClick={() => save('published')}>Save &amp; publish</button>}
      </div>
    </div>
  );
}

function History({ id, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'ville_events', id, 'audit'), orderBy('at', 'desc'), limit(50)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), [id]);
  return (
    <div style={{ ...st.card, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><div style={st.h2}>Change history</div><button type="button" style={small} onClick={onClose}>Close</button></div>
      {!rows ? <Spinner /> : rows.length === 0 ? <div style={st.sub}>No changes recorded yet.</div> : rows.map((r) => (
        <div key={r.id} style={{ fontSize: 13, padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
          <b>{r.at && r.at.toDate ? r.at.toDate().toLocaleString('en-JM', { timeZone: 'America/Jamaica' }) : ''}</b> · {r.by || 'admin'} · {r.action} · {(r.fields || []).join(', ')}{r.status ? ` · status ${r.status}` : ''}
        </div>
      ))}
    </div>
  );
}

const STAT_COLS = [['views', 'Views'], ['saves', 'Saves'], ['reminderOptIns', 'Reminders on'], ['remindersSent', 'Reminders sent'], ['remindersFailed', 'Failed'], ['shares', 'Shares'], ['calendarAdds', 'Calendar'], ['rideClicks', 'Ride taps'], ['ridesBooked', 'Rides booked'], ['ridesCompleted', 'Rides completed']];

export default function AdminEvents() {
  const [events, setEvents] = useState(null);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);   // null | 'new' | event
  const [history, setHistory] = useState(null);
  const [view, setView] = useState('events');
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(collection(dashDb(), 'ville_events'), (s) => setEvents(s.docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => (b.startMs || 0) - (a.startMs || 0))), () => setEvents([])), []);
  useEffect(() => onSnapshot(collection(dashDb(), 'ville_event_stats'), (s) => { const o = {}; s.docs.forEach((d) => { o[d.id] = d.data(); }); setStats(o); }, () => {}), []);
  const shown = useMemo(() => (events || []).filter((e) => filter === 'all' || e.status === filter), [events, filter]);
  const quick = async (ev, status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel “${ev.title}”? Everyone who saved it gets a cancellation notice and their reminders stop.`)) return; // eslint-disable-line no-alert
    await setDoc(doc(dashDb(), 'ville_events', ev.id), { status, updatedAt: serverTimestamp(), updatedBy: (getAuth(getApp()).currentUser || {}).email || null }, { merge: true });
    setMsg(`${ev.title}: ${status}.`);
  };
  const importLegacy = async () => {
    setMsg('Importing…');
    try { const r = await httpsCallable(getFunctions(getApp()), 'eventsImportLegacy')({}); setMsg(`Imported ${r.data.created} event flyer(s); ${r.data.skipped} already here. Originals in Partners are unchanged.`); } catch (e) { setMsg('Import failed. Deploy the functions first.'); }
  };

  if (!events) return <Spinner />;
  if (editing) return <Editor ev={editing === 'new' ? null : editing} onClose={(m) => { setEditing(null); if (m) setMsg(m); }} />;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['events', 'Events'], ['stats', 'Engagement']].map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} style={{ ...small, background: view === k ? C.purple : C.white, color: view === k ? C.white : C.ink }}>{l}</button>)}
        <button type="button" style={{ ...small, marginLeft: 'auto', background: C.purple, color: C.white, border: 'none' }} onClick={() => setEditing('new')}>+ New event</button>
        <button type="button" style={small} onClick={importLegacy}>Import approved event flyers</button>
      </div>
      {msg && <div style={st.note}>{msg}</div>}
      {history && <History id={history} onClose={() => setHistory(null)} />}

      {view === 'stats' ? (
        <div style={{ ...st.card, overflowX: 'auto' }}>
          <div style={st.h2}>Engagement (counts only, no personal data)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: 'left', padding: 6 }}>Event</th>{STAT_COLS.map(([, l]) => <th key={l} style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>{l}</th>)}</tr></thead>
            <tbody>
              {Object.keys(stats).sort((a, b) => ((stats[b].views || 0) + (stats[b].saves || 0) * 5) - ((stats[a].views || 0) + (stats[a].saves || 0) * 5)).map((id) => {
                const ev = (events || []).find((e) => e.id === id);
                return (
                  <tr key={id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: 6 }}>{ev ? ev.title : id.startsWith('pr_') ? `Partner flyer ${id.slice(3, 9)}…` : id}</td>
                    {STAT_COLS.map(([k]) => <td key={k} style={{ padding: 6, textAlign: 'right' }}>{Math.max(0, stats[id][k] || 0)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {Object.keys(stats).length === 0 && <div style={st.sub}>No activity recorded yet.</div>}
          <div style={{ ...st.sub, marginTop: 8 }}>“Ride taps” counts taps on Book a ride. “Rides booked” and “Rides completed” count real VilleCabs bookings made from an event page.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {['all', 'draft', 'published', 'cancelled', 'archived'].map((k) => <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...small, background: filter === k ? C.purpleSoft : C.white, borderColor: filter === k ? C.purple : C.line }}>{k[0].toUpperCase() + k.slice(1)} ({k === 'all' ? events.length : events.filter((e) => e.status === k).length})</button>)}
          </div>
          {shown.length === 0 && <div style={{ ...st.card, ...st.sub }}>No events here yet. Create one, or import the event flyers already approved under Partners.</div>}
          {shown.map((ev) => {
            const sx = stats[ev.id] || {};
            return (
              <div key={ev.id} style={{ ...st.card, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {ev.posters[0] ? <img src={ev.posters[0]} alt="" style={{ width: 64, height: 80, objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ width: 64, height: 80, borderRadius: 8, background: C.purpleSoft }} />}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>{ev.title} {ev.featured && <Pill>Featured</Pill>} <Pill tone={STATUS_TONE[ev.status]}>{ev.status}</Pill></div>
                  <div style={st.sub}>{ev.startMs ? `${fmtDate(ev.startMs)}${ev.timeKnown ? `, ${fmtTime(ev.startMs)}` : ' (time TBC)'}` : 'No date'} · {ev.venueName || ev.address || 'No venue'} · {catLabel(ev.category)}</div>
                  <div style={{ ...st.sub, fontSize: 12 }}>{sx.views || 0} views · {Math.max(0, sx.saves || 0)} saves · {Math.max(0, sx.reminderOptIns || 0)} with reminders · {sx.rideClicks || 0} ride taps</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" style={small} onClick={() => setEditing(ev)}>Edit</button>
                  {ev.status !== 'published' && ev.status !== 'archived' && <button type="button" style={small} onClick={() => quick(ev, 'published')}>Publish</button>}
                  {ev.status === 'published' && <button type="button" style={{ ...small, color: C.red }} onClick={() => quick(ev, 'cancelled')}>Cancel event</button>}
                  {ev.status !== 'archived' && <button type="button" style={small} onClick={() => quick(ev, 'archived')}>Archive</button>}
                  <button type="button" style={small} onClick={() => setHistory(ev.id)}>History</button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
