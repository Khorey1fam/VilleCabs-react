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

// A courier on a motorcycle with the VilleDash box.
function Courier({ x = 0, y = 0, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* box */}
      <rect x="-6" y="-58" width="52" height="44" rx="7" fill={DEEP} />
      <rect x="-6" y="-58" width="52" height="9" rx="4" fill={SUN} />
      <text x="20" y="-23" textAnchor="middle" fontFamily="'Bricolage Grotesque Variable', sans-serif" fontWeight="800" fontSize="17" fill={W}>VD</text>
      {/* rider */}
      <path d="M58 -64 q16 -4 24 10 l10 30 h-22 z" fill={BRAND} />
      <path d="M70 -26 l20 0 l12 22 l-10 4 z" fill={INK} />
      <circle cx="74" cy="-76" r="14" fill={DEEP} />
      <path d="M78 -82 h12 a4 4 0 0 1 0 10 h-10 z" fill={MID} />
      <path d="M86 -50 l22 6" stroke={BRAND} strokeWidth="8" strokeLinecap="round" />
      {/* bike */}
      <path d="M0 -12 h70 l28 -8 h22 l10 14 l-18 10 h-104 z" fill={W} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M100 -20 l12 -26 h10" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="122" cy="-44" r="4" fill={SUN} />
      <circle cx="14" cy="10" r="18" fill={W} stroke={INK} strokeWidth="6" />
      <circle cx="116" cy="10" r="18" fill={W} stroke={INK} strokeWidth="6" />
      <circle cx="14" cy="10" r="4" fill={INK} />
      <circle cx="116" cy="10" r="4" fill={INK} />
    </g>
  );
}

function Pin({ x, y, fill = DEEP }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C -14 -16 -16 -24 -16 -30 a16 16 0 0 1 32 0 c0 6 -2 14 -16 30 z" fill={fill} />
      <circle cx="0" cy="-30" r="6" fill={W} />
    </g>
  );
}

export function HeroArt() {
  return (
    <Svg vb="0 0 500 400" preserveAspectRatio="xMidYMax slice" label="A VilleDash courier riding from a local store to a home across the Mandeville hills">
      <defs>
        <mask id="vdRouteMask">
          <path className="vd-route-reveal" d="M96 268 C 160 340, 250 345, 300 300 S 380 214, 410 200" stroke="#fff" strokeWidth="14" fill="none" strokeLinecap="round" />
        </mask>
      </defs>
      <rect width="500" height="400" fill={LAV} />
      <circle cx="330" cy="150" r="26" fill="#fbe2a6" />
      <path d="M0 238 C 80 196 170 214 250 232 S 410 196 500 214 V400 H0z" fill={LAV2} />
      <path d="M0 300 C 110 262 210 296 310 280 S 450 250 500 266 V400 H0z" fill="#e2d4f7" />
      {/* store */}
      <g transform="translate(46 198)">
        <rect x="0" y="22" width="92" height="58" rx="4" fill={W} />
        <path d="M-6 22 h104 l-8 -22 h-88 z" fill={BRAND} />
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${-6 + i * 20.8} 22 h10.4 l-3 -22 h-8 z`} fill={W} opacity=".9" />)}
        <rect x="34" y="46" width="24" height="34" rx="3" fill={DEEP} />
        <rect x="8" y="40" width="18" height="16" rx="2" fill={LAV2} />
        <rect x="66" y="40" width="18" height="16" rx="2" fill={LAV2} />
      </g>
      {/* home */}
      <g transform="translate(386 168)">
        <path d="M-6 30 L32 2 L70 30 z" fill={DEEP} />
        <rect x="2" y="30" width="60" height="44" fill={W} />
        <rect x="24" y="46" width="16" height="28" rx="2" fill={SUN} />
      </g>
      <Pin x={418} y={150} />
      {/* route */}
      <path mask="url(#vdRouteMask)" className="vd-route" d="M96 268 C 160 340, 250 345, 300 300 S 380 214, 410 200" stroke={DEEP} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="96" cy="268" r="7" fill={W} stroke={DEEP} strokeWidth="4" />
      {/* trees */}
      {[[250, 236], [272, 244], [460, 250]].map(([tx, ty], i) => (
        <g key={i} transform={`translate(${tx} ${ty})`}><rect x="-2" y="0" width="4" height="14" fill="#8a6d4a" /><circle cx="0" cy="-4" r="11" fill={LEAF} opacity=".85" /></g>
      ))}
      <g className="vd-rider-in"><Courier x={160} y={352} s={1.05} /></g>
    </Svg>
  );
}

export function ParcelArt() {
  return (
    <Svg vb="0 0 150 150">
      <rect width="150" height="150" fill={LAV} />
      <ellipse cx="75" cy="124" rx="52" ry="8" fill={LAV2} />
      <g transform="translate(22 56)">
        <rect width="70" height="64" rx="6" fill="#d9b98a" />
        <rect x="29" width="12" height="64" fill={SUN} opacity=".75" />
        <rect x="8" y="40" width="22" height="14" rx="2" fill={W} />
      </g>
      <g transform="translate(70 30) rotate(8)">
        <rect width="56" height="50" rx="6" fill={DEEP} />
        <rect x="22" width="12" height="50" fill={SUN} />
      </g>
      <g transform="translate(84 90)">
        <rect width="44" height="34" rx="5" fill={MID} />
        <path d="M0 10 h44" stroke={W} strokeWidth="3" />
      </g>
    </Svg>
  );
}

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

// Category tiles, viewBox 160×120.
const catBg = (children) => (<Svg vb="0 0 160 120"><rect width="160" height="120" fill={LAV} />{children}</Svg>);
export const CategoryArt = {
  food: () => catBg(<>
    <ellipse cx="80" cy="96" rx="50" ry="7" fill={LAV2} />
    <path d="M36 62 h88 a44 30 0 0 1 -88 0z" fill={DEEP} />
    <ellipse cx="80" cy="62" rx="44" ry="9" fill={SUN} />
    <circle cx="66" cy="58" r="6" fill="#d97b29" /><circle cx="86" cy="60" r="7" fill={LEAF} /><circle cx="98" cy="56" r="5" fill="#d97b29" />
    <path d="M66 40 q5 -9 0 -18 M80 40 q5 -9 0 -18 M94 40 q5 -9 0 -18" stroke={MID} strokeWidth="3" fill="none" strokeLinecap="round" />
  </>),
  groceries: () => catBg(<>
    <ellipse cx="80" cy="100" rx="48" ry="6" fill={LAV2} />
    <path d="M48 46 h64 l-6 54 h-52 z" fill={W} stroke={DEEP} strokeWidth="3" />
    <rect x="58" y="22" width="16" height="34" rx="6" fill="#e2a65a" />
    <circle cx="90" cy="38" r="12" fill={LEAF} /><path d="M100 28 q10 -10 16 -4" stroke={LEAF} strokeWidth="4" fill="none" />
    <circle cx="70" cy="48" r="9" fill="#d94b3b" />
    <rect x="58" y="66" width="44" height="6" rx="3" fill={LAV2} />
  </>),
  convenience: () => catBg(<>
    <ellipse cx="80" cy="100" rx="48" ry="6" fill={LAV2} />
    <rect x="48" y="30" width="22" height="70" rx="8" fill={BRAND} /><rect x="54" y="20" width="10" height="12" rx="2" fill={DEEP} />
    <rect x="50" y="56" width="18" height="16" fill={SUN} />
    <path d="M80 50 h40 l-4 50 h-32 z" fill={W} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    <path d="M86 50 l4 -10 h20 l4 10" fill="#e9d07b" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
  </>),
  shops: () => catBg(<>
    <rect x="34" y="44" width="92" height="56" rx="3" fill={W} />
    <path d="M28 44 h104 l-8 -20 h-88 z" fill={DEEP} />
    {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${28 + i * 20.8} 44 h10.4 l-2.5 -20 h-8 z`} fill={W} opacity=".9" />)}
    <rect x="70" y="64" width="22" height="36" rx="2" fill={BRAND} />
    <rect x="42" y="58" width="20" height="18" rx="2" fill={LAV2} /><rect x="100" y="58" width="18" height="18" rx="2" fill={LAV2} />
    <circle cx="88" cy="83" r="2" fill={SUN} />
  </>),
  gifts: () => catBg(<>
    <ellipse cx="80" cy="102" rx="44" ry="6" fill={LAV2} />
    <rect x="46" y="54" width="68" height="46" rx="5" fill={DEEP} />
    <rect x="42" y="42" width="76" height="16" rx="4" fill={BRAND} />
    <rect x="74" y="42" width="12" height="58" fill={SUN} />
    <path d="M80 42 c-14 -20 -32 -6 -18 0 z M80 42 c14 -20 32 -6 18 0 z" fill={SUN} />
  </>),
  packages: () => catBg(<>
    <ellipse cx="80" cy="102" rx="50" ry="6" fill={LAV2} />
    <rect x="40" y="46" width="62" height="56" rx="5" fill="#d9b98a" />
    <rect x="65" y="46" width="12" height="56" fill={SUN} opacity=".8" />
    <rect x="86" y="30" width="38" height="34" rx="5" fill={DEEP} transform="rotate(10 105 47)" />
    <rect x="48" y="80" width="18" height="12" rx="2" fill={W} />
  </>),
};

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
