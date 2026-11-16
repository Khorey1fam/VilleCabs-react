// Full-width VilleDash slideshow for the top of the VilleCabs customer dashboard.
// Store slides (food, groceries…) only show when an approved store in that
// category exists, so we never advertise something customers can't order yet.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { dashDb } from './dashApi';
import { useAds, siteHref, SITE_INFO } from './sites';
import { CATEGORY_GROUPS } from './Home';
import imgSend from './img/svc-send.webp';
import imgFood from './img/cat-food.webp';
import imgGroceries from './img/cat-groceries.webp';
import imgGifts from './img/cat-gifts.webp';
import imgShops from './img/cat-shops.webp';
import imgConvenience from './img/cat-convenience.webp';

const SLIDES = [
  { id: 'send', title: 'Need to send a package?', body: 'Documents, parcels and gifts picked up and delivered across Mandeville.', cta: 'Send a package', img: imgSend, alt: 'Parcels wrapped with purple VilleDash tape', go: 'send' },
  { id: 'food', group: 'food', title: 'Hungry? Have food delivered.', body: 'Order from Mandeville restaurants and track your rider live.', cta: 'Order food', img: imgFood, alt: 'A burger, fries and an iced drink' },
  { id: 'groceries', group: 'groceries', title: 'Groceries to your door.', body: 'Skip the supermarket run. We’ll bring it to you.', cta: 'Shop groceries', img: imgGroceries, alt: 'A tote bag of fresh vegetables, milk, bread and bananas' },
  { id: 'convenience', group: 'convenience', title: 'Out of something?', body: 'Water, snacks and everyday basics, delivered.', cta: 'Shop now', img: imgConvenience, alt: 'Bottled water, a soft drink, chips, soap and toilet paper' },
  { id: 'gifts', title: 'Send a gift today.', body: 'Flowers and gifts delivered to someone special in Mandeville.', cta: 'Send a gift', img: imgGifts, alt: 'A wrapped gift box with a purple ribbon beside a bouquet of flowers', go: 'send' },
  { id: 'shops', group: 'shops', title: 'Shop local, delivered.', body: 'Boutiques and local stores, straight to your door.', cta: 'Browse stores', img: imgShops, alt: 'Shopping bags, a white handbag and sunglasses' },
];

function useLiveGroups() {
  const [cats, setCats] = useState(null);
  useEffect(() => {
    try {
      return onSnapshot(query(collection(dashDb(), 'merchants'), where('status', '==', 'approved')),
        (s) => setCats(new Set(s.docs.map((d) => d.data().category))), () => setCats(new Set()));
    } catch (e) { setCats(new Set()); return undefined; }
  }, []);
  return useMemo(() => {
    if (!cats) return null;
    return new Set(CATEGORY_GROUPS.filter((g) => (g.cats || []).some((c) => cats.has(c))).map((g) => g.key));
  }, [cats]);
}

const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

export default function DashSlides({ site = 'cabs', domains = {}, go }) {
  const live = useLiveGroups();
  const ads = useAds(site).filter((a) => !String(a.id).startsWith('default-') && a.target !== site);
  const slides = useMemo(() => [
    ...SLIDES.filter((s) => !s.group || (live && live.has(s.group))),
    ...ads.map((a) => ({ id: a.id, ad: a, title: a.title, body: a.body, cta: a.ctaLabel, img: a.imageUrl, alt: '' })),
  ], [live, ads]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const n = slides.length;
  useEffect(() => { if (i >= n) setI(0); }, [n, i]);
  useEffect(() => {
    if (paused || n < 2 || reduceMotion()) return undefined;
    const t = setTimeout(() => setI((x) => (x + 1) % n), 5000);
    return () => clearTimeout(t);
  }, [i, n, paused]);
  if (!n) return null;

  const open = (s) => {
    if (s.ad) {
      const a = s.ad;
      if (a.target === 'url' && a.url) { window.open(a.url, '_blank', 'noopener'); return; }
      const t = a.target === 'events' ? 'ville' : a.target;
      const href = siteHref(t, domains, site, a.id);
      if (href && href.indexOf(window.location.hostname) === -1) { window.location.href = a.target === 'events' ? `${href}&go=events` : href; return; }
      if (SITE_INFO[a.target]) go(SITE_INFO[a.target].screen);
      return;
    }
    const href = siteHref('dash', domains, site, `slide-${s.id}`);
    const sameSite = !href || href.indexOf(`//${window.location.hostname}/`) !== -1;
    if (sameSite) {
      if (s.group) { try { sessionStorage.setItem('vd_store_group', s.group); } catch (e) { /* ignore */ } go('dash-stores'); } else go('dash-send');
      return;
    }
    const u = new URL(href);
    u.searchParams.set('go', s.group ? 'stores' : 'send');
    if (s.group) u.searchParams.set('group', s.group);
    window.location.href = u.toString();
  };
  const step = (d) => setI((x) => (x + d + n) % n);

  return (
    <section aria-roledescription="carousel" aria-label="VilleDash"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => { const s = touch.current; touch.current = null; setPaused(false); if (s == null) return; const dx = e.changedTouches[0].clientX - s; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); }}
      style={{ position: 'relative', width: '100%', overflow: 'hidden', background: 'linear-gradient(120deg, #2d1650 0%, #4c1d95 55%, #6b21a8 100%)', color: '#fff' }}>
      <style>{`.vds-track{display:flex;transition:transform .55s cubic-bezier(.2,.7,.2,1)}@media (prefers-reduced-motion: reduce){.vds-track{transition:none}}
.vds-slide{flex:0 0 100%;display:flex;align-items:stretch;min-height:150px;cursor:pointer}
.vds-text{flex:1;padding:16px 8px 30px 18px;display:flex;flex-direction:column;justify-content:center;min-width:0;max-width:560px}
.vds-img{flex:0 0 42%;max-width:330px;position:relative}
.vds-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.vds-img:before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,#4c1d95 0%,rgba(76,29,149,.55) 18%,rgba(76,29,149,0) 45%)}
.vds-inner{display:flex;width:100%;justify-content:space-between}
@media (min-width:760px){.vds-slide{min-height:200px}.vds-text{padding:22px 24px 34px max(32px, calc((100vw - 1100px) / 2))}.vds-img{flex-basis:40%;max-width:520px}.vds-title{font-size:28px!important}.vds-body{font-size:15px!important}}`}</style>
      <div className="vds-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        {slides.map((s, k) => (
          <div key={s.id} className="vds-slide" role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${n}: ${s.title}`} aria-hidden={k !== i}
            onClick={() => open(s)}>
            <div className="vds-inner">
              <div className="vds-text">
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: '#e9d5ff' }}>{s.ad ? (SITE_INFO[s.ad.target] ? `From ${SITE_INFO[s.ad.target].name}` : 'Sponsored') : 'VilleDash · Mandeville'}</div>
                <div className="vds-title" style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.15, marginTop: 4 }}>{s.title}</div>
                {s.body && <div className="vds-body" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 5, color: 'rgba(255,255,255,0.88)' }}>{s.body}</div>}
                {s.cta && (
                  <button type="button" tabIndex={k === i ? 0 : -1} onClick={(e) => { e.stopPropagation(); open(s); }}
                    style={{ alignSelf: 'flex-start', marginTop: 10, padding: '9px 16px', borderRadius: 22, border: 'none', background: '#ffd84d', color: '#2d1650', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>{s.cta} →</button>
                )}
              </div>
              {s.img && <div className="vds-img"><img src={s.img} alt={s.alt} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" /></div>}
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 8, display: 'flex', justifyContent: 'center', gap: 2 }}>
          {slides.map((s, k) => (
            <button key={s.id} type="button" aria-label={`Show slide ${k + 1}: ${s.title}`} aria-current={k === i}
              onClick={() => setI(k)}
              style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <span style={{ display: 'block', width: k === i ? 18 : 7, height: 7, borderRadius: 4, background: k === i ? '#ffd84d' : 'rgba(255,255,255,0.55)', transition: 'width .3s' }} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
