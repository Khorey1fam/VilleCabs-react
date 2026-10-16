/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash automatic dispatch — timed offers, nearest rider first.
   FILE LOCATION: functions/dash/dispatch.js

   A new delivery is offered to the nearest free rider (online, approved, with
   a motorcycle). They have `offerSeconds` to accept. If they decline or the
   offer runs out it goes to the next nearest. After `maxOfferRounds` riders, or
   when nobody is left, the job opens to every online rider and is flagged for
   a dispatcher. Admins can still assign by hand at any time.
   ═══════════════════════════════════════════════════════════════════════════ */

const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const L = require('./logic');
const { db, loadPricing, pushTo } = require('./common');

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

async function freeRiders() {
  const snap = await db().collection('riders').where('status', '==', 'approved').where('isOnline', '==', true).get();
  return snap.docs.map((d) => {
    const r = d.data();
    const loc = r.lastLocation;
    return { id: d.id, ...r, lastLocation: loc ? { lat: loc.lat, lng: loc.lng, atMs: ms(loc.at) } : null };
  });
}

/** Offer the delivery to the next rider in line (or open it to everyone). */
async function offerNext(deliveryId, { now = Date.now() } = {}) {
  const pricing = await loadPricing();
  const riders = await freeRiders();
  const ref = db().doc(`dash_deliveries/${deliveryId}`);
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { skipped: 'missing' };
    const d = snap.data();
    if (d.status !== 'requested' || d.riderId) return { skipped: 'taken' };
    // A live offer that hasn't run out yet stays put.
    if (d.offeredTo && ms(d.offerExpiresAt) > now) return { skipped: 'live-offer' };
    const tried = Array.isArray(d.offeredRiders) ? d.offeredRiders : [];
    const exclude = [...tried, ...(Array.isArray(d.declinedBy) ? d.declinedBy : [])];
    const round = d.offerRound || 0;
    const ranked = L.rankRiders(riders, d.pickup, { exclude, requireMotorcycle: pricing.requireMotorcycle, now });
    if (round >= pricing.maxOfferRounds || ranked.length === 0) {
      if (d.dispatchOpen) return { skipped: 'already-open' };
      tx.update(ref, { offeredTo: null, offerExpiresAt: null, dispatchOpen: true, needsDispatcher: true, updatedAt: FieldValue.serverTimestamp() });
      return { opened: true };
    }
    const next = ranked[0];
    tx.update(ref, {
      offeredTo: next.id,
      offerExpiresAt: Timestamp.fromMillis(now + pricing.offerSeconds * 1000),
      offeredRiders: FieldValue.arrayUnion(next.id),
      offerRound: round + 1,
      offerKm: Number.isFinite(next.km) ? Math.round(next.km * 10) / 10 : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { offeredTo: next.id };
  });
  if (result.offeredTo) {
    const snap = await ref.get();
    const d = snap.data();
    const from = d.type === 'market' ? d.merchantName : (d.pickup.address || '').split(',')[0];
    await pushTo('riders', result.offeredTo, '📦 Delivery offer for you',
      `Pickup at ${from}. You have ${pricing.offerSeconds} seconds to accept.`, { tag: 'vd-offer', deliveryId });
  } else if (result.opened) {
    const snap = await ref.get();
    const d = snap.data();
    const from = d.type === 'market' ? d.merchantName : (d.pickup.address || '').split(',')[0];
    await Promise.all(riders.filter((r) => !r.activeDeliveryId).map((r) => pushTo('riders', r.id, '📦 Open delivery',
      `A job from ${from} is open to any rider. First to accept gets it.`, { tag: 'vd-open', deliveryId })));
  }
  return result;
}

/** Every minute: move expired offers on to the next rider. */
async function sweepOffers(now = Date.now()) {
  const snap = await db().collection('dash_deliveries').where('status', '==', 'requested').get();
  let moved = 0;
  for (const d of snap.docs) {
    const exp = ms(d.get('offerExpiresAt'));
    if (d.get('offeredTo') && exp != null && exp <= now) {
      await d.ref.update({ declinedBy: FieldValue.arrayUnion(d.get('offeredTo')), lastOfferOutcome: 'expired' });
      await offerNext(d.id, { now });
      moved += 1;
    } else if (!d.get('offeredTo') && !d.get('dispatchOpen')) {
      // e.g. no rider was free when it was created — try again now.
      await offerNext(d.id, { now });
    }
  }
  return { moved };
}

module.exports = { offerNext, sweepOffers };
