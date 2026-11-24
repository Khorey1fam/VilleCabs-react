// VilleCoins wallet: balance, top up by card, history. 1 VilleCoin = J$1.
import React, { useEffect, useState } from 'react';
import { getStorage, ref as storageRef, uploadBytes } from 'firebase/storage';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import { Header } from '../dash/ui';

const P = '#6b21a8';
const INK = '#1a1530';
const MUTED = '#5f5873';
const LINE = '#ece6f5';
export const coins = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const when = (t) => (t && t.toDate ? t.toDate().toLocaleString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const LABEL = {
  topup_card: 'Top-up by card', topup_bank: 'Top-up by bank transfer', code_redeem: 'Redeemed a code', ride_cashback: '2% back on a ride', ride_cashback_reversed: '2% back removed: ride cancelled', admin_credit: 'Added by VilleCabs', admin_debit: 'Removed by VilleCabs',
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
const MIN = 500, MAX = 50000;
// Shown until the admin saves their own in Admin → Wallets → Top-up settings.
const DEFAULT_CONTACT = { whatsapp: '18765158113', phone: '+1876-515-8113', email: 'admin@villecabs.com' };

// Bank details and contact numbers the admin set (config/wallet).
export function useWalletConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'wallet'), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), []);
  return cfg;
}
function useBankRequests(uid) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!uid) { setRows([]); return undefined; }
    return onSnapshot(query(collection(dashDb(), 'wallet_bank_requests'), where('uid', '==', uid)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0)))),
      () => setRows([]));
  }, [uid]);
  return rows;
}
async function uploadReceipt(uid, file) {
  if (!file) return null;
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use a photo or screenshot (PNG or JPG).');
  if (file.size > 8 * 1024 * 1024) throw new Error('The photo must be under 8 MB.');
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const path = `wallet_receipts/${uid}/${Date.now()}.${ext}`;
  await uploadBytes(storageRef(getStorage(getApp()), path), file, { contentType: file.type });
  return path;
}
const call = (name, data) => httpsCallable(getFunctions(getApp()), name)(data).then((r) => r.data);

const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, marginTop: 14 };
const primary = { width: '100%', minHeight: 50, marginTop: 14, borderRadius: 14, border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 15.5, cursor: 'pointer' };
const ghost = { minHeight: 44, padding: '0 14px', borderRadius: 12, border: `1.5px solid ${LINE}`, background: '#fff', color: INK, fontWeight: 600, fontSize: 14, cursor: 'pointer' };
const Row = ({ k, v, copy }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${LINE}`, fontSize: 14 }}>
    <span style={{ color: MUTED }}>{k}</span>
    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, textAlign: 'right', wordBreak: 'break-word' }}>{v}
      {copy && <CopyBtn text={String(v)} label={k} />}
    </span>
  </div>
);
function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  return <button type="button" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch (e) { /* ignore */ } }}
    style={{ border: `1px solid ${LINE}`, background: '#faf7ff', color: P, borderRadius: 8, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{done ? 'Copied' : 'Copy'}</button>;
}

function BankDetails({ cfg }) {
  return (
    <div>
      {cfg.bankName && <Row k="Bank" v={cfg.bankName} />}
      {cfg.branch && <Row k="Branch" v={cfg.branch} />}
      {cfg.accountName && <Row k="Account name" v={cfg.accountName} />}
      <Row k="Account number" v={cfg.accountNumber} copy />
      {cfg.accountType && <Row k="Account type" v={cfg.accountType} />}
    </div>
  );
}

// One bank transfer the customer started: details, code, receipt, status.
function BankRequest({ r, cfg, uid }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const pending = r.status === 'pending';
  const attach = async (file) => {
    setErr(''); setBusy('receipt');
    try { const path = await uploadReceipt(uid, file); await call('walletBankUpdate', { id: r.id, receiptPath: path }); } catch (e) { setErr(e?.message || 'We couldn’t add the receipt. Try again.'); }
    setBusy('');
  };
  const cancel = async () => {
    setErr(''); setBusy('cancel');
    try { await call('walletBankUpdate', { id: r.id, cancel: true }); } catch (e) { setErr(e?.message || 'We couldn’t cancel it. Try again.'); }
    setBusy('');
  };
  const STATUS = {
    pending: r.receiptPath ? ['We’re checking your transfer', '#8a5a00', '#fff6d6'] : ['Waiting for your transfer', '#8a5a00', '#fff6d6'],
    approved: [`Confirmed · ${coins(r.creditedCoins || r.coins)} VilleCoins added`, '#13795b', '#e8f7ef'],
    rejected: ['Not confirmed', '#b42318', '#fdecea'], cancelled: ['Cancelled', MUTED, '#f3f1f7'],
  }[r.status] || [r.status, MUTED, '#f3f1f7'];
  return (
    <div style={{ border: `1.5px solid ${pending ? '#d9c8f5' : LINE}`, borderRadius: 14, padding: 14, marginTop: 10 }} data-bank-request={r.status}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 15 }}>J${coins(r.coins)} for {coins(r.coins)} VilleCoins</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: STATUS[1], background: STATUS[2], borderRadius: 20, padding: '4px 10px' }}>{STATUS[0]}</span>
      </div>
      <div style={{ color: MUTED, fontSize: 12.5, marginTop: 2 }}>{when(r.createdAt)}</div>
      {r.status === 'rejected' && r.note && <p style={{ margin: '8px 0 0', fontSize: 13.5 }}>{r.note}</p>}
      {pending && (
        <>
          <ol style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.55 }}>
            <li>Send <b>J${coins(r.coins)}</b> to this account:</li>
          </ol>
          {cfg && cfg.accountNumber && <BankDetails cfg={cfg} />}
          <ol start={2} style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.55 }}>
            <li>Put this code in the transfer note or description:
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '6px 0' }}>
                <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1.5, color: P }}>{r.code}</span><CopyBtn text={r.code} label="code" />
              </div>
            </li>
            <li>Add a photo or screenshot of the receipt.</li>
          </ol>
          {cfg && cfg.bankNote && <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 13 }}>{cfg.bankNote}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ ...ghost, display: 'inline-flex', alignItems: 'center', borderColor: r.receiptPath ? '#13795b' : P, color: r.receiptPath ? '#13795b' : P }}>
              {busy === 'receipt' ? 'Uploading…' : r.receiptPath ? '✓ Receipt added · replace' : 'Add receipt photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={!!busy} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) attach(f); }} />
            </label>
            <button type="button" style={{ ...ghost, color: '#b42318' }} disabled={!!busy} onClick={cancel}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel this transfer'}</button>
          </div>
          <p style={{ margin: '10px 0 0', color: MUTED, fontSize: 12.5, lineHeight: 1.5 }}>Your VilleCoins are added after VilleCabs sees the money in the bank account. Transfers from another bank can take a few working days to arrive.</p>
        </>
      )}
      {err && <div role="alert" style={{ color: '#b42318', fontSize: 13.5, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// Redeem a code (gift voucher or coins bought from VilleCabs). Each code works once.
function RedeemCode() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const redeem = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 6) { setMsg({ ok: false, text: 'Enter the code exactly as you got it.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await call('walletRedeem', { code });
      setMsg({ ok: true, text: `${coins(r.coins)} VilleCoins added to your wallet.` }); setCode('');
    } catch (er) { setMsg({ ok: false, text: er?.message || 'We couldn’t redeem that code. Try again.' }); }
    setBusy(false);
  };
  return (
    <section style={card} aria-label="Redeem a code">
      <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Redeem a code</h2>
      <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 13.5 }}>Have a VilleCoins code? Enter it to add the coins to your wallet.</p>
      <form onSubmit={redeem} style={{ display: 'flex', gap: 8 }}>
        <input aria-label="VilleCoins code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 20)); setMsg(null); }} placeholder="VC-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          style={{ flex: 1, minWidth: 0, minHeight: 46, borderRadius: 12, border: `1.5px solid ${LINE}`, padding: '0 12px', fontSize: 16, letterSpacing: 1, fontWeight: 600 }} />
        <button type="submit" disabled={busy} style={{ ...primary, width: 'auto', marginTop: 0, minHeight: 46, padding: '0 18px', opacity: busy ? 0.7 : 1 }}>{busy ? 'Checking…' : 'Redeem'}</button>
      </form>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ color: msg.ok ? '#13795b' : '#b42318', fontSize: 13.5, fontWeight: msg.ok ? 700 : 400, marginTop: 10 }}>{msg.text}</div>}
    </section>
  );
}

const WAYS = [['card', 'Card', 'Visa or Mastercard'], ['bank', 'Bank transfer', 'From your bank'], ['contact', 'Contact us', 'Cash or other']];

export default function WalletScreen({ user, go, TopBar, dash, onBack }) {
  const uid = user?.uid;
  const balance = useWalletBalance(uid);
  const rows = useWalletHistory(uid);
  const cardOn = useCardOn(uid);
  const cfg = useWalletConfig();
  const bank = useBankRequests(uid);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [way, setWay] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = custom ? Math.floor(Number(custom)) : amount;
  const amountOk = Number.isFinite(pick) && pick >= MIN && pick <= MAX;
  const bankReady = !!(cfg && String(cfg.accountNumber || '').trim());
  const contact = { ...DEFAULT_CONTACT, ...(cfg ? Object.fromEntries(['whatsapp', 'phone', 'email'].filter((k) => cfg[k]).map((k) => [k, cfg[k]])) : {}) };
  const openBank = (bank || []).filter((r) => r.status === 'pending');
  const pastBank = (bank || []).filter((r) => r.status !== 'pending').slice(0, 5);
  const needAmount = () => { if (!amountOk) { setErr(`Choose between ${coins(MIN)} and ${coins(MAX)} VilleCoins.`); return true; } return false; };

  const payCard = async () => {
    setErr(''); if (needAmount()) return;
    setBusy(true);
    try {
      const t = await call('walletTopupCreate', { coins: pick });
      const r = await call('payCardStart', { kind: 'topup', id: t.id, returnOrigin: window.location.origin });
      window.location.href = r.url;
    } catch (e) { setErr(e?.message || 'We couldn’t start the top-up. Try again.'); setBusy(false); }
  };
  const startBank = async () => {
    setErr(''); if (needAmount()) return;
    setBusy(true);
    try { await call('walletBankCreate', { coins: pick }); setWay(''); setCustom(''); } catch (e) { setErr(e?.message || 'We couldn’t start the bank transfer. Try again.'); }
    setBusy(false);
  };
  const msg = `Hi VilleCabs, I’d like to buy ${amountOk ? coins(pick) : ''} VilleCoins. My account: ${user?.email || user?.phone || user?.name || ''}`.replace('  ', ' ');
  const waDigits = String(contact.whatsapp || '').replace(/\D/g, '');

  return (
    <div style={{ minHeight: '100vh', background: '#f7f4fb', color: INK }}>
      {dash ? <Header title="Wallet" onBack={onBack} /> : TopBar && <TopBar title="Wallet" go={go} user={user} />}
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '18px 16px 40px' }}>
        <section style={{ background: 'linear-gradient(135deg, #1a2744 0%, #2d1650 100%)', color: '#fff', borderRadius: 20, padding: '22px 20px' }} aria-label="VilleCoins balance">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#e9e3f5' }}>
            <CoinMark size={18} /> VilleCoins
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, margin: '6px 0 2px', color: '#ffd84d' }}>{balance === null ? '…' : coins(balance)}</div>
          <div style={{ fontSize: 13.5, color: '#e9e3f5' }}>1 VilleCoin = J$1 · use them to pay for VilleCabs rides</div>
          <div style={{ marginTop: 10, display: 'inline-block', background: 'rgba(255,216,77,0.16)', color: '#ffd84d', borderRadius: 20, padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}>Earn 2% back in VilleCoins on every completed ride</div>
        </section>

        {openBank.length > 0 && (
          <section style={card} aria-label="Bank transfers in progress">
            <h2 style={{ fontSize: 17, margin: 0 }}>Your bank transfer{openBank.length > 1 ? 's' : ''}</h2>
            {openBank.map((r) => <BankRequest key={r.id} r={r} cfg={cfg} uid={uid} />)}
          </section>
        )}

        <section style={card}>
          <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Buy VilleCoins</h2>
          <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 13.5 }}>1. Choose how many</p>
          <div role="radiogroup" aria-label="Amount" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {AMOUNTS.map((a) => {
              const on = !custom && amount === a;
              return <button key={a} type="button" role="radio" aria-checked={on} onClick={() => { setAmount(a); setCustom(''); setErr(''); }} style={{ minHeight: 48, borderRadius: 12, border: `1.5px solid ${on ? P : LINE}`, background: on ? '#f5f0ff' : '#fff', color: INK, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>{coins(a)}</button>;
            })}
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
            Or enter an amount
            <input inputMode="numeric" value={custom} onChange={(e) => { setCustom(e.target.value.replace(/\D/g, '').slice(0, 5)); setErr(''); }} placeholder="500 – 50,000" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, minHeight: 46, borderRadius: 12, border: `1.5px solid ${LINE}`, padding: '0 12px', fontSize: 15 }} />
          </label>
          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700 }} aria-live="polite">{amountOk ? `${coins(pick)} VilleCoins = J$${coins(pick)}` : `Between ${coins(MIN)} and ${coins(MAX)} VilleCoins`}</div>

          <p style={{ margin: '16px 0 8px', color: MUTED, fontSize: 13.5 }}>2. Choose how to pay</p>
          <div role="radiogroup" aria-label="How to pay" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {WAYS.map(([k, label, sub]) => {
              const on = way === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => { setWay(k); setErr(''); }}
                  style={{ minHeight: 64, padding: '8px 6px', borderRadius: 12, border: `1.5px solid ${on ? P : LINE}`, background: on ? '#f5f0ff' : '#fff', color: INK, cursor: 'pointer' }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{label}</span>
                  <span style={{ display: 'block', color: MUTED, fontSize: 11.5, marginTop: 2 }}>{sub}</span>
                </button>
              );
            })}
          </div>

          {way === 'card' && (cardOn ? (
            <>
              <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 13.5 }}>Pay by Visa or Mastercard on WiPay’s secure page. WiPay’s card fee is added at checkout. Coins are added as soon as the payment goes through.</p>
              <button type="button" disabled={busy} onClick={payCard} style={{ ...primary, opacity: busy ? 0.7 : 1 }}>{busy ? 'Opening WiPay…' : `Pay J$${coins(amountOk ? pick : 0)} by card`}</button>
            </>
          ) : <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 14, lineHeight: 1.55 }}>Card payments aren’t available yet. Use a bank transfer or contact us for now.</p>)}

          {way === 'bank' && (cfg === null ? <p style={{ color: MUTED, margin: '12px 0 0' }}>Loading…</p> : bankReady ? (
            <>
              <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 13.5, lineHeight: 1.55 }}>We’ll show you the VilleCabs bank account and a code to put on your transfer. Your coins are added once we see the money. Transfers from another bank can take a few working days.</p>
              <button type="button" disabled={busy} onClick={startBank} style={{ ...primary, opacity: busy ? 0.7 : 1 }}>{busy ? 'One moment…' : `Get bank details for J$${coins(amountOk ? pick : 0)}`}</button>
            </>
          ) : <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 14, lineHeight: 1.55 }}>Bank transfers aren’t set up yet. Contact us and we’ll help you add VilleCoins.</p>)}

          {way === 'contact' && (
            <>
              <p style={{ margin: '12px 0 0', color: MUTED, fontSize: 13.5, lineHeight: 1.55 }}>Message or call VilleCabs to pay another way, like cash. We’ll add the coins to your wallet once you’ve paid.</p>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {waDigits && <a href={`https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" style={{ ...primary, marginTop: 0, display: 'grid', placeItems: 'center', textDecoration: 'none', background: '#128c4b' }}>Message us on WhatsApp</a>}
                {contact.phone && <a href={`tel:${String(contact.phone).replace(/[^\d+]/g, '')}`} style={{ ...ghost, display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Call {contact.phone}</a>}
                {contact.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent('Buy VilleCoins')}&body=${encodeURIComponent(msg)}`} style={{ ...ghost, display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Email {contact.email}</a>}
              </div>
            </>
          )}
          {err && <div role="alert" style={{ color: '#b42318', fontSize: 13.5, marginTop: 10 }}>{err}</div>}
          <p style={{ margin: '14px 0 0', color: MUTED, fontSize: 12.5, lineHeight: 1.5 }}>VilleCoins pay for VilleCabs rides. If your coins don’t cover a ride, you pay the rest in cash. Coins can’t be exchanged back for money.</p>
        </section>

        <RedeemCode />

        {pastBank.length > 0 && (
          <section style={card} aria-label="Past bank transfers">
            <h2 style={{ fontSize: 17, margin: 0 }}>Past bank transfers</h2>
            {pastBank.map((r) => <BankRequest key={r.id} r={r} cfg={cfg} uid={uid} />)}
          </section>
        )}

        <section style={card}>
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
