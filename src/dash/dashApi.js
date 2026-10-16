// VilleDash — client helpers. Reuses the Firebase app App.js already started.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
