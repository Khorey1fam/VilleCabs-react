/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash — Cloud Functions
   FILE LOCATION: functions/dash/index.js   (loaded from functions/index.js)

   The server is the ONLY place that sets a delivery's price, status, rider or
   PIN. Customers and riders call these functions; Firestore rules stop them
   writing those fields directly.

   Collections used
     dash_deliveries/{id}            the delivery (customer + rider + admin read)
       /events/{auto}                status history
       /customer/pin                 the drop-off PIN — the customer's eyes only
     dash_secrets/{id}               PIN hash + salt (server only)
     dash_locations/{id}             live rider position (rider writes)
     riders/{uid}                    rider accounts
     dash_pricing/current            admin-set prices (whole cents)
     dash_demand_events/{auto}       analytics, coarse areas only
     ledger_entries/{auto}           money records (cents)
     support_cases/{auto}            problems reported by riders/customers
     audit_logs/{auto}               who did what
   ═══════════════════════════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');
const L = require('./logic');

const {
  db, requireAuth, isAdminToken, requireAdmin, loadPricing, dashEnabledFor,
  audit, addEvent, statusPatch, quoteErrorToHttps, pushTo,
} = require('./common');

// ── 1. Quote ─────────────────────────────────────────────────────────────────
exports.dashQuoteDelivery = onCall(async (req) => {
  const auth = requireAuth(req);
  if (!(await dashEnabledFor(auth))) throw new HttpsError('failed-precondition', 'VilleDash is not open yet.');
  const d = req.data || {};
  const pricing = await loadPricing();
  try {
    const q = L.quoteParcel({
      pickup: d.pickup, dropoff: d.dropoff, size: d.size,
      fragile: !!d.fragile, weightKg: d.weightKg == null || d.weightKg === '' ? null : Number(d.weightKg),
    }, pricing);
    // Logged so "abandoned quotes" can be told apart from real bookings.
    await db().collection('dash_demand_events').add({
      kind: 'quote', type: 'parcel', customerId: auth.uid,
      pickupArea: L.coarseArea(d.pickup), dropoffArea: L.coarseArea(d.dropoff),
      quotedCents: q.totalCents, at: FieldValue.serverTimestamp(),
    });
    const { riderPayCents, ...publicQuote } = q;   // rider pay is not the customer's business
    return publicQuote;
  } catch (e) { throw quoteErrorToHttps(e); }
});

// ── 2. Create a parcel delivery ──────────────────────────────────────────────
exports.dashCreateDelivery = onCall(async (req) => {
  const auth = requireAuth(req);
  if (!(await dashEnabledFor(auth))) throw new HttpsError('failed-precondition', 'VilleDash is not open yet.');
  const d = req.data || {};

  // Idempotency: the same key from the same customer always maps to one doc,
  // so a double-tap or a retry on a bad connection never books twice.
  const key = L.cleanText(d.idempotencyKey, 64);
  if (key.length < 8) throw new HttpsError('invalid-argument', 'Missing request key.');
  const deliveryId = 'D' + crypto.createHash('sha256').update(`${auth.uid}:${key}`).digest('hex').slice(0, 19).toUpperCase();
  const ref = db().doc(`dash_deliveries/${deliveryId}`);
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.get('customerId') !== auth.uid) throw new HttpsError('already-exists', 'Please try again.');
    const pinSnap = await ref.collection('customer').doc('pin').get();
    return { deliveryId, pin: pinSnap.exists ? pinSnap.get('pin') : null, duplicate: true };
  }

  // Customer in good standing
  const cust = await db().doc(`customers/${auth.uid}`).get();
  if (!cust.exists) throw new HttpsError('failed-precondition', 'Please finish setting up your VILLE account first.');
  if (['banned', 'suspended', 'deactivated'].includes(cust.get('status'))) {
    throw new HttpsError('permission-denied', 'Your account cannot place orders. Contact support.');
  }

  // Validate the form
  const pickup = d.pickup || {}; const dropoff = d.dropoff || {}; const pkg = d.package || {};
  const senderName = L.cleanText(pickup.contactName, 80);
  const senderPhone = L.cleanPhone(pickup.contactPhone);
  const recipientName = L.cleanText(dropoff.recipientName, 80);
  const recipientPhone = L.cleanPhone(dropoff.recipientPhone);
  if (!senderName || !senderPhone) throw new HttpsError('invalid-argument', 'Add the sender’s name and phone number.');
  if (!recipientName || !recipientPhone) throw new HttpsError('invalid-argument', 'Add the recipient’s name and phone number.');
  if (!L.PACKAGE_CATEGORIES.includes(pkg.category)) throw new HttpsError('invalid-argument', 'Choose what you are sending.');
  const description = L.cleanText(pkg.description, 300);
  if (description.length < 3) throw new HttpsError('invalid-argument', 'Describe the package in a few words.');
  const flagged = L.findProhibited(`${description} ${pkg.handling || ''}`);
  if (flagged.length) {
    throw new HttpsError('failed-precondition', `VilleDash can't carry this item (${flagged.join(', ')}). See the prohibited items list.`);
  }
  if (d.acceptedRules !== true) throw new HttpsError('failed-precondition', 'Please confirm the package follows the delivery rules.');

  const pricing = await loadPricing();
  let quote;
  try {
    quote = L.quoteParcel({
      pickup, dropoff, size: pkg.size, fragile: !!pkg.fragile,
      weightKg: pkg.weightKg == null || pkg.weightKg === '' ? null : Number(pkg.weightKg),
    }, pricing);
  } catch (e) { throw quoteErrorToHttps(e); }

  // The customer saw a price; if prices changed in between, make them look again.
  if (Number.isInteger(d.expectedTotalCents) && d.expectedTotalCents !== quote.totalCents) {
    throw new HttpsError('aborted', 'The price has changed. Please review the new total.', { totalCents: quote.totalCents });
  }

  // Too many open deliveries?
  const open = await db().collection('dash_deliveries')
    .where('customerId', '==', auth.uid).where('status', 'in', L.ACTIVE).get();
  if (open.size >= pricing.maxActivePerCustomer) {
    throw new HttpsError('resource-exhausted', `You can have up to ${pricing.maxActivePerCustomer} deliveries in progress.`);
  }

  // Is anyone available? (Planned shifts don't count — only riders online now.)
  const online = await db().collection('riders')
    .where('status', '==', 'approved').where('isOnline', '==', true).get();
  const free = online.docs.filter((r) => !r.get('activeDeliveryId') && (!pricing.requireMotorcycle || r.get('motorcycleId')));
  const demandBase = {
    type: 'parcel', customerId: auth.uid,
    pickupArea: L.coarseArea(pickup), dropoffArea: L.coarseArea(dropoff),
    quotedCents: quote.totalCents, ridersOnline: online.size, ridersFree: free.length,
    at: FieldValue.serverTimestamp(),
  };
  if (free.length === 0 && !pricing.allowQueueWhenNoRiders) {
    await db().collection('dash_demand_events').add({ ...demandBase, kind: 'unserved', reason: online.size ? 'all_busy' : 'none_online' });
    throw new HttpsError('unavailable', online.size
      ? 'All VilleDash riders are busy right now. Please try again in a few minutes.'
      : 'No VilleDash riders are online right now. Nothing has been booked and you have not been charged.');
  }

  const pinRec = L.newPinRecord();
  const delivery = {
    type: 'parcel',
    customerId: auth.uid,
    customerName: L.cleanText(cust.get('name'), 80),
    customerPhone: L.cleanPhone(cust.get('phone')),
    pickup: {
      address: L.cleanText(pickup.address, 200), lat: pickup.lat, lng: pickup.lng,
      contactName: senderName, contactPhone: senderPhone,
      landmark: L.cleanText(pickup.landmark, 150), instructions: L.cleanText(pickup.instructions, 300),
    },
    dropoff: {
      address: L.cleanText(dropoff.address, 200), lat: dropoff.lat, lng: dropoff.lng,
      recipientName, recipientPhone, altPhone: L.cleanPhone(dropoff.altPhone),
      landmark: L.cleanText(dropoff.landmark, 150), instructions: L.cleanText(dropoff.instructions, 300),
    },
    package: {
      category: pkg.category, description, size: pkg.size,
      weightKg: pkg.weightKg == null || pkg.weightKg === '' ? null : Number(pkg.weightKg),
      fragile: !!pkg.fragile, handling: L.cleanText(pkg.handling, 200),
    },
    quote: { lines: quote.lines, totalCents: quote.totalCents, distanceKm: quote.distanceKm,
      distanceIsEstimate: true, pricingVersion: quote.pricingVersion, pricingPlaceholder: quote.pricingPlaceholder },
    riderPayCents: quote.riderPayCents,
    cashToCollectCents: quote.totalCents,
    payment: { method: 'cash', collectFrom: d.payer === 'recipient' ? 'recipient' : 'sender', status: 'unpaid' },
    status: 'requested',
    statusTimes: { requested: FieldValue.serverTimestamp() },
    riderId: null, riderName: null, riderPhone: null, riderPlate: null,
    pinAttempts: 0, pinLocked: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  };

  await db().runTransaction(async (tx) => {
    const again = await tx.get(ref);
    if (again.exists) return;
    tx.create(ref, delivery);
    tx.set(ref.collection('customer').doc('pin'), { pin: pinRec.pin, createdAt: FieldValue.serverTimestamp() });
    tx.set(db().doc(`dash_secrets/${deliveryId}`), { pinHash: pinRec.hash, pinSalt: pinRec.salt });
    addEvent(tx, deliveryId, 'requested', auth.uid, 'customer');
  });
  await db().collection('dash_demand_events').add({ ...demandBase, kind: 'booked', deliveryId });
  return { deliveryId, pin: pinRec.pin, totalCents: quote.totalCents };
});

// ── 3. Customer cancels ──────────────────────────────────────────────────────
exports.dashCancelDelivery = onCall(async (req) => {
  const auth = requireAuth(req);
  const admin = isAdminToken(auth);
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const reason = L.cleanText(req.data && req.data.reason, 200) || null;
  const ref = db().doc(`dash_deliveries/${id}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
    const d = snap.data();
    if (!admin && d.customerId !== auth.uid) throw new HttpsError('permission-denied', 'Not your delivery.');
    if (d.type === 'market') throw new HttpsError('failed-precondition', 'This is a store order — cancel the order instead.');
    if (L.FINAL.includes(d.status)) throw new HttpsError('failed-precondition', 'This delivery is already closed.');
    if (!admin && !L.CUSTOMER_CANCELLABLE.includes(d.status)) {
      throw new HttpsError('failed-precondition', 'The rider already has your package. Contact support to change this delivery.');
    }
    tx.update(ref, statusPatch('cancelled', { cancelledBy: admin ? 'admin' : 'customer', cancelReason: reason }));
    if (d.riderId) tx.update(db().doc(`riders/${d.riderId}`), { activeDeliveryId: null });
    addEvent(tx, id, 'cancelled', auth.uid, admin ? 'admin' : 'customer', reason);
    if (admin) audit(tx, { actor: auth.uid, role: 'admin', action: 'dash.cancel', target: id, details: { reason } });
  });
  return { ok: true };
});

// ── 4. Rider accepts an open delivery (locked: only one rider can win) ──────
exports.dashAcceptDelivery = onCall(async (req) => {
  const auth = requireAuth(req);
  const pricing = await loadPricing();
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const ref = db().doc(`dash_deliveries/${id}`);
  const riderRef = db().doc(`riders/${auth.uid}`);
  await db().runTransaction(async (tx) => {
    const [snap, rider] = await Promise.all([tx.get(ref), tx.get(riderRef)]);
    if (!rider.exists || rider.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Your rider account is not approved yet.');
    if (!rider.get('isOnline')) throw new HttpsError('failed-precondition', 'Go online to accept deliveries.');
    if (pricing.requireMotorcycle && !rider.get('motorcycleId')) throw new HttpsError('failed-precondition', 'You need a VilleDash motorcycle assigned before taking deliveries.');
    if (rider.get('activeDeliveryId')) throw new HttpsError('failed-precondition', 'Finish your current delivery first.');
    if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
    const d = snap.data();
    if (d.status !== 'requested' || d.riderId) throw new HttpsError('already-exists', 'Another rider has already taken this delivery.');
    if (d.offeredTo && d.offeredTo !== auth.uid) throw new HttpsError('permission-denied', 'This delivery was offered to another rider.');
    tx.update(ref, statusPatch('assigned', {
      riderId: auth.uid, riderName: rider.get('name') || 'VilleDash rider',
      riderPhone: rider.get('phone') || null, riderPlate: rider.get('motorcyclePlate') || null,
      offeredTo: null,
    }));
    tx.update(riderRef, { activeDeliveryId: id });
    addEvent(tx, id, 'assigned', auth.uid, 'rider', 'accepted by rider');
  });
  return { ok: true };
});

// ── 5. Admin assigns / reassigns a rider (manual dispatch) ───────────────────
exports.dashAdminAssignRider = onCall(async (req) => {
  const auth = requireAdmin(req);
  const pricing = await loadPricing();
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const riderId = L.cleanText(req.data && req.data.riderId, 128);
  const ref = db().doc(`dash_deliveries/${id}`);
  const riderRef = db().doc(`riders/${riderId}`);
  await db().runTransaction(async (tx) => {
    const [snap, rider] = await Promise.all([tx.get(ref), tx.get(riderRef)]);
    if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
    if (!rider.exists || rider.get('status') !== 'approved') throw new HttpsError('failed-precondition', 'That rider is not approved.');
    if (pricing.requireMotorcycle && !rider.get('motorcycleId')) throw new HttpsError('failed-precondition', 'That rider has no motorcycle assigned.');
    const d = snap.data();
    if (!L.ADMIN_ASSIGNABLE.includes(d.status)) throw new HttpsError('failed-precondition', `Can't reassign a delivery that is ${d.status}.`);
    const busy = rider.get('activeDeliveryId');
    if (busy && busy !== id) throw new HttpsError('failed-precondition', 'That rider is on another delivery.');
    if (d.riderId && d.riderId !== riderId) {
      tx.update(db().doc(`riders/${d.riderId}`), { activeDeliveryId: null });
    }
    tx.update(ref, statusPatch('assigned', {
      riderId, riderName: rider.get('name') || 'VilleDash rider',
      riderPhone: rider.get('phone') || null, riderPlate: rider.get('motorcyclePlate') || null,
      offeredTo: null,
    }));
    tx.update(riderRef, { activeDeliveryId: id });
    addEvent(tx, id, 'assigned', auth.uid, 'admin', d.riderId ? `reassigned from ${d.riderId}` : 'assigned by admin');
    audit(tx, { actor: auth.uid, role: 'admin', action: d.riderId ? 'dash.reassign' : 'dash.assign', target: id, details: { riderId, previous: d.riderId || null } });
  });
  return { ok: true };
});

// ── 6. Rider moves the job forward ───────────────────────────────────────────
exports.dashRiderUpdateStatus = onCall(async (req) => {
  const auth = requireAuth(req);
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const to = L.cleanText(req.data && req.data.status, 20);
  const ref = db().doc(`dash_deliveries/${id}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
    const d = snap.data();
    if (d.riderId !== auth.uid) throw new HttpsError('permission-denied', 'This delivery is not assigned to you.');
    if (d.status === to) return; // repeated tap — nothing to do
    if (!L.canRiderMove(d.status, to)) throw new HttpsError('failed-precondition', `Can't go from ${d.status} to ${to}.`);
    // A store order can only be collected once the merchant has marked it ready.
    let orderRef = null;
    if (d.type === 'market' && to === 'collected') {
      orderRef = db().doc(`dash_orders/${d.orderId}`);
      const order = await tx.get(orderRef);
      if (!order.exists || order.get('status') !== 'ready') {
        throw new HttpsError('failed-precondition', 'The store hasn\u2019t marked this order ready yet.');
      }
    }
    tx.update(ref, statusPatch(to));
    if (orderRef) tx.update(orderRef, statusPatch('collected'));
    addEvent(tx, id, to, auth.uid, 'rider');
  });
  return { ok: true };
});

// ── 7. Rider enters the recipient's PIN ──────────────────────────────────────
exports.dashVerifyDropoffPin = onCall(async (req) => {
  const auth = requireAuth(req);
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const pin = String((req.data && req.data.pin) || '').trim();
  const ref = db().doc(`dash_deliveries/${id}`);
  const secretRef = db().doc(`dash_secrets/${id}`);
  const pricing = await loadPricing();
  const result = await db().runTransaction(async (tx) => {
    const [snap, secret] = await Promise.all([tx.get(ref), tx.get(secretRef)]);
    if (!snap.exists || !secret.exists) throw new HttpsError('not-found', 'Delivery not found.');
    const d = snap.data();
    if (d.riderId !== auth.uid) throw new HttpsError('permission-denied', 'This delivery is not assigned to you.');
    if (d.status !== 'at_dropoff') throw new HttpsError('failed-precondition', 'Mark yourself as arrived at the drop-off first.');
    if (d.pinLocked) throw new HttpsError('resource-exhausted', 'Too many wrong PINs. Call VilleDash support to complete this delivery.');
    if (!L.pinMatches(pin, secret.get('pinSalt'), secret.get('pinHash'))) {
      const attempts = (d.pinAttempts || 0) + 1;
      const locked = attempts >= pricing.pinMaxAttempts;
      tx.update(ref, { pinAttempts: attempts, pinLocked: locked, updatedAt: FieldValue.serverTimestamp() });
      addEvent(tx, id, d.status, auth.uid, 'rider', `wrong PIN (${attempts}/${pricing.pinMaxAttempts})`);
      return { ok: false, attemptsLeft: Math.max(0, pricing.pinMaxAttempts - attempts), locked };
    }
    completeDelivery(tx, ref, id, d, { by: auth.uid, role: 'rider', method: 'pin' });
    return { ok: true };
  });
  return result;
});

// Shared by PIN success and admin exceptions.
function completeDelivery(tx, ref, id, d, { by, role, method, note }) {
  tx.update(ref, statusPatch('delivered', {
    proofOfDelivery: { method, by, note: note || null, at: Timestamp.now() },
    'payment.status': 'collected_cash',
  }));
  tx.update(db().doc(`riders/${d.riderId}`), {
    activeDeliveryId: null, completedCount: FieldValue.increment(1),
  });
  addEvent(tx, id, 'delivered', by, role, method === 'pin' ? 'PIN verified' : `admin exception: ${note || ''}`);
  if (d.type === 'market') { completeMarketLedger(tx, id, d); return; }
  // Money records. Cash is collected by the rider, so the rider holds the full
  // fee and owes the platform the difference between the fee and their pay.
  const entries = [
    { kind: 'delivery_fee', direction: 'in', amountCents: d.quote.totalCents, party: 'customer', partyId: d.customerId, note: 'Cash collected by rider' },
    { kind: 'rider_earning', direction: 'payable', amountCents: d.riderPayCents || 0, party: 'rider', partyId: d.riderId },
    { kind: 'rider_cash_held', direction: 'receivable', amountCents: d.quote.totalCents - (d.riderPayCents || 0), party: 'rider', partyId: d.riderId, note: 'Cash fee minus rider pay, owed to VilleDash' },
  ];
  entries.forEach((e) => tx.set(db().collection('ledger_entries').doc(), {
    ...e, currency: 'JMD', deliveryId: id, service: 'dash', settled: false, createdAt: FieldValue.serverTimestamp(),
  }));
}

// Store order delivered: record product sales, the 15% commission, what the
// merchant is owed (settled every two weeks), the delivery fee and rider pay.
function completeMarketLedger(tx, id, d) {
  const m = d.market;
  tx.update(db().doc(`dash_orders/${d.orderId}`), statusPatch('delivered'));
  const base = { currency: 'JMD', deliveryId: id, orderId: d.orderId, merchantId: d.merchantId, service: 'dash_market', createdAt: FieldValue.serverTimestamp() };
  const entries = [
    { kind: 'product_sales', direction: 'in', amountCents: m.subtotalCents, party: 'merchant', partyId: d.merchantId, note: 'Gross merchant sales (cash collected by rider)' },
    { kind: 'commission', direction: 'revenue', amountCents: m.commissionCents, party: 'merchant', partyId: d.merchantId, note: `${m.commissionPct}% platform commission` },
    { kind: 'merchant_payable', direction: 'payable', amountCents: m.merchantPayableCents, party: 'merchant', partyId: d.merchantId,
      grossCents: m.subtotalCents, commissionCents: m.commissionCents, settled: false, settlementId: null },
    { kind: 'delivery_fee', direction: 'in', amountCents: d.quote.totalCents, party: 'customer', partyId: d.customerId },
    { kind: 'rider_earning', direction: 'payable', amountCents: d.riderPayCents || 0, party: 'rider', partyId: d.riderId, settled: false },
    { kind: 'rider_cash_held', direction: 'receivable', amountCents: d.cashToCollectCents - (d.riderPayCents || 0), party: 'rider', partyId: d.riderId, note: 'Cash collected minus rider pay, owed to VilleDash', settled: false },
  ];
  if (m.serviceCents) entries.push({ kind: 'service_fee', direction: 'in', amountCents: m.serviceCents, party: 'customer', partyId: d.customerId });
  entries.forEach((e) => tx.set(db().collection('ledger_entries').doc(), { ...base, ...e }));
}

// ── 8. Admin closes a delivery by exception (no PIN) or marks it failed ──────
exports.dashAdminResolveDelivery = onCall(async (req) => {
  const auth = requireAdmin(req);
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const action = req.data && req.data.action;
  const note = L.cleanText(req.data && req.data.note, 300);
  if (!note) throw new HttpsError('invalid-argument', 'Write a short reason — it goes in the audit log.');
  const ref = db().doc(`dash_deliveries/${id}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
    const d = snap.data();
    if (L.FINAL.includes(d.status)) throw new HttpsError('failed-precondition', 'Already closed.');
    if (action === 'complete') {
      if (!d.riderId || !['collected', 'to_dropoff', 'at_dropoff'].includes(d.status)) {
        throw new HttpsError('failed-precondition', 'Only a collected package can be marked delivered.');
      }
      completeDelivery(tx, ref, id, d, { by: auth.uid, role: 'admin', method: 'admin_exception', note });
    } else if (action === 'fail') {
      tx.update(ref, statusPatch('failed', { failReason: note }));
      if (d.riderId) tx.update(db().doc(`riders/${d.riderId}`), { activeDeliveryId: null });
      if (d.type === 'market') tx.update(db().doc(`dash_orders/${d.orderId}`), statusPatch('failed', { failReason: note }));
      addEvent(tx, id, 'failed', auth.uid, 'admin', note);
    } else {
      throw new HttpsError('invalid-argument', 'Unknown action.');
    }
    audit(tx, { actor: auth.uid, role: 'admin', action: `dash.${action}`, target: id, details: { note } });
  });
  return { ok: true };
});

// ── 9. Report a problem (rider or customer) ──────────────────────────────────
const ISSUE_CATEGORIES = {
  rider: ['sender_unreachable', 'merchant_not_ready', 'recipient_unavailable', 'wrong_address', 'damaged_package', 'motorcycle_breakdown', 'other'],
  customer: ['missing', 'late', 'wrong_item', 'damaged', 'wrong_charge', 'rider_conduct', 'other'],
};
exports.dashReportIssue = onCall(async (req) => {
  const auth = requireAuth(req);
  const id = L.cleanText(req.data && req.data.deliveryId, 40);
  const category = L.cleanText(req.data && req.data.category, 40);
  const description = L.cleanText(req.data && req.data.description, 1000);
  const snap = await db().doc(`dash_deliveries/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
  const d = snap.data();
  const role = d.riderId === auth.uid ? 'rider' : d.customerId === auth.uid ? 'customer' : null;
  if (!role) throw new HttpsError('permission-denied', 'Not your delivery.');
  if (!ISSUE_CATEGORIES[role].includes(category)) throw new HttpsError('invalid-argument', 'Choose what went wrong.');
  const ref = await db().collection('support_cases').add({
    service: 'dash', deliveryId: id, reporterId: auth.uid, reporterRole: role,
    category, description, status: 'open', assignedTo: null,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return { caseId: ref.id };
});

// ── 10. Referral code check (fixes the VilleCabs referral bug) ───────────────
// Customers can't query other customers' records, so the old in-app lookup was
// always refused. This checks the code with admin rights and confirms the
// caller hasn't completed a ride yet. Returns only what the app needs.
exports.checkReferralCode = onCall(async (req) => {
  const auth = requireAuth(req);
  const code = L.cleanText(req.data && req.data.code, 20).toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(code)) return { valid: false };
  const hit = await db().collection('customers').where('referralCode', '==', code).limit(1).get();
  if (hit.empty || hit.docs[0].id === auth.uid) return { valid: false };
  const prior = await db().collection('bookings')
    .where('customerId', '==', auth.uid).where('status', '==', 'completed').limit(1).get();
  return { valid: true, eligible: prior.empty, referrerId: prior.empty ? hit.docs[0].id : null };
});

// ── Push notifications ───────────────────────────────────────────────────────
exports.dashNotifyNewDelivery = onDocumentCreated('dash_deliveries/{id}', async (event) => {
  const d = event.data && event.data.data();
  if (!d || d.status !== 'requested') return;
  const riders = await db().collection('riders')
    .where('status', '==', 'approved').where('isOnline', '==', true).get();
  const area = d.pickup && d.pickup.address ? ` from ${d.pickup.address.split(',')[0]}` : '';
  await Promise.all(riders.docs
    .filter((r) => !r.get('activeDeliveryId'))
    .map((r) => pushTo('riders', r.id, '📦 New VilleDash delivery', `A package needs collecting${area}. Open VilleDash to accept.`, { tag: 'vd-new', deliveryId: event.params.id })));
});

const CUSTOMER_MESSAGES = {
  assigned:   ['🛵 Rider assigned', (d) => `${d.riderName || 'Your rider'} is collecting your ${d.type === 'market' ? 'order' : 'package'}.`],
  at_pickup:  ['📍 Rider at pickup', () => 'Your rider has arrived at the pickup point.'],
  collected:  ['📦 On its way', (d) => (d.type === 'market' ? `Your ${d.merchantName || 'store'} order is on its way.` : 'Your package is on its way.')],
  at_dropoff: ['🏁 Rider has arrived', (d) => (d.type === 'market' ? 'Your rider is outside. Have your delivery PIN ready.' : 'Your rider is at the drop-off. The recipient will need the delivery PIN.')],
  delivered:  ['✅ Delivered', () => 'Your package was delivered. Thanks for using VilleDash!'],
  cancelled:  ['Delivery cancelled', (d) => (d.cancelledBy === 'admin' ? 'VilleDash cancelled this delivery. Contact support if you have questions.' : 'Your delivery was cancelled.')],
  failed:     ['⚠️ Delivery problem', () => 'We couldn’t complete your delivery. VilleDash support will contact you.'],
};
exports.dashNotifyStatusChange = onDocumentUpdated('dash_deliveries/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status) return;
  const m = CUSTOMER_MESSAGES[after.status];
  const jobs = [];
  if (m && !(after.status === 'cancelled' && after.cancelledBy === 'customer')) {
    jobs.push(pushTo('customers', after.customerId, m[0], m[1](after), { tag: `vd-${after.status}`, deliveryId: event.params.id }));
  }
  // Tell the rider when a job they were on is cancelled or taken off them.
  if (before.riderId && (after.status === 'cancelled' || after.riderId !== before.riderId)) {
    jobs.push(pushTo('riders', before.riderId, 'Delivery changed', 'A delivery you were assigned has been cancelled or reassigned.', { tag: 'vd-changed' }));
  }
  if (after.riderId && after.riderId !== before.riderId && after.status === 'assigned') {
    jobs.push(pushTo('riders', after.riderId, '📦 Delivery assigned to you', 'Open VilleDash to start the pickup.', { tag: 'vd-assigned', deliveryId: event.params.id }));
  }
  await Promise.all(jobs);
});

// Marketplace (stores, orders, settlements)
Object.assign(exports, require('./market'));

// Fleet and rider shifts
Object.assign(exports, require('./fleet'));
