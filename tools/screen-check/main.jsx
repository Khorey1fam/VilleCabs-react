import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Timestamp } from 'firebase/firestore';
import { VilleHome } from '@src/dash/CustomerScreens';
import { DashHome, DashPublic } from '@src/dash/Home';
import { MyOrders } from '@src/dash/Orders';
import { DashAbout, DashTerms } from '@src/dash/Info';
import SendPackage from '@src/dash/SendPackage';
import DeliveryTrack from '@src/dash/DeliveryTrack';
import { StoresList, StorePage, Cart, Checkout, OrderTrack } from '@src/dash/Marketplace';
import RiderPortal from '@src/dash/RiderPortal';
import MerchantPortal from '@src/dash/MerchantPortal';
import AdminDashTab from '@src/dash/AdminDash';
import { SiteLanding } from '@src/dash/sites';
import { PaymentReturn } from '@src/dash/Payments';
import { PaymentsTab } from '@src/dash/AdminPayments';
import { AddressAutocompleteInput, VilleMap, geocodeLatLng } from './mocks/appshell';

const H = 3600000; const T = (ms) => Timestamp.fromMillis(ms); const now = Date.now();
const jmDate = (ms) => new Date(ms - 5 * H).toISOString().slice(0, 10);
const S = window.__store;
const put = (p, d) => S.set(p, d);
const ALL = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { open: '00:00', close: '00:00' }]));
const PICK = { address: 'Manchester Shopping Centre, Mandeville', lat: 18.0416, lng: -77.5036, contactName: 'Keneile Davis', contactPhone: '8765550101', landmark: 'Beside KFC', instructions: 'Call on arrival' };
const DROP = { address: '12 Caledonia Road, Mandeville', lat: 18.03, lng: -77.51, recipientName: 'Tasha Brown', recipientPhone: '8765550202', landmark: 'Green gate', instructions: '' };

// ── Sample data ──────────────────────────────────────────────────────────────
put('config/features', { dash: true });
put('customers/cust1', { name: 'Keneile Davis', phone: '8765550101' });
put('riders/riderA', { name: 'Andre Campbell', phone: '8765550404', email: 'andre@x.jm', status: 'approved', isOnline: true, motorcycleId: 'bike1', motorcyclePlate: 'AB1234', licenceNumber: 'L123', emergencyContact: { name: 'Mom', phone: '876555' }, completedCount: 12 });
put('riders/riderB', { name: 'Brian Lewis', phone: '8765550505', status: 'approved', isOnline: true, motorcycleId: 'bike2', motorcyclePlate: 'CD5678', activeDeliveryId: 'D2' });
put('riders/riderP', { name: 'Pat Pending', phone: '8765550606', status: 'pending', isOnline: false, licenceNumber: 'L999', emergencyContact: { name: 'Dad', phone: '876' } });
put('fleet_providers/prov1', { name: 'Island Bikes Ltd', contactName: 'Mr Grant', phone: '876-555-7777', ratePerBikeCents: 1500000, ratePeriod: 'week' });
put('fleet_motorcycles/bike1', { plate: 'AB1234', make: 'Honda', model: 'CG125', colour: 'Red', year: 2022, providerId: 'prov1', status: 'assigned', assignedRiderId: 'riderA', assignedRiderName: 'Andre Campbell', insuranceExpiry: jmDate(now + 10 * 24 * H), mileageKm: 12040 });
put('fleet_motorcycles/bike2', { plate: 'CD5678', make: 'Honda', model: 'CG125', status: 'assigned', assignedRiderId: 'riderB', assignedRiderName: 'Brian Lewis', providerId: 'prov1' });
put('fleet_motorcycles/bike3', { plate: 'EF9012', make: 'Bajaj', model: 'Boxer', status: 'maintenance', statusNote: 'Brake pads', providerId: 'prov1' });
const quote = { lines: [{ key: 'base', label: 'Base delivery', cents: 30000 }, { key: 'distance', label: 'Distance (2.1 km)', cents: 12600 }, { key: 'minimum', label: 'Minimum charge adjustment', cents: 7400 }], totalCents: 50000, distanceKm: 2.1, pricingPlaceholder: true };
put('dash_deliveries/D1', { type: 'parcel', customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '8765550101', pickup: PICK, dropoff: DROP, package: { category: 'gift', description: 'Birthday gift box', size: 'small', fragile: true, handling: '' }, quote, riderPayCents: 26300, cashToCollectCents: 50000, payment: { method: 'cash', collectFrom: 'sender', status: 'unpaid' }, status: 'to_dropoff', statusTimes: { requested: T(now - H) }, riderId: 'riderA', riderName: 'Andre Campbell', riderPhone: '8765550404', riderPlate: 'AB1234', createdAt: T(now - H), proofPhotos: { pickup: { url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90"><rect width="90" height="90" fill="%23d8b4fe"/></svg>' } } });
put('dash_deliveries/D1/customer/pin', { pin: '4821' });
put('dash_deliveries/D2/private/contact', { senderPhone: '8765550909', recipientPhone: '8765550101', customerPhone: '8765550101' });
put('dash_deliveries/D3/private/contact', { senderPhone: '8765550101', recipientPhone: '8765550202' });
put('dash_deliveries/D1/events/e1', { status: 'requested', at: T(now - H) });
put('dash_deliveries/D1/events/e2', { status: 'to_dropoff', at: T(now - 10 * 60000) });
put('dash_locations/D1', { lat: 18.035, lng: -77.507, at: T(now - 30000), riderId: 'riderA' });
put('dash_deliveries/D3', { type: 'parcel', customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '8765550101', pickup: PICK, dropoff: { ...DROP, address: 'Williamsfield, Manchester' }, package: { category: 'documents', description: 'Contract', size: 'small' }, quote: { ...quote, totalCents: 60000 }, riderPayCents: 28000, cashToCollectCents: 60000, payment: { method: 'cash', collectFrom: 'recipient' }, status: 'requested', offeredTo: 'riderA', offerExpiresAt: T(now + 40000), offerKm: 0.6, createdAt: T(now - 2 * 60000) });
put('dash_deliveries/D4', { type: 'parcel', customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '876', pickup: PICK, dropoff: DROP, package: { category: 'retail', description: 'Shoes', size: 'medium' }, quote, riderPayCents: 26300, cashToCollectCents: 50000, payment: { method: 'cash', collectFrom: 'sender' }, status: 'requested', needsDispatcher: true, dispatchOpen: true, createdAt: T(now - 9 * 60000) });
put('dash_deliveries/D5', { type: 'parcel', customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '876', pickup: PICK, dropoff: DROP, package: { category: 'gift', description: 'Flowers', size: 'small' }, quote, riderPayCents: 26300, cashToCollectCents: 50000, payment: { method: 'cash', collectFrom: 'sender' }, status: 'delivered', riderId: 'riderA', riderName: 'Andre Campbell', statusTimes: { delivered: T(now - 2 * H) }, createdAt: T(now - 3 * H), proofOfDelivery: { method: 'pin' } });

put('merchants/shop1', { name: 'Juici Spot Mandeville', status: 'approved', category: 'restaurant', description: 'Jerk chicken, patties and fresh juices.', address: 'Main St, Mandeville', phone: '8765550909', location: { lat: 18.045, lng: -77.505 }, hours: ALL, isAcceptingOrders: true, prepMinutesTypical: 20, representative: 'J. Spot', commissionPct: null });
put('merchants/shop1/products/jerk', { name: 'Jerk chicken', category: 'Mains', description: 'Quarter chicken with festival', priceCents: 120000, available: true, stock: null, options: [{ name: 'Size', required: true, maxSelect: 1, choices: [{ label: 'Quarter', priceCents: 0 }, { label: 'Half', priceCents: 60000 }] }, { name: 'Extras', required: false, maxSelect: 2, choices: [{ label: 'Festival', priceCents: 15000 }, { label: 'Plantain', priceCents: 20000 }] }] });
put('merchants/shop1/products/water', { name: 'Bottled water', category: 'Drinks', priceCents: 15000, available: true, stock: 2 });
put('merchants/shop1/products/soup', { name: 'Red peas soup', category: 'Mains', priceCents: 50000, available: false });
put('merchants/shop2', { name: 'Hilo Supermarket', status: 'pending', category: 'supermarket', address: 'Manchester Road', phone: '876', representative: 'Ms Hilo', location: { lat: 18.04, lng: -77.5 }, hours: {} });
const items = [{ productId: 'jerk', name: 'Jerk chicken', qty: 2, unitCents: 195000, lineCents: 390000, options: [{ group: 'Size', label: 'Half' }, { group: 'Extras', label: 'Festival' }], note: 'Extra sauce' }];
put('dash_orders/O1', { customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '8765550101', merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', merchantPhone: '8765550909', items, subtotalCents: 390000, deliveryCents: 60000, serviceCents: 0, totalCents: 450000, commissionPct: 15, commissionCents: 58500, merchantPayableCents: 331500, riderPayCents: 26000, dropoff: DROP, status: 'preparing', prepMinutes: 20, deliveryId: 'D2', createdAt: T(now - 15 * 60000) });
put('dash_orders/O1/customer/pin', { pin: '7731' });
put('dash_orders/O2', { customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '8765550101', merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', items: [{ productId: 'water', name: 'Bottled water', qty: 1, unitCents: 15000, lineCents: 15000, options: [] }], subtotalCents: 15000, deliveryCents: 60000, serviceCents: 0, totalCents: 75000, commissionPct: 15, commissionCents: 2250, merchantPayableCents: 12750, dropoff: DROP, status: 'awaiting_merchant', createdAt: T(now - 12 * 60000), note: 'Ring the bell' });
put('dash_orders/O3', { customerId: 'cust1', customerName: 'Keneile Davis', merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', items, subtotalCents: 390000, deliveryCents: 60000, serviceCents: 0, totalCents: 450000, commissionPct: 15, merchantPayableCents: 331500, dropoff: DROP, status: 'delivered', statusTimes: { delivered: T(now - 3 * H) }, createdAt: T(now - 4 * H) });
put('dash_deliveries/D2', { type: 'market', orderId: 'O1', merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', customerId: 'cust1', customerName: 'Keneile Davis', customerPhone: '8765550101', pickup: { ...PICK, address: 'Main St, Mandeville', contactName: 'Juici Spot Mandeville', contactPhone: '8765550909' }, dropoff: DROP, package: { category: 'retail', description: 'Juici Spot order · 2 item(s)', size: 'medium' }, quote: { lines: [], totalCents: 60000, distanceKm: 2.4 }, riderPayCents: 26000, cashToCollectCents: 450000, market: { subtotalCents: 390000, commissionCents: 58500 }, merchantReady: false, estimatedReadyAt: T(now + 5 * 60000), payment: { method: 'cash', collectFrom: 'recipient' }, status: 'at_pickup', riderId: 'riderB', riderName: 'Brian Lewis', riderPlate: 'CD5678', createdAt: T(now - 14 * 60000) });
put('settlements/st1', { merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', periodStart: T(now - 14 * 24 * H), periodEnd: T(now - H), orderCount: 9, grossSalesCents: 2100000, commissionCents: 315000, netPayableCents: 1785000, status: 'pending_payment', createdAt: T(now - H) });
put('ledger_entries/l1', { kind: 'merchant_payable', partyId: 'shop1', amountCents: 331500, grossCents: 390000, commissionCents: 58500, settled: false, createdAt: T(now - 3 * H) });
put('ledger_entries/l2', { kind: 'delivery_fee', amountCents: 50000, createdAt: T(now - 2 * H) });
put('ledger_entries/l3', { kind: 'rider_earning', amountCents: 26300, partyId: 'riderA', createdAt: T(now - 2 * H) });
put('ledger_entries/l4', { kind: 'rider_cash_held', amountCents: 23700, partyId: 'riderA', createdAt: T(now - 2 * H) });
put('ledger_entries/l5', { kind: 'product_sales', amountCents: 390000, partyId: 'shop1', createdAt: T(now - 3 * H) });
put('ledger_entries/l6', { kind: 'commission', amountCents: 58500, partyId: 'shop1', createdAt: T(now - 3 * H) });
put('ledger_entries/l7', { kind: 'fleet_charge', amountCents: 4500000, providerName: 'Island Bikes Ltd', periodStart: jmDate(now - 7 * 24 * H), periodEnd: jmDate(now), paid: false, createdAt: T(now - H) });
const today = jmDate(now);
put('rider_shifts/s1', { riderId: 'riderA', riderName: 'Andre Campbell', date: today, start: '07:00', end: '12:00', type: 'morning', status: 'confirmed' });
put('rider_shifts/s2', { riderId: 'riderB', riderName: 'Brian Lewis', date: today, start: '12:00', end: '17:00', type: 'afternoon', status: 'scheduled' });
put('rider_shifts/s3', { riderId: 'riderA', riderName: 'Andre Campbell', date: jmDate(now + 24 * H), start: '17:00', end: '22:00', type: 'evening', status: 'scheduled', isBackup: true });
put('rider_time_off/t1', { riderId: 'riderB', riderName: 'Brian Lewis', date: jmDate(now + 2 * 24 * H), reason: 'Doctor', status: 'pending' });
for (let i = 0; i < 60; i++) put(`dash_demand_events/e${i}`, { kind: i % 5 ? 'booked' : 'unserved', at: T(now - (i % 28) * 24 * H - ((i * 7) % 10 + 9) * H + 5 * H) });
put('support_cases/c1', { deliveryId: 'D1', reporterId: 'cust1', reporterRole: 'customer', category: 'late', description: 'Rider took 40 minutes', status: 'open', createdAt: T(now - H) });
put('audit_logs/a1', { action: 'dash.assign', target: 'D1', details: { riderId: 'riderA' }, at: T(now - H) });
put('audit_logs/a2', { action: 'finance.rider_cash', target: 'riderA', details: { amountCents: 100000, reference: 'R-001' }, at: T(now - 30 * 60000) });
put('site_ads/ad1', { title: 'Free delivery this weekend', body: 'Orders over J$3,000 from Juici Spot.', ctaLabel: 'Order now', target: 'dash', showOn: ['cabs', 'ville'], active: true, clicks: 14, clicksBySite: { cabs: 10, ville: 4 } });

if (new URLSearchParams(location.search).get('card')) put('config/payments', { cardTesters: ['cust1'], environment: 'sandbox' });
put('dash_orders/O4', { customerId: 'cust1', customerName: 'Keneile Davis', merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', items, subtotalCents: 390000, deliveryCents: 60000, serviceCents: 0, totalCents: 450000, commissionPct: 15, merchantPayableCents: 331500, dropoff: DROP, status: 'awaiting_payment', payment: { method: 'card', status: 'pending', lastError: '[N-R05]: Declined by issuer.' }, createdAt: T(now - 5 * 60000) });
put('dash_payments/VDPAIDAAAAAAAAAA', { uid: 'cust1', targetKind: 'order', targetId: 'O1', amountCents: 450000, status: 'paid', card: '(VISA) ... 0007', environment: 'sandbox', createdAt: T(now - 60000) });
put('dash_payments/VDFAILAAAAAAAAAA', { uid: 'cust1', targetKind: 'order', targetId: 'O4', amountCents: 450000, status: 'failed', message: '[N-R05]: Declined by issuer.', environment: 'sandbox', createdAt: T(now - 120000) });
put('dash_payments/VDWAITAAAAAAAAAA', { uid: 'cust1', targetKind: 'delivery', targetId: 'D1', amountCents: 50000, status: 'started', environment: 'sandbox', createdAt: T(now - 30000) });
put('dash_payments/VDREFUNDAAAAAAAA', { uid: 'cust1', targetKind: 'order', targetId: 'O9', amountCents: 75000, status: 'paid', refundDue: true, refundReason: 'order O9 rejected', environment: 'sandbox', createdAt: T(now - 3 * H) });
window.__callables = {
  dashQuoteDelivery: async () => quote,
  payCardStart: async () => ({ url: 'https://jm.wipayfinancial.com/hosted/test-page', paymentId: 'VDTESTAAAAAAAAAA' }),
  dashCreateDelivery: async (d) => { await new Promise((r) => setTimeout(r, 400)); return { deliveryId: 'dnew1abc', needsPayment: d.paymentMethod === 'card' }; },
  marketCreateOrder: async (d) => { await new Promise((r) => setTimeout(r, 300)); return { orderId: 'ONEW', needsPayment: d.paymentMethod === 'card' }; },
  marketQuoteOrder: async () => ({ lines: [], subtotalCents: 405000, deliveryCents: 60000, serviceCents: 0, totalCents: 465000, distanceKm: 2.4, pricingPlaceholder: true }),
};
try { sessionStorage.setItem('vd_checkout_draft', JSON.stringify({ drop: { address: '12 Caledonia Road, Mandeville', lat: 18.03, lng: -77.51 } })); } catch (e) {}
try { localStorage.setItem('vd_cart_v1', JSON.stringify({ merchantId: 'shop1', merchantName: 'Juici Spot Mandeville', items: [{ key: 'k1', productId: 'jerk', name: 'Jerk chicken', qty: 2, options: { Size: ['Half'], Extras: ['Festival'] }, note: '', unitCents: 195000 }, { key: 'k2', productId: 'water', name: 'Bottled water', qty: 1, options: {}, unitCents: 15000 }] })); } catch (e) {}

// ── Screens ──────────────────────────────────────────────────────────────────
const cust = { uid: 'cust1', name: 'Keneile Davis', role: 'customer' };
const shared = { AddressAutocompleteInput, VilleMap, geocodeLatLng, vcToast: () => {}, vcConfirm: async () => true };
const nav = (s) => { window.__nav = s; console.log('NAV', s); };
const base = { go: nav, user: cust, shared, openDelivery: nav, openOrder: nav, openStore: nav, setBookingId: () => {}, site: 'cabs', domains: { cabs: 'villecabs.com', ville: 'villeapp.org', dash: 'villedash.com' } };
const s = new URLSearchParams(location.search).get('s');
const users = { rider: { uid: 'riderA' }, riderjob: { uid: 'riderB' }, pending: { uid: 'riderP' }, apply: { uid: 'newRider', displayName: 'New Rider' }, merchant: { uid: 'shop1' }, merchantNew: { uid: 'newShop' }, merchantPending: { uid: 'shop2' } };
if (s && s.startsWith('rider') || ['pending', 'apply'].includes(s)) window.__user = users[s];
if (s && s.startsWith('merchant')) window.__user = users[s] || users.merchant;
const SCREENS = {
  'ville-home': <VilleHome {...base} site="ville" />,
  'dash-home': <DashHome {...base} />,
  'dash-send': <SendPackage {...base} />,
  'dash-track': <DeliveryTrack {...base} deliveryId="D1" />,
  'dash-history': <MyOrders {...base} />,
  'dash-cart': <Cart {...base} />,
  'dash-about': <DashAbout {...base} />,
  'dash-terms': <DashTerms {...base} publicMode />,
  'dash-home-empty': <DashHome {...base} user={{ uid: 'nobody', name: 'New' }} />,
  'dash-history-empty': <MyOrders {...base} user={{ uid: 'nobody' }} />,
  'land-dash-soon': <DashPublic go={nav} domains={base.domains} launched={false} />,
  'dash-stores': <StoresList {...base} />,
  'dash-store': <StorePage {...base} storeId="shop1" />,
  'dash-checkout': <Checkout {...base} />,
  'dash-order': <OrderTrack {...base} orderId="O1" />,
  rider: <RiderPortal />, riderjob: <RiderPortal />, pending: <RiderPortal />, apply: <RiderPortal />,
  merchant: <MerchantPortal />, merchantNew: <MerchantPortal />, merchantPending: <MerchantPortal />,
  admin: <div style={{ padding: 14, background: '#f5f6fa', minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif' }}><AdminDashTab /></div>,
  'dash-order-unpaid': <OrderTrack {...base} orderId="O4" />,
  'pay-ok': <PaymentReturn {...base} paymentId="VDPAIDAAAAAAAAAA" />,
  'pay-failed': <PaymentReturn {...base} paymentId="VDFAILAAAAAAAAAA" />,
  'pay-wait': <PaymentReturn {...base} paymentId="VDWAITAAAAAAAAAA" />,
  'admin-pay': <div style={{ padding: 14, background: '#f5f6fa', minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif' }}><PaymentsTab /></div>,
  'land-dash': <DashPublic go={nav} domains={base.domains} launched />,
  'land-ville': <SiteLanding site="ville" domains={base.domains} go={nav} dashOn={false} />,
};
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { e: null }; }
  static getDerivedStateFromError(e) { return { e }; }
  componentDidCatch(e) { console.error('RENDER CRASH', e && e.stack); }
  render() { return this.state.e ? <pre style={{ color: 'red', padding: 20 }}>CRASH: {String(this.state.e && this.state.e.stack)}</pre> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<Boundary>{SCREENS[s] || <div>{Object.keys(SCREENS).join(' · ')}</div>}</Boundary>);
