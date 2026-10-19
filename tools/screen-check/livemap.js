// Drives the live trip map: steady car on the route, re-route only on a real
// deviation, ETA counting down, labels and panel. Run with serve.js on PORT.
const { chromium } = require('playwright');
const URL = (s) => `http://localhost:${process.env.PORT || 5055}/live.html?s=${s}`;
const out = []; const check = (n, ok, x = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`);
const wait = (p, ms) => p.waitForTimeout(ms);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const open = async (s) => {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
    await p.goto(URL(s)); await wait(p, 700); return p;
  };
  const calls = (p) => p.evaluate(() => window.__dirCalls.length);
  const car = (p, t = 'Your driver') => p.evaluate((t) => { const e = document.querySelector(`[data-marker="${t}"]`); return e && { lat: +e.dataset.lat, lng: +e.dataset.lng, src: e.src }; }, t);
  const panel = (p) => p.evaluate(() => (document.querySelector('[data-ltm-panel]') || {}).innerText || '');
  const fix = (p, lat, lng) => p.evaluate(([a, b]) => window.__setVeh({ lat: a, lng: b }), [lat, lng]);

  // ── Customer: driver heading to pickup ──
  let p = await open('ride');
  check('one route request on load', await calls(p) === 1, String(await calls(p)));
  check('panel says Pickup in X min', /Pickup in \d+ min/.test(await panel(p)), await panel(p));
  check('Pickup spot label with ETA', await p.locator('[data-ltm-label="Pickup spot"]').count() === 1 && /\d+ min · /.test(await p.locator('[data-ltm-label="Pickup spot"]').innerText()));
  check('drop-off pin hidden until the journey starts', await p.locator('[data-ltm-label="Drop-off"]').count() === 0);
  check('map is north-up (heading 0), tilt only with a Map ID', await p.evaluate(() => window.__heading === undefined || window.__heading === 0));
  const icon0 = (await car(p)).src;
  await p.screenshot({ path: 'shots/live-ride-pickup.png' });
  const eta0 = (await panel(p)).match(/Pickup in (\d+)/)[1];

  // Drive east along the road with a little GPS noise (10–25 m off the line).
  const lat0 = 18.0480;
  for (let i = 1; i <= 6; i += 1) {
    await fix(p, lat0 + (i % 2 ? 0.00012 : -0.00018), -77.5120 + i * 0.0007);
    await wait(p, 1100);
  }
  // Smoothness: sample the car every 100 ms over the next 3 fixes.
  const samples = [];
  for (let i = 7; i <= 9; i += 1) {
    await fix(p, lat0, -77.5120 + i * 0.0007);
    for (let k = 0; k < 10; k += 1) { samples.push((await car(p)).lng); await wait(p, 100); }
  }
  const steps = samples.slice(1).map((v, i) => Math.abs(v - samples[i]) * 105000);
  const maxStep = Math.max(...steps), stops = steps.slice(5).filter((x) => x < 0.3).length;
  check('car glides smoothly (no jumps between fixes)', maxStep < 15, `max ${maxStep.toFixed(1)} m per 100 ms`);
  check('car keeps rolling between fixes (no stop-start)', stops <= 2, `${stops} still frames`);
  const c1 = await car(p);
  check('no re-route while on the road', await calls(p) === 1, String(await calls(p)));
  check('car snapped onto the road, not the noisy GPS point', Math.abs(c1.lat - lat0) < 1e-6, String(c1.lat));
  const h1 = await p.evaluate(() => window.__carHeading);
  check('car faces along the road (east), not the GPS wobble', Math.abs(h1 - 90) < 4, String(h1));
  check('car icon redrawn to face the road', c1.src !== icon0 || Math.abs(h1 - 90) < 4);
  // Drive round the corner onto the southbound stretch.
  const corner = -77.5036;
  const legs = [[lat0, -77.5054], [lat0, -77.5042], [lat0 - 0.0004, corner], [lat0 - 0.0012, corner]];
  for (const [la, ln] of legs) { await fix(p, la, ln); await wait(p, 1300); }
  const h2 = await p.evaluate(() => window.__carHeading);
  check('car turns with the road at the corner (now facing south)', Math.abs(h2 - 180) < 6, String(h2));
  check('still no re-route after the corner', await calls(p) === 1, String(await calls(p)));
  const eta1 = (await panel(p)).match(/Pickup in (\d+)/)[1];
  check('ETA counts down without asking Google', +eta1 < +eta0, `${eta0} → ${eta1}`);
  const pts = await p.evaluate(() => [...document.querySelectorAll('[data-polyline="5"]')].map((e) => +e.dataset.points)[0]);
  check('only the road ahead is drawn', pts < 41, String(pts));

  // A single stray fix far off the road: hold, don't re-route.
  await fix(p, lat0 - 0.0013, corner + 0.0013); await wait(p, 1100);
  await fix(p, lat0 - 0.0016, corner); await wait(p, 1100);
  check('one stray GPS fix does not re-route', await calls(p) === 1, String(await calls(p)));

  // Really turning off: several fixes on another road over > 4 s.
  for (let i = 1; i <= 5; i += 1) { await fix(p, lat0 - 0.0016, corner + i * 0.0009); await wait(p, 1100); }
  check('a real wrong turn re-routes once', await calls(p) === 2, String(await calls(p)));
  await wait(p, 300);
  await p.screenshot({ path: 'shots/live-ride-reroute.png' });

  // Start the journey: route to drop-off.
  await p.evaluate(() => window.__setLeg('dropoff')); await wait(p, 600);
  check('starting the journey routes to the drop-off', await calls(p) === 3 && /Arriving in \d+ min/.test(await panel(p)), `${await calls(p)} ${await panel(p)}`);
  check('drop-off label shown, pickup label gone', await p.locator('[data-ltm-label="Drop-off"]').count() === 1 && await p.locator('[data-ltm-label="Pickup spot"]').count() === 0);
  await p.screenshot({ path: 'shots/live-ride-dropoff.png' });
  check('no page errors (ride)', !p.errs.length, p.errs.join('|'));
  await p.close();

  // ── Before a driver: whole trip preview ──
  p = await open('preview');
  check('preview: pickup → drop-off drawn with both pins', await calls(p) === 1 && await p.locator('[data-ltm-label]').count() === 2);
  check('preview: Finding your driver panel', (await panel(p)).includes('Finding your driver'));
  await p.screenshot({ path: 'shots/live-preview.png' });
  await p.close();

  // ── VilleDash: motorcycle ──
  p = await open('dash');
  const moto = await car(p, 'Rider');
  check('VilleDash shows the motorcycle', !!moto && decodeURIComponent(moto.src).includes('translate(12 1)'));
  check('VilleDash panel: Rider at pickup in X min', /Rider at pickup in \d+ min/.test(await panel(p)), await panel(p));
  check('store name as the pickup label', await p.locator('[data-ltm-label="Juici Patties"]').count() === 1);
  await p.screenshot({ path: 'shots/live-dash.png' });
  await p.evaluate(() => window.__setStatus('to_dropoff')); await wait(p, 600);
  check('VilleDash after collection: Arriving in X min', /Arriving in \d+ min/.test(await panel(p)), await panel(p));
  check('no page errors (dash)', !p.errs.length, p.errs.join('|'));
  await p.close();

  await b.close();
  console.log(out.join('\n'));
  console.log(`\n${out.filter((x) => x.startsWith('PASS')).length}/${out.length} passed`);
  process.exit(out.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
