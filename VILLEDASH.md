# VilleDash — setup, launch and rollback

VilleDash is built into this repo behind a feature flag. Until you switch it on,
customers see VilleCabs exactly as before.

## What's in this branch (`ville-dash`)

| Area | Files |
| --- | --- |
| Server (prices, dispatch, PIN, ledger, push) | `functions/dash/index.js`, `functions/dash/logic.js` |
| Tests (26 server + 5 scheduling: `cd functions && npm test`, `node --test src/dash/coverage.test.mjs`) | `functions/dash/*.test.js`, `src/dash/coverage.test.mjs` |
| Fleet & shifts (bikes, providers, assignment, schedule vs demand, attendance) | `functions/dash/fleet.js`, `shiftjobs.js`, `src/dash/AdminFleet.js`, `coverage.js` |
| Separate domains, family bar, house ads | `src/dash/sites.js`, `src/dash/AdminSites.js` |
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

## Fleet and shifts

- **Fleet** (Admin → VilleDash → Fleet): add each motorcycle and its owner (fleet provider), assign it to a rider, change status (maintenance, unavailable…) and keep a log of inspections and faults. Insurance, registration, fitness and service dates turn red 30 days before they're due.
- A rider must have a motorcycle to go online or take jobs. Taking a bike off the road takes it off its rider.
- **Schedule** (Admin → VilleDash → Schedule): a week grid of riders × days. Add, move or cancel shifts (morning 7–12, afternoon 12–5, evening 5–10 or custom), mark backups, copy last week, and approve day-off requests.
- The coverage chart under the grid compares planned riders with what the last 4 weeks of demand suggest (requests per hour ÷ deliveries one rider handles per hour, set in Pricing). Red hours are short — tap one to add a shift there.
- Riders confirm or decline shifts and request days off in the rider portal. They get a push when a shift is added or changed and an hour before it starts.
- A planned shift is never counted as "online". After each shift, a job every 15 minutes marks it **completed** if the rider was online for at least 30 minutes of it, otherwise **missed**.

## Separate domains (VILLE, VilleDash, VilleCabs)

All three sites run from this one app and one Vercel project. The domain a visitor uses decides which home page they get:

| Domain | Signed out | Signed in |
| --- | --- | --- |
| villecabs.com | VilleCabs landing (unchanged) | VilleCabs dashboard + house ad |
| VILLE domain | VILLE landing | VILLE hub |
| VilleDash domain | VilleDash landing | VilleDash home |

Every page carries a family bar linking the sites, and house ads (Admin → VilleDash → Sites & ads) promote the other services. Links between sites carry utm tags; ad clicks are counted per ad.

Setup for each new domain:

1. Buy the domain (Namecheap). In Vercel → Project → Settings → Domains, add it (and `www.`).
2. In Namecheap → Advanced DNS add what Vercel shows — usually an **A** record `@ → 76.76.21.21` and a **CNAME** `www → cname.vercel-dns.com`. Add records one at a time (batch save has failed before).
3. Firebase console → Authentication → Settings → **Authorized domains**: add the domain, or sign-in fails there.
4. Google Cloud → Credentials → your Maps key → **Website restrictions**: add `https://<domain>/*`.
5. Admin → VilleDash → **Sites & ads**: enter the domain and save.

Sign-ins don't carry across domains: a customer signed in on villecabs.com signs in once more on the VilleDash domain (same account). To try a brand before the domain is live, open a Vercel preview with `?site=dash` or `?site=ville`.

## Storage rule for store images

Logos, covers and product photos upload to `merchants/{uid}/…` in Firebase Storage. Your Storage rules live in the Firebase console, not this repo, so add this block there:

```
match /merchants/{uid}/{file} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == uid
               && request.resource.size < 3 * 1024 * 1024
               && request.resource.contentType.matches('image/(png|jpeg|webp)');
}
match /site_ads/{file} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.token.email == 'admin@villecabs.com'
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
- VilleDash data lives only in the new collections (`dash_*`, `riders`, `rider_*`, `fleet_*`, `merchants`, `settlements`, `site_ads`, `ledger_entries`, `support_cases`, `audit_logs`), so removing it never touches rides, drivers or customers.

## Not done yet

- Substitutions (store offers a replacement, customer approves) — for now the store rejects with a reason or calls the customer
- Refunds — cash only, so nothing is charged before delivery; card refunds come with online payments
- Online payments (cash only at launch, as decided)
- Fleet-provider costs in the ledger (rates are recorded on each provider, but not yet charged per day/week)
- Timed offers and automatic dispatch (riders see all open jobs; admins can assign)
- Proof-of-delivery photos, demand charts, support-case and audit-log screens in admin
- Email notifications (push is wired; email needs EmailJS templates)
- One store per login; multi-location chains need a merchant-users model
- Distances are straight-line × 1.3, not road routes
- Firestore rules are untested against the emulator, and most signed-in screens haven't been seen in a browser yet (only the landing pages and sign-in screens were checked) — test on staging before production
