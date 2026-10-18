/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash money controls — rider cash handovers and fleet-provider charges.
   FILE LOCATION: functions/dash/finance.js

   Cash model: riders collect cash from customers, keep their pay, and owe
   VilleDash the rest (ledger kind 'rider_cash_held'). When a rider hands cash
   in, admin records it ('rider_cash_received'). What a rider still owes is
   held − received, so partial handovers just work.
   ═══════════════════════════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const L = require('./logic');
const { db, requireAdmin, audit } = require('./common');

async function riderCashOwed(riderId) {
  const snap = await db().collection('ledger_entries').where('partyId', '==', riderId).get();
  let held = 0; let received = 0; let paidOut = 0;
  snap.docs.forEach((e) => {
    if (e.get('kind') === 'rider_cash_held') held += e.get('amountCents') || 0;
    if (e.get('kind') === 'rider_cash_received') received += e.get('amountCents') || 0;
    if (e.get('kind') === 'rider_payout') paidOut += e.get('amountCents') || 0;
  });
  // Negative = VilleDash owes the rider (card-paid jobs: they collected nothing).
  return { held, received, paidOut, owed: held - received + paidOut };
}

exports.dashAdminRecordRiderCash = onCall(async (req) => {
  const auth = requireAdmin(req);
  const riderId = L.cleanText(req.data && req.data.riderId, 128);
  const amountCents = Number(req.data && req.data.amountCents);
  const reference = L.cleanText(req.data && req.data.reference, 120);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpsError('invalid-argument', 'Enter the amount received.');
  if (!reference) throw new HttpsError('invalid-argument', 'Enter a receipt or deposit reference.');
  const rider = await db().doc(`riders/${riderId}`).get();
  if (!rider.exists) throw new HttpsError('not-found', 'Rider not found.');
  const before = await riderCashOwed(riderId);
  if (amountCents > before.owed) throw new HttpsError('failed-precondition', `That's more than ${rider.get('name')} owes (${L.formatJMD(before.owed)}).`);
  const ref = db().collection('ledger_entries').doc();
  await db().runTransaction(async (tx) => {
    tx.set(ref, {
      kind: 'rider_cash_received', direction: 'in', amountCents, currency: 'JMD', party: 'rider', partyId: riderId,
      reference, note: L.cleanText(req.data && req.data.note, 200) || null, service: 'dash', recordedBy: auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'finance.rider_cash', target: riderId, details: { amountCents, reference } });
  });
  return { ok: true, owedCents: before.owed - amountCents };
});

// Card-paid jobs leave VilleDash owing riders their pay; record each payout.
exports.dashAdminRecordRiderPayout = onCall(async (req) => {
  const auth = requireAdmin(req);
  const riderId = L.cleanText(req.data && req.data.riderId, 128);
  const amountCents = Number(req.data && req.data.amountCents);
  const reference = L.cleanText(req.data && req.data.reference, 120);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpsError('invalid-argument', 'Enter the amount paid.');
  if (!reference) throw new HttpsError('invalid-argument', 'Enter a payment reference.');
  const rider = await db().doc(`riders/${riderId}`).get();
  if (!rider.exists) throw new HttpsError('not-found', 'Rider not found.');
  const before = await riderCashOwed(riderId);
  if (amountCents > -before.owed) throw new HttpsError('failed-precondition', `That's more than VilleDash owes ${rider.get('name')} (${L.formatJMD(Math.max(0, -before.owed))}).`);
  const ref = db().collection('ledger_entries').doc();
  await db().runTransaction(async (tx) => {
    tx.set(ref, {
      kind: 'rider_payout', direction: 'out', amountCents, currency: 'JMD', party: 'rider', partyId: riderId,
      reference, service: 'dash', recordedBy: auth.uid, createdAt: FieldValue.serverTimestamp(),
    });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'finance.rider_payout', target: riderId, details: { amountCents, reference } });
  });
  return { ok: true, owedCents: before.owed + amountCents };
});

exports.dashAdminRecordFleetCharge = onCall(async (req) => {
  const auth = requireAdmin(req);
  const d = req.data || {};
  const providerId = L.cleanText(d.providerId, 60);
  const amountCents = Number(d.amountCents);
  const periodStart = L.cleanText(d.periodStart, 10);
  const periodEnd = L.cleanText(d.periodEnd, 10);
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpsError('invalid-argument', 'Enter the charge amount.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) {
    throw new HttpsError('invalid-argument', 'Choose the period the charge covers.');
  }
  const provider = await db().doc(`fleet_providers/${providerId}`).get();
  if (!provider.exists) throw new HttpsError('not-found', 'Fleet provider not found.');
  const ref = db().collection('ledger_entries').doc();
  await db().runTransaction(async (tx) => {
    tx.set(ref, {
      kind: 'fleet_charge', direction: 'expense', amountCents, currency: 'JMD', party: 'fleet_provider', partyId: providerId,
      providerName: provider.get('name'), periodStart, periodEnd, bikes: Number.isInteger(d.bikes) ? d.bikes : null,
      invoiceRef: L.cleanText(d.invoiceRef, 120) || null, paid: false, paymentReference: null,
      service: 'dash', recordedBy: auth.uid, createdAt: FieldValue.serverTimestamp(),
    });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'finance.fleet_charge', target: providerId, details: { amountCents, periodStart, periodEnd } });
  });
  return { ok: true, entryId: ref.id };
});

exports.dashAdminMarkFleetChargePaid = onCall(async (req) => {
  const auth = requireAdmin(req);
  const id = L.cleanText(req.data && req.data.entryId, 60);
  const reference = L.cleanText(req.data && req.data.reference, 120);
  if (!reference) throw new HttpsError('invalid-argument', 'Enter the payment reference.');
  const ref = db().doc(`ledger_entries/${id}`);
  await db().runTransaction(async (tx) => {
    const e = await tx.get(ref);
    if (!e.exists || e.get('kind') !== 'fleet_charge') throw new HttpsError('not-found', 'Charge not found.');
    if (e.get('paid')) throw new HttpsError('failed-precondition', 'Already paid.');
    tx.update(ref, { paid: true, paymentReference: reference, paidAt: FieldValue.serverTimestamp() });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'finance.fleet_paid', target: id, details: { reference } });
  });
  return { ok: true };
});


