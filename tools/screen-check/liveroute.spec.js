import {
  buildTrack, locate, pointAt, remainingPath, steadyProgress, makeDeviation, liveEta, fmtDistance, isTeleport, haversine,
} from '../../src/liveRoute';

// An L-shaped road in Mandeville: ~1 km east, then ~1 km north.
const A = { lat: 18.040, lng: -77.510 };
const B = { lat: 18.040, lng: -77.50055 };
const C = { lat: 18.049, lng: -77.50055 };
const path = [A, { lat: 18.040, lng: -77.505 }, B, { lat: 18.0445, lng: -77.50055 }, C];

test('track measures the road', () => {
  const t = buildTrack(path);
  expect(t.total).toBeGreaterThan(1900);
  expect(t.total).toBeLessThan(2100);
  expect(buildTrack([A])).toBeNull();
});

test('a GPS point near the road snaps onto it', () => {
  const t = buildTrack(path);
  const at = locate(t, { lat: 18.0402, lng: -77.507 });   // ~22 m north of the first leg
  expect(at.off).toBeLessThan(30);
  expect(Math.abs(at.lat - 18.040)).toBeLessThan(1e-6);
  expect(at.s).toBeGreaterThan(250);
});

test('gliding follows the corner instead of cutting it', () => {
  const t = buildTrack(path);
  const sB = locate(t, B).s;
  const mid = pointAt(t, sB);                                 // the corner itself
  expect(haversine(mid, B)).toBeLessThan(2);
  const before = pointAt(t, sB - 100), after = pointAt(t, sB + 100);
  expect(Math.abs(before.lat - 18.040)).toBeLessThan(1e-6);   // still on the east-west road
  expect(Math.abs(after.lng - -77.50055)).toBeLessThan(1e-6); // already on the north road
});

test('only the road ahead is drawn', () => {
  const t = buildTrack(path);
  const rest = remainingPath(t, 1500);
  expect(rest.length).toBeLessThan(path.length);
  expect(haversine(rest[rest.length - 1], C)).toBeLessThan(1);
});

test('small backward jitter is ignored, the car only moves forward', () => {
  expect(steadyProgress(500, 480)).toBe(500);
  expect(steadyProgress(500, 520)).toBe(520);
  expect(steadyProgress(500, 300)).toBe(300);   // a real turnaround is let through
});

test('one stray fix never re-routes; a few seconds off the road does', () => {
  const d = makeDeviation();
  expect(d.update(120, 0)).toBe(false);
  expect(d.update(20, 1000)).toBe(false);        // back on the road: reset
  expect(d.update(120, 2000)).toBe(false);
  expect(d.update(130, 3000)).toBe(false);       // 2 fixes but only 1 s apart
  expect(d.update(140, 6500)).toBe(true);        // still off after 4.5 s
});

test('ETA shrinks as the car advances, without asking Google', () => {
  const t = buildTrack(path);
  const start = liveEta(t, 0, 300, 2000);
  const half = liveEta(t, t.total / 2, 300, 2000);
  expect(start.minutes).toBe(5);
  expect(half.minutes).toBe(3);
  expect(liveEta(t, t.total, 300, 2000).minutes).toBe(1);
  expect(fmtDistance(1234)).toBe('1.2 km');
  expect(fmtDistance(420)).toBe('400 m');
});

test('GPS teleports are rejected', () => {
  expect(isTeleport(A, C, 1000)).toBe(true);
  expect(isTeleport(A, { lat: 18.0401, lng: -77.51 }, 1000)).toBe(false);
});
