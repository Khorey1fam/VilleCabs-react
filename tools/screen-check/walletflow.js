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
  check('wallet: 2% back shown', await p.locator('text=Earn 2% back in VilleCoins on every completed ride').count() === 1);
  check('wallet: three ways to pay', await p.locator('[aria-label="How to pay"] button[role=radio]').count() === 3);
  check('wallet: live amount line', await p.locator('text=1,000 VilleCoins = J$1,000').count() === 1);
  await p.click('button[role=radio]:has-text("Card")');
  check('wallet: card off → honest text, no pay button', await p.locator('text=Card payments aren’t available yet').count() === 1 && await p.locator('button:has-text("by card")').count() === 0);
  await p.click('button[role=radio]:has-text("Bank transfer")');
  check('wallet: bank not set up → says so', await p.locator('text=Bank transfers aren’t set up yet').count() === 1);
  await p.click('button[role=radio]:has-text("Contact us")');
  const wa = await p.locator('a:has-text("Message us on WhatsApp")').getAttribute('href');
  check('contact: WhatsApp link with the amount in the message', /^https:\/\/wa\.me\/18765158113\?text=/.test(wa) && decodeURIComponent(wa).includes('buy 1,000 VilleCoins'), wa);
  check('contact: call and email offered', await p.locator('a[href^="tel:+1876"]').count() === 1 && await p.locator('a[href^="mailto:admin@villecabs.com"]').count() === 1);
  check('wallet: history lists activity', await p.locator('text=Added by VilleCabs').count() === 1 && await p.locator('text=Paid for a ride').count() === 1);
  check('wallet: no-cash-out rule stated', await p.locator('text=Coins can’t be exchanged back for money').count() === 1);
  check('wallet: no page errors', !p.errs.length, p.errs.join('|'));
  await p.screenshot({ path: `${D}/wallet-390.png`, fullPage: true });
  await p.close();

  p = await page('wallet-card', '&coins=0');
  await p.click('button[role=radio]:has-text("2,000")');
  await p.click('button[role=radio]:has-text("Card")');
  check('top-up: amount picker updates button', await p.locator('button:has-text("Pay J$2,000 by card")').count() === 1);
  await p.fill('input[placeholder="500 – 50,000"]', '300');
  await p.click('button:has-text("by card")'); await p.waitForTimeout(200);
  check('top-up: under 500 refused', await p.locator('[role=alert]:has-text("Choose between 500 and 50,000")').count() === 1 && !p.calls.some((c) => c[0] === 'walletTopupCreate'));
  await p.fill('input[placeholder="500 – 50,000"]', '3500');
  check('top-up: custom amount used', await p.locator('button:has-text("Pay J$3,500 by card")').count() === 1);
  await p.click('button:has-text("Pay J$3,500 by card")'); await p.waitForTimeout(600);
  const tc = p.calls.find((c) => c[0] === 'walletTopupCreate'); const pc = p.calls.find((c) => c[0] === 'payCardStart');
  check('top-up: creates top-up then opens WiPay', tc && tc[1].coins === 3500 && pc && pc[1].kind === 'topup' && pc[1].id === 'TOPUP1', JSON.stringify([tc, pc]));
  await p.close();

  // Bank transfer
  p = await page('wallet', '&coins=0&bank=1&past=1');
  await p.click('button[role=radio]:has-text("5,000")');
  await p.click('button[role=radio]:has-text("Bank transfer")');
  await p.click('button:has-text("Get bank details for J$5,000")'); await p.waitForTimeout(500);
  const bc = p.calls.find((c) => c[0] === 'walletBankCreate');
  check('bank: request made for the chosen amount', bc && bc[1].coins === 5000, JSON.stringify(bc));
  const open = p.locator('[data-bank-request=pending]');
  check('bank: shows account details and code', await open.locator('text=000111222').count() === 1 && await open.locator('text=Test Bank').count() === 1 && await open.locator('text=VC-K7M2QX').count() === 1 && await open.locator('text=Waiting for your transfer').count() === 1);
  check('bank: says coins come after the money arrives', await open.locator('text=after VilleCabs sees the money').count() === 1);
  await p.screenshot({ path: `${D}/wallet-bank-390.png`, fullPage: true });
  await open.locator('input[type=file]').setInputFiles({ name: 'r.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }); await p.waitForTimeout(500);
  const bu = p.calls.find((c) => c[0] === 'walletBankUpdate');
  check('bank: receipt goes to the customer’s own folder', bu && bu[1].id === 'BRNEW' && /^wallet_receipts\/cust1\/\d+\.jpg$/.test(bu[1].receiptPath), JSON.stringify(bu));
  check('bank: status changes to checking', await open.locator('text=We’re checking your transfer').count() === 1 && await open.locator('text=Receipt added').count() === 1);
  await open.locator('input[type=file]').setInputFiles({ name: 'r.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') }); await p.waitForTimeout(300);
  check('bank: non-photo receipt refused', await open.locator('[role=alert]:has-text("Use a photo or screenshot")').count() === 1);
  check('bank: rejected one shows the reason', await p.locator('[data-bank-request=rejected] >> text=No transfer with this code').count() === 1);
  await open.locator('button:has-text("Cancel this transfer")').click(); await p.waitForTimeout(400);
  check('bank: customer can cancel', p.calls.some((c) => c[0] === 'walletBankUpdate' && c[1].cancel === true) && await p.locator('[data-bank-request=pending]').count() === 0);
  check('bank: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  // VilleDash wallet: same page, VilleDash header with back
  p = await page('wallet-vd', '&coins=700&bank=1');
  check('villedash: wallet page with balance and ways to pay', await p.locator('text=700').first().count() === 1 && await p.locator('[aria-label="How to pay"] button[role=radio]').count() === 3);
  await p.click('button[aria-label=Back]'); await p.waitForTimeout(200);
  check('villedash: back goes to VilleDash home', p.navs.includes('dash-home'), JSON.stringify(p.navs));
  await p.close();

  // Redeem a code
  p = await page('wallet', '&coins=0');
  await p.fill('input[aria-label="VilleCoins code"]', 'vc-bad1-0000'); await p.click('button:has-text("Redeem")'); await p.waitForTimeout(300);
  check('redeem: wrong code says so', await p.locator('[role=alert]:has-text("That code isn’t right")').count() === 1);
  await p.fill('input[aria-label="VilleCoins code"]', 'vc-good-2345');
  check('redeem: typed code is upper-cased', await p.locator('input[aria-label="VilleCoins code"]').inputValue() === 'VC-GOOD-2345');
  await p.click('button:has-text("Redeem")'); await p.waitForTimeout(300);
  check('redeem: right code adds coins', await p.locator('[role=status]:has-text("1,000 VilleCoins added to your wallet.")').count() === 1 && await p.locator('input[aria-label="VilleCoins code"]').inputValue() === '');
  await p.screenshot({ path: `${D}/wallet-redeem-390.png`, fullPage: true });
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
  check('checkout: zero balance shows the wallet with Add coins, no tick box', await p.locator('text=Pay with VilleCoins').count() === 0 && await p.locator('text=VilleCoins: 0').count() === 1 && await p.locator('button:has-text("Add coins")').count() === 1);
  await p.click('button:has-text("Add coins")'); await p.waitForTimeout(200);
  check('checkout: Add coins opens the wallet', p.navs.includes('wallet'), JSON.stringify(p.navs));
  await p.close();

  // Driver collects only the cash part
  p = await page('wallet-driver');
  check('driver: collects J$700, told J$500 paid with coins', await p.locator('text=J$700').count() >= 1 && await p.locator('text=J$500 paid with VilleCoins').count() === 1);
  await p.close();

  // Welcome pop-up (once)
  p = await page('welcome', '&coins=200&welcome=1');
  check('welcome: pop-up shows the gift', await p.locator('[role=dialog] >> text=200 VilleCoins').count() === 1 && await p.locator('text=J$200 has been added to your wallet.').count() === 1);
  await p.screenshot({ path: `${D}/welcome-390.png` });
  await p.click('button:has-text("View my wallet")'); await p.waitForTimeout(300);
  check('welcome: closing marks it seen and opens the wallet', p.calls.some((c) => c[0] === 'walletWelcomeSeen') && p.navs.includes('wallet') && await p.locator('[role=dialog]').count() === 0);
  await p.close();
  p = await page('welcome', '&coins=200&welcome=seen');
  check('welcome: not shown again once seen', await p.locator('[role=dialog]').count() === 0);
  await p.close();
  p = await page('welcome', '&coins=200');
  check('welcome: not shown without a gift', await p.locator('[role=dialog]').count() === 0);
  await p.close();

  // Admin
  p = await page('wallet-admin', '', 1280, 900);
  check('admin: totals', await p.locator('text=Coins held by customers').count() >= 1 && await p.locator('text=Used on rides').count() === 1);
  await p.fill('input[aria-label="Customer email or phone"]', 'kd@example.com'); await p.click('button:has-text("Search")'); await p.waitForTimeout(500);
  check('admin: finds customer with balance', await p.locator('text=kd@example.com').count() >= 1 && await p.locator('#aw-amt').count() === 1);
  await p.click('button:has-text("Add")'); await p.waitForTimeout(200);
  check('admin: needs an amount', await p.locator('text=Enter a number of coins').count() === 1);
  await p.fill('#aw-amt', '1000'); await p.fill('#aw-why', 'Paid cash at office'); await p.click('button:has-text("Add")'); await p.waitForTimeout(400);
  const aj = p.calls.find((c) => c[0] === 'walletAdminAdjust');
  check('admin: adjustment goes through the server with a reason', aj && aj[1].coins === 1000 && aj[1].reason === 'Paid cash at office' && aj[1].uid === 'cust1', JSON.stringify(aj));
  check('admin rewards: welcome off by default', await p.locator('[data-welcome=off]').count() === 1 && await p.locator('text=Give welcome coins to all existing customers').count() === 0);
  await p.click('button:has-text("Turn on")'); await p.waitForTimeout(300);
  const wc = await p.evaluate(() => window.__store.get('config/wallet'));
  check('admin rewards: turn on saves 200', wc && wc.welcomeOn === true && wc.welcomeCoins === 200, JSON.stringify(wc));
  await p.click('button:has-text("Give welcome coins to all existing customers")'); await p.waitForTimeout(100);
  check('admin rewards: asks before giving to everyone', await p.locator('text=Yes, give to everyone').count() === 1 && !p.calls.some((c) => c[0] === 'walletWelcomeAll'));
  await p.click('button:has-text("Yes, give to everyone")'); await p.waitForTimeout(300);
  check('admin rewards: gives to all and reports', p.calls.some((c) => c[0] === 'walletWelcomeAll') && await p.locator('text=12 customers got 200 VilleCoins').count() === 1);
  await p.click('button:has-text("Turn off")'); await p.waitForTimeout(300);
  check('admin rewards: turn off', (await p.evaluate(() => window.__store.get('config/wallet'))).welcomeOn === false);
  check('admin: bank transfers waiting', await p.locator('text=Bank transfers to check (2)').count() === 1 && await p.locator('[data-bank-row="VC-AB12CD"] >> text=View receipt').count() === 1 && await p.locator('[data-bank-row="VC-ZZ99YY"] >> text=No receipt yet').count() === 1);
  await p.locator('[data-bank-row="VC-ZZ99YY"] >> button:has-text("Reject")').click(); await p.waitForTimeout(200);
  check('admin: reject needs a reason', await p.locator('[data-bank-row="VC-ZZ99YY"] >> text=Write a short reason').count() === 1);
  await p.fill('#br-amt-BR1', '1800'); await p.fill('#br-note-BR1', 'J$1,800 arrived');
  await p.locator('[data-bank-row="VC-AB12CD"] >> button:has-text("Approve")').click(); await p.waitForTimeout(400);
  const bd = p.calls.find((c) => c[0] === 'walletBankDecide');
  check('admin: approve sends the amount that arrived', bd && bd[1].id === 'BR1' && bd[1].approve === true && bd[1].coins === 1800, JSON.stringify(bd));
  check('admin: approved one leaves the list', await p.locator('[data-bank-row="VC-AB12CD"]').count() === 0);
  await p.click('button:has-text("Make codes")'); await p.waitForTimeout(200);
  check('admin codes: needs coins', await p.locator('text=Enter how many coins each code is worth').count() === 1);
  await p.fill('#rc-coins', '1000'); await p.fill('#rc-count', '2'); await p.fill('#rc-note', 'Office sale'); await p.click('button:has-text("Make codes")'); await p.waitForTimeout(400);
  const cc = p.calls.find((c) => c[0] === 'walletCodeCreate');
  check('admin codes: makes codes on the server', cc && cc[1].coins === 1000 && cc[1].count === 2 && cc[1].note === 'Office sale', JSON.stringify(cc));
  check('admin codes: new codes shown to copy', await p.locator('text=2 new codes:').count() === 1 && await p.locator('[data-code-row=active]').count() === 2 && await p.locator('[data-code-row=redeemed] >> text=by kd@example.com').count() === 1);
  await p.click('button[aria-label="Cancel VC-NEW0-ABCD"]'); await p.waitForTimeout(300);
  check('admin codes: cancel an unused code', p.calls.some((c) => c[0] === 'walletCodeCancel' && c[1].code === 'VC-NEW0-ABCD') && await p.locator('[data-code-row=cancelled]').count() === 1);
  check('admin: bank transfer off until account number added', await p.locator('text=Bank transfer is off until you add an account number').count() === 1);
  await p.click('button[aria-expanded=false]:has-text("Edit")');
  await p.fill('#ws-bankName', 'My Bank'); await p.fill('#ws-accountNumber', '123456'); await p.click('button:has-text("Save settings")'); await p.waitForTimeout(300);
  const saved = await p.evaluate(() => window.__store.get('config/wallet'));
  check('admin: saves bank details', saved && saved.bankName === 'My Bank' && saved.accountNumber === '123456', JSON.stringify(saved));
  await p.screenshot({ path: `${D}/wallet-admin-1280.png`, fullPage: true });
  check('admin: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} passed`);
  process.exit(fails ? 1 : 0);
})();
