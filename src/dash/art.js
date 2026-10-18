// Original VilleDash illustrations, drawn in code so they load instantly and
// stay on-brand. Swap any of them for licensed photography later.
import React from 'react';

const DEEP = '#4a1990';
const BRAND = '#6b21a8';
const LAV = '#f5f0fd';
const LAV2 = '#ebe1fb';
const MID = '#cdb8f0';
const SUN = '#f4b63f';
const LEAF = '#2c8f62';
const INK = '#1d1a27';
const W = '#ffffff';

const Svg = ({ vb, label, children, ...rest }) => (
  <svg viewBox={vb} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" {...rest}>{children}</svg>
);

export function StoreArt() {
  return (
    <Svg vb="0 0 150 150">
      <rect width="150" height="150" fill={LAV} />
      <ellipse cx="75" cy="128" rx="54" ry="7" fill={LAV2} />
      {/* bag */}
      <path d="M30 56 h64 l-6 70 h-52 z" fill={DEEP} />
      <path d="M46 56 c0 -22 32 -22 32 0" stroke={DEEP} strokeWidth="6" fill="none" />
      <circle cx="62" cy="88" r="12" fill={SUN} />
      {/* produce peeking */}
      <circle cx="44" cy="52" r="10" fill={LEAF} />
      <path d="M70 50 q6 -24 18 -26 q-2 16 -12 28" fill={LEAF} />
      {/* takeaway box */}
      <g transform="translate(84 78)">
        <path d="M0 10 h44 l-6 38 h-32 z" fill={W} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M2 10 l8 -12 h24 l8 12" fill={W} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M14 -10 q4 -8 0 -14 M24 -10 q4 -8 0 -14" stroke={MID} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </Svg>
  );
}

export function EmptyRouteArt() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <path d="M18 70 C 40 30, 80 90, 100 34" stroke={MID} strokeWidth="3" strokeDasharray="5 7" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="70" r="6" fill={W} stroke={DEEP} strokeWidth="3" />
      <g transform="translate(100 34)"><path d="M0 0 C -10 -12 -12 -17 -12 -21 a12 12 0 0 1 24 0 c0 4 -2 9 -12 21 z" fill={DEEP} /><circle cx="0" cy="-21" r="4.5" fill={W} /></g>
    </svg>
  );
}

export function DoneArt() {
  return (
    <svg viewBox="0 0 180 130" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <ellipse cx="90" cy="116" rx="60" ry="8" fill={LAV2} />
      <rect x="50" y="46" width="80" height="66" rx="8" fill={DEEP} />
      <rect x="83" y="46" width="14" height="66" fill={SUN} />
      <circle cx="132" cy="44" r="24" fill={LEAF} />
      <path d="M121 44 l8 8 l15 -16" stroke={W} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Stand-in cover for stores that haven't uploaded one: an awning in VILLE purple.
// A repeating pattern, so it keeps the same scale at any width.
let coverSeq = 0;
export function StoreCoverArt() {
  const id = React.useMemo(() => `vdAwning${++coverSeq}`, []);
  return (
    <svg width="100%" height="100%" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <defs>
        <pattern id={id} width="56" height="60" patternUnits="userSpaceOnUse">
          <path d="M0 6 h28 v20 a14 14 0 0 1 -28 0z" fill={MID} />
          <path d="M28 6 h28 v20 a14 14 0 0 1 -28 0z" fill={W} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={LAV} />
      <rect width="100%" height="48" fill={`url(#${id})`} />
      <rect width="100%" height="6" fill={DEEP} />
    </svg>
  );
}
