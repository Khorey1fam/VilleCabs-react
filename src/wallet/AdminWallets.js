// Admin → Wallets: VilleCoins totals, find a customer, add or remove coins.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import { C, st, Spinner } from '../dash/ui';
import { coins } from './Wallet';

const small = { padding: '7px 11px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer', fontWeight: 600, border: `1px solid ${C.line}`, background: C.white, color: C.ink };
const when = (t) => (t && t.toDate ? t.toDate().toLocaleString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const LABEL = { topup_card: 'Card top-up', topup_bank: 'Bank transfer top-up', admin_credit: 'Added by admin', admin_debit: 'Removed by admin', ride_payment: 'Paid for a ride', ride_refund: 'Ride refund' };

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

// Bank transfers customers say they've sent. Check the bank account, then approve or reject.
function BankRequests() {
  const [rows, setRows] = useState(null);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'wallet_bank_requests'), where('status', '==', 'pending')),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0)))), () => setRows([])), []);
  if (!rows) return <Spinner />;
  return (
    <div style={st.card}>
      <div style={st.h2}>Bank transfers to check{rows.length ? ` (${rows.length})` : ''}</div>
      <div style={st.sub}>Look for the code in your bank account before you approve. Approving adds the coins straight away and can’t be undone here.</div>
      {rows.length === 0 ? <div style={{ ...st.sub, marginTop: 8 }}>Nothing waiting.</div> : rows.map((r) => <BankRow key={r.id} r={r} />)}
    </div>
  );
}
function BankRow({ r }) {
  const [amt, setAmt] = useState(String(r.coins));
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (approve) => {
    setMsg('');
    const n = Math.floor(Number(amt));
    if (approve && (!n || n < 1)) { setMsg('Enter the coins to add.'); return; }
    if (!approve && !note.trim()) { setMsg('Write a short reason the customer will see.'); return; }
    setBusy(true);
    try { await httpsCallable(getFunctions(getApp()), 'walletBankDecide')({ id: r.id, approve, coins: approve ? n : undefined, note }); } catch (e) { setMsg(e.message || 'Could not save.'); setBusy(false); }
  };
  const openReceipt = async () => {
    setMsg('');
    try { window.open(await getDownloadURL(storageRef(getStorage(getApp()), r.receiptPath)), '_blank', 'noopener'); } catch (e) { setMsg('Could not open the receipt.'); }
  };
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, padding: '12px 0' }} data-bank-row={r.code}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>{r.code} · J${coins(r.coins)}</div>
          <div style={st.sub}>{r.customerName || 'Customer'}{r.customerPhone ? ` · ${r.customerPhone}` : ''}{r.customerEmail ? ` · ${r.customerEmail}` : ''} · asked {when(r.createdAt)}</div>
        </div>
        {r.receiptPath ? <button type="button" style={small} onClick={openReceipt}>View receipt</button> : <span style={{ ...st.sub, alignSelf: 'center' }}>No receipt yet</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
        <div><label style={st.label} htmlFor={`br-amt-${r.id}`}>Coins to add</label><input id={`br-amt-${r.id}`} style={{ ...st.input, width: 120 }} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 5))} /></div>
        <div style={{ flex: 1, minWidth: 200 }}><label style={st.label} htmlFor={`br-note-${r.id}`}>Note (needed to reject; the customer sees it)</label><input id={`br-note-${r.id}`} style={st.input} value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="e.g. No transfer with this code yet" /></div>
        <button type="button" style={{ ...small, background: C.green, color: C.white, border: 'none', padding: '11px 16px' }} disabled={busy} onClick={() => decide(true)}>Approve</button>
        <button type="button" style={{ ...small, color: C.red, padding: '11px 16px' }} disabled={busy} onClick={() => decide(false)}>Reject</button>
      </div>
      {msg && <div style={st.err} role="alert">{msg}</div>}
    </div>
  );
}

// What customers see on the Wallet page for bank transfers and "Contact us".
const SETTINGS = [
  ['bankName', 'Bank name', 'e.g. NCB'], ['branch', 'Branch', 'e.g. Mandeville'], ['accountName', 'Account name', 'Name on the account'],
  ['accountNumber', 'Account number', ''], ['accountType', 'Account type', 'e.g. Savings (JMD)'], ['bankNote', 'Extra note for customers', 'Optional'],
  ['whatsapp', 'WhatsApp number', 'e.g. 18765158113'], ['phone', 'Phone number', 'e.g. +1876-515-8113'], ['email', 'Email', 'e.g. admin@villecabs.com'],
];
function TopupSettings() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'wallet'), (s) => setF((cur) => cur || (s.exists() ? s.data() : {})), () => setF({})), []);
  if (!f) return null;
  const save = async () => {
    setMsg('');
    const data = {}; SETTINGS.forEach(([k]) => { data[k] = String(f[k] || '').trim().slice(0, 200); });
    try { await setDoc(doc(dashDb(), 'config', 'wallet'), data, { merge: true }); setMsg('Saved. Customers see this on the Wallet page now.'); } catch (e) { setMsg('Could not save.'); }
  };
  const ready = !!String(f.accountNumber || '').trim();
  return (
    <div style={st.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div><div style={st.h2}>Top-up settings</div><div style={st.sub}>{ready ? 'Bank transfer is on. Customers see your bank details.' : 'Bank transfer is off until you add an account number.'}</div></div>
        <button type="button" style={small} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Edit'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
            {SETTINGS.map(([k, label, ph]) => (
              <div key={k}><label style={st.label} htmlFor={`ws-${k}`}>{label}</label><input id={`ws-${k}`} style={st.input} value={f[k] || ''} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
            ))}
          </div>
          <div style={{ ...st.sub, marginTop: 8 }}>The bank details are shown to signed-in customers who choose Bank transfer. If the contact boxes are empty, customers see the usual VilleCabs WhatsApp and email.</div>
          <button type="button" style={{ ...st.btn, width: 'auto', padding: '11px 18px', marginTop: 10 }} onClick={save}>Save settings</button>
          {msg && <div style={st.note} role="status">{msg}</div>}
        </div>
      )}
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
    const t = { held: wallets.reduce((s, w) => s + (w.balance || 0), 0), card: 0, bank: 0, admin: 0, rides: 0 };
    (recent || []).forEach((r) => {
      if (r.type === 'topup_card') t.card += r.amount;
      if (r.type === 'topup_bank') t.bank += r.amount;
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
        {[['Coins held by customers', totals.held], ['Bought by card', totals.card], ['Bought by bank transfer', totals.bank], ['Added by admin (net)', totals.admin], ['Used on rides', totals.rides]].map(([l, v]) => (
          <div key={l} style={{ ...st.card, margin: 0 }}><div style={{ fontSize: 12, color: C.quiet }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{coins(v)}</div></div>
        ))}
      </div>
      <div style={st.note}>1 VilleCoin = J$1. Coins held by customers is money VilleCabs owes in rides. On rides paid with coins, VilleCabs owes the driver their 85% of that part, the same as card rides. The last 300 changes are counted here.</div>
      <BankRequests />
      <TopupSettings />
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
