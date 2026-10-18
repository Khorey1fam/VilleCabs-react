// Renders the real VilleCabs ride checkout screens (from App.js) with mock Firebase.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Timestamp } from 'firebase/firestore';
import { __VehicleSelect as VehicleSelect, __BookingConfirm as BookingConfirm } from '@src/App';

// Minimal Google Maps stand-in (the real script isn't loaded here).
window.google = { maps: {
  TravelMode: { DRIVING: 'DRIVING' }, LatLng: class { constructor(a, b) { this.a = a; this.b = b; } },
  DirectionsService: class { route(req, cb) { const r = Promise.resolve({ routes: [{ legs: [{ distance: { value: 4200 }, duration: { value: 600 } }] }] }); if (cb) cb(null, 'ZERO_RESULTS'); return r; } },
  DistanceMatrixService: class { getDistanceMatrix(req, cb) { if (cb) cb(null, 'ERROR'); return Promise.reject(new Error('no')); } },
  Geocoder: class { geocode(req, cb) { if (cb) cb([], 'ZERO_RESULTS'); return Promise.resolve({ results: [] }); } },
} };
const S = window.__store; const put = (p, d) => S.set(p, d);
const params = new URLSearchParams(location.search);
const s = params.get('s');
if (params.get('card')) put('config/payments', { cardTesters: ['cust1'], environment: 'sandbox' });
put('customers/cust1', { name: 'Keneile Davis', phone: '8765550101', email: 'k@x.jm', status: 'active' });
put('drivers/drv1', { name: 'Dee', status: 'approved', isOnline: true });
put('bookings/RCARD', { customerId: 'cust1', fare: 1250, vehicleType: 'VilleRide', status: 'awaiting_payment', paymentMethod: 'Card', payment: { method: 'card', status: 'pending', lastError: '[N-R05]: Declined.' }, pickup: { address: 'Manchester Shopping Centre' }, dropoff: { address: 'Caledonia Road' }, createdAt: Timestamp.fromMillis(Date.now()) });
if (s === 'confirm-paid') put('bookings/RPAID', { customerId: 'cust1', fare: 1250, vehicleType: 'VilleRide', status: 'searching', paymentMethod: 'Card', payment: { method: 'card', status: 'paid' }, pickup: { address: 'Manchester Shopping Centre' }, dropoff: { address: 'Caledonia Road' }, createdAt: Timestamp.fromMillis(Date.now()) });
window.__callables = { payCardStart: async () => ({ url: 'https://jm.wipayfinancial.com/hosted/test-page', paymentId: 'VDTESTAAAAAAAAAA' }) };
const user = { uid: 'cust1', name: 'Keneile Davis', role: 'customer', email: 'k@x.jm' };
const nav = (x) => { window.__nav = x; console.log('NAV', x); };
const pickup = { address: 'Manchester Shopping Centre, Mandeville', coords: { lat: 18.0416, lng: -77.5036 }, passengers: 1 };
const dropoff = { address: '12 Caledonia Road, Mandeville', coords: { lat: 18.03, lng: -77.51 } };
const SCREENS = {
  choose: <VehicleSelect go={nav} user={user} pickupData={pickup} setPickupData={() => {}} dropoffData={dropoff} setBookingId={(id) => { window.__booking = id; }} />,
  'confirm-unpaid': <BookingConfirm go={nav} user={user} bookingId="RCARD" setBookingId={() => {}} pickupData={pickup} dropoffData={dropoff} />,
  'confirm-paid': <BookingConfirm go={nav} user={user} bookingId="RPAID" setBookingId={() => {}} pickupData={pickup} dropoffData={dropoff} />,
};
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() { return this.state.e ? <pre style={{ color: 'red' }}>CRASH: {String(this.state.e.stack)}</pre> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<Boundary>{SCREENS[s] || <div>{Object.keys(SCREENS).join(' · ')}</div>}</Boundary>);
