// VilleCoins wallet: no "spent" totals anywhere, wallet in the menu, checkout, driver cash, admin.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (s, x = '') => `http://localhost:${process.env.PORT || 5055}/rides.html?s=${s}${x}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (s, x = '', w = 390, h = 844) => {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.calls = []; p.navs = []; p.adds = [];
    p.on('console', (m) => { const t = m.text(); if (t.startsWith('CALL ')) { const [, n, ...r] = t.split(' '); p.calls.push([n, JSON.parse(r.join(' ') || 'null')]); } if (t.startsWith('NAV ')) p.navs.push(t.slice(4)); if (t.startsWith('ADD bookings/')) { const [, path, ...r] = t.split(' '); p.adds.push([path, JSON.parse(r.join(' '))]); } });
    await p.goto(URL(s, x)); await p.waitForTimeout(1300); return p;
  };
  const noSpent = async (p) => !(await p.locator('text=/\\bspent\\b/i').count());

  // Wallet screen
  let p = await page('wallet', '&coins=1200');
  check('wallet: balance shown', await p.locator('text=1,200').first().count() === 1 && await p.locator('text=1 VilleCoin = J$1').count() === 1);
  check('wallet: card off → honest coming-soon text', await p.locator('text=Card top-ups are coming soon').count() === 1);
  check('wallet: history lists activity', await p.locator('text=Added by VilleCabs').count() === 1 && await p.locator('text=Paid for a ride').count() === 1);
  check('wallet: no-cash-out rule stated', await p.locator('text=Coins can’t be exchanged back for money').count() === 1);
  check('wallet: no page errors', !p.errs.length, p.errs.join('|'));
  await p.screenshot({ path: `${D}/wallet-390.png`, fullPage: true });
  await p.close();

  p = await page('wallet-card', '&coins=0');
  await p.click('button[role=radio]:has-text("2,000")');
  check('top-up: amount picker updates button', await p.locator('button:has-text("Pay J$2,000 for 2,000 VilleCoins")').count() === 1);
  await p.fill('input[placeholder="500 – 50,000"]', '300');
  await p.click('button:has-text("Pay J$300")'); await p.waitForTimeout(200);
  check('top-up: under 500 refused', await p.locator('text=Choose between 500 and 50,000').count() === 1);
  await p.fill('input[placeholder="500 – 50,000"]', '');
  await p.click('button:has-text("Pay J$2,000")'); await p.waitForTimeout(600);
  const tc = p.calls.find((c) => c[0] === 'walletTopupCreate'); const pc = p.calls.find((c) => c[0] === 'payCardStart');
  check('top-up: creates top-up then opens WiPay', tc && tc[1].coins === 2000 && pc && pc[1].kind === 'topup' && pc[1].id === 'TOPUP1', JSON.stringify([tc, pc]));
  await p.close();

  // Menu, history, profile: no "spent"
  p = await page('wallet-dash', '&coins=1500');
  check('dashboard: no "spent" anywhere', await noSpent(p));
  const menuBtn = p.locator('button[aria-label="Open menu"], button[aria-label="Menu"]').first();
  if (await menuBtn.count()) { await menuBtn.click(); await p.waitForTimeout(400); }
  check('menu: wallet balance instead of spent', await p.locator('text=Wallet').first().count() >= 1 && await p.locator('text=1,500').count() >= 1 && await noSpent(p));
  check('menu: Wallet item', await p.locator('text=Wallet').count() >= 1);
  await p.screenshot({ path: `${D}/wallet-menu-390.png` });
  await p.close();
  p = await page('wallet-profile', '&coins=1500');
  check('profile: VilleCoins instead of spent', await p.locator('text=VilleCoins').count() >= 1 && await noSpent(p));
  await p.close();

  // Checkout uses coins
  p = await page('choose', '&coins=500');
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  check('checkout: coins offered with cash remainder', await p.locator('text=Pay with VilleCoins').count() === 1 && await p.locator('text=−500').count() === 1 && await p.locator('text=Cash to your driver').count() >= 1);
  await p.click('button:has-text("Confirm — find me a driver")'); await p.waitForTimeout(1500);
  const bk = p.adds[0] && p.adds[0][1];
  check('booking: asks to use 500 coins (server applies them)', bk && bk.walletCoins === 500 && bk.wallet === undefined, JSON.stringify(bk && { w: bk.walletCoins }));
  await p.close();
  p = await page('choose', '&coins=500');
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  await p.click('text=Pay with VilleCoins');
  await p.click('button:has-text("Confirm — find me a driver")'); await p.waitForTimeout(1500);
  check('booking: unticked → no coins used', p.adds[0] && p.adds[0][1].walletCoins === undefined);
  await p.close();
  p = await page('choose');
  await p.click('button:has-text("Review & Book")'); await p.waitForTimeout(300);
  check('checkout: no wallet box with zero balance', await p.locator('text=Pay with VilleCoins').count() === 0);
  await p.close();

  // Driver collects only the cash part
  p = await page('wallet-driver');
  check('driver: collects J$700, told J$500 paid with coins', await p.locator('text=J$700').count() >= 1 && await p.locator('text=J$500 paid with VilleCoins').count() === 1);
  await p.close();

  // Admin
  p = await page('wallet-admin', '', 1280, 900);
  check('admin: totals', await p.locator('text=Coins held by customers').count() >= 1 && await p.locator('text=Used on rides').count() === 1);
  await p.fill('input[aria-label="Customer email or phone"]', 'kd@example.com'); await p.click('button:has-text("Search")'); await p.waitForTimeout(500);
  check('admin: finds customer with balance', await p.locator('text=Keneile Davis').count() === 1);
  await p.click('button:has-text("Add")'); await p.waitForTimeout(200);
  check('admin: needs an amount', await p.locator('text=Enter a number of coins').count() === 1);
  await p.fill('#aw-amt', '1000'); await p.fill('#aw-why', 'Paid cash at office'); await p.click('button:has-text("Add")'); await p.waitForTimeout(400);
  const aj = p.calls.find((c) => c[0] === 'walletAdminAdjust');
  check('admin: adjustment goes through the server with a reason', aj && aj[1].coins === 1000 && aj[1].reason === 'Paid cash at office' && aj[1].uid === 'cust1', JSON.stringify(aj));
  check('admin: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} passed`);
  process.exit(fails ? 1 : 0);
})();
