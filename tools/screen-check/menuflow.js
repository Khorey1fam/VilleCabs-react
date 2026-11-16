// Merchant menu: step 2 after sign-up, options editor, paste a menu, preview as customer.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (s) => `http://localhost:${process.env.PORT || 5055}/?s=${s}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
const prods = (p, uid) => p.evaluate((u) => [...window.__store.entries()].filter(([k]) => k.startsWith(`merchants/${u}/products/`)).map(([, v]) => v), uid);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = async (s, w = 390) => {
    const p = await b.newPage({ viewport: { width: w, height: 844 } });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto(URL(s)); await p.waitForTimeout(700); return p;
  };

  // Registration shows step 1 of 2
  let p = await page('merchantNew');
  check('sign-up: step 1 of 2 shown', await p.locator('text=Step 1 · Store details').count() === 1 && await p.locator('text=Next: add your menu and prices.').count() === 1);
  await p.close();

  // Pending store lands on step 2: add your menu, with skip
  p = await page('merchantPending');
  check('step 2: add your menu', await p.locator('text=Add your menu').count() >= 1 && await p.locator('text=Step 2 · Your menu').count() === 1);
  check('step 2: skip for now offered', await p.locator('button:has-text("Skip for now")').count() === 1);
  check('step 2: three tools', await p.locator('button:has-text("+ Add item")').count() === 1 && await p.locator('button:has-text("Paste a menu")').count() === 1 && await p.locator('button:has-text("Preview as customer")').count() === 1);
  await p.screenshot({ path: `${D}/menu-step2-390.png`, fullPage: true });

  // Paste a menu
  await p.click('button:has-text("Paste a menu")');
  await p.fill('#pm-text', 'Mains\nJerk chicken - 1200 | Quarter chicken with festival\nCurry goat J$1,500\n\nDRINKS:\nSorrel - 300\nFried dumpling (Sides) - 150\nJerk chicken - 1300\nAsk for specials | no price here');
  await p.waitForTimeout(200);
  check('paste: preview count', await p.locator('text=4 items to add').count() === 1);
  check('paste: section headings used', await p.locator('b:text-is("Sorrel")').count() === 1 && await p.locator('text=· Drinks').count() === 2 && await p.locator('text=· Sides').count() === 1);
  check('paste: comma price parsed', await p.locator('b:text-is("J$1,500")').count() === 1);
  check('paste: duplicate skipped', await p.locator('text=Listed twice, won’t be added').count() === 1);
  check('paste: line without price flagged', await p.locator('text=/Line 9: .*No price found/').count() === 1);
  await p.screenshot({ path: `${D}/menu-paste-390.png`, fullPage: true });
  await p.click('button:has-text("Add 4 items")'); await p.waitForTimeout(400);
  let list = await prods(p, 'shop2');
  const jerk = list.find((x) => x.name === 'Jerk chicken');
  check('paste: 4 products saved with correct shape', list.length === 4 && jerk && jerk.priceCents === 120000 && jerk.category === 'Mains' && jerk.description === 'Quarter chicken with festival' && jerk.available === true && jerk.stock === null && Array.isArray(jerk.options), JSON.stringify(list));
  check('paste: confirmation', await p.locator('text=Added 4 items to your menu.').count() === 1);
  check('step 2: done button counts items', await p.locator('button:has-text("Done, 4 items added")').count() === 1);

  // Pasting again skips what is already there
  await p.click('button:has-text("Paste a menu")');
  await p.fill('#pm-text', 'Sorrel - 300\nPatty - 250');
  await p.waitForTimeout(200);
  check('paste: existing item skipped', await p.locator('text=Already on your menu, won’t be added').count() === 1 && await p.locator('text=1 item to add').count() === 1);
  await p.click('button:has-text("Cancel")');

  // Options editor
  await p.click('button:has-text("+ Add item")');
  await p.fill('#pf-name', 'Fried chicken'); await p.fill('#pf-price', '900'); await p.fill('#pf-cat', 'Mains');
  await p.click('button:has-text("+ Add options")');
  await p.fill('#og-name-0', 'Size');
  await p.check('text=Customer must choose >> input');
  await p.fill('[aria-label="Choice 1 name"]', 'Two piece');
  await p.fill('[aria-label="Choice 2 name"]', 'Four piece'); await p.fill('[aria-label="Choice 2 extra price in J$"]', '700');
  await p.click('button:has-text("+ Add options")');
  await p.fill('#og-name-1', 'Sides');
  await p.locator('[aria-label="Choice 1 name"]').nth(1).fill('Fries'); await p.locator('[aria-label="Choice 1 extra price in J$"]').nth(1).fill('250');
  await p.locator('[aria-label="Choice 2 name"]').nth(1).fill('Festival'); await p.locator('[aria-label="Choice 2 extra price in J$"]').nth(1).fill('150');
  await p.selectOption('[aria-label="How many choices for Sides"]', '2');
  await p.screenshot({ path: `${D}/menu-options-390.png`, fullPage: true });
  // A price with no name is refused
  await p.click('button:has-text("+ Add choice") >> nth=1');
  await p.locator('[aria-label="Choice 3 extra price in J$"]').fill('100');
  await p.click('button:has-text("Save item")'); await p.waitForTimeout(200);
  check('options: choice with price but no name refused', await p.locator('text=One choice in “Sides” has a price but no name.').count() === 1);
  await p.click('[aria-label="Remove choice 3"] >> nth=0');
  await p.click('button:has-text("Save item")'); await p.waitForTimeout(400);
  list = await prods(p, 'shop2');
  const fc = list.find((x) => x.name === 'Fried chicken');
  const want = [{ name: 'Size', required: true, maxSelect: 1, choices: [{ label: 'Two piece', priceCents: 0 }, { label: 'Four piece', priceCents: 70000 }] }, { name: 'Sides', required: false, maxSelect: 2, choices: [{ label: 'Fries', priceCents: 25000 }, { label: 'Festival', priceCents: 15000 }] }];
  check('options: saved in the store page shape', fc && JSON.stringify(fc.options) === JSON.stringify(want), JSON.stringify(fc && fc.options));

  // Edit keeps existing options in the editor
  await p.locator('button[aria-label="Delete Fried chicken"]').locator('xpath=..').locator('button:has-text("Edit")').click(); await p.waitForTimeout(200);
  check('edit: existing options loaded', await p.locator('#og-name-0').inputValue() === 'Size' && await p.locator('#og-name-1').inputValue() === 'Sides');
  await p.click('button:has-text("Cancel")');

  // Preview as customer
  await p.click('button:has-text("Preview as customer")'); await p.waitForTimeout(200);
  const dlg = p.locator('[role=dialog]');
  check('preview: opens with pending note', await dlg.locator('text=once VilleDash approves your store').count() === 1);
  check('preview: sections', await dlg.locator('h2:has-text("Mains")').count() === 1 && await dlg.locator('h2:has-text("Drinks")').count() === 1 && await dlg.locator('h2:has-text("Sides")').count() === 1);
  check('preview: prices and options shown', await dlg.locator('text=J$1,200').count() === 1 && await dlg.locator('text=Size (must choose): Two piece, Four piece +J$700').count() === 1 && await dlg.locator('text=Sides (optional, up to 2): Fries +J$250, Festival +J$150').count() === 1);
  await p.screenshot({ path: `${D}/menu-preview-390.png`, fullPage: false });
  await dlg.locator('button:has-text("Close preview")').click();
  check('preview: closes', await p.locator('[role=dialog]').count() === 0);

  // Done → waiting screen with the menu still editable; remembered on reload
  await p.click('button:has-text("Done, 5 items added")'); await p.waitForTimeout(200);
  check('done: waiting for approval with menu below', await p.locator('text=Waiting for approval').count() === 1 && await p.locator('text=Your menu goes live when your store is approved').count() === 1 && await p.locator('button:has-text("+ Add item")').count() === 1);
  await p.reload(); await p.waitForTimeout(700);
  check('done: remembered after reload', await p.locator('text=Waiting for approval').count() === 1);
  check('pending: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  // Skip for now
  p = await page('merchantPending');
  await p.click('button:has-text("Skip for now")'); await p.waitForTimeout(200);
  check('skip: goes to waiting screen', await p.locator('text=Waiting for approval').count() === 1);
  await p.close();

  // Approved store: Menu tab has the same tools, preview has no pending note
  p = await page('merchant');
  await p.click('button:has-text("Menu")'); await p.waitForTimeout(300);
  check('approved: menu tab tools', await p.locator('button:has-text("Paste a menu")').count() === 1 && await p.locator('button:has-text("Preview as customer")').count() === 1);
  await p.click('button:has-text("Preview as customer")'); await p.waitForTimeout(200);
  check('approved: preview shows sold out and live note', await p.locator('[role=dialog] >> text=Sold out').count() >= 1 && await p.locator('[role=dialog] >> text=once VilleDash approves').count() === 0);
  await p.click('button:has-text("Close preview")');
  // Old-style options open in the new editor
  await p.locator('button[aria-label="Delete Jerk chicken"]').locator('xpath=..').locator('button:has-text("Edit")').click(); await p.waitForTimeout(200);
  const names = await p.locator('[id^=og-name-]').evaluateAll((els) => els.map((e) => e.value));
  check('approved: existing options open in editor', names.length >= 1, JSON.stringify(names));
  check('approved: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const f = out.filter((x) => x.startsWith('FAIL')).length;
  console.log(`\n${out.length - f}/${out.length} passed`);
  process.exit(f ? 1 : 0);
})();
