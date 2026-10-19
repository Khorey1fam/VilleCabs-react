// Creator program: private code at checkout, booking fields, admin tab, private stats page.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (s) => `http://localhost:${process.env.PORT || 5055}/rides.html?s=${s}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (s, w = 390, h = 844) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.calls = []; p.adds = [];
    p.on('console', (m) => { const t = m.text(); if (t.startsWith('ADD bookings/')) { const [, path, ...r] = t.split(' '); p.adds.push([path, JSON.parse(r.join(' '))]); } if (t.startsWith('CALL ')) { const [, n, ...r] = t.split(' '); p.calls.push([n, JSON.parse(r.join(' ') || 'null')]); } });
    await p.goto(URL(s)); await p.waitForTimeout(900); return p;
  };
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  // Checkout with a creator code
  let p = await page('choose');
  const code = p.locator('input[placeholder="Enter code e.g. VILLE20"]');
  await code.fill('nosuch'); await p.click('button:has-text("Apply")'); await p.waitForTimeout(300);
  check('checkout: unknown code rejected without revealing anything', await p.locator('text=Invalid promo code').count() === 1);
  await code.fill('usedup'); await p.click('button:has-text("Apply")'); await p.waitForTimeout(300);
  check('checkout: second use by same customer refused', await p.locator('text=already used this promo code').count() === 1);
  await code.fill('shanice10'); await p.click('button:has-text("Apply")'); await p.waitForTimeout(400);
  check('checkout: creator code checked on the server', p.calls.some((c) => c[0] === 'creatorCodeCheck'));
  check('checkout: creator code applied', await p.locator('text=SHANICE10').count() >= 1 && await p.locator('text=10% off').count() >= 1);
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  await p.click('button:has-text("Confirm — find me a driver")'); await p.waitForTimeout(1500);
  const bk = p.adds[0] && p.adds[0][1];
  check('booking: carries the creator code', bk && bk.creatorCode === 'SHANICE10' && bk.promoCode === 'SHANICE10', JSON.stringify(bk && { c: bk.creatorCode, p: bk.promoCode }));
  check('booking: rider pays 10% less than the full fare', bk && bk.fare === Math.round(bk.originalFare * 0.9), JSON.stringify(bk && [bk.fare, bk.originalFare]));
  check('booking: client does not mark the discount as covered (server does)', bk && bk.discountCoveredBy === undefined && bk.creator === undefined);
  check('checkout: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  // Private stats page
  p = await page('creator-stats');
  check('stats: greets the creator and shows the code', await p.locator('h1:has-text("Hi Shanice")').count() === 1 && await p.locator('text=SHANICE10').count() >= 1);
  check('stats: totals', await p.locator('text=Owed to you').count() === 1 && await p.locator('text=J$400').count() >= 1 && await p.locator('text=J$1,000').count() >= 1);
  check('stats: explains cancelled rides do not earn', await p.locator('text=cancelled rides don’t earn').count() === 1);
  check('stats: month and recent rows', await p.locator('text=October 2026').count() === 1 && await p.locator('text=Owed').count() >= 1);
  check('stats: no sideways scroll at 390px', !(await overflow(p)));
  check('stats: no page errors', !p.errs.length, p.errs.join('|'));
  await p.screenshot({ path: `${D}/creator-stats-390.png`, fullPage: true });
  await p.close();
  p = await page('creator-stats-bad');
  check('stats: bad link explained', await p.locator('text=This link isn’t valid').count() === 1);
  await p.close();

  // Admin
  p = await page('admin-creators', 1280, 900);
  check('admin: lists creators with codes', await p.locator('text=SHANICE10').count() >= 1 && await p.locator('text=DRE300').count() >= 1);
  check('admin: totals (owed, discounts covered)', await p.locator('text=Owed to creators').count() === 1 && await p.locator('text=Discounts covered').count() === 1 && await p.locator('text=J$650').count() >= 1);
  check('admin: paused creator shown', await p.locator('text=Paused').count() >= 1);
  await p.click('button:has-text("Rides & payouts") >> nth=0'); await p.waitForTimeout(300);
  check('admin: completed rides table with owed/paid', await p.locator('td:has-text("B1")').count() === 1 && await p.locator('text=Owed').count() >= 1);
  p.once('dialog', (d) => d.accept('Lynk'));
  await p.click('button:has-text("Mark J$400 paid")'); await p.waitForTimeout(400);
  check('admin: payout recorded through the server', p.calls.some((c) => c[0] === 'creatorRecordPayout' && c[1].creatorId === 'CR1' && c[1].method === 'Lynk'));
  await p.click('button:has-text("+ New creator")'); await p.waitForTimeout(200);
  await p.fill('#cr-name', 'Test Creator'); await p.fill('#cr-code', 'test 20!'); 
  check('admin: code input keeps letters/numbers only', (await p.inputValue('#cr-code')) === 'TEST20');
  await p.click('button:has-text("Add creator")'); await p.waitForTimeout(400);
  const saved = p.calls.find((c) => c[0] === 'creatorSave');
  check('admin: new creator saved via server with payout and discount', saved && saved[1].code === 'TEST20' && saved[1].payoutJmd === 200 && saved[1].discount === 10, JSON.stringify(saved));
  check('admin: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} passed`);
  process.exit(fails ? 1 : 0);
})();
