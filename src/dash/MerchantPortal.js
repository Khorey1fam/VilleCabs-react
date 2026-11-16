// VilleDash Merchant portal — served at /merchant.
import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, addDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import {
  api, dashAuth, dashDb, errText, formatJMD, MERCHANT_CATEGORIES, ORDER_LABEL, DAYS, isOpenAt,
  uploadMerchantImage, centsFromJ,
} from './dashApi';
import { C, st, Header, Pill, Spinner } from './ui';
import { AddressAutocompleteInput, VilleMap, geocodeLatLng } from '../App';

const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };
const small = { padding: '7px 12px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer', fontWeight: 700 };
const ts = (t) => (t?.toDate ? t.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

function SignIn() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try {
      if (mode === 'in') await signInWithEmailAndPassword(dashAuth(), email.trim(), pw);
      else await createUserWithEmailAndPassword(dashAuth(), email.trim(), pw);
    } catch (e) {
      const c = e.code || '';
      setErr(c.includes('email-already') ? 'That email already has an account — sign in instead.'
        : c.includes('weak-password') ? 'Use at least 6 characters.'
        : c.includes('invalid') || c.includes('wrong') || c.includes('not-found') ? 'Incorrect email or password.' : 'Could not sign in. Try again.');
    }
    setBusy(false);
  };
  return (
    <div style={st.page}><Header title="VilleDash for Business" />
      <div style={st.wrap}><div style={st.card}>
        <div style={st.h1}>{mode === 'in' ? 'Store sign in' : 'Create a store login'}</div>
        <div style={st.sub}>Sell to Mandeville customers through VilleDash. Riders collect and deliver your orders.</div>
        <label style={st.label}>Email</label><input style={st.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label style={st.label}>Password</label><input style={st.input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        {err && <div style={st.err}>{err}</div>}
        <button style={{ ...st.btn, marginTop: 12 }} disabled={busy} onClick={go}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create login'}</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
          <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 600, cursor: 'pointer' }}>{mode === 'in' ? 'New store? Create a login' : 'Have a login? Sign in'}</button>
          {mode === 'in' && <button onClick={() => email && sendPasswordResetEmail(dashAuth(), email.trim()).then(() => setErr('Password reset email sent.')).catch(() => setErr('Could not send reset email.'))} style={{ background: 'none', border: 'none', color: C.quiet, cursor: 'pointer' }}>Forgot password?</button>}
        </div>
      </div></div>
    </div>
  );
}

const SignOutBtn = () => <button onClick={() => signOut(dashAuth())} style={{ ...st.btnGhost, width: 'auto', padding: '6px 10px', fontSize: 12 }}>Sign out</button>;

// ── Store profile form (used for registration and editing) ──────────────────
const DEFAULT_HOURS = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, { open: '09:00', close: '18:00' }]));
function StoreForm({ uid, initial, onSaved, registering }) {
  const [f, setF] = useState(() => ({
    name: '', category: '', description: '', phone: '', address: '', representative: '', registrationNo: '',
    pickupInstructions: '', prepMinutesTypical: 20, hours: DEFAULT_HOURS, location: null, logoUrl: '', coverUrl: '', ...initial,
  }));
  const [agree, setAgree] = useState(!registering);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setDay = (d, patch) => {
    const h = { ...(f.hours || {}) };
    if (patch === null) delete h[d]; else h[d] = { ...(h[d] || { open: '09:00', close: '18:00' }), ...patch };
    setF({ ...f, hours: h });
  };
  const pin = async (lat, lng) => {
    setF((x) => ({ ...x, location: { lat, lng } }));
    try { const a = await geocodeLatLng(lat, lng); if (a) setF((x) => ({ ...x, address: x.address || a })); } catch (e) { /* keep */ }
  };
  const upload = async (key, file) => {
    setMsg('');
    try { const url = await uploadMerchantImage(uid, file, key); setF((x) => ({ ...x, [key]: url })); } catch (e) { setMsg(e.message || 'Upload failed — check the Storage rule.'); }
  };
  const ok = f.name.trim().length > 1 && f.category && f.phone.trim() && f.address.trim() && f.location && f.representative.trim() && agree;
  const save = async () => {
    setBusy(true); setMsg('');
    const data = {
      name: f.name.trim().slice(0, 80), category: f.category, description: f.description.trim().slice(0, 400),
      phone: f.phone.trim().slice(0, 20), address: f.address.trim().slice(0, 200), location: f.location,
      representative: f.representative.trim().slice(0, 80), registrationNo: f.registrationNo.trim().slice(0, 40),
      pickupInstructions: f.pickupInstructions.trim().slice(0, 300), prepMinutesTypical: Number(f.prepMinutesTypical) || 20,
      hours: f.hours || {}, logoUrl: f.logoUrl || null, coverUrl: f.coverUrl || null, updatedAt: serverTimestamp(),
    };
    try {
      if (registering) await setDoc(doc(dashDb(), 'merchants', uid), { ...data, status: 'pending', isAcceptingOrders: false, createdAt: serverTimestamp() });
      else await updateDoc(doc(dashDb(), 'merchants', uid), data);
      setMsg('Saved.'); if (onSaved) onSaved();
    } catch (e) { setMsg('Could not save. Check your connection and try again.'); }
    setBusy(false);
  };
  return (
    <div style={st.card}>
      <label style={st.label}>Business or trading name</label><input style={st.input} value={f.name} onChange={set('name')} />
      <label style={st.label}>Category</label>
      <select style={st.input} value={f.category} onChange={set('category')}>
        <option value="">Choose…</option>{MERCHANT_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <div style={{ fontSize: 12, color: C.quiet, marginTop: 4 }}>Pharmacies and other regulated businesses can't join yet.</div>
      <label style={st.label}>Description</label><textarea style={{ ...st.input, minHeight: 60 }} value={f.description} maxLength={400} onChange={set('description')} />
      <label style={st.label}>Store phone (shown to customers and riders)</label><input style={st.input} type="tel" value={f.phone} onChange={set('phone')} />
      <label style={st.label}>Authorised representative</label><input style={st.input} value={f.representative} onChange={set('representative')} />
      <label style={st.label}>Business registration or TRN (optional)</label><input style={st.input} value={f.registrationNo} onChange={set('registrationNo')} />
      <label style={st.label}>Pickup address</label>
      <AddressAutocompleteInput value={f.address} onChange={(t) => setF((x) => ({ ...x, address: t }))}
        onPlaceSelect={(p) => setF((x) => ({ ...x, address: p.formattedAddress || p.name, location: { lat: p.lat, lng: p.lng } }))} placeholder="Where riders collect orders" />
      <div style={{ borderRadius: 12, overflow: 'hidden', marginTop: 8, border: `1px solid ${C.line}` }}>
        <VilleMap height={200} center={f.location || MANDEVILLE} zoom={f.location ? 17 : 13} markers={f.location ? [{ position: f.location, title: 'Pickup' }] : []} onClick={(e) => pin(e.latLng.lat(), e.latLng.lng())} />
      </div>
      <div style={{ fontSize: 12, color: C.quiet, marginTop: 4 }}>{f.location ? 'Pin set — tap to adjust.' : 'Tap the map to place your pickup pin.'}</div>
      <label style={st.label}>Pickup instructions for riders</label><input style={st.input} value={f.pickupInstructions} onChange={set('pickupInstructions')} placeholder="e.g. Collect at the side window" />
      <label style={st.label}>Usual prep time (minutes)</label><input style={st.input} type="number" min="1" max="120" value={f.prepMinutesTypical} onChange={set('prepMinutesTypical')} />
      <label style={st.label}>Opening hours (Jamaica time)</label>
      <div style={{ fontSize: 12, color: C.quiet, marginBottom: 6 }}>Open all day? Set both times to 12:00 AM. Closing after midnight is fine (e.g. 6 PM – 2 AM).</div>
      {DAYS.map((d, i) => {
        const h = f.hours?.[i];
        return (
          <div key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ width: 36, fontSize: 13, fontWeight: 600 }}>{d}</div>
            <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center', width: 70 }}>
              <input type="checkbox" checked={!!h} onChange={(e) => setDay(i, e.target.checked ? {} : null)} /> Open
            </label>
            {h && <>
              <input type="time" value={h.open} onChange={(e) => setDay(i, { open: e.target.value })} style={{ ...st.input, width: 112, padding: '6px 6px' }} />
              <span>–</span>
              <input type="time" value={h.close} onChange={(e) => setDay(i, { close: e.target.value })} style={{ ...st.input, width: 112, padding: '6px 6px' }} />
            </>}
          </div>
        );
      })}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
        {[['logoUrl', 'Logo'], ['coverUrl', 'Cover image']].map(([k, l]) => (
          <label key={k} style={{ ...st.btnGhost, textAlign: 'center', display: 'block' }}>
            {f[k] ? `✓ ${l} uploaded — replace` : `Upload ${l.toLowerCase()}`}
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => upload(k, e.target.files[0])} />
          </label>
        ))}
      </div>
      {registering && (
        <>
          <div style={st.note}>VilleDash keeps 15% commission on product sales and pays you the rest every 2 weeks. Customers pay the rider in cash; VilleDash settles with you. We'll contact you for your business documents and settlement details before approval — don't enter bank details here.</div>
          <label style={{ display: 'flex', gap: 8, fontSize: 13.5, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I'm authorised to register this business and accept the 15% commission and two-week settlement terms.</span>
          </label>
        </>
      )}
      {msg && <div style={st.note}>{msg}</div>}
      <button style={{ ...st.btn, marginTop: 12, opacity: ok && !busy ? 1 : 0.5 }} disabled={!ok || busy} onClick={save}>{registering ? 'Send for approval' : 'Save store details'}</button>
      {registering && <div style={{ ...st.sub, textAlign: 'center', marginTop: 8 }}>Next: add your menu and prices.</div>}
    </div>
  );
}

// ── Orders ───────────────────────────────────────────────────────────────────
function OrderCard({ o, store }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [prep, setPrep] = useState(store.prepMinutesTypical || 20);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const act = async (action, extra = {}) => {
    setBusy(true); setMsg('');
    try { await api.merchantUpdate({ orderId: o.id, action, ...extra }); setRejecting(false); } catch (e) { setMsg(errText(e)); }
    setBusy(false);
  };
  const label = o.status === 'awaiting_merchant' ? 'New order' : ORDER_LABEL[o.status];
  const tone = o.status === 'awaiting_merchant' ? 'amber' : ['rejected', 'cancelled', 'failed'].includes(o.status) ? 'red' : o.status === 'delivered' ? 'green' : 'purple';
  return (
    <div style={{ ...st.card, border: o.status === 'awaiting_merchant' ? `2px solid ${C.amber}` : st.card.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div><b>#{o.id.slice(-6)}</b> <span style={{ color: C.quiet, fontSize: 12.5 }}>{ts(o.createdAt)} · {o.customerName}</span></div>
        <Pill tone={tone}>{label}</Pill>
      </div>
      <div style={{ margin: '8px 0' }}>
        {o.items.map((i, n) => (
          <div key={n} style={{ fontSize: 14, padding: '3px 0' }}>
            <b>{i.qty} ×</b> {i.name}{i.options?.length ? <span style={{ color: C.quiet }}> — {i.options.map((x) => x.label).join(', ')}</span> : null}
            {i.note && <div style={{ fontSize: 12.5, color: C.amber }}>Note: {i.note}</div>}
          </div>
        ))}
        {o.note && <div style={{ fontSize: 12.5, color: C.amber, marginTop: 4 }}>Order note: {o.note}</div>}
      </div>
      <div style={{ fontSize: 13, color: C.quiet }}>Items {formatJMD(o.subtotalCents)} · you receive {formatJMD(o.merchantPayableCents)} after {o.commissionPct}% commission · {o.payment && o.payment.method === 'card' ? 'paid by card' : 'customer pays the rider cash'}</div>
      {msg && <div style={st.err}>{msg}</div>}
      {o.status === 'awaiting_merchant' && !rejecting && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Ready in</span>
          <input type="number" min="1" max="120" value={prep} onChange={(e) => setPrep(e.target.value)} style={{ ...st.input, width: 70, padding: '6px 8px' }} />
          <span style={{ fontSize: 13 }}>min</span>
          <button disabled={busy} onClick={() => act('accepted', { prepMinutes: Number(prep) })} style={{ ...small, background: C.green, color: C.white, border: 'none' }}>Accept</button>
          <button disabled={busy} onClick={() => setRejecting(true)} style={{ ...small, background: '#fff5f5', color: C.red, border: '1px solid #fecaca' }}>Reject</button>
        </div>
      )}
      {rejecting && (
        <div style={{ marginTop: 10 }}>
          <input style={st.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Sold out of jerk chicken" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button disabled={busy || !reason.trim()} onClick={() => act('rejected', { reason })} style={{ ...small, background: C.red, color: C.white, border: 'none' }}>Reject order</button>
            <button onClick={() => setRejecting(false)} style={{ ...small, background: '#f3f4f6', border: 'none' }}>Back</button>
          </div>
        </div>
      )}
      {o.status === 'accepted' && <button disabled={busy} onClick={() => act('preparing')} style={{ ...small, marginTop: 10, background: C.purpleSoft, color: C.purple, border: `1px solid ${C.purpleLine}` }}>Start preparing</button>}
      {['accepted', 'preparing'].includes(o.status) && <button disabled={busy} onClick={() => act('ready')} style={{ ...small, marginTop: 10, marginLeft: 8, background: C.purple, color: C.white, border: 'none' }}>Mark ready for pickup</button>}
      {o.status === 'ready' && <div style={{ ...st.note, marginTop: 10 }}>Ready — hand it to the VilleDash rider. Ask for their name and plate.</div>}
      {o.status === 'rejected' && o.rejectReason && <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 6 }}>Reason: {o.rejectReason}</div>}
    </div>
  );
}
function Orders({ uid, store }) {
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState('new');
  useEffect(() => onSnapshot(query(collection(dashDb(), 'dash_orders'), where('merchantId', '==', uid), orderBy('createdAt', 'desc'), limit(150)),
    (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setOrders([])), [uid]);
  if (!orders) return <Spinner />;
  const groups = {
    new: orders.filter((o) => o.status === 'awaiting_merchant'),
    active: orders.filter((o) => ['accepted', 'preparing', 'ready', 'collected'].includes(o.status)),
    // Unpaid card orders that expired never reached the store, so they're not shown.
    done: orders.filter((o) => ['delivered', 'rejected', 'cancelled', 'failed'].includes(o.status) && !(o.payment && o.payment.status === 'expired')),
  };
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['new', `New (${groups.new.length})`], ['active', `In progress (${groups.active.length})`], ['done', 'Completed']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...small, borderRadius: 20, background: tab === k ? C.purple : '#f3f4f6', color: tab === k ? C.white : '#555', border: 'none' }}>{l}</button>
        ))}
      </div>
      {groups[tab].length === 0 ? <div style={{ ...st.card, ...st.sub }}>No orders here.</div> : groups[tab].map((o) => <OrderCard key={o.id} o={o} store={store} />)}
    </>
  );
}

// ── Menu (products) ──────────────────────────────────────────────────────────
// Stored shape (unchanged): options: [{ name, required, maxSelect, choices: [{ label, priceCents }] }]
const jText = (cents) => { const n = (Number(cents) || 0) / 100; return n ? String(n) : ''; };
const toEditable = (opts) => (opts || []).map((g) => ({
  name: g.name || '', required: !!g.required, maxSelect: String(g.maxSelect || 1),
  choices: (g.choices || []).map((c) => ({ label: c.label || '', price: jText(c.priceCents) })),
}));
export function fromEditable(groups) {
  const out = [];
  for (const g of groups || []) {
    const name = String(g.name || '').trim();
    const filled = (g.choices || []).filter((c) => String(c.label || '').trim() || String(c.price || '').trim());
    if (!name && !filled.length) continue; // an empty group the merchant never used
    if (!name) throw new Error('Give each option group a name, like Size or Extras.');
    const choices = filled.map((c) => {
      const label = String(c.label || '').trim();
      if (!label) throw new Error(`One choice in “${name}” has a price but no name.`);
      const priceCents = centsFromJ(c.price || '0');
      if (Number.isNaN(priceCents)) throw new Error(`Check the price for “${label}” in ${name}.`);
      return { label: label.slice(0, 40), priceCents };
    });
    if (!choices.length) throw new Error(`Add at least one choice to “${name}”.`);
    const max = Math.max(1, Math.min(choices.length, Math.floor(Number(g.maxSelect) || 1)));
    out.push({ name: name.slice(0, 40), required: !!g.required, maxSelect: max, choices });
  }
  return out;
}

function OptionsEditor({ groups, onChange }) {
  const setGroup = (i, patch) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const setChoice = (i, k, patch) => setGroup(i, { choices: groups[i].choices.map((c, j) => (j === k ? { ...c, ...patch } : c)) });
  return (
    <div>
      {groups.map((g, i) => (
        <div key={i} style={{ border: `1px solid ${C.purpleLine}`, borderRadius: 12, padding: 12, margin: '8px 0', background: '#fcfaff' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={st.label} htmlFor={`og-name-${i}`}>Option group</label>
              <input id={`og-name-${i}`} style={st.input} value={g.name} onChange={(e) => setGroup(i, { name: e.target.value })} placeholder="e.g. Size, Sides, Extras" />
            </div>
            <button type="button" onClick={() => onChange(groups.filter((_, j) => j !== i))} style={{ ...small, background: 'none', color: C.red, border: 'none', paddingBottom: 12 }}>Remove group</button>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={g.required} onChange={(e) => setGroup(i, { required: e.target.checked })} /> Customer must choose
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
              Can pick up to
              <select value={g.maxSelect} onChange={(e) => setGroup(i, { maxSelect: e.target.value })} style={{ ...st.input, width: 'auto', padding: '6px 8px' }} aria-label={`How many choices for ${g.name || 'this group'}`}>
                {Array.from({ length: Math.max(1, g.choices.length) }, (_, n) => n + 1).map((n) => <option key={n} value={String(n)}>{n}</option>)}
              </select>
            </label>
          </div>
          {g.choices.map((c, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input style={st.input} value={c.label} onChange={(e) => setChoice(i, k, { label: e.target.value })} placeholder={k === 0 ? 'e.g. Small' : 'Choice'} aria-label={`Choice ${k + 1} name`} />
              <input style={st.input} inputMode="decimal" value={c.price} onChange={(e) => setChoice(i, k, { price: e.target.value })} placeholder="+J$ 0" aria-label={`Choice ${k + 1} extra price in J$`} />
              <button type="button" onClick={() => setGroup(i, { choices: g.choices.filter((_, j) => j !== k) })} style={{ ...small, background: 'none', color: C.quiet, border: 'none' }} aria-label={`Remove choice ${k + 1}`}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setGroup(i, { choices: [...g.choices, { label: '', price: '' }] })} style={{ ...small, background: C.white, color: C.purple, border: `1px solid ${C.purpleLine}` }}>+ Add choice</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...groups, { name: '', required: false, maxSelect: '1', choices: [{ label: '', price: '' }, { label: '', price: '' }] }])}
        style={{ ...st.btnGhost, padding: 10, fontSize: 13.5 }}>+ Add options (size, sides, extras…)</button>
      <div style={{ fontSize: 11.5, color: C.quiet, marginTop: 4 }}>The extra price is added to the item price. Leave it blank if a choice costs nothing extra.</div>
    </div>
  );
}

function ProductForm({ uid, p, onDone }) {
  const [f, setF] = useState({
    name: p?.name || '', category: p?.category || '', description: p?.description || '',
    price: p ? String((p.priceCents || 0) / 100) : '', stock: p && Number.isInteger(p.stock) ? String(p.stock) : '',
    available: p ? p.available !== false : true, imageUrl: p?.imageUrl || '',
  });
  const [groups, setGroups] = useState(() => toEditable(p?.options));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setMsg('');
    const priceCents = centsFromJ(f.price);
    if (!f.name.trim()) { setMsg('Add the item name.'); return; }
    if (!f.price.trim() || Number.isNaN(priceCents)) { setMsg('Enter a price in J$.'); return; }
    const stock = f.stock.trim() === '' ? null : Number(f.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) { setMsg('Stock must be a whole number, or blank for unlimited.'); return; }
    let options;
    try { options = fromEditable(groups); } catch (e) { setMsg(e.message); return; }
    const data = {
      name: f.name.trim().slice(0, 80), category: f.category.trim().slice(0, 40) || 'Menu', description: f.description.trim().slice(0, 300),
      priceCents, stock, available: f.available, imageUrl: f.imageUrl || null, options, updatedAt: serverTimestamp(),
    };
    setBusy(true);
    try {
      if (p) await updateDoc(doc(dashDb(), 'merchants', uid, 'products', p.id), data);
      else await addDoc(collection(dashDb(), 'merchants', uid, 'products'), { ...data, createdAt: serverTimestamp() });
      onDone();
    } catch (e) { setMsg('Could not save the item.'); }
    setBusy(false);
  };
  return (
    <div style={{ ...st.card, border: `2px solid ${C.purpleLine}` }}>
      <div style={st.h2}>{p ? 'Edit item' : 'New item'}</div>
      <label style={st.label} htmlFor="pf-name">Name</label><input id="pf-name" style={st.input} value={f.name} onChange={set('name')} placeholder="e.g. Jerk chicken" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><label style={st.label} htmlFor="pf-price">Price (J$)</label><input id="pf-price" style={st.input} inputMode="decimal" value={f.price} onChange={set('price')} placeholder="e.g. 1200" /></div>
        <div><label style={st.label} htmlFor="pf-stock">Stock (blank = unlimited)</label><input id="pf-stock" style={st.input} inputMode="numeric" value={f.stock} onChange={set('stock')} /></div>
      </div>
      <label style={st.label} htmlFor="pf-cat">Menu section</label><input id="pf-cat" style={st.input} value={f.category} onChange={set('category')} placeholder="e.g. Mains, Sides, Drinks" />
      <label style={st.label} htmlFor="pf-desc">Description</label><textarea id="pf-desc" style={{ ...st.input, minHeight: 50 }} value={f.description} onChange={set('description')} placeholder="What comes with it" />
      <label style={st.label}>Options</label>
      <OptionsEditor groups={groups} onChange={setGroups} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '10px 0' }}>
        <input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Available to order
      </label>
      <label style={{ ...st.btnGhost, display: 'block', textAlign: 'center' }}>
        {f.imageUrl ? '✓ Photo uploaded — replace' : 'Upload photo'}
        <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={async (e) => {
          try { const url = await uploadMerchantImage(uid, e.target.files[0], 'product'); setF((x) => ({ ...x, imageUrl: url })); } catch (er) { setMsg(er.message || 'Upload failed.'); }
        }} />
      </label>
      {msg && <div style={st.err} role="alert">{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button style={st.btnGhost} onClick={onDone}>Cancel</button>
        <button style={st.btn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save item'}</button>
      </div>
    </div>
  );
}

// Paste a whole menu. One item per line: "Jerk chicken (Mains) - 1200 | Quarter chicken with festival".
// A line with no price ("Drinks" or "DRINKS:") starts a new section for the lines under it.
export function parseMenu(text, existing = []) {
  const have = new Set(existing.map((p) => String(p.name || '').trim().toLowerCase()));
  const items = []; const problems = []; const seen = new Set();
  let section = '';
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim().replace(/^[•*\-–]\s+/, '');
    if (!line) return;
    const [mainRaw, ...descParts] = line.split('|');
    const main = mainRaw.trim();
    const m = /^(.*?)[\s.:–—-]*(?:J?\$\s*)?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:JMD|JA?\$)?\s*$/i.exec(main);
    if (!m) {
      const head = main.replace(/[:–—-]+\s*$/, '').trim();
      if (head && head.length <= 40 && !descParts.length) { section = (head === head.toUpperCase() ? head.toLowerCase() : head).replace(/(^|\s)\w/g, (c) => c.toUpperCase()); return; }
      problems.push({ line: i + 1, text: line, why: 'No price found. End the line with the price, like “- 1200”.' });
      return;
    }
    let name = m[1].trim(); let cat = section;
    const sec = /\(([^)]{1,40})\)\s*$/.exec(name);
    if (sec) { cat = sec[1].trim(); name = name.slice(0, sec.index).trim(); }
    name = name.replace(/[\s.:–—-]+$/, '').trim();
    if (!name) { problems.push({ line: i + 1, text: line, why: 'Add the item name before the price.' }); return; }
    const priceCents = centsFromJ(m[2]);
    if (Number.isNaN(priceCents)) { problems.push({ line: i + 1, text: line, why: 'Check the price.' }); return; }
    const key = name.toLowerCase();
    const item = { name: name.slice(0, 80), category: (cat || 'Menu').slice(0, 40), priceCents, description: descParts.join('|').trim().slice(0, 300) };
    if (have.has(key)) item.skip = 'Already on your menu';
    else if (seen.has(key)) item.skip = 'Listed twice';
    seen.add(key);
    items.push(item);
  });
  return { items: items.slice(0, 150), problems, tooMany: items.length > 150 };
}

function PasteMenu({ uid, existing, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const r = useMemo(() => parseMenu(text, existing), [text, existing]);
  const toAdd = r.items.filter((x) => !x.skip);
  const add = async () => {
    if (!toAdd.length) return;
    setBusy(true); setMsg('');
    try {
      for (let i = 0; i < toAdd.length; i += 400) {
        const b = writeBatch(dashDb());
        toAdd.slice(i, i + 400).forEach((x) => b.set(doc(collection(dashDb(), 'merchants', uid, 'products')), {
          name: x.name, category: x.category, description: x.description, priceCents: x.priceCents, stock: null, available: true,
          imageUrl: null, options: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }));
        await b.commit();
      }
      onDone(toAdd.length);
    } catch (e) { setMsg('Could not add the items. Try again.'); setBusy(false); }
  };
  return (
    <div style={{ ...st.card, border: `2px solid ${C.purpleLine}` }}>
      <div style={st.h2}>Paste your menu</div>
      <div style={st.sub}>One item per line: name, then the price. Put the section in brackets, or type the section on its own line above its items. Add a description after a <b>|</b>.</div>
      <pre style={{ ...st.note, fontFamily: 'ui-monospace, monospace', fontSize: 12.5, whiteSpace: 'pre-wrap', margin: '10px 0' }}>{'Mains\nJerk chicken - 1200 | Quarter chicken with festival\nCurry goat - 1500\nDrinks\nSorrel - 300\nFried dumpling (Sides) - 150'}</pre>
      <label style={st.label} htmlFor="pm-text">Your menu</label>
      <textarea id="pm-text" style={{ ...st.input, minHeight: 150 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste your menu here" />
      {(r.items.length > 0 || r.problems.length > 0) && (
        <div style={{ marginTop: 12 }} aria-live="polite">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Check before adding · {toAdd.length} item{toAdd.length === 1 ? '' : 's'} to add</div>
          {r.items.map((x, i) => (
            <div key={i} style={{ ...st.row, borderTop: `1px solid ${C.line}`, opacity: x.skip ? 0.55 : 1 }}>
              <span style={{ minWidth: 0 }}><b>{x.name}</b> <span style={{ color: C.quiet }}>· {x.category}</span>{x.description ? <span style={{ display: 'block', fontSize: 12, color: C.quiet }}>{x.description}</span> : null}{x.skip ? <span style={{ display: 'block', fontSize: 12, color: C.amber }}>{x.skip}, won’t be added</span> : null}</span>
              <b style={{ whiteSpace: 'nowrap' }}>{formatJMD(x.priceCents)}</b>
            </div>
          ))}
          {r.problems.map((x) => (
            <div key={x.line} style={{ ...st.err, margin: '6px 0' }}>Line {x.line}: “{x.text.slice(0, 60)}” · {x.why}</div>
          ))}
          {r.tooMany && <div style={st.err}>Only the first 150 items are shown. Add the rest in a second paste.</div>}
        </div>
      )}
      {msg && <div style={st.err} role="alert">{msg}</div>}
      <div style={st.sub}>You can add photos and options to each item afterwards with Edit.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button style={st.btnGhost} onClick={() => onDone(0)}>Cancel</button>
        <button style={{ ...st.btn, opacity: toAdd.length ? 1 : 0.5 }} disabled={busy || !toAdd.length} onClick={add}>{busy ? 'Adding…' : `Add ${toAdd.length || ''} item${toAdd.length === 1 ? '' : 's'}`.replace('  ', ' ')}</button>
      </div>
    </div>
  );
}

// What customers will see on the store page: sections, items, prices, options. Nothing can be ordered here.
const optLine = (g) => `${g.name}${g.required ? ' (must choose' : ' (optional'}${g.maxSelect > 1 ? `, up to ${g.maxSelect})` : ')'}: ${(g.choices || []).map((c) => `${c.label}${c.priceCents ? ` +${formatJMD(c.priceCents)}` : ''}`).join(', ')}`;
export function MenuPreview({ store, list, onClose }) {
  const groups = {};
  list.forEach((p) => { const k = p.category || 'Menu'; (groups[k] = groups[k] || []).push(p); });
  const name = store?.name || 'Your store';
  return (
    <div role="dialog" aria-modal="true" aria-label="Preview as customer" style={{ position: 'fixed', inset: 0, zIndex: 50, background: C.bg, overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, background: C.purpleDark, color: C.white, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Preview: this is what customers see{store?.status === 'approved' ? '' : ' once VilleDash approves your store'}</span>
        <button type="button" onClick={onClose} style={{ ...small, background: C.white, color: C.purpleDark, border: 'none' }}>Close preview</button>
      </div>
      <div style={{ height: 150, background: store?.coverUrl ? `center/cover url("${store.coverUrl}")` : `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})` }} />
      <div style={{ ...st.wrap, marginTop: -36 }}>
        <div style={st.card}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, color: C.purple, background: store?.logoUrl ? `center/cover url("${store.logoUrl}")` : C.purpleSoft, border: `2px solid ${C.white}` }}>{!store?.logoUrl && name.trim().charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{name}</div>{store?.address && <div style={st.sub}>{store.address}</div>}</div>
          </div>
          {store?.description && <div style={{ fontSize: 14, marginTop: 8 }}>{store.description}</div>}
        </div>
        {list.length === 0 ? <div style={{ ...st.card, ...st.sub, textAlign: 'center' }}>Customers would see “No products listed yet”. Add some items first.</div>
          : Object.keys(groups).map((s) => (
            <section key={s} aria-label={s}>
              <h2 style={{ fontSize: 17, margin: '16px 0 8px' }}>{s}</h2>
              {groups[s].map((p) => {
                const soldOut = p.available === false || (Number.isInteger(p.stock) && p.stock <= 0);
                return (
                  <div key={p.id} style={{ ...st.card, display: 'flex', gap: 12, opacity: soldOut ? 0.6 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      {p.description && <div style={{ ...st.sub, marginTop: 2 }}>{p.description}</div>}
                      <div style={{ fontWeight: 800, marginTop: 4 }}>{soldOut ? 'Sold out' : formatJMD(p.priceCents)}</div>
                      {(p.options || []).map((g, i) => <div key={i} style={{ fontSize: 12, color: C.quiet, marginTop: 2 }}>{optLine(g)}</div>)}
                    </div>
                    {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} />}
                  </div>
                );
              })}
            </section>
          ))}
        <div style={{ ...st.sub, textAlign: 'center', margin: '8px 0 24px' }}>Customers tap an item to pick options and add it to their cart.</div>
      </div>
    </div>
  );
}

function Products({ uid, store, onCount }) {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | 'paste' | product
  const [preview, setPreview] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [added, setAdded] = useState('');
  useEffect(() => onSnapshot(collection(dashDb(), 'merchants', uid, 'products'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))), () => setList([])), [uid]);
  useEffect(() => { if (list && onCount) onCount(list.length); }, [list, onCount]);
  if (!list) return <Spinner />;
  if (editing === 'paste') return <PasteMenu uid={uid} existing={list} onDone={(n) => { setEditing(null); setAdded(n ? `Added ${n} item${n === 1 ? '' : 's'} to your menu.` : ''); }} />;
  if (editing) return <ProductForm uid={uid} p={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />;
  const toggle = (p) => updateDoc(doc(dashDb(), 'merchants', uid, 'products', p.id), { available: p.available === false, updatedAt: serverTimestamp() }).catch(() => {});
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <button style={st.btn} onClick={() => { setAdded(''); setEditing('new'); }}>+ Add item</button>
        <button style={st.btnGhost} onClick={() => { setAdded(''); setEditing('paste'); }}>Paste a menu</button>
      </div>
      <button style={{ ...st.btnGhost, marginBottom: 12 }} onClick={() => setPreview(true)}>Preview as customer</button>
      {added && <div style={st.note} role="status">{added} Tap Edit on an item to add a photo or options.</div>}
      {list.length === 0 && <div style={{ ...st.card, ...st.sub }}>No items yet. Add your menu or catalogue so customers can order.</div>}
      {list.map((p) => (
        <div key={p.id} style={{ ...st.card, display: 'flex', gap: 10, alignItems: 'center' }}>
          {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10 }} /> : <div style={{ width: 48, height: 48, borderRadius: 10, background: C.purpleSoft }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: C.quiet }}>{p.category} · {formatJMD(p.priceCents)}{Number.isInteger(p.stock) ? ` · ${p.stock} left` : ''}{p.options?.length ? ` · ${p.options.length} option group${p.options.length === 1 ? '' : 's'}` : ''}</div>
          </div>
          <button onClick={() => toggle(p)} aria-label={`${p.name}: ${p.available === false ? 'off, turn on' : 'on, turn off'}`} style={{ ...small, background: p.available === false ? '#f3f4f6' : '#e8f7ef', color: p.available === false ? C.quiet : C.green, border: 'none' }}>{p.available === false ? 'Off' : 'On'}</button>
          <button onClick={() => setEditing(p)} style={{ ...small, background: C.purpleSoft, color: C.purple, border: 'none' }}>Edit</button>
          {confirmDel === p.id
            ? <button onClick={() => deleteDoc(doc(dashDb(), 'merchants', uid, 'products', p.id)).then(() => setConfirmDel(null))} style={{ ...small, background: C.red, color: C.white, border: 'none' }}>Delete?</button>
            : <button onClick={() => setConfirmDel(p.id)} aria-label={`Delete ${p.name}`} style={{ ...small, background: 'none', color: C.red, border: 'none' }}>✕</button>}
        </div>
      ))}
      {preview && <MenuPreview store={store} list={list} onClose={() => setPreview(false)} />}
    </>
  );
}

// ── Sales & settlements ──────────────────────────────────────────────────────
function Sales({ uid }) {
  const [orders, setOrders] = useState(null);
  const [settlements, setSettlements] = useState(null);
  useEffect(() => {
    const u1 = onSnapshot(query(collection(dashDb(), 'dash_orders'), where('merchantId', '==', uid), orderBy('createdAt', 'desc'), limit(500)),
      (s) => setOrders(s.docs.map((d) => d.data()).filter((o) => o.status === 'delivered')), () => setOrders([]));
    const u2 = onSnapshot(query(collection(dashDb(), 'settlements'), where('merchantId', '==', uid), orderBy('createdAt', 'desc'), limit(50)),
      (s) => setSettlements(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSettlements([]));
    return () => { u1(); u2(); };
  }, [uid]);
  const stats = useMemo(() => {
    if (!orders) return null;
    const at = (o) => o.statusTimes?.delivered?.toDate?.() || o.createdAt?.toDate?.() || new Date(0);
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const week = new Date(day); week.setDate(week.getDate() - 6);
    const month = new Date(day); month.setDate(1);
    const sum = (from) => { const l = orders.filter((o) => at(o) >= from); return { n: l.length, gross: l.reduce((s, o) => s + o.subtotalCents, 0), net: l.reduce((s, o) => s + o.merchantPayableCents, 0) }; };
    return { today: sum(day), week: sum(week), month: sum(month) };
  }, [orders]);
  if (!stats || !settlements) return <Spinner />;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        {[['Today', stats.today], ['Last 7 days', stats.week], ['This month', stats.month]].map(([l, v]) => (
          <div key={l} style={{ ...st.card, marginBottom: 0 }}>
            <div style={st.label}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatJMD(v.gross)}</div>
            <div style={st.sub}>{v.n} orders · you receive {formatJMD(v.net)}</div>
          </div>
        ))}
      </div>
      <div style={st.h2}>Settlements</div>
      <div style={{ ...st.sub, marginBottom: 8 }}>VilleDash pays your sales minus 15% commission every 2 weeks.</div>
      {settlements.length === 0 ? <div style={{ ...st.card, ...st.sub }}>No settlements yet.</div> : settlements.map((s) => (
        <div key={s.id} style={st.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>{ts(s.periodStart).split(',')[0]} – {ts(s.periodEnd).split(',')[0]}</b>
            <Pill tone={s.status === 'paid' ? 'green' : 'amber'}>{s.status === 'paid' ? 'Paid' : 'Pending payment'}</Pill>
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{s.orderCount} orders · gross {formatJMD(s.grossSalesCents)} − commission {formatJMD(s.commissionCents)} = <b>{formatJMD(s.netPayableCents)}</b></div>
          {s.paymentReference && <div style={{ fontSize: 12, color: C.quiet }}>Reference: {s.paymentReference}</div>}
        </div>
      ))}
    </>
  );
}

function Dashboard({ user, store }) {
  const [tab, setTab] = useState('orders');
  const open = isOpenAt(store.hours) && store.isAcceptingOrders !== false;
  const setAccepting = (v) => updateDoc(doc(dashDb(), 'merchants', user.uid), { isAcceptingOrders: v, updatedAt: serverTimestamp() }).catch(() => {});
  return (
    <div style={st.page}>
      <Header title={store.name} right={<SignOutBtn />} />
      <div style={st.wrap}>
        <div style={{ ...st.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{open ? 'Taking orders' : store.isAcceptingOrders === false ? 'Orders paused' : 'Closed (outside your hours)'}</div>
            <div style={st.sub}>Customers can only order while you're open and not paused.</div>
          </div>
          <button onClick={() => setAccepting(store.isAcceptingOrders === false)}
            style={{ ...small, padding: '10px 14px', borderRadius: 20, border: 'none', background: store.isAcceptingOrders === false ? C.green : '#f3f4f6', color: store.isAcceptingOrders === false ? C.white : C.ink }}>
            {store.isAcceptingOrders === false ? 'Resume orders' : 'Pause orders'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {[['orders', 'Orders'], ['products', 'Menu'], ['sales', 'Sales & payouts'], ['store', 'Store details']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...small, borderRadius: 20, padding: '8px 14px', background: tab === k ? C.purple : '#f3f4f6', color: tab === k ? C.white : '#555', border: 'none' }}>{l}</button>
          ))}
        </div>
        {tab === 'orders' && <Orders uid={user.uid} store={store} />}
        {tab === 'products' && <Products uid={user.uid} store={store} />}
        {tab === 'sales' && <Sales uid={user.uid} />}
        {tab === 'store' && <StoreForm uid={user.uid} initial={store} />}
      </div>
    </div>
  );
}

export default function MerchantPortal() {
  const [user, setUser] = useState(undefined);
  const [store, setStore] = useState(undefined);
  useEffect(() => onAuthStateChanged(dashAuth(), (u) => setUser(u || null)), []);
  useEffect(() => {
    if (!user) { setStore(user === null ? null : undefined); return undefined; }
    return onSnapshot(doc(dashDb(), 'merchants', user.uid), (s) => setStore(s.exists() ? s.data() : null), () => setStore(null));
  }, [user]);
  if (user === undefined || (user && store === undefined)) return <div style={st.page}><Spinner /></div>;
  if (!user) return <SignIn />;
  if (!store) {
    return (
      <div style={st.page}><Header title="Register your store" right={<SignOutBtn />} />
        <div style={st.wrap}><Steps at={1} /><StoreForm uid={user.uid} registering /></div></div>
    );
  }
  if (store.status === 'approved') return <Dashboard user={user} store={store} />;
  if (store.status === 'pending') return <PendingStore user={user} store={store} />;
  return (
    <div style={st.page}><Header title={store.name} right={<SignOutBtn />} />
      <div style={st.wrap}>
        <div style={{ ...st.card, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>⛔</div>
          <div style={st.h2}>Store not active</div>
          <div style={st.sub}>Contact VilleDash at admin@villecabs.com.</div>
        </div>
      </div>
    </div>
  );
}

function Steps({ at }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }} aria-label={`Step ${at} of 2`}>
      {['Store details', 'Your menu'].map((l, i) => (
        <div key={l} style={{ flex: 1 }}>
          <div style={{ height: 5, borderRadius: 3, background: i < at ? C.purple : C.purpleLine }} />
          <div style={{ fontSize: 12, marginTop: 4, color: i + 1 === at ? C.purple : C.quiet, fontWeight: i + 1 === at ? 700 : 500 }}>Step {i + 1} · {l}</div>
        </div>
      ))}
    </div>
  );
}

// After "Send for approval": step 2 (add the menu, or skip), then the waiting screen with the menu below it.
function PendingStore({ user, store }) {
  const key = `vd_menu_step_${user.uid}`;
  const [done, setDone] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } });
  const [count, setCount] = useState(0);
  const finish = () => { try { localStorage.setItem(key, '1'); } catch (e) { /* ignore */ } setDone(true); window.scrollTo && window.scrollTo(0, 0); };
  if (!done) {
    return (
      <div style={st.page}><Header title={store.name} right={<SignOutBtn />} />
        <div style={st.wrap}>
          <Steps at={2} />
          <div style={st.card}>
            <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✓ Store details sent for approval</div>
            <div style={{ ...st.h2, marginTop: 6 }}>Add your menu</div>
            <div style={st.sub}>Add what you sell and the prices. Customers will see your menu, choose what they want and add it to their cart once VilleDash approves your store. You can change it any time.</div>
          </div>
          <Products uid={user.uid} store={store} onCount={setCount} />
          <button style={{ ...(count ? st.btn : st.btnGhost), marginTop: 4 }} onClick={finish}>{count ? `Done, ${count} item${count === 1 ? '' : 's'} added` : 'Skip for now'}</button>
          {!count && <div style={{ ...st.sub, textAlign: 'center', marginTop: 6 }}>You can add your menu later from this page.</div>}
        </div>
      </div>
    );
  }
  return (
    <div style={st.page}><Header title={store.name} right={<SignOutBtn />} />
      <div style={st.wrap}>
        <div style={{ ...st.card, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <div style={st.h2}>Waiting for approval</div>
          <div style={st.sub}>VilleDash will contact you to confirm your documents and settlement details. Your menu goes live when your store is approved. You can keep adding to it below.</div>
        </div>
        <div style={st.h2}>Your menu</div>
        <Products uid={user.uid} store={store} />
      </div>
    </div>
  );
}
