// Live trip map: the refined, light, north-up map used while a trip is moving.
//
//   • Light VILLE style. Always north-up: the map never rotates.
//   • A slight 3D tilt when a vector Map ID is configured (REACT_APP_GOOGLE_MAP_ID).
//   • An upright car (or motorcycle for VilleDash) that never spins with each
//     turn. It glides along the road and stays on the drawn route.
//   • Only the road still ahead is drawn.
//   • The route is re-planned only when the driver has really left it (further
//     than 60 m for a couple of fixes over a few seconds), when the destination
//     changes, or every few minutes to refresh traffic. In between, the ETA is
//     worked out locally from how much of the route is left.
//   • "Pickup spot" / "Drop-off" labels, and a bottom panel ("Pickup in 4 min").
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useJsApiLoader, GoogleMap, MarkerF, PolylineF, OverlayViewF } from '@react-google-maps/api';
import {
  buildTrack, locate, pointAt, remainingPath, steadyProgress, makeDeviation,
  liveEta, fmtDistance, isTeleport, haversine, OFF_ROUTE_M, roadHeading, bearing, turn,
} from './liveRoute';

const LIBRARIES = ['places'];                    // must match App.js's loader options
const KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || '';
const MAP_ID = process.env.REACT_APP_GOOGLE_MAP_ID || '';
const TILT = 35;                                 // "slight" 3D tilt (vector maps only)
const REFRESH_MS = 3 * 60 * 1000;                // traffic/ETA refresh while on route
const MIN_GAP_MS = 8000;                         // never ask Google more often than this
const PURPLE = '#6b21a8';
const INK = '#1f1235';

// Light VILLE map style (used when no Map ID is set; a Map ID carries its own style).
export const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f4f4f7' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6f80' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#4b4560' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e1efe0' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7c9a7a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e3e4ec' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8d9c' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#ece6f7' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#ddd3ef' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#a3a5b2' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7a6f92' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e6e4ee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe1f3' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7d99b5' }] },
];

const svgUrl = (s) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(s)}`;

// Vehicles are drawn seen from directly above, nose up, then turned to face
// the direction of the road (heading in degrees, 0 = north).
const CAR_BODY = `<rect x="3" y="4" width="20" height="40" rx="7" fill="${INK}" opacity=".16"/>
<rect x="2" y="2" width="20" height="40" rx="7" fill="#fff" stroke="${PURPLE}" stroke-width="1.6"/>
<path d="M5.2 12.5c2-2 11.6-2 13.6 0l-1.3 5.2c-3.3-1-7.7-1-11 0z" fill="#2a1a4a"/>
<rect x="6.3" y="18.6" width="11.4" height="12" rx="2.6" fill="#f3eefb" stroke="#e3d8f5" stroke-width=".8"/>
<path d="M6.2 31.6c3.3.9 8.3.9 11.6 0l1 4.4c-4.2 1.2-9.4 1.2-13.6 0z" fill="#2a1a4a"/>
<rect x="4.4" y="3.6" width="3.6" height="1.8" rx=".9" fill="#f5c542"/><rect x="16" y="3.6" width="3.6" height="1.8" rx=".9" fill="#f5c542"/>
<rect x="4.6" y="39.2" width="3.4" height="1.4" rx=".7" fill="#e24b4a"/><rect x="16" y="39.2" width="3.4" height="1.4" rx=".7" fill="#e24b4a"/>`;
const MOTO_BODY = `<ellipse cx="13" cy="24" rx="7" ry="19" fill="${INK}" opacity=".14"/>
<rect x="10" y="3" width="4" height="9" rx="2" fill="#2a1a4a"/>
<path d="M3.5 12.5h17" stroke="#2a1a4a" stroke-width="2.2" stroke-linecap="round"/>
<path d="M12 9c3 0 4.6 2 4.6 5v14H7.4V14c0-3 1.6-5 4.6-5z" fill="#fff" stroke="${PURPLE}" stroke-width="1.5"/>
<ellipse cx="12" cy="21" rx="6.2" ry="4" fill="${PURPLE}"/>
<circle cx="12" cy="18.2" r="3.6" fill="#2a1a4a" stroke="#fff" stroke-width="1"/>
<rect x="5" y="27" width="14" height="13" rx="2.2" fill="#fff" stroke="${PURPLE}" stroke-width="1.6"/>
<path d="M8.5 33.5h7" stroke="${PURPLE}" stroke-width="1.4" stroke-linecap="round"/>
<rect x="10.4" y="40" width="3.2" height="4" rx="1.4" fill="#2a1a4a"/>`;
export const vehicleSvg = (kind, heading = 0) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g transform="rotate(${Math.round(heading)} 24 24) translate(${kind === 'moto' ? 12 : 11} 1)">${kind === 'moto' ? MOTO_BODY : CAR_BODY}</g></svg>`;
export const CAR_SVG = vehicleSvg('car', 0);
export const MOTO_SVG = vehicleSvg('moto', 0);

const PICKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="11.5" fill="${PURPLE}" stroke="#fff" stroke-width="3.5"/><circle cx="15" cy="15" r="3.6" fill="#fff"/></svg>`;
const DROPOFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><rect x="3" y="3" width="22" height="22" rx="4" fill="${INK}" stroke="#fff" stroke-width="3"/><rect x="10.5" y="10.5" width="7" height="7" rx="1" fill="#fff"/></svg>`;

const icon = (svg, w, h, ax, ay) => (window.google?.maps
  ? { url: svgUrl(svg), scaledSize: new window.google.maps.Size(w, h), anchor: new window.google.maps.Point(ax, ay) }
  : { url: svgUrl(svg) });

const ll = (p) => (p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) ? { lat: Number(p.lat), lng: Number(p.lng) } : null);

// Turn a DirectionsResult into a detailed lat/lng path (step-level detail, so
// the car follows curves, falling back to the overview line).
function pathFromResult(res) {
  const route = res?.routes?.[0];
  if (!route) return [];
  const toLL = (p) => (typeof p.lat === 'function' ? { lat: p.lat(), lng: p.lng() } : { lat: p.lat, lng: p.lng });
  const steps = [];
  (route.legs || []).forEach((leg) => (leg.steps || []).forEach((st) => (st.path || []).forEach((p) => steps.push(toLL(p)))));
  return steps.length > 1 ? steps : (route.overview_path || []).map(toLL);
}

function askDirections(origin, destination) {
  return new Promise((resolve) => {
    const g = window.google?.maps;
    if (!g?.DirectionsService) { resolve(null); return; }
    const svc = new g.DirectionsService();
    const base = { origin, destination, travelMode: g.TravelMode.DRIVING };
    svc.route({ ...base, drivingOptions: { departureTime: new Date(), trafficModel: g.TrafficModel ? g.TrafficModel.BEST_GUESS : 'bestguess' } }, (r, s) => {
      if (s === 'OK') resolve(r);
      else svc.route(base, (r2, s2) => resolve(s2 === 'OK' ? r2 : null));
    });
  });
}

const LABEL_BOX = {
  background: '#fff', borderRadius: 12, padding: '7px 11px', boxShadow: '0 6px 18px rgba(31,18,53,.18)',
  whiteSpace: 'nowrap', fontFamily: 'inherit', lineHeight: 1.2, position: 'relative', border: '1px solid #ece8f3',
};

function PlaceLabel({ position, title, sub }) {
  return (
    <OverlayViewF position={position} mapPaneName="floatPane" getPixelPositionOffset={(w, h) => ({ x: -w / 2, y: -h - 22 })}>
      <div style={LABEL_BOX} data-ltm-label={title}>
        <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, fontWeight: 600, color: PURPLE, marginTop: 1 }}>{sub}</div>}
        <span style={{ position: 'absolute', left: '50%', bottom: -6, width: 12, height: 12, background: '#fff', transform: 'translateX(-50%) rotate(45deg)', borderRight: '1px solid #ece8f3', borderBottom: '1px solid #ece8f3' }} />
      </div>
    </OverlayViewF>
  );
}

// Bottom panel over the map: "Pickup in 4 min".
export function TripPanel({ title, sub, right }) {
  if (!title) return null;
  return (
    <div data-ltm-panel style={{ position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 4, background: '#fff', borderRadius: 18, padding: '13px 16px', boxShadow: '0 10px 30px rgba(31,18,53,.22)', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #ece8f3' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: '-.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: '#6b6f80', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {right && <div style={{ flexShrink: 0, background: '#f3edfc', color: PURPLE, fontWeight: 700, fontSize: 13, padding: '6px 11px', borderRadius: 999 }}>{right}</div>}
    </div>
  );
}

const roundBtn = {
  position: 'absolute', zIndex: 5, background: '#fff', border: '1px solid #e3e0ea', borderRadius: 22, color: PURPLE,
  fontSize: 12.5, fontWeight: 700, padding: '8px 13px', cursor: 'pointer', boxShadow: '0 3px 10px rgba(31,18,53,.16)', fontFamily: 'inherit',
};

/**
 * Props
 *  vehicle       {lat,lng} | null   live driver / rider position
 *  vehicleKind   'car' | 'moto'
 *  pickup, dropoff {lat,lng}
 *  leg           'pickup' | 'dropoff'   where the vehicle is heading now
 *  pickupLabel, dropoffLabel  label text ("Pickup spot", "Drop-off")
 *  extraMarkers  [{ key, position, icon, title }]
 *  panel         (eta) => ({ title, sub, right }) | null
 *  onEta         (eta) => void       eta = { minutes, seconds, meters } | null
 *  height        px
 */
export default function LiveTripMap({
  vehicle = null, vehicleKind = 'car', pickup = null, dropoff = null, leg = 'pickup',
  pickupLabel = 'Pickup spot', dropoffLabel = 'Drop-off', extraMarkers = [], panel = null, onEta = null,
  height = 520, expandable = true, vehicleTitle = 'Driver',
}) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: KEY, libraries: LIBRARIES, version: 'weekly' });
  useEffect(() => {
    if (isLoaded) { window.__googleMapsLoaded = true; window.dispatchEvent(new Event('google-maps-ready')); }
  }, [isLoaded]);

  const veh = ll(vehicle);
  const pu = ll(pickup);
  const dr = ll(dropoff);
  const target = leg === 'dropoff' ? (dr || pu) : pu;
  // With no live position yet, preview the whole trip (pickup → drop-off).
  const preview = !veh && pu && dr && leg === 'pickup';
  const origin = veh || (preview ? pu : null);
  const dest = preview ? dr : target;

  const mapRef = useRef(null);
  const carRef = useRef(null);       // google.maps.Marker
  const lineRef = useRef(null);      // google.maps.Polyline (road ahead)
  const rafRef = useRef(null);
  const trackRef = useRef(null);
  const sRef = useRef(null);         // car's distance along the track (m)
  const posRef = useRef(null);       // car's drawn position
  const lastFixRef = useRef(null);
  const legInfoRef = useRef({ seconds: 0, meters: 0 });
  const routeRef = useRef({ key: null, at: 0, busy: false });
  const devRef = useRef(makeDeviation());
  const headRef = useRef(null);      // heading currently drawn
  const kindRef = useRef(vehicleKind); kindRef.current = vehicleKind;
  // Turn the vehicle to face the road. Redraw only for a visible change.
  const faceTo = (h) => {
    if (h == null || !carRef.current || !window.google?.maps) return;
    if (headRef.current != null && Math.abs(turn(headRef.current, h)) < 3) return;
    headRef.current = (h + 360) % 360;
    window.__carHeading = headRef.current;
    try { carRef.current.setIcon(icon(vehicleSvg(kindRef.current, headRef.current), 38, 38, 19, 19)); } catch (e) { /* unmounted */ }
  };
  const [routeVer, setRouteVer] = useState(0);
  const [eta, setEta] = useState(null);
  const [userMoved, setUserMoved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const progRef = useRef(false);
  const framedRef = useRef({ span: 0 });

  const routeKey = origin && dest ? `${preview ? 'preview' : leg}|${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}` : null;

  const publishEta = (e) => {
    setEta((prev) => {
      if (prev && e && prev.minutes === e.minutes && Math.abs(prev.meters - e.meters) < 50) return prev;
      return e;
    });
  };
  useEffect(() => { if (onEta) onEta(preview ? null : eta); }, [eta, preview]); // eslint-disable-line

  // ── Camera ────────────────────────────────────────────────────────────────
  const moveCamera = (fn) => {
    progRef.current = true;
    try { fn(); } catch (e) { /* map not ready */ }
    setTimeout(() => { progRef.current = false; }, 400);
  };
  const frame = () => {
    const map = mapRef.current;
    const g = window.google?.maps;
    if (!map || !g) return;
    const car = posRef.current || origin;
    const pts = [car, preview ? pu : null, dest].filter(Boolean);
    if (!pts.length) return;
    const span = pts.length > 1 ? haversine(pts[0], pts[pts.length - 1]) : 0;
    framedRef.current.span = span;
    moveCamera(() => {
      if (span < 140) { map.panTo(pts[0]); map.setZoom(17); }
      else {
        const b = new g.LatLngBounds();
        pts.forEach((p) => b.extend(p));
        map.fitBounds(b, { top: 70, right: 46, bottom: panel ? 120 : 46, left: 46 });
      }
      if (MAP_ID) { map.setHeading(0); map.setTilt(TILT); }
    });
  };
  // Keep the camera steady: only re-frame when the car or target leaves the
  // view, or the car has closed most of the gap (so we can zoom in).
  const maybeReframe = () => {
    const map = mapRef.current;
    if (!map || userMoved) return;
    const car = posRef.current;
    const b = map.getBounds && map.getBounds();
    if (!b || !car) { frame(); return; }
    const out = !b.contains(car) || (dest && !b.contains(dest));
    const gap = dest ? haversine(car, dest) : 0;
    const closer = framedRef.current.span > 300 && gap < framedRef.current.span * 0.45;
    if (out || closer) frame();
  };

  const onLoad = (map) => {
    mapRef.current = map;
    map.setCenter(origin || target || { lat: 18.0417, lng: -77.5071 });
    map.setZoom(16);
    if (MAP_ID) { map.setHeading(0); map.setTilt(TILT); }
    map.addListener('dragstart', () => setUserMoved(true));
    map.addListener('zoom_changed', () => { if (!progRef.current) setUserMoved(true); });
    setTimeout(frame, 50);
  };

  // ── Route: ask Google only when it matters ───────────────────────────────
  const fetchRoute = async (from, force = false) => {
    if ((routeRef.current.busy && !force) || !dest || !from) return;
    routeRef.current.busy = true;
    const key = routeRef.current.key;
    const res = await askDirections(from, dest);
    routeRef.current.busy = false;
    routeRef.current.at = Date.now();
    if (!res) return;                       // keep the last route on failure
    if (key !== routeRef.current.key) return;   // the trip moved on to another leg meanwhile
    const track = buildTrack(pathFromResult(res));
    if (!track) return;
    const legRes = res.routes[0].legs?.[0];
    legInfoRef.current = {
      seconds: (legRes?.duration_in_traffic || legRes?.duration)?.value || 0,
      meters: legRes?.distance?.value || track.total,
    };
    trackRef.current = track;
    devRef.current.reset();
    const at = posRef.current ? locate(track, posRef.current) : null;
    sRef.current = at && at.off <= OFF_ROUTE_M ? at.s : 0;
    if (at && at.off <= OFF_ROUTE_M) posRef.current = pointAt(track, sRef.current);
    faceTo(roadHeading(track, sRef.current));
    setRouteVer((v) => v + 1);
    publishEta(liveEta(track, sRef.current, legInfoRef.current.seconds, legInfoRef.current.meters));
  };

  // New destination / leg → plan a route straight away.
  useEffect(() => {
    if (!isLoaded || !routeKey) return;
    if (routeRef.current.key === routeKey) return;
    routeRef.current.key = routeKey;
    trackRef.current = null;
    sRef.current = null;
    setRouteVer((v) => v + 1);
    fetchRoute(origin, true).then(() => { if (!userMoved) frame(); });
  }, [isLoaded, routeKey]); // eslint-disable-line

  // ── Each GPS fix ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !veh) return undefined;
    const now = Date.now();
    const last = lastFixRef.current;
    if (last && isTeleport(last, veh, now - last.t)) return undefined;   // GPS glitch: hold
    lastFixRef.current = { ...veh, t: now };

    const track = trackRef.current;
    const at = track ? locate(track, veh, sRef.current) : null;
    const onRoute = at && at.off <= OFF_ROUTE_M;

    // Re-route only on a real deviation, or a slow refresh for traffic.
    if (track && devRef.current.update(at ? at.off : null, now) && now - routeRef.current.at > MIN_GAP_MS) fetchRoute(veh);
    else if (track && now - routeRef.current.at > REFRESH_MS) fetchRoute(veh);
    else if (!track && routeKey && !routeRef.current.busy && now - routeRef.current.at > MIN_GAP_MS) fetchRoute(veh);

    const start = posRef.current;
    let toS = null;
    let to = veh;
    if (onRoute) {
      toS = steadyProgress(sRef.current, at.s);
      to = pointAt(track, toS);
      publishEta(liveEta(track, toS, legInfoRef.current.seconds, legInfoRef.current.meters));
    }
    const fromS = sRef.current;
    sRef.current = onRoute ? toS : sRef.current;

    if (!start || !carRef.current) { posRef.current = to; if (carRef.current) { carRef.current.setPosition(to); if (onRoute) faceTo(roadHeading(track, toS)); } maybeReframe(); return undefined; }
    const dist = haversine(start, to);
    if (dist < 0.5) return undefined;
    const duration = Math.min(2000, Math.max(300, dist * 12));
    const t0 = performance.now();
    const alongRoad = onRoute && fromS != null && toS != null;
    const moveHeading = dist > 4 ? bearing(start, to) : null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;   // ease in-out
      let pos;
      if (alongRoad) {
        const s = fromS + (toS - fromS) * e;
        pos = pointAt(track, s);
        if (lineRef.current) lineRef.current.setPath(remainingPath(track, s));
        faceTo(roadHeading(track, s));
      } else {
        pos = { lat: start.lat + (to.lat - start.lat) * e, lng: start.lng + (to.lng - start.lng) * e };
        if (p === 0 || e < 0.05) faceTo(moveHeading);
      }
      posRef.current = { lat: pos.lat, lng: pos.lng };
      try { carRef.current && carRef.current.setPosition(posRef.current); } catch (err) { /* unmounted */ }
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else maybeReframe();
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isLoaded, veh?.lat, veh?.lng]); // eslint-disable-line

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const track = trackRef.current;
  const linePath = useMemo(() => {
    if (!track) return [];
    return remainingPath(track, sRef.current || 0);
  }, [track, routeVer]); // eslint-disable-line

  const carIcon = useMemo(() => (isLoaded ? icon(vehicleSvg(vehicleKind, headRef.current || 0), 38, 38, 19, 19) : null), [isLoaded, vehicleKind]);
  const puIcon = useMemo(() => (isLoaded ? icon(PICKUP_SVG, 30, 30, 15, 15) : null), [isLoaded]);
  const drIcon = useMemo(() => (isLoaded ? icon(DROPOFF_SVG, 26, 26, 13, 13) : null), [isLoaded]);

  const etaText = eta && !preview ? `${eta.minutes} min · ${fmtDistance(eta.meters)}` : null;
  const showPu = pu && (leg === 'pickup' || !dr);
  const showDr = dr && (leg === 'dropoff' || preview);
  const panelData = panel ? panel(preview ? null : eta) : null;
  const h = expanded ? '100%' : Math.min(height, typeof window !== 'undefined' ? window.innerHeight * 0.82 : height);

  const body = !isLoaded ? (
    <div style={{ height: h, background: '#eef0f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a8d9c', fontSize: 13 }}>Loading map…</div>
  ) : (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: h }}
      onLoad={onLoad}
      options={{
        ...(MAP_ID ? { mapId: MAP_ID } : { styles: LIGHT_MAP_STYLE }),
        disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy', clickableIcons: false,
        rotateControl: false, headingInteractionEnabled: false, tiltInteractionEnabled: false,
      }}
    >
      {track && (
        <>
          <PolylineF path={linePath} options={{ strokeColor: preview ? '#a78bfa' : PURPLE, strokeOpacity: 0.22, strokeWeight: 11, zIndex: 1, clickable: false }} />
          <PolylineF path={linePath} onLoad={(l) => { lineRef.current = l; }} onUnmount={() => { lineRef.current = null; }}
            options={{ strokeColor: preview ? '#a78bfa' : PURPLE, strokeOpacity: 1, strokeWeight: 5, zIndex: 2, clickable: false }} />
        </>
      )}
      {showPu && <MarkerF position={pu} icon={puIcon} title={pickupLabel} zIndex={3} />}
      {showDr && <MarkerF position={dr} icon={drIcon} title={dropoffLabel} zIndex={3} />}
      {showPu && <PlaceLabel position={pu} title={pickupLabel} sub={leg === 'pickup' ? etaText : null} />}
      {showDr && <PlaceLabel position={dr} title={dropoffLabel} sub={leg === 'dropoff' ? etaText : null} />}
      {extraMarkers.map((m, i) => <MarkerF key={m.key || i} position={m.position} icon={m.icon} title={m.title} zIndex={4} />)}
      {veh && (
        <MarkerF position={posRef.current || veh} icon={carIcon} title={vehicleTitle} zIndex={6}
          onLoad={(m) => { carRef.current = m; headRef.current = null; if (trackRef.current && sRef.current != null) faceTo(roadHeading(trackRef.current, sRef.current)); }} onUnmount={() => { carRef.current = null; }} />
      )}
    </GoogleMap>
  );

  return (
    <div data-ltm style={expanded
      ? { position: 'fixed', inset: 0, zIndex: 300, background: '#eef0f5' }
      : { position: 'relative', height: h, overflow: 'hidden' }}>
      {body}
      {expandable && (
        <button type="button" onClick={() => { setExpanded((x) => !x); setTimeout(frame, 120); }} style={{ ...roundBtn, top: 10, right: 10 }}>
          {expanded ? 'Close map' : 'Expand'}
        </button>
      )}
      {userMoved && (veh || origin) && (
        <button type="button" onClick={() => { setUserMoved(false); frame(); }} style={{ ...roundBtn, right: 12, bottom: panelData ? 96 : 16 }}>Re-centre</button>
      )}
      {panelData && <TripPanel {...panelData} />}
    </div>
  );
}
