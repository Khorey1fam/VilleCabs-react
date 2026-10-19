// The driver app on its own address (driver.villecabs.com): a landing page for
// drivers, a notice for customers who sign in there, and the banner that points
// drivers on villecabs.com to it once it is live.
import React from 'react';
import { Brand, HeroArt, Icon } from './driver/DriverUI';

const PURPLE = '#6b21a8';
const INK = '#1f1235';
const bare = (h) => String(h || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
export const siteUrl = (domain) => (domain ? `https://${bare(domain)}/` : null);

// Signed-out home of the driver app.
export function DriverLanding({ go, domains }) {
  const ride = siteUrl(domains && domains.cabs) || 'https://villecabs.com/';
  return (
    <div className="dr dr-landing">
      <header className="dr-landing__top">
        <Brand />
        <button type="button" className="dr-btn dr-btn--ghost" onClick={() => go('driver-login')}>Sign in</button>
      </header>
      <main className="dr-landing__grid">
        <HeroArt />
        <section className="dr-landing__copy">
          <div className="dr-eyebrow">Mandeville &middot; Manchester</div>
          <h1>Drive with VilleCabs.</h1>
          <p className="dr-landing__lead">Earn on your own schedule with Mandeville&rsquo;s local ride app. Go online when it suits you and get ride requests straight to your phone.</p>
          <div className="dr-earn">
            <div className="dr-earn__big">85%</div>
            <div className="dr-earn__text"><b>You keep 85% of every completed fare.</b> VilleCabs&rsquo; platform fee is 15%, shown on every ride before you accept it.</div>
          </div>
          <ul className="dr-perks">
            <li><Icon name="power" size={20} />Go online and offline whenever you choose</li>
            <li><Icon name="bell" size={20} />Ride requests with pickup, drop-off and fare</li>
            <li><Icon name="wallet" size={20} />Today&rsquo;s and weekly earnings at a glance</li>
          </ul>
          <div className="dr-cta">
            <button type="button" className="dr-btn dr-btn--primary dr-btn--block" onClick={() => go('driver-login')}>Sign in</button>
            <button type="button" className="dr-btn dr-btn--secondary dr-btn--block" onClick={() => go('driver-signup')}>Apply to drive</button>
          </div>
        </section>
      </main>
      <footer className="dr-landing__foot">Need a ride? <a className="dr-link" href={ride}>Go to VilleCabs</a></footer>
    </div>
  );
}

// A customer account signed in on the driver app.
export function DriverSiteCustomer({ domains, onSignOut }) {
  const ride = siteUrl(domains && domains.cabs) || 'https://villecabs.com/';
  return (
    <div className="dr dr-auth" style={{ justifyContent: 'center' }}>
      <div className="dr-auth__card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Brand /></div>
        <h1>This is the driver app</h1>
        <p className="dr-auth__sub">You&rsquo;re signed in with a customer account. Book and track your rides on VilleCabs.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <a className="dr-btn dr-btn--primary dr-btn--block" href={ride}>Go to VilleCabs</a>
          <button type="button" className="dr-btn dr-btn--secondary dr-btn--block" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

// Shown to drivers on villecabs.com once the driver app is live.
export function DriverAppBanner({ domains }) {
  const url = domains && domains.driverLive ? siteUrl(domains.driver) : null;
  if (!url) return null;
  return (
    <a href={url} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 14px 0', padding: '12px 14px', borderRadius: 14, background: '#f5f0fc', border: '1px solid #e2d4f7', textDecoration: 'none', color: INK }}>
      <img src="/driver-icon-192.png" alt="" style={{ width: 40, height: 40, borderRadius: 10 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Get the VilleCabs Driver app</span>
        <span style={{ display: 'block', fontSize: 12.5, color: '#5b5470' }}>Open {bare(domains.driver)} and add it to your home screen.</span>
      </span>
      <span style={{ fontWeight: 700, color: PURPLE, fontSize: 13 }}>Open</span>
    </a>
  );
}
