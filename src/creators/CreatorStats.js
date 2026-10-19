// Private creator stats page: villecabs.com/creator/<token>
// Shows a creator their code, completed rides and earnings. No sign-in, no
// customer details: the server returns counts and amounts only.
import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

const P = '#6b21a8';
const INK = '#1a1530';
const MUTED = '#5f5873';
const LINE = '#ece6f5';
const jmd = (n) => `J$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const day = (ms) => (ms ? new Date(ms).toLocaleDateString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const monthName = (k) => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-JM', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 18 };

export default function CreatorStats({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    document.title = 'Creator stats · VilleCabs';
    let live = true;
    httpsCallable(getFunctions(getApp()), 'creatorStats')({ token })
      .then((r) => { if (live) setData(r.data); })
      .catch((e) => { if (live) setErr(e && e.code === 'functions/not-found' ? 'This link isn’t valid. Ask VilleCabs for your current link.' : 'We couldn’t load your stats. Check your connection and refresh.'); });
    return () => { live = false; };
  }, [token]);
  const copy = async () => { try { await navigator.clipboard.writeText(data.code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) { /* ignore */ } };

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4fb', color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <header style={{ background: '#fff', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/villecabs-logo.png" alt="" width="36" height="36" style={{ borderRadius: 10 }} />
          <b style={{ fontSize: 17 }}>VilleCabs <span style={{ color: P }}>Creators</span></b>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 48px' }}>
        {err && <div style={{ ...card, color: '#b42318' }} role="alert">{err}</div>}
        {!data && !err && <div style={{ ...card, color: MUTED }} role="status">Loading your stats…</div>}
        {data && (
          <>
            <h1 style={{ fontSize: 26, margin: '4px 0 4px', letterSpacing: -0.4 }}>Hi {data.name.split(' ')[0]}</h1>
            <p style={{ margin: '0 0 18px', color: MUTED, fontSize: 15 }}>Your VilleCabs creator code and earnings. Keep this link private.</p>

            <section style={{ ...card, background: P, color: '#fff', border: 'none' }}>
              <div style={{ fontSize: 12.5, opacity: 0.85, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Your code</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: 3 }}>{data.code}</span>
                <button type="button" onClick={copy} style={{ minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy code'}</button>
                {!data.active && <span style={{ background: '#fff', color: P, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>Paused</span>}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.5 }}>Riders get <b>{data.discountLabel}</b> their ride (once per rider). You earn <b>{jmd(data.payoutJmd)}</b> for every completed ride that uses your code.</p>
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }} aria-label="Totals">
              {[['Completed rides', data.completed], ['Total earned', jmd(data.earnedJmd)], ['Paid to you', jmd(data.paidJmd)], ['Owed to you', jmd(data.balanceJmd)]].map(([l, v]) => (
                <div key={l} style={card}><div style={{ fontSize: 13, color: MUTED }}>{l}</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{v}</div></div>
              ))}
            </section>
            <p style={{ fontSize: 13.5, color: MUTED, margin: '10px 2px 0' }}>{data.booked} ride{data.booked === 1 ? '' : 's'} booked with your code · {data.inProgress} in progress · {data.released} cancelled (cancelled rides don’t earn).</p>

            {data.months.length > 0 && (
              <section style={{ ...card, marginTop: 14 }}>
                <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>By month</h2>
                {data.months.map((m) => (
                  <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: `1px solid ${LINE}`, fontSize: 14.5 }}>
                    <span>{monthName(m.month)}</span><span>{m.rides} ride{m.rides === 1 ? '' : 's'} · <b>{jmd(m.earnedJmd)}</b></span>
                  </div>
                ))}
              </section>
            )}

            <section style={{ ...card, marginTop: 14 }}>
              <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Recent completed rides</h2>
              {data.recent.length === 0 ? <p style={{ margin: 0, color: MUTED, fontSize: 14.5 }}>No completed rides yet. Share your code with your followers to get started.</p> : data.recent.map((r, i) => (
                <div key={`${r.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: `1px solid ${LINE}`, fontSize: 14.5 }}>
                  <span>{day(r.at)}</span>
                  <span><b>{jmd(r.payoutJmd)}</b> <span style={{ fontSize: 12.5, fontWeight: 700, color: r.paid ? '#13795b' : P }}>{r.paid ? 'Paid' : 'Owed'}</span></span>
                </div>
              ))}
            </section>

            {data.payouts.length > 0 && (
              <section style={{ ...card, marginTop: 14 }}>
                <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>Payments</h2>
                {data.payouts.map((p, i) => (
                  <div key={`${p.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: `1px solid ${LINE}`, fontSize: 14.5 }}>
                    <span>{day(p.at)}</span><span><b>{jmd(p.amountJmd)}</b> for {p.rides} ride{p.rides === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </section>
            )}
            <p style={{ fontSize: 12.5, color: MUTED, marginTop: 18 }}>Rides count once they’re completed. Questions about your payments? Contact VilleCabs.</p>
          </>
        )}
      </main>
    </div>
  );
}
