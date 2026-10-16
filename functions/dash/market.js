/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash Marketplace — Cloud Functions
   FILE LOCATION: functions/dash/market.js   (loaded from functions/dash/index.js)

   Order lifecycle (dash_orders) is kept separate from the delivery
   (dash_deliveries). The delivery is created when the merchant accepts.

     awaiting_merchant → accepted → preparing → ready → collected → delivered
     side exits: rejected (merchant), cancelled (customer/admin), failed

   Money: cash on delivery. The rider collects the full order total, keeps
   their pay and owes VilleDash the rest. VilleDash pays merchants their sales
   minus commission (15%) every settlement period (14 days).

   Collections
     merchants/{ownerUid}               one store per owner login (v1)
       /products/{productId}            priceCents, options, stock, available
     dash_orders/{id}                   customer + merchant + admin read
       /customer/pin                    drop-off PIN, customer only
     settlements/{id}                   merchant payouts (admin creates)
   ═══════════════════════════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');
const L = require('./logic');
const {
  db, requireAuth, isAdminToken, requireAdmin, loadPricing, dashEnabledFor,
  audit, statusPatch, quoteErrorToHttps, pushTo, ridersAvailable,
} = require('./common');

function cartErrorToHttps(e) {
  if (e instanceof L.CartError) return new HttpsError('failed-precondition', e.message, { code: e.code });
  return quoteErrorToHttps(e);
}

async function loadOpenMerchant(merchantId) {
  const snap = await db().doc(`merchants/${merchantId}`).get();
  if (!snap.exists || snap.get('status') !== 'approved') throw new HttpsError('not-found', 'This store is not on VilleDash.');
  const m = snap.data();
  if (m.isAcceptingOrders === false) throw new HttpsError('failed-precondition', `${m.name} has paused orders for now.`);
  if (!L.isOpenAt(m.hours)) throw new HttpsError('failed-precondition', `${m.name} is closed right now.`);
  if (!L.isCoord(m.location)) throw new HttpsError('failed-precondition', `${m.name} hasn’t set a pickup location yet.`);
  return m;
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 50).map((it) => ({
    productId: L.cleanText(it && it.productId, 60),
    qty: Number(it && it.qty),
    options: it && typeof it.options === 'object' && !Array.isArray(it.options) ? it.options : {},
    note: L.cleanText(it && it.note, 200),
  }));
}

function priceOrder({ merchant, cart, dropoff, pricing }) {
  const q = L.quoteParcel({ pickup: merchant.location, dropoff, size: pricing.marketDeliverySize }, pricing);
  const commissionPct = Number.isFinite(merchant.commissionPct) ? merchant.commissionPct : pricing.merchantCommissionPct;
  const split = L.marketSplit({
    subtotalCents: cart.subtotalCents, deliveryCents: q.totalCents, serviceCents: pricing.marketServiceFeeCents || 0,
    riderPayCents: q.riderPayCents, commissionPct,
  });
  return { q, split, commissionPct };
}

// ── Quote a cart (read-only) ─────────────────────────────────────────────────
exports.marketQuoteOrder = onCall(async (req) => {
  const auth = requireAuth(req);
  if (!(await dashEnabledFor(auth))) throw new HttpsError('failed-precondition', 'VilleDash is not open yet.');
  const d = req.data || {};
  const merchantId = L.cleanText(d.merchantId, 128);
  const merchant = await loadOpenMerchant(merchantId);
  const items = cleanItems(d.items);
  const ids = [...new Set(items.map((i) => i.productId))];
  const snaps = await Promise.all(ids.map((pid) => db().doc(`merchants/${merchantId}/products/${pid}`).get()));
  const products = {}; snaps.forEach((s, i) => { if (s.exists) products[ids[i]] = s.data(); });
  const pricing = await loadPricing();
  try {
    const cart = L.priceCart(items, products);
    if (!L.isCoord(d.dropoff)) throw new L.QuoteError('bad-location', 'Choose your delivery address.');
    const { q, split } = priceOrder({ merchant, cart, dropoff: d.dropoff, pricing });
    return {
      lines: cart.lines, subtotalCents: cart.subtotalCents, deliveryCents: q.totalCents,
      serviceCents: pricing.marketServiceFeeCents || 0, totalCents: split.totalCents,
      distanceKm: q.distanceKm, pricingPlaceholder: q.pricingPlaceholder,
    };
  } catch (e) { throw cartErrorToHttps(e); }
});

// ── Place an order ───────────────────────────────────────────────────────────
exports.marketCreateOrder = onCall(async (req) => {
  const auth = requireAuth(req);
  if (!(await dashEnabledFor(auth))) throw new HttpsError('failed-precondition', 'VilleDash is not open yet.');
  const d = req.data || {};
  const key = L.cleanText(d.idempotencyKey, 64);
  if (key.length < 8) throw new HttpsError('invalid-argument', 'Missing request key.');
  const hash = crypto.createHash('sha256').update(`order:${auth.uid}:${key}`).digest('hex').slice(0, 19).toUpperCase();
  const orderId = `O${hash}`;
  const deliveryId = `D${hash}`;          // reserved now so the PIN can be issued at checkout
  const orderRef = db().doc(`dash_orders/${orderId}`);
  const existing = await orderRef.get();
  if (existing.exists) {
    if (existing.get('customerId') !== auth.uid) throw new HttpsError('already-exists', 'Please try again.');
    const pin = await orderRef.collection('customer').doc('pin').get();
    return { orderId, pin: pin.exists ? pin.get('pin') : null, duplicate: true };
  }

  const cust = await db().doc(`customers/${auth.uid}`).get();
  if (!cust.exists) throw new HttpsError('failed-precondition', 'Please finish setting up your VILLE account first.');
  if (['banned', 'suspended', 'deactivated'].includes(cust.get('status'))) throw new HttpsError('permission-denied', 'Your account cannot place orders. Contact support.');

  const merchantId = L.cleanText(d.merchantId, 128);
  const merchant = await loadOpenMerchant(merchantId);
  const dropoff = d.dropoff || {};
  if (!L.isCoord(dropoff)) throw new HttpsError('invalid-argument', 'Choose your delivery address.');
  const phone = L.cleanPhone(d.phone) || L.cleanPhone(cust.get('phone'));
  if (!phone) throw new HttpsError('invalid-argument', 'Add a phone number so the rider can reach you.');
  const items = cleanItems(d.items);
  const pricing = await loadPricing();

  const riders = await ridersAvailable(pricing);
  const demand = { type: 'market', customerId: auth.uid, merchantId, dropoffArea: L.coarseArea(dropoff),
    ridersOnline: riders.online, ridersFree: riders.free, at: FieldValue.serverTimestamp() };
  if (riders.online === 0 && !pricing.allowQueueWhenNoRiders) {
    await db().collection('dash_demand_events').add({ ...demand, kind: 'unserved', reason: 'none_online' });
    throw new HttpsError('unavailable', 'No VilleDash riders are online right now, so stores can’t take orders. Nothing has been charged.');
  }

  const pinRec = L.newPinRecord();
  const result = await db().runTransaction(async (tx) => {
    const again = await tx.get(orderRef);
    if (again.exists) return { duplicate: true };
    const ids = [...new Set(items.map((i) => i.productId))];
    const refs = ids.map((pid) => db().doc(`merchants/${merchantId}/products/${pid}`));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const products = {}; snaps.forEach((s, i) => { if (s.exists) products[ids[i]] = s.data(); });
    let cart; let priced;
    try {
      // Stock is checked against the total quantity of each product across lines.
      const totals = {};
      items.forEach((i) => { totals[i.productId] = (totals[i.productId] || 0) + (Number(i.qty) || 0); });
      Object.entries(totals).forEach(([pid, qty]) => {
        const p = products[pid];
        if (p && Number.isInteger(p.stock) && p.stock < qty) throw new L.CartError('stock', p.stock > 0 ? `Only ${p.stock} × ${p.name} left.` : `${p.name} is sold out.`);
      });
      cart = L.priceCart(items, products);
      priced = priceOrder({ merchant, cart, dropoff, pricing });
    } catch (e) { throw cartErrorToHttps(e); }
    const { q, split, commissionPct } = priced;
    if (Number.isInteger(d.expectedTotalCents) && d.expectedTotalCents !== split.totalCents) {
      throw new HttpsError('aborted', 'Prices or availability changed. Please review your order.', { totalCents: split.totalCents });
    }
    // Reserve stock now; it is put back if the order is rejected or cancelled.
    const stockTaken = {};
    Object.entries(products).forEach(([pid, p]) => {
      if (Number.isInteger(p.stock)) {
        const qty = items.filter((i) => i.productId === pid).reduce((s, i) => s + i.qty, 0);
        stockTaken[pid] = qty;
        tx.update(db().doc(`merchants/${merchantId}/products/${pid}`), { stock: FieldValue.increment(-qty) });
      }
    });
    tx.create(orderRef, {
      customerId: auth.uid, customerName: L.cleanText(cust.get('name'), 80), customerPhone: phone,
      merchantId, merchantName: merchant.name, merchantPhone: merchant.phone || null,
      items: cart.lines, stockTaken,
      subtotalCents: cart.subtotalCents, deliveryCents: q.totalCents, serviceCents: pricing.marketServiceFeeCents || 0,
      totalCents: split.totalCents, commissionPct, commissionCents: split.commissionCents,
      merchantPayableCents: split.merchantPayableCents, riderPayCents: q.riderPayCents, distanceKm: q.distanceKm,
      dropoff: {
        address: L.cleanText(dropoff.address, 200), lat: dropoff.lat, lng: dropoff.lng,
        landmark: L.cleanText(dropoff.landmark, 150), instructions: L.cleanText(dropoff.instructions, 300),
      },
      note: L.cleanText(d.note, 300),
      payment: { method: 'cash', status: 'unpaid' },
      status: 'awaiting_merchant', statusTimes: { awaiting_merchant: FieldValue.serverTimestamp() },
      deliveryId: null, reservedDeliveryId: deliveryId, prepMinutes: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(orderRef.collection('customer').doc('pin'), { pin: pinRec.pin, createdAt: FieldValue.serverTimestamp() });
    tx.set(db().doc(`dash_secrets/${deliveryId}`), { pinHash: pinRec.hash, pinSalt: pinRec.salt });
    return { totalCents: split.totalCents };
  });
  if (result.duplicate) {
    const pin = await orderRef.collection('customer').doc('pin').get();
    return { orderId, pin: pin.exists ? pin.get('pin') : null, duplicate: true };
  }
  await db().collection('dash_demand_events').add({ ...demand, kind: 'booked', orderId, quotedCents: result.totalCents });
  return { orderId, pin: pinRec.pin, totalCents: result.totalCents };
});

// Puts reserved stock back. Reads must happen before writes in a transaction,
// so callers pass in product snapshots they already read.
function restoreStock(tx, order, productSnaps) {
  Object.entries(order.stockTaken || {}).forEach(([pid, qty]) => {
    const s = productSnaps[pid];
    if (s && s.exists && qty > 0) tx.update(s.ref, { stock: FieldValue.increment(qty) });
  });
}
async function readStockProducts(tx, order) {
  const out = {};
  const ids = Object.keys(order.stockTaken || {});
  const snaps = await Promise.all(ids.map((pid) => tx.get(db().doc(`merchants/${order.merchantId}/products/${pid}`))));
  snaps.forEach((s, i) => { out[ids[i]] = s; });
  return out;
}

// ── Merchant moves an order forward ──────────────────────────────────────────
exports.marketMerchantUpdateOrder = onCall(async (req) => {
  const auth = requireAuth(req);
  const admin = isAdminToken(auth);
  const orderId = L.cleanText(req.data && req.data.orderId, 40);
  const action = L.cleanText(req.data && req.data.action, 20);
  const reason = L.cleanText(req.data && req.data.reason, 200);
  const pricing = await loadPricing();
  const orderRef = db().doc(`dash_orders/${orderId}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Order not found.');
    const o = snap.data();
    if (!admin && o.merchantId !== auth.uid) throw new HttpsError('permission-denied', 'Not your store’s order.');
    const allowed = L.MERCHANT_STEPS[o.status] || [];
    if (!allowed.includes(action)) throw new HttpsError('failed-precondition', `Can't ${action} an order that is ${o.status.replace('_', ' ')}.`);

    if (action === 'rejected') {
      if (!reason) throw new HttpsError('invalid-argument', 'Tell the customer why (e.g. item sold out).');
      const products = await readStockProducts(tx, o);
      restoreStock(tx, o, products);
      tx.update(orderRef, statusPatch('rejected', { rejectReason: reason }));
    } else if (action === 'accepted') {
      const mins = Number(req.data && req.data.prepMinutes);
      if (!Number.isInteger(mins) || mins < 1 || mins > pricing.maxPrepMinutes) {
        throw new HttpsError('invalid-argument', `Prep time must be 1–${pricing.maxPrepMinutes} minutes.`);
      }
      const merchant = await tx.get(db().doc(`merchants/${o.merchantId}`));
      const m = merchant.data();
      const deliveryId = o.reservedDeliveryId;
      const readyAt = Timestamp.fromDate(new Date(Date.now() + mins * 60000));
      tx.update(orderRef, statusPatch('accepted', { prepMinutes: mins, estimatedReadyAt: readyAt, deliveryId }));
      // Create the delivery now so a rider can head over while food is prepared.
      tx.create(db().doc(`dash_deliveries/${deliveryId}`), {
        type: 'market', orderId, merchantId: o.merchantId, merchantName: o.merchantName,
        customerId: o.customerId, customerName: o.customerName,
        pickup: {
          address: m.address || o.merchantName, lat: m.location.lat, lng: m.location.lng,
          contactName: o.merchantName, contactPhone: m.phone || '', landmark: '', instructions: L.cleanText(m.pickupInstructions, 300),
        },
        dropoff: { ...o.dropoff, recipientName: o.customerName },
        package: { category: 'retail', description: `${o.merchantName} order · ${o.items.reduce((s, i) => s + i.qty, 0)} item(s)`, size: pricing.marketDeliverySize, weightKg: null, fragile: false, handling: '' },
        quote: { lines: [], totalCents: o.deliveryCents, distanceKm: o.distanceKm, distanceIsEstimate: true },
        riderPayCents: o.riderPayCents, cashToCollectCents: o.totalCents,
        market: {
          subtotalCents: o.subtotalCents, serviceCents: o.serviceCents, commissionPct: o.commissionPct,
          commissionCents: o.commissionCents, merchantPayableCents: o.merchantPayableCents,
        },
        merchantReady: false, estimatedReadyAt: readyAt,
        payment: { method: 'cash', collectFrom: 'recipient', status: 'unpaid' },
        status: 'requested', statusTimes: { requested: FieldValue.serverTimestamp() },
        riderId: null, riderName: null, riderPhone: null, riderPlate: null,
        pinAttempts: 0, pinLocked: false,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(db().doc(`dash_deliveries/${deliveryId}/private/contact`), {
        customerPhone: o.customerPhone, senderPhone: m.phone || '', recipientPhone: o.customerPhone, altPhone: '',
      });
    } else {
      tx.update(orderRef, statusPatch(action));
      if (action === 'ready' && o.deliveryId) tx.update(db().doc(`dash_deliveries/${o.deliveryId}`), { merchantReady: true, updatedAt: FieldValue.serverTimestamp() });
    }
    if (admin && o.merchantId !== auth.uid) audit(tx, { actor: auth.uid, role: 'admin', action: `market.${action}`, target: orderId, details: { reason } });
  });
  return { ok: true };
});

// ── Cancel an order (customer before preparing; admin until collected) ──────
exports.marketCancelOrder = onCall(async (req) => {
  const auth = requireAuth(req);
  const admin = isAdminToken(auth);
  const orderId = L.cleanText(req.data && req.data.orderId, 40);
  const reason = L.cleanText(req.data && req.data.reason, 200) || null;
  const orderRef = db().doc(`dash_orders/${orderId}`);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Order not found.');
    const o = snap.data();
    if (!admin && o.customerId !== auth.uid) throw new HttpsError('permission-denied', 'Not your order.');
    const customerOk = ['awaiting_merchant', 'accepted'];
    const adminOk = ['awaiting_merchant', 'accepted', 'preparing', 'ready'];
    if (!(admin ? adminOk : customerOk).includes(o.status)) {
      throw new HttpsError('failed-precondition', admin ? 'This order can no longer be cancelled.' : 'The store is already preparing your order. Contact support to cancel.');
    }
    const delRef = o.deliveryId ? db().doc(`dash_deliveries/${o.deliveryId}`) : null;
    const del = delRef ? await tx.get(delRef) : null;
    if (del && del.exists && ['collected', 'to_dropoff', 'at_dropoff', 'delivered'].includes(del.get('status'))) {
      throw new HttpsError('failed-precondition', 'The rider already has this order.');
    }
    const products = await readStockProducts(tx, o);
    restoreStock(tx, o, products);
    tx.update(orderRef, statusPatch('cancelled', { cancelledBy: admin ? 'admin' : 'customer', cancelReason: reason }));
    if (del && del.exists && !L.FINAL.includes(del.get('status'))) {
      tx.update(delRef, statusPatch('cancelled', { cancelledBy: admin ? 'admin' : 'customer', cancelReason: reason }));
      if (del.get('riderId')) tx.update(db().doc(`riders/${del.get('riderId')}`), { activeDeliveryId: null });
    }
    if (admin) audit(tx, { actor: auth.uid, role: 'admin', action: 'market.cancel', target: orderId, details: { reason } });
  });
  return { ok: true };
});

// ── Settlements (admin) ──────────────────────────────────────────────────────
exports.marketCreateSettlement = onCall(async (req) => {
  const auth = requireAdmin(req);
  const merchantId = L.cleanText(req.data && req.data.merchantId, 128);
  const upTo = new Date(req.data && req.data.upTo ? req.data.upTo : Date.now());
  if (Number.isNaN(upTo.getTime())) throw new HttpsError('invalid-argument', 'Bad end date.');
  const merchant = await db().doc(`merchants/${merchantId}`).get();
  if (!merchant.exists) throw new HttpsError('not-found', 'Merchant not found.');
  const q = db().collection('ledger_entries')
    .where('kind', '==', 'merchant_payable').where('partyId', '==', merchantId).where('settled', '==', false);
  const ref = db().collection('settlements').doc();
  const out = await db().runTransaction(async (tx) => {
    const res = await tx.get(q);
    const ms = (e) => (e.get('createdAt') && e.get('createdAt').toMillis ? e.get('createdAt').toMillis() : 0);
    const entries = res.docs.filter((e) => ms(e) <= upTo.getTime());
    if (entries.length === 0) throw new HttpsError('failed-precondition', 'Nothing to settle for this period.');
    const sum = (f) => entries.reduce((s, e) => s + (e.get(f) || 0), 0);
    const rec = {
      merchantId, merchantName: merchant.get('name'),
      periodStart: Timestamp.fromMillis(Math.min(...entries.map(ms))), periodEnd: Timestamp.fromDate(upTo),
      orderCount: entries.length,
      grossSalesCents: sum('grossCents'), commissionCents: sum('commissionCents'),
      adjustmentsCents: 0, refundsCents: 0, netPayableCents: sum('amountCents'),
      status: 'pending_payment', createdBy: auth.uid, createdAt: FieldValue.serverTimestamp(),
      entryIds: entries.map((e) => e.id),
    };
    tx.set(ref, rec);
    entries.forEach((e) => tx.update(e.ref, { settled: true, settlementId: ref.id }));
    audit(tx, { actor: auth.uid, role: 'admin', action: 'market.settlement.create', target: ref.id, details: { merchantId, netPayableCents: rec.netPayableCents } });
    return { settlementId: ref.id, netPayableCents: rec.netPayableCents, orderCount: rec.orderCount };
  });
  return out;
});

exports.marketMarkSettlementPaid = onCall(async (req) => {
  const auth = requireAdmin(req);
  const id = L.cleanText(req.data && req.data.settlementId, 60);
  const reference = L.cleanText(req.data && req.data.reference, 120);
  if (!reference) throw new HttpsError('invalid-argument', 'Enter the payment reference (bank transfer or receipt number).');
  const ref = db().doc(`settlements/${id}`);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Settlement not found.');
    if (s.get('status') !== 'pending_payment') throw new HttpsError('failed-precondition', 'Already marked paid.');
    tx.update(ref, { status: 'paid', paymentReference: reference, paidAt: FieldValue.serverTimestamp(), paidBy: auth.uid });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'market.settlement.paid', target: id, details: { reference } });
  });
  return { ok: true };
});

// ── Notifications ────────────────────────────────────────────────────────────
exports.marketNotifyNewOrder = onDocumentCreated('dash_orders/{id}', async (event) => {
  const o = event.data && event.data.data();
  if (!o) return;
  const count = (o.items || []).reduce((s, i) => s + i.qty, 0);
  await pushTo('merchants', o.merchantId, '🛍️ New VilleDash order', `${count} item(s) · accept it in your VilleDash store portal.`, { tag: 'vd-order', orderId: event.params.id });
});

const ORDER_MESSAGES = {
  accepted: ['✅ Order accepted', (o) => `${o.merchantName} is preparing your order (about ${o.prepMinutes} min).`],
  ready:    ['🍽️ Order ready', (o) => `${o.merchantName} has your order ready for the rider.`],
  rejected: ['Order not accepted', (o) => `${o.merchantName} couldn’t take your order${o.rejectReason ? `: ${o.rejectReason}` : ''}. You have not been charged.`],
};
exports.marketNotifyOrderChange = onDocumentUpdated('dash_orders/{id}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.status === after.status) return;
  const jobs = [];
  const m = ORDER_MESSAGES[after.status];
  if (m) jobs.push(pushTo('customers', after.customerId, m[0], m[1](after), { tag: `vd-order-${after.status}`, orderId: event.params.id }));
  if (after.status === 'cancelled' && after.cancelledBy === 'customer') {
    jobs.push(pushTo('merchants', after.merchantId, 'Order cancelled', 'A customer cancelled their order. Any reserved stock was put back.', { tag: 'vd-order-cancel' }));
  }
  if (after.status === 'ready' && after.deliveryId) {
    const del = await db().doc(`dash_deliveries/${after.deliveryId}`).get();
    if (del.exists && del.get('riderId')) jobs.push(pushTo('riders', del.get('riderId'), '🍽️ Order ready', `${after.merchantName} has marked your pickup ready.`, { tag: 'vd-ready' }));
  }
  await Promise.all(jobs);
});
