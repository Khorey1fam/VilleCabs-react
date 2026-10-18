// VilleDash customer design system: shell, navigation, states and form parts.
// Styles live in dash.css (classes prefixed vd-). Rider, merchant and admin
// portals keep using ui.js.
import React, { useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './dash.css';
import { useCart } from './dashApi';
import logoDash from './img/logo-villedash-row.webp';
import logoDashFull from './img/logo-villedash-full.webp';
import logoVille from './img/logo-ville-row.webp';

// ── Icons (24px stroke) ─────────────────────────────────────────────────────
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  store: 'M4 9h16l-1.2-4.2A1 1 0 0 0 17.8 4H6.2a1 1 0 0 0-1 .8zM4 9v1.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0V9M5.5 13v7h13v-7M10 20v-4h4v4',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M18 20.5h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  bike: 'M5.5 19a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 19a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 15.5h6l3-6h3M14 5h3l1.5 10.5M8.5 9.5h4',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  chevL: 'M15 18l-6-6 6-6',
  chevR: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
};
export function Icon({ name, size = 22, stroke = 1.8, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}><path d={P[name]} /></svg>
  );
}

// ── Navigation ──────────────────────────────────────────────────────────────
export const NAV = [
  ['home', 'Home', 'dash-home', 'home'],
  ['stores', 'Stores', 'dash-stores', 'store'],
  ['send', 'Send a Package', 'dash-send', 'box'],
  ['track', 'Track', 'dash-history', null],
  ['orders', 'My Orders', 'dash-history', 'list'],
];
// "Track" opens My Orders on the in-progress filter.
export const ORDERS_FILTER_KEY = 'vd_orders_filter';
const openOrders = (go, filter) => {
  try { sessionStorage.setItem(ORDERS_FILTER_KEY, filter); } catch (e) { /* ignore */ }
  go('dash-history');
};

export function Wordmark({ onClick, full }) {
  return (
    <button className={`vd-mark${full ? ' vd-mark--full' : ''}`} onClick={onClick} aria-label="VilleDash home">
      <img src={full ? logoDashFull : logoDash} alt="VilleDash" width={full ? 308 : 495} height={full ? 200 : 96} decoding="async" />
    </button>
  );
}

export function CartButton({ go }) {
  const [cart] = useCart();
  const n = cart.items.reduce((s, i) => s + i.qty, 0);
  return (
    <button className="vd-iconbtn" onClick={() => go('dash-cart')} aria-label={n ? `Cart, ${n} item${n === 1 ? '' : 's'}` : 'Cart, empty'}>
      <Icon name="cart" />
      {n > 0 && <span className="vd-badge" aria-hidden="true">{n > 99 ? '99+' : n}</span>}
    </button>
  );
}

function TopNav({ go, active, publicMode, onSignIn }) {
  return (
    <header className="vd-nav">
      <div className="vd-wrap vd-nav__in">
        <Wordmark onClick={() => go(publicMode ? 'splash' : 'dash-home')} />
        {!publicMode && (
          <nav className="vd-nav__links" aria-label="VilleDash">
            {NAV.map(([k, label, screen]) => (
              <button key={k} className="vd-nav__link" aria-current={active === k ? 'page' : undefined}
                onClick={() => (k === 'track' ? openOrders(go, 'active') : k === 'orders' ? openOrders(go, 'all') : go(screen))}>{label}</button>
            ))}
          </nav>
        )}
        <div className="vd-nav__right">
          {publicMode ? (
            <>
              <button className="vd-btn vd-btn--secondary vd-btn--sm" onClick={onSignIn}>Sign in</button>
            </>
          ) : (
            <>
              <button className="vd-iconbtn vd-nav__acct" onClick={() => go('customer-profile')}><Icon name="user" size={20} /> Account</button>
              <CartButton go={go} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function TabBar({ go, active }) {
  const tabs = [['home', 'Home', 'home', () => go('dash-home')], ['stores', 'Stores', 'store', () => go('dash-stores')],
    ['send', 'Send', 'box', () => go('dash-send')], ['orders', 'Orders', 'list', () => openOrders(go, 'all')],
    ['account', 'Account', 'user', () => go('customer-profile')]];
  return (
    <nav className="vd-tabbar" aria-label="VilleDash">
      {tabs.map(([k, label, icon, fn]) => (
        <button key={k} className="vd-tab" onClick={fn} aria-current={active === k || (k === 'orders' && active === 'track') ? 'page' : undefined}>
          <Icon name={icon} />{label}
        </button>
      ))}
    </nav>
  );
}

export function Footer({ go, domains = {}, publicMode }) {
  const site = (k) => (domains[k] ? `https://${String(domains[k]).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}` : null);
  const here = typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : '';
  const cabs = site('cabs');
  const toCabs = () => (cabs && !cabs.includes(here) ? (window.location.href = cabs) : go(publicMode ? 'splash' : 'customer-dash'));
  return (
    <footer className="vd-foot">
      <div className="vd-wrap">
        <div className="vd-foot__grid">
          <div className="vd-foot__brand">
            <Wordmark full onClick={() => go(publicMode ? 'splash' : 'dash-home')} />
            <p>Package delivery and local shopping across Mandeville and nearby areas of Manchester, Jamaica.</p>
          </div>
          <div>
            <h4>VilleDash</h4>
            <ul>
              <li><button onClick={() => go('dash-about')}>About</button></li>
              <li><button onClick={() => go('dash-terms')}>Delivery terms</button></li>
              <li><a href="/privacy.html">Privacy policy</a></li>
              <li><button onClick={() => go('contact-us')}>Contact & support</button></li>
            </ul>
          </div>
          <div>
            <h4>Work with us</h4>
            <ul>
              <li><a href="/merchant">Merchant partnerships</a></li>
              <li><a href="/rider">Ride for VilleDash</a></li>
            </ul>
          </div>
          <div>
            <h4>Part of VILLE</h4>
            <img className="vd-foot__ville" src={logoVille} alt="VILLE" width="374" height="96" />
            <ul>
              <li><button onClick={toCabs}>VilleCabs rides</button></li>
              <li><button onClick={() => go('ville-events')}>VilleEvents</button></li>
            </ul>
          </div>
        </div>
        <div className="vd-foot__base">
          <span>© {new Date().getFullYear()} VILLE, Mandeville, Jamaica</span>
          {domains.dash && <span>{String(domains.dash).replace(/^https?:\/\//, '')}</span>}
        </div>
      </div>
    </footer>
  );
}

// The frame every VilleDash customer screen sits in.
export function Shell({ go, active, children, footer = false, tabbar = true, domains, publicMode = false, onSignIn }) {
  return (
    <div className={`vd-root${tabbar && !publicMode ? '' : ' vd-root--tabbar-off'}`}>
      <a href="#vd-main" className="vd-sr">Skip to content</a>
      <TopNav go={go} active={active} publicMode={publicMode} onSignIn={onSignIn} />
      <main id="vd-main">{children}</main>
      {footer && <Footer go={go} domains={domains} publicMode={publicMode} />}
      {tabbar && !publicMode && <TabBar go={go} active={active} />}
    </div>
  );
}

export function PageHead({ title, sub, crumb, onCrumb, right }) {
  return (
    <div className="vd-pagehead">
      {crumb && <button className="vd-crumb" onClick={onCrumb}><Icon name="chevL" size={18} />{crumb}</button>}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

// ── States ──────────────────────────────────────────────────────────────────
export function Chip({ tone = 'brand', plain, children }) {
  return <span className={`vd-chip vd-chip--${tone}${plain ? ' vd-chip--plain' : ''}`}>{children}</span>;
}
export function Skeleton({ h = 16, w = '100%', r = 12, style }) {
  return <div className="vd-skel" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />;
}
export function SkeletonRows({ n = 3, h = 74 }) {
  return (
    <div className="vd-list" role="status" aria-label="Loading">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} h={h} r={16} />)}
    </div>
  );
}
export function EmptyState({ art, title, body, action, onAction, secondary, onSecondary }) {
  return (
    <div className="vd-empty">
      {art && <div className="vd-empty__art">{art}</div>}
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {(action || secondary) && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {action && <button className="vd-btn vd-btn--primary" onClick={onAction}>{action}</button>}
          {secondary && <button className="vd-btn vd-btn--secondary" onClick={onSecondary}>{secondary}</button>}
        </div>
      )}
    </div>
  );
}
export function ErrorState({ message = 'We couldn’t load this. Check your connection and try again.', onRetry }) {
  return (
    <div className="vd-error" role="alert">
      <p>{message}</p>
      {onRetry && <button className="vd-btn vd-btn--secondary vd-btn--sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// Live Firestore data with loading, error, a 12-second timeout and retry.
// subscribe: () => query/doc ref (or null to wait). map: snapshot → value.
export function useLive(makeRef, deps, map) {
  const [state, setState] = useState({ data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let ref;
    try { ref = makeRef(); } catch (e) { setState({ data: undefined, error: e }); return undefined; }
    if (!ref) return undefined;
    setState((s) => ({ data: s.data, error: null }));
    let got = false;
    const timer = setTimeout(() => { if (!got) setState({ data: undefined, error: new Error('timeout') }); }, 12000);
    let unsub = () => {};
    try {
      unsub = onSnapshot(ref, (snap) => { got = true; clearTimeout(timer); setState({ data: map(snap), error: null }); },
        (e) => { got = true; clearTimeout(timer); setState({ data: undefined, error: e }); });
    } catch (e) { clearTimeout(timer); setState({ data: undefined, error: e }); }
    return () => { clearTimeout(timer); unsub(); };
  }, [...deps, attempt]); // eslint-disable-line
  return { data: state.data, error: state.error, loading: state.data === undefined && !state.error, retry: () => setAttempt((a) => a + 1) };
}
export const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
export const docOf = (snap) => (snap.exists() ? { id: snap.id, ...snap.data() } : null);

// ── Form parts ──────────────────────────────────────────────────────────────
let fieldSeq = 0;
export function Field({ label, hint, error, children, id }) {
  const idRef = useRef(id || `vdf${++fieldSeq}`);
  const fid = idRef.current;
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { id: children.props.id || fid, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': hint || error ? `${fid}-d` : undefined })
    : children;
  return (
    <div className="vd-field">
      <label className="vd-field__label" htmlFor={fid}>{label}</label>
      {child}
      {error ? <span id={`${fid}-d`} className="vd-field__err">{error}</span> : hint ? <span id={`${fid}-d`} className="vd-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Steps({ steps, current }) {
  return (
    <ol className="vd-steps" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <li key={s} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="vd-steps__dot">{state === 'done' ? <Icon name="check" size={14} stroke={3} /> : i + 1}</span>
            <span className="vd-steps__label">{s}</span>
            {i < steps.length - 1 && <span className="vd-steps__line" />}
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ items }) {
  return (
    <ol className="vd-timeline">
      {items.map((it) => (
        <li key={it.key} data-state={it.state}>
          <span className="vd-timeline__dot" />
          <div className="vd-timeline__t">{it.title}</div>
          {it.sub && <div className="vd-timeline__s">{it.sub}</div>}
        </li>
      ))}
    </ol>
  );
}

export const fmtWhen = (ts) => (ts?.toDate
  ? ts.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Just now');
export const shortId = (id) => String(id || '').slice(0, 8).toUpperCase();
