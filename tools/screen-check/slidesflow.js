// VilleDash slideshow across the top of the VilleCabs dashboard.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (x) => `http://localhost:${process.env.PORT || 5055}/rides.html?s=wallet-dash${x}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (x, w = 390, opts = {}) => {
    const p = await b.newPage({ viewport: { width: w, height: 844 }, ...opts });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.navs = []; p.on('console', (m) => { const t = m.text(); if (t.startsWith('NAV ')) p.navs.push(t.slice(4)); });
    await p.goto(URL(x)); await p.waitForTimeout(1200); return p;
  };
  let p = await page('');
  check('dash off: no slideshow', await p.locator('section[aria-label=VilleDash]').count() === 0);
  await p.close();

  p = await page('&dash=1');
  const sec = p.locator('section[aria-label=VilleDash]');
  check('dash on: slideshow shown', await sec.count() === 1);
  const box = await sec.boundingBox();
  check('stretches across the top (full width)', box && Math.round(box.x) === 0 && Math.round(box.width) === 390, JSON.stringify(box));
  const titles = await p.locator('.vds-title').allTextContents();
  check('no stores yet: only send + gift slides', JSON.stringify(titles) === JSON.stringify(['Need to send a package?', 'Send a gift today.']), JSON.stringify(titles));
  await p.screenshot({ path: `${D}/slides-390.png`, clip: { x: 0, y: 0, width: 390, height: box.y + box.height + 10 } });
  await p.close();

  p = await page('&dash=stores');
  const t2 = await p.locator('.vds-title').allTextContents();
  check('stores live: food and groceries slides, not shops (pending only)', t2.includes('Hungry? Have food delivered.') && t2.includes('Groceries to your door.') && !t2.includes('Shop local, delivered.') && !t2.includes('Out of something?'), JSON.stringify(t2));
  check('first slide visible', await p.locator('[aria-roledescription=slide]').first().getAttribute('aria-hidden') === 'false');
  await p.waitForTimeout(5600);
  check('auto-advances', await p.locator('[aria-roledescription=slide]').nth(1).getAttribute('aria-hidden') === 'false');
  await p.click('button[aria-label^="Show slide 2"]'); await p.waitForTimeout(700);
  await p.screenshot({ path: `${D}/slides-food-390.png`, clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.click('[aria-roledescription=slide][aria-hidden=false] >> button'); await p.waitForTimeout(300);
  check('food CTA opens stores filtered to food', p.navs.includes('dash-stores') && await p.evaluate(() => sessionStorage.getItem('vd_store_group')) === 'food', JSON.stringify(p.navs));
  await p.click('button[aria-label^="Show slide 1"]'); await p.waitForTimeout(700);
  await p.click('[aria-roledescription=slide][aria-hidden=false] >> button'); await p.waitForTimeout(300);
  check('send CTA opens send a package', p.navs.includes('dash-send'), JSON.stringify(p.navs));
  check('no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  p = await page('&dash=stores', 1280);
  const bx = await p.locator('section[aria-label=VilleDash]').boundingBox();
  check('desktop: full width', bx && Math.round(bx.width) === 1280, JSON.stringify(bx));
  await p.screenshot({ path: `${D}/slides-1280.png`, clip: { x: 0, y: 0, width: 1280, height: bx.y + bx.height + 10 } });
  await p.close();

  p = await page('&dash=stores', 390, { reducedMotion: 'reduce' });
  await p.waitForTimeout(5600);
  check('reduced motion: no auto-advance', await p.locator('[aria-roledescription=slide]').first().getAttribute('aria-hidden') === 'false');
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const f = out.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${out.length - f}/${out.length} passed`); process.exit(f ? 1 : 0);
})();
