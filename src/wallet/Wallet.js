// VilleCoins wallet: balance, top up by card, history. 1 VilleCoin = J$1.
import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';

const P = '#6b21a8';
const INK = '#1a1530';
const MUTED = '#5f5873';
const LINE = '#ece6f5';
export const coins = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const when = (t) => (t && t.toDate ? t.toDate().toLocaleString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const LABEL = {
  topup_card: 'Top-up by card', admin_credit: 'Added by VilleCabs', admin_debit: 'Removed by VilleCabs',
  ride_payment: 'Paid for a ride', ride_refund: 'Returned: ride didn’t go ahead',
};

export function useWalletBalance(uid) {
  const [balance, setBalance] = useState(null);
  useEffect(() => {
    if (!uid) { setBalance(0); return undefined; }
    return onSnapshot(doc(dashDb(), 'wallets', uid), (s) => setBalance(s.exists() ? Math.max(0, Number(s.data().balance) || 0) : 0), () => setBalance(0));
  }, [uid]);
  return balance;
}
function useWalletHistory(uid) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!uid) { setRows([]); return undefined; }
    return onSnapshot(query(collection(dashDb(), 'wallet_tx'), where('uid', '==', uid)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0))).slice(0, 50)),
      () => setRows([]));
  }, [uid]);
  return rows;
}
function useCardOn(uid) {
  const [on, setOn] = useState(false);
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'payments'), (s) => {
    const c = s.exists() ? s.data() : {};
    setOn(c.cardEnabled === true || (!!uid && Array.isArray(c.cardTesters) && c.cardTesters.includes(uid)));
  }, () => setOn(false)), [uid]);
  return on;
}

// Small coin mark (no emoji): a gold disc with a V.
export function CoinMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" fill="#e8b400" />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff3c4" strokeWidth="1.2" />
      <path d="M8 8l4 9 4-9" fill="none" stroke="#5b3d00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const AMOUNTS = [500, 1000, 2000, 5000];

export default function WalletScreen({ user, go, TopBar }) {
  const uid = user?.uid;
  const balance = useWalletBalance(uid);
  const rows = useWalletHistory(uid);
  const cardOn = useCardOn(uid);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = custom ? Math.floor(Number(custom)) : amount;

  const topUp = async () => {
    setErr('');
    if (!Number.isFinite(pick) || pick < 500 || pick > 50000) { setErr('Choose between 500 and 50,000 VilleCoins.'); return; }
    setBusy(true);
    try {
      const fns = getFunctions(getApp());
      const t = (await httpsCallable(fns, 'walletTopupCreate')({ coins: pick })).data;
      const r = (await httpsCallable(fns, 'payCardStart')({ kind: 'topup', id: t.id, returnOrigin: window.location.origin })).data;
      window.location.href = r.url;
    } catch (e) { setErr(e?.message || 'We couldn’t start the top-up. Try again.'); setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4fb', color: INK }}>
      {TopBar && <TopBar title="Wallet" go={go} user={user} />}
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px 40px' }}>
        <section style={{ background: 'linear-gradient(135deg, #1a2744 0%, #2d1650 100%)', color: '#fff', borderRadius: 20, padding: '22px 20px' }} aria-label="VilleCoins balance">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#e9e3f5' }}>
            <CoinMark size={18} /> VilleCoins
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, margin: '6px 0 2px', color: '#ffd84d' }}>{balance === null ? '…' : coins(balance)}</div>
          <div style={{ fontSize: 13.5, color: '#e9e3f5' }}>1 VilleCoin = J$1 · use them to pay for rides</div>
        </section>

        <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, marginTop: 14 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Add VilleCoins</h2>
          {cardOn ? (
            <>
              <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 13.5 }}>Pay by Visa or Mastercard on WiPay’s secure page. WiPay’s card fee is added at checkout.</p>
              <div role="radiogroup" aria-label="Amount" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                {AMOUNTS.map((a) => {
                  const on = !custom && amount === a;
                  return <button key={a} type="button" role="radio" aria-checked={on} onClick={() => { setAmount(a); setCustom(''); }} style={{ minHeight: 48, borderRadius: 12, border: `1.5px solid ${on ? P : LINE}`, background: on ? '#f5f0ff' : '#fff', color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{coins(a)}</button>;
                })}
              </div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
                Or another amount
                <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="500 – 50,000" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, minHeight: 46, borderRadius: 12, border: `1.5px solid ${LINE}`, padding: '0 12px', fontSize: 15 }} />
              </label>
              {err && <div role="alert" style={{ color: '#b42318', fontSize: 13.5, marginTop: 10 }}>{err}</div>}
              <button type="button" disabled={busy} onClick={topUp} style={{ width: '100%', minHeight: 50, marginTop: 14, borderRadius: 14, border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 15.5, cursor: 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Opening WiPay…' : `Pay J$${coins(pick || 0)} for ${coins(pick || 0)} VilleCoins`}
              </button>
            </>
          ) : (
            <p style={{ margin: 0, color: MUTED, fontSize: 14, lineHeight: 1.55 }}>Card top-ups are coming soon. To add VilleCoins now, contact VilleCabs and we’ll add them to your wallet.</p>
          )}
          <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 12.5, lineHeight: 1.5 }}>VilleCoins pay for VilleCabs rides. If your coins don’t cover a ride, you pay the rest in cash. Coins can’t be exchanged back for money.</p>
        </section>

        <section style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, marginTop: 14 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>History</h2>
          {rows === null ? <p style={{ color: MUTED, margin: 0 }}>Loading…</p> : rows.length === 0 ? <p style={{ color: MUTED, margin: 0, fontSize: 14 }}>No VilleCoins activity yet.</p> : rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: `1px solid ${LINE}`, fontSize: 14 }}>
              <span>
                <span style={{ display: 'block', fontWeight: 600 }}>{LABEL[r.type] || 'Wallet change'}</span>
                <span style={{ display: 'block', color: MUTED, fontSize: 12.5 }}>{when(r.at)}{r.type === 'admin_credit' && r.note ? ` · ${r.note}` : ''}</span>
              </span>
              <b style={{ color: r.amount > 0 ? '#13795b' : INK, whiteSpace: 'nowrap' }}>{r.amount > 0 ? '+' : '−'}{coins(Math.abs(r.amount))}</b>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
