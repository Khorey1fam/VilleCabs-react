/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash card payments through WiPay (hosted payment page).
   FILE LOCATION: functions/dash/payments.js

   OFF by default. Nothing here runs for customers until an admin turns card
   payments on in config/payments (for everyone, or for named testers).

   Flow
     1. Customer places a parcel or store order with paymentMethod 'card'.
        It is created as 'awaiting_payment' — riders and stores don't see it.
     2. payCardStart asks WiPay for a hosted-page URL and returns it; the
        browser goes there and the customer pays on WiPay's page.
     3. WiPay redirects the browser to wipayReturn with the result. A success
        only counts if its hash matches md5(transaction_id + total + API key).
        Then the order goes to the store / the delivery goes to dispatch.
     4. Unpaid orders are cancelled after config.unpaidExpiryMinutes.
     5. If a card-paid order is later cancelled, rejected or fails, the
        payment is flagged 'refund_due'. WiPay has no refund API, so admin
        refunds in the WiPay dashboard and marks it done here.

   Collections
     config/payments          settings (public read, admin write)
     dash_payments/{pid}      one per attempt; pid is the WiPay order_id
     dash_secrets/wipay       live account number + API key (server only)
   ═══════════════════════════════════════════════════════════════════════════ */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const L = require('./logic');
const { db, requireAuth, requireAdmin, audit, addEvent, statusPatch, pushTo, dashEnabledFor } = require('./common');
const { restoreStock, readStockProducts } = require('./stock');

// What can be paid by card: VilleDash parcels and store orders, VilleCabs rides.
const TARGETS = { delivery: 'dash_deliveries', order: 'dash_orders', ride: 'bookings' };
const kindOf = (k) => (TARGETS[k] ? k : null);
const PID_RE = /^VD[0-9A-Z]{14}$/;
const FALLBACK_ORIGIN = 'https://villecabs.com';

async function loadPayments() {
  const s = await db().doc('config/payments').get();
  return L.mergePayments(s.exists ? s.data() : {});
}
async function loadCreds(environment) {
  if (environment !== 'live') return L.WIPAY_SANDBOX;
  const s = await db().doc('dash_secrets/wipay').get();
  const c = s.exists ? s.data() : {};
  if (!/^\d{10}$/.test(c.accountNumber || '') || !c.apiKey) {
    throw new HttpsError('failed-precondition', 'Card payments aren’t set up yet. Please pay cash.');
  }
  return { accountNumber: c.accountNumber, apiKey: c.apiKey };
}
function projectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || 'villecabs'; } catch (e) { return 'villecabs'; }
}
function responseUrl(cfg) {
  return cfg.responseUrl || `https://us-central1-${projectId()}.cloudfunctions.net/wipayReturn`;
}
const amountOf = (kind, t) => (kind === 'order' ? t.totalCents : kind === 'ride' ? Math.round(Number(t.fare || 0) * 100) : (t.quote && t.quote.totalCents));

// Is the card option available to this customer? (Used by create callables.)
async function assertCardAllowed(uid) {
  const cfg = await loadPayments();
  if (!L.cardAllowedFor(cfg, uid)) throw new HttpsError('failed-precondition', 'Card payments aren’t available yet. Please pay cash.');
  return cfg;
}

// ── Start a card payment ─────────────────────────────────────────────────────
exports.payCardStart = onCall(async (req) => {
  const auth = requireAuth(req);
  const d = req.data || {};
  const kind = kindOf(d.kind);
  if (!kind) throw new HttpsError('invalid-argument', 'Unknown payment.');
  const id = L.cleanText(d.id, 40);
  const cfg = await assertCardAllowed(auth.uid);
  const ref = db().doc(`${TARGETS[kind]}/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Order not found.');
  const t = snap.data();
  if (t.customerId !== auth.uid) throw new HttpsError('permission-denied', 'Not your order.');
  if (kind !== 'ride' && !(await dashEnabledFor(auth))) throw new HttpsError('failed-precondition', 'VilleDash is not open yet.');
  if (t.status !== 'awaiting_payment' || !t.payment || t.payment.method !== 'card') {
    throw new HttpsError('failed-precondition', 'This order isn’t waiting for a card payment.');
  }
  const amountCents = amountOf(kind, t);
  if (!Number.isInteger(amountCents) || amountCents < L.WIPAY_MIN_CENTS) {
    throw new HttpsError('failed-precondition', `Card payments need a total of at least ${L.formatJMD(L.WIPAY_MIN_CENTS)}. Please pay cash.`);
  }
  const sites = await db().doc('config/sites').get();
  const domains = ['villecabs.com', 'villedash.com', 'villeapp.org', ...Object.values(sites.exists ? sites.data() : {}).filter((v) => typeof v === 'string')];
  const returnOrigin = L.allowedReturnOrigin(d.returnOrigin, domains) || FALLBACK_ORIGIN;
  const creds = await loadCreds(cfg.environment);
  const cust = await db().doc(`customers/${auth.uid}`).get();

  const pid = L.wipayOrderId();
  const totalStr = L.wipayTotal(amountCents);
  const payRef = db().doc(`dash_payments/${pid}`);
  await payRef.create({
    uid: auth.uid, targetKind: kind, targetId: id, service: kind === 'ride' ? 'cabs' : 'dash', amountCents, totalStr, currency: cfg.currency,
    environment: cfg.environment, feeStructure: cfg.feeStructure, wipayOrderId: pid, provider: 'wipay',
    status: 'creating', returnOrigin, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  const body = L.wipayRequestBody({
    cfg, creds, orderId: pid, totalCents: amountCents, responseUrl: responseUrl(cfg),
    name: cust.exists ? cust.get('name') : '', email: auth.token && auth.token.email, phone: cust.exists ? cust.get('phone') : '',
  });

  let json = null; let httpStatus = 0;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(L.wipayUrl(cfg), {
      method: 'POST', signal: ctl.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    clearTimeout(timer);
    httpStatus = res.status;
    json = await res.json().catch(() => null);
  } catch (e) { json = null; }

  const ok = httpStatus >= 200 && httpStatus < 400 && json && typeof json.url === 'string' && /^https:\/\//.test(json.url);
  if (!ok) {
    await payRef.update({ status: 'start_failed', httpStatus, message: L.cleanText(json && json.message, 300) || 'No response from WiPay', updatedAt: FieldValue.serverTimestamp() });
    throw new HttpsError('unavailable', 'We couldn’t open the card payment page. Try again, or pay cash instead.');
  }
  await payRef.update({ status: 'started', hostedUrl: json.url, transactionId: L.cleanText(json.transaction_id, 120) || null, updatedAt: FieldValue.serverTimestamp() });
  await ref.update({ 'payment.currentPaymentId': pid, 'payment.lastError': null, updatedAt: FieldValue.serverTimestamp() });
  return { url: json.url, paymentId: pid };
});

// Move a paid (or switched-to-cash) order on to the store / dispatch.
function releaseTarget(tx, kind, ref, id, t, patch, note) {
  if (kind === 'ride') {
    // Back into the open-ride pool; notifyDriversPaidRide (functions/index.js) tells drivers.
    tx.update(ref, { ...patch, status: 'searching', paidAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
  } else if (kind === 'delivery') {
    tx.update(ref, statusPatch('requested', patch));
    addEvent(tx, id, 'requested', t.customerId, 'customer', note);
  } else {
    tx.update(ref, statusPatch('awaiting_merchant', patch));
  }
}

// ── Record WiPay's result (exported for tests) ───────────────────────────────
async function settlePayment(pid, query) {
  const payRef = db().doc(`dash_payments/${pid}`);
  const first = await payRef.get();
  if (!first.exists) return { outcome: 'unknown' };
  const p0 = first.data();
  const creds = p0.environment === 'live' ? await loadCreds('live').catch(() => null) : L.WIPAY_SANDBOX;
  const check = creds ? L.verifyWipayReturn(query, p0, creds.apiKey) : { ok: false, outcome: 'no_credentials', reason: 'live credentials missing' };
  const result = {
    resultStatus: L.cleanText(query.status, 20) || null,
    message: L.cleanText(query.message, 300) || null,
    card: L.cleanText(query.card, 40).replace(/[^0-9X .()A-Za-z]/g, '') || null,
    finalTotal: L.cleanText(query.total, 20) || null,
    resultTransactionId: L.cleanText(query.transaction_id, 120) || null,
    resultDate: L.cleanText(query.date, 30) || null,
  };

  return db().runTransaction(async (tx) => {
    const ps = await tx.get(payRef);
    const p = ps.data();
    if (p.status === 'paid') return { outcome: 'paid', already: true, payment: p };
    const tRef = db().doc(`${TARGETS[p.targetKind]}/${p.targetId}`);
    const ts = await tx.get(tRef);
    const t = ts.exists ? ts.data() : null;
    if (!check.ok) {
      tx.update(payRef, { ...result, status: 'rejected', rejectReason: check.reason, updatedAt: FieldValue.serverTimestamp() });
      audit(tx, { actor: 'wipay', role: 'system', action: 'pay.rejected', target: pid, details: { reason: check.reason } });
      return { outcome: 'rejected', payment: p };
    }
    if (check.outcome !== 'paid') {
      tx.update(payRef, { ...result, status: 'failed', updatedAt: FieldValue.serverTimestamp() });
      if (t && t.status === 'awaiting_payment') tx.update(tRef, { 'payment.lastError': result.message || 'Card payment didn’t go through.', updatedAt: FieldValue.serverTimestamp() });
      return { outcome: 'failed', payment: p };
    }
    const paidFields = { ...result, status: 'paid', paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    const stillWaiting = t && t.status === 'awaiting_payment' && t.payment && t.payment.method === 'card';
    if (stillWaiting) {
      tx.update(payRef, paidFields);
      releaseTarget(tx, p.targetKind, tRef, p.targetId, t, {
        'payment.status': 'paid', 'payment.paymentId': pid, 'payment.paidCents': p.amountCents,
        'payment.card': result.card, 'payment.lastError': null,
        ...(p.targetKind === 'ride' ? {} : { cashToCollectCents: 0 }),
      }, 'Card payment received');
      return { outcome: 'paid', payment: p };
    }
    // Paid, but the order was cancelled/expired or switched to cash meanwhile.
    tx.update(payRef, { ...paidFields, refundDue: true, refundReason: t ? `Order was ${t.status} when payment arrived` : 'Order missing' });
    return { outcome: 'paid_refund_due', payment: p };
  });
}

// ── WiPay redirects the customer's browser here ──────────────────────────────
exports.wipayReturn = onRequest(async (req, res) => {
  const q = req.query || {};
  const pid = String(q.order_id || '');
  let origin = FALLBACK_ORIGIN;
  let tag = 'unknown';
  try {
    if (PID_RE.test(pid)) {
      const r = await settlePayment(pid, q);
      if (r.outcome !== 'unknown') { origin = (r.payment && r.payment.returnOrigin) || origin; tag = pid; }
    }
  } catch (e) {
    console.error('wipayReturn', e);
  }
  res.set('Cache-Control', 'no-store');
  res.redirect(303, `${origin}/?vdpay=${encodeURIComponent(tag)}`);
});

// ── Customer gives up on card and pays cash instead ──────────────────────────
exports.payUseCash = onCall(async (req) => {
  const auth = requireAuth(req);
  const d = req.data || {};
  const kind = kindOf(d.kind);
  if (!kind) throw new HttpsError('invalid-argument', 'Unknown order.');
  const id = L.cleanText(d.id, 40);
  const ref = db().doc(`${TARGETS[kind]}/${id}`);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Order not found.');
    const t = s.data();
    if (t.customerId !== auth.uid) throw new HttpsError('permission-denied', 'Not your order.');
    if (t.status !== 'awaiting_payment') throw new HttpsError('failed-precondition', 'This order isn’t waiting for payment.');
    const cash = kind === 'delivery'
      ? { payment: { method: 'cash', collectFrom: d.payer === 'recipient' ? 'recipient' : 'sender', status: 'unpaid' }, cashToCollectCents: t.quote.totalCents }
      : kind === 'ride' ? { payment: { method: 'cash', status: 'unpaid' }, paymentMethod: 'Cash' }
        : { payment: { method: 'cash', status: 'unpaid' } };
    releaseTarget(tx, kind, ref, id, t, cash, 'Switched to cash');
  });
  return { ok: true };
});

// ── Cancel orders left unpaid (called from the 1-minute dispatch sweep) ──────
async function expireUnpaid(nowMs = Date.now()) {
  const cfg = await loadPayments();
  const cutoff = nowMs - cfg.unpaidExpiryMinutes * 60000;
  let n = 0;
  for (const kind of ['delivery', 'order', 'ride']) {
    const snap = await db().collection(TARGETS[kind]).where('status', '==', 'awaiting_payment').get();
    for (const doc of snap.docs) {
      const created = doc.get('createdAt');
      const ms = created && created.toMillis ? created.toMillis() : nowMs;
      if (ms > cutoff) continue;
      await db().runTransaction(async (tx) => {
        const s = await tx.get(doc.ref);
        const t = s.data();
        if (!t || t.status !== 'awaiting_payment') return;
        const stock = kind === 'order' ? await readStockProducts(tx, t) : null;
        if (stock) restoreStock(tx, t, stock);
        const why = { cancelledBy: 'system', cancelReason: 'Card payment wasn’t completed in time', 'payment.status': 'expired' };
        if (kind === 'ride') tx.update(doc.ref, { ...why, status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
        else tx.update(doc.ref, statusPatch('cancelled', why));
        if (kind === 'delivery') addEvent(tx, doc.id, 'cancelled', 'system', 'system', 'Unpaid');
      });
      n++;
    }
  }
  return n;
}

// ── Flag refunds when a card-paid order doesn't complete ─────────────────────
async function flagRefund(after, id, kind) {
  const pid = after.payment && after.payment.paymentId;
  if (!pid) return;
  await db().doc(`dash_payments/${pid}`).set({ refundDue: true, refundReason: `${kind} ${id} ${after.status}`, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db().doc(`${TARGETS[kind]}/${id}`).update({ 'payment.status': 'refund_due' });
  // Refunds are confirmed by an admin (amount may be partial), so promise a review, not a refund.
  if (kind !== 'order') {
    const what = kind === 'ride' ? ['VilleCabs', 'ride'] : ['VilleDash', 'delivery'];
    await pushTo('customers', after.customerId, 'Card payment under review', `Your ${what[1]} didn’t go ahead. ${what[0]} will review a refund of your card payment.`, { tag: 'vd-refund' });
  }
}
exports.payWatchDelivery = onDocumentUpdated('dash_deliveries/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status || after.type === 'market') return;
  if (['cancelled', 'failed'].includes(after.status) && after.payment && after.payment.method === 'card' && after.payment.status === 'paid') {
    await flagRefund(after, event.params.id, 'delivery');
  }
});
exports.payWatchOrder = onDocumentUpdated('dash_orders/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status) return;
  if (['rejected', 'cancelled', 'failed'].includes(after.status) && after.payment && after.payment.method === 'card' && after.payment.status === 'paid') {
    await flagRefund(after, event.params.id, 'order');
  }
});

// ── Admin ────────────────────────────────────────────────────────────────────
// VilleCabs: a card-paid ride that ends without a completed trip.
const RIDE_UNFINISHED = ['cancelled', 'expired', 'no_driver', 'declined'];
exports.payWatchRide = onDocumentUpdated('bookings/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status) return;
  if (RIDE_UNFINISHED.includes(after.status) && after.payment && after.payment.method === 'card' && after.payment.status === 'paid') {
    await flagRefund(after, event.params.id, 'ride');
  }
});

exports.payAdminSetWipay = onCall(async (req) => {
  const auth = requireAdmin(req);
  const accountNumber = String((req.data && req.data.accountNumber) || '').trim();
  const apiKey = String((req.data && req.data.apiKey) || '').trim();
  if (!/^\d{10}$/.test(accountNumber)) throw new HttpsError('invalid-argument', 'The WiPay account number is 10 digits.');
  if (!/^[A-Za-z0-9]{3,64}$/.test(apiKey)) throw new HttpsError('invalid-argument', 'Paste the API key from WiPay → Developer.');
  await db().runTransaction(async (tx) => {
    tx.set(db().doc('dash_secrets/wipay'), { accountNumber, apiKey, updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.uid });
    tx.set(db().doc('config/payments'), { liveCredentialsSet: true, liveAccountLast4: accountNumber.slice(-4), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'pay.credentials', target: 'wipay', details: { last4: accountNumber.slice(-4) } });
  });
  return { ok: true };
});

exports.payAdminResolveRefund = onCall(async (req) => {
  const auth = requireAdmin(req);
  const pid = String((req.data && req.data.paymentId) || '');
  const outcome = req.data && req.data.outcome === 'not_refunded' ? 'not_refunded' : 'refunded';
  const reference = L.cleanText(req.data && req.data.reference, 120);
  const askCents = req.data && req.data.amountCents != null ? Number(req.data.amountCents) : null;
  if (!PID_RE.test(pid)) throw new HttpsError('invalid-argument', 'Unknown payment.');
  if (!reference) throw new HttpsError('invalid-argument', outcome === 'refunded' ? 'Enter the WiPay refund reference.' : 'Say why no refund is due.');
  const ref = db().doc(`dash_payments/${pid}`);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || !s.get('refundDue')) throw new HttpsError('failed-precondition', 'This payment has no refund pending.');
    const p = s.data();
    const tRef = db().doc(`${TARGETS[p.targetKind]}/${p.targetId}`);
    const tSnap = await tx.get(tRef);   // all reads before any write
    const amountCents = askCents == null ? p.amountCents : askCents;
    if (outcome === 'refunded' && (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > p.amountCents)) {
      throw new HttpsError('invalid-argument', `Refund must be between J$0.01 and ${L.formatJMD(p.amountCents)}.`);
    }
    tx.update(ref, { refundDue: false, refundOutcome: outcome, refundReference: reference, refundedCents: outcome === 'refunded' ? amountCents : 0, refundedAt: Timestamp.now(), refundedBy: auth.uid });
    if (tSnap.exists) tx.update(tRef, { 'payment.status': outcome === 'refunded' ? 'refunded' : 'paid', 'payment.refundedCents': outcome === 'refunded' ? amountCents : 0 });
    if (outcome === 'refunded') {
      tx.set(db().collection('ledger_entries').doc(), {
        kind: 'card_refund', direction: 'out', amountCents, currency: 'JMD', party: 'customer', partyId: p.uid,
        paymentId: pid, reference, service: p.service || 'dash', partial: amountCents < p.amountCents, createdAt: FieldValue.serverTimestamp(),
      });
    }
    audit(tx, { actor: auth.uid, role: 'admin', action: `pay.${outcome}`, target: pid, details: { reference } });
  });
  return { ok: true };
});

// Helpers for other modules and tests (not Cloud Functions).
const internal = { settlePayment, expireUnpaid, assertCardAllowed, loadPayments };
module.exports = { ...exports, internal };
