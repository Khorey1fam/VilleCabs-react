const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const stripe    = require('stripe')(functions.config().stripe.secret_key);

admin.initializeApp();

// ── Create Payment Intent ─────────────────────────────────────────────────────
exports.createPaymentIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');

  const { bookingId, amount, currency = 'jmd' } = data;
  if (!bookingId || !amount) throw new functions.https.HttpsError('invalid-argument', 'bookingId and amount required.');

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(amount * 100), // Stripe uses smallest currency unit (cents)
      currency,
      metadata: { bookingId, userId: context.auth.uid },
      automatic_payment_methods: { enabled: true },
    });

    // Save payment intent ID to booking
    await admin.firestore().collection('bookings').doc(bookingId).update({
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: 'pending',
    });

    return { clientSecret: paymentIntent.client_secret };
  } catch(err) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});

// ── Stripe Webhook ────────────────────────────────────────────────────────────
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = functions.config().stripe.webhook_secret;
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
  } catch(err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const bookingId = pi.metadata?.bookingId;
    if (bookingId) {
      await admin.firestore().collection('bookings').doc(bookingId).update({
        paymentStatus: 'paid',
        paymentMethod: 'card',
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        stripeChargeId: pi.latest_charge,
      });
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    const bookingId = pi.metadata?.bookingId;
    if (bookingId) {
      await admin.firestore().collection('bookings').doc(bookingId).update({
        paymentStatus: 'failed',
      });
    }
  }

  res.json({ received: true });
});

// ── Update Driver Location ────────────────────────────────────────────────────
exports.updateDriverLocation = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');

  const { lat, lng, bookingId } = data;
  if (!lat || !lng) throw new functions.https.HttpsError('invalid-argument', 'lat and lng required.');

  const driverRef = admin.firestore().collection('drivers').doc(context.auth.uid);
  await driverRef.update({
    currentLocation: { lat, lng, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    isOnline: true,
  });

  if (bookingId) {
    await admin.firestore().collection('bookings').doc(bookingId).update({
      driverLocation: { lat, lng, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    });
  }

  return { success: true };
});
