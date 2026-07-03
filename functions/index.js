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

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
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