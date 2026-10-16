// VilleDash marketplace — customer side: stores, store page, cart, checkout, order tracking.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import {
  api, dashDb, errText, formatJMD, newRequestKey, MERCHANT_CATEGORIES, ORDER_LABEL, ORDER_FINAL,
  isOpenAt, hoursToday, useCart, lineUnitCents, STATUS_LABEL,
} from './dashApi';
import { C, st, Header, Pill, Spinner } from './ui';

const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };
const catLabel = (k) => (MERCHANT_CATEGORIES.find(([x]) => x === k) || [k, k])[1];

function orderTone(s) {
  if (s === 'delivered') return 'green';
  if (['rejected', 'failed'].includes(s)) return 'red';
  if (s === 'cancelled') return 'grey';
  if (s === 'awaiting_merchant') return 'amber';
  return 'purple';
}

function CartBar({ go }) {
  const [cart] = useCart();
  const count = cart.items.reduce((s, i) => s + i.qty, 0);
  if (!count) return null;
  const total = cart.items.reduce((s, i) => s + i.unitCents * i.qty, 0);
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: 12, background: 'rgba(247,245,251,0.96)', borderTop: `1px solid ${C.line}`, zIndex: 30 }}>
      <button style={{ ...st.btn, maxWidth: 560, margin: '0 auto', display: 'flex', justifyContent: 'space-between' }} onClick={() => go('dash-checkout')}>
        <span>View cart · {count} item{count === 1 ? '' : 's'}</span><span>{formatJMD(total)}</span>
      </button>
    </div>
  );
}

// ── Store list ───────────────────────────────────────────────────────────────
export function StoresList({ go, openStore }) {
  const [stores, setStores] = useState(null);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => onSnapshot(query(collection(dashDb(), 'merchants'), where('status', '==', 'approved')),
    (s) => setStores(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setStores([])), []);
  const list = useMemo(() => (stores || [])
    .filter((m) => !cat || m.category === cat)
    .filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()))
    .map((m) => ({ ...m, open: isOpenAt(m.hours) && m.isAcceptingOrders !== false }))
    .sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name)), [stores, cat, q]);
  return (
    <div style={{ ...st.page, paddingBottom: 90 }}>
      <Header title="Order from Stores" onBack={() => go('dash-home')} />
      <div style={st.wrap}>
        <input style={st.input} placeholder="Search stores" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 0', scrollbarWidth: 'none' }}>
          {[['', 'All'], ...MERCHANT_CATEGORIES].map(([k, l]) => (
            <button key={k} onClick={() => setCat(k)} style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${cat === k ? C.purple : C.line}`, background: cat === k ? C.purple : C.white, color: cat === k ? C.white : C.ink }}>{l}</button>
          ))}
        </div>
        {stores === null ? <Spinner /> : list.length === 0 ? (
          <div style={{ ...st.card, textAlign: 'center', padding: 26 }}>
            <div style={{ fontSize: 36 }}>🛍️</div>
            <div style={{ ...st.h2, marginTop: 6 }}>{stores.length ? 'No stores match' : 'Stores are joining VilleDash'}</div>
            <div style={st.sub}>{stores.length ? 'Try another category or search.' : 'Ordering opens as Mandeville businesses are approved.'}</div>
          </div>
        ) : list.map((m) => (
          <button key={m.id} onClick={() => openStore(m.id)} style={{ ...st.card, width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden', opacity: m.open ? 1 : 0.7 }}>
            {m.coverUrl && <div style={{ height: 110, background: `center/cover no-repeat url("${m.coverUrl}")` }} />}
            <div style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: m.logoUrl ? `center/cover url("${m.logoUrl}")` : C.purpleSoft, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{m.logoUrl ? '' : '🏪'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{m.name}</div>
                <div style={{ fontSize: 12.5, color: C.quiet }}>{catLabel(m.category)} · {hoursToday(m.hours)}{m.prepMinutesTypical ? ` · ~${m.prepMinutesTypical} min prep` : ''}</div>
              </div>
              <Pill tone={m.open ? 'green' : 'grey'}>{m.open ? 'Open' : m.isAcceptingOrders === false ? 'Paused' : 'Closed'}</Pill>
            </div>
          </button>
        ))}
      </div>
      <CartBar go={go} />
    </div>
  );
}

// ── Product options sheet ────────────────────────────────────────────────────
function AddSheet({ product, onClose, onAdd }) {
  const [qty, setQty] = useState(1);
  const [opts, setOpts] = useState({});
  const [note, setNote] = useState('');
  const groups = product.options || [];
  const missing = groups.filter((g) => g.required && !(opts[g.name] || []).length);
  const toggle = (g, label) => {
    const cur = opts[g.name] || [];
    const max = g.maxSelect > 0 ? g.maxSelect : 1;
    let next;
    if (cur.includes(label)) next = cur.filter((x) => x !== label);
    else if (max === 1) next = [label];
    else if (cur.length < max) next = [...cur, label];
    else return;
    setOpts({ ...opts, [g.name]: next });
  };
  const unit = lineUnitCents(product, opts);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,10,40,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, width: '100%', maxWidth: 560, borderRadius: '20px 20px 0 0', padding: 18, maxHeight: '85vh', overflowY: 'auto' }}>
        {product.imageUrl && <img src={product.imageUrl} alt="" style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 14, marginBottom: 10 }} />}
        <div style={{ fontSize: 18, fontWeight: 800 }}>{product.name}</div>
        {product.description && <div style={{ ...st.sub, marginTop: 4 }}>{product.description}</div>}
        {groups.map((g) => (
          <div key={g.name} style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name} <span style={{ fontWeight: 500, fontSize: 12, color: C.quiet }}>{g.required ? 'Required' : 'Optional'}{g.maxSelect > 1 ? ` · up to ${g.maxSelect}` : ''}</span></div>
            {(g.choices || []).filter((c) => c.available !== false).map((c) => {
              const on = (opts[g.name] || []).includes(c.label);
              return (
                <label key={c.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 2px', borderBottom: `1px solid ${C.line}`, cursor: 'pointer', fontSize: 14 }}>
                  <span><input type={g.maxSelect > 1 ? 'checkbox' : 'radio'} checked={on} onChange={() => toggle(g, c.label)} style={{ marginRight: 8 }} />{c.label}</span>
                  <span style={{ color: C.quiet }}>{c.priceCents ? `+${formatJMD(c.priceCents)}` : ''}</span>
                </label>
              );
            })}
          </div>
        ))}
        <label style={st.label}>Special instructions (optional)</label>
        <input style={st.input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No onions" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.line}`, borderRadius: 12 }}>
            <button onClick={() => setQty(Math.max(1, qty - 1))} style={{ width: 40, height: 44, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.purple }}>−</button>
            <div style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{qty}</div>
            <button onClick={() => setQty(Math.min(99, qty + 1))} style={{ width: 40, height: 44, border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: C.purple }}>+</button>
          </div>
          <button style={{ ...st.btn, opacity: missing.length ? 0.5 : 1 }} disabled={missing.length > 0}
            onClick={() => onAdd({ qty, options: opts, note: note.trim(), unitCents: unit })}>
            {missing.length ? `Choose ${missing[0].name}` : `Add · ${formatJMD(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Store page ───────────────────────────────────────────────────────────────
export function StorePage({ go, storeId, shared }) {
  const { vcConfirm } = shared;
  const [m, setM] = useState(undefined);
  const [products, setProducts] = useState(null);
  const [picking, setPicking] = useState(null);
  const [cart, saveCart] = useCart();
  useEffect(() => {
    if (!storeId) return undefined;
    const u1 = onSnapshot(doc(dashDb(), 'merchants', storeId), (s) => setM(s.exists() ? { id: s.id, ...s.data() } : null), () => setM(null));
    const u2 = onSnapshot(collection(dashDb(), 'merchants', storeId, 'products'), (s) => setProducts(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setProducts([]));
    return () => { u1(); u2(); };
  }, [storeId]);
  if (m === undefined) return <div style={st.page}><Header title="Store" onBack={() => go('dash-stores')} /><Spinner /></div>;
  if (!m || m.status !== 'approved') return <div style={st.page}><Header title="Store" onBack={() => go('dash-stores')} /><div style={st.wrap}><div style={st.card}>This store isn't available.</div></div></div>;
  const open = isOpenAt(m.hours) && m.isAcceptingOrders !== false;
  const groups = {};
  (products || []).forEach((p) => { const k = p.category || 'Menu'; (groups[k] = groups[k] || []).push(p); });

  const add = async (p, line) => {
    let c = cart;
    if (c.merchantId && c.merchantId !== m.id && c.items.length) {
      const ok = await vcConfirm(`Your cart has items from another store. Start a new cart with ${m.name}?`, { confirmText: 'Start new cart' });
      if (!ok) return;
      c = { merchantId: null, items: [] };
    }
    saveCart({ merchantId: m.id, merchantName: m.name, items: [...c.items, { key: `${p.id}-${Date.now()}`, productId: p.id, name: p.name, ...line }] });
    setPicking(null);
  };

  return (
    <div style={{ ...st.page, paddingBottom: 90 }}>
      <Header title={m.name} onBack={() => go('dash-stores')} />
      {m.coverUrl && <div style={{ height: 150, background: `center/cover no-repeat url("${m.coverUrl}")` }} />}
      <div style={st.wrap}>
        <div style={st.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{m.name}</div>
            <Pill tone={open ? 'green' : 'grey'}>{open ? 'Open' : m.isAcceptingOrders === false ? 'Paused' : 'Closed'}</Pill>
          </div>
          {m.description && <div style={{ ...st.sub, marginTop: 4 }}>{m.description}</div>}
          <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 6 }}>{catLabel(m.category)} · {m.address} · Today {hoursToday(m.hours)}</div>
          {m.phone && <div style={{ fontSize: 12.5, color: C.quiet }}>Support: {m.phone}</div>}
          {!open && <div style={st.note}>{m.isAcceptingOrders === false ? 'This store has paused orders.' : 'This store is closed right now.'} You can browse, but checkout opens when they do.</div>}
        </div>
        {products === null ? <Spinner /> : products.length === 0 ? <div style={{ ...st.card, ...st.sub }}>No products listed yet.</div>
          : Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <div style={{ ...st.h2, margin: '16px 2px 8px' }}>{g}</div>
              {list.map((p) => {
                const soldOut = p.available === false || (Number.isInteger(p.stock) && p.stock <= 0);
                return (
                  <button key={p.id} disabled={soldOut} onClick={() => setPicking(p)}
                    style={{ ...st.card, width: '100%', textAlign: 'left', cursor: soldOut ? 'default' : 'pointer', display: 'flex', gap: 12, alignItems: 'center', opacity: soldOut ? 0.55 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.description}</div>}
                      <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{soldOut ? 'Sold out' : formatJMD(p.priceCents)}</div>
                    </div>
                    {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12 }} />}
                  </button>
                );
              })}
            </div>
          ))}
      </div>
      {picking && <AddSheet product={picking} onClose={() => setPicking(null)} onAdd={(line) => add(picking, line)} />}
      <CartBar go={go} />
    </div>
  );
}

// ── Checkout ─────────────────────────────────────────────────────────────────
export function Checkout({ go, user, shared, openOrder, openStore }) {
  const { AddressAutocompleteInput, VilleMap, geocodeLatLng } = shared;
  const [cart, saveCart] = useCart();
  const [drop, setDrop] = useState({});
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keyRef = useRef(newRequestKey());
  const items = cart.items.map((i) => ({ productId: i.productId, qty: i.qty, options: i.options, note: i.note }));
  const pos = drop.lat != null ? { lat: drop.lat, lng: drop.lng } : null;
  const itemsKey = JSON.stringify(items);

  // Re-price on the server whenever the cart or address changes.
  useEffect(() => {
    if (!cart.merchantId || !items.length || !pos) { setQuote(null); return undefined; }
    let live = true;
    setErr('');
    api.marketQuote({ merchantId: cart.merchantId, items, dropoff: pos })
      .then((q) => { if (live) setQuote(q); })
      .catch((e) => { if (live) { setQuote(null); setErr(errText(e)); } });
    return () => { live = false; };
  }, [cart.merchantId, itemsKey, drop.lat, drop.lng]); // eslint-disable-line

  const setQty = (key, qty) => saveCart({ ...cart, items: qty <= 0 ? cart.items.filter((i) => i.key !== key) : cart.items.map((i) => (i.key === key ? { ...i, qty } : i)) });
  const setPin = async (lat, lng) => {
    setDrop((d) => ({ ...d, lat, lng }));
    try { const a = await geocodeLatLng(lat, lng); if (a) setDrop((d) => ({ ...d, address: a })); } catch (e) { /* keep pin */ }
  };
  const place = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.marketCreate({
        idempotencyKey: keyRef.current, merchantId: cart.merchantId, items, expectedTotalCents: quote.totalCents,
        dropoff: { ...drop, address: drop.address || 'Pinned location' }, phone, note,
      });
      saveCart({ merchantId: null, items: [] });
      openOrder(r.orderId);
    } catch (e) {
      if (e.code === 'functions/aborted' && e.details?.totalCents) {
        setErr('Prices or availability changed. Check the new total and place the order again.');
        keyRef.current = newRequestKey();
        api.marketQuote({ merchantId: cart.merchantId, items, dropoff: pos }).then(setQuote).catch(() => {});
      } else setErr(errText(e));
    }
    setBusy(false);
  };

  if (!cart.items.length) {
    return (
      <div style={st.page}><Header title="Your cart" onBack={() => go('dash-stores')} />
        <div style={st.wrap}><div style={{ ...st.card, textAlign: 'center' }}><div style={st.h2}>Your cart is empty</div>
          <button style={{ ...st.btn, marginTop: 10 }} onClick={() => go('dash-stores')}>Browse stores</button></div></div></div>
    );
  }
  return (
    <div style={st.page}>
      <Header title={`Checkout · ${cart.merchantName || 'Store'}`} onBack={() => (cart.merchantId ? openStore(cart.merchantId) : go('dash-stores'))} />
      <div style={st.wrap}>
        <div style={st.card}>
          <div style={st.h2}>Your items</div>
          {cart.items.map((i) => (
            <div key={i.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                {Object.values(i.options || {}).flat().length > 0 && <div style={{ fontSize: 12, color: C.quiet }}>{Object.values(i.options).flat().join(', ')}</div>}
                {i.note && <div style={{ fontSize: 12, color: C.quiet }}>“{i.note}”</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => setQty(i.key, i.qty - 1)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.line}`, background: C.white, cursor: 'pointer' }}>−</button>
                <span style={{ minWidth: 16, textAlign: 'center' }}>{i.qty}</span>
                <button onClick={() => setQty(i.key, Math.min(99, i.qty + 1))} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.line}`, background: C.white, cursor: 'pointer' }}>+</button>
              </div>
              <div style={{ width: 80, textAlign: 'right', fontSize: 13.5 }}>{formatJMD(i.unitCents * i.qty)}</div>
            </div>
          ))}
          <label style={st.label}>Note for the store (optional)</label>
          <input style={st.input} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div style={st.card}>
          <div style={st.h2}>Deliver to</div>
          <AddressAutocompleteInput value={drop.address || ''} onChange={(t) => setDrop((d) => ({ ...d, address: t }))}
            onPlaceSelect={(p) => setDrop((d) => ({ ...d, address: p.formattedAddress || p.name, lat: p.lat, lng: p.lng }))} placeholder="Your delivery address" />
          <div style={{ borderRadius: 12, overflow: 'hidden', marginTop: 10, border: `1px solid ${C.line}` }}>
            <VilleMap height={200} center={pos || MANDEVILLE} zoom={pos ? 16 : 13} markers={pos ? [{ position: pos, title: 'Deliver here' }] : []}
              onClick={(e) => setPin(e.latLng.lat(), e.latLng.lng())} />
          </div>
          <label style={st.label}>Building or landmark</label>
          <input style={st.input} value={drop.landmark || ''} maxLength={150} onChange={(e) => setDrop((d) => ({ ...d, landmark: e.target.value }))} />
          <label style={st.label}>Phone for the rider</label>
          <input style={st.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Leave blank to use your account phone" />
        </div>

        {quote && (
          <div style={st.card}>
            <div style={st.row}><span style={{ color: C.quiet }}>Items</span><span>{formatJMD(quote.subtotalCents)}</span></div>
            <div style={st.row}><span style={{ color: C.quiet }}>Delivery (~{quote.distanceKm} km)</span><span>{formatJMD(quote.deliveryCents)}</span></div>
            {quote.serviceCents > 0 && <div style={st.row}><span style={{ color: C.quiet }}>Service fee</span><span>{formatJMD(quote.serviceCents)}</span></div>}
            <div style={{ ...st.row, borderTop: `2px solid ${C.purpleLine}`, marginTop: 8, paddingTop: 10 }}>
              <b>Total — cash on delivery</b><b style={{ fontSize: 20, color: C.purple }}>{formatJMD(quote.totalCents)}</b>
            </div>
            {quote.pricingPlaceholder && <div style={st.note}>Test delivery pricing — final rates not published yet.</div>}
          </div>
        )}
        {err && <div style={st.err}>{err}</div>}
        <button style={{ ...st.btn, opacity: quote && !busy ? 1 : 0.5 }} disabled={!quote || busy} onClick={place}>
          {busy ? 'Placing order…' : !pos ? 'Choose your address' : quote ? `Place order · ${formatJMD(quote.totalCents)}` : 'Checking prices…'}
        </button>
        <div style={{ ...st.sub, textAlign: 'center', fontSize: 12, marginTop: 8 }}>Pay the rider in cash when your order arrives.</div>
      </div>
    </div>
  );
}

// ── Order tracking ───────────────────────────────────────────────────────────
const ORDER_STEPS = ['awaiting_merchant', 'accepted', 'preparing', 'ready', 'collected', 'delivered'];
export function OrderTrack({ go, orderId, shared, openDelivery }) {
  const { VilleMap, vcConfirm } = shared;
  const [o, setO] = useState(undefined);
  const [pin, setPin] = useState(null);
  const [del, setDel] = useState(null);
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!orderId) return undefined;
    const u1 = onSnapshot(doc(dashDb(), 'dash_orders', orderId), (s) => setO(s.exists() ? { id: s.id, ...s.data() } : null), () => setO(null));
    const u2 = onSnapshot(doc(dashDb(), 'dash_orders', orderId, 'customer', 'pin'), (s) => setPin(s.exists() ? s.data().pin : null), () => {});
    return () => { u1(); u2(); };
  }, [orderId]);
  const delId = o?.deliveryId;
  useEffect(() => {
    if (!delId) return undefined;
    return onSnapshot(doc(dashDb(), 'dash_deliveries', delId), (s) => setDel(s.exists() ? s.data() : null), () => setDel(null));
  }, [delId]);
  const tracking = del && ['assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'].includes(del.status);
  useEffect(() => {
    if (!tracking) return undefined;
    return onSnapshot(doc(dashDb(), 'dash_locations', delId), (s) => setLoc(s.exists() ? s.data() : null), () => setLoc(null));
  }, [tracking, delId]);

  if (o === undefined) return <div style={st.page}><Header title="Order" onBack={() => go('dash-home')} /><Spinner /></div>;
  if (!o) return <div style={st.page}><Header title="Order" onBack={() => go('dash-home')} /><div style={st.wrap}><div style={st.card}>Order not found.</div></div></div>;
  const idx = ORDER_STEPS.indexOf(o.status);
  const fresh = loc?.at?.toMillis && Date.now() - loc.at.toMillis() < 120000;
  const cancel = async () => {
    if (!(await vcConfirm('Cancel this order?', { confirmText: 'Yes, cancel', danger: true }))) return;
    setErr('');
    try { await api.marketCancel({ orderId: o.id, reason: 'Cancelled by customer' }); } catch (e) { setErr(errText(e)); }
  };
  return (
    <div style={st.page}>
      <Header title={o.merchantName} onBack={() => go('dash-home')} right={<Pill tone={orderTone(o.status)}>{ORDER_LABEL[o.status]}</Pill>} />
      <div style={st.wrap}>
        {tracking && (
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <VilleMap height={220} center={fresh ? { lat: loc.lat, lng: loc.lng } : { lat: o.dropoff.lat, lng: o.dropoff.lng }} zoom={14}
              markers={[{ position: { lat: del.pickup.lat, lng: del.pickup.lng }, title: o.merchantName }, { position: { lat: o.dropoff.lat, lng: o.dropoff.lng }, title: 'You' },
                ...(fresh ? [{ position: { lat: loc.lat, lng: loc.lng }, title: 'Rider' }] : [])]} />
          </div>
        )}
        {tracking && !fresh && <div style={st.note}>Live rider location is temporarily unavailable. Status updates still arrive here.</div>}
        {!ORDER_FINAL.includes(o.status) && pin && (
          <div style={{ ...st.card, textAlign: 'center', border: `2px solid ${C.purpleLine}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, textTransform: 'uppercase' }}>Delivery PIN</div>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: 10 }}>{pin}</div>
            <div style={st.sub}>Give this to the rider after you receive your order.</div>
          </div>
        )}
        {o.status === 'rejected' && <div style={st.err}>{o.merchantName} couldn't take this order{o.rejectReason ? `: ${o.rejectReason}` : ''}. You haven't been charged.</div>}
        <div style={st.card}>
          <div style={st.h2}>Progress</div>
          {['rejected', 'cancelled', 'failed'].includes(o.status) ? <div style={st.sub}>{ORDER_LABEL[o.status]}.</div> : ORDER_STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', opacity: i <= idx ? 1 : 0.4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, background: i <= idx ? C.purple : C.purpleLine }} />
              <div style={{ fontSize: 13.5, fontWeight: i === idx ? 700 : 500 }}>{ORDER_LABEL[s]}{s === 'accepted' && o.prepMinutes && i <= idx ? ` · ~${o.prepMinutes} min prep` : ''}</div>
            </div>
          ))}
          {del && del.riderName && <div style={{ fontSize: 13, marginTop: 8 }}>Rider: <b>{del.riderName}</b>{del.riderPlate ? ` · ${del.riderPlate}` : ''} — {STATUS_LABEL[del.status]}</div>}
        </div>
        <div style={st.card}>
          <div style={st.h2}>Order</div>
          {o.items.map((i, n) => (
            <div key={n} style={st.row}><span>{i.qty} × {i.name}{i.options?.length ? ` (${i.options.map((x) => x.label).join(', ')})` : ''}</span><span>{formatJMD(i.lineCents)}</span></div>
          ))}
          <div style={st.row}><span style={{ color: C.quiet }}>Delivery</span><span>{formatJMD(o.deliveryCents)}</span></div>
          {o.serviceCents > 0 && <div style={st.row}><span style={{ color: C.quiet }}>Service fee</span><span>{formatJMD(o.serviceCents)}</span></div>}
          <div style={{ ...st.row, fontWeight: 800 }}><span>Total (cash)</span><span>{formatJMD(o.totalCents)}</span></div>
          <div style={{ fontSize: 11.5, color: C.quiet, marginTop: 6 }}>Order {o.id}</div>
        </div>
        {err && <div style={st.err}>{err}</div>}
        {['awaiting_merchant', 'accepted'].includes(o.status) && <button style={{ ...st.btnDanger, marginBottom: 10 }} onClick={cancel}>Cancel order</button>}
        {o.deliveryId && <button style={st.btnGhost} onClick={() => openDelivery(o.deliveryId)}>Delivery details & report a problem</button>}
      </div>
    </div>
  );
}

export function useMyOrders(uid, max = 30) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(dashDb(), 'dash_orders'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(max));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [uid, max]);
  return list;
}

export function OrderRow({ o, onOpen }) {
  return (
    <button onClick={() => onOpen(o.id)} style={{ ...st.card, width: '100%', textAlign: 'left', cursor: 'pointer', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🛍️ {o.merchantName}</div>
        <Pill tone={orderTone(o.status)}>{ORDER_LABEL[o.status]}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>
        {o.items.reduce((s, i) => s + i.qty, 0)} item(s) · {formatJMD(o.totalCents)} cash · {o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Just now'}
      </div>
    </button>
  );
}
