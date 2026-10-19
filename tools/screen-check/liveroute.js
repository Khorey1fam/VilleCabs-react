// Unit tests for src/liveRoute.js (route geometry behind the live trip map).
// Run: node tools/screen-check/liveroute.js
const path = require('path');
const esbuild = require('esbuild');
const out = path.join(__dirname, 'out', 'liveroute.spec.cjs');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'liveroute.spec.js')], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error' });
let pass = 0, fail = 0;
const expect = (v) => ({
  toBe: (x) => { if (v !== x) throw new Error(`expected ${x}, got ${v}`); },
  toBeNull: () => { if (v !== null) throw new Error(`expected null, got ${v}`); },
  toBeLessThan: (x) => { if (!(v < x)) throw new Error(`expected < ${x}, got ${v}`); },
  toBeGreaterThan: (x) => { if (!(v > x)) throw new Error(`expected > ${x}, got ${v}`); },
});
global.expect = expect;
global.test = (name, fn) => {
  try { fn(); pass += 1; console.log('  ok  ', name); } catch (e) { fail += 1; console.log('  FAIL', name, '—', e.message); }
};
require(out);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
