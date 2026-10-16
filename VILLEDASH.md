# VilleDash — setup, launch and rollback

VilleDash is built into this repo behind a feature flag. Until you switch it on,
customers see VilleCabs exactly as before.

## What's in this branch (`ville-dash`)

| Area | Files |
| --- | --- |
| Server (prices, dispatch, PIN, ledger, push) | `functions/dash/index.js`, `functions/dash/logic.js` |
| Tests (21, run with `cd functions && npm test`) | `functions/dash/*.test.js` |
| Customer screens (VILLE home, VilleDash, send, track, history) | `src/dash/CustomerScreens.js`, `SendPackage.js`, `DeliveryTrack.js` |
| Marketplace — stores, store page, cart, checkout, order tracking | `src/dash/Marketplace.js`, `functions/dash/market.js` |
| Merchant portal at `/merchant` (register, orders, products, hours, pause, sales, payouts) | `src/dash/MerchantPortal.js` |
| Rider portal at `/rider` | `src/dash/RiderPortal.js` |
| Admin → VilleDash tab (overview, dispatch, store orders, riders, merchants, settlements, pricing, launch) | `src/dash/AdminDash.js` |
| Security rules + indexes | `firestore.rules`, `firestore.indexes.json` |

Fixes to the existing app in the same branch:

- Referral codes now work (checked on the server) and actually take 20% off a first ride. A promo code and a referral don't stack; the bigger discount wins.
- Admin Overview shows completed fares only, labelled gross, and counts arrived/en-route rides as active.
- The Promotions page checks a code for real instead of accepting anything 4+ characters long.
- Ride chat can only be read by that ride's customer and driver.
- The unused in-app `AdminDash` (and its dead support-email helper) was removed. `/admin` is unchanged.

## How store orders work

1. The customer picks a store, builds a cart and checks out. The server re-prices every item, checks stock, opening hours (Jamaica time) and that the store isn't paused, and reserves stock.
2. The store accepts with a prep time (or rejects with a reason — stock goes back). Accepting creates the delivery, so a rider can head over while the order is prepared.
3. The rider can't mark it collected until the store marks it ready. The customer gives the rider the PIN on arrival and pays cash for everything.
4. On delivery the ledger records product sales, 15% commission, what the store is owed, the delivery fee and rider pay.
5. Admin → VilleDash → Settlements shows what each store is owed and flags anything 14+ days old. Create a settlement, pay the store outside the app, then mark it paid with the transfer reference.

Store orders and their deliveries are separate records (`dash_orders` and `dash_deliveries`).

## Storage rule for store images

Logos, covers and product photos upload to `merchants/{uid}/…` in Firebase Storage. Your Storage rules live in the Firebase console, not this repo, so add this block there:

```
match /merchants/{uid}/{file} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == uid
               && request.resource.size < 3 * 1024 * 1024
               && request.resource.contentType.matches('image/(png|jpeg|webp)');
}
```

## Deploy order (staging first)

1. `firebase deploy --only firestore:indexes` — wait until the console shows the indexes as built.
2. `firebase deploy --only firestore:rules`
3. `cd functions && npm install && npm test && firebase deploy --only functions`
4. Deploy the web app (Vercel preview of the `ville-dash` branch).
5. Admin → VilleDash → **Pricing**: enter real prices and save. Until then the app shows "Test pricing".
6. Admin → VilleDash → **Launch**: add your own customer user ID as a pilot tester.
7. Sign up a rider at `/rider`, approve them in Admin → VilleDash → **Riders**, add a plate, go online, and run a test delivery end to end.
8. Register a test store at `/merchant`, add products and hours, approve it in Admin → VilleDash → **Merchants**, then place, accept, collect and deliver a test order.
9. When the pilot is ready, press **Turn VilleDash ON for everyone**.

New collections are created on first use — there is no data migration and no
existing document is changed.

## Rollback

- **Hide it instantly:** Admin → VilleDash → Launch → turn OFF (or delete `config/features`). Customers go back to the old VilleCabs home.
- **Undo the code:** redeploy `main` on Vercel. The `dash*` functions can stay deployed; nothing calls them.
- **Rules:** redeploy the `firestore.rules` from `main`. Note this also reverts the ride-chat privacy fix.
- VilleDash data lives only in the new collections (`dash_*`, `riders`, `merchants`, `settlements`, `ledger_entries`, `support_cases`, `audit_logs`), so removing it never touches rides, drivers or customers.

## Not done yet

- Substitutions (store offers a replacement, customer approves) — for now the store rejects with a reason or calls the customer
- Refunds — cash only, so nothing is charged before delivery; card refunds come with online payments
- Online payments (cash only at launch, as decided)
- Fleet records, rider shifts and scheduling, fleet-provider costs
- Timed offers and automatic dispatch (riders see all open jobs; admins can assign)
- Proof-of-delivery photos, demand charts, support-case and audit-log screens in admin
- Email notifications (push is wired; email needs EmailJS templates)
- One store per login; multi-location chains need a merchant-users model
- Distances are straight-line × 1.3, not road routes
- Firestore rules are untested against the emulator, and no screen has been seen in a browser yet — test on staging before production
