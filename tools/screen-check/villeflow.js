// VILLE homepage + signed-in home: navigation, launch flags, interest form, layout.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (s) => `http://localhost:${process.env.PORT || 5055}/rides.html?s=${s}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const open = async (s, w = 390, h = 844) => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.navs = []; p.adds = [];
    p.on('console', (m) => { const t = m.text(); if (t.startsWith('NAV ')) p.navs.push(t.slice(4)); if (t.startsWith('ADD ')) p.adds.push(t); });
    await p.goto(URL(s)); await p.waitForTimeout(1200); return p;
  };
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const clickNav = async (p, sel) => { p.navs = []; await p.locator(sel).first().click(); await p.waitForTimeout(150); return p.navs[p.navs.length - 1]; };

  // Public homepage, mobile
  let p = await open('ville-public');
  check('public: headline', await p.locator('h1:has-text("One App.")').count() === 1);
  check('public: no page errors', !p.errs.length, p.errs.join('|'));
  check('public: no sideways scroll at 390px', !(await overflow(p)));
  check('public: three service cards', await p.locator('.vl-svc').count() === 3);
  check('public: VilleDash shows Coming soon while off', (await p.locator('.vl-svc').nth(1).innerText()).includes('Coming soon'));
  check('public: VilleCabs → sign in when signed out', await clickNav(p, '.vl-svc >> nth=0') === 'customer-login');
  check('public: VilleDash (off) → coming-soon page, no ordering', await clickNav(p, '.vl-svc >> nth=1') === 'dash-public');
  check('public: VilleEvents → events page', await clickNav(p, '.vl-svc >> nth=2') === 'ville-events');
  check('public: stores show Coming soon, no store links', await p.locator('a.vl-store').count() === 0 && await p.locator('.vl-store:has-text("Coming soon")').count() === 2);
  await p.fill('#vl-interest-input', 'not-an-email'); await p.click('button:has-text("Notify me")'); await p.waitForTimeout(200);
  check('public: interest form rejects bad input', (await p.locator('.vl-interest__msg').innerText()).includes('valid'));
  await p.fill('#vl-interest-input', 'fan@example.com'); await p.click('button:has-text("Notify me")'); await p.waitForTimeout(400);
  check('public: interest saved', (await p.locator('.vl-interest__msg').innerText()).includes('Thanks') && p.adds.some((a) => a.includes('dash_interest')), p.adds.join('|'));
  await p.click('button[aria-label="Open menu"]'); await p.waitForTimeout(200);
  check('public: mobile menu opens with sign in / create account', await p.locator('.vl-sheet >> text=Create account').count() === 1);
  check('public: create account → signup', await clickNav(p, '.vl-sheet >> text=Create account') === 'customer-signup');
  await p.screenshot({ path: `${D}/ville-public-390.png`, fullPage: true });
  await p.close();

  // Public, desktop
  p = await open('ville-public', 1440, 900);
  check('desktop: nav links visible', await p.locator('.vl-nav__links >> text=Our Services').isVisible());
  const widths = await p.$$eval('.vl-svc', (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  check('desktop: service cards use the width (3 across, each > 340px)', widths.length === 3 && widths.every((w) => w > 340), widths.join(','));
  check('desktop: no sideways scroll', !(await overflow(p)));
  await p.screenshot({ path: `${D}/ville-public-1440.png`, fullPage: true });
  await p.close();

  // VilleDash launched
  p = await open('ville-public-dashlive');
  check('dash live: shows Live', (await p.locator('.vl-svc').nth(1).innerText()).includes('Live'));
  check('dash live: signed-out → sign in', await clickNav(p, '.vl-svc >> nth=1') === 'customer-login');
  await p.close();

  // Signed-in home
  p = await open('ville-home');
  check('home: greets by first name', (await p.locator('.vl-greet h1').innerText()).includes('Keneile'));
  check('home: no page errors', !p.errs.length, p.errs.join('|'));
  check('home: recent rides from real bookings', await p.locator('.vl-row:has-text("Mandeville Regional Hospital")').count() === 1);
  check('home: notification shown', await p.locator('text=has arrived at your pickup').count() === 1);
  check('home: Where to → booking', await clickNav(p, '.vl-where') === 'customer-dash');
  check('home: no Orders tab while VilleDash is off', await p.locator('.vl-tabbar >> text=Orders').count() === 0);
  check('home: no sideways scroll at 390px', !(await overflow(p)));
  await p.screenshot({ path: `${D}/ville-home-390.png`, fullPage: true });
  await p.click('.vl-avatar'); await p.waitForTimeout(150);
  check('home: account menu → sign out', await clickNav(p, '.vl-menu >> text=Sign out') === 'signed-out');
  await p.close();

  p = await open('ville-home-active');
  check('home: active ride card', await p.locator('.vl-active:has-text("Driver on the way")').count() === 1);
  check('home: unpaid card ride → back to payment', await clickNav(p, '.vl-active:has-text("card payment")') === 'booking-confirm');
  check('home: active ride → live tracking', await clickNav(p, '.vl-active:has-text("Driver on the way")') === 'live-ride');
  await p.close();
  p = await open('ville-home-active', 1440, 900);
  await p.screenshot({ path: `${D}/ville-home-1440.png`, fullPage: true });
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
  process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
