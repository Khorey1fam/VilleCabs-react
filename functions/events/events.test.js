// VilleEvents reminder engine: logic + end-to-end against an in-memory Firestore.
// Run: cd functions && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic');

// ── Minimal in-memory Firestore ──────────────────────────────────────────────
const store = new Map();
let clock = Date.UTC(2026, 10, 1, 12); // 1 Nov 2026 07:00 Jamaica
const TS = (ms) => ({ __ms: ms, toMillis() { return this.__ms; } });
const isTs = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function';
let auto = 0;
const pushes = [];
let pushFail = null;

function resolve(v, prev) {
  if (v && v.__server) return TS(clock);
  if (v && v.__inc !== undefined) return (prev || 0) + v.__inc;
  if (v && v.__del) return undefined;
  if (v && typeof v === 'object' && !Array.isArray(v) && !isTs(v)) { const o = {}; for (const [k, x] of Object.entries(v)) { const r = resolve(x, prev && prev[k]); if (r !== undefined) o[k] = r; } return o; }
  return v;
}
const docRef = (path) => ({
  path, id: path.split('/').pop(),
  async get() { const d = store.get(path); return { exists: !!d, id: path.split('/').pop(), data: () => d && { ...d }, get: (k) => d && d[k], ref: docRef(path) }; },
  async set(v, o) { const prev = store.get(path); store.set(path, o && o.merge ? { ...(prev || {}), ...resolve(v, prev) } : resolve(v)); },
  async update(v) { const prev = store.get(path); if (!prev) throw new Error(`no doc ${path}`); const n = { ...prev }; for (const [k, x] of Object.entries(v)) { const r = resolve(x, prev[k]); if (r === undefined) delete n[k]; else n[k] = r; } store.set(path, n); },
});
const cmp = (a, b) => (isTs(a) ? a.toMillis() : a) - (isTs(b) ? b.toMillis() : b);
function query(col, filters = [], lim = Infinity) {
  return {
    where(f, op, v) { return query(col, [...filters, [f, op, v]], lim); },
    limit(n) { return query(col, filters, n); },
    async get() {
      const docs = [];
      for (const [p, d] of store) {
        if (!p.startsWith(`${col}/`) || p.slice(col.length + 1).includes('/')) continue;
        const ok = filters.every(([f, op, v]) => (op === '==' ? d[f] === v : op === '<=' ? d[f] != null && cmp(d[f], v) <= 0 : true));
        if (ok) docs.push({ id: p.split('/').pop(), data: () => ({ ...d }), get: (k) => d[k] });
      }
      const out = docs.slice(0, lim);
      return { docs: out, size: out.length, empty: !out.length };
    },
    async add(v) { const id = `auto${++auto}`; await docRef(`${col}/${id}`).set(v); return docRef(`${col}/${id}`); },
  };
}
const fakeDb = {
  doc: docRef,
  collection: (c) => query(c),
  batch() { const ops = []; return { set: (r, v) => ops.push(() => r.set(v)), update: (r, v) => ops.push(() => r.update(v)), async commit() { for (const o of ops) await o(); } }; },
  async runTransaction(fn) { const ops = []; const tx = { get: (r) => r.get(), set: (r, v) => ops.push(() => r.set(v)), update: (r, v) => ops.push(() => r.update(v)) }; const out = await fn(tx); for (const o of ops) await o(); return out; },
};
const E = require('./index');
E.internal.setDeps({
  db: () => fakeDb, now: () => clock, ts: TS, inc: (n) => ({ __inc: n }), serverTime: () => ({ __server: true }), del: () => ({ __del: true }),
  messaging: () => ({ async send(m) { if (pushFail) { const e = new Error('x'); e.code = pushFail; throw e; } pushes.push(m); return 'id'; } }),
});
const { syncSave, sweep, onEventWrite, onSaveWrite } = E.internal;

const H = 3600e3, D = 24 * H;
const START = clock + 3 * D; // event in 3 days
function seed() {
  store.clear(); pushes.length = 0; pushFail = null; clock = Date.UTC(2026, 10, 1, 12);
  store.set('ville_events/ev1', { title: 'Mandeville Jazz Night', status: 'published', startAt: TS(START), timeKnown: true });
  store.set('customers/u1', { name: 'Keneile', fcmToken: 'tok1' });
  store.set('customers/u2', { name: 'Ann' });
}
const jobs = () => [...store].filter(([p]) => p.startsWith('event_reminders/')).map(([p, d]) => ({ id: p.split('/')[1], ...d }));
const inbox = (uid) => [...store].filter(([p, d]) => p.startsWith('customer_notifications/') && d.uid === uid).map(([, d]) => d);
async function save(uid, reminders, extra = {}) {
  const id = `${uid}_ev1`; const before = store.get(`event_saves/${id}`) || null;
  const after = { uid, eventId: 'ev1', reminders, remindersOn: true, ...extra };
  store.set(`event_saves/${id}`, after);
  await onSaveWrite(id, before, after);
}

// ── Logic ────────────────────────────────────────────────────────────────────
test('Jamaica time: 9pm local is 02:00 UTC next day', () => {
  assert.equal(new Date(L.jamaicaMs(2026, 11, 20, 21, 0)).toISOString(), '2026-11-21T02:00:00.000Z');
  assert.deepEqual(L.parseClock('9:30 PM - 2 AM'), { h: 21, mi: 30 });
  assert.deepEqual(L.parseClock('Starts 20:00'), { h: 20, mi: 0 });
  assert.equal(L.parseClock('all day'), null);
});
test('legacy flyer without a time only allows day-level reminders', () => {
  const r = L.parseLegacyStart('2026-12-24', 'TBA');
  assert.equal(r.timeKnown, false);
  assert.deepEqual(L.cleanReminders(['1w', '1d', '3h', '1h'], null, false).reminders, ['1w', '1d']);
});
test('custom reminder must be 15 minutes to 14 days', () => {
  assert.deepEqual(L.cleanReminders(['custom'], 5, true).reminders, []);
  assert.deepEqual(L.cleanReminders(['custom'], 90, true), { reminders: ['custom'], customMinutes: 90 });
});
test('reminder text uses the event name and never promises a driver', () => {
  const m = L.reminderMessage('3h', 'Jazz Night', START, true);
  assert.match(m.title, /Jazz Night/);
  assert.doesNotMatch(`${m.title} ${m.body}`, /driver (is|will be) available|guarantee/i);
});

// ── Engine ───────────────────────────────────────────────────────────────────
test('saving with reminders creates one job per reminder; past ones are skipped', async () => {
  seed();
  await save('u1', ['1w', '1d', '3h', '1h']);       // 1w is already past (event in 3 days)
  assert.deepEqual(jobs().map((j) => j.key).sort(), ['1d', '1h', '3h']);
  assert.ok(jobs().every((j) => j.status === 'pending'));
  assert.equal(store.get('ville_event_stats/ev1').saves, 1);
  assert.equal(store.get('ville_event_stats/ev1').reminderOptIns, 1);
});

test('reminders send at the right time, once, with push + inbox', async () => {
  seed();
  await save('u1', ['1d', '1h']);
  clock = START - D - 60e3; assert.equal((await sweep()).sent, 0);          // not yet
  clock = START - D + 60e3; assert.equal((await sweep()).sent, 1);          // 1 day before
  assert.equal((await sweep()).sent, 0, 'no duplicate on the next sweep');
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].notification.title, /Tomorrow/);
  assert.equal(pushes[0].data.url, '/events/ev1');
  assert.equal(inbox('u1').length, 1);
  clock = START - H + 1; await sweep();
  assert.equal(inbox('u1').length, 2);
  assert.equal(store.get('ville_event_stats/ev1').remindersSent, 2);
});

test('a reminder still lands in the inbox when there is no push token (push denied)', async () => {
  seed();
  store.set('event_saves/u2_ev1', { uid: 'u2', eventId: 'ev1', reminders: ['3h'], remindersOn: true });
  await onSaveWrite('u2_ev1', null, store.get('event_saves/u2_ev1'));
  clock = START - 3 * H + 1; await sweep();
  assert.equal(inbox('u2').length, 1);
  assert.equal(jobs().find((j) => j.uid === 'u2').pushStatus, 'no_token');
});

test('expired push token is removed and the inbox item is kept', async () => {
  seed(); pushFail = 'messaging/registration-token-not-registered';
  await save('u1', ['1h']);
  clock = START - H + 1; await sweep();
  assert.equal(inbox('u1').length, 1);
  assert.equal(store.get('customers/u1').fcmToken, undefined);
  assert.equal(jobs()[0].pushStatus, 'token_expired');
});

test('removing a save or turning reminders off cancels pending jobs', async () => {
  seed();
  await save('u1', ['1d', '3h']);
  const before = store.get('event_saves/u1_ev1');
  const off = { ...before, remindersOn: false };
  store.set('event_saves/u1_ev1', off); await onSaveWrite('u1_ev1', before, off);
  assert.ok(jobs().every((j) => j.status === 'cancelled'));
  await save('u1', ['1d']);                                                  // back on
  assert.equal(jobs().filter((j) => j.status === 'pending').length, 1);
  store.delete('event_saves/u1_ev1'); await onSaveWrite('u1_ev1', store.get('x') || { uid: 'u1', eventId: 'ev1', reminders: ['1d'] }, null);
  assert.ok(jobs().every((j) => j.status !== 'pending'));
  clock = START; await sweep();
  assert.equal(pushes.length, 0, 'nothing sent after removal');
});

test('changing reminder choices moves jobs without duplicates', async () => {
  seed();
  await save('u1', ['1d']);
  await save('u1', ['1d', '1h']);
  await save('u1', ['1d', '1h']);
  assert.equal(jobs().filter((j) => j.status === 'pending').length, 2);
});

test('postponement moves reminders and tells savers; old time never fires', async () => {
  seed();
  await save('u1', ['1h']);
  const before = store.get('ville_events/ev1');
  const after = { ...before, startAt: TS(START + 2 * D) };
  store.set('ville_events/ev1', after);
  const r = await onEventWrite('ev1', before, after);
  assert.equal(r.notified, 1);
  assert.match(inbox('u1')[0].title, /Time change/);
  clock = START - H + 1; await sweep();
  assert.equal(inbox('u1').length, 1, 'no reminder at the old time');
  clock = START + 2 * D - H + 1; await sweep();
  assert.equal(inbox('u1').length, 2);
  assert.ok(store.get('ville_events/ev1/audit/' + [...store.keys()].find((k) => k.startsWith('ville_events/ev1/audit/')).split('/').pop()).fields.includes('startAt'));
});

test('cancellation cancels reminders and sends one cancellation notice', async () => {
  seed();
  await save('u1', ['1d', '1h']);
  const before = store.get('ville_events/ev1');
  const after = { ...before, status: 'cancelled' };
  store.set('ville_events/ev1', after);
  await onEventWrite('ev1', before, after);
  await onEventWrite('ev1', before, after);                                  // trigger retried
  assert.equal(inbox('u1').filter((n) => /Cancelled/.test(n.title)).length, 1);
  assert.ok(jobs().every((j) => j.status === 'cancelled'));
  clock = START; await sweep();
  assert.equal(inbox('u1').length, 1, 'no "event is coming up" after cancelling');
});

test('a job still pending when the event was cancelled behind its back is not sent', async () => {
  seed();
  await save('u1', ['1h']);
  store.set('ville_events/ev1', { ...store.get('ville_events/ev1'), status: 'cancelled' }); // no trigger ran
  clock = START - H + 1; const r = await sweep();
  assert.equal(r.cancelled, 1); assert.equal(pushes.length, 0);
});

test('legacy partner flyer events work as ids pr_<id>', async () => {
  seed();
  store.set('partnerRequests/abc', { bizType: 'Events', bizName: 'Fish Fry', status: 'approved', slot: 's3', eventDate: '2026-11-04', eventTime: '7pm', uploads: ['https://x/flyer.jpg'] });
  const ev = await E.internal.getEvent('pr_abc');
  assert.equal(ev.title, 'Fish Fry'); assert.equal(ev.status, 'published'); assert.equal(ev.timeKnown, true);
  store.set('event_saves/u1_pr_abc', { uid: 'u1', eventId: 'pr_abc', reminders: ['3h'], remindersOn: true });
  await syncSave('u1_pr_abc', store.get('event_saves/u1_pr_abc'));
  assert.equal(jobs().filter((j) => j.eventId === 'pr_abc').length, 1);
});
