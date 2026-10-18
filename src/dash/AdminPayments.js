// Admin → VilleDash → Card payments (WiPay). Card payments stay OFF until an
// admin turns them on here — for named test customers first, then everyone.
import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, limit, query, setDoc, where, serverTimestamp } from 'firebase/firestore';
import { api, dashDb, errText, formatJMD } from './dashApi';
import { C, st, Pill, Spinner } from './ui';

const card = { ...st.card, padding: 14 };
const small = { padding: '6px 10px', fontSize: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const ts = (t) => (t && t.toDate ? t.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const PROJECT = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'villecabs';

function useDoc(path) {
  const [v, setV] = useState(null);
  useEffect(() => onSnapshot(doc(dashDb(), ...path.split('/')), (s) => setV(s.exists() ? s.data() : {}), () => setV({})), [path]);
  return v;
}
function useList(q, key) {
  const [v, setV] = useState(null);
  useEffect(() => onSnapshot(q(), (s) => setV(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setV([])), [key]); // eslint-disable-line
  return v;
}

export function PaymentsTab() {
  const cfg = useDoc('config/payments');
  const [msg, setMsg] = useState('');
  const [tester, setTester] = useState('');
  const [creds, setCreds] = useState({ accountNumber: '', apiKey: '' });
  const refunds = useList(() => query(collection(dashDb(), 'dash_payments'), where('refundDue', '==', true)), 'refunds');
  const recent = useList(() => query(collection(dashDb(), 'dash_payments'), orderBy('createdAt', 'desc'), limit(30)), 'recent');
  const [refs, setRefs] = useState({});
  if (!cfg) return <Spinner />;

  const env = cfg.environment === 'live' ? 'live' : 'sandbox';
  const testers = Array.isArray(cfg.cardTesters) ? cfg.cardTesters : [];
  const save = async (patch, done = 'Saved.') => {
    setMsg('');
    try { await setDoc(doc(dashDb(), 'config', 'payments'), { ...patch, updatedAt: serverTimestamp() }, { merge: true }); setMsg(done); } catch (e) { setMsg('Could not save.'); }
  };
  const addTester = async () => {
    const v = tester.trim(); if (!v) return;
    if (v.includes('@')) { setMsg('Paste the customer’s user ID, not their email.'); return; }
    const s = await getDoc(doc(dashDb(), 'customers', v)).catch(() => null);
    if (!s || !s.exists()) { setMsg('No customer with that ID.'); return; }
    await save({ cardTesters: [...new Set([...testers, v])] }); setTester('');
  };
  const toggleAll = async () => {
    if (!cfg.cardEnabled) {
      if (env === 'live' && !cfg.liveCredentialsSet) { setMsg('Save the live WiPay account number and API key first.'); return; }
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Turn card payments ON for every customer (${env === 'live' ? 'LIVE — real money' : 'sandbox — test cards only'})?`)) return;
    }
    await save({ cardEnabled: !cfg.cardEnabled });
  };
  const saveCreds = async () => {
    setMsg('');
    try { await api.paySetWipay(creds); setCreds({ accountNumber: '', apiKey: '' }); setMsg('Live WiPay details saved. The API key is stored on the server only.'); } catch (e) { setMsg(errText(e)); }
  };
  const resolve = async (p, outcome) => {
    setMsg('');
    try { await api.payResolveRefund({ paymentId: p.id, outcome, reference: refs[p.id] || '' }); setMsg(outcome === 'refunded' ? 'Marked refunded.' : 'Marked as no refund due.'); } catch (e) { setMsg(errText(e)); }
  };
  const returnUrl = cfg.responseUrl || `https://us-central1-${PROJECT}.cloudfunctions.net/wipayReturn`;

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={st.h2}>Card payments (WiPay)</div>
          <Pill tone={cfg.cardEnabled ? 'green' : testers.length ? 'amber' : 'grey'}>{cfg.cardEnabled ? `ON for everyone · ${env}` : testers.length ? `Testers only · ${env}` : 'OFF'}</Pill>
        </div>
        <div style={{ fontSize: 13, color: C.quiet, margin: '4px 0 10px' }}>
          Customers pay on WiPay’s secure page; VilleDash never handles card numbers. A card order reaches the store (or dispatch) only after WiPay confirms the payment. Unpaid card orders are cancelled after {cfg.unpaidExpiryMinutes || 30} minutes. Cash keeps working either way.
        </div>
        <label style={st.label}>Mode</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['sandbox', 'Sandbox (test cards, no money)'], ['live', 'Live (real payments)']].map(([k, l]) => (
            <button key={k} onClick={() => save({ environment: k })} style={{ ...small, background: env === k ? C.purple : C.white, color: env === k ? C.white : C.ink, border: `1px solid ${env === k ? C.purple : C.line}` }}>{l}</button>
          ))}
        </div>
        <label style={st.label}>Who pays WiPay’s fee</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[['merchant_absorb', 'VilleDash absorbs it'], ['customer_pay', 'Customer pays it'], ['split', 'Split 50/50']].map(([k, l]) => (
            <button key={k} onClick={() => save({ feeStructure: k })} style={{ ...small, background: (cfg.feeStructure || 'merchant_absorb') === k ? C.purple : C.white, color: (cfg.feeStructure || 'merchant_absorb') === k ? C.white : C.ink, border: `1px solid ${C.line}` }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.quiet, marginTop: 4 }}>WiPay Jamaica fee: 4.2% + GCT on the free plan, 3.5% + GCT on paid plans. If the customer pays it, WiPay adds it on their page.</div>

        <label style={st.label}>Test customers (card shown only to them)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...st.input, flex: 1 }} value={tester} onChange={(e) => setTester(e.target.value)} placeholder="Customer user ID" />
          <button onClick={addTester} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Add</button>
        </div>
        {testers.map((u) => (
          <div key={u} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
            <span>{u}</span>
            <button onClick={() => save({ cardTesters: testers.filter((x) => x !== u) })} style={{ ...small, background: 'none', border: 'none', color: C.red }}>Remove</button>
          </div>
        ))}
        <button onClick={toggleAll} style={{ ...st.btn, width: 'auto', padding: '10px 18px', marginTop: 14, background: cfg.cardEnabled ? C.red : `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})` }}>
          {cfg.cardEnabled ? 'Turn card payments OFF for everyone' : 'Turn card payments ON for everyone'}
        </button>
        {msg && <div style={st.note}>{msg}</div>}
      </div>

      <div style={card}>
        <div style={st.h2}>Live WiPay account</div>
        <div style={{ fontSize: 13, color: C.quiet, marginBottom: 8 }}>
          {cfg.liveCredentialsSet ? `Saved: account ending ${cfg.liveAccountLast4}. Enter both again to replace them.` : 'Not saved yet. Sandbox mode doesn’t need these.'} Find the API key in WiPay → your profile → Developer. In that screen, register this website: <b>https://villecabs.com</b>.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
          <input style={st.input} value={creds.accountNumber} inputMode="numeric" maxLength={10} onChange={(e) => setCreds({ ...creds, accountNumber: e.target.value.replace(/\D/g, '') })} placeholder="10-digit account number" />
          <input style={st.input} type="password" autoComplete="off" value={creds.apiKey} onChange={(e) => setCreds({ ...creds, apiKey: e.target.value.trim() })} placeholder="API key" />
          <button onClick={saveCreds} disabled={!creds.accountNumber || !creds.apiKey} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Save</button>
        </div>
        <div style={{ fontSize: 12, color: C.quiet, marginTop: 8 }}>After paying, WiPay sends customers to {returnUrl}, which checks the result and returns them to the site.</div>
      </div>

      <div style={card}>
        <div style={st.h2}>Refunds to make</div>
        <div style={{ fontSize: 13, color: C.quiet, marginBottom: 8 }}>Card-paid orders that were cancelled, rejected or failed. WiPay has no refund API: refund in the WiPay dashboard, then record the reference here.</div>
        {!refunds ? <Spinner /> : refunds.length === 0 ? <div style={{ fontSize: 13, color: C.quiet }}>Nothing to refund.</div> : refunds.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
            <div style={{ flex: 1, minWidth: 160 }}><b>{formatJMD(p.amountCents)}</b> · {p.targetKind} {p.targetId}<div style={{ fontSize: 12, color: C.quiet }}>{p.refundReason} · WiPay {p.resultTransactionId || p.id}</div></div>
            <input style={{ ...st.input, width: 170, padding: '6px 8px' }} placeholder="Refund ref / reason" value={refs[p.id] || ''} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })} />
            <button onClick={() => resolve(p, 'refunded')} style={{ ...small, background: C.green, color: C.white, border: 'none' }}>Refunded</button>
            <button onClick={() => resolve(p, 'not_refunded')} style={{ ...small, background: C.white, border: `1px solid ${C.line}` }}>No refund</button>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={st.h2}>Recent card payments</div>
        {!recent ? <Spinner /> : recent.length === 0 ? <div style={{ fontSize: 13, color: C.quiet }}>None yet.</div> : recent.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
            <span>{ts(p.createdAt)} · {p.targetKind} {p.targetId} · {p.environment}{p.message ? ` · ${p.message}` : ''}</span>
            <span><b>{formatJMD(p.amountCents)}</b> <Pill tone={p.status === 'paid' ? 'green' : ['failed', 'rejected', 'start_failed'].includes(p.status) ? 'red' : 'amber'}>{p.status}{p.refundDue ? ' · refund due' : ''}</Pill></span>
          </div>
        ))}
      </div>
    </div>
  );
}
