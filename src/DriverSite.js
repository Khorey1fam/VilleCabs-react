// The driver app on its own address (driver.villecabs.com): a landing page for
// drivers, a notice for customers who sign in there, and the banner that points
// drivers on villecabs.com to it once it is live.
import React from 'react';

const PURPLE = '#6b21a8';
const INK = '#1f1235';
const bare = (h) => String(h || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
export const siteUrl = (domain) => (domain ? `https://${bare(domain)}/` : null);

const page = { minHeight: '100vh', background: '#f7f5fb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', boxSizing: 'border-box', fontFamily: 'inherit' };
const card = { width: '100%', maxWidth: 420, background: '#fff', borderRadius: 24, padding: '30px 24px', boxShadow: '0 14px 40px rgba(31,18,53,.10)', border: '1px solid #ece8f3', textAlign: 'center', boxSizing: 'border-box' };
const primary = { display: 'block', width: '100%', padding: '15px', background: PURPLE, color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondary = { ...primary, background: '#fff', color: PURPLE, border: `2px solid #d8b4fe` };

function Logo({ size = 84 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.27, background: '#fff', border: '1px solid #ece8f3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden' }}>
      <img src="/logo.png" alt="VilleCabs" style={{ width: size - 6, height: size - 6, objectFit: 'contain' }} />
    </div>
  );
}

// Signed-out home of the driver app.
export function DriverLanding({ go, domains }) {
  const ride = siteUrl(domains && domains.cabs) || 'https://villecabs.com/';
  return (
    <div style={page}>
      <div style={card}>
        <Logo />
        <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, letterSpacing: '.16em', color: PURPLE }}>VILLECABS DRIVER</div>
        <h1 style={{ margin: '8px 0 0', fontSize: 28, lineHeight: 1.15, color: INK, fontWeight: 800 }}>Drive with VilleCabs</h1>
        <p style={{ margin: '10px 0 22px', fontSize: 15, lineHeight: 1.5, color: '#5b5470' }}>
          Use your vehicle, set your own hours and keep 85% of every fare across Mandeville and Manchester.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" style={primary} onClick={() => go('driver-login')}>Sign in</button>
          <button type="button" style={secondary} onClick={() => go('driver-signup')}>Apply to drive</button>
        </div>
        <p style={{ margin: '18px 0 0', fontSize: 13, lineHeight: 1.5, color: '#6b6f80' }}>
          Tip: add this page to your home screen so the driver app opens like any other app.
        </p>
      </div>
      <a href={ride} style={{ marginTop: 18, fontSize: 14, color: PURPLE, fontWeight: 600 }}>Need a ride? Go to VilleCabs</a>
    </div>
  );
}

// A customer account signed in on the driver app.
export function DriverSiteCustomer({ domains, onSignOut }) {
  const ride = siteUrl(domains && domains.cabs) || 'https://villecabs.com/';
  return (
    <div style={page}>
      <div style={card}>
        <Logo size={72} />
        <h1 style={{ margin: '16px 0 0', fontSize: 24, color: INK, fontWeight: 800 }}>This is the driver app</h1>
        <p style={{ margin: '10px 0 22px', fontSize: 15, lineHeight: 1.5, color: '#5b5470' }}>
          You’re signed in with a customer account. Book and track your rides on VilleCabs.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <a href={ride} style={{ ...primary, textDecoration: 'none', boxSizing: 'border-box' }}>Go to VilleCabs</a>
          <button type="button" style={secondary} onClick={onSignOut}>Sign out</button>
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
