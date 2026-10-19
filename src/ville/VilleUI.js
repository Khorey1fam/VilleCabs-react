// Shared pieces for the VILLE public homepage and signed-in home.
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './ville.css';
import { dashDb } from '../dash/dashApi';
import { vehicleSvg } from '../LiveTripMap';
import logoVille from './img/ville-logo-row.png';
import dashImg from '../dash/img/hero-800.webp';
import eventsImg from './img/events-park.webp';

export { logoVille };

const P = {
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  car: <><path d="M5 16h14" /><path d="M6.5 16 8 11h8l1.5 5" /><circle cx="8" cy="17.5" r="1.5" /><circle cx="16" cy="17.5" r="1.5" /><path d="M9 8h6" /></>,
  box: <><path d="M4 8 12 4l8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4" /><path d="M12 12v8" /></>,
  ticket: <><path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V5H4z" transform="translate(0 1)" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.4-3.4 4-5 7-5s5.6 1.6 7 5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.6" /><path d="M4 4v4h4" /><path d="M12 8v4l3 2" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4" /><path d="M12 16.8v.2" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  layers: <><path d="m12 4 8 4-8 4-8-4z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" /></>,
  phone: <><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7 7.5 6 7.5-6" /></>,
  chat: <><path d="M5 18.5V6.5A2 2 0 0 1 7 4.5h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
};
export function Icon({ name, size = 22, stroke = 1.9, label }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>{P[name]}</svg>
  );
}

// Which services are open: VilleCabs and VilleEvents are live; VilleDash follows
// the existing config/features switch (everyone → Live, testers → Preview).
export function useServiceStatus(uid) {
  const [f, setF] = useState(null);
  useEffect(() => {
    try { return onSnapshot(doc(dashDb(), 'config', 'features'), (s) => setF(s.exists() ? s.data() : {}), () => setF({})); } catch (e) { setF({}); return undefined; }
  }, []);
  const dash = !f ? 'soon' : f.dash === true ? 'live' : (uid && Array.isArray(f.dashTesters) && f.dashTesters.includes(uid)) ? 'preview' : 'soon';
  return { cabs: 'live', events: 'live', dash };
}

// Store links: shown only when an admin has saved the real listing URL.
export function useAppLinks() {
  const [links, setLinks] = useState({ android: '', ios: '' });
  useEffect(() => {
    try {
      return onSnapshot(doc(dashDb(), 'config', 'sites'), (s) => {
        const d = s.exists() ? s.data() : {};
        const ok = (u, host) => (typeof u === 'string' && u.startsWith('https://') && u.includes(host) ? u : '');
        setLinks({ android: ok(d.appAndroidUrl, 'play.google.com'), ios: ok(d.appIosUrl, 'apps.apple.com') });
      }, () => {});
    } catch (e) { return undefined; }
  }, []);
  return links;
}

export const STATUS_LABEL = { live: 'Live', preview: 'Preview', soon: 'Coming soon' };
export function StatusChip({ status }) {
  return <span className={`vl-chip vl-chip--${status}`}>{STATUS_LABEL[status]}</span>;
}

// VilleCabs artwork: a calm street map with the live-map car on its route.
const CAR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(vehicleSvg('car', 90))}`;
export function CabsArt() {
  return (
    <svg viewBox="0 0 400 275" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A VilleCabs car on its route to a pickup spot">
      <defs><linearGradient id="vlsky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3ecfd" /><stop offset="1" stopColor="#e7dcf8" /></linearGradient></defs>
      <rect width="400" height="275" fill="url(#vlsky)" />
      <g stroke="#ffffff" strokeWidth="18" strokeLinecap="round" fill="none">
        <path d="M-20 80 H420" /><path d="M-20 200 H420" /><path d="M110 -20 V300" /><path d="M300 -20 V300" />
      </g>
      <g fill="#ddd0f3"><rect x="130" y="100" width="150" height="80" rx="14" /><rect x="320" y="100" width="90" height="80" rx="14" /><rect x="-10" y="100" width="100" height="80" rx="14" /><rect x="130" y="220" width="150" height="70" rx="14" /></g>
      <g fill="#d6ecd9"><rect x="-10" y="-10" width="100" height="70" rx="14" /><rect x="320" y="-10" width="100" height="70" rx="14" /></g>
      <path d="M60 200 H300 V100" fill="none" stroke="#6b21a8" strokeOpacity=".18" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 200 H300 V100" fill="none" stroke="#6b21a8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="300" cy="92" r="14" fill="#6b21a8" stroke="#fff" strokeWidth="5" /><circle cx="300" cy="92" r="4.5" fill="#fff" />
      <image href={CAR} x="58" y="176" width="48" height="48" />
    </svg>
  );
}

export const SERVICES = [
  { key: 'cabs', brand: 'VilleCabs', title: 'Book a Ride', desc: 'Reliable local rides around Mandeville and Manchester, with live driver tracking.', short: 'Rides', icon: 'car', art: <CabsArt /> },
  { key: 'dash', brand: 'VilleDash', title: 'Send or Order', desc: 'Send packages across town and order from local stores, delivered by VilleDash riders.', short: 'Deliveries', icon: 'box', img: dashImg, alt: 'A VilleDash rider on a motorcycle delivering an order' },
  { key: 'events', brand: 'VilleEvents', title: 'Discover Events', desc: 'See what’s happening around Mandeville and book a ride straight there.', short: 'Events', icon: 'ticket', img: eventsImg, alt: 'Aerial view of a park in Mandeville' },
];

// Where each service card goes. VilleDash only opens while it is switched on
// for this person; otherwise it shows its coming-soon page with the interest form.
export function openService(key, { go, user, status }) {
  if (key === 'cabs') { go(user ? 'customer-dash' : 'customer-login'); return; }
  if (key === 'events') { go('ville-events'); return; }
  if (status.dash === 'soon') { go('dash-public'); return; }
  go(user ? 'dash-home' : 'customer-login');
}

export function ServiceMedia({ s }) {
  return s.art || <img src={s.img} alt={s.alt} loading="lazy" />;
}

// "Tell me when the app is out" — saved to the existing interest list.
export function AppInterest({ dark = true }) {
  const [v, setV] = useState('');
  const [state, setState] = useState('idle');
  const val = v.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  const isPhone = /^\+?[\d\s()-]{7,}$/.test(val);
  const submit = async (e) => {
    e.preventDefault();
    if (!isEmail && !isPhone) { setState('bad'); return; }
    setState('busy');
    try {
      await addDoc(collection(dashDb(), 'dash_interest'), { contact: val.slice(0, 120), kind: isEmail ? 'email' : 'phone', source: 'ville-app', createdAt: serverTimestamp() });
      setState('done'); setV('');
    } catch (err) { setState('error'); }
  };
  return (
    <form className="vl-interest" onSubmit={submit} style={dark ? undefined : { background: '#fff', color: 'var(--vl-ink)', borderColor: 'var(--vl-line)' }}>
      <label htmlFor="vl-interest-input">Get a message when the VILLE app is in the stores</label>
      <div className="vl-interest__row">
        <input id="vl-interest-input" className="vl-input" value={v} onChange={(e) => { setV(e.target.value); if (state !== 'busy') setState('idle'); }} placeholder="Email or phone number" autoComplete="email" />
        <button type="submit" className="vl-btn vl-btn--primary" disabled={state === 'busy'}>{state === 'busy' ? 'Saving…' : 'Notify me'}</button>
      </div>
      <div className="vl-interest__msg" role="status" style={dark ? undefined : { color: 'var(--vl-muted)' }}>
        {state === 'done' ? 'Thanks. We’ll let you know when the app is available.'
          : state === 'bad' ? 'Enter a valid email address or phone number.'
            : state === 'error' ? 'Couldn’t save that right now. Please try again.'
              : 'We’ll only use this to tell you about the VILLE app launch.'}
      </div>
    </form>
  );
}

export function StoreButtons({ links }) {
  const item = (href, store, sub) => (href
    ? <a className="vl-store" href={href} target="_blank" rel="noopener noreferrer"><Icon name="phone" /><span><small>{sub}</small><b>{store}</b></span></a>
    : <span className="vl-store" aria-label={`${store}: coming soon`}><Icon name="phone" /><span><small>Coming soon</small><b>{store}</b></span></span>);
  return (
    <div className="vl-stores">
      {item(links.android, 'Google Play', 'Get it on')}
      {item(links.ios, 'App Store', 'Download on the')}
    </div>
  );
}
