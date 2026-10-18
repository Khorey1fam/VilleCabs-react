// Pure route geometry for the live trip map. No Google or React here, so it can
// be unit-tested in Node.
//
// A "track" is a route path with the running distance along it. The car's GPS
// point is projected onto the track, which gives:
//   s    — how far along the route the car is (metres)
//   off  — how far the GPS point is from the route (metres)
// From those we draw only the road still ahead, glide the car along the road
// (not in a straight line across corners), work out a live ETA without asking
// Google again, and decide when the driver has really left the route.

export const OFF_ROUTE_M = 60;          // further than this from the line = off route
export const OFF_ROUTE_FIXES = 2;       // ...for this many GPS fixes in a row
export const OFF_ROUTE_MS = 4000;       // ...spanning at least this long
export const BACKTRACK_HOLD_M = 40;     // ignore GPS jitter that looks like going backwards

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const clean = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null);

export function buildTrack(path) {
  const pts = [];
  (path || []).forEach((p) => {
    const c = clean(p);
    if (!c) return;
    const last = pts[pts.length - 1];
    if (last && haversine(last, c) < 0.3) return;   // drop duplicates
    pts.push(c);
  });
  if (pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1] };
}

// Project p onto segment a→b in a local flat frame (fine at street scale).
function project(p, a, b) {
  const kx = Math.cos(rad(a.lat)) * 111320;
  const ky = 110540;
  const bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * ky;
  const px = (p.lng - a.lng) * kx, py = (p.lat - a.lat) * ky;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  const dx = px - bx * t, dy = py - by * t;
  return { t, off: Math.sqrt(dx * dx + dy * dy), lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// Nearest point on the track. `near` (a previous s) keeps the search local so a
// route that doubles back on itself doesn't make the car jump to the other side.
export function locate(track, p, near = null) {
  if (!track || !clean(p)) return null;
  let best = null;
  for (let i = 0; i < track.pts.length - 1; i += 1) {
    const segS = track.cum[i];
    if (near != null && (track.cum[i + 1] < near - 400 || segS > near + 800)) continue;
    const q = project(p, track.pts[i], track.pts[i + 1]);
    if (!best || q.off < best.off) best = { ...q, idx: i, s: segS + (track.cum[i + 1] - segS) * q.t };
  }
  if (!best && near != null) return locate(track, p, null);
  return best;
}

export function pointAt(track, s) {
  if (!track) return null;
  const x = Math.max(0, Math.min(track.total, s));
  let i = 0;
  while (i < track.cum.length - 2 && track.cum[i + 1] < x) i += 1;
  const seg = track.cum[i + 1] - track.cum[i];
  const t = seg > 0 ? (x - track.cum[i]) / seg : 0;
  const a = track.pts[i], b = track.pts[i + 1];
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, idx: i };
}

// The part of the route still ahead of the car.
export function remainingPath(track, s) {
  if (!track) return [];
  const here = pointAt(track, s);
  return [{ lat: here.lat, lng: here.lng }, ...track.pts.slice(here.idx + 1)];
}

// Keep the car moving forward only. Small "backwards" moves are GPS noise; a
// real turnaround shows up as leaving the route and triggers a re-route.
export function steadyProgress(prevS, nextS) {
  if (prevS == null) return nextS;
  if (nextS >= prevS) return nextS;
  return prevS - nextS < BACKTRACK_HOLD_M ? prevS : nextS;
}

// Off-route detector. One stray fix never re-routes; a driver who has really
// turned onto another road for a few seconds does.
export function makeDeviation() {
  let count = 0;
  let since = 0;
  return {
    update(off, now = Date.now()) {
      if (off == null || off <= OFF_ROUTE_M) { count = 0; since = 0; return false; }
      if (!count) since = now;
      count += 1;
      return count >= OFF_ROUTE_FIXES && now - since >= OFF_ROUTE_MS;
    },
    reset() { count = 0; since = 0; },
  };
}

// Live ETA from the last Google answer, scaled by the share of the route left.
export function liveEta(track, s, legSeconds, legMeters) {
  if (!track || !legSeconds) return null;
  const left = Math.max(0, track.total - (s || 0));
  const share = track.total > 0 ? left / track.total : 0;
  const seconds = Math.round(legSeconds * share);
  const meters = Math.round((legMeters || track.total) * share);
  return { seconds, minutes: Math.max(1, Math.ceil(seconds / 60)), meters };
}

export function fmtDistance(m) {
  if (m == null) return '';
  if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

// Speed check for GPS teleports (a big jump at an impossible speed).
export function isTeleport(prev, next, dtMs) {
  if (!prev) return false;
  const d = haversine(prev, next);
  return d > 150 && d / Math.max(0.5, dtMs / 1000) > 60;
}
