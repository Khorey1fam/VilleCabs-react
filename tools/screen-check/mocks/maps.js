// Stand-in for @react-google-maps/api. By default nothing loads (isLoaded=false),
// like before. When a page sets window.__fakeMaps = true, a small fake map is
// drawn instead (Web-Mercator projection onto a plain div) so the live trip map
// can be exercised and screenshotted without Google.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const fake = () => typeof window !== 'undefined' && !!window.__fakeMaps;
export const useJsApiLoader = () => ({ isLoaded: fake(), loadError: null });
export const Marker = () => null;
export const DirectionsRenderer = () => null;

const Cam = createContext(null);
const TILE = 256;
const world = (p) => {
  const s = Math.sin((p.lat * Math.PI) / 180);
  return { x: TILE * (0.5 + p.lng / 360), y: TILE * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) };
};
const unworld = (x, y) => {
  const n = Math.PI - (2 * Math.PI * y) / TILE;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: (x / TILE - 0.5) * 360 };
};
const toLL = (p) => (typeof p.lat === 'function' ? { lat: p.lat(), lng: p.lng() } : p);

export function GoogleMap({ children, mapContainerStyle, onLoad }) {
  const ref = useRef(null);
  const [cam, setCam] = useState({ center: { lat: 18.04, lng: -77.5 }, zoom: 15, w: 390, h: 500 });
  const camRef = useRef(cam); camRef.current = cam;
  const listeners = useRef({});
  const map = useMemo(() => {
    const px = (p, c = camRef.current) => {
      const k = 2 ** c.zoom; const a = world(p); const o = world(c.center);
      return { x: (a.x - o.x) * k + c.w / 2, y: (a.y - o.y) * k + c.h / 2 };
    };
    const m = {
      px,
      setCenter: (c) => setCam((x) => ({ ...x, center: toLL(c) })),
      panTo: (c) => setCam((x) => ({ ...x, center: toLL(c) })),
      setZoom: (z) => { setCam((x) => ({ ...x, zoom: z })); (listeners.current.zoom_changed || []).forEach((f) => f()); },
      getZoom: () => camRef.current.zoom,
      setTilt: (t) => { window.__tilt = t; }, setHeading: (h) => { window.__heading = h; },
      addListener: (n, f) => { (listeners.current[n] = listeners.current[n] || []).push(f); return { remove() {} }; },
      fitBounds: (b, pad) => {
        const c = camRef.current; const pd = typeof pad === 'number' ? { top: pad, bottom: pad, left: pad, right: pad } : pad || {};
        const ne = world(b.ne), sw = world(b.sw);
        const W = c.w - (pd.left || 0) - (pd.right || 0), H = c.h - (pd.top || 0) - (pd.bottom || 0);
        const dx = Math.max(1e-9, Math.abs(ne.x - sw.x)), dy = Math.max(1e-9, Math.abs(ne.y - sw.y));
        const zoom = Math.min(18, Math.floor(Math.log2(Math.min(W / dx, H / dy)) * 4) / 4);
        const k = 2 ** zoom;
        const cx = (ne.x + sw.x) / 2 + ((pd.right || 0) - (pd.left || 0)) / 2 / k;
        const cy = (ne.y + sw.y) / 2 + ((pd.bottom || 0) - (pd.top || 0)) / 2 / k;
        setCam((x) => ({ ...x, zoom, center: unworld(cx, cy) }));
        (listeners.current.zoom_changed || []).forEach((f) => f());
      },
      getBounds: () => {
        const c = camRef.current; const k = 2 ** c.zoom; const o = world(c.center);
        const nw = unworld(o.x - c.w / 2 / k, o.y - c.h / 2 / k), se = unworld(o.x + c.w / 2 / k, o.y + c.h / 2 / k);
        return { contains: (p) => { const q = toLL(p); return q.lat <= nw.lat && q.lat >= se.lat && q.lng >= nw.lng && q.lng <= se.lng; } };
      },
      __drag: () => (listeners.current.dragstart || []).forEach((f) => f()),
    };
    return m;
  }, []);
  useEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setCam((x) => ({ ...x, w: r.width, h: r.height }));
    window.__map = map;
    if (onLoad) onLoad(map);
  }, []); // eslint-disable-line
  return (
    <div ref={ref} data-mock="gmap" style={{ ...mapContainerStyle, position: 'relative', overflow: 'hidden', background: '#f4f4f7',
      backgroundImage: 'linear-gradient(#fff 2px, transparent 2px), linear-gradient(90deg, #fff 2px, transparent 2px)', backgroundSize: '64px 64px' }}>
      <Cam.Provider value={{ map, cam }}>{children}</Cam.Provider>
    </div>
  );
}

const sizeOf = (s, d) => (s && s.w ? { w: s.w, h: s.h } : d);
export function MarkerF({ position, icon, title, onLoad, onUnmount, zIndex }) {
  const { map } = useContext(Cam);
  const [pos, setPos] = useState(position);
  useEffect(() => { setPos(position); }, [position && position.lat, position && position.lng]); // eslint-disable-line
  useEffect(() => {
    const obj = { setPosition: (p) => setPos(toLL(p)), getPosition: () => pos };
    if (onLoad) onLoad(obj);
    return () => { if (onUnmount) onUnmount(obj); };
  }, []); // eslint-disable-line
  if (!pos) return null;
  const p = map.px(pos);
  if (!icon || !icon.url) {
    return <div data-marker={title} style={{ position: 'absolute', left: p.x - 8, top: p.y - 8, width: 16, height: 16, borderRadius: 8, background: '#2563eb', border: '3px solid #fff', zIndex }} />;
  }
  const s = sizeOf(icon.scaledSize, { w: 32, h: 32 });
  const a = icon.anchor || { x: s.w / 2, y: s.h / 2 };
  return <img alt="" data-marker={title} data-lat={pos.lat} data-lng={pos.lng} src={icon.url} style={{ position: 'absolute', left: p.x - a.x, top: p.y - a.y, width: s.w, height: s.h, zIndex: 10 + (zIndex || 0) }} />;
}

export function PolylineF({ path, options = {}, onLoad, onUnmount }) {
  const { map } = useContext(Cam);
  const [pts, setPts] = useState(path || []);
  useEffect(() => { setPts(path || []); }, [path]);
  useEffect(() => {
    const obj = { setPath: (p) => setPts(p.map(toLL)) };
    if (onLoad) onLoad(obj);
    return () => { if (onUnmount) onUnmount(obj); };
  }, []); // eslint-disable-line
  const d = pts.map((q) => { const p = map.px(q); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  return (
    <svg data-polyline={options.strokeWeight} data-points={pts.length} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: options.zIndex || 1, pointerEvents: 'none' }}>
      <polyline points={d} fill="none" stroke={options.strokeColor} strokeOpacity={options.strokeOpacity} strokeWidth={options.strokeWeight} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OverlayViewF({ position, children, getPixelPositionOffset }) {
  const { map } = useContext(Cam);
  const ref = useRef(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (ref.current && getPixelPositionOffset) { const r = ref.current.getBoundingClientRect(); setOff(getPixelPositionOffset(r.width, r.height)); }
  }, []); // eslint-disable-line
  if (!fake()) return <div data-mock="overlay">{children}</div>;
  const p = map.px(position);
  return <div ref={ref} style={{ position: 'absolute', left: p.x + off.x, top: p.y + off.y, zIndex: 30 }}>{children}</div>;
}
