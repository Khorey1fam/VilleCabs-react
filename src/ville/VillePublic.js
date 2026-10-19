// VILLE public homepage (signed-out visitors).
import React, { useState } from 'react';
import { Icon, logoVille, SERVICES, ServiceMedia, StatusChip, useServiceStatus, useAppLinks, openService, AppInterest, StoreButtons, CabsArt } from './VilleUI';

const SECTIONS = [['top', 'Home'], ['services', 'Our Services'], ['about', 'About VILLE'], ['app', 'Get the App']];
const scrollTo = (id) => {
  const el = document.getElementById(`vl-${id}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function PhoneMock() {
  return (
    <div className="vl-phone" role="img" aria-label="The VILLE app on a phone, showing rides, deliveries and events, and a driver on the way">
      <div className="vl-phone__screen">
        <div className="vl-phone__notch" />
        <div className="vl-phone__top">
          <img src={logoVille} alt="" />
          <div className="vl-phone__hi">Where to today?</div>
          <div className="vl-phone__where"><Icon name="search" size={16} />Book a ride</div>
        </div>
        <div className="vl-phone__body">
          <div className="vl-phone__tiles">
            {SERVICES.map((s) => <div key={s.key} className="vl-phone__tile"><span><Icon name={s.icon} size={18} /></span>{s.short}</div>)}
          </div>
          <div className="vl-phone__map"><CabsArt /></div>
          <div className="vl-phone__eta"><span><Icon name="car" size={16} /></span><div><b>Your driver is on the way</b><small>Live tracking to your pickup spot</small></div></div>
          <div className="vl-phone__eta"><span><Icon name="box" size={16} /></span><div><b>Send a package</b><small>Pickup and delivery across town</small></div></div>
        </div>
      </div>
    </div>
  );
}

export default function VillePublic({ go, user, domains }) {
  const status = useServiceStatus(user && user.uid);
  const links = useAppLinks();
  const [menu, setMenu] = useState(false);
  const nav = (id) => { setMenu(false); scrollTo(id); };
  const year = new Date().getFullYear();
  const driverUrl = domains && domains.driver ? `https://${String(domains.driver).replace(/^https?:\/\//, '')}/` : null;

  return (
    <div className="vl" id="vl-top">
      <header className="vl-nav">
        <div className="vl-container vl-nav__in">
          <button type="button" className="vl-logo" onClick={() => nav('top')} aria-label="VILLE home"><img src={logoVille} alt="VILLE" /></button>
          <nav className="vl-nav__links" aria-label="Main">
            {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => nav(id)}>{label}</button>)}
          </nav>
          <div className="vl-nav__right">
            <div className="vl-nav__desk">
              <button type="button" className="vl-btn vl-btn--ghost" onClick={() => go('customer-login')}>Sign in</button>
              <button type="button" className="vl-btn vl-btn--primary vl-btn--sm" onClick={() => go('customer-signup')}>Create account</button>
            </div>
            <button type="button" className="vl-btn vl-btn--ghost vl-btn--sm vl-nav__burger" onClick={() => go('customer-login')}>Sign in</button>
            <button type="button" className="vl-iconbtn vl-nav__burger" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}><Icon name="menu" /></button>
          </div>
        </div>
      </header>

      {menu && (
        <div className="vl-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="vl-sheet__scrim" aria-label="Close menu" onClick={() => setMenu(false)} />
          <div className="vl-sheet__panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <img src={logoVille} alt="VILLE" style={{ height: 28 }} />
              <button type="button" className="vl-iconbtn" aria-label="Close menu" onClick={() => setMenu(false)}><Icon name="close" /></button>
            </div>
            <div className="vl-sheet__links">
              {SECTIONS.map(([id, label]) => <button key={id} type="button" onClick={() => nav(id)}>{label}</button>)}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="vl-btn vl-btn--primary vl-btn--block" onClick={() => go('customer-signup')}>Create account</button>
              <button type="button" className="vl-btn vl-btn--secondary vl-btn--block" onClick={() => go('customer-login')}>Sign in</button>
            </div>
          </div>
        </div>
      )}

      <main>
        <section className="vl-hero">
          <div className="vl-container vl-hero__grid">
            <div>
              <div className="vl-eyebrow">Mandeville, Jamaica</div>
              <h1>Your City.<br /><span>One App.</span></h1>
              <p className="vl-hero__lead">Book rides, send deliveries and discover what&rsquo;s happening around Mandeville &mdash; all in one place.</p>
              <div className="vl-hero__cta">
                <button type="button" className="vl-btn vl-btn--primary" onClick={() => scrollTo('services')}>Explore Services <Icon name="arrow" size={20} /></button>
                <button type="button" className="vl-btn vl-btn--secondary" onClick={() => scrollTo('app')}>Get the App</button>
              </div>
              <p className="vl-hero__note"><Icon name="shield" size={18} />One VILLE account for rides, deliveries and events.</p>
            </div>
            <div className="vl-hero__art">
              <div style={{ position: 'relative' }}>
                <PhoneMock />
                <div className="vl-float vl-float--a" aria-hidden="true"><span><Icon name="car" size={18} /></span><div>VilleCabs<small>Local rides</small></div></div>
                <div className="vl-float vl-float--b" aria-hidden="true"><span><Icon name="ticket" size={18} /></span><div>VilleEvents<small>What&rsquo;s on in town</small></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="vl-section vl-section--tint" id="vl-services" aria-labelledby="vl-services-h">
          <div className="vl-container">
            <div className="vl-section__head">
              <div>
                <div className="vl-eyebrow">Our Services</div>
                <h2 id="vl-services-h" style={{ marginTop: 10 }}>Everything you need around town.</h2>
              </div>
              <p>Three local services, one account. Use them right here on the web today, no download needed.</p>
            </div>
            <div className="vl-services">
              {SERVICES.map((s) => (
                <button key={s.key} type="button" className="vl-svc" onClick={() => openService(s.key, { go, user, status })}>
                  <div className="vl-svc__media"><ServiceMedia s={s} /><StatusChip status={status[s.key]} /></div>
                  <div className="vl-svc__body">
                    <div className="vl-svc__brand">{s.brand}</div>
                    <div className="vl-svc__title">{s.title}</div>
                    <p className="vl-svc__desc">{s.desc}</p>
                    <span className="vl-svc__go">{s.key === 'dash' && status.dash === 'soon' ? 'Get notified at launch' : s.key === 'events' ? 'Discover events' : s.key === 'cabs' ? 'Book a ride' : 'Send or order'}<Icon name="arrow" size={20} /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="vl-section" id="vl-about" aria-labelledby="vl-about-h">
          <div className="vl-container vl-about">
            <div className="vl-about__copy">
              <div className="vl-eyebrow">About VILLE</div>
              <h2 id="vl-about-h" style={{ marginTop: 10 }}>Built in Mandeville, for Mandeville.</h2>
              <p>VILLE brings the everyday things you need around town into one place. Get a ride with VilleCabs, send a package or order from local stores with VilleDash, and find out what&rsquo;s on with VilleEvents.</p>
              <p>It&rsquo;s made locally, for the people and businesses of Mandeville and Manchester.</p>
            </div>
            <div className="vl-values">
              <div className="vl-value"><span className="vl-value__icon"><Icon name="shield" /></span><div><b>Approved local drivers</b><span>Every VilleCabs driver is reviewed and approved before they can take rides.</span></div></div>
              <div className="vl-value"><span className="vl-value__icon"><Icon name="pin" /></span><div><b>Live tracking</b><span>Follow your driver or rider on the map until you&rsquo;re picked up or your package arrives.</span></div></div>
              <div className="vl-value"><span className="vl-value__icon"><Icon name="layers" /></span><div><b>One account for everything</b><span>Sign in once and move between rides, deliveries and events.</span></div></div>
            </div>
          </div>
        </section>

        <section className="vl-section" id="vl-app" aria-labelledby="vl-app-h" style={{ paddingTop: 0 }}>
          <div className="vl-container">
            <div className="vl-app">
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="vl-eyebrow" style={{ color: '#c9a8f5' }}>The VILLE app</div>
                <h2 id="vl-app-h" style={{ marginTop: 10 }}>{links.android || links.ios ? 'Get VILLE on your phone.' : 'The VILLE app is coming soon.'}</h2>
                <p>{links.android || links.ios
                  ? 'Download VILLE for rides, deliveries and events in one app, or keep using it right here on the web.'
                  : 'VILLE is coming to Google Play and the App Store. Until then, everything below works right here on the web.'}</p>
                <StoreButtons links={links} />
              </div>
              {!(links.android && links.ios) && <AppInterest />}
            </div>
            <div className="vl-web" aria-label="Use VILLE on the web">
              <button type="button" onClick={() => openService('cabs', { go, user, status })}><span className="vl-web__icon"><Icon name="car" /></span><span><b>Book a ride on the web</b><span>Sign in and book in a minute</span></span></button>
              <button type="button" onClick={() => go('ville-events')}><span className="vl-web__icon"><Icon name="ticket" /></span><span><b>Browse events</b><span>See what&rsquo;s on around town</span></span></button>
              <button type="button" onClick={() => go('customer-signup')}><span className="vl-web__icon"><Icon name="user" /></span><span><b>Create your account</b><span>One account for every VILLE service</span></span></button>
            </div>
          </div>
        </section>
      </main>

      <footer className="vl-foot">
        <div className="vl-container">
          <div className="vl-foot__grid">
            <div>
              <img src={logoVille} alt="VILLE" style={{ height: 30 }} />
              <p style={{ marginTop: 12, color: 'var(--vl-text)', fontSize: 15, lineHeight: 1.5, maxWidth: '22em' }}>Your City. One App. Rides, deliveries and events in Mandeville, Jamaica.</p>
            </div>
            <div>
              <h3>Services</h3>
              <ul>
                {SERVICES.map((s) => <li key={s.key}><button type="button" onClick={() => openService(s.key, { go, user, status })}>{s.brand}</button></li>)}
              </ul>
            </div>
            <div>
              <h3>Company</h3>
              <ul>
                <li><button type="button" onClick={() => nav('about')}>About VILLE</button></li>
                {driverUrl && <li><a href={driverUrl}>Drive with VilleCabs</a></li>}
                <li><button type="button" onClick={() => go('terms-page')}>Terms &amp; Conditions</button></li>
                <li><button type="button" onClick={() => go('privacy')}>Privacy Policy</button></li>
                <li><button type="button" onClick={() => go('refund-policy')}>Refund Policy</button></li>
              </ul>
            </div>
            <div>
              <h3>Contact</h3>
              <ul>
                <li><a href="https://wa.me/18765158113" target="_blank" rel="noopener noreferrer">WhatsApp: +1 (876) 515-8113</a></li>
                <li><a href="mailto:admin@villecabs.com">admin@villecabs.com</a></li>
                <li><button type="button" onClick={() => go('contact-us')}>Contact page</button></li>
              </ul>
            </div>
          </div>
          <div className="vl-foot__base"><span>&copy; {year} VILLE &middot; Mandeville, Jamaica</span><span>VilleCabs &middot; VilleDash &middot; VilleEvents</span></div>
        </div>
      </footer>
    </div>
  );
}
