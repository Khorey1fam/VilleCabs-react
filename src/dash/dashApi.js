// VilleDash — client helpers. Reuses the Firebase app App.js already started.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useEffect, useState } from 'react';

function app() {
  if (getApps().length) return getApp();
  return initializeApp({
    apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.REACT_APP_FIREBASE_APP_ID,
  });
}
export const dashDb   = () => getFirestore(app());
export const dashAuth = () => getAuth(app());
const fn = (name) => httpsCallable(getFunctions(app()), name);

export const api = {
  quote:        (data) => fn('dashQuoteDelivery')(data).then((r) => r.data),
  create:       (data) => fn('dashCreateDelivery')(data).then((r) => r.data),
  cancel:       (data) => fn('dashCancelDelivery')(data).then((r) => r.data),
  accept:       (data) => fn('dashAcceptDelivery')(data).then((r) => r.data),
  assign:       (data) => fn('dashAdminAssignRider')(data).then((r) => r.data),
  riderStatus:  (data) => fn('dashRiderUpdateStatus')(data).then((r) => r.data),
  verifyPin:    (data) => fn('dashVerifyDropoffPin')(data).then((r) => r.data),
  resolve:      (data) => fn('dashAdminResolveDelivery')(data).then((r) => r.data),
  reportIssue:  (data) => fn('dashReportIssue')(data).then((r) => r.data),
  // Marketplace
  marketQuote:    (data) => fn('marketQuoteOrder')(data).then((r) => r.data),
  marketCreate:   (data) => fn('marketCreateOrder')(data).then((r) => r.data),
  marketCancel:   (data) => fn('marketCancelOrder')(data).then((r) => r.data),
  merchantUpdate: (data) => fn('marketMerchantUpdateOrder')(data).then((r) => r.data),
  settle:         (data) => fn('marketCreateSettlement')(data).then((r) => r.data),
  settlePaid:     (data) => fn('marketMarkSettlementPaid')(data).then((r) => r.data),
  // Fleet
  assignBike:     (data) => fn('dashAdminAssignMotorcycle')(data).then((r) => r.data),
  bikeStatus:     (data) => fn('dashAdminSetMotorcycleStatus')(data).then((r) => r.data),
};

// Callable errors carry a friendly message written on the server.
export function errText(e) {
  if (!e) return 'Something went wrong.';
  if (e.code === 'functions/unavailable' && /network|fetch/i.test(e.message || '')) return 'Connection problem. Check your internet and try again.';
  if (e.code === 'functions/internal') return 'Something went wrong on our side. Please try again.';
  return e.message || 'Something went wrong.';
}

export const formatJMD = (cents) =>
  `J$${(Math.round(Number(cents) || 0) / 100).toLocaleString('en-JM', { maximumFractionDigits: 2 })}`;

export const STATUS_LABEL = {
  requested:  'Finding a rider',
  assigned:   'Rider assigned',
  to_pickup:  'Rider heading to pickup',
  at_pickup:  'Rider at pickup',
  collected:  'Package collected',
  to_dropoff: 'On the way',
  at_dropoff: 'Rider at drop-off',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
  failed:     'Could not be delivered',
};
export const STEPS = ['requested', 'assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff', 'delivered'];
export const FINAL = ['delivered', 'cancelled', 'failed'];

export const PACKAGE_CATEGORIES = [
  ['documents', 'Documents'], ['small_parcel', 'Small parcel'], ['gift', 'Gift'],
  ['clothing', 'Clothing'], ['retail', 'Retail purchase'], ['other', 'Other approved item'],
];
export const PACKAGE_SIZES = [
  ['small', 'Small', 'Fits in a backpack · up to 5 kg'],
  ['medium', 'Medium', 'Shoebox to small box · up to 10 kg'],
  ['large', 'Large', 'Strapped to the bike · up to 20 kg'],
];
export const PROHIBITED_SUMMARY = [
  'Weapons, ammunition, fireworks or explosives',
  'Fuel, gas cylinders, acids or other dangerous goods',
  'Illegal items or controlled substances',
  'Cash, cheques or valuables over J$20,000',
  'Live animals',
  'Anything over 20 kg or too big to carry safely on a motorcycle',
];

// Feature flag: config/features { dash: true } turns VilleDash on for everyone;
// { dashTesters: [uid, …] } turns it on for named pilot testers only.
export function useDashEnabled(uid) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onSnapshot(doc(dashDb(), 'config', 'features'), (snap) => {
        const f = snap.exists() ? snap.data() : {};
        setOn(f.dash === true || (!!uid && Array.isArray(f.dashTesters) && f.dashTesters.includes(uid)));
      }, () => setOn(false));
    } catch (e) { setOn(false); }
    return () => unsub();
  }, [uid]);
  return on;
}

export function newRequestKey() {
  const a = new Uint8Array(12);
  (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Marketplace ──────────────────────────────────────────────────────────────
export const MERCHANT_CATEGORIES = [
  ['restaurant', 'Restaurants'], ['fast_food', 'Fast food'], ['cafe_bakery', 'Cafés & bakeries'],
  ['supermarket', 'Supermarkets'], ['convenience', 'Convenience'], ['boutique', 'Boutiques'],
  ['gift_shop', 'Gift shops'], ['retail', 'General retail'],
];
export const ORDER_LABEL = {
  awaiting_merchant: 'Waiting for the store', accepted: 'Accepted', preparing: 'Being prepared',
  ready: 'Ready for pickup', collected: 'On the way', delivered: 'Delivered',
  rejected: 'Not accepted', cancelled: 'Cancelled', failed: 'Could not be delivered',
};
export const ORDER_FINAL = ['delivered', 'rejected', 'cancelled', 'failed'];
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same rule as the server (functions/dash/logic.js isOpenAt), for display only.
export function isOpenAt(hours, date = new Date()) {
  if (!hours) return false;
  const d = new Date(date.getTime() - 5 * 3600000);
  const day = d.getUTCDay(); const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const t = hours[String(day)];
  if (t) {
    const o = toMin(t.open); const c = toMin(t.close);
    if (o != null && c != null && ((c > o && minutes >= o && minutes < c) || (c <= o && minutes >= o))) return true;
  }
  const y = hours[String((day + 6) % 7)];
  if (y) { const o = toMin(y.open); const c = toMin(y.close); if (o != null && c != null && c <= o && minutes < c) return true; }
  return false;
}
export function hoursToday(hours) {
  const day = new Date(Date.now() - 5 * 3600000).getUTCDay();
  const t = hours && hours[String(day)];
  return t ? `${t.open}–${t.close}` : 'Closed today';
}

// Cart — one store at a time, kept in this browser.
const CART_KEY = 'vd_cart_v1';
export function readCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || { merchantId: null, items: [] }; } catch (e) { return { merchantId: null, items: [] }; }
}
export function writeCart(c) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) { /* private mode */ }
  try { window.dispatchEvent(new Event('vd-cart')); } catch (e) { /* ignore */ }
}
export function useCart() {
  const [cart, setCart] = useState(readCart);
  useEffect(() => {
    const sync = () => setCart(readCart());
    window.addEventListener('vd-cart', sync);
    return () => window.removeEventListener('vd-cart', sync);
  }, []);
  return [cart, writeCart];
}
// Price a cart line for display. The server re-prices everything at checkout.
export function lineUnitCents(product, options) {
  let u = product?.priceCents || 0;
  (product?.options || []).forEach((g) => (options?.[g.name] || []).forEach((label) => {
    const c = (g.choices || []).find((x) => x.label === label); if (c) u += c.priceCents || 0;
  }));
  return u;
}

// Upload a store image to merchants/{uid}/… and return its URL. Needs the
// Storage rule in VILLEDASH.md.
export async function uploadMerchantImage(uid, file, name, folder = `merchants/${uid}`) {
  if (!file) return null;
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use a PNG, JPG or WebP image.');
  if (file.size > 3 * 1024 * 1024) throw new Error('Images must be under 3 MB.');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const r = storageRef(getStorage(app()), `${folder}/${name}-${Date.now()}.${ext}`);
  await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(r);
}
export const centsFromJ = (v) => { const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };

export const BIKE_STATUS_LABEL = {
  available: 'Available', assigned: 'Assigned', in_service: 'In service', maintenance: 'Under maintenance',
  unavailable: 'Unavailable', removed: 'Removed from operation',
};
export const SHIFT_LABEL = {
  scheduled: 'Awaiting confirmation', confirmed: 'Confirmed', declined: 'Declined',
  missed: 'Missed', completed: 'Completed', cancelled: 'Cancelled',
};
export const jmToday = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
export const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
