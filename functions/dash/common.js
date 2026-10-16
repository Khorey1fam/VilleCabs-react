// Shared helpers for VilleDash functions.
const { HttpsError } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const L = require('./logic');

const ADMIN_EMAILS = ['admin@villecabs.com'];
const db = () => getFirestore();

// ── Auth helpers ─────────────────────────────────────────────────────────────
function requireAuth(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  return req.auth;
}
function isAdminToken(auth) {
  const t = (auth && auth.token) || {};
  return t.admin === true || ADMIN_EMAILS.includes(String(t.email || '').toLowerCase());
}
function requireAdmin(req) {
  const auth = requireAuth(req);
  if (!isAdminToken(auth)) throw new HttpsError('permission-denied', 'Admins only.');
  return auth;
}
async function loadPricing() {
  const snap = await db().doc('dash_pricing/current').get();
  return L.mergePricing(snap.exists ? snap.data() : null);
}
async function dashEnabledFor(auth) {
  if (isAdminToken(auth)) return true;
  const snap = await db().doc('config/features').get();
  if (!snap.exists) return false;
  const f = snap.data();
  if (f.dash === true) return true;
  // Pilot mode: let named testers in while it is hidden from everyone else.
  return Array.isArray(f.dashTesters) && f.dashTesters.includes(auth.uid);
}

function audit(tx, { actor, role, action, target, details }) {
  const ref = db().collection('audit_logs').doc();
  const rec = { actor: actor || null, role, action, target: target || null, details: details || null, at: FieldValue.serverTimestamp() };
  if (tx) tx.set(ref, rec); else return ref.set(rec);
  return null;
}
function addEvent(tx, deliveryId, status, by, role, note) {
  const ref = db().collection(`dash_deliveries/${deliveryId}/events`).doc();
  tx.set(ref, { status, by: by || null, role, note: note || null, at: FieldValue.serverTimestamp() });
}
function statusPatch(status, extra = {}) {
  return { status, [`statusTimes.${status}`]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...extra };
}
function quoteErrorToHttps(e) {
  if (e instanceof L.QuoteError) return new HttpsError('failed-precondition', e.message, { code: e.code });
  return e;
}


async function pushTo(collection, uid, title, body, extra = {}) {
  if (!uid) return;
  const snap = await db().doc(`${collection}/${uid}`).get();
  const token = snap.exists ? snap.get('fcmToken') : null;
  if (!token) return;
  const url = collection === 'riders' ? '/rider' : collection === 'merchants' ? '/merchant' : '/';
  await getMessaging().send({
    token,
    notification: { title, body },
    data: { title, body, url, ...extra },
    webpush: { headers: { Urgency: 'high' }, notification: { icon: '/logo.png', badge: '/logo.png' } },
  }).catch((err) => console.error('Dash push failed:', err && err.message));
}

async function ridersAvailable() {
  const online = await db().collection('riders')
    .where('status', '==', 'approved').where('isOnline', '==', true).get();
  return { online: online.size, free: online.docs.filter((r) => !r.get('activeDeliveryId')).length };
}

module.exports = {
  db, requireAuth, isAdminToken, requireAdmin, loadPricing, dashEnabledFor,
  audit, addEvent, statusPatch, quoteErrorToHttps, pushTo, ridersAvailable, ADMIN_EMAILS,
};
