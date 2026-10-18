# VilleDash — setup, launch and rollback

VilleDash is built into this repo behind a feature flag. Until you switch it on,
customers see VilleCabs exactly as before.

## What's in this branch (`ville-dash`)

| Area | Files |
| --- | --- |
| Server (prices, dispatch, PIN, ledger, push) | `functions/dash/index.js`, `functions/dash/logic.js` |
| Tests (32 server + 5 scheduling: `cd functions && npm test`, `node --test src/dash/coverage.test.mjs`) | `functions/dash/*.test.js`, `src/dash/coverage.test.mjs` |
| Fleet & shifts (bikes, providers, assignment, schedule vs demand, attendance) | `functions/dash/fleet.js`, `shiftjobs.js`, `src/dash/AdminFleet.js`, `coverage.js` |
| Separate domains, family bar, house ads | `src/dash/sites.js`, `src/dash/AdminSites.js` |
| Automatic dispatch (timed offers) | `functions/dash/dispatch.js` |
| Money controls, support cases, audit log | `functions/dash/finance.js`, `src/dash/AdminFinance.js` |
| Customer screens (VILLE home, VilleDash, send, track, history) | `src/dash/CustomerScreens.js`, `SendPackage.js`, `DeliveryTrack.js` |
| Marketplace — stores, store page, cart, checkout, order tracking | `src/dash/Marketplace.js`, `functions/dash/market.js` |
| Merchant portal at `/merchant` (register, orders, products, hours, pause, sales, payouts) | `src/dash/MerchantPortal.js` |
| Rider portal at `/rider` | `src/dash/RiderPortal.js` |
| Admin → VilleDash tab (overview, dispatch, store orders, riders, merchants, settlements, pricing, launch) | `src/dash/AdminDash.js` |
| Security rules + indexes | `firestore.rules`, `firestore.indexes.json` |
| Customer design system (nav, bottom bar, footer, cards, states, forms) and illustrations | `src/dash/kit.js`, `src/dash/dash.css`, `src/dash/art.js` |
| VilleDash home, public landing, search, categories | `src/dash/Home.js` |
| My Orders and active-delivery cards | `src/dash/Orders.js` |
| About and Delivery terms pages | `src/dash/Info.js` |
| Screen check — renders every new screen with sample data, screenshots at any width, and clicks through the main journeys (`flows.js`) | `tools/screen-check/` |

Fixes to the existing app in the same branch:

- Referral codes now work (checked on the server) and actually take 20% off a first ride. A promo code and a referral don't stack; the bigger discount wins.
- Admin Overview shows completed fares only, labelled gross, and counts arrived/en-route rides as active.
- The Promotions page checks a code for real instead of accepting anything 4+ characters long.
- Ride chat can only be read by that ride's customer and driver.
- The unused in-app `AdminDash` (and its dead support-email helper) was removed. `/admin` is unchanged.
- Driver licence re-uploads now show in the admin driver card (the Documents screen saved `licence`, the admin card read `license`).

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

## Dispatch

- **Automatic (default):** each new job is offered to the nearest free rider (online, approved, with a bike) for 45 seconds. If they pass or let it run out it goes to the next nearest. After 5 riders, or when nobody is free, it opens to everyone and turns red in Admin → Dispatch so you can assign it by hand. Idle riders share their rough location once a minute so "nearest" is real.
- **Open:** every free rider is notified; first to accept wins. Switch in Admin → VilleDash → Launch. Offer time and rider count are in Pricing.
- Batch deliveries and several jobs at once stay off, as the brief asked.

## Privacy

- Phone numbers (customer, sender, recipient) are kept in `dash_deliveries/{id}/private/contact`, readable only by the customer, the assigned rider and admins. Open jobs that every online rider can see show addresses and names, never numbers.
- Riders can't mark their own background check; an admin sets it in Riders, and Approve stays disabled until it's marked passed.

## Proof, support and money

- Riders can take a photo of the package at pickup and of the handover at drop-off. Photos show on the customer's tracking page and in Dispatch. The PIN is still what completes a delivery.
- **Support** tab: every problem reported by customers and riders, with status and notes.
- **Finance** tab: for any date range, cash collected (gross, including store sales that belong to merchants) is shown separately from VilleDash revenue (delivery fees + commission). Contribution = revenue − rider pay − recorded fleet charges, and is labelled as not net profit.
- **Rider cash:** riders keep their pay from the cash they collect and owe the rest. The Finance tab shows what each rider owes; record each handover with a receipt reference. Part-payments are fine.
- **Fleet charges:** record each fleet-provider invoice for a period (the app suggests an amount from the provider's rate and bike count) and mark it paid.
- **Audit log** tab: every manual assignment, cancellation, exception, fleet change, settlement and cash record. Read-only.

## Separate domains (VILLE, VilleDash, VilleCabs)

All three sites run from this one app and one Vercel project. The domain a visitor uses decides which home page they get:

| Domain | Signed out | Signed in |
| --- | --- | --- |
| villecabs.com | VilleCabs landing (unchanged) | VilleCabs dashboard + house ad |
| villeapp.org | VILLE landing | VILLE hub |
| villedash.com | VilleDash landing | VilleDash home |

Every page carries a family bar linking the sites, and house ads (Admin → VilleDash → Sites & ads) promote the other services. Links between sites carry utm tags; ad clicks are counted per ad.

Setup for villedash.com and villeapp.org (do each one):

1. Buy the domain (Namecheap). In Vercel → Project → Settings → Domains, add it (and `www.`).
2. In Namecheap → Advanced DNS add what Vercel shows — usually an **A** record `@ → 76.76.21.21` and a **CNAME** `www → cname.vercel-dns.com`. Add records one at a time (batch save has failed before).
3. Firebase console → Authentication → Settings → **Authorized domains**: add the domain, or sign-in fails there.
4. Google Cloud → Credentials → your Maps key → **Website restrictions**: add `https://<domain>/*`.
5. Nothing to enter in the app: `villeapp.org` and `villedash.com` are built in as defaults. Admin → VilleDash → **Sites & ads** can change them later.

Sign-ins don't carry across domains: a customer signed in on villecabs.com signs in once more on the VilleDash domain (same account). To try a brand before the domain is live, open a Vercel preview with `?site=dash` or `?site=ville`.

## Card payments (WiPay) — built, switched OFF

Card payments use WiPay's hosted payment page (WiPay Payments API v1.0.7). They are **off** until you turn them on in Admin → VilleDash → **Card payments**. While off, customers only see cash and nothing changes.

How it works:

1. At checkout (store orders) or on the Review step (packages) the customer picks **Card now**. The order is saved as *Waiting for card payment*; stores and riders don't see it yet.
2. The server asks WiPay for a payment page and sends the customer there. VilleDash never sees card numbers.
3. WiPay sends the customer back through the `wipayReturn` function. A "success" only counts if WiPay's hash matches `md5(transaction_id + total + API key)`, so a faked link can't mark an order paid. Then the store gets the order (or dispatch starts) and the customer sees "Payment received".
4. If the card fails, the customer can try again or switch to cash. Unpaid card orders are cancelled after 30 minutes and reserved stock goes back.
5. The rider collects nothing on card jobs ("Paid by card · collect nothing"). VilleDash then owes the rider their pay: Finance → Cash held by riders shows "VilleDash owes" and a **Record payout** button.
6. If a card-paid order is cancelled, rejected or fails, it appears under **Refunds to make**. WiPay has no refund API: refund in the WiPay dashboard, then record the reference.

To test (sandbox — no real money): in Card payments, keep **Sandbox**, add your customer ID under **Test customers**, then place an order and pay with a WiPay test card. Jamaica uses First Global Bank's page: Visa `4035874000424977` or Mastercard `5210000010001001`, any expiry and 3-digit code; if asked for a password, use the "Personal Message" shown.

To go live: you need a verified WiPay Business account. Save the 10-digit account number and API key under **Live WiPay account** (the key is kept on the server only), switch Mode to **Live**, test with your own card, then **Turn card payments ON for everyone**. WiPay pays into your WiPay account; withdraw to the bank from WiPay (up to 7 working days, withdrawal fee applies). WiPay Jamaica fees: 4.2% + GCT (free plan) or 3.5% + GCT (paid plans); choose who pays the fee in the same tab.

Deploy needed: `firebase deploy --only firestore:rules,functions` (new functions `payCardStart`, `wipayReturn`, `payUseCash`, `payWatchDelivery`, `payWatchOrder`, `payAdminSetWipay`, `payAdminResolveRefund`, `dashAdminRecordRiderPayout`).

## Launch sign-ups

Before launch, signed-out visitors to the VilleDash domain see a "launching soon" page with a **Notify me** box (email or phone). Entries go to `dash_interest` and are listed in Admin → VilleDash → Launch, with a Copy all button. The `firestore.rules` on this branch allow anyone to add one entry with only those fields; only admins can read them.

## Storage rules for images

`storage.rules` is now in the repo (your existing rules plus store images, rider proof photos and ad images). Deploy with `firebase deploy --only storage`. The proof-photo rule checks the delivery in Firestore, so the first deploy may ask to let Storage read Firestore — answer yes.

## Deploy order (staging first)

1. `firebase deploy --only firestore:indexes,storage` (indexes and image rules) — wait until the console shows the indexes as built.
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
- Card refunds are made by hand in the WiPay dashboard (WiPay has no refund API); the app lists what to refund
- Card payments are built but switched off (see Card payments above)
- Email notifications (push is wired; email needs EmailJS templates)
- One store per login; multi-location chains need a merchant-users model
- Distances are straight-line × 1.3, not road routes
- Firestore rules are reviewed against every screen's reads and writes but untested against the emulator (its download is blocked here) — test on staging before production
- Open jobs show pickup and drop-off addresses to every online rider until one accepts
