// Shared pieces for the VilleCabs Driver screens: icons and the landing artwork.
import React from 'react';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './driver.css';
import { vehicleSvg } from '../LiveTripMap';

const P = {
  menu: <><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h16" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  rides: <><path d="M5 16h14" /><path d="M6.5 16 8 11h8l1.5 5" /><circle cx="8" cy="17.5" r="1.5" /><circle cx="16" cy="17.5" r="1.5" /><path d="M9 8h6" /></>,
  wallet: <><rect x="3.5" y="6.5" width="17" height="12" rx="2.5" /><path d="M16 12.5h2" /><path d="M3.5 9.5h17" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.4-3.4 4-5 7-5s5.6 1.6 7 5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7 7.5 6 7.5-6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  file: <><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4" /><path d="M9.5 13h5" /><path d="M9.5 16.5h5" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16" /><path d="M8.5 3.5v4" /><path d="M15.5 3.5v4" /></>,
  power: <><path d="M12 4v7" /><path d="M7.5 7a7 7 0 1 0 9 0" /></>,
  bolt: <path d="M13 3.5 6 13.5h5l-1 7 7-10h-5z" />,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  alert: <><path d="M12 4 3 19.5h18z" /><path d="M12 10v4.5" /><path d="M12 17.2v.3" /></>,
  phone: <path d="M7 4h3l1.5 4-2 1.5a10 10 0 0 0 5 5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 5 6a2 2 0 0 1 2-2z" />,
};

export function Icon({ name, size = 22, stroke = 1.9, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title}>
      {P[name]}
    </svg>
  );
}

export function Brand({ tag = true, onClick }) {
  const inner = (
    <>
      <img src="/logo.png" alt="VilleCabs" />
      <span className="dr-brand__name">VilleCabs</span>
      {tag && <span className="dr-chip">Driver</span>}
    </>
  );
  return onClick
    ? <button type="button" className="dr-brand" onClick={onClick} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>{inner}</button>
    : <div className="dr-brand">{inner}</div>;
}

// Landing artwork: a calm street map with a route to a pickup spot and the
// same top-down car customers see on the live map.
const CAR = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(vehicleSvg('car', 0))}`;
export function HeroArt() {
  return (
    <div className="dr-hero-art">
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A VilleCabs car following a route to a pickup spot">
        <rect width="400" height="300" fill="#f6f2fc" />
        <g stroke="#ffffff" strokeWidth="16" strokeLinecap="round" fill="none">
          <path d="M-20 70 H420" /><path d="M-20 205 H420" /><path d="M95 -20 V320" /><path d="M300 -20 V320" />
          <path d="M-20 300 C 90 250, 160 150, 240 120 S 380 60, 430 20" />
        </g>
        <g fill="#e9e0f6"><rect x="118" y="88" width="160" height="96" rx="14" /><rect x="320" y="88" width="90" height="96" rx="14" /><rect x="-10" y="88" width="88" height="96" rx="14" /><rect x="118" y="224" width="160" height="90" rx="14" /></g>
        <g fill="#dcefe0"><rect x="-10" y="-10" width="88" height="62" rx="14" /><rect x="320" y="224" width="90" height="90" rx="14" /></g>
        <path d="M95 236 V205 H300 V128" fill="none" stroke="#6b21a8" strokeOpacity=".18" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M95 236 V205 H300 V128" fill="none" stroke="#6b21a8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="300" cy="118" r="13" fill="#6b21a8" stroke="#fff" strokeWidth="5" />
        <circle cx="300" cy="118" r="4" fill="#fff" />
        <g transform="translate(300 76)">
          <rect x="-56" y="-19" width="112" height="34" rx="11" fill="#fff" stroke="#ebe6f2" />
          <path d="M-7 15 L0 23 L7 15 Z" fill="#fff" />
          <text x="0" y="3" textAnchor="middle" fontFamily="'Instrument Sans Variable', system-ui, sans-serif" fontSize="14" fontWeight="700" fill="#1f1235">Pickup spot</text>
        </g>
        <image href={CAR} x="72" y="205" width="46" height="46" transform="rotate(0 95 228)" />
      </svg>
    </div>
  );
}
