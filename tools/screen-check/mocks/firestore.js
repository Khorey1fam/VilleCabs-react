// In-memory Firestore stand-in for rendering screens with sample data.
const store = (window.__store = window.__store || new Map());
const listeners = new Set();
let auto = 0;
const now = () => Date.now();
export class Timestamp {
  constructor(ms) { this._ms = ms; }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(now()); }
  toMillis() { return this._ms; }
  toDate() { return new Date(this._ms); }
  valueOf() { return this._ms; }
}
const SERVER = { __server: true };
export const serverTimestamp = () => SERVER;
export const getFirestore = () => ({ __db: true });
const join = (...p) => p.filter(Boolean).join('/');
export function doc(a, ...rest) {
  if (a && a.__col) { return { __doc: true, path: join(a.path, rest[0] || `auto${++auto}`), get id() { return this.path.split('/').pop(); } }; }
  const path = join(...rest);
  return { __doc: true, path, id: path.split('/').pop() };
}
export function collection(a, ...rest) { const base = a && a.__doc ? a.path : ''; return { __col: true, path: join(base, ...rest), filters: [], orders: [], lim: null }; }
export const where = (f, op, v) => ({ t: 'w', f, op, v });
export const orderBy = (f, dir = 'asc') => ({ t: 'o', f, dir });
export const limit = (n) => ({ t: 'l', n });
export function query(col, ...cs) {
  const q = { ...col, filters: [...col.filters], orders: [...col.orders] };
  cs.forEach((c) => { if (c.t === 'w') q.filters.push(c); if (c.t === 'o') q.orders.push(c); if (c.t === 'l') q.lim = c.n; });
  return q;
}
const get = (o, f) => f.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const val = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
function resolve(v) {
  if (v === SERVER) return new Timestamp(now());
  if (v && v.__inc !== undefined) return v;
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object' && !(v instanceof Timestamp)) { const o = {}; Object.entries(v).forEach(([k, x]) => { o[k] = resolve(x); }); return o; }
  return v;
}
const snapOf = (path) => {
  const data = store.get(path);
  return { id: path.split('/').pop(), ref: { path }, exists: () => data !== undefined, data: () => data, get: (f) => get(data, f) };
};
function runQuery(q) {
  const depth = q.path.split('/').length + 1;
  let rows = [...store.keys()].filter((k) => k.startsWith(`${q.path}/`) && k.split('/').length === depth).map(snapOf);
  rows = rows.filter((s) => q.filters.every(({ f, op, v }) => {
    const x = val(get(s.data(), f)); const y = val(v);
    if (op === '==') return x === y; if (op === 'in') return y.includes(x); if (op === '>=') return x >= y;
    if (op === '<=') return x <= y; if (op === '<') return x < y; if (op === '>') return x > y; if (op === 'array-contains') return (x || []).includes(y);
    return true;
  }));
  q.orders.forEach(({ f, dir }) => rows.sort((a, b) => { const x = val(get(a.data(), f)); const y = val(get(b.data(), f)); return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); }));
  if (q.lim) rows = rows.slice(0, q.lim);
  return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: (fn) => rows.forEach(fn) };
}
const emit = () => listeners.forEach((l) => l());
export function onSnapshot(ref, next, err) {
  const fire = () => { try { next(ref.__doc ? snapOf(ref.path) : runQuery(ref)); } catch (e) { console.error('snapshot handler error', e); } };
  const l = () => fire();
  listeners.add(l);
  setTimeout(fire, 0);
  return () => listeners.delete(l);
}
export async function getDoc(ref) { return snapOf(ref.path); }
export async function getDocs(q) { return runQuery(q); }
export async function setDoc(ref, data, opt) { store.set(ref.path, opt && opt.merge ? { ...(store.get(ref.path) || {}), ...resolve(data) } : resolve(data)); window.__writes.push(['set', ref.path, data]); emit(); }
export async function addDoc(col, data) { const r = doc(col); await setDoc(r, data); return r; }
export async function updateDoc(ref, patch) {
  if (!store.has(ref.path)) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  const d = JSON.parse(JSON.stringify(store.get(ref.path)));
  const cur = store.get(ref.path);
  Object.entries(patch).forEach(([k, v]) => { const parts = k.split('.'); let o = d; parts.slice(0, -1).forEach((p) => { o[p] = o[p] || {}; o = o[p]; }); o[parts.at(-1)] = resolve(v); });
  Object.keys(cur).forEach((k) => { if (cur[k] instanceof Timestamp && !(k in patch)) d[k] = cur[k]; });
  store.set(ref.path, d); window.__writes.push(['update', ref.path, patch]); emit();
}
export async function deleteDoc(ref) { store.delete(ref.path); window.__writes.push(['delete', ref.path]); emit(); }
export function writeBatch() { const ops = []; return { set: (r, d) => ops.push(() => setDoc(r, d)), commit: async () => { for (const o of ops) await o(); } }; }
export const arrayUnion = (...a) => a;
export const arrayRemove = () => [];
export const increment = (n) => n;
window.__writes = window.__writes || [];
