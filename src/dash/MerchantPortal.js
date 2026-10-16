// VilleDash Merchant portal — served at /merchant.
import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where, orderBy, limit, setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
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
      <div style={{ fontSize: 13, color: C.quiet }}>Items {formatJMD(o.subtotalCents)} · you receive {formatJMD(o.merchantPayableCents)} after {o.commissionPct}% commission</div>
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
    done: orders.filter((o) => ['delivered', 'rejected', 'cancelled', 'failed'].includes(o.status)),
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

// ── Products ─────────────────────────────────────────────────────────────────
// Options are typed as lines:  Size* | Small:0, Large:400   (* = required, prices in J$)
//                              Extras (2) | Festival:150, Plantain:200   ((n) = choose up to n)
function optionsToText(opts) {
  return (opts || []).map((g) => `${g.name}${g.required ? '*' : ''}${g.maxSelect > 1 ? ` (${g.maxSelect})` : ''} | ${(g.choices || []).map((c) => `${c.label}:${(c.priceCents || 0) / 100}`).join(', ')}`).join('\n');
}
function textToOptions(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const [head, rest] = line.split('|');
    if (!rest) throw new Error(`Option line needs a "|": ${line}`);
    const m = /^(.+?)(\*)?\s*(?:\((\d+)\))?\s*$/.exec(head.trim());
    const choices = rest.split(',').map((c) => c.trim()).filter(Boolean).map((c) => {
      const [label, price] = c.split(':');
      const cents = centsFromJ(price || '0');
      if (!label.trim() || Number.isNaN(cents)) throw new Error(`Check the choice "${c}".`);
      return { label: label.trim().slice(0, 40), priceCents: cents };
    });
    if (!choices.length) throw new Error(`Add choices for ${m[1]}.`);
    out.push({ name: m[1].trim().slice(0, 40), required: !!m[2], maxSelect: m[3] ? Number(m[3]) : 1, choices });
  }
  return out;
}
function ProductForm({ uid, p, onDone }) {
  const [f, setF] = useState({
    name: p?.name || '', category: p?.category || '', description: p?.description || '',
    price: p ? String((p.priceCents || 0) / 100) : '', stock: p && Number.isInteger(p.stock) ? String(p.stock) : '',
    available: p ? p.available !== false : true, imageUrl: p?.imageUrl || '', options: optionsToText(p?.options),
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setMsg('');
    const priceCents = centsFromJ(f.price);
    if (!f.name.trim()) { setMsg('Add a product name.'); return; }
    if (Number.isNaN(priceCents)) { setMsg('Enter a price in J$.'); return; }
    const stock = f.stock.trim() === '' ? null : Number(f.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) { setMsg('Stock must be a whole number, or blank for unlimited.'); return; }
    let options;
    try { options = textToOptions(f.options); } catch (e) { setMsg(e.message); return; }
    const data = {
      name: f.name.trim().slice(0, 80), category: f.category.trim().slice(0, 40) || 'Menu', description: f.description.trim().slice(0, 300),
      priceCents, stock, available: f.available, imageUrl: f.imageUrl || null, options, updatedAt: serverTimestamp(),
    };
    setBusy(true);
    try {
      if (p) await updateDoc(doc(dashDb(), 'merchants', uid, 'products', p.id), data);
      else await addDoc(collection(dashDb(), 'merchants', uid, 'products'), { ...data, createdAt: serverTimestamp() });
      onDone();
    } catch (e) { setMsg('Could not save the product.'); }
    setBusy(false);
  };
  return (
    <div style={{ ...st.card, border: `2px solid ${C.purpleLine}` }}>
      <div style={st.h2}>{p ? 'Edit product' : 'New product'}</div>
      <label style={st.label}>Name</label><input style={st.input} value={f.name} onChange={set('name')} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><label style={st.label}>Price (J$)</label><input style={st.input} inputMode="decimal" value={f.price} onChange={set('price')} /></div>
        <div><label style={st.label}>Stock (blank = unlimited)</label><input style={st.input} inputMode="numeric" value={f.stock} onChange={set('stock')} /></div>
      </div>
      <label style={st.label}>Menu section</label><input style={st.input} value={f.category} onChange={set('category')} placeholder="e.g. Mains, Drinks, Sizes 8–12" />
      <label style={st.label}>Description</label><textarea style={{ ...st.input, minHeight: 50 }} value={f.description} onChange={set('description')} />
      <label style={st.label}>Options (one group per line)</label>
      <textarea style={{ ...st.input, minHeight: 60, fontFamily: 'monospace', fontSize: 12.5 }} value={f.options} onChange={set('options')} placeholder={'Size* | Small:0, Large:400\nExtras (2) | Festival:150, Plantain:200'} />
      <div style={{ fontSize: 11.5, color: C.quiet }}>* = customer must choose · (2) = can choose up to 2 · prices are added to the base price</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '10px 0' }}>
        <input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Available to order
      </label>
      <label style={{ ...st.btnGhost, display: 'block', textAlign: 'center' }}>
        {f.imageUrl ? '✓ Photo uploaded — replace' : 'Upload photo'}
        <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={async (e) => {
          try { const url = await uploadMerchantImage(uid, e.target.files[0], 'product'); setF((x) => ({ ...x, imageUrl: url })); } catch (er) { setMsg(er.message || 'Upload failed.'); }
        }} />
      </label>
      {msg && <div style={st.err}>{msg}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button style={st.btnGhost} onClick={onDone}>Cancel</button>
        <button style={st.btn} disabled={busy} onClick={save}>Save</button>
      </div>
    </div>
  );
}
function Products({ uid }) {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [confirmDel, setConfirmDel] = useState(null);
  useEffect(() => onSnapshot(collection(dashDb(), 'merchants', uid, 'products'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))), () => setList([])), [uid]);
  if (!list) return <Spinner />;
  if (editing) return <ProductForm uid={uid} p={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />;
  const toggle = (p) => updateDoc(doc(dashDb(), 'merchants', uid, 'products', p.id), { available: p.available === false, updatedAt: serverTimestamp() }).catch(() => {});
  return (
    <>
      <button style={{ ...st.btn, marginBottom: 12 }} onClick={() => setEditing('new')}>+ Add product</button>
      {list.length === 0 && <div style={{ ...st.card, ...st.sub }}>No products yet. Add your menu or catalogue so customers can order.</div>}
      {list.map((p) => (
        <div key={p.id} style={{ ...st.card, display: 'flex', gap: 10, alignItems: 'center' }}>
          {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10 }} /> : <div style={{ width: 48, height: 48, borderRadius: 10, background: C.purpleSoft }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 12.5, color: C.quiet }}>{p.category} · {formatJMD(p.priceCents)}{Number.isInteger(p.stock) ? ` · ${p.stock} left` : ''}{p.options?.length ? ` · ${p.options.length} option group(s)` : ''}</div>
          </div>
          <button onClick={() => toggle(p)} style={{ ...small, background: p.available === false ? '#f3f4f6' : '#e8f7ef', color: p.available === false ? C.quiet : C.green, border: 'none' }}>{p.available === false ? 'Off' : 'On'}</button>
          <button onClick={() => setEditing(p)} style={{ ...small, background: C.purpleSoft, color: C.purple, border: 'none' }}>Edit</button>
          {confirmDel === p.id
            ? <button onClick={() => deleteDoc(doc(dashDb(), 'merchants', uid, 'products', p.id)).then(() => setConfirmDel(null))} style={{ ...small, background: C.red, color: C.white, border: 'none' }}>Delete?</button>
            : <button onClick={() => setConfirmDel(p.id)} style={{ ...small, background: 'none', color: C.red, border: 'none' }}>✕</button>}
        </div>
      ))}
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
          {[['orders', 'Orders'], ['products', 'Products'], ['sales', 'Sales & payouts'], ['store', 'Store details']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...small, borderRadius: 20, padding: '8px 14px', background: tab === k ? C.purple : '#f3f4f6', color: tab === k ? C.white : '#555', border: 'none' }}>{l}</button>
          ))}
        </div>
        {tab === 'orders' && <Orders uid={user.uid} store={store} />}
        {tab === 'products' && <Products uid={user.uid} />}
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
        <div style={st.wrap}><StoreForm uid={user.uid} registering /></div></div>
    );
  }
  if (store.status === 'approved') return <Dashboard user={user} store={store} />;
  return (
    <div style={st.page}><Header title={store.name} right={<SignOutBtn />} />
      <div style={st.wrap}>
        <div style={{ ...st.card, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{store.status === 'pending' ? '⏳' : '⛔'}</div>
          <div style={st.h2}>{store.status === 'pending' ? 'Waiting for approval' : 'Store not active'}</div>
          <div style={st.sub}>{store.status === 'pending' ? 'VilleDash will contact you to confirm your documents and settlement details. You can add products now so you’re ready.' : 'Contact VilleDash at admin@villecabs.com.'}</div>
        </div>
        {store.status === 'pending' && <Products uid={user.uid} />}
      </div>
    </div>
  );
}
