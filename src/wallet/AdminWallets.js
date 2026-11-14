// Admin → Wallets: VilleCoins totals, find a customer, add or remove coins.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import { C, st, Spinner } from '../dash/ui';
import { coins } from './Wallet';

const small = { padding: '7px 11px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer', fontWeight: 600, border: `1px solid ${C.line}`, background: C.white, color: C.ink };
const when = (t) => (t && t.toDate ? t.toDate().toLocaleString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const LABEL = { topup_card: 'Card top-up', admin_credit: 'Added by admin', admin_debit: 'Removed by admin', ride_payment: 'Paid for a ride', ride_refund: 'Ride refund' };

function Customer({ c }) {
  const [balance, setBalance] = useState(null);
  const [rows, setRows] = useState(null);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('add');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(dashDb(), 'wallets', c.id), (s) => setBalance(s.exists() ? s.data().balance || 0 : 0), () => setBalance(0)), [c.id]);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'wallet_tx'), where('uid', '==', c.id)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.at && b.at.toMillis ? b.at.toMillis() : 0) - (a.at && a.at.toMillis ? a.at.toMillis() : 0)))), () => setRows([])), [c.id]);
  const save = async () => {
    const n = Math.floor(Number(amt));
    if (!n || n < 1) { setMsg('Enter a number of coins.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = (await httpsCallable(getFunctions(getApp()), 'walletAdminAdjust')({ uid: c.id, coins: mode === 'add' ? n : -n, reason })).data;
      setMsg(`Done. New balance: ${coins(r.balance)} VilleCoins.`); setAmt(''); setReason('');
    } catch (e) { setMsg(e.message || 'Could not update the wallet.'); }
    setBusy(false);
  };
  return (
    <div style={st.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div><div style={{ fontWeight: 800, fontSize: 16 }}>{c.name || 'Customer'}</div><div style={st.sub}>{c.email || ''}{c.phone ? ` · ${c.phone}` : ''}</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: C.quiet }}>Balance</div><div style={{ fontSize: 24, fontWeight: 800, color: C.purple }}>{balance === null ? '…' : coins(balance)}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
        <div>
          <label style={st.label} htmlFor="aw-mode">Action</label>
          <select id="aw-mode" style={{ ...st.input, width: 150 }} value={mode} onChange={(e) => setMode(e.target.value)}><option value="add">Add coins</option><option value="remove">Remove coins</option></select>
        </div>
        <div><label style={st.label} htmlFor="aw-amt">VilleCoins</label><input id="aw-amt" style={{ ...st.input, width: 130 }} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
        <div style={{ flex: 1, minWidth: 220 }}><label style={st.label} htmlFor="aw-why">Reason (customers don’t see this for removals)</label><input id="aw-why" style={st.input} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 200))} placeholder="e.g. Paid J$2,000 cash at the office" /></div>
        <button type="button" style={{ ...st.btn, width: 'auto', padding: '11px 18px' }} disabled={busy} onClick={save}>{busy ? 'Saving…' : mode === 'add' ? 'Add' : 'Remove'}</button>
      </div>
      {msg && <div style={st.note}>{msg}</div>}
      <div style={{ fontWeight: 700, fontSize: 13.5, margin: '14px 0 4px' }}>History</div>
      {rows === null ? <Spinner /> : rows.length === 0 ? <div style={st.sub}>No activity yet.</div> : rows.slice(0, 40).map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
          <span>{when(r.at)} · {LABEL[r.type] || r.type}{r.note && r.type.startsWith('admin') ? ` · ${r.note}` : ''}{r.by ? ` · ${r.by}` : ''}{r.bookingId ? ` · ride ${r.bookingId.slice(0, 6)}` : ''}</span>
          <b style={{ color: r.amount > 0 ? C.green : C.ink }}>{r.amount > 0 ? '+' : '−'}{coins(Math.abs(r.amount))}</b>
        </div>
      ))}
    </div>
  );
}

export default function AdminWallets() {
  const [recent, setRecent] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [term, setTerm] = useState('');
  const [found, setFound] = useState(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'wallet_tx'), orderBy('at', 'desc'), limit(300)), (s) => setRecent(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRecent([])), []);
  useEffect(() => onSnapshot(collection(dashDb(), 'wallets'), (s) => setWallets(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}), []);
  const totals = useMemo(() => {
    const t = { held: wallets.reduce((s, w) => s + (w.balance || 0), 0), card: 0, admin: 0, rides: 0 };
    (recent || []).forEach((r) => {
      if (r.type === 'topup_card') t.card += r.amount;
      if (r.type === 'admin_credit' || r.type === 'admin_debit') t.admin += r.amount;
      if (r.type === 'ride_payment' || r.type === 'ride_refund') t.rides -= r.amount;
    });
    return t;
  }, [wallets, recent]);

  const search = async () => {
    const q = term.trim();
    if (!q) return;
    setSearching(true); setFound(null);
    try {
      const field = q.includes('@') ? 'email' : 'phone';
      const value = field === 'email' ? q.toLowerCase() : q;
      let snap = await getDocs(query(collection(dashDb(), 'customers'), where(field, '==', value), limit(5)));
      if (snap.empty && field === 'email' && value !== q) snap = await getDocs(query(collection(dashDb(), 'customers'), where('email', '==', q), limit(5)));
      setFound(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { setFound([]); }
    setSearching(false);
  };

  if (!recent) return <Spinner />;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 12 }}>
        {[['Coins held by customers', totals.held], ['Bought by card', totals.card], ['Added by admin (net)', totals.admin], ['Used on rides', totals.rides]].map(([l, v]) => (
          <div key={l} style={{ ...st.card, margin: 0 }}><div style={{ fontSize: 12, color: C.quiet }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{coins(v)}</div></div>
        ))}
      </div>
      <div style={st.note}>1 VilleCoin = J$1. Coins held by customers is money VilleCabs owes in rides. On rides paid with coins, VilleCabs owes the driver their 85% of that part, the same as card rides. The last 300 changes are counted here.</div>
      <div style={st.card}>
        <div style={st.h2}>Find a customer</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input aria-label="Customer email or phone" style={{ ...st.input, flex: 1, minWidth: 220 }} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="Email or phone number" />
          <button type="button" style={{ ...small, background: C.purple, color: C.white, border: 'none' }} onClick={search}>{searching ? 'Searching…' : 'Search'}</button>
        </div>
        {found && found.length === 0 && <div style={{ ...st.sub, marginTop: 8 }}>No customer with that email or phone.</div>}
      </div>
      {(found || []).map((c) => <Customer key={c.id} c={c} />)}
      <div style={st.card}>
        <div style={st.h2}>Recent wallet activity</div>
        {recent.length === 0 ? <div style={st.sub}>Nothing yet.</div> : recent.slice(0, 40).map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
            <span>{when(r.at)} · {LABEL[r.type] || r.type} · customer {String(r.uid).slice(0, 6)}{r.by ? ` · ${r.by}` : ''}</span>
            <b style={{ color: r.amount > 0 ? C.green : C.ink }}>{r.amount > 0 ? '+' : '−'}{coins(Math.abs(r.amount))}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
