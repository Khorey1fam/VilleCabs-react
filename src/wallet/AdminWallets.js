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
const LABEL = { topup_card: 'Card top-up', topup_bank: 'Bank transfer top-up', code_redeem: 'Redeemed a code', ride_cashback: '2% back on a ride', ride_cashback_reversed: '2% back removed (ride cancelled)', first_ride_bonus: 'First ride reward', first_ride_bonus_reversed: 'First ride reward removed (ride cancelled)', welcome_bonus: 'Welcome gift', admin_credit: 'Added by admin', admin_debit: 'Removed by admin', ride_payment: 'Paid for a ride', ride_refund: 'Ride refund' };

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

// Redeem codes: each is worth a set number of coins and works once, for one person.
function RedeemCodes() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ coins: '', count: '1', note: '' });
  const [msg, setMsg] = useState('');
  const [made, setMade] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'wallet_codes'), orderBy('createdAt', 'desc'), limit(100)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const create = async () => {
    setMsg(''); setMade([]);
    const coinsN = Math.floor(Number(f.coins)); const count = Math.floor(Number(f.count)) || 1;
    if (!coinsN || coinsN < 1) { setMsg('Enter how many coins each code is worth.'); return; }
    if (count < 1 || count > 50) { setMsg('Make 1 to 50 codes at a time.'); return; }
    setBusy(true);
    try {
      const r = (await httpsCallable(getFunctions(getApp()), 'walletCodeCreate')({ coins: coinsN, count, note: f.note })).data;
      setMade(r.codes || []); setF({ coins: '', count: '1', note: '' });
    } catch (e) { setMsg(e.message || 'Could not make the codes.'); }
    setBusy(false);
  };
  const cancel = async (code) => { setMsg(''); try { await httpsCallable(getFunctions(getApp()), 'walletCodeCancel')({ code }); } catch (e) { setMsg(e.message || 'Could not cancel the code.'); } };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setMsg('Copied.'); } catch (e) { /* ignore */ } };
  const active = (rows || []).filter((r) => r.status === 'active');
  return (
    <div style={st.card}>
      <div style={st.h2}>Redeem codes</div>
      <div style={st.sub}>Give a code to someone who paid you, or as a gift. They enter it on the Wallet page. Each code works once, for one person. Treat codes like cash: anyone who has one can use it.</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
        <div><label style={st.label} htmlFor="rc-coins">Coins per code</label><input id="rc-coins" style={{ ...st.input, width: 130 }} inputMode="numeric" value={f.coins} onChange={(e) => setF({ ...f, coins: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder="e.g. 1000" /></div>
        <div><label style={st.label} htmlFor="rc-count">How many codes</label><input id="rc-count" style={{ ...st.input, width: 110 }} inputMode="numeric" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></div>
        <div style={{ flex: 1, minWidth: 200 }}><label style={st.label} htmlFor="rc-note">Note for you (optional)</label><input id="rc-note" style={st.input} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value.slice(0, 120) })} placeholder="e.g. Sold at office, Christmas gift" /></div>
        <button type="button" style={{ ...st.btn, width: 'auto', padding: '11px 18px' }} disabled={busy} onClick={create}>{busy ? 'Making…' : 'Make codes'}</button>
      </div>
      {made.length > 0 && (
        <div style={st.note} role="status">
          <b>{made.length} new code{made.length === 1 ? '' : 's'}:</b>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 15, fontWeight: 700, margin: '6px 0', lineHeight: 1.7 }}>{made.map((c) => <div key={c}>{c}</div>)}</div>
          <button type="button" style={small} onClick={() => copy(made.join('\n'))}>Copy {made.length === 1 ? 'code' : 'all'}</button>
        </div>
      )}
      {msg && <div style={msg === 'Copied.' ? st.sub : st.err} role={msg === 'Copied.' ? 'status' : 'alert'}>{msg}</div>}
      <div style={{ fontWeight: 700, fontSize: 13.5, margin: '14px 0 4px' }}>Codes{rows ? ` · ${active.length} not used yet` : ''}</div>
      {rows === null ? <Spinner /> : rows.length === 0 ? <div style={st.sub}>No codes yet.</div> : rows.slice(0, 60).map((r) => (
        <div key={r.id} data-code-row={r.status} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
          <span><b style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }}>{r.id}</b> · {coins(r.coins)} coins{r.note ? ` · ${r.note}` : ''} · made {when(r.createdAt)}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {r.status === 'active' && <><span style={{ color: C.green, fontWeight: 700 }}>Not used</span><button type="button" style={small} onClick={() => copy(r.id)} aria-label={`Copy ${r.id}`}>Copy</button><button type="button" style={{ ...small, color: C.red }} onClick={() => cancel(r.id)} aria-label={`Cancel ${r.id}`}>Cancel</button></>}
            {r.status === 'redeemed' && <span style={{ color: C.quiet }}>Used {when(r.redeemedAt)}{r.redeemedEmail ? ` by ${r.redeemedEmail}` : r.redeemedBy ? ` by customer ${String(r.redeemedBy).slice(0, 6)}` : ''}</span>}
            {r.status === 'cancelled' && <span style={{ color: C.red }}>Cancelled</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// Rewards: welcome coins (switchable), first ride 50, 2% back.
function Rewards() {
  const [cfg, setCfg] = useState(null);
  const [amt, setAmt] = useState('200');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'wallet'), (s) => {
    const c = s.exists() ? s.data() : {}; setCfg(c); setAmt((a) => (a === '200' && c.welcomeCoins ? String(c.welcomeCoins) : a));
  }, () => setCfg({})), []);
  if (!cfg) return null;
  const on = cfg.welcomeOn === true;
  const save = async (next) => {
    const n = Math.floor(Number(amt));
    if (!n || n < 1 || n > 5000) { setMsg('Welcome coins must be between 1 and 5,000.'); return; }
    setBusy('save'); setMsg('');
    try { await setDoc(doc(dashDb(), 'config', 'wallet'), { welcomeOn: next, welcomeCoins: n }, { merge: true }); setMsg(next ? `On. New customers get ${coins(n)} VilleCoins when they sign up.` : 'Off. New customers won’t get welcome coins.'); } catch (e) { setMsg('Could not save.'); }
    setBusy('');
  };
  const giveAll = async () => {
    setBusy('all'); setMsg(''); setConfirmAll(false);
    try { const r = (await httpsCallable(getFunctions(getApp()), 'walletWelcomeAll')({})).data; setMsg(`Done. ${r.given} customer${r.given === 1 ? '' : 's'} got ${coins(r.coins)} VilleCoins. ${r.had} already had their welcome gift.`); } catch (e) { setMsg(e.message || 'Could not give the coins.'); }
    setBusy('');
  };
  return (
    <div style={st.card}>
      <div style={st.h2}>Rewards</div>
      <div style={{ ...st.sub, lineHeight: 1.6 }}>Always on: <b>2% back</b> in VilleCoins on every completed ride, and <b>50 VilleCoins</b> on a customer’s first completed ride. Both are taken back if the ride is changed to cancelled.</div>
      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div><div style={{ fontWeight: 800 }}>Welcome coins</div><div style={st.sub} data-welcome={on ? 'on' : 'off'}>{on ? `On · new customers get ${coins(cfg.welcomeCoins || 200)} VilleCoins when they sign up` : 'Off'}</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div><label style={st.label} htmlFor="rw-amt">Coins</label><input id="rw-amt" style={{ ...st.input, width: 100 }} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
            <button type="button" disabled={!!busy} style={{ ...small, padding: '11px 16px', background: on ? C.white : C.purple, color: on ? C.red : C.white, border: on ? `1px solid ${C.line}` : 'none' }} onClick={() => save(!on)}>{on ? 'Turn off' : 'Turn on'}</button>
            {on && <button type="button" disabled={!!busy} style={{ ...small, padding: '11px 16px' }} onClick={() => save(true)}>Save amount</button>}
          </div>
        </div>
        {on && (
          <div style={{ marginTop: 12 }}>
            {!confirmAll
              ? <button type="button" disabled={!!busy} style={{ ...small, padding: '11px 16px' }} onClick={() => setConfirmAll(true)}>Give welcome coins to all existing customers</button>
              : (
                <div style={st.note}>
                  Give {coins(cfg.welcomeCoins || 200)} VilleCoins to every customer who already has an account? Customers who already got their welcome gift are skipped. This can’t be undone here.
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" style={{ ...small, background: C.purple, color: C.white, border: 'none' }} onClick={giveAll}>Yes, give to everyone</button>
                    <button type="button" style={small} onClick={() => setConfirmAll(false)}>Cancel</button>
                  </div>
                </div>
              )}
            {busy === 'all' && <div style={st.sub}>Giving coins…</div>}
          </div>
        )}
        {msg && <div style={st.note} role="status">{msg}</div>}
        <div style={{ ...st.sub, marginTop: 8 }}>Customers see a one-time pop-up telling them the coins were added.</div>
      </div>
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
    const t = { held: wallets.reduce((s, w) => s + (w.balance || 0), 0), card: 0, bank: 0, codes: 0, cashback: 0, gifts: 0, admin: 0, rides: 0 };
    (recent || []).forEach((r) => {
      if (r.type === 'topup_card') t.card += r.amount;
      if (r.type === 'topup_bank') t.bank += r.amount;
      if (r.type === 'code_redeem') t.codes += r.amount;
      if (r.type === 'ride_cashback' || r.type === 'ride_cashback_reversed') t.cashback += r.amount;
      if (r.type === 'welcome_bonus' || r.type === 'first_ride_bonus' || r.type === 'first_ride_bonus_reversed') t.gifts += r.amount;
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
        {[['Coins held by customers', totals.held], ['Bought by card', totals.card], ['Bought by bank transfer', totals.bank], ['Added by codes', totals.codes], ['2% back on rides (net)', totals.cashback], ['Welcome + first ride gifts', totals.gifts], ['Added by admin (net)', totals.admin], ['Used on rides', totals.rides]].map(([l, v]) => (
          <div key={l} style={{ ...st.card, margin: 0 }}><div style={{ fontSize: 12, color: C.quiet }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{coins(v)}</div></div>
        ))}
      </div>
      <div style={st.note}>1 VilleCoin = J$1. Coins held by customers is money VilleCabs owes in rides. On rides paid with coins, VilleCabs owes the driver their 85% of that part, the same as card rides. The last 300 changes are counted here.</div>
      <Rewards />
      <BankRequests />
      <RedeemCodes />
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
