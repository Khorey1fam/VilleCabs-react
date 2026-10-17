// VilleDash home (signed-in customers) and the public VilleDash landing page.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { dashDb, MERCHANT_CATEGORIES, isOpenAt, hoursToday, formatJMD } from './dashApi';
import { Shell, Icon, Chip, Skeleton, EmptyState, ErrorState, useLive, docsOf } from './kit';
import { HeroArt, ParcelArt, StoreArt, StoreCoverArt, EmptyRouteArt } from './art';
import imgFood from './img/cat-food.webp';
import imgGroceries from './img/cat-groceries.webp';
import imgConvenience from './img/cat-convenience.webp';
import imgShops from './img/cat-shops.webp';
import imgGifts from './img/cat-gifts.webp';
import imgPackages from './img/cat-packages.webp';
import { ActiveDeliveries, useActivity } from './Orders';

// ── Shared data ─────────────────────────────────────────────────────────────
export const CATEGORY_GROUPS = [
  { key: 'food', name: 'Food & drinks', cats: ['restaurant', 'fast_food', 'cafe_bakery'] },
  { key: 'groceries', name: 'Groceries', cats: ['supermarket'] },
  { key: 'convenience', name: 'Convenience', cats: ['convenience'] },
  { key: 'shops', name: 'Local shops', cats: ['boutique', 'retail'] },
  { key: 'gifts', name: 'Gifts', cats: ['gift_shop'] },
  { key: 'packages', name: 'Packages', send: true },
];
export const catLabel = (k) => (MERCHANT_CATEGORIES.find(([x]) => x === k) || [k, 'Store'])[1];
export const groupOf = (cat) => CATEGORY_GROUPS.find((g) => (g.cats || []).includes(cat));

// Hand-off between screens (store filter, product to open, orders filter).
export function handOff(key, value) { try { sessionStorage.setItem(key, value); } catch (e) { /* ignore */ } }
export function takeHandOff(key) {
  try { const v = sessionStorage.getItem(key); sessionStorage.removeItem(key); return v; } catch (e) { return null; }
}

export function todayHours(hours) {
  const t = hoursToday(hours);
  return t === 'Closed today' || t === 'Open 24 hours' ? `${t}${t.startsWith('Open') ? ' today' : ''}` : `Today ${t}`;
}

export function storeState(m) {
  if (m.isAcceptingOrders === false) return 'paused';
  return isOpenAt(m.hours) ? 'open' : 'closed';
}

export function useApprovedMerchants() {
  return useLive(() => query(collection(dashDb(), 'merchants'), where('status', '==', 'approved')), [],
    (s) => docsOf(s).map((m) => ({ ...m, state: storeState(m) }))
      .sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || a.name.localeCompare(b.name)));
}

// Products of every approved store, fetched once when someone starts searching.
export function useProductIndex(merchants, enabled) {
  const [s, setS] = useState({ items: null, loading: false, error: null });
  const key = (merchants || []).map((m) => m.id).join(',');
  useEffect(() => {
    if (!enabled || !merchants || s.items || s.loading) return;
    let live = true;
    setS({ items: null, loading: true, error: null });
    Promise.all(merchants.slice(0, 80).map((m) => getDocs(collection(dashDb(), 'merchants', m.id, 'products'))
      .then((snap) => docsOf(snap).filter((p) => p.available !== false).map((p) => ({ ...p, merchantId: m.id, merchantName: m.name })))
      .catch(() => [])))
      .then((lists) => { if (live) setS({ items: lists.flat(), loading: false, error: null }); })
      .catch((e) => { if (live) setS({ items: null, loading: false, error: e }); });
    return () => { live = false; };
  }, [enabled, key]); // eslint-disable-line
  return s;
}

// ── Search ──────────────────────────────────────────────────────────────────
export function SearchBox({ merchants, openStore, onQuery, value, autoFocus }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [wanted, setWanted] = useState(false);
  const boxRef = useRef(null);
  const idx = useProductIndex(merchants, wanted);
  const term = q.trim().toLowerCase();

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const results = useMemo(() => {
    if (term.length < 2) return [];
    const ms = (merchants || []).filter((m) => m.name.toLowerCase().includes(term) || catLabel(m.category).toLowerCase().includes(term)
      || (groupOf(m.category)?.name || '').toLowerCase().includes(term)).slice(0, 5)
      .map((m) => ({ kind: 'store', id: m.id, title: m.name, sub: `${catLabel(m.category)}${m.state === 'open' ? '' : m.state === 'paused' ? ', paused' : ', closed now'}`, img: m.logoUrl, merchantId: m.id }));
    const ps = (idx.items || []).filter((p) => p.name.toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term)).slice(0, 8)
      .map((p) => ({ kind: 'product', id: `${p.merchantId}/${p.id}`, productId: p.id, title: p.name, sub: `${formatJMD(p.priceCents)} at ${p.merchantName}`, img: p.imageUrl, merchantId: p.merchantId }));
    return [...ms, ...ps];
  }, [term, merchants, idx.items]);

  const choose = (r) => {
    setOpen(false);
    if (r.kind === 'product') handOff('vd_open_product', r.productId);
    openStore(r.merchantId);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setSel((x) => Math.min(results.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { if (open && results[sel]) { e.preventDefault(); choose(results[sel]); } else if (onQuery) onQuery(q.trim()); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const stores = results.filter((r) => r.kind === 'store');
  const products = results.filter((r) => r.kind === 'product');
  const showList = open && term.length >= 2;

  return (
    <div className="vd-search" ref={boxRef}>
      <div className="vd-search__box">
        <Icon name="search" />
        <label htmlFor="vd-search" className="vd-sr">Search restaurants, stores or products</label>
        <input id="vd-search" type="search" role="combobox" aria-expanded={showList} aria-controls="vd-suggest" aria-autocomplete="list"
          autoComplete="off" autoFocus={autoFocus} placeholder="Search restaurants, stores or products…" value={q}
          onFocus={() => { setWanted(true); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); setWanted(true); if (onQuery) onQuery(e.target.value.trim()); }}
          onKeyDown={onKey} />
        {q && <button className="vd-search__clear" onClick={() => { setQ(''); if (onQuery) onQuery(''); }}>Clear</button>}
      </div>
      {showList && (
        <div className="vd-suggest" id="vd-suggest" role="listbox">
          {merchants === undefined || (idx.loading && !results.length) ? (
            <div className="vd-suggest__empty" role="status">Searching stores and products…</div>
          ) : results.length === 0 ? (
            <div className="vd-suggest__empty">No stores or products match “{q.trim()}”. Try a shorter word or browse by category.</div>
          ) : (
            <>
              {stores.length > 0 && <div className="vd-suggest__group">Stores</div>}
              {stores.map((r) => <SuggestItem key={r.id} r={r} on={results.indexOf(r) === sel} onPick={() => choose(r)} />)}
              {products.length > 0 && <div className="vd-suggest__group">Products</div>}
              {products.map((r) => <SuggestItem key={r.id} r={r} on={results.indexOf(r) === sel} onPick={() => choose(r)} />)}
              {idx.loading && <div className="vd-suggest__empty">Still searching products…</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
function SuggestItem({ r, on, onPick }) {
  return (
    <button className="vd-suggest__item" role="option" aria-selected={on} onClick={onPick}>
      <span className="vd-suggest__thumb" style={r.img ? { backgroundImage: `url("${r.img}")` } : undefined}>{!r.img && <Icon name={r.kind === 'store' ? 'store' : 'bag'} size={18} />}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{r.title}</span>
        <span className="vd-suggest__meta">{r.sub}</span>
      </span>
    </button>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────
export function MerchantCard({ m, onOpen, preview }) {
  const Tag = preview ? 'div' : 'button';
  const chip = m.state === 'open' ? <Chip tone="ok">Open, delivering now</Chip>
    : m.state === 'paused' ? <Chip tone="warn">Not taking orders</Chip> : <Chip tone="off">Closed now</Chip>;
  return (
    <Tag className={`vd-merchant${m.state === 'open' ? '' : ' vd-merchant--closed'}`} onClick={preview ? undefined : () => onOpen(m.id)}>
      <div className="vd-merchant__cover" style={m.coverUrl ? { backgroundImage: `url("${m.coverUrl}")` } : undefined}>
        {!m.coverUrl && <StoreCoverArt />}
        <div className="vd-merchant__logo" style={m.logoUrl ? { backgroundImage: `url("${m.logoUrl}")` } : undefined}>{!m.logoUrl && (m.name || '?').trim().charAt(0).toUpperCase()}</div>
      </div>
      <div className="vd-merchant__body">
        <span className="vd-merchant__name">{m.name}</span>
        <span className="vd-merchant__meta">{catLabel(m.category)}{m.address ? `, ${String(m.address).split(',')[0]}` : ''}</span>
        <span className="vd-merchant__meta">{todayHours(m.hours)}{m.prepMinutesTypical ? `. Usually ready in about ${m.prepMinutesTypical} min` : ''}</span>
        <span className="vd-merchant__foot">{preview ? <Chip tone="brand" plain>Ordering opens at launch</Chip> : chip}</span>
      </div>
    </Tag>
  );
}

function ServiceCards({ onSend, onStores, prelaunch }) {
  return (
    <div className="vd-services">
      <button className="vd-service" onClick={onSend}>
        <div><h3>Send a Package</h3><p>Documents, gifts and parcels delivered across our service area.</p></div>
        <div className="vd-service__art"><ParcelArt /></div>
        <span className="vd-service__cta">{prelaunch ? 'Get notified at launch' : 'Send a Package'}</span>
      </button>
      <button className="vd-service" onClick={onStores}>
        <div><h3>Order from Stores</h3><p>Explore restaurants, groceries and local favourites.</p></div>
        <div className="vd-service__art"><StoreArt /></div>
        <span className="vd-service__cta">{prelaunch ? 'Get notified at launch' : 'Explore Stores'}</span>
      </button>
    </div>
  );
}

// Category photos: supplied images, cropped and converted to WebP (~6–18 KB each).
const CATEGORY_IMG = {
  food: [imgFood, 'A burger, fries and an iced drink'],
  groceries: [imgGroceries, 'A tote bag of fresh vegetables, milk, bread and bananas'],
  convenience: [imgConvenience, 'Bottled water, a soft drink, chips, soap and toilet paper'],
  shops: [imgShops, 'Shopping bags, a white handbag and sunglasses'],
  gifts: [imgGifts, 'A wrapped gift box with a purple ribbon beside a bouquet of flowers'],
  packages: [imgPackages, 'Stacked parcels marked with the VilleDash logo'],
};

function Categories({ merchants, onPick }) {
  const live = (g) => g.send || (merchants || []).some((m) => (g.cats || []).includes(m.category));
  return (
    <div className="vd-cats">
      {CATEGORY_GROUPS.map((g) => {
        const on = merchants === undefined ? true : live(g);
        const [src, alt] = CATEGORY_IMG[g.key];
        return (
          <button key={g.key} className="vd-cat" aria-disabled={!on} onClick={() => on && onPick(g)}
            aria-label={on ? (g.send ? `${g.name}: send a package` : `${g.name}: see stores`) : `${g.name}, coming soon`}>
            <span className="vd-cat__art">
              <img src={src} alt={alt} width="300" height="300" loading="lazy" decoding="async" />
              {!on && <span className="vd-cat__soon">Coming soon</span>}
            </span>
            <span className="vd-cat__row">
              <span className="vd-cat__name">{g.name}</span>
              {on && <span className="vd-cat__go" aria-hidden="true"><Icon name="chevR" size={16} stroke={2.4} /></span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HowItWorks() {
  const [tab, setTab] = useState('stores');
  const steps = tab === 'stores'
    ? [['Explore local businesses', 'Browse Mandeville restaurants, grocers and shops, and see who’s open now.'],
      ['Place your order', 'Pick your items. The store confirms and starts preparing.'],
      ['Track your delivery', 'Follow your rider, then give them your PIN when the order arrives.']]
    : [['Enter pickup and destination', 'Search an address or drop a pin on the map.'],
      ['Confirm your delivery', 'Tell us what you’re sending and see the price before you book.'],
      ['Track your package', 'Watch it move, and the recipient confirms with a PIN.']];
  return (
    <>
      <div className="vd-tabs" role="tablist" aria-label="How it works for">
        {[['stores', 'Store orders'], ['parcels', 'Packages']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <ol className="vd-how">
        {steps.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
      </ol>
    </>
  );
}

function Partner({ onJoin }) {
  return (
    <div className="vd-partner">
      <div>
        <h2>Grow Your Business with VilleDash</h2>
        <p>Reach more local customers with convenient delivery.</p>
        <ul className="vd-partner__list">
          <li>Your own store page with photos, menu and opening hours</li>
          <li>Accept orders from your phone and set your own prep time</li>
          <li>Riders collect from your counter</li>
        </ul>
      </div>
      <div><button className="vd-btn vd-btn--onDark" onClick={onJoin}>Become a Merchant Partner</button></div>
    </div>
  );
}

function Hero({ onStores, onSend, extra }) {
  return (
    <section className="vd-hero">
      <div className="vd-wrap vd-hero__grid">
        <div>
          <span className="vd-loc"><Icon name="pin" size={16} /> Mandeville, Jamaica</span>
          <h1>Your City, Delivered.</h1>
          <p className="vd-hero__lede">From your favourite local spots to important packages, VilleDash brings Mandeville to your doorstep.</p>
          {extra || (
            <div className="vd-hero__ctas">
              <button className="vd-btn vd-btn--primary" onClick={onStores}>Order from Stores</button>
              <button className="vd-btn vd-btn--secondary" onClick={onSend}>Send a Package</button>
            </div>
          )}
        </div>
        <div className="vd-hero__art"><HeroArt /></div>
      </div>
    </section>
  );
}

function Favourites({ merchants, openStore, preview, onRecruit }) {
  if (merchants.error) return <ErrorState onRetry={merchants.retry} />;
  if (merchants.loading) {
    return <div className="vd-merchants">{[0, 1, 2].map((i) => <Skeleton key={i} h={250} r={18} />)}</div>;
  }
  if (!merchants.data.length) {
    return (
      <EmptyState art={<StoreArt />} title="Local stores are joining VilleDash"
        body="Mandeville businesses are being approved now. Run a shop or restaurant? Be one of the first."
        action="Become a Merchant Partner" onAction={onRecruit} />
    );
  }
  return (
    <div className="vd-merchants">
      {merchants.data.slice(0, 6).map((m) => <MerchantCard key={m.id} m={m} onOpen={openStore} preview={preview} />)}
    </div>
  );
}

const toMerchant = () => { window.location.href = '/merchant'; };

// ── Signed-in home ──────────────────────────────────────────────────────────
export function DashHome({ go, user, openDelivery, openOrder, openStore, domains }) {
  const merchants = useApprovedMerchants();
  const activity = useActivity(user?.uid);
  const activeCount = activity.active.length;
  const pickCategory = (g) => {
    if (g.send) return go('dash-send');
    handOff('vd_store_group', g.key);
    go('dash-stores');
  };
  const searchQuery = (q) => { if (q.length > 1) handOff('vd_store_query', q); };
  return (
    <Shell go={go} active="home" footer domains={domains}>
      {activeCount > 0 && (
        <div className="vd-wrap" style={{ paddingTop: 16 }}>
          <ActiveDeliveries activity={activity} openDelivery={openDelivery} openOrder={openOrder}
            onMore={() => { handOff('vd_orders_filter', 'active'); go('dash-history'); }} />
        </div>
      )}
      <Hero onStores={() => go('dash-stores')} onSend={() => go('dash-send')} />

      <section className="vd-section" style={{ paddingTop: 20 }}>
        <div className="vd-wrap">
          <ServiceCards onSend={() => go('dash-send')} onStores={() => go('dash-stores')} />
          <div style={{ marginTop: 22 }}>
            <SearchBox merchants={merchants.data} openStore={openStore} onQuery={searchQuery} />
          </div>
        </div>
      </section>

      <section className="vd-section vd-section--lav">
        <div className="vd-wrap">
          <div className="vd-sec-head"><h2 className="vd-h2">What would you like delivered?</h2></div>
          <Categories merchants={merchants.data} onPick={pickCategory} />
        </div>
      </section>

      <section className="vd-section">
        <div className="vd-wrap">
          <div className="vd-sec-head">
            <div><h2 className="vd-h2">Discover Local Favourites</h2><p className="vd-lede">Approved Mandeville businesses delivering through VilleDash.</p></div>
            {merchants.data && merchants.data.length > 0 && <button className="vd-link" onClick={() => go('dash-stores')}>See all stores</button>}
          </div>
          <Favourites merchants={merchants} openStore={openStore} onRecruit={toMerchant} />
        </div>
      </section>

      <section className="vd-section vd-section--lav">
        <div className="vd-wrap">
          <h2 className="vd-h2" style={{ marginBottom: 16 }}>How VilleDash works</h2>
          <HowItWorks />
        </div>
      </section>

      {activeCount === 0 && (
        <section className="vd-section">
          <div className="vd-wrap">
            <h2 className="vd-h2" style={{ marginBottom: 16 }}>Your deliveries</h2>
            {activity.error ? <ErrorState onRetry={activity.retry} />
              : activity.loading ? <Skeleton h={120} r={20} />
                : <EmptyState art={<EmptyRouteArt />} title="No active deliveries yet. Ready to send something?"
                  body="Packages and store orders you place show up here so you can track them."
                  action="Send a Package" onAction={() => go('dash-send')} secondary="My Orders" onSecondary={() => go('dash-history')} />}
          </div>
        </section>
      )}

      <section className="vd-section" style={{ paddingTop: activeCount === 0 ? 0 : undefined }}>
        <div className="vd-wrap"><Partner onJoin={toMerchant} /></div>
      </section>
    </Shell>
  );
}

// ── Public landing (signed-out visitors on the VilleDash domain) ────────────
export function DashPublic({ go, domains, launched }) {
  const merchants = useApprovedMerchants();
  const formRef = useRef(null);
  const toForm = () => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => formRef.current?.querySelector('input')?.focus(), 400); };
  const signIn = () => go('customer-login');
  const act = launched ? signIn : toForm;
  return (
    <Shell go={go} publicMode onSignIn={signIn} footer domains={domains}>
      <Hero onStores={act} onSend={act} extra={launched ? (
        <div className="vd-hero__ctas">
          <button className="vd-btn vd-btn--primary" onClick={signIn}>Order from Stores</button>
          <button className="vd-btn vd-btn--secondary" onClick={signIn}>Send a Package</button>
          <p className="vd-hero__note" style={{ flexBasis: '100%' }}>Sign in or <button className="vd-link" onClick={() => go('customer-signup')}>create a VILLE account</button>. One account works for VilleCabs, VilleDash and VilleEvents.</p>
        </div>
      ) : (
        <div ref={formRef}>
          <span className="vd-launch"><Icon name="clock" size={18} /> VilleDash is launching soon in Mandeville</span>
          <InterestForm />
        </div>
      )} />

      <section className="vd-section" style={{ paddingTop: 20 }}>
        <div className="vd-wrap"><ServiceCards onSend={act} onStores={act} prelaunch={!launched} /></div>
      </section>

      <section className="vd-section vd-section--lav">
        <div className="vd-wrap">
          <div className="vd-sec-head"><h2 className="vd-h2">What would you like delivered?</h2></div>
          <Categories merchants={merchants.data} onPick={act} />
        </div>
      </section>

      {merchants.data && merchants.data.length > 0 && (
        <section className="vd-section">
          <div className="vd-wrap">
            <div className="vd-sec-head"><div><h2 className="vd-h2">Discover Local Favourites</h2><p className="vd-lede">Approved Mandeville businesses delivering through VilleDash.</p></div></div>
            <Favourites merchants={merchants} openStore={signIn} preview={!launched} onRecruit={toMerchant} />
          </div>
        </section>
      )}

      <section className="vd-section vd-section--lav">
        <div className="vd-wrap">
          <h2 className="vd-h2" style={{ marginBottom: 16 }}>How VilleDash works</h2>
          <HowItWorks />
        </div>
      </section>

      <section className="vd-section">
        <div className="vd-wrap"><Partner onJoin={toMerchant} /></div>
      </section>
    </Shell>
  );
}

function InterestForm() {
  const [v, setV] = useState('');
  const [state, setState] = useState('idle');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const phone = v.replace(/\D/g, '').length >= 7 && /^[+\d\s().-]+$/.test(v.trim());
  const submit = async (e) => {
    e.preventDefault();
    if (!email && !phone) { setState('invalid'); return; }
    setState('busy');
    try {
      await addDoc(collection(dashDb(), 'dash_interest'), {
        contact: v.trim().slice(0, 120), kind: email ? 'email' : 'phone', source: window.location.hostname.slice(0, 80), createdAt: serverTimestamp(),
      });
      setState('done');
    } catch (err) { setState('error'); }
  };
  if (state === 'done') return <p className="vd-note" style={{ marginTop: 16, maxWidth: 460 }} role="status">Thanks. We’ll tell you when VilleDash opens for orders.</p>;
  return (
    <form className="vd-interest" onSubmit={submit} noValidate>
      <label htmlFor="vd-interest" className="vd-sr">Email or phone number</label>
      <input id="vd-interest" className="vd-input" value={v} onChange={(e) => { setV(e.target.value); if (state !== 'busy') setState('idle'); }}
        placeholder="Email or phone number" aria-invalid={state === 'invalid' ? 'true' : undefined} autoComplete="email" />
      <button className="vd-btn vd-btn--primary" disabled={state === 'busy'}>{state === 'busy' ? 'Saving…' : 'Notify me'}</button>
      {state === 'invalid' && <span className="vd-field__err" style={{ flexBasis: '100%' }}>Enter an email address or a phone number.</span>}
      {state === 'error' && <span className="vd-field__err" style={{ flexBasis: '100%' }}>That didn’t save. Check your connection and try again.</span>}
    </form>
  );
}
