// VilleDash marketplace, customer side: store list, store page, cart, checkout
// and order progress. Every price is re-checked on the server.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import {
  api, dashDb, errText, formatJMD, newRequestKey, ORDER_LABEL, ORDER_FINAL, STATUS_LABEL,
  useCart, lineUnitCents, useCardPayments, CARD_MIN_CENTS,
} from './dashApi';
import { goToCard, CardNote, PaymentPending } from './Payments';
import { Shell, PageHead, Field, Icon, Chip, Skeleton, SkeletonRows, EmptyState, ErrorState, Timeline, useLive, docsOf, docOf, fmtWhen, shortId } from './kit';
import { StoreCoverArt, StoreArt } from './art';
import { CATEGORY_GROUPS, SearchBox, MerchantCard, useApprovedMerchants, catLabel, takeHandOff, storeState, todayHours } from './Home';
import { orderTone, OrderItem } from './Orders';

const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };
const toMerchant = () => { window.location.href = '/merchant'; };

// Checkout details carried from the cart to checkout (this tab only).
const DRAFT_KEY = 'vd_checkout_draft';
function useDraft() {
  const [d, setD] = useState(() => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch (e) { return {}; } });
  const save = (patch) => setD((cur) => {
    const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch (e) { /* ignore */ }
    return next;
  });
  return [d, save];
}

function cartCount(cart) { return cart.items.reduce((s, i) => s + i.qty, 0); }
function cartTotal(cart) { return cart.items.reduce((s, i) => s + i.unitCents * i.qty, 0); }

function CartBar({ go }) {
  const [cart] = useCart();
  const n = cartCount(cart);
  if (!n) return null;
  return (
    <div className="vd-cartbar">
      <button className="vd-btn vd-btn--primary" onClick={() => go('dash-cart')}>
        <span>View cart, {n} item{n === 1 ? '' : 's'}</span><span>{formatJMD(cartTotal(cart))}</span>
      </button>
    </div>
  );
}

// ── Store list ──────────────────────────────────────────────────────────────
export function StoresList({ go, openStore, domains }) {
  const merchants = useApprovedMerchants();
  const [group, setGroup] = useState(() => takeHandOff('vd_store_group') || '');
  const [q, setQ] = useState(() => takeHandOff('vd_store_query') || '');
  const [openOnly, setOpenOnly] = useState(false);
  const term = q.trim().toLowerCase();
  const list = useMemo(() => (merchants.data || [])
    .filter((m) => !group || (CATEGORY_GROUPS.find((g) => g.key === group)?.cats || []).includes(m.category))
    .filter((m) => !openOnly || m.state === 'open')
    .filter((m) => !term || m.name.toLowerCase().includes(term) || catLabel(m.category).toLowerCase().includes(term) || (m.description || '').toLowerCase().includes(term)),
  [merchants.data, group, openOnly, term]);
  const groups = CATEGORY_GROUPS.filter((g) => !g.send);

  return (
    <Shell go={go} active="stores" domains={domains} footer>
      <div className="vd-wrap" style={{ paddingBottom: 90 }}>
        <PageHead title="Order from Stores" sub="Restaurants, groceries and local shops in Mandeville." />
        <SearchBox merchants={merchants.data} openStore={openStore} onQuery={setQ} value={q} />
        <div className="vd-filters" style={{ marginTop: 12 }} role="group" aria-label="Filter stores">
          <button className="vd-filter" aria-pressed={!group} onClick={() => setGroup('')}>All</button>
          {groups.map((g) => <button key={g.key} className="vd-filter" aria-pressed={group === g.key} onClick={() => setGroup(group === g.key ? '' : g.key)}>{g.name}</button>)}
          <button className="vd-filter" aria-pressed={openOnly} onClick={() => setOpenOnly(!openOnly)}>Open now</button>
        </div>
        <p className="vd-field__hint" style={{ margin: '4px 0 16px' }}>We deliver around Mandeville. Your address is checked at checkout.</p>
        {merchants.error ? <ErrorState onRetry={merchants.retry} />
          : merchants.loading ? <div className="vd-merchants">{[0, 1, 2].map((i) => <Skeleton key={i} h={250} r={18} />)}</div>
            : !merchants.data.length ? (
              <EmptyState art={<StoreArt />} title="Local stores are joining VilleDash"
                body="Ordering opens as Mandeville businesses are approved. You can still send a package today."
                action="Send a Package" onAction={() => go('dash-send')} secondary="Become a Merchant Partner" onSecondary={toMerchant} />
            ) : !list.length ? (
              <EmptyState title="No stores match" body={term ? `Nothing matches “${q.trim()}” with these filters.` : 'No stores match these filters right now.'}
                action="Clear filters" onAction={() => { setGroup(''); setOpenOnly(false); setQ(''); }} />
            ) : (
              <div className="vd-merchants">{list.map((m) => <MerchantCard key={m.id} m={m} onOpen={openStore} />)}</div>
            )}
      </div>
      <CartBar go={go} />
    </Shell>
  );
}

// ── Product options sheet ───────────────────────────────────────────────────
function AddSheet({ product, onClose, onAdd, canOrder }) {
  const [qty, setQty] = useState(1);
  const [opts, setOpts] = useState({});
  const [note, setNote] = useState('');
  const groups = product.options || [];
  const missing = groups.filter((g) => g.required && !(opts[g.name] || []).length);
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
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
    <div className="vd-sheet-bg" onClick={onClose}>
      <div className="vd-sheet" role="dialog" aria-modal="true" aria-labelledby="vd-sheet-t" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <h2 id="vd-sheet-t" className="vd-h3" style={{ fontSize: 22 }}>{product.name}</h2>
          <button ref={closeRef} className="vd-iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </div>
        {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 16, marginTop: 12 }} />}
        {product.description && <p style={{ color: 'var(--vd-muted)', marginTop: 8 }}>{product.description}</p>}
        <p style={{ fontWeight: 700, color: 'var(--vd-ink)', marginTop: 6 }}>{formatJMD(product.priceCents)}</p>
        {groups.map((g) => (
          <fieldset key={g.name} style={{ border: 0, padding: 0, margin: '18px 0 0' }}>
            <legend style={{ fontWeight: 650, color: 'var(--vd-ink)', fontSize: 15.5 }}>{g.name}{' '}
              <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--vd-muted)' }}>{g.required ? 'Required' : 'Optional'}{g.maxSelect > 1 ? `, choose up to ${g.maxSelect}` : ''}</span></legend>
            <div className="vd-choice" style={{ marginTop: 8 }}>
              {(g.choices || []).filter((c) => c.available !== false).map((c) => {
                const on = (opts[g.name] || []).includes(c.label);
                return (
                  <button key={c.label} className="vd-opt" role={g.maxSelect > 1 ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => toggle(g, c.label)}>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    {c.priceCents ? <span style={{ color: 'var(--vd-muted)' }}>+{formatJMD(c.priceCents)}</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <Field label="Special instructions (optional)">
          <input className="vd-input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No onions" />
        </Field>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          <div className="vd-qty" aria-label="Quantity">
            <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="One less">−</button>
            <span aria-live="polite">{qty}</span>
            <button onClick={() => setQty(Math.min(99, qty + 1))} aria-label="One more">+</button>
          </div>
          <button className="vd-btn vd-btn--primary" style={{ flex: 1 }} disabled={missing.length > 0}
            onClick={() => onAdd({ qty, options: opts, note: note.trim(), unitCents: unit })}>
            {missing.length ? `Choose ${missing[0].name.toLowerCase()}` : `Add to cart, ${formatJMD(unit * qty)}`}
          </button>
        </div>
        {!canOrder && <p className="vd-field__hint" style={{ marginTop: 10 }}>This store isn’t taking orders right now. You can add items and check out when it opens.</p>}
      </div>
    </div>
  );
}

// ── Store page ──────────────────────────────────────────────────────────────
export function StorePage({ go, storeId, shared, domains }) {
  const { vcConfirm, vcToast } = shared;
  const store = useLive(() => (storeId ? doc(dashDb(), 'merchants', storeId) : null), [storeId], docOf);
  const products = useLive(() => (storeId ? collection(dashDb(), 'merchants', storeId, 'products') : null), [storeId], docsOf);
  const [picking, setPicking] = useState(null);
  const [q, setQ] = useState('');
  const [cart, saveCart] = useCart();
  const wantProduct = useRef(takeHandOff('vd_open_product'));
  useEffect(() => {
    if (!wantProduct.current || !products.data) return;
    const p = products.data.find((x) => x.id === wantProduct.current);
    wantProduct.current = null;
    if (p && p.available !== false) setPicking(p);
  }, [products.data]);

  const m = store.data;
  const shell = (body) => <Shell go={go} active="stores" domains={domains}>{body}<CartBar go={go} /></Shell>;
  if (store.error) return shell(<div className="vd-wrap" style={{ paddingTop: 24 }}><ErrorState onRetry={store.retry} /></div>);
  if (store.loading) return shell(<><Skeleton h={170} r={0} /><div className="vd-wrap" style={{ paddingTop: 16 }}><Skeleton h={120} r={22} /><div style={{ marginTop: 16 }}><SkeletonRows n={4} h={130} /></div></div></>);
  if (!m || m.status !== 'approved') {
    return shell(<div className="vd-wrap" style={{ paddingTop: 24 }}><EmptyState title="This store isn’t available" body="It may have closed its VilleDash page." action="Browse stores" onAction={() => go('dash-stores')} /></div>);
  }
  const state = storeState(m);
  const open = state === 'open';
  const term = q.trim().toLowerCase();
  const visible = (products.data || []).filter((p) => !term || p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term));
  const groups = {};
  visible.forEach((p) => { const k = p.category || 'Menu'; (groups[k] = groups[k] || []).push(p); });
  const sections = Object.keys(groups);
  const slug = (s) => `vd-sec-${s.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  const add = async (p, line) => {
    let c = cart;
    if (c.merchantId && c.merchantId !== m.id && c.items.length) {
      const ok = await vcConfirm(`Your cart has items from ${c.merchantName || 'another store'}. Start a new cart with ${m.name}?`, { confirmText: 'Start new cart' });
      if (!ok) return;
      c = { merchantId: null, items: [] };
    }
    saveCart({ merchantId: m.id, merchantName: m.name, items: [...c.items, { key: `${p.id}-${Date.now()}`, productId: p.id, name: p.name, ...line }] });
    setPicking(null);
    try { vcToast && vcToast(`Added ${p.name} to your cart`); } catch (e) { /* ignore */ }
  };

  return shell(
    <>
      <div className="vd-banner" style={m.coverUrl ? { backgroundImage: `url("${m.coverUrl}")` } : undefined}>{!m.coverUrl && <StoreCoverArt />}</div>
      <div className="vd-wrap" style={{ paddingBottom: 100 }}>
        <div className="vd-storehead">
          <div className="vd-storehead__logo" style={m.logoUrl ? { backgroundImage: `url("${m.logoUrl}")` } : undefined}>{!m.logoUrl && m.name.trim().charAt(0).toUpperCase()}</div>
          <button className="vd-crumb" onClick={() => go('dash-stores')}><Icon name="chevL" size={18} />All stores</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <h1>{m.name}</h1>
            {open ? <Chip tone="ok">Open, delivering now</Chip> : state === 'paused' ? <Chip tone="warn">Not taking orders</Chip> : <Chip tone="off">Closed now</Chip>}
          </div>
          {m.description && <p style={{ color: 'var(--vd-text)', maxWidth: '62ch' }}>{m.description}</p>}
          <div className="vd-storehead__facts">
            <span>{catLabel(m.category)}</span>
            {m.address && <span><Icon name="pin" size={15} style={{ verticalAlign: '-2px' }} /> {m.address}</span>}
            <span><Icon name="clock" size={15} style={{ verticalAlign: '-2px' }} /> {todayHours(m.hours)}</span>
            {m.prepMinutesTypical ? <span>Usually ready in about {m.prepMinutesTypical} min</span> : null}
          </div>
          {!open && <div className="vd-note" style={{ marginTop: 10 }}>{state === 'paused' ? 'This store has paused orders.' : 'This store is closed right now.'} You can browse the menu; checkout opens when they’re taking orders.</div>}
        </div>

        <div className="vd-storenav">
          <div className="vd-search__box" style={{ height: 46 }}>
            <Icon name="search" size={20} />
            <label htmlFor="vd-store-q" className="vd-sr">Search {m.name}</label>
            <input id="vd-store-q" type="search" placeholder={`Search ${m.name}`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {sections.length > 1 && (
            <div className="vd-filters" style={{ marginTop: 8, paddingBottom: 2 }}>
              {sections.map((s) => (
                <button key={s} className="vd-filter" style={{ height: 36 }} onClick={() => document.getElementById(slug(s))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {products.error ? <div style={{ marginTop: 16 }}><ErrorState onRetry={products.retry} /></div>
          : products.loading ? <div style={{ marginTop: 16 }} className="vd-products">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={132} r={18} />)}</div>
            : !products.data.length ? <div style={{ marginTop: 16 }}><EmptyState title="No products listed yet" body="This store is still setting up its menu." action="Browse other stores" onAction={() => go('dash-stores')} /></div>
              : !visible.length ? <div style={{ marginTop: 16 }}><EmptyState title={`Nothing matches “${q.trim()}”`} body="Try another word." action="Clear search" onAction={() => setQ('')} /></div>
                : sections.map((s) => (
                  <section key={s} aria-labelledby={slug(s)}>
                    <h2 id={slug(s)} className="vd-catlabel">{s}</h2>
                    <div className="vd-products">
                      {groups[s].map((p) => {
                        const soldOut = p.available === false || (Number.isInteger(p.stock) && p.stock <= 0);
                        return (
                          <button key={p.id} className={`vd-product${p.imageUrl ? '' : ' vd-product--noimg'}`} disabled={soldOut} onClick={() => setPicking(p)}
                            aria-label={`${p.name}, ${soldOut ? 'sold out' : formatJMD(p.priceCents)}`}>
                            <span style={{ minWidth: 0 }}>
                              <span className="vd-product__name" style={{ display: 'block' }}>{p.name}</span>
                              {p.description && <span className="vd-product__desc">{p.description}</span>}
                              <span className="vd-product__price" style={{ display: 'block' }}>{soldOut ? 'Sold out' : formatJMD(p.priceCents)}</span>
                              {(p.options || []).length > 0 && !soldOut && <span className="vd-field__hint" style={{ marginTop: 2 }}>Options available</span>}
                            </span>
                            <span className="vd-product__img" style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")` } : undefined}>
                              {!soldOut && <span className="vd-product__add" aria-hidden="true">+</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
      </div>
      {picking && <AddSheet product={picking} canOrder={open} onClose={() => setPicking(null)} onAdd={(line) => add(picking, line)} />}
    </>,
  );
}

// ── Server quote for the cart + address ─────────────────────────────────────
function useCartQuote(cart, pos) {
  const [s, setS] = useState({ quote: null, err: '', loading: false });
  const items = cart.items.map((i) => ({ productId: i.productId, qty: i.qty, options: i.options, note: i.note }));
  const key = JSON.stringify(items) + (pos ? `${pos.lat},${pos.lng}` : '');
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!cart.merchantId || !items.length || !pos) { setS({ quote: null, err: '', loading: false }); return undefined; }
    let live = true;
    setS((x) => ({ ...x, loading: true, err: '' }));
    api.marketQuote({ merchantId: cart.merchantId, items, dropoff: pos })
      .then((q) => { if (live) setS({ quote: q, err: '', loading: false }); })
      .catch((e) => { if (live) setS({ quote: null, err: errText(e), loading: false }); });
    return () => { live = false; };
  }, [cart.merchantId, key, n]); // eslint-disable-line
  return { ...s, items, refresh: () => setN((x) => x + 1) };
}

function Totals({ cart, q, card }) {
  return (
    <>
      <div className="vd-row"><span>Items</span><span>{formatJMD(q.quote ? q.quote.subtotalCents : cartTotal(cart))}</span></div>
      <div className="vd-row"><span>Delivery fee{q.quote ? ` (about ${q.quote.distanceKm} km)` : ''}</span><span>{q.quote ? formatJMD(q.quote.deliveryCents) : q.loading ? 'Checking…' : 'Add your address'}</span></div>
      {q.quote?.serviceCents > 0 && <div className="vd-row"><span>Service fee</span><span>{formatJMD(q.quote.serviceCents)}</span></div>}
      {q.quote && <div className="vd-total"><span>{card ? 'Total, by card' : 'Total, cash on delivery'}</span><b>{formatJMD(q.quote.totalCents)}</b></div>}
      {q.quote?.pricingPlaceholder && <div className="vd-warnbox" style={{ marginTop: 12 }}>Test delivery pricing. Final rates haven’t been published yet.</div>}
    </>
  );
}

function EmptyCart({ go, domains }) {
  return (
    <Shell go={go} active="stores" domains={domains}>
      <div className="vd-wrap vd-narrow" style={{ paddingTop: 24, paddingBottom: 40 }}>
        <EmptyState art={<StoreArt />} title="Your cart is empty" body="Add items from a store and they’ll show up here." action="Explore Stores" onAction={() => go('dash-stores')} />
      </div>
    </Shell>
  );
}

// ── Cart ────────────────────────────────────────────────────────────────────
export function Cart({ go, shared, openStore, domains }) {
  const { AddressAutocompleteInput, VilleMap, geocodeLatLng } = shared;
  const [cart, saveCart] = useCart();
  const [draft, saveDraft] = useDraft();
  const drop = draft.drop || {};
  const pos = drop.lat != null ? { lat: drop.lat, lng: drop.lng } : null;
  const q = useCartQuote(cart, pos);
  if (!cart.items.length) return <EmptyCart go={go} domains={domains} />;
  const setDrop = (patch) => saveDraft((d) => ({ ...d, drop: { ...(d.drop || {}), ...(typeof patch === 'function' ? patch(d.drop || {}) : patch) } }));
  const setQty = (key, qty) => saveCart({ ...cart, items: qty <= 0 ? cart.items.filter((i) => i.key !== key) : cart.items.map((i) => (i.key === key ? { ...i, qty } : i)) });
  const setPin = async (lat, lng) => {
    setDrop({ lat, lng });
    try { const a = await geocodeLatLng(lat, lng); if (a) setDrop({ address: a }); } catch (e) { /* keep pin */ }
  };
  return (
    <Shell go={go} active="stores" domains={domains}>
      <div className="vd-wrap">
        <PageHead title="Your cart" sub={`From ${cart.merchantName || 'one store'}`} crumb={`Back to ${cart.merchantName || 'store'}`} onCrumb={() => openStore(cart.merchantId)} />
        <div className="vd-split" style={{ paddingBottom: 40 }}>
          <div>
            <div className="vd-panel">
              <div className="vd-panel__title">Items</div>
              {cart.items.map((i) => {
                const opts = Object.values(i.options || {}).flat();
                return (
                  <div key={i.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 12px', padding: '12px 0', borderBottom: '1px solid var(--vd-line)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, color: 'var(--vd-ink)' }}>{i.name}</div>
                      {opts.length > 0 && <div className="vd-field__hint" style={{ marginTop: 0 }}>{opts.join(', ')}</div>}
                      {i.note && <div className="vd-field__hint" style={{ marginTop: 0 }}>Note: {i.note}</div>}
                    </div>
                    <div style={{ fontWeight: 650, color: 'var(--vd-ink)', textAlign: 'right' }}>{formatJMD(i.unitCents * i.qty)}</div>
                    <div className="vd-qty vd-qty--sm" aria-label={`Quantity of ${i.name}`}>
                      <button onClick={() => setQty(i.key, i.qty - 1)} aria-label={i.qty === 1 ? `Remove ${i.name}` : 'One less'}>−</button>
                      <span>{i.qty}</span>
                      <button onClick={() => setQty(i.key, Math.min(99, i.qty + 1))} aria-label="One more">+</button>
                    </div>
                    <button className="vd-link" style={{ justifySelf: 'end', color: 'var(--vd-red)' }} onClick={() => setQty(i.key, 0)}>Remove</button>
                  </div>
                );
              })}
              <button className="vd-link" style={{ marginTop: 12 }} onClick={() => openStore(cart.merchantId)}>Add more items</button>
            </div>
            <div className="vd-panel">
              <div className="vd-panel__title">Delivery address</div>
              <Field label="Address" hint={pos ? 'Pin set. Tap the map to adjust it.' : 'Search your address or tap the map.'}>
                <div>
                  <AddressAutocompleteInput value={drop.address || ''} onChange={(t) => setDrop({ address: t })}
                    onPlaceSelect={(p) => setDrop({ address: p.formattedAddress || p.name, lat: p.lat, lng: p.lng })} placeholder="Your delivery address" />
                </div>
              </Field>
              <div className="vd-map">
                <VilleMap height={220} center={pos || MANDEVILLE} zoom={pos ? 16 : 13} markers={pos ? [{ position: pos, title: 'Deliver here' }] : []}
                  onClick={(e) => setPin(e.latLng.lat(), e.latLng.lng())} />
              </div>
            </div>
          </div>
          <aside className="vd-split__aside">
            <div className="vd-panel">
              <div className="vd-panel__title">Summary</div>
              <Totals cart={cart} q={q} />
              {q.err && <div className="vd-errbox" role="alert">{q.err} <button className="vd-link" onClick={q.refresh}>Try again</button></div>}
              <button className="vd-btn vd-btn--primary vd-btn--block" style={{ marginTop: 16 }} disabled={!q.quote} onClick={() => go('dash-checkout')}>
                {!pos ? 'Add your address to continue' : q.loading ? 'Checking prices…' : 'Continue to checkout'}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

// ── Checkout ────────────────────────────────────────────────────────────────
export function Checkout({ go, user, openOrder, domains }) {
  const [cart, saveCart] = useCart();
  const [draft, saveDraft] = useDraft();
  const drop = draft.drop || {};
  const pos = drop.lat != null ? { lat: drop.lat, lng: drop.lng } : null;
  const q = useCartQuote(cart, pos);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keyRef = useRef(newRequestKey());
  const { cardOn, sandbox } = useCardPayments(user?.uid);
  const [method, setMethod] = useState('cash');
  if (!cart.items.length) return <EmptyCart go={go} domains={domains} />;
  if (!pos) { setTimeout(() => go('dash-cart'), 0); return null; }
  const canCard = cardOn && q.quote && q.quote.totalCents >= CARD_MIN_CENTS;
  const byCard = method === 'card' && canCard;
  const setDrop = (patch) => saveDraft((d) => ({ ...d, drop: { ...(d.drop || {}), ...patch } }));
  const phone = draft.phone ?? '';

  const place = async () => {
    if (busy || !q.quote) return;
    setBusy(true); setErr('');
    try {
      const r = await api.marketCreate({
        idempotencyKey: keyRef.current, merchantId: cart.merchantId, items: q.items, expectedTotalCents: q.quote.totalCents,
        dropoff: { ...drop, address: drop.address || 'Pinned location' }, phone, note: draft.note || '',
        paymentMethod: byCard ? 'card' : 'cash',
      });
      saveCart({ merchantId: null, items: [] });
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      if (r.needsPayment) {
        try { await goToCard('order', r.orderId); return; } catch (e) { /* the order page offers card again or cash */ }
      }
      openOrder(r.orderId);
    } catch (e) {
      if (e.code === 'functions/aborted' && e.details?.totalCents) {
        setErr('Prices or availability changed. Check the new total and place your order again.');
        keyRef.current = newRequestKey();
        q.refresh();
      } else setErr(errText(e));
    }
    setBusy(false);
  };

  return (
    <Shell go={go} active="stores" domains={domains} tabbar={false}>
      <div className="vd-wrap">
        <PageHead title="Checkout" sub={`Order from ${cart.merchantName || 'store'}`} crumb="Back to cart" onCrumb={() => go('dash-cart')} />
        <div className="vd-split" style={{ paddingBottom: 110 }}>
          <div>
            <div className="vd-panel">
              <div className="vd-panel__title">Delivering to</div>
              <p style={{ color: 'var(--vd-ink)', fontWeight: 600 }}>{user?.name || 'You'}</p>
              <p>{drop.address || 'Pinned location'}</p>
              <button className="vd-link" onClick={() => go('dash-cart')}>Change address</button>
              <Field label="Building or landmark (optional)">
                <input className="vd-input" value={drop.landmark || ''} maxLength={150} onChange={(e) => setDrop({ landmark: e.target.value })} placeholder="e.g. Blue house, second gate" />
              </Field>
              <Field label="Phone for the rider" hint="Leave blank to use the phone on your account.">
                <input className="vd-input" type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={20} onChange={(e) => saveDraft({ phone: e.target.value })} placeholder="876…" />
              </Field>
              <Field label="Delivery instructions (optional)">
                <textarea className="vd-input" value={drop.instructions || ''} maxLength={300} onChange={(e) => setDrop({ instructions: e.target.value })} placeholder="e.g. Call when you reach the gate" />
              </Field>
              <Field label="Note for the store (optional)">
                <input className="vd-input" value={draft.note || ''} maxLength={300} onChange={(e) => saveDraft({ note: e.target.value })} />
              </Field>
            </div>
            <div className="vd-panel">
              <div className="vd-panel__title">Payment</div>
              <div className="vd-choice" role="radiogroup" aria-label="Payment">
                <button className="vd-opt" role="radio" aria-checked={!byCard} onClick={() => setMethod('cash')} style={canCard ? undefined : { cursor: 'default' }}>
                  <span><b>Cash on delivery</b><small>Pay the rider when your order arrives.</small></span>
                </button>
                {canCard && (
                  <button className="vd-opt" role="radio" aria-checked={byCard} onClick={() => setMethod('card')}>
                    <span><b>Card now</b><small>Visa or Mastercard. The store gets your order once it’s paid.</small></span>
                  </button>
                )}
              </div>
              {byCard && <CardNote sandbox={sandbox} />}
            </div>
          </div>
          <aside className="vd-split__aside">
            <div className="vd-panel">
              <div className="vd-panel__title">Review your order</div>
              {cart.items.map((i) => (
                <div key={i.key} className="vd-row"><span>{i.qty} × {i.name}</span><span>{formatJMD(i.unitCents * i.qty)}</span></div>
              ))}
              <div style={{ borderTop: '1px solid var(--vd-line)', margin: '8px 0 0', paddingTop: 6 }}><Totals cart={cart} q={q} card={byCard} /></div>
              {q.err && <div className="vd-errbox" role="alert">{q.err} <button className="vd-link" onClick={q.refresh}>Try again</button></div>}
              {err && <div className="vd-errbox" role="alert">{err}</div>}
              <p className="vd-field__hint" style={{ marginTop: 12 }}>The store confirms your order before preparing it. You can cancel until they start preparing.</p>
            </div>
          </aside>
        </div>
      </div>
      <div className="vd-cartbar vd-cartbar--flush">
        <button className="vd-btn vd-btn--primary" disabled={!q.quote || busy} onClick={place}>
          <span>{busy ? (byCard ? 'Opening WiPay…' : 'Placing order…') : q.loading ? 'Checking prices…' : byCard ? 'Pay by card' : 'Place order'}</span>
          <span>{q.quote ? formatJMD(q.quote.totalCents) : ''}</span>
        </button>
      </div>
    </Shell>
  );
}

// ── Order progress ──────────────────────────────────────────────────────────
const ON_WAY = ['collected', 'to_dropoff', 'at_dropoff'];
function orderTimeline(o, del) {
  const steps = [
    ['awaiting_merchant', 'Order sent to the store'],
    ['accepted', 'Accepted'],
    ['preparing', 'Being prepared'],
    ['ready', 'Ready for pickup'],
    ['collected', 'On the way'],
    ['delivered', 'Delivered'],
  ];
  const order = ['awaiting_merchant', 'accepted', 'preparing', 'ready', 'collected', 'delivered'];
  let idx = order.indexOf(o.status);
  if (del && ON_WAY.includes(del.status) && idx < 4) idx = 4;
  return steps.map(([k, t], i) => {
    let sub = null;
    if (k === 'accepted' && o.prepMinutes && i <= idx) sub = `The store expects about ${o.prepMinutes} min to prepare it`;
    if (k === 'collected' && del?.status === 'at_dropoff') sub = 'Your rider has arrived';
    if (k === 'awaiting_merchant' && i === idx) sub = 'Waiting for the store to confirm';
    return { key: k, title: t, sub, state: i < idx || (i === idx && k === 'delivered') ? 'done' : i === idx ? 'now' : 'todo' };
  });
}

export function OrderTrack({ go, orderId, shared, openDelivery, domains }) {
  const { VilleMap, vcConfirm } = shared;
  const ord = useLive(() => (orderId ? doc(dashDb(), 'dash_orders', orderId) : null), [orderId], docOf);
  const [pin, setPin] = useState(null);
  const [del, setDel] = useState(null);
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState('');
  const o = ord.data;
  useEffect(() => {
    if (!orderId) return undefined;
    return onSnapshot(doc(dashDb(), 'dash_orders', orderId, 'customer', 'pin'), (s) => setPin(s.exists() ? s.data().pin : null), () => {});
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

  const shell = (body) => <Shell go={go} active="orders" domains={domains}><div className="vd-wrap">{body}</div></Shell>;
  if (ord.error) return shell(<div style={{ paddingTop: 24 }}><ErrorState onRetry={ord.retry} /></div>);
  if (ord.loading) return shell(<div style={{ paddingTop: 24 }}><Skeleton h={34} w="60%" /><div style={{ marginTop: 16 }}><SkeletonRows n={3} h={140} /></div></div>);
  if (!o) return shell(<div style={{ paddingTop: 24 }}><EmptyState title="We couldn’t find this order" action="My Orders" onAction={() => go('dash-history')} /></div>);

  const fresh = loc?.at?.toMillis && Date.now() - loc.at.toMillis() < 120000;
  const ended = ['rejected', 'cancelled', 'failed'].includes(o.status);
  const cancel = async () => {
    if (!(await vcConfirm('Cancel this order?', { confirmText: 'Yes, cancel', danger: true }))) return;
    setErr('');
    try { await api.marketCancel({ orderId: o.id, reason: 'Cancelled by customer' }); } catch (e) { setErr(errText(e)); }
  };
  const chip = <Chip tone={orderTone(o.status)}>{ORDER_LABEL[o.status] || o.status}</Chip>;
  const paidCard = o.payment && o.payment.method === 'card';

  return shell(
    <>
      <PageHead title={o.merchantName} sub={`Order ${shortId(o.id)}, placed ${fmtWhen(o.createdAt)}`} crumb="My Orders" onCrumb={() => go('dash-history')} right={chip} />
      <div className="vd-split" style={{ paddingBottom: 40 }}>
        <div className="vd-stack">
          {tracking && (
            <div>
              <div className="vd-map" style={{ marginTop: 0 }}>
                <VilleMap height={240} center={fresh ? { lat: loc.lat, lng: loc.lng } : { lat: o.dropoff.lat, lng: o.dropoff.lng }} zoom={14}
                  markers={[{ position: { lat: del.pickup.lat, lng: del.pickup.lng }, title: o.merchantName }, { position: { lat: o.dropoff.lat, lng: o.dropoff.lng }, title: 'You' },
                    ...(fresh ? [{ position: { lat: loc.lat, lng: loc.lng }, title: 'Rider' }] : [])]} />
              </div>
              {!fresh && <p className="vd-field__hint">Live rider location isn’t available right now. Status updates still arrive here.</p>}
            </div>
          )}
          {o.status === 'awaiting_payment' && <PaymentPending kind="order" id={o.id} target={o} />}
          {!ORDER_FINAL.includes(o.status) && o.status !== 'awaiting_payment' && pin && (
            <div className="vd-pin">
              <div style={{ fontWeight: 650, color: 'var(--vd-deep)' }}>Your delivery PIN</div>
              <div className="vd-pin__code" aria-label={`PIN ${String(pin).split('').join(' ')}`}>{pin}</div>
              <p>Give it to the rider only after you have your order.</p>
            </div>
          )}
          {o.status === 'rejected' && <div className="vd-errbox" style={{ marginTop: 0 }}>{o.merchantName} couldn’t take this order{o.rejectReason ? `: ${o.rejectReason}` : ''}. You haven’t been charged.</div>}
          <div className="vd-panel">
            <div className="vd-panel__title">Progress</div>
            {ended ? <p>{ORDER_LABEL[o.status]}.{o.status === 'failed' ? ' Support will contact you.' : ''}</p> : <Timeline items={orderTimeline(o, del)} />}
            {del?.riderName && !ended && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--vd-line)' }}>
                <div>
                  <div style={{ fontWeight: 650, color: 'var(--vd-ink)' }}>Rider: {del.riderName}</div>
                  <div className="vd-field__hint" style={{ marginTop: 0 }}>{[del.riderPlate && `Motorcycle ${del.riderPlate}`, STATUS_LABEL[del.status]].filter(Boolean).join('. ')}</div>
                </div>
                {del.riderPhone && o.status !== 'delivered' && <a className="vd-btn vd-btn--secondary vd-btn--sm" href={`tel:${del.riderPhone}`}><Icon name="phone" size={17} /> Call</a>}
              </div>
            )}
          </div>
        </div>
        <aside className="vd-split__aside">
          <div className="vd-panel">
            <div className="vd-panel__title">Receipt</div>
            {o.items.map((i, n) => (
              <div key={n} className="vd-row"><span>{i.qty} × {i.name}{i.options?.length ? ` (${i.options.map((x) => x.label).join(', ')})` : ''}</span><span>{formatJMD(i.lineCents)}</span></div>
            ))}
            <div className="vd-row"><span>Delivery fee</span><span>{formatJMD(o.deliveryCents)}</span></div>
            {o.serviceCents > 0 && <div className="vd-row"><span>Service fee</span><span>{formatJMD(o.serviceCents)}</span></div>}
            <div className="vd-total"><span>{paidCard ? (o.payment.status === 'paid' ? 'Total, paid by card' : 'Total, by card') : 'Total, cash'}</span><b>{formatJMD(o.totalCents)}</b></div>
            {paidCard && ['refund_due', 'refunded'].includes(o.payment.status) && <p className="vd-note" style={{ marginTop: 10 }}>{o.payment.status === 'refunded' ? `${formatJMD(o.payment.refundedCents || o.totalCents)} was refunded to your card.` : 'This order didn’t go ahead. VilleDash is reviewing a refund of your card payment.'}</p>}
            <p className="vd-field__hint">Delivering to {o.dropoff?.address}</p>
          </div>
          {err && <div className="vd-errbox" role="alert">{err}</div>}
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {['awaiting_payment', 'awaiting_merchant', 'accepted'].includes(o.status) && <button className="vd-btn vd-btn--danger vd-btn--block" onClick={cancel}>Cancel order</button>}
            {o.deliveryId && <button className="vd-btn vd-btn--secondary vd-btn--block" onClick={() => openDelivery(o.deliveryId)}>Delivery details or report a problem</button>}
          </div>
        </aside>
      </div>
    </>,
  );
}

// ── Used by the VILLE hub ───────────────────────────────────────────────────
export function useMyOrders(uid, max = 30) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    const qy = query(collection(dashDb(), 'dash_orders'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(max));
    return onSnapshot(qy, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [uid, max]);
  return list;
}
export function OrderRow({ o, onOpen }) {
  return <div className="vd-root" style={{ minHeight: 0, padding: 0, background: 'transparent', marginBottom: 10 }}><OrderItem o={o} onOpen={onOpen} /></div>;
}

