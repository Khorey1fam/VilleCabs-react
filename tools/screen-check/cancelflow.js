// Ride cancellations: rider sheet + fee preview, driver cancel reasons, admin tab.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (s, x = '') => `http://localhost:${process.env.PORT || 5055}/rides.html?s=${s}${x}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (s, x = '', w = 390, h = 844) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.calls = []; p.navs = [];
    p.on('console', (m) => { const t = m.text(); if (t.startsWith('CALL ')) { const [, n, ...r] = t.split(' '); p.calls.push([n, JSON.parse(r.join(' ') || 'null')]); } if (t.startsWith('NAV ')) p.navs.push(t.slice(4)); });
    await p.goto(URL(s, x)); await p.waitForTimeout(1300); return p;
  };
  const book = (p) => p.evaluate(() => window.__store.get('bookings/BK'));
  const sheet = (p) => p.locator('[role=dialog]');

  // Rider, inside the free window
  let p = await page('cx-rider-free');
  check('rider: in-ride box says cancelling is free for 2 minutes', await p.locator('text=It’s free for 2 minutes after your driver accepts').count() === 1);
  await p.click('button:has-text("✕ Cancel ride")'); await p.waitForTimeout(300);
  check('rider: sheet opens with reasons', await sheet(p).count() === 1 && await p.locator('[role=dialog] input[type=radio]').count() >= 6);
  check('rider: free-window countdown shown', await p.locator('[role=dialog] >> text=No fee if you cancel in the next').count() === 1);
  check('rider: confirm disabled until a reason is chosen', await p.locator('[role=dialog] button:has-text("Cancel ride")').isDisabled());
  await p.click('[role=dialog] label:has-text("I changed my mind")');
  await p.click('[role=dialog] button:has-text("Cancel ride")'); await p.waitForTimeout(400);
  let bk = await book(p);
  check('rider: cancel writes reason key, no client fee fields', bk.status === 'cancelled' && bk.cancelledBy === 'customer' && bk.cancelReasonKey === 'changed_mind' && bk.cancelFee === undefined && bk.cancelHandled === undefined);
  check('rider: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  // Rider, after the free window
  p = await page('cx-rider-fee');
  check('rider: box warns the fee applies now', await p.locator('text=A J$300 cancellation fee applies now').count() === 1);
  await p.click('button:has-text("✕ Cancel ride")'); await p.waitForTimeout(300);
  await p.click('[role=dialog] label:has-text("I found another ride")');
  check('rider: fee shown before confirming', await p.locator('[role=dialog] >> text=J$300 cancellation fee').count() >= 1 && await p.locator('[role=dialog] button:has-text("Cancel ride · J$300 fee")').count() === 1);
  await p.click('[role=dialog] label:has-text("Driver asked me to cancel")');
  check('rider: driver-blame reason says it will be reviewed', await p.locator('[role=dialog] >> text=We’ll look into what happened').count() === 1);
  await p.click('[role=dialog] label:has-text("Driver is taking too long")');
  check('rider: "driver late" explains the 15-minute rule', await p.locator('[role=dialog] >> text=still haven’t arrived 15 minutes after accepting').count() === 1);
  await p.click('[role=dialog] button:has-text("Keep my ride")'); await p.waitForTimeout(200);
  check('rider: keep my ride closes without cancelling', await sheet(p).count() === 0 && (await book(p)).status === 'active');
  await p.screenshot({ path: `${D}/cancel-rider-fee-390.png`, fullPage: true });
  await p.close();

  // Rider, driver very late → free
  p = await page('cx-rider-late');
  await p.click('button:has-text("✕ Cancel ride")'); await p.waitForTimeout(300);
  await p.click('[role=dialog] label:has-text("Driver is taking too long")');
  check('rider: driver 20 min late → no fee', await p.locator('[role=dialog] >> text=No fee. Your driver still hasn’t arrived').count() === 1 && await p.locator('[role=dialog] button:has-text("J$300")').count() === 0);
  await p.screenshot({ path: `${D}/cancel-rider-sheet-390.png` });
  await p.close();

  // Rider, still searching
  p = await page('cx-rider-search');
  await p.click('button:has-text("Cancel ride")'); await p.waitForTimeout(300);
  check('rider: searching → no fee and no driver reasons', await p.locator('[role=dialog] >> text=No fee. A driver hasn’t accepted').count() === 1 && await p.locator('[role=dialog] >> text=Driver asked me to cancel').count() === 0);
  await p.close();

  // Rider sees driver re-dispatch and no-show cancellation
  p = await page('cx-rider-redispatch');
  check('rider: re-dispatch banner (no charge)', await p.locator('text=Your driver had to cancel. We’re finding you another driver').count() === 1);
  await p.close();
  p = await page('cx-rider-cancelled');
  check('rider: no-show screen explains + fee notice', await p.locator('text=waited at the pickup but couldn’t find you').count() === 1 && await p.locator('text=J$300 cancellation fee will be added to your next ride').count() === 1);
  await p.close();

  // Driver on the way
  p = await page('cx-driver-active');
  check('driver: Cancel trip button', await p.locator('button:has-text("✕ Cancel trip")').count() === 1);
  await p.click('button:has-text("✕ Cancel trip")'); await p.waitForTimeout(300);
  check('driver: no-show locked until arrived', await p.locator('[role=dialog] input[value=rider_no_show]').isDisabled() && await p.locator('[role=dialog] >> text=Tap “Arrived at Pickup” first').count() === 1);
  await p.click('[role=dialog] label:has-text("Problem with my vehicle")');
  check('driver: own reason → ride goes to another driver, rider not charged', await p.locator('[role=dialog] >> text=The rider isn’t charged, and we’ll send the ride to another driver').count() === 1);
  await p.fill('[role=dialog] textarea', 'Flat tyre');
  await p.click('[role=dialog] button:has-text("Cancel trip")'); await p.waitForTimeout(500);
  const dc = p.calls.find((c) => c[0] === 'rideDriverCancel');
  check('driver: cancel goes through the server with reason and note', dc && dc[1].bookingId === 'BK' && dc[1].reasonKey === 'vehicle' && dc[1].note === 'Flat tyre', JSON.stringify(dc));
  check('driver: back to dashboard after cancelling', p.navs.includes('driver-dash'));
  check('driver: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  // Driver waiting at pickup (2 of 5 minutes)
  p = await page('cx-driver-waiting');
  await p.click('button:has-text("✕ Cancel trip")'); await p.waitForTimeout(300);
  check('driver: no-show shows countdown while waiting', await p.locator('[role=dialog] input[value=rider_no_show]').isDisabled() && await p.locator('[role=dialog] >> text=/Available in [0-9]:[0-9]{2}/').count() === 1);
  await p.screenshot({ path: `${D}/cancel-driver-sheet-390.png` });
  await p.close();

  // Driver waited 6 minutes → no-show available
  p = await page('cx-driver-noshow');
  await p.click('button:has-text("✕ Cancel trip")'); await p.waitForTimeout(300);
  check('driver: no-show enabled after waiting', !(await p.locator('[role=dialog] input[value=rider_no_show]').isDisabled()));
  await p.click('[role=dialog] label:has-text("Rider didn’t show up")');
  check('driver: no-show tells driver their share', await p.locator('[role=dialog] >> text=You’ll earn J$255').count() === 1);
  await p.click('[role=dialog] button:has-text("Cancel trip")'); await p.waitForTimeout(500);
  check('driver: no-show sent', p.calls.some((c) => c[0] === 'rideDriverCancel' && c[1].reasonKey === 'rider_no_show'));
  await p.close();

  // Driver collecting an owed fee
  p = await page('cx-driver-collect');
  check('driver: told to collect the owed fee and the total', await p.locator('text=Also collect').count() === 1 && await p.locator('text=J$1,500').count() >= 1);
  await p.close();

  // Checkout shows owed fee
  p = await page('choose', '&owed=1');
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  check('checkout: owed cancellation fee shown with total', await p.locator('text=cancellation fee from an earlier trip').count() === 1);
  await p.close();

  // Admin
  p = await page('cx-admin', '', 1280, 900);
  check('admin: needs-review fee listed first', await p.locator('text=Kim Brown').count() === 1 && await p.locator('button:has-text("Charge fee")').count() === 1);
  await p.click('button:has-text("Charge fee")'); await p.waitForTimeout(300);
  check('admin: confirm goes through server', p.calls.some((c) => c[0] === 'cancelFeeAdmin' && c[1].action === 'confirm' && c[1].feeId === 'F1'));
  check('admin: settings show J$300 / 2 min / 5 min / 15 min', (await p.inputValue('#cx-fee')) === '300' && (await p.inputValue('#cx-free')) === '2' && (await p.inputValue('#cx-wait')) === '5' && (await p.inputValue('#cx-late')) === '15');
  await p.fill('#cx-fee', '400'); await p.click('button:has-text("Save settings")'); await p.waitForTimeout(300);
  check('admin: settings saved', (await p.evaluate(() => window.__store.get('config/cancellation'))).feeJmd === 400);
  check('admin: driver cancellation table + safety report', await p.locator('td:has-text("Ricky")').count() === 1 && await p.locator('text=Rider was aggressive').count() === 1);
  check('admin: no page errors', !p.errs.length, p.errs.join('|'));
  await p.screenshot({ path: `${D}/cancel-admin-1280.png`, fullPage: true });
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} passed`);
  process.exit(fails ? 1 : 0);
})();
