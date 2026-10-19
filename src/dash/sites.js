// VILLE family of sites: one app, several domains.
//
//   villecabs.com  → VilleCabs (taxi) — unchanged
//   villeapp.org   → the VILLE hub (Cabs · Dash · Events)
//   villedash.com  → VilleDash (send packages, order from stores)
//   driver.villecabs.com → VilleCabs Driver (the driver app on its own)
//
// Domains come from config/sites in Firestore (Admin → VilleDash → Sites & ads),
// falling back to REACT_APP_SITE_* build variables. On preview URLs
// (vercel.app, localhost) add ?site=dash, ?site=ville or ?site=driver to try a brand.
import logoVille from './img/logo-ville-row.webp';
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from './dashApi';
import { C, st } from './ui';

export const SITE_INFO = {
  cabs:   { name: 'VilleCabs',   tagline: 'Book a ride',              emoji: '🚕', screen: 'customer-dash' },
  dash:   { name: 'VilleDash',   tagline: 'Send it. Track it. Delivered.', emoji: '📦', screen: 'dash-home' },
  ville:  { name: 'VILLE',       tagline: 'Your City. One App.',      emoji: '🏙️', screen: 'ville-home' },
  events: { name: 'VilleEvents', tagline: 'Discover local events',    emoji: '🎉', screen: 'ville-events' },
  driver: { name: 'VilleCabs Driver', tagline: 'Drive with VilleCabs', emoji: '🚗', screen: 'driver-dash' },
};

const ENV_DOMAINS = {
  cabs: process.env.REACT_APP_SITE_CABS || 'villecabs.com',
  ville: process.env.REACT_APP_SITE_VILLE || 'villeapp.org',
  dash: process.env.REACT_APP_SITE_DASH || 'villedash.com',
  driver: process.env.REACT_APP_SITE_DRIVER || 'driver.villecabs.com',
  driverLive: false,
};
const bare = (h) => String(h || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

/** Which brand this page is: matches the hostname against the configured domains. */
export function detectSite(hostname, domains) {
  const host = bare(hostname);
  for (const key of ['driver', 'dash', 'ville', 'cabs']) {
    if (domains[key] && bare(domains[key]) === host) return key;
  }
  if (host.startsWith('driver.')) return 'driver';
  // Preview/test hosts: allow ?site= to choose, remembered for the tab.
  if (/(\.vercel\.app|localhost|127\.0\.0\.1)$/.test(host) || host.startsWith('localhost')) {
    try {
      const q = new URLSearchParams(window.location.search).get('site');
      if (q && SITE_INFO[q]) sessionStorage.setItem('vd_site', q);
      const saved = sessionStorage.getItem('vd_site');
      if (saved && SITE_INFO[saved]) return saved;
    } catch (e) { /* storage blocked */ }
  }
  return 'cabs';
}

export function useSites() {
  const [domains, setDomains] = useState(ENV_DOMAINS);
  useEffect(() => {
    try {
      return onSnapshot(doc(dashDb(), 'config', 'sites'), (s) => {
        if (s.exists()) {
          const d = s.data();
          setDomains({ cabs: d.cabs || ENV_DOMAINS.cabs, ville: d.ville || ENV_DOMAINS.ville, dash: d.dash || ENV_DOMAINS.dash, driver: d.driver || ENV_DOMAINS.driver, driverLive: d.driverLive === true });
        }
      }, () => {});
    } catch (e) { return undefined; }
  }, []);
  const site = typeof window !== 'undefined' ? detectSite(window.location.hostname, domains) : 'cabs';
  return { site, domains };
}

/** Link to another VILLE site, tagged so you can see which site sent the visit. */
export function siteHref(target, domains, from, campaign) {
  const domain = domains[target];
  if (!domain) return null;
  const u = new URL(`https://${bare(domain)}/`);
  u.searchParams.set('utm_source', from);
  u.searchParams.set('utm_medium', 'ville_cross_site');
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

// ── Family bar: thin strip linking the VILLE sites ──────────────────────────
export function FamilyBar({ site, domains, go }) {
  const items = ['ville', 'cabs', 'dash', 'events'];
  const open = (k) => {
    if (k === site) return;
    const target = k === 'events' ? 'ville' : k;
    const href = siteHref(target, domains, site, 'family_bar');
    // Same domain or no domain set → stay in the app.
    if (!href || target === site) { go(SITE_INFO[k].screen); return; }
    window.location.href = k === 'events' ? `${href}&go=events` : href;
  };
  return (
    <div style={{ background: C.purpleDark, color: C.white, fontSize: 11.5 }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '5px 12px', display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none', whiteSpace: 'nowrap' }}>
        {items.map((k) => (
          <button key={k} onClick={() => open(k)}
            style={{ background: 'none', border: 'none', color: k === site ? C.white : 'rgba(255,255,255,0.72)', fontWeight: k === site ? 800 : 600, cursor: k === site ? 'default' : 'pointer', padding: 0, fontSize: 11.5 }}>
            {SITE_INFO[k].emoji} {SITE_INFO[k].name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── House ads ────────────────────────────────────────────────────────────────
// site_ads/{id}: { title, body, ctaLabel, target: 'cabs'|'dash'|'ville'|'events'|'url', url,
//                  imageUrl, showOn: ['cabs','dash','ville'], active, order, startDate, endDate, clicks }
// When none are set up, each site promotes its sister services by default.
const DEFAULT_ADS = [
  { id: 'default-dash', title: 'Need something delivered?', body: 'VilleDash picks up and delivers across Mandeville — packages, gifts and store orders.', ctaLabel: 'Try VilleDash', target: 'dash', showOn: ['cabs', 'ville'], color: '#4c1d95' },
  { id: 'default-cabs', title: 'Need a ride?', body: 'Book a VilleCabs taxi anywhere in Manchester.', ctaLabel: 'Book a ride', target: 'cabs', showOn: ['dash', 'ville'], color: '#1a1a2e' },
  { id: 'default-events', title: 'What’s on in Mandeville', body: 'See upcoming events on VilleEvents and book your ride there.', ctaLabel: 'See events', target: 'events', showOn: ['cabs', 'dash'], color: '#6b21a8' },
];

const todayISO = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
export function useAds(site) {
  const [ads, setAds] = useState(null);
  useEffect(() => {
    try {
      return onSnapshot(query(collection(dashDb(), 'site_ads'), where('active', '==', true)), (s) => {
        const t = todayISO();
        setAds(s.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((a) => (a.showOn || []).includes(site))
          .filter((a) => (!a.startDate || a.startDate <= t) && (!a.endDate || a.endDate >= t))
          .sort((a, b) => (a.order || 0) - (b.order || 0)));
      }, () => setAds([]));
    } catch (e) { setAds([]); return undefined; }
  }, [site]);
  if (ads === null) return [];
  return ads.length ? ads : DEFAULT_ADS.filter((a) => a.showOn.includes(site));
}

function trackClick(adId, site) {
  if (!adId || adId.startsWith('default-')) return;
  try { httpsCallable(getFunctions(getApp()), 'trackAdClick')({ adId, site }).catch(() => {}); } catch (e) { /* ignore */ }
}

export function HouseAd({ site, domains, go, variant = 'card', max = 1 }) {
  const ads = useAds(site).filter((a) => a.target !== site).slice(0, max);
  if (!ads.length) return null;
  const open = (a) => {
    trackClick(a.id, site);
    if (a.target === 'url' && a.url) { window.open(a.url, '_blank', 'noopener'); return; }
    const target = a.target === 'events' ? 'ville' : a.target;
    const href = siteHref(target, domains, site, a.id);
    if (href && bare(domains[target]) !== bare(window.location.hostname)) {
      window.location.href = a.target === 'events' ? `${href}&go=events` : href;
    } else if (SITE_INFO[a.target]) {
      go(SITE_INFO[a.target].screen);
    }
  };
  return (
    <>
      {ads.map((a) => (
        <div key={a.id} role="link" tabIndex={0} onClick={() => open(a)} onKeyDown={(e) => e.key === 'Enter' && open(a)}
          style={{
            ...(variant === 'banner' ? { margin: '10px 12px', borderRadius: 14 } : { ...st.card, padding: 0 }),
            overflow: 'hidden', cursor: 'pointer', display: 'flex', alignItems: 'stretch',
            background: a.imageUrl ? C.white : (a.color || C.purpleDark), color: a.imageUrl ? C.ink : C.white,
            border: a.imageUrl ? `1px solid ${C.line}` : 'none',
          }}>
          {a.imageUrl && <div style={{ width: 96, flexShrink: 0, background: `center/cover no-repeat url("${a.imageUrl}")` }} />}
          <div style={{ padding: '12px 14px', flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, opacity: 0.75, textTransform: 'uppercase' }}>
              {SITE_INFO[a.target] ? `From ${SITE_INFO[a.target].name}` : 'Sponsored'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{a.title}</div>
            {a.body && <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2, lineHeight: 1.4 }}>{a.body}</div>}
            {a.ctaLabel && <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 6, color: a.imageUrl ? C.purple : '#e9d5ff' }}>{a.ctaLabel} →</div>}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Landing pages for the VILLE and VilleDash domains (signed-out visitors) ─
export function SiteLanding({ site, domains, go, dashOn }) {
  const info = SITE_INFO[site];
  const isDash = site === 'dash';
  const points = isDash
    ? [['📦', 'Send a package', 'Documents, gifts and parcels picked up and delivered across Mandeville.'],
      ['🛍️', 'Order from local stores', 'Restaurants, supermarkets and shops — delivered by VilleDash riders.'],
      ['📍', 'Track it live', 'Follow your rider on the map and confirm delivery with a PIN.'],
      ['💵', 'Pay cash', 'Pay the rider in cash. No card needed.']]
    : [['🚕', 'VilleCabs', 'Book a reliable local ride.'],
      ['📦', 'VilleDash', 'Send packages and order from local stores.'],
      ['🎉', 'VilleEvents', 'Discover what’s on and get there.']];
  return (
    <div style={{ minHeight: '100vh', background: C.white }}>
      <FamilyBar site={site} domains={domains} go={go} />
      <div style={{ background: `linear-gradient(160deg, ${C.purple}, ${C.purpleDark})`, color: C.white }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 46px' }}>
          {isDash ? <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.2, opacity: 0.85 }}>{info.emoji} {info.name.toUpperCase()}</div>
            : <img src={logoVille} alt="VILLE" style={{ height: 40, width: 'auto', background: C.white, borderRadius: 12, padding: '6px 12px' }} />}
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: '10px 0 8px', fontWeight: 800 }}>{isDash ? 'Send It. Track It. Delivered.' : 'Welcome to VILLE'}</h1>
          <div style={{ fontSize: 16, opacity: 0.9 }}>{isDash ? 'Delivery and local shopping for Mandeville.' : 'Your City. One App. Rides, deliveries and events in Mandeville.'}</div>
          {!dashOn && <div style={{ marginTop: 14, background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5 }}>
            {isDash ? 'VilleDash is launching soon in Mandeville.' : 'VilleDash is launching soon. VilleCabs and VilleEvents are open now.'}
          </div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button onClick={() => go('customer-login')} style={{ padding: '13px 22px', borderRadius: 12, border: 'none', background: C.white, color: C.purpleDark, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Sign in</button>
            <button onClick={() => go('customer-signup')} style={{ padding: '13px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.5)', background: 'transparent', color: C.white, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Create account</button>
          </div>
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 10 }}>One VILLE account works for VilleCabs, VilleDash and VilleEvents.</div>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '22px 16px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 12 }}>
          {points.map(([e, t, d]) => (
            <div key={t} style={{ ...st.card, marginBottom: 0 }}>
              <div style={{ fontSize: 26 }}>{e}</div>
              <div style={{ fontWeight: 800, fontSize: 15.5, marginTop: 6 }}>{t}</div>
              <div style={{ ...st.sub, marginTop: 2 }}>{d}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}><HouseAd site={site} domains={domains} go={go} max={2} /></div>
        {isDash && (
          <div style={{ ...st.card, marginTop: 4 }}>
            <div style={{ fontWeight: 800 }}>Work with VilleDash</div>
            <div style={{ ...st.sub, marginTop: 2 }}>Own a store? <a href="/merchant" style={{ color: C.purple, fontWeight: 700 }}>Sell on VilleDash</a>. Want to ride? <a href="/rider" style={{ color: C.purple, fontWeight: 700 }}>Apply as a rider</a>.</div>
          </div>
        )}
        <div style={{ textAlign: 'center', fontSize: 12, color: C.quiet, padding: '18px 0 30px' }}>
          {['cabs', 'ville', 'dash'].filter((k) => domains[k]).map((k) => (
            <a key={k} href={siteHref(k, domains, site, 'footer') || '#'} style={{ color: C.quiet, margin: '0 8px' }}>{bare(domains[k])}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
