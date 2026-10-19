// VilleEvents: discover filters, save/unsave, reminders, share, calendar,
// book-a-ride prefill, inbox, VILLE home card, admin, layouts.
const { chromium } = require('playwright');
const D = process.env.SHOTS || 'shots';
const URL = (s, extra = '') => `http://localhost:${process.env.PORT || 5055}/rides.html?s=${s}${extra}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const open = async (s, w = 390, h = 844, extra = '') => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    p.navs = []; p.calls = []; p.drops = [];
    p.on('console', (m) => { const t = m.text(); if (t.startsWith('NAV ')) p.navs.push(t.slice(4)); if (t.startsWith('CALL ')) p.calls.push(t.slice(5)); if (t.startsWith('DROP ')) p.drops.push(JSON.parse(t.slice(5))); });
    await p.goto(URL(s, extra)); await p.waitForTimeout(1000); return p;
  };
  const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const count = (p) => p.locator('.ve-wrap > .ve-grid .ve-card').count();
  const writes = (p) => p.evaluate(() => window.__writes.map((w) => [w[0], w[1]]));

  // ── Discover, signed in ──
  let p = await open('events');
  check('discover: hero headline', await p.locator('h1:has-text("Discover What’s Happening in Mandeville")').count() === 1);
  check('discover: no page errors', !p.errs.length, p.errs.join('|'));
  check('discover: no sideways scroll at 390px', !(await overflow(p)));
  check('discover: five tabs', await p.locator('.ve-tabs [role=tab]').count() === 5);
  check('discover: draft, cancelled and past are not in upcoming (3 upcoming)', await count(p) === 3, String(await count(p)));
  check('discover: legacy approved flyer is listed', await p.locator('.ve-card:has-text("Old School Party")').count() >= 1);
  check('discover: draft never shown', await p.locator('text=Hidden Draft').count() === 0);
  check('discover: featured rail shows featured event', await p.locator('.ve-rail .ve-card:has-text("Mandeville Food Fest")').count() === 1);
  check('discover: venue filter lists venues, not event names', !(await p.locator('select[aria-label=Venue] option').allInnerTexts()).includes('Old School Party'));
  await p.fill('input[aria-label="Search events or venues"]', 'bloomfield'); await p.waitForTimeout(150);
  check('search: by venue', await count(p) === 1 && await p.locator('.ve-grid .ve-card:has-text("Reggae Night Live")').count() === 1);
  await p.fill('input[aria-label="Search events or venues"]', 'zzzz'); await p.waitForTimeout(150);
  check('search: no match → empty state', await p.locator('text=No events match').count() === 1);
  await p.click('.ve-empty button:has-text("Clear filters")'); await p.waitForTimeout(150);
  await p.click('.ve-chip:has-text("Free")'); await p.waitForTimeout(150);
  check('filter: Free shows only confirmed-free events', await count(p) === 1);
  await p.click('.ve-chip:has-text("Free")');
  await p.click('.ve-chip:has-text("Tomorrow")'); await p.waitForTimeout(150);
  check('filter: Tomorrow', await count(p) === 1 && await p.locator('.ve-grid .ve-card:has-text("Old School Party")').count() === 1);
  await p.click('.ve-chip:has-text("Any time")');
  await p.click('.ve-chip:has-text("Concerts & Live Music")'); await p.waitForTimeout(150);
  check('filter: category', await count(p) === 1);
  await p.click('.ve-chip:has-text("All categories")');
  await p.selectOption('select[aria-label="Event status"]', 'past'); await p.waitForTimeout(150);
  check('filter: past events shown separately', await count(p) === 1 && await p.locator('.ve-grid .ve-card:has-text("Fun Run 5K")').count() === 1);
  await p.selectOption('select[aria-label="Event status"]', 'cancelled'); await p.waitForTimeout(150);
  check('filter: cancelled', await count(p) === 1 && await p.locator('.ve-grid .ve-card:has-text("Community Clean-Up")').count() === 1);
  await p.selectOption('select[aria-label="Event status"]', 'upcoming'); await p.waitForTimeout(150);

  // Save → toast → reminder sheet
  await p.click('.ve-grid button[aria-label="Save Reggae Night Live"]'); await p.waitForTimeout(250);
  let w = await writes(p);
  check('save: writes event_saves/cust1_E2 (one doc per customer+event)', w.some(([k, path]) => k === 'set' && path === 'event_saves/cust1_E2'));
  check('save: toast offers reminders', await p.locator('.ve-toast:has-text("Saved to your events") button:has-text("Set reminders")').count() === 1);
  await p.click('.ve-grid button[aria-label="Remove Reggae Night Live from saved events"]'); await p.waitForTimeout(250);
  w = await writes(p);
  check('unsave: deletes the save', w.some(([k, path]) => k === 'delete' && path === 'event_saves/cust1_E2'));
  await p.click('.ve-grid button[aria-label="Save Reggae Night Live"]'); await p.waitForTimeout(250);
  await p.click('.ve-toast button:has-text("Set reminders")'); await p.waitForTimeout(250);
  check('reminders: sheet opens with all four + custom', await p.locator('.ve-sheet .ve-opt').count() === 5);
  await p.locator('.ve-sheet .ve-opt:has-text("1 week before") input').check();
  await p.click('.ve-sheet button:has-text("Save reminders")'); await p.waitForTimeout(300);
  const saved = await p.evaluate(() => window.__store.get('event_saves/cust1_E2'));
  check('reminders: saved choices on the same doc', saved && saved.remindersOn && saved.reminders.includes('1w') && saved.reminders.includes('1d'), JSON.stringify(saved && saved.reminders));
  check('reminders: honest confirmation when push allowed', await p.locator('.ve-toast:has-text("notification and an inbox message")').count() === 1);
  await p.screenshot({ path: `${D}/events-discover-390.png`, fullPage: true });

  // Tabs
  await p.click('.ve-tabs [role=tab]:has-text("Saved")'); await p.waitForTimeout(200);
  check('saved: upcoming and cancelled groups', await p.locator('h3:has-text("Upcoming")').count() === 1 && await p.locator('h3:has-text("Cancelled")').count() === 1);
  check('saved: reminder status shown', await p.locator('.ve-list:has-text("Reminders: 1 day")').count() >= 1);
  await p.click('.ve-tabs [role=tab]:has-text("My Events")'); await p.waitForTimeout(200);
  check('my events: sections', await p.locator('h3:has-text("This week")').count() === 1 && await p.locator('h3:has-text("Reminder preferences")').count() === 1 && await p.locator('h3:has-text("Recently viewed")').count() === 1);
  await p.click('.ve-seg button:has-text("Calendar")'); await p.waitForTimeout(200);
  check('my events: calendar view', await p.locator('.ve-cal').count() === 1);
  await p.click('.ve-tabs [role=tab]:has-text("Notifications")'); await p.waitForTimeout(200);
  check('inbox: lists notifications, unread marked', await p.locator('.ve-inbox .ve-item').count() === 2 && await p.locator('.ve-unread').count() === 1);
  await p.click('.ve-inbox .ve-item:has-text("Food Fest")'); await p.waitForTimeout(300);
  check('inbox: tap marks read and opens event', await p.evaluate(() => window.__store.get('customer_notifications/n1').read === true) && await p.locator('h1:has-text("Mandeville Food Fest")').count() === 1);
  check('no page errors after flow', !p.errs.length, p.errs.join('|'));
  await p.close();

  // ── Detail ──
  p = await open('events-detail');
  check('detail: opens deep-linked event', await p.locator('h1:has-text("Mandeville Food Fest")').count() === 1);
  check('detail: original flyer image, not cropped (contain/auto)', await p.locator('.ve-detail__poster img').first().count() === 1);
  check('detail: view tracked once', p.calls.filter((c) => c.startsWith('eventTrack') && c.includes('"view"')).length === 1, p.calls.join('|'));
  check('detail: organiser contact only when allowed', await p.locator('text=876-555-0100').count() === 1);
  await p.click('.ve-action:has-text("Share")'); await p.waitForTimeout(200);
  const wa = await p.locator('.ve-sheet a:has-text("WhatsApp")').getAttribute('href');
  check('share: WhatsApp link carries the /e/ preview link', wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes('/e/E1'));
  check('share: copy link option', await p.locator('.ve-sheet button:has-text("Copy link")').count() === 1);
  await p.click('.ve-sheet button[aria-label=Close] >> nth=0'); await p.waitForTimeout(150);
  await p.click('.ve-action:has-text("Calendar")'); await p.waitForTimeout(200);
  const g = await p.locator('.ve-sheet a:has-text("Google")').getAttribute('href');
  check('calendar: Google link uses Jamaica time zone', g.includes('ctz=America%2FJamaica') && g.includes('action=TEMPLATE'));
  check('calendar: .ics download offered', await p.locator('.ve-sheet button:has-text(".ics"), .ve-sheet button:has-text("Apple")').count() >= 1);
  await p.click('.ve-sheet button[aria-label=Close] >> nth=0'); await p.waitForTimeout(150);
  await p.click('.ve-ride button:has-text("Book a ride")'); await p.waitForTimeout(200);
  const d = p.drops[p.drops.length - 1] || {};
  check('ride: venue prefilled as drop-off with coords', d.address && d.address.includes('Cecil Charlton Park') && d.coords && d.coords.lat === 18.0416, JSON.stringify(d));
  check('ride: event linked for analytics', d.eventId === 'E1');
  check('ride: goes to pickup (no fake confirmation)', p.navs[p.navs.length - 1] === 'pin-pickup');
  check('detail: no sideways scroll', !(await overflow(p)));
  await p.screenshot({ path: `${D}/events-detail-390.png`, fullPage: true });
  await p.close();

  // Legacy flyer detail: no coords → address only
  p = await open('events-legacy');
  check('legacy: opens', await p.locator('h1:has-text("Old School Party")').count() === 1);
  await p.click('.ve-ride button:has-text("Book a ride")'); await p.waitForTimeout(200);
  check('legacy: address-only drop-off (no invented coords)', p.drops.length && p.drops[0].coords === null);
  await p.close();

  // Push denied → honest message
  p = await open('events-detail', 390, 844, '&push=denied');
  await p.click('.ve-action:has-text("Reminders on")'); await p.waitForTimeout(200);
  await p.click('.ve-sheet button:has-text("Save reminders")'); await p.waitForTimeout(300);
  check('reminders: denied push → says inbox only', await p.locator('.ve-toast:has-text("blocked on this device")').count() === 1);
  await p.close();

  // ── Guest ──
  p = await open('events-guest');
  await p.click('.ve-grid button[aria-label="Save Reggae Night Live"]'); await p.waitForTimeout(200);
  check('guest: save asks to sign in, writes nothing', await p.locator('.ve-toast:has-text("Sign in")').count() === 1 && (await writes(p)).every(([, path]) => !path.startsWith('event_saves')));
  await p.click('.ve-tabs [role=tab]:has-text("Saved")'); await p.waitForTimeout(200);
  check('guest: saved tab prompts sign in', await p.locator('text=Sign in to see your saved events').count() === 1);
  await p.close();

  // ── Desktop ──
  p = await open('events', 1440, 900);
  const cols = await p.$$eval('.ve-wrap > .ve-grid .ve-card', (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  check('desktop: grid places cards side by side', cols === 1, String(cols));
  check('desktop: no sideways scroll', !(await overflow(p)));
  await p.screenshot({ path: `${D}/events-discover-1440.png`, fullPage: true });
  await p.close();

  // ── VILLE home card ──
  p = await open('ville-home-events');
  check('home: Your upcoming events card shows saved event', await p.locator('text=Your upcoming events').count() === 1 && await p.locator('text=Mandeville Food Fest').first().count() === 1);
  check('home: cancelled save not in upcoming', await p.locator('.vl-card:has-text("Your upcoming events") >> text=Community Clean-Up').count() === 0);
  check('home: event notification in notifications', await p.locator('text=Mandeville Food Fest is coming up').count() === 1);
  check('home: no page errors', !p.errs.length, p.errs.join('|'));
  await p.close();
  p = await open('ville-home');
  check('home (no saves): empty state copy', await p.locator('text=Discover what’s happening around Mandeville.').count() === 1);
  await p.close();

  // ── Admin ──
  p = await open('admin-events', 1280, 900);
  check('admin: lists all statuses incl. draft', await p.locator('text=Hidden Draft').count() === 1);
  check('admin: no page errors', !p.errs.length, p.errs.join('|'));
  await p.click('button:has-text("Engagement")'); await p.waitForTimeout(200);
  check('admin: engagement from real counters (booked vs completed separate)', await p.locator('th:has-text("Rides booked")').count() === 1 && await p.locator('th:has-text("Rides completed")').count() === 1 && await p.locator('tr:has-text("Mandeville Food Fest") td >> text=42').count() === 1);
  await p.click('button:has-text("Events")'); await p.click('button:has-text("+ New event")'); await p.waitForTimeout(200);
  await p.click('button:has-text("Save & publish")'); await p.waitForTimeout(200);
  check('admin: publish needs a name', await p.locator('text=Add the event name').count() === 1);
  await p.locator('label:has-text("Event name") + input').fill('Test Gala');
  await p.click('button:has-text("Save & publish")'); await p.waitForTimeout(200);
  check('admin: publish needs a date', await p.locator('text=Add the event date').count() === 1);
  await p.locator('input[type=date]').fill('2026-12-05'); await p.locator('input[type=time] >> nth=0').fill('19:30');
  await p.locator('label:has-text("Venue name") + input').fill('Golf View Hotel');
  await p.locator('label:has-text("Ticket link") + input').fill('http://insecure.example');
  await p.click('button:has-text("Save & publish")'); await p.waitForTimeout(200);
  check('admin: rejects non-https ticket link', await p.locator('text=must be the organiser’s https').count() === 1);
  await p.locator('label:has-text("Ticket link") + input').fill('');
  await p.click('button:has-text("Save & publish")'); await p.waitForTimeout(300);
  const created = await p.evaluate(() => { const e = [...window.__store.entries()].find(([k, v]) => k.startsWith('ville_events/') && v.title === 'Test Gala'); return e && [e[0], { ...e[1], startAt: e[1].startAt && e[1].startAt.toMillis() }]; });
  const startMs = created && created[1].startAt;
  check('admin: saved as published with Jamaica time (7:30 pm = 00:30 UTC next day)', created && created[1].status === 'published' && new Date(startMs).toISOString() === '2026-12-06T00:30:00.000Z', created ? new Date(startMs).toISOString() : 'none');
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} passed`);
  process.exit(fails ? 1 : 0);
})();
