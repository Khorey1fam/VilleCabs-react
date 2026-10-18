// Clicks through the VilleCabs ride checkout with card payments on and off.
const { chromium } = require('playwright');
const URL = (s) => `http://localhost:${process.env.PORT || 5055}/rides.html?s=${s}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (s) => {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.calls = []; p.adds = []; p.on('console', (m) => { const t = m.text(); if (t.startsWith('ADD bookings/')) { const [, path, ...r] = t.split(' '); p.adds.push([path, JSON.parse(r.join(' '))]); } if (t.startsWith('CALL ')) { const [, n, ...r] = t.split(' '); p.calls.push([n, JSON.parse(r.join(' ') || 'null')]); } });
    await p.route('https://jm.wipayfinancial.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'WIPAY' }));
    await p.goto(URL(s)); await p.waitForTimeout(800); return p;
  };
  let p = await page('choose');
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  check('card off: no card choice in ride confirm', await p.locator('text=💳 Card now').count() === 0 && await p.locator('text=Cash to your driver').count() >= 1);
  check('card off: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  p = await page('choose&card=1');
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/ride-confirm-card.png' });
  await p.click('text=💳 Card now');
  check('card on: fee note shown', await p.locator('text=WiPay adds its card processing fee').count() === 1);
  await p.screenshot({ path: 'shots/ride-confirm-card-picked.png' });
  await p.click('button:has-text("by card")'); await p.waitForTimeout(1500);
  const written = await p.evaluate(() => (window.__writes || []).map((w) => w)).catch(() => null);
  const started = p.calls.find((c) => c[0] === 'payCardStart');
  const bk = p.adds[0] && p.adds[0][1];
  check('card on: ride saved as awaiting card payment (hidden from drivers)', bk && bk.status === 'awaiting_payment' && bk.paymentMethod === 'Card' && bk.payment.status === 'pending', JSON.stringify(bk && { s: bk.status, m: bk.paymentMethod }));
  check('card on: WiPay page opened for the ride', !!started && started[1].kind === 'ride' && p.url().startsWith('https://jm.wipayfinancial.com/'), `${p.url()} ${JSON.stringify(started)} ${p.errs.join('|')}`);
  await p.close();

  p = await page('confirm-unpaid');
  await p.screenshot({ path: 'shots/ride-unpaid.png' });
  check('unpaid ride: shows card not finished + last error', await p.locator('text=Card payment not finished').count() === 1 && await p.locator('text=Declined').count() >= 1);
  check('unpaid ride: no cash confirm button', await p.locator('text=Confirm — Pay').count() === 0);
  await p.click('text=Pay cash to the driver instead'); await p.waitForTimeout(300);
  check('unpaid ride: switch to cash calls server', p.calls.some((c) => c[0] === 'payUseCash' && c[1].kind === 'ride'));
  await p.close();

  p = await page('confirm-paid');
  await p.screenshot({ path: 'shots/ride-paid.png' });
  check('paid ride: says paid by card, continue button', await p.locator('text=Paid by card').count() >= 1 && await p.locator('text=Continue — paid by card').count() === 1);
  await p.close();
  // Extra fare: driver asks, customer answers
  p = await page('extras-driver');
  check('driver: sees requests and cash to collect', await p.locator('text=Collect J$300 extra in cash.').count() === 1);
  await p.click('text=Request extra fare'); await p.click('text=Extra stop');
  await p.fill('input[aria-label="Amount in J$"]', '400'); await p.click('text=Send to customer'); await p.waitForTimeout(300);
  const req = p.calls.find((c) => c[0] === 'rideExtraRequest');
  check('driver: request sent with reason and amount', req && req[1].reason === 'extra_stop' && req[1].amount === 400 && req[1].bookingId === 'RX', JSON.stringify(req));
  await p.screenshot({ path: 'shots/extras-driver.png', fullPage: true });
  await p.close();
  p = await page('extras-customer');
  await p.screenshot({ path: 'shots/extras-customer.png', fullPage: true });
  check('customer: card option hidden when card payments are off', await p.locator('text=Approve · pay by card').count() === 0);
  await p.click('text=Approve · pay J$500 cash to driver'); await p.waitForTimeout(300);
  const ans = p.calls.find((c) => c[0] === 'rideExtraRespond');
  check('customer: approve cash', ans && ans[1].decision === 'approve' && ans[1].payWith === 'cash' && ans[1].extraId === 'e1', JSON.stringify(ans));
  await p.close();
  p = await page('extras-customer&card=1');
  await p.click('text=Approve · pay by card'); await p.waitForTimeout(1200);
  const st = p.calls.find((c) => c[0] === 'payCardStart');
  check('customer: approve by card goes to WiPay', st && st[1].kind === 'extra' && st[1].id === 'RX/e1' && p.url().startsWith('https://jm.wipayfinancial.com/'), p.url());
  await p.close();

  console.log(out.join('\n')); await b.close();
})();
