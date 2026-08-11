/* ═══════════════════════════════════════════════════════════════════════════
   VilleCabs — Cloud Functions
   FILE LOCATION: functions/index.js

   This sends a REAL background push (phone locked / app closed) to the customer
   when their driver comes within ~2 minutes of the pickup point. It complements
   the in-app alert already in your React code, which only fires while the app
   is open.

   HOW IT WORKS
   ------------
   • Your driver app writes the driver's live GPS to booking.driverLocation
     ({lat,lng}) as they drive. (Your LiveRide/DriverActive screens already
     display driverLocation, so this field is being written.)
   • Each time a booking updates, this function measures the distance from the
     driver to the pickup. At ≤ ~1 km (about 2 minutes at town speed) it sends
     one push to the customer's saved fcmToken, then sets twoMinPushSent=true so
     it never double-fires. The flag resets if the ride completes/cancels.

   REQUIREMENTS
   ------------
   • Node 18+ (set in functions/package.json "engines").
   • firebase-functions v4+ and firebase-admin v12+ (v2 API used below).
   • The customer's token is stored at customers/{uid}.fcmToken by the
     registerCustomerPushToken() helper already in your App.js.
   ═══════════════════════════════════════════════════════════════════════════ */

const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getFirestore }      = require('firebase-admin/firestore');
const { getMessaging }      = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

// Haversine distance in kilometres.
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

exports.notifyDriverTwoMinutesAway = onDocumentUpdated(
  'bookings/{bookingId}',
  async (event) => {
    const before = event.data.before.data() || {};
    const after  = event.data.after.data()  || {};

    // Reset the guard once the ride is over, so a future ride can notify again.
    if (['completed', 'cancelled'].includes(after.status)) {
      if (after.twoMinPushSent) {
        await event.data.after.ref.update({ twoMinPushSent: false }).catch(() => {});
      }
      return;
    }

    // Only during an active pickup approach.
    if (!['active', 'enroute', 'arrived'].includes(after.status)) return;
    if (after.driverArrived) return;          // already there — no "2 min" push
    if (after.twoMinPushSent) return;         // already notified this ride
    if (!after.driverLocation || !after.pickup) return;
    if (!after.customerId) return;

    // Fire only when the driver actually got closer on this update.
    const km = distanceKm(after.driverLocation, after.pickup);
    if (km > 1.0) return;                     // ~1 km ≈ 2 min at town speed

    // Look up the customer's push token.
    const custSnap = await db.doc(`customers/${after.customerId}`).get();
    const token = custSnap.exists ? custSnap.get('fcmToken') : null;

    // Mark as sent regardless, so we don't spam on every GPS tick.
    await event.data.after.ref.update({ twoMinPushSent: true }).catch(() => {});

    if (!token) return;

    const driverName = after.driverName || 'Your driver';
    await getMessaging().send({
      token,
      notification: {
        title: '🚗 Your driver is 2 minutes away!',
        body: `${driverName} is almost at your pickup. Get ready!`,
      },
      data: {
        title: '🚗 Your driver is 2 minutes away!',
        body: `${driverName} is almost at your pickup. Get ready!`,
        tag: 'vc-2min',
        url: '/',
        bookingId: event.params.bookingId,
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { icon: '/logo.png', badge: '/logo.png' },
        fcmOptions: { link: '/' },
      },
    }).catch((err) => {
      console.error('FCM send failed:', err && err.message);
    });
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   ADDITIONAL RIDE-STAGE NOTIFICATIONS
   Each sends a REAL background push (works when the app is closed / phone
   locked), complementing the in-app alerts in the React code.
   ═══════════════════════════════════════════════════════════════════════════ */

// Send one push to a single token. Silently no-ops on a missing token.
async function pushToToken(token, title, body, extra = {}) {
  if (!token) return;
  await getMessaging().send({
    token,
    notification: { title, body },
    data: { title, body, url: '/', ...extra },
    webpush: {
      headers: { Urgency: 'high' },
      notification: { icon: '/logo.png', badge: '/logo.png' },
      fcmOptions: { link: '/' },
    },
  }).catch((err) => console.error('FCM send failed:', err && err.message));
}

// Send the same push to many tokens at once (used for broadcasting a new ride
// request to all online drivers). Handles the 500-token multicast limit.
async function pushToMany(tokens, title, body, extra = {}) {
  const list = [...new Set((tokens || []).filter(Boolean))]; // dedupe + drop nulls
  if (list.length === 0) return;
  const message = {
    notification: { title, body },
    data: { title, body, url: '/', ...extra },
    webpush: {
      headers: { Urgency: 'high' },
      notification: { icon: '/logo.png', badge: '/logo.png' },
      fcmOptions: { link: '/' },
    },
  };
  for (let i = 0; i < list.length; i += 500) {
    const batch = list.slice(i, i + 500);
    await getMessaging()
      .sendEachForMulticast({ ...message, tokens: batch })
      .catch((err) => console.error('FCM multicast failed:', err && err.message));
  }
}

/* 1) NEW RIDE REQUEST → all online, approved drivers ------------------------
   Fires when a booking is created. Broadcasts to every driver who is online
   and approved, so a driver with a locked phone still hears the request. */
exports.notifyDriversNewRequest = onDocumentCreated(
  'bookings/{bookingId}',
  async (event) => {
    const b = event.data && event.data.data();
    if (!b) return;
    if (b.status !== 'searching') return;         // only genuine open requests

    // Collect tokens of online, approved drivers.
    const snap = await db.collection('drivers')
      .where('isOnline', '==', true)
      .where('status', '==', 'approved')
      .get();
    const tokens = [];
    snap.forEach((d) => { const t = d.get('fcmToken'); if (t) tokens.push(t); });
    if (tokens.length === 0) return;

    const where = b.pickup && b.pickup.address ? ` near ${b.pickup.address}` : '';
    await pushToMany(
      tokens,
      '🚕 New ride request!',
      `A rider needs a pickup${where}. Open VilleCabs to accept.`,
      { tag: 'vc-new-request', bookingId: event.params.bookingId }
    );
  }
);

/* 2) DRIVER ACCEPTED → the customer ----------------------------------------
   Fires when the booking transitions into an accepted/active state with a
   driver assigned. */
exports.notifyCustomerAccepted = onDocumentUpdated(
  'bookings/{bookingId}',
  async (event) => {
    const before = event.data.before.data() || {};
    const after  = event.data.after.data()  || {};
    if (!after.customerId) return;

    // "Accepted" = a driver just got assigned and status became active.
    const justAssigned = !before.driverId && after.driverId;
    const becameActive = before.status !== 'active' && after.status === 'active';
    if (!(justAssigned || becameActive)) return;
    if (after.acceptedPushSent) return;             // guard against re-fire

    await event.data.after.ref.update({ acceptedPushSent: true }).catch(() => {});

    const custSnap = await db.doc(`customers/${after.customerId}`).get();
    const token = custSnap.exists ? custSnap.get('fcmToken') : null;
    const driverName = after.driverName || 'Your driver';
    await pushToToken(
      token,
      '🚗 Driver found!',
      `${driverName} accepted your ride and is on the way.`,
      { tag: 'vc-accepted', bookingId: event.params.bookingId }
    );
  }
);

/* 3) DRIVER ARRIVED → the customer ------------------------------------------ */
exports.notifyCustomerArrived = onDocumentUpdated(
  'bookings/{bookingId}',
  async (event) => {
    const before = event.data.before.data() || {};
    const after  = event.data.after.data()  || {};
    if (!after.customerId) return;

    // Arrival is signalled either by status 'arrived' or the driverArrived flag.
    const nowArrived = (before.status !== 'arrived' && after.status === 'arrived')
                    || (!before.driverArrived && after.driverArrived);
    if (!nowArrived) return;
    if (after.arrivedPushSent) return;
    await event.data.after.ref.update({ arrivedPushSent: true }).catch(() => {});

    const custSnap = await db.doc(`customers/${after.customerId}`).get();
    const token = custSnap.exists ? custSnap.get('fcmToken') : null;
    const driverName = after.driverName || 'Your driver';
    await pushToToken(
      token,
      '📍 Your driver has arrived!',
      `${driverName} is at your pickup location.`,
      { tag: 'vc-arrived', bookingId: event.params.bookingId }
    );
  }
);

/* 4) RIDE COMPLETED → the customer ------------------------------------------ */
exports.notifyCustomerCompleted = onDocumentUpdated(
  'bookings/{bookingId}',
  async (event) => {
    const before = event.data.before.data() || {};
    const after  = event.data.after.data()  || {};
    if (!after.customerId) return;

    if (!(before.status !== 'completed' && after.status === 'completed')) return;
    if (after.completedPushSent) return;
    await event.data.after.ref.update({ completedPushSent: true }).catch(() => {});

    const custSnap = await db.doc(`customers/${after.customerId}`).get();
    const token = custSnap.exists ? custSnap.get('fcmToken') : null;
    await pushToToken(
      token,
      '✅ Ride complete!',
      'Thanks for riding with VilleCabs. Tap to rate your driver.',
      { tag: 'vc-completed', bookingId: event.params.bookingId }
    );
  }
);