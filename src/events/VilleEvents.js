// VilleEvents: discover, save, get reminded, add to calendar, share and book a
// ride. Events come from ville_events plus approved legacy event flyers.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ville/VilleUI';
import './events.css';
import {
  useEvents, useMySaves, useInbox, useRecent, pushRecent, saveEvent, unsaveEvent, markRead, markAllRead,
  track, shareUrl, downloadIcs, googleCalUrl, directionsUrl,
} from './eventsData';
import {
  CATEGORIES, catLabel, REMINDER_OPTIONS, CUSTOM_CHOICES, allowedReminders, phase, countdown, whenLine,
  inRange, fmtLongDate, fmtTime, fmtMonth, jmDayStart, jamaicaParts, jamaicaMs, DAY, fmtDate,
} from './eventTime';

const OPEN_KEY = 've_open';
const TAB_KEY = 've_tab';
const reminderLabel = (k, cm) => (k === 'custom' ? `${cm >= 60 ? `${Math.round(cm / 60 * 10) / 10} h` : `${cm} min`} before` : (REMINDER_OPTIONS.find((o) => o.key === k) || {}).label);
const customLabel = (m) => (m < 60 ? `${m} minutes before` : m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'} before` : `${m / 60} hours before`);

// ── Small pieces ─────────────────────────────────────────────────────────────
function Poster({ ev, big }) {
  const src = ev.posters && ev.posters[0];
  if (!src) return <div className="ve-poster"><div className="ve-poster__none"><Icon name="image" size={34} />Flyer coming soon</div></div>;
  return (
    <div className="ve-poster" style={big ? { aspectRatio: 'auto' } : undefined}>
      <div className="ve-poster__bg" style={{ backgroundImage: `url("${src}")` }} aria-hidden="true" />
      <img src={src} alt={`Flyer for ${ev.title}`} loading="lazy" />
    </div>
  );
}
function SaveButton({ saved, onClick, float, title }) {
  return (
    <button type="button" className={`ve-save${float ? ' ve-save--float' : ''}`} aria-pressed={!!saved} aria-label={saved ? `Remove ${title} from saved events` : `Save ${title}`} onClick={onClick}>
      <Icon name="heart" size={20} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
function EventCard({ ev, saved, onOpen, onSave }) {
  const ph = phase(ev);
  return (
    <article className="ve-card">
      <button type="button" className="ve-card__open" onClick={() => onOpen(ev)} aria-label={`View details for ${ev.title}`}>
        <div style={{ position: 'relative' }}>
          <Poster ev={ev} />
          <div className="ve-badges">
            {ph === 'cancelled' && <span className="ve-badge ve-badge--red">Cancelled</span>}
            {ph === 'live' && <span className="ve-badge ve-badge--green">Happening now</span>}
            {ev.featured && ph !== 'cancelled' && <span className="ve-badge ve-badge--purple">Featured</span>}
            {ev.admission === 'free' && <span className="ve-badge">Free</span>}
          </div>
        </div>
        <div className="ve-card__body">
          <div className="ve-card__date">{whenLine(ev)}</div>
          <div className="ve-card__title">{ev.title}</div>
          {(ev.venueName || ev.address) && <div className="ve-card__meta"><Icon name="pin" size={15} /><span>{[ev.venueName, ev.address && ev.address !== ev.venueName ? ev.address.split(',')[0] : ''].filter(Boolean).join(' · ')}</span></div>}
          <div className="ve-card__meta"><Icon name="ticket" size={15} /><span>{catLabel(ev.category)}{ev.admission === 'paid' ? ' · Paid entry' : ev.admission === 'free' ? ' · Free entry' : ''}</span></div>
        </div>
      </button>
      <div className="ve-card__foot">
        <span className="ve-card__view">View details <Icon name="arrow" size={16} /></span>
        <SaveButton saved={saved} onClick={() => onSave(ev)} title={ev.title} />
      </div>
    </article>
  );
}
function Skeletons({ n = 4 }) {
  return <div className="ve-grid">{Array.from({ length: n }).map((_, i) => <div key={i} className="ve-skel"><div className="vl-skel" style={{ borderRadius: 0 }} /><div style={{ padding: 14, display: 'grid', gap: 8 }}><div className="vl-skel" style={{ height: 14, width: '50%' }} /><div className="vl-skel" style={{ height: 20 }} /></div></div>)}</div>;
}
function Empty({ icon = 'ticket', title, body, action, onAction }) {
  return (
    <div className="ve-empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <button type="button" className="vl-btn vl-btn--primary" onClick={onAction}>{action}</button>}
    </div>
  );
}
function Sheet({ title, sub, onClose, children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="ve-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="ve-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div className="ve-sheet__panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div><h2>{title}</h2>{sub && <p className="ve-sheet__sub">{sub}</p>}</div>
          <button type="button" className="vl-iconbtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Reminder sheet ───────────────────────────────────────────────────────────
function ReminderSheet({ ev, save, onClose, onDone }) {
  const allowed = allowedReminders(ev.timeKnown);
  const initial = save && save.remindersOn !== false && save.reminders && save.reminders.length ? save.reminders : (ev.timeKnown ? ['1d', '3h'] : ['1d']);
  const [chosen, setChosen] = useState(initial.filter((k) => allowed.includes(k)));
  const [cm, setCm] = useState((save && save.customMinutes) || 90);
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const target = ev.timeKnown ? ev.startMs : ev.startMs;
  const passed = (k) => {
    if (!ev.startMs) return true;
    const ms = k === 'custom' ? cm * 60e3 : { '1w': 7 * DAY, '1d': DAY, '3h': 3 * 3600e3, '1h': 3600e3 }[k];
    return target - ms <= now;
  };
  const toggle = (k) => setChosen((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const submit = async (on) => {
    setBusy(true);
    try { await onDone({ reminders: on ? chosen.filter((k) => !passed(k)) : [], customMinutes: cm, remindersOn: on }); } finally { setBusy(false); }
  };
  const live = phase(ev) === 'upcoming' || phase(ev) === 'tba';
  return (
    <Sheet title="Remind me" sub={`${ev.title} · ${whenLine(ev)}`} onClose={onClose}>
      {!live ? <p className="ve-note ve-note--warn" style={{ marginTop: 14 }}>This event has {phase(ev) === 'cancelled' ? 'been cancelled' : 'already started or ended'}, so reminders aren’t available.</p> : (
        <>
          <fieldset className="ve-opts" style={{ border: 0, padding: 0 }}>
            <legend className="vl-sr" style={{ position: 'absolute', left: -9999 }}>Reminder times</legend>
            {REMINDER_OPTIONS.map((o) => {
              const off = !allowed.includes(o.key);
              const gone = passed(o.key);
              return (
                <label key={o.key} className="ve-opt" data-disabled={off || gone}>
                  <input type="checkbox" checked={chosen.includes(o.key) && !off && !gone} disabled={off || gone} onChange={() => toggle(o.key)} />
                  <span style={{ flex: 1 }}>{o.label}</span>
                  {gone && !off && <small style={{ color: 'var(--vl-muted)' }}>Already passed</small>}
                  {off && <small style={{ color: 'var(--vl-muted)' }}>Needs a start time</small>}
                </label>
              );
            })}
            {allowed.includes('custom') && (
              <label className="ve-opt" data-disabled={passed('custom')}>
                <input type="checkbox" checked={chosen.includes('custom')} onChange={() => toggle('custom')} />
                <span style={{ flex: 1 }}>Custom</span>
                <select value={cm} onChange={(e) => { setCm(Number(e.target.value)); if (!chosen.includes('custom')) toggle('custom'); }} aria-label="Custom reminder time" style={{ minHeight: 36, borderRadius: 10, border: '1px solid var(--vl-line)', font: 'inherit', fontSize: 14 }}>
                  {CUSTOM_CHOICES.map((m) => <option key={m} value={m}>{customLabel(m)}</option>)}
                </select>
              </label>
            )}
          </fieldset>
          {!ev.timeKnown && <p className="ve-note">The organiser hasn’t confirmed a start time, so only day-before and week-before reminders are available.</p>}
          <p className="ve-note" style={{ marginTop: 8 }}>Reminders appear in your VilleEvents inbox. If you allow notifications, they also pop up on this device, even when VILLE is closed. All times are Jamaica time.</p>
          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <button type="button" className="vl-btn vl-btn--primary vl-btn--block" disabled={busy || chosen.filter((k) => !passed(k)).length === 0} onClick={() => submit(true)}>{busy ? 'Saving…' : 'Save reminders'}</button>
            {save && save.remindersOn !== false && (save.reminders || []).length > 0 && <button type="button" className="vl-btn vl-btn--secondary vl-btn--block" disabled={busy} onClick={() => submit(false)}>Turn reminders off</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}

function ShareSheet({ ev, onClose, toast }) {
  const url = shareUrl(ev);
  const text = `${ev.title} · ${whenLine(ev)}${ev.venueName ? ` · ${ev.venueName}` : ''}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); track(ev.id, 'share'); onClose(); } catch (e) { toast('Couldn’t copy. Press and hold the link to copy it.'); }
  };
  const native = async () => {
    try { await navigator.share({ title: ev.title, text, url }); track(ev.id, 'share'); onClose(); } catch (e) { /* cancelled */ }
  };
  return (
    <Sheet title="Share event" sub={ev.title} onClose={onClose}>
      <div className="ve-opts">
        <a className="vl-btn vl-btn--primary vl-btn--block" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => track(ev.id, 'share')}><Icon name="chat" size={20} />Share on WhatsApp</a>
        <button type="button" className="vl-btn vl-btn--secondary vl-btn--block" onClick={copy}><Icon name="link" size={20} />Copy link</button>
        {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="vl-btn vl-btn--secondary vl-btn--block" onClick={native}><Icon name="share" size={20} />More options</button>}
      </div>
      <p className="ve-note" style={{ wordBreak: 'break-all' }}>{url}</p>
    </Sheet>
  );
}

function CalendarSheet({ ev, onClose }) {
  return (
    <Sheet title="Add to calendar" sub={`${ev.title} · ${whenLine(ev)}`} onClose={onClose}>
      <div className="ve-opts">
        <a className="vl-btn vl-btn--primary vl-btn--block" href={googleCalUrl(ev)} target="_blank" rel="noopener noreferrer" onClick={() => track(ev.id, 'calendar')}><Icon name="calendar" size={20} />Google Calendar</a>
        <button type="button" className="vl-btn vl-btn--secondary vl-btn--block" onClick={() => { downloadIcs(ev); track(ev.id, 'calendar'); }}><Icon name="external" size={20} />Apple, Outlook &amp; others (.ics)</button>
      </div>
      <p className="ve-note">This adds a copy of the event to your calendar. It won’t update by itself if the organiser changes the time; VILLE will tell you about changes to events you’ve saved.{!ev.timeKnown ? ' The start time isn’t confirmed, so it’s added as an all-day event.' : !ev.endMs ? ' The end time isn’t announced, so 3 hours are blocked out.' : ''}</p>
    </Sheet>
  );
}

// ── Event detail ─────────────────────────────────────────────────────────────
function EventDetail({ ev, save, onBack, onSave, onRemind, onShare, onCalendar, onRide, user }) {
  const [img, setImg] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { window.scrollTo && window.scrollTo(0, 0); }, [ev.id]);
  const ph = phase(ev);
  const remindersOn = save && save.remindersOn !== false && (save.reminders || []).length > 0;
  const org = ev.organizer || {};
  return (
    <div>
      <button type="button" className="ve-back" onClick={onBack}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon name="arrow" size={18} stroke={2} /></span><span>Back to events</span></button>
      <div className="ve-detail">
        <div className="ve-detail__poster">
          {ev.posters.length ? (
            <>
              <button type="button" onClick={() => setZoom(true)} aria-label="Open flyer full screen"><img src={ev.posters[img]} alt={`Flyer for ${ev.title}`} /></button>
              {ev.posters.length > 1 && (
                <div className="ve-thumbs">{ev.posters.map((p, i) => <button type="button" key={p} aria-current={i === img} aria-label={`Flyer ${i + 1}`} onClick={() => setImg(i)}><img src={p} alt="" /></button>)}</div>
              )}
            </>
          ) : <Poster ev={ev} />}
        </div>
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="vl-chip vl-chip--plain">{catLabel(ev.category)}</span>
            {ph === 'cancelled' && <span className="vl-chip vl-chip--plain" style={{ background: 'var(--vl-red-l)', color: 'var(--vl-red)' }}>Cancelled</span>}
            {ev.featured && ph !== 'cancelled' && <span className="vl-chip vl-chip--plain">Featured</span>}
          </div>
          <h1>{ev.title}</h1>
          <div className={`ve-countdown${ph === 'cancelled' ? ' ve-countdown--red' : ''}`}><Icon name="clock" size={18} />{countdown(ev)}</div>

          <div className="ve-actions">
            <button type="button" className="ve-action" aria-pressed={!!save} onClick={onSave}><Icon name="heart" fill={save ? 'currentColor' : 'none'} />{save ? 'Saved' : 'Save'}</button>
            <button type="button" className="ve-action" aria-pressed={remindersOn} onClick={onRemind} disabled={ph === 'cancelled' || ph === 'past'}><Icon name="bell" />{remindersOn ? 'Reminders on' : 'Remind me'}</button>
            <button type="button" className="ve-action" onClick={onCalendar} disabled={!ev.startMs}><Icon name="calendar" />Calendar</button>
            <button type="button" className="ve-action" onClick={onShare}><Icon name="share" />Share</button>
          </div>

          {ph !== 'cancelled' && ph !== 'past' && (
            <div className="ve-ride">
              <div><b>Get there with VilleCabs</b><span>{ev.lat != null ? 'We’ll fill in the venue as your drop-off. Choose your pickup, see the fare, then book now or schedule it for later.' : 'We’ll add the venue address as your drop-off; check the pin on the map before you book.'}{ph === 'upcoming' && ev.startMs && jmDayStart(ev.startMs) > jmDayStart(Date.now()) ? ' A scheduled ride is a request; a driver accepts it closer to the time.' : ''}</span></div>
              <button type="button" className="vl-btn" onClick={onRide}><Icon name="car" size={20} />Book a ride with VilleCabs</button>
            </div>
          )}

          <div className="ve-facts">
            <div className="ve-fact"><span className="ve-fact__icon"><Icon name="calendar" size={20} /></span><div><b>{ev.startMs ? fmtLongDate(ev.startMs) : 'Date to be announced'}</b><span>{ev.startMs && ev.timeKnown ? `${fmtTime(ev.startMs)}${ev.endMs ? ` – ${fmtTime(ev.endMs)}` : ''} (Jamaica time)` : ev.timeText ? ev.timeText : 'Time not announced yet'}</span></div></div>
            {(ev.venueName || ev.address) && (
              <div className="ve-fact"><span className="ve-fact__icon"><Icon name="pin" size={20} /></span><div><b>{ev.venueName || ev.address}</b>{ev.address && ev.address !== ev.venueName && <span>{ev.address}</span>}<a href={directionsUrl(ev)} target="_blank" rel="noopener noreferrer">Directions <Icon name="external" size={13} /></a></div></div>
            )}
            <div className="ve-fact"><span className="ve-fact__icon"><Icon name="ticket" size={20} /></span><div><b>{ev.admission === 'free' ? 'Free entry' : ev.admission === 'paid' ? 'Paid entry' : 'Admission not stated'}</b>{ev.admissionNote && <span>{ev.admissionNote}</span>}{ev.ticketUrl && <a href={ev.ticketUrl} target="_blank" rel="noopener noreferrer">Tickets from the organiser <Icon name="external" size={13} /></a>}</div></div>
            {org.name && <div className="ve-fact"><span className="ve-fact__icon"><Icon name="user2" size={20} /></span><div><b>{org.name}</b><span>Organiser{org.showContact && org.contact ? ` · ${org.contact}` : ''}</span></div></div>}
          </div>
          {ev.description && <p className="ve-desc">{ev.description}</p>}
          {!user && <p className="ve-note" style={{ marginTop: 16 }}>Sign in to save this event and get reminders.</p>}
        </div>
      </div>
      {zoom && (
        <div className="ve-lightbox" role="dialog" aria-modal="true" aria-label="Flyer" onClick={() => setZoom(false)}>
          <img src={ev.posters[img]} alt={`Flyer for ${ev.title}`} />
          <button type="button" className="vl-iconbtn" style={{ color: '#fff' }} aria-label="Close" onClick={() => setZoom(false)}><Icon name="close" /></button>
        </div>
      )}
    </div>
  );
}

// ── Calendar view of saved events ────────────────────────────────────────────
function MonthCalendar({ items, onOpen }) {
  const today = jmDayStart(Date.now());
  const tp = jamaicaParts(today);
  const [ym, setYm] = useState({ y: tp.y, mo: tp.mo });
  const [sel, setSel] = useState(null);
  const first = jamaicaMs(ym.y, ym.mo, 1);
  const lead = jamaicaParts(first).dow;
  const days = new Date(Date.UTC(ym.y, ym.mo, 0)).getUTCDate();
  const byDay = useMemo(() => {
    const m = new Map();
    items.forEach((x) => { if (!x.ev.startMs) return; const k = jmDayStart(x.ev.startMs); m.set(k, [...(m.get(k) || []), x]); });
    return m;
  }, [items]);
  const move = (d) => setYm(({ y, mo }) => { const n = mo + d; return n < 1 ? { y: y - 1, mo: 12 } : n > 12 ? { y: y + 1, mo: 1 } : { y, mo: n }; });
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => jamaicaMs(ym.y, ym.mo, i + 1))];
  const list = sel ? byDay.get(sel) || [] : [];
  return (
    <div>
      <div className="ve-cal">
        <div className="ve-cal__head">
          <button type="button" className="vl-iconbtn" aria-label="Previous month" onClick={() => move(-1)} style={{ transform: 'scaleX(-1)' }}><Icon name="chevron" /></button>
          <b>{fmtMonth(first)}</b>
          <button type="button" className="vl-iconbtn" aria-label="Next month" onClick={() => move(1)}><Icon name="chevron" /></button>
        </div>
        <div className="ve-cal__grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="ve-cal__dow">{d}</div>)}
          {cells.map((ms, i) => (ms === null ? <div key={`x${i}`} className="ve-cal__day" aria-hidden="true" /> : (
            <button type="button" key={ms} className="ve-cal__day" aria-current={ms === today ? 'date' : undefined} aria-pressed={sel === ms}
              aria-label={`${fmtDate(ms)}${byDay.get(ms) ? `, ${byDay.get(ms).length} saved event${byDay.get(ms).length > 1 ? 's' : ''}` : ''}`}
              onClick={() => setSel(sel === ms ? null : ms)}>
              {jamaicaParts(ms).d}
              <span className="ve-cal__dots">{(byDay.get(ms) || []).slice(0, 3).map((x) => <i key={x.ev.id} />)}</span>
            </button>
          )))}
        </div>
      </div>
      {sel && (
        <div className="ve-list" style={{ marginTop: 12 }}>
          {list.length ? list.map((x) => <SavedRow key={x.ev.id} x={x} onOpen={onOpen} />) : <p className="ve-note">No saved events on {fmtDate(sel)}.</p>}
        </div>
      )}
    </div>
  );
}

function SavedRow({ x, onOpen, onRide, onRemind }) {
  const { ev, save } = x;
  const on = save && save.remindersOn !== false && (save.reminders || []).length > 0;
  const ph = phase(ev);
  return (
    <div className="ve-item">
      <button type="button" className="ve-item__img" onClick={() => onOpen(ev)} aria-label={`Open ${ev.title}`}>{ev.posters[0] ? <img src={ev.posters[0]} alt="" /> : <Icon name="image" />}</button>
      <button type="button" className="ve-item__main" onClick={() => onOpen(ev)}>
        <span className="ve-item__title">{ev.title}</span>
        <span className="ve-item__sub">{whenLine(ev)}</span>
        <span className="ve-item__tags">
          <span>{countdown(ev)}</span>
          {save && ph !== 'cancelled' && ph !== 'past' && <span className={on ? 'on' : 'off'}>{on ? `Reminders: ${save.reminders.map((k) => reminderLabel(k, save.customMinutes).replace(' before', '')).join(', ')}` : 'No reminders'}</span>}
        </span>
      </button>
      <div className="ve-item__side">
        {onRemind && ph !== 'cancelled' && ph !== 'past' && <button type="button" className="vl-iconbtn" aria-label={`Reminders for ${ev.title}`} onClick={() => onRemind(ev)}><Icon name="bell" size={20} /></button>}
        {onRide && ph !== 'cancelled' && ph !== 'past' && <button type="button" className="vl-iconbtn" aria-label={`Book a ride to ${ev.title}`} onClick={() => onRide(ev)}><Icon name="car" size={20} /></button>}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function VilleEvents({ go, user, setDropoffData, site, enablePush, onHome }) {
  const uid = user && user.role !== 'driver' ? user.uid : null;
  const { events, loading, error } = useEvents();
  const { saves, byEvent } = useMySaves(uid);
  const inbox = useInbox(uid);
  const recentIds = useRecent(uid);
  const [tab, setTab] = useState(() => { try { const t = sessionStorage.getItem(TAB_KEY); sessionStorage.removeItem(TAB_KEY); return t || 'discover'; } catch (e) { return 'discover'; } });
  const [openId, setOpenId] = useState(() => { try { const v = sessionStorage.getItem(OPEN_KEY); sessionStorage.removeItem(OPEN_KEY); return v; } catch (e) { return null; } });
  const [q, setQ] = useState('');
  const [when, setWhen] = useState('all');
  const [cat, setCat] = useState('all');
  const [free, setFree] = useState(false);
  const [status, setStatus] = useState('upcoming');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('all');
  const [mineView, setMineView] = useState('list');
  const [sheet, setSheet] = useState(null);         // { kind, ev }
  const [toastMsg, setToastMsg] = useState(null);
  const toastT = useRef(null);
  const toast = (msg, action) => { clearTimeout(toastT.current); setToastMsg({ msg, action }); toastT.current = setTimeout(() => setToastMsg(null), 4200); };
  useEffect(() => () => clearTimeout(toastT.current), []);

  const all = events || [];
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const open = openId ? byId.get(openId) : null;
  const viewedRef = useRef(null);
  useEffect(() => {
    if (!open || viewedRef.current === open.id) return;
    viewedRef.current = open.id;
    track(open.id, 'view');
    if (uid) pushRecent(uid, recentIds, open.id);
  }, [open, uid]); // eslint-disable-line

  const openEvent = (ev) => { setOpenId(ev.id); window.scrollTo && window.scrollTo(0, 0); };
  const unread = (inbox || []).filter((n) => !n.read).length;

  const needSignIn = () => toast('Sign in to save events and get reminders', { label: 'Sign in', fn: () => go('customer-login') });
  const toggleSave = async (ev) => {
    if (!uid) { needSignIn(); return; }
    const s = byEvent.get(ev.id);
    try {
      if (s) { await unsaveEvent(uid, ev.id); toast('Removed from saved events'); }
      else {
        await saveEvent(uid, ev, { reminders: [], remindersOn: false });
        const ph = phase(ev);
        toast('Saved to your events', ph === 'upcoming' || ph === 'tba' ? { label: 'Set reminders', fn: () => setSheet({ kind: 'remind', ev }) } : null);
      }
    } catch (e) { toast('Couldn’t update your saved events. Check your connection and try again.'); }
  };
  const doneReminders = async (ev, prefs) => {
    const existing = byEvent.get(ev.id);
    await saveEvent(uid, ev, prefs, existing);
    setSheet(null);
    if (!prefs.remindersOn || !prefs.reminders.length) { toast('Reminders turned off'); return; }
    let perm = 'unsupported';
    try { perm = enablePush ? await enablePush() : 'unsupported'; } catch (e) { perm = 'unsupported'; }
    if (perm === 'granted') toast('Reminders set. You’ll get a notification and an inbox message.');
    else if (perm === 'denied') toast('Reminders set. Notifications are blocked on this device, so they’ll appear in your VilleEvents inbox.');
    else toast('Reminders set. They’ll appear in your VilleEvents inbox.');
  };
  const remind = (ev) => { if (!uid) { needSignIn(); return; } setSheet({ kind: 'remind', ev }); };
  const bookRide = (ev) => {
    track(ev.id, 'ride_click');
    if (typeof setDropoffData === 'function') {
      const coords = ev.lat != null && ev.lng != null ? { lat: ev.lat, lng: ev.lng } : null;
      setDropoffData({ address: [ev.venueName, ev.address].filter(Boolean).join(', ') || ev.title, coords, eventId: ev.id, eventTitle: ev.title });
    }
    go(uid ? 'pin-pickup' : 'customer-login');
  };

  // ── Discover filtering (all on real data) ──
  const venues = useMemo(() => [...new Set(all.map((e) => e.venueName).filter(Boolean))].sort(), [all]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((e) => {
      const ph = phase(e);
      if (status === 'upcoming' && !(ph === 'upcoming' || ph === 'live' || ph === 'tba')) return false;
      if (status === 'cancelled' && ph !== 'cancelled') return false;
      if (status === 'past' && ph !== 'past') return false;
      if (term && !`${e.title} ${e.venueName} ${e.address} ${e.description}`.toLowerCase().includes(term)) return false;
      if (when !== 'all' && !inRange(e, when)) return false;
      if (cat !== 'all' && e.category !== cat) return false;
      if (free && e.admission !== 'free') return false;
      if (venue !== 'all' && e.venueName !== venue) return false;
      if (date) { const [y, mo, d] = date.split('-').map(Number); if (!e.startMs || jmDayStart(e.startMs) !== jamaicaMs(y, mo, d)) return false; }
      return true;
    }).sort((a, b) => (status === 'past' ? (b.startMs || 0) - (a.startMs || 0) : (a.startMs || 9e15) - (b.startMs || 9e15)));
  }, [all, q, when, cat, free, status, date, venue]);
  const filtering = q || when !== 'all' || cat !== 'all' || free || date || venue !== 'all' || status !== 'upcoming';
  const featured = all.filter((e) => e.featured && ['upcoming', 'live', 'tba'].includes(phase(e)));
  const pastCount = all.filter((e) => phase(e) === 'past').length;
  const weekend = all.filter((e) => inRange(e, 'weekend') && phase(e) !== 'past').sort((a, b) => a.startMs - b.startMs);
  const clear = () => { setQ(''); setWhen('all'); setCat('all'); setFree(false); setStatus('upcoming'); setDate(''); setVenue('all'); };

  // ── Saved / My Events ──
  const savedItems = useMemo(() => (saves || []).map((s) => {
    const ev = byId.get(s.eventId) || { id: s.eventId, title: s.eventTitle || 'Event', posters: [], startMs: s.eventStartMs || null, timeKnown: true, status: 'cancelled', category: 'other', unavailable: true };
    return { ev, save: s };
  }), [saves, byId]);
  const upcomingSaved = savedItems.filter((x) => ['upcoming', 'live', 'tba'].includes(phase(x.ev))).sort((a, b) => (a.ev.startMs || 9e15) - (b.ev.startMs || 9e15));
  const pastSaved = savedItems.filter((x) => phase(x.ev) === 'past').sort((a, b) => b.ev.startMs - a.ev.startMs);
  const cancelledSaved = savedItems.filter((x) => phase(x.ev) === 'cancelled');
  const thisWeek = upcomingSaved.filter((x) => inRange(x.ev, 'week'));
  const recent = recentIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 8);

  const signInPrompt = (what) => (
    <Empty icon="heart" title={`Sign in to see ${what}`} body="Save events to your VILLE account, get reminders and pick up where you left off on any device." action="Sign in" onAction={() => go('customer-login')} />
  );
  const grid = (list) => <div className="ve-grid">{list.map((e) => <EventCard key={e.id} ev={e} saved={byEvent.has(e.id)} onOpen={openEvent} onSave={toggleSave} />)}</div>;

  const TABS = [['discover', 'Discover'], ['weekend', 'This Weekend'], ['mine', 'My Events'], ['saved', 'Saved', (saves || []).length], ['inbox', 'Notifications', unread]];

  let body;
  if (open) {
    body = <EventDetail ev={open} save={byEvent.get(open.id)} user={uid} onBack={() => setOpenId(null)} onSave={() => toggleSave(open)} onRemind={() => remind(open)}
      onShare={() => setSheet({ kind: 'share', ev: open })} onCalendar={() => setSheet({ kind: 'cal', ev: open })} onRide={() => bookRide(open)} />;
  } else if (openId && !loading) {
    body = <Empty icon="info" title="This event isn’t available" body="It may have been removed by the organiser. Have a look at what else is on." action="Discover events" onAction={() => setOpenId(null)} />;
  } else if (tab === 'discover') {
    body = (
      <>
        <section className="ve-hero">
          <h1>Discover What’s Happening in Mandeville</h1>
          <p>Find local events, save your favourites and never miss a moment.</p>
          <div className="ve-search">
            <Icon name="search" size={20} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events or venues" aria-label="Search events or venues" />
            {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={18} /></button>}
          </div>
        </section>
        <div className="ve-chips" role="group" aria-label="When">
          {[['all', 'Any time'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'This Weekend'], ['month', 'This Month']].map(([k, l]) => <button key={k} type="button" className="ve-chip" aria-pressed={when === k} onClick={() => setWhen(k)}>{l}</button>)}
          <button type="button" className="ve-chip" aria-pressed={free} onClick={() => setFree((f) => !f)}>Free</button>
        </div>
        <div className="ve-chips" role="group" aria-label="Category" style={{ paddingTop: 6 }}>
          <button type="button" className="ve-chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All categories</button>
          {CATEGORIES.filter((c) => c.key !== 'other').map((c) => <button key={c.key} type="button" className="ve-chip" aria-pressed={cat === c.key} onClick={() => setCat(c.key)}>{c.label}</button>)}
        </div>
        <div className="ve-filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Event status"><option value="upcoming">Upcoming</option><option value="cancelled">Cancelled</option><option value="past">Past events</option></select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          {venues.length > 1 && <select value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="Venue"><option value="all">All venues</option>{venues.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
          {filtering && <button type="button" className="vl-link" onClick={clear}>Clear filters</button>}
          {!loading && <span className="ve-result" role="status">{filtered.length} event{filtered.length === 1 ? '' : 's'}</span>}
        </div>

        {loading ? <div style={{ marginTop: 24 }}><Skeletons /></div> : error ? (
          <div style={{ marginTop: 24 }}><Empty icon="info" title="We couldn’t load events" body="Check your connection and try again." action="Try again" onAction={() => window.location.reload()} /></div>
        ) : (
          <>
            {!filtering && featured.length > 0 && (
              <>
                <div className="ve-sec"><div><h2>Featured</h2><p>Picked by the VilleEvents team</p></div></div>
                <div className="ve-rail">{featured.map((e) => <EventCard key={e.id} ev={e} saved={byEvent.has(e.id)} onOpen={openEvent} onSave={toggleSave} />)}</div>
              </>
            )}
            <div className="ve-sec"><div><h2>{filtering ? 'Results' : 'Upcoming events'}</h2>{!filtering && <p>Everything coming up around Mandeville and Manchester</p>}</div></div>
            {filtered.length ? grid(filtered) : all.length === 0 ? (
              <Empty title="No events listed yet" body="New events appear here as soon as organisers publish them. Promoting an event in Mandeville?" action="Promote your event" onAction={() => go('partner-with-us')} />
            ) : <Empty icon="search" title="No events match" body="Try a different date, category or search." action="Clear filters" onAction={clear} />}
            {!filtering && pastCount > 0 && <p style={{ marginTop: 20 }}><button type="button" className="vl-link" onClick={() => setStatus('past')}>See {pastCount} past event{pastCount === 1 ? '' : 's'}</button></p>}
          </>
        )}
      </>
    );
  } else if (tab === 'weekend') {
    body = (
      <>
        <div className="ve-sec" style={{ marginTop: 6 }}><div><h2>This Weekend</h2><p>Friday to Sunday in Mandeville</p></div></div>
        {loading ? <Skeletons /> : weekend.length ? grid(weekend) : <Empty icon="calendar" title="Nothing listed for this weekend yet" body="Check back soon, or browse everything coming up." action="Discover events" onAction={() => setTab('discover')} />}
      </>
    );
  } else if (tab === 'mine') {
    body = !uid ? signInPrompt('your events') : (
      <>
        <div className="ve-sec" style={{ marginTop: 6 }}>
          <div><h2>My Events</h2><p>Your saved events, calendar and reminders</p></div>
          <div className="ve-seg" role="group" aria-label="View"><button type="button" aria-pressed={mineView === 'list'} onClick={() => setMineView('list')}>List</button><button type="button" aria-pressed={mineView === 'cal'} onClick={() => setMineView('cal')}>Calendar</button></div>
        </div>
        {saves === null ? <Skeletons n={2} /> : mineView === 'cal' ? <MonthCalendar items={savedItems} onOpen={openEvent} /> : (
          <>
            <h3 style={{ fontSize: 17, fontWeight: 750, margin: '6px 0 10px' }}>Upcoming saved events</h3>
            {upcomingSaved.length ? <div className="ve-list">{upcomingSaved.map((x) => <SavedRow key={x.ev.id} x={x} onOpen={openEvent} onRide={bookRide} onRemind={remind} />)}</div>
              : <Empty icon="heart" title="No saved events yet" body="Discover what’s happening around Mandeville and tap the heart to save an event." action="Discover events" onAction={() => setTab('discover')} />}
            <h3 style={{ fontSize: 17, fontWeight: 750, margin: '24px 0 10px' }}>This week</h3>
            {thisWeek.length ? <div className="ve-list">{thisWeek.map((x) => <SavedRow key={x.ev.id} x={x} onOpen={openEvent} onRide={bookRide} />)}</div> : <p className="ve-note">None of your saved events are in the next 7 days.</p>}
            <h3 style={{ fontSize: 17, fontWeight: 750, margin: '24px 0 10px' }}>Reminder preferences</h3>
            {upcomingSaved.length ? <div className="ve-list">{upcomingSaved.map((x) => <SavedRow key={x.ev.id} x={x} onOpen={() => remind(x.ev)} onRemind={remind} />)}</div> : <p className="ve-note">Save an upcoming event to choose when we remind you.</p>}
            <h3 style={{ fontSize: 17, fontWeight: 750, margin: '24px 0 10px' }}>Recently viewed</h3>
            {recent.length ? <div className="ve-rail">{recent.map((e) => <EventCard key={e.id} ev={e} saved={byEvent.has(e.id)} onOpen={openEvent} onSave={toggleSave} />)}</div> : <p className="ve-note">Events you open will show here.</p>}
            {pastSaved.length > 0 && (<><h3 style={{ fontSize: 17, fontWeight: 750, margin: '24px 0 10px' }}>Past events</h3><div className="ve-list">{pastSaved.map((x) => <SavedRow key={x.ev.id} x={x} onOpen={openEvent} />)}</div></>)}
          </>
        )}
      </>
    );
  } else if (tab === 'saved') {
    body = !uid ? signInPrompt('your saved events') : (
      <>
        <div className="ve-sec" style={{ marginTop: 6 }}><div><h2>Saved Events</h2><p>{(saves || []).length} saved</p></div></div>
        {saves === null ? <Skeletons n={2} /> : savedItems.length === 0 ? (
          <Empty icon="heart" title="No saved events yet" body="Tap the heart on any event to save it here and get reminders." action="Discover events" onAction={() => setTab('discover')} />
        ) : (
          <>
            {[['Upcoming', upcomingSaved, true], ['Cancelled', cancelledSaved, false], ['Past', pastSaved, false]].map(([label, list, actions]) => list.length > 0 && (
              <section key={label} style={{ marginBottom: 22 }}>
                <h3 style={{ fontSize: 17, fontWeight: 750, margin: '6px 0 10px' }}>{label}</h3>
                <div className="ve-list">{list.map((x) => (
                  <div key={x.ev.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
                    <SavedRow x={x} onOpen={x.ev.unavailable ? () => toast('This event is no longer listed.') : openEvent} onRide={actions ? bookRide : null} onRemind={actions ? remind : null} />
                    <SaveButton saved onClick={() => toggleSave(x.ev)} title={x.ev.title} />
                  </div>
                ))}</div>
              </section>
            ))}
          </>
        )}
      </>
    );
  } else {
    body = !uid ? signInPrompt('your notifications') : (
      <div className="ve-inbox">
        <div className="ve-sec" style={{ marginTop: 6 }}><div><h2>Notifications</h2><p>Event reminders and updates</p></div>{unread > 0 && <button type="button" className="vl-link" onClick={() => markAllRead(inbox)}>Mark all as read</button>}</div>
        {inbox === null ? <Skeletons n={2} /> : inbox.length === 0 ? (
          <Empty icon="bell" title="No notifications yet" body="Save an event and turn on reminders. They’ll show up here, and on your phone if you allow notifications." action="Discover events" onAction={() => setTab('discover')} />
        ) : (
          <div className="ve-list">
            {inbox.map((n) => (
              <button type="button" key={n.id} className="ve-item" style={{ textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%' }}
                onClick={() => { if (!n.read) markRead(n.id); if (n.eventId) setOpenId(n.eventId); }}>
                <span className="vl-row__icon" style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--vl-soft)', color: 'var(--vl-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="bell" size={20} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ve-item__title" style={{ whiteSpace: 'normal' }}>{n.title}</span>
                  <span className="ve-item__sub">{n.body}</span>
                  <span className="ve-item__sub" style={{ fontSize: 12.5 }}>{n.createdAt && n.createdAt.toMillis ? `${fmtDate(n.createdAt.toMillis())}, ${fmtTime(n.createdAt.toMillis())}` : 'Just now'}</span>
                </span>
                {!n.read && <span className="ve-unread" aria-label="Unread" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="vl ve">
      <header className="ve-top">
        <div className="ve-top__in">
          <button type="button" className="vl-iconbtn" aria-label="Back" onClick={() => (open || openId ? setOpenId(null) : onHome ? onHome() : go(user ? 'customer-dash' : 'splash'))} style={{ transform: 'scaleX(-1)' }}><Icon name="arrow" /></button>
          <button type="button" className="ve-brand" onClick={() => { setOpenId(null); setTab('discover'); }}><b>Ville<span>Events</span></b><small>by VilleCabs</small></button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="vl-iconbtn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => { setOpenId(null); setTab('inbox'); }}>
              <Icon name="bell" />{unread > 0 && <span className="dr-badge" style={{ position: 'absolute', top: 5, right: 4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--vl-purple)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>{unread}</span>}
            </button>
            {!uid && <button type="button" className="vl-btn vl-btn--primary vl-btn--sm" onClick={() => go('customer-login')}>Sign in</button>}
          </div>
        </div>
        {!open && (
          <nav className="ve-tabs" role="tablist" aria-label="VilleEvents">
            {TABS.map(([k, l, n]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); window.scrollTo && window.scrollTo(0, 0); }}>{l}{n ? <span className="ve-dotcount">{n}</span> : null}</button>)}
          </nav>
        )}
      </header>
      <main className="ve-wrap">{body}</main>

      {sheet && sheet.kind === 'remind' && <ReminderSheet ev={sheet.ev} save={byEvent.get(sheet.ev.id)} onClose={() => setSheet(null)} onDone={(p) => doneReminders(sheet.ev, p).catch(() => toast('Couldn’t save reminders. Try again.'))} />}
      {sheet && sheet.kind === 'share' && <ShareSheet ev={sheet.ev} onClose={() => setSheet(null)} toast={toast} />}
      {sheet && sheet.kind === 'cal' && <CalendarSheet ev={sheet.ev} onClose={() => setSheet(null)} />}
      {toastMsg && (
        <div className="ve-toast" role="status">
          <span>{toastMsg.msg}</span>
          {toastMsg.action && <button type="button" className="vl-link" style={{ color: '#d8b8ff' }} onClick={() => { setToastMsg(null); toastMsg.action.fn(); }}>{toastMsg.action.label}</button>}
        </div>
      )}
    </div>
  );
}
