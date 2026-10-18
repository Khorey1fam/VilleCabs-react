// Clicks through the main customer journeys against the mocked data.
const { chromium } = require('playwright');
const URL = (s) => `http://localhost:${process.env.PORT || 5055}/?s=${s}`;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (s, w = 390) => {
    const p = await b.newPage({ viewport: { width: w, height: 844 } });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.calls = []; p.on('console', (m) => { const t = m.text(); if (t.startsWith('CALL ')) { const [, n, ...rest] = t.split(' '); p.calls.push([n, JSON.parse(rest.join(' ') || 'null')]); } });
    await p.goto(URL(s)); await p.waitForTimeout(500); return p;
  };
  const nav = (p) => p.evaluate(() => window.__nav);
  const calls = (p, n) => p.evaluate((n) => window.__calls.filter((c) => c[0] === n), n);

  // 1. Send a package: validation, then the full flow, then double-tap protection.
  let p = await page('dash-send');
  await p.click('text=Continue to package details');
  check('send: blocks empty route with inline errors', await p.locator('.vd-field__err').count() >= 4);
  const addr = p.locator('[data-mock="address"]');
  await addr.nth(0).fill('Manchester Shopping Centre');
  await p.locator('[data-mock="map"]').click(); // pickup pin
  await p.fill('input[autocomplete="tel"]', '8765550101');
  await addr.nth(1).fill('12 Caledonia Road');
  await p.click('text=Place drop-off pin'); await p.locator('[data-mock="map"]').click();
  const inputs = p.locator('.vd-panel').nth(1).locator('input.vd-input');
  await p.getByLabel('Recipient name').fill('Tasha Brown');
  await p.getByLabel('Recipient phone').fill('8765550202');
  await p.waitForTimeout(150);
  await p.click('text=Continue to package details');
  check('send: route step advances', await p.locator('text=What are you sending?').count() === 1);
  await p.click('text=See price');
  check('send: package step validates', await p.locator('.vd-field__err').count() >= 2);
  await p.click('role=radio[name="Gift"]');
  await p.getByLabel('Description').fill('Birthday gift');
  await p.check('text=This package contains none of these items. I understand the rider may refuse anything unsafe.');
  await p.getByRole('button', { name: 'Back', exact: true }).click(); 
  check('send: going back keeps route data', (await p.getByLabel('Recipient name').inputValue()) === 'Tasha Brown');
  await p.click('text=Continue to package details');
  check('send: package data kept', (await p.getByLabel('Description').inputValue()) === 'Birthday gift');
  await p.click('text=See price'); await p.waitForTimeout(200);
  check('send: review shows total', await p.locator('.vd-total b').first().textContent() === 'J$500');
  const btn = p.locator('button:has-text("Place request")');
  await btn.click(); await btn.click({ force: true }).catch(() => {}); await p.waitForTimeout(700);
  check('send: one booking despite double tap', (await calls(p, 'dashCreateDelivery')).length === 1);
  check('send: confirmation screen', await p.locator('text=We’re finding your rider').count() === 1);
  await p.click('text=Track delivery');
  check('send: track opens delivery', (await nav(p)) === 'dnew1abc', await nav(p));
  check('send: no page errors', !p.errs.length, p.errs.join('|')); await p.close();

  // 2. Search on home: product suggestion opens the store.
  p = await page('dash-home');
  await p.fill('#vd-search', 'jerk'); await p.waitForTimeout(400);
  check('search: product suggestion', await p.locator('.vd-suggest__item:has-text("Jerk chicken")').count() === 1);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  check('search: opens store', (await nav(p)) === 'shop1');
  check('search: product hand-off set', (await p.evaluate(() => sessionStorage.getItem('vd_open_product'))) === 'jerk');
  await p.fill('#vd-search', 'zzzz'); await p.waitForTimeout(200);
  check('search: empty result message', await p.locator('text=No stores or products match').count() === 1);
  await p.evaluate(() => { window.__nav = null; });
  await p.click('role=button[name="Groceries, coming soon"]', { force: true });
  check('categories: coming soon does nothing', (await nav(p)) === null);
  await p.click('role=button[name="Food & drinks: see stores"]');
  check('categories: live category opens stores', (await nav(p)) === 'dash-stores' && (await p.evaluate(() => sessionStorage.getItem('vd_store_group'))) === 'food');
  await p.click('role=button[name="Packages: send a package"]');
  check('categories: packages opens send', (await nav(p)) === 'dash-send');
  const imgs = await p.$$eval('.vd-cat img', (els) => els.map((e) => e.complete && e.naturalWidth > 0 && !!e.alt));
  check('categories: 6 images loaded with alt text', imgs.length === 6 && imgs.every(Boolean), JSON.stringify(imgs));
  const brand = await p.$$eval('.vd-hero__art img, .vd-service__art img, .vd-mark img, .vd-foot__ville', (els) => els.map((e) => e.complete && e.naturalWidth > 0 && !!e.alt));
  check('home: hero, service images and logos load with alt text', brand.length >= 5 && brand.every(Boolean), JSON.stringify(brand));
  check('home: cart badge shows 3', (await p.locator('.vd-badge').first().textContent()) === '3');
  await p.close();

  // 3. Store: hand-off opens the sheet; required option enforced; add increases cart.
  p = await page('dash-store');
  await p.evaluate(() => sessionStorage.setItem('vd_open_product', 'jerk')); await p.reload(); await p.waitForTimeout(500);
  check('store: product sheet opens from search', await p.locator('role=dialog').count() === 1);
  check('store: required option blocks add', await p.locator('button:has-text("Choose size")').isDisabled());
  await p.click('role=radio[name="Half +J$600"]');
  await p.click('button:has-text("Add to cart")');
  check('store: cart badge updates', (await p.locator('.vd-badge').first().textContent()) === '4');
  await p.fill('#vd-store-q', 'water');
  check('store: in-store search filters', await p.locator('.vd-product').count() === 1);
  check('store: no page errors', !p.errs.length, p.errs.join('|')); await p.close();

  // 4. Cart → checkout → order.
  p = await page('dash-cart'); await p.waitForTimeout(300);
  check('cart: delivery fee from server', await p.locator('text=J$600').count() >= 1);
  await p.click('role=button[name="One more"] >> nth=1');
  check('cart: quantity changes', (await p.locator('.vd-qty--sm span').nth(1).textContent()) === '2');
  await p.click('text=Remove >> nth=1');
  check('cart: remove item', await p.locator('.vd-qty--sm').count() === 1);
  await p.close();
  p = await page('dash-checkout'); await p.waitForTimeout(300);
  const place = p.locator('button:has-text("Place order")');
  await place.click(); await place.click({ force: true }).catch(() => {}); await p.waitForTimeout(600);
  check('checkout: one order despite double tap', (await calls(p, 'marketCreateOrder')).length === 1);
  check('checkout: opens order', (await nav(p)) === 'ONEW');
  check('checkout: cart cleared', (await p.evaluate(() => JSON.parse(localStorage.getItem('vd_cart_v1')).items.length)) === 0);
  await p.close();

  // 5. My Orders filters.
  p = await page('dash-history');
  const all = await p.locator('.vd-item').count();
  await p.click('role=tab[name="Store orders"]');
  const stores = await p.locator('.vd-item').count();
  await p.click('text=Completed');
  const done = await p.locator('.vd-item').count();
  check('orders: tabs and filters', all > stores && stores > done && done >= 1, `${all}/${stores}/${done}`);
  await p.close();

  // 6. Card payments: hidden when off; when on, card goes to WiPay's page
  const sendToReview = async (p) => {
    const addr = p.locator('[data-mock="address"]');
    await addr.nth(0).fill('A'); await p.locator('[data-mock="map"]').click();
    await p.fill('input[autocomplete="tel"]', '8765550101');
    await addr.nth(1).fill('B'); await p.click('text=Place drop-off pin'); await p.locator('[data-mock="map"]').click();
    await p.getByLabel('Recipient name').fill('Tasha'); await p.getByLabel('Recipient phone').fill('8765550202');
    await p.click('text=Continue to package details');
    await p.click('role=radio[name="Gift"]'); await p.getByLabel('Description').fill('Gift box');
    await p.check('text=This package contains none of these items. I understand the rider may refuse anything unsafe.');
    await p.click('text=See price'); await p.waitForTimeout(200);
  };
  p = await page('dash-send'); await sendToReview(p);
  check('card off: no card option', await p.locator('role=radio[name="Card now (Visa or Mastercard)"]').count() === 0);
  await p.close();
  p = await page('dash-send&card=1');
  await p.route('https://jm.wipayfinancial.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>WIPAY TEST PAGE</h1>' }));
  await sendToReview(p);
  await p.click('role=radio[name="Card now (Visa or Mastercard)"]');
  check('card on: test-mode note shown', await p.locator('text=Test mode').count() === 1);
  await p.click('button:has-text("by card")'); await p.waitForTimeout(1200);
  const created = p.calls.find((c) => c[0] === 'dashCreateDelivery')?.[1];
  const started = p.calls.find((c) => c[0] === 'payCardStart')?.[1];
  check('card on: booking made as card, then WiPay page opened', created?.paymentMethod === 'card' && started?.kind === 'delivery' && p.url().startsWith('https://jm.wipayfinancial.com/'), p.url());
  await p.close();
  p = await page('dash-checkout&card=1');
  await p.route('https://jm.wipayfinancial.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'WIPAY' }));
  await p.waitForTimeout(300);
  await p.click('role=radio[name*="Card now"]');
  await p.click('button:has-text("Pay by card")'); await p.waitForTimeout(1000);
  const ord = p.calls.find((c) => c[0] === 'marketCreateOrder')?.[1];
  check('checkout: card order then WiPay page', ord?.paymentMethod === 'card' && p.url().startsWith('https://jm.wipayfinancial.com/'), p.url());
  await p.close();
  p = await page('dash-order-unpaid');
  check('unpaid order: shows pay panel with last error', await p.locator('text=Finish paying by card').count() === 1 && await p.locator('text=Declined by issuer').count() === 1);
  await p.click('text=Pay cash on delivery'); await p.waitForTimeout(200);
  check('unpaid order: switch to cash calls server', (await calls(p, 'payUseCash')).length === 1);
  await p.close();
  p = await page('pay-failed');
  check('payment failed page', await p.locator('text=Payment didn’t go through').count() === 1);
  await p.close();
  p = await page('pay-ok'); await p.waitForTimeout(2800);
  check('payment ok page then opens the order', (await p.locator('text=Payment received').count()) >= 1 && (await nav(p)) === 'O1');
  await p.close();

  // 7. No sideways scroll on any customer screen at 360px.
  for (const s of ['dash-home', 'dash-send', 'dash-stores', 'dash-store', 'dash-cart', 'dash-checkout', 'dash-order', 'dash-track', 'dash-history', 'land-dash-soon', 'dash-terms']) {
    p = await page(s, 360);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    check(`no overflow at 360px: ${s}`, w <= 360, String(w)); await p.close();
  }
  console.log(results.join('\n'));
  await b.close();
})();
