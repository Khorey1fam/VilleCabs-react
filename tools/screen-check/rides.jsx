// Renders the real VilleCabs ride checkout screens (from App.js) with mock Firebase.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Timestamp } from 'firebase/firestore';
import { __VehicleSelect as VehicleSelect, __BookingConfirm as BookingConfirm, __DriverLogin as DriverLogin, __DriverDash as DriverDash } from '@src/App';
import { ExtraFareRequest, ExtraFareList, ExtraFareCustomer } from '@src/RideExtras';
import { DriverLanding, DriverSiteCustomer, DriverAppBanner } from '@src/DriverSite';
import VillePublic from '@src/ville/VillePublic';
import VilleDashboard from '@src/ville/VilleDashboard';
import VilleEvents from '@src/events/VilleEvents';
import AdminEvents from '@src/events/AdminEvents';
import AdminCreators from '@src/creators/AdminCreators';
import CreatorStats from '@src/creators/CreatorStats';
import { jamaicaMs, jamaicaParts } from '@src/events/eventTime';

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
if (s && s.startsWith('extras')) put('bookings/RX', { customerId: 'cust1', driverId: 'drv1', driverName: 'Dee', fare: 1200, status: 'enroute' });
put('bookings/RX/extras/e1', { customerId: 'cust1', driverName: 'Dee', amountCents: 50000, reason: 'waiting', reasonLabel: 'Waiting time', note: '15 min at the bank', requestedBy: 'driver', status: 'pending', createdAt: Timestamp.fromMillis(Date.now() - 60000) });
put('bookings/RX/extras/e2', { customerId: 'cust1', driverName: 'Dee', amountCents: 30000, reason: 'toll', reasonLabel: 'Toll or parking', requestedBy: 'driver', status: 'approved_cash', createdAt: Timestamp.fromMillis(Date.now() - 120000) });
window.__callables = {
  rideExtraRequest: async () => ({ ok: true, extraId: 'e9' }),
  rideExtraRespond: async (d) => (d.payWith === 'card' && d.decision === 'approve' ? { ok: true, status: 'awaiting_payment', payId: `RX/${d.extraId}` } : { ok: true, status: d.decision === 'approve' ? 'approved_cash' : 'declined' }),
  payCardStart: async () => ({ url: 'https://jm.wipayfinancial.com/hosted/test-page', paymentId: 'VDTESTAAAAAAAAAA' }),
  creatorCodeCheck: async (d) => (String(d.code).toUpperCase().trim() === 'SHANICE10' ? { ok: true, code: 'SHANICE10', discountType: 'percent', discount: 10, label: '10% off' } : String(d.code).toUpperCase() === 'USEDUP' ? { ok: false, message: 'You have already used this promo code.' } : { ok: false, message: 'Invalid promo code.' }),
  creatorStats: async (d) => { if (d.token !== 'goodtoken1234567890ab') { const e = new Error('x'); e.code = 'functions/not-found'; throw e; } return { name: 'Shanice Brown', handle: 'shanicevlogs', code: 'SHANICE10', active: true, discountLabel: '10% off', payoutJmd: 200, booked: 7, completed: 5, released: 1, inProgress: 1, earnedJmd: 1000, paidJmd: 600, balanceJmd: 400, months: [{ month: '2026-10', rides: 3, earnedJmd: 600 }, { month: '2026-09', rides: 2, earnedJmd: 400 }], recent: [{ at: Date.now() - 86400e3, payoutJmd: 200, paid: false }, { at: Date.now() - 5 * 86400e3, payoutJmd: 200, paid: true }], payouts: [{ at: Date.now() - 4 * 86400e3, amountJmd: 600, rides: 3 }] }; },
  creatorSave: async (d) => ({ ok: true, id: d.id || 'CRnew', code: d.code || 'X' }),
  creatorRecordPayout: async () => ({ ok: true, amountJmd: 400, rides: 2 }),
  creatorRotateLink: async () => ({ ok: true }) };
if (s === 'admin-creators') {
  const T = (ms) => Timestamp.fromMillis(ms);
  put('creators/CR1', { name: 'Shanice Brown', handle: 'shanicevlogs', platform: 'Instagram', code: 'SHANICE10', discountType: 'percent', discount: 10, payoutJmd: 200, active: true, statsToken: 'goodtoken1234567890ab', booked: 7, completed: 5, released: 1, earnedJmd: 1000, paidJmd: 600, discountJmd: 650 });
  put('creators/CR2', { name: 'Dre Mobay', handle: 'dremobay', platform: 'TikTok', code: 'DRE300', discountType: 'fixed', discount: 300, payoutJmd: 250, active: false, statsToken: 'tok2abcdefghijklmnop', booked: 1, completed: 0, released: 0, earnedJmd: 0, paidJmd: 0, discountJmd: 0 });
  put('creator_uses/B1', { creatorId: 'CR1', code: 'SHANICE10', bookingId: 'B1', fare: 1080, fareBeforeDiscount: 1200, discountJmd: 120, payoutJmd: 200, paid: false, completedAt: T(Date.now() - 86400e3) });
  put('creator_uses/B2', { creatorId: 'CR1', code: 'SHANICE10', bookingId: 'B2', fare: 900, fareBeforeDiscount: 1000, discountJmd: 100, payoutJmd: 200, paid: true, completedAt: T(Date.now() - 5 * 86400e3) });
}
const user = { uid: 'cust1', name: 'Keneile Davis', role: 'customer', email: 'k@x.jm' };
const nav = (x) => { window.__nav = x; console.log('NAV', x); };
const pickup = { address: 'Manchester Shopping Centre, Mandeville', coords: { lat: 18.0416, lng: -77.5036 }, passengers: 1 };
const dropoff = { address: '12 Caledonia Road, Mandeville', coords: { lat: 18.03, lng: -77.51 } };
if (s && s.startsWith('driver-dash')) {
  put('drivers/drv1', { name: 'Dwayne Brown', status: 'approved', isOnline: s !== 'driver-dash-off', rating: 4.9, ratingCount: 37, vehicleMake: 'Toyota', vehicleModel: 'Axio', vehicleColor: 'Silver', licensePlate: 'PH 1234',
    docs: { license: 'u', licenseBack: 'u', fitness: 'u', registration: 'u', insurance: 'u' }, vehiclePhotoUrl: 'u' });
  const t = Date.now();
  put('bookings/C1', { driverId: 'drv1', status: 'completed', fare: 1200, customerName: 'Tanya', completedAt: Timestamp.fromMillis(t - 3600e3), createdAt: Timestamp.fromMillis(t - 3700e3), pickup: { address: 'Manchester Shopping Centre' }, dropoff: { address: 'Caledonia Road' } });
  put('bookings/C2', { driverId: 'drv1', status: 'completed', fare: 850, customerName: 'Marcus', completedAt: Timestamp.fromMillis(t - 7200e3), createdAt: Timestamp.fromMillis(t - 7300e3), pickup: { address: 'Mandeville Hospital' }, dropoff: { address: 'Ward Avenue' } });
  if (s !== 'driver-dash-off') put('bookings/R1', { status: 'searching', fare: 1450, customerName: 'Shanice Clarke', passengers: 2, distanceKm: 6.2, vehicleType: 'VilleRide', createdAt: Timestamp.fromMillis(t - 42e3), pickup: { address: 'Manchester Shopping Centre, Caledonia Road, Mandeville' }, dropoff: { address: 'Northern Caribbean University, Mandeville' } });
  put('driver_notices/n1', { audience: 'all', title: 'Busy weekend ahead', message: 'Expect more requests around town Friday evening.', createdAt: Timestamp.fromMillis(t - 5400e3), readBy: [] });
  put('driver_notices/n2', { audience: 'all', title: 'Welcome to the driver app', message: 'Add it to your home screen for the best experience.', createdAt: Timestamp.fromMillis(t - 86400e3), readBy: ['drv1'] });
}
if (s && s.startsWith('ville')) {
  const t = Date.now();
  if (s.includes('dashlive')) put('config/features', { dash: true }); else put('config/features', { dash: false, dashTesters: [] });
  put('customers/cust1', { name: 'Keneile Davis', phone: '8765550101', email: 'k@x.jm', status: 'active' });
  if (s.includes('active')) put('bookings/RA', { customerId: 'cust1', status: 'active', driverName: 'Dwayne', fare: 1300, createdAt: Timestamp.fromMillis(t - 300e3), pickup: { address: 'Manchester Shopping Centre' }, dropoff: { address: 'Northern Caribbean University, Mandeville' } });
  put('bookings/RH1', { customerId: 'cust1', status: 'completed', fare: 1200, createdAt: Timestamp.fromMillis(t - 86400e3), completedAt: Timestamp.fromMillis(t - 86000e3), pickup: { address: 'Ward Avenue' }, dropoff: { address: 'Mandeville Regional Hospital, Hargreaves Ave' } });
  put('bookings/RH2', { customerId: 'cust1', status: 'completed', fare: 850, createdAt: Timestamp.fromMillis(t - 3 * 86400e3), completedAt: Timestamp.fromMillis(t - 3 * 86400e3), pickup: { address: 'Caledonia Road' }, dropoff: { address: 'Manchester Shopping Centre' } });
  put('notifications/N1', { customerId: 'cust1', message: 'Dwayne has arrived at your pickup location!', createdAt: Timestamp.fromMillis(t - 86100e3), read: false });
}

// ── VilleEvents sample data (relative to now, Jamaica time) ──
const flyer = (bg, txt) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${bg}"/><text x="300" y="400" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">${txt}</text></svg>`)}`;
if (s && (s.startsWith('events') || s === 'ville-home-events' || s === 'admin-events')) {
  const t = Date.now(); const day = 86400e3;
  const at = (dOff, h, mi = 0) => { const p = jamaicaParts(t + dOff * day); return jamaicaMs(p.y, p.mo, p.d, h, mi); };
  const TS = (ms) => Timestamp.fromMillis(ms);
  put('ville_events/E1', { title: 'Mandeville Food Fest', description: 'Jerk, seafood and local vendors in the park.', category: 'food', startAt: TS(at(3, 18)), endAt: TS(at(3, 23)), timeKnown: true, venueName: 'Cecil Charlton Park', address: 'Park Crescent, Mandeville', lat: 18.0416, lng: -77.5054, admission: 'free', posters: [flyer('#6d28d9', 'FOOD FEST'), flyer('#9333ea', 'MENU')], featured: true, status: 'published', organizer: { name: 'Manchester Parish Council', contact: '876-555-0100', showContact: true } });
  put('ville_events/E2', { title: 'Reggae Night Live', description: 'Live band all night.', category: 'music', startAt: TS(at(10, 20)), timeKnown: true, venueName: 'Bloomfield Great House', address: 'Bloomfield, Mandeville', lat: 18.035, lng: -77.51, admission: 'paid', admissionNote: 'Pre-sold $2,000', ticketUrl: 'https://tickets.example.org/reggae', posters: [flyer('#0f766e', 'REGGAE NIGHT')], status: 'published' });
  put('ville_events/E3', { title: 'Community Clean-Up', category: 'community', startAt: TS(at(5, 12)), timeKnown: false, venueName: 'Ward Avenue', status: 'cancelled', posters: [] });
  put('ville_events/E4', { title: 'Fun Run 5K', category: 'sports', startAt: TS(at(-6, 7)), timeKnown: true, venueName: 'Manchester High', status: 'published', posters: [flyer('#b45309', '5K')] });
  put('ville_events/E5', { title: 'Hidden Draft', category: 'other', startAt: TS(at(4, 19)), timeKnown: true, status: 'draft', posters: [] });
  const p0 = jamaicaParts(at(1, 12));
  put('partnerRequests/L1', { bizType: 'Events', status: 'approved', slot: 'events', bizName: 'Old School Party', eventDate: `${p0.y}-${String(p0.mo).padStart(2, '0')}-${String(p0.d).padStart(2, '0')}`, eventTime: '9pm till', address: 'Caledonia Road', uploads: [flyer('#be123c', 'OLD SCHOOL')] });
  if (s !== 'events-guest') {
    put('event_saves/cust1_E1', { uid: 'cust1', eventId: 'E1', reminders: ['1d', '3h'], customMinutes: null, remindersOn: true, eventTitle: 'Mandeville Food Fest', eventStartMs: at(3, 18), createdAt: TS(t - day) });
    put('event_saves/cust1_E3', { uid: 'cust1', eventId: 'E3', reminders: [], remindersOn: false, eventTitle: 'Community Clean-Up', eventStartMs: at(5, 12), createdAt: TS(t - day) });
    put('customer_notifications/n1', { uid: 'cust1', type: 'event_reminder', eventId: 'E1', title: 'Mandeville Food Fest is coming up', body: 'Starts in 3 days.', read: false, createdAt: TS(t - 3600e3) });
    put('customer_notifications/n2', { uid: 'cust1', type: 'event_cancelled', eventId: 'E3', title: 'Community Clean-Up was cancelled', body: 'Your reminders have been turned off.', read: true, createdAt: TS(t - 2 * day) });
  }
  if (s === 'admin-events') put('ville_event_stats/E1', { views: 42, saves: 7, reminderOptIns: 5, remindersSent: 3, remindersFailed: 0, shares: 4, calendarAdds: 2, rideClicks: 6, ridesBooked: 2, ridesCompleted: 1 });
  if (s === 'events-detail') sessionStorage.setItem('ve_open', 'E1');
  if (s === 'events-legacy') sessionStorage.setItem('ve_open', 'pr_L1');
  window.__enablePush = params.get('push') || 'granted';
}
const setDrop = (d) => { window.__drop = d; console.log('DROP ' + JSON.stringify(d)); };
const SCREENS = {
  'creator-stats': <CreatorStats token="goodtoken1234567890ab" />,
  'creator-stats-bad': <CreatorStats token="nope" />,
  'admin-creators': <div style={{ background: '#f5f6fa', minHeight: '100vh', padding: 14 }}><AdminCreators /></div>,
  events: <VilleEvents go={nav} user={user} setDropoffData={setDrop} site="ville" enablePush={async () => window.__enablePush} onHome={() => nav('home')} />,
  'events-guest': <VilleEvents go={nav} user={null} setDropoffData={setDrop} site="ville" enablePush={async () => 'unsupported'} onHome={() => nav('home')} />,
  'events-detail': <VilleEvents go={nav} user={user} setDropoffData={setDrop} site="ville" enablePush={async () => window.__enablePush} onHome={() => nav('home')} />,
  'events-legacy': <VilleEvents go={nav} user={user} setDropoffData={setDrop} site="ville" enablePush={async () => window.__enablePush} onHome={() => nav('home')} />,
  'ville-home-events': <VilleDashboard go={nav} user={user} setBookingId={() => {}} openDelivery={nav} openOrder={nav} domains={{}} onSignOut={() => nav('signed-out')} setDropoffData={setDrop} />,
  'admin-events': <div style={{ background: '#f5f6fa', minHeight: '100vh', padding: 14 }}><AdminEvents /></div>,
  'ville-public': <VillePublic go={nav} user={null} domains={{ driver: 'driver.villecabs.com' }} />,
  'ville-home': <VilleDashboard go={nav} user={user} setBookingId={(id) => { window.__booking = id; }} openDelivery={nav} openOrder={nav} domains={{}} onSignOut={() => nav('signed-out')} />,
  'ville-home-active': <VilleDashboard go={nav} user={user} setBookingId={(id) => { window.__booking = id; }} openDelivery={nav} openOrder={nav} domains={{}} onSignOut={() => nav('signed-out')} />,
  'ville-public-dashlive': <VillePublic go={nav} user={null} domains={{}} />,
  'driver-login': <DriverLogin go={nav} user={null} setUser={() => {}} site="driver" />,
  'driver-dash-off': <DriverDash go={nav} user={{ uid: 'drv1', name: 'Dwayne Brown', role: 'driver' }} setUser={() => {}} setBookingId={() => {}} site="driver" domains={{}} />,
  'driver-dash': <DriverDash go={nav} user={{ uid: 'drv1', name: 'Dwayne Brown', role: 'driver' }} setUser={() => {}} setBookingId={() => {}} site="driver" domains={{}} />,
  'driver-landing': <DriverLanding go={nav} domains={{ cabs: 'villecabs.com' }} />,
  'driver-customer': <DriverSiteCustomer domains={{ cabs: 'villecabs.com' }} onSignOut={() => nav('signed-out')} />,
  'driver-banner': <div style={{ background: '#fff', minHeight: '100vh' }}><DriverAppBanner domains={{ driver: 'driver.villecabs.com', driverLive: true }} /><DriverAppBanner domains={{ driver: 'driver.villecabs.com', driverLive: false }} /></div>,
  choose: <VehicleSelect go={nav} user={user} pickupData={pickup} setPickupData={() => {}} dropoffData={dropoff} setBookingId={(id) => { window.__booking = id; }} />,
  'confirm-unpaid': <BookingConfirm go={nav} user={user} bookingId="RCARD" setBookingId={() => {}} pickupData={pickup} dropoffData={dropoff} />,
  'extras-driver': <div style={{ background: '#0b1020', minHeight: '100vh', padding: 14 }}><ExtraFareList bookingId="RX" theme="dark" /><ExtraFareRequest bookingId="RX" theme="dark" compact /></div>,
  'extras-customer': <div style={{ background: '#f5f6fa', minHeight: '100vh', padding: 14 }}><ExtraFareCustomer bookingId="RX" user={user} /></div>,
  'confirm-paid': <BookingConfirm go={nav} user={user} bookingId="RPAID" setBookingId={() => {}} pickupData={pickup} dropoffData={dropoff} />,
};
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  render() { return this.state.e ? <pre style={{ color: 'red' }}>CRASH: {String(this.state.e.stack)}</pre> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<Boundary>{SCREENS[s] || <div>{Object.keys(SCREENS).join(' · ')}</div>}</Boundary>);
