# VilleDash — setup, launch and rollback

VilleDash is built into this repo behind a feature flag. Until you switch it on,
customers see VilleCabs exactly as before.

## What's in this branch (`ville-dash`)

| Area | Files |
| --- | --- |
| Server (prices, dispatch, PIN, ledger, push) | `functions/dash/index.js`, `functions/dash/logic.js` |
| Tests (15, run with `cd functions && npm test`) | `functions/dash/*.test.js` |
| Customer screens (VILLE home, VilleDash, send, track, history) | `src/dash/CustomerScreens.js`, `SendPackage.js`, `DeliveryTrack.js` |
| Rider portal at `/rider` | `src/dash/RiderPortal.js` |
| Admin → VilleDash tab (overview, dispatch, riders, pricing, launch switch) | `src/dash/AdminDash.js` |
| Security rules + indexes | `firestore.rules`, `firestore.indexes.json` |

Fixes to the existing app in the same branch:

- Referral codes now work (checked on the server) and actually take 20% off a first ride. A promo code and a referral don't stack; the bigger discount wins.
- Admin Overview shows completed fares only, labelled gross, and counts arrived/en-route rides as active.
- The Promotions page checks a code for real instead of accepting anything 4+ characters long.
- Ride chat can only be read by that ride's customer and driver.
- The unused in-app `AdminDash` (and its dead support-email helper) was removed. `/admin` is unchanged.

## Deploy order (staging first)

1. `firebase deploy --only firestore:indexes` — wait until the console shows the indexes as built.
2. `firebase deploy --only firestore:rules`
3. `cd functions && npm install && npm test && firebase deploy --only functions`
4. Deploy the web app (Vercel preview of the `ville-dash` branch).
5. Admin → VilleDash → **Pricing**: enter real prices and save. Until then the app shows "Test pricing".
6. Admin → VilleDash → **Launch**: add your own customer user ID as a pilot tester.
7. Sign up a rider at `/rider`, approve them in Admin → VilleDash → **Riders**, add a plate, go online, and run a test delivery end to end.
8. When the pilot is ready, press **Turn VilleDash ON for everyone**.

New collections are created on first use — there is no data migration and no
existing document is changed.

## Rollback

- **Hide it instantly:** Admin → VilleDash → Launch → turn OFF (or delete `config/features`). Customers go back to the old VilleCabs home.
- **Undo the code:** redeploy `main` on Vercel. The `dash*` functions can stay deployed; nothing calls them.
- **Rules:** redeploy the `firestore.rules` from `main`. Note this also reverts the ride-chat privacy fix.
- VilleDash data lives only in the new collections (`dash_*`, `riders`, `ledger_entries`, `support_cases`, `audit_logs`), so removing it never touches rides, drivers or customers.

## Not done yet

- Marketplace (merchants, products, cart, checkout, merchant portal, 15% commission settlements every 14 days)
- Fleet records, rider shifts and scheduling, fleet-provider costs
- Timed offers and automatic dispatch (riders currently see all open jobs; admins can assign)
- Proof-of-delivery photos, demand charts, support-case and audit-log screens in admin
- Email notifications (push is wired; email uses the existing EmailJS setup and needs templates)
- Distances are straight-line × 1.3, not road routes
- Firestore rules are untested against the emulator — test on staging before production
