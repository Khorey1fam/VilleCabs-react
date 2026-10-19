// Live trip map harness: real LiveTripMap on a fake map + scripted Directions.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LiveTripMap from '@src/LiveTripMap';
import { fmtDistance } from '@src/liveRoute';
import { riderLeg, riderPanel } from '@src/dash/DeliveryTrack';

window.__fakeMaps = true;
window.__dirCalls = [];
const P = (lat, lng) => ({ lat: () => lat, lng: () => lng });
// Directions: an L-shaped road — east along the origin's latitude, then north/south.
function route(o, d) {
  const corner = { lat: o.lat, lng: d.lng };
  const pts = [];
  const seg = (a, b, n) => { for (let i = 0; i < n; i += 1) pts.push(P(a.lat + (b.lat - a.lat) * (i / n), a.lng + (b.lng - a.lng) * (i / n))); };
  seg(o, corner, 20); seg(corner, d, 20); pts.push(P(d.lat, d.lng));
  const R = 6371000, rad = Math.PI / 180;
  const m = Math.abs(d.lng - o.lng) * rad * R * Math.cos(o.lat * rad) + Math.abs(d.lat - o.lat) * rad * R;
  return { routes: [{ legs: [{ distance: { value: Math.round(m) }, duration: { value: Math.round(m / 8) }, steps: [{ path: pts }] }], overview_path: pts }] };
}
window.google = { maps: {
  TravelMode: { DRIVING: 'DRIVING' }, TrafficModel: { BEST_GUESS: 'bestguess' },
  Size: class { constructor(w, h) { this.w = w; this.h = h; } },
  Point: class { constructor(x, y) { this.x = x; this.y = y; } },
  LatLngBounds: class { constructor() { this.ne = null; this.sw = null; }
    extend(p) { const q = { lat: p.lat, lng: p.lng }; this.ne = this.ne ? { lat: Math.max(this.ne.lat, q.lat), lng: Math.max(this.ne.lng, q.lng) } : q; this.sw = this.sw ? { lat: Math.min(this.sw.lat, q.lat), lng: Math.min(this.sw.lng, q.lng) } : q; return this; } },
  DirectionsService: class { route(req, cb) { window.__dirCalls.push({ o: req.origin, d: req.destination, at: Date.now() }); setTimeout(() => cb(route(req.origin, req.destination), 'OK'), 30); } },
} };

const pickup = { lat: 18.0416, lng: -77.5036 };
const dropoff = { lat: 18.0300, lng: -77.4950 };
const start = { lat: 18.0480, lng: -77.5120 };
const s = new URLSearchParams(location.search).get('s') || 'ride';

function App() {
  const [veh, setVeh] = useState(s === 'preview' ? null : start);
  const [leg, setLeg] = useState('pickup');
  const [status, setStatus] = useState('to_pickup');
  useEffect(() => { window.__setVeh = setVeh; window.__setLeg = setLeg; window.__setStatus = setStatus; }, []);
  if (s === 'dash') {
    return <div style={{ padding: 12, background: '#f7f5fb', minHeight: '100vh' }}>
      <LiveTripMap height={340} vehicleKind="moto" vehicleTitle="Rider" vehicle={veh} pickup={pickup} dropoff={dropoff}
        leg={riderLeg(status)} pickupLabel="Juici Patties" dropoffLabel="You" panel={(eta) => riderPanel(status, eta, true)} />
    </div>;
  }
  return <div style={{ background: '#f7f5fb', minHeight: '100vh' }}>
    <LiveTripMap height={620} vehicle={veh} vehicleTitle="Your driver" pickup={pickup} dropoff={dropoff} leg={leg}
      panel={(eta) => (!veh ? { title: 'Finding your driver…', sub: 'We’ll show your driver here once they accept.' }
        : leg === 'dropoff' ? { title: eta ? `Arriving in ${eta.minutes} min` : 'On the way', sub: 'Drop-off around 3:42 PM', right: eta ? fmtDistance(eta.meters) : null }
          : { title: eta ? `Pickup in ${eta.minutes} min` : 'Driver on the way', sub: 'Dee is heading to you', right: eta ? fmtDistance(eta.meters) : null })} />
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
