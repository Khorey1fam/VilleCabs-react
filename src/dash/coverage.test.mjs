// Run: node --test src/dash/coverage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { demandGrid, ridersNeeded, shiftHoursOn, coverageFor, gaps, shiftWeekForward } from './coverage.js';

const jm = (iso) => Date.parse(`${iso}-05:00`);

test('demand grid counts booked and unserved per Jamaica weekday/hour, averaged over weeks', () => {
  const ev = [
    { kind: 'booked', at: jm('2026-10-16T12:10:00') },    // Friday 12h
    { kind: 'unserved', at: jm('2026-10-16T12:50:00') },
    { kind: 'booked', at: jm('2026-10-09T12:30:00') },    // previous Friday 12h
    { kind: 'quote', at: jm('2026-10-16T12:20:00') },     // ignored
    { kind: 'booked', at: { toMillis: () => jm('2026-10-17T00:30:00') } }, // Saturday 0h
  ];
  const g = demandGrid(ev, 2);
  assert.equal(g[5][12], 1.5);
  assert.equal(g[6][0], 0.5);
  assert.equal(g[5][11], 0);
});

test('riders needed rounds up and is zero with no demand', () => {
  assert.equal(ridersNeeded(0), 0);
  assert.equal(ridersNeeded(0.4, 2), 1);
  assert.equal(ridersNeeded(4.1, 2), 3);
});

test('shift hours include the tail of a late shift on the next day', () => {
  assert.deepEqual(shiftHoursOn({ date: '2026-10-16', start: '07:00', end: '12:00' }, '2026-10-16'), [7, 8, 9, 10, 11]);
  assert.deepEqual(shiftHoursOn({ date: '2026-10-16', start: '22:00', end: '02:00' }, '2026-10-16'), [22, 23]);
  assert.deepEqual(shiftHoursOn({ date: '2026-10-16', start: '22:00', end: '02:00' }, '2026-10-17'), [0, 1]);
  assert.deepEqual(shiftHoursOn({ date: '2026-10-16', start: '07:30', end: '08:15' }, '2026-10-16'), [7, 8]);
});

test('coverage ignores declined/cancelled and finds gaps against demand', () => {
  const day = '2026-10-16';
  const shifts = [
    { date: day, start: '10:00', end: '14:00', status: 'confirmed' },
    { date: day, start: '12:00', end: '16:00', status: 'scheduled' },
    { date: day, start: '12:00', end: '16:00', status: 'declined' },
    { date: day, start: '12:00', end: '13:00', status: 'scheduled', isBackup: true },
  ];
  const c = coverageFor(shifts, day);
  assert.deepEqual(c[12], { planned: 2, confirmed: 1, backup: 1 });
  assert.deepEqual(c[9], { planned: 0, confirmed: 0, backup: 0 });
  const demand = Array(24).fill(0); demand[12] = 5; demand[9] = 1;
  assert.deepEqual(gaps(c, demand, 2), [{ hour: 9, need: 1, have: 0 }, { hour: 12, need: 3, have: 2 }]);
});

test('copying a week moves dates by 7 days and resets status', () => {
  const out = shiftWeekForward([
    { date: '2026-10-12', start: '07:00', end: '12:00', riderId: 'a', status: 'completed' },
    { date: '2026-10-13', start: '07:00', end: '12:00', riderId: 'b', status: 'declined' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].date, '2026-10-19');
  assert.equal(out[0].status, 'scheduled');
});
