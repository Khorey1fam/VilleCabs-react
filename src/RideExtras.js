// VilleCabs extra fare requests.
// Driver (during the ride) or admin (any time) asks for an extra amount with a
// reason; the customer approves (cash to the driver, or card via WiPay when
// card payments are on for them) or declines. All writes go through Cloud
// Functions (functions/dash/extras.js); this file only reads and calls them.
import React, { useEffect, useState } from 'react';
import { getApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useCardPayments, CARD_MIN_CENTS, api as dashApi } from './dash/dashApi';
import { goToCard } from './dash/Payments';

export const EXTRA_REASONS = [
  ['waiting', 'Waiting time'], ['extra_stop', 'Extra stop'], ['route_change', 'Route change or detour'],
  ['toll', 'Toll or parking'], ['luggage', 'Extra luggage'], ['extra_passenger', 'Extra passenger'],
  ['cleaning', 'Cleaning fee'], ['other', 'Other'],
];
const call = (name, data) => httpsCallable(getFunctions(getApp()), name)(data).then((r) => r.data);
const jm = (cents) => `J$${(Math.round(cents) / 100).toLocaleString('en-JM')}`;
const errMsg = (e) => (e && e.message) || 'Something went wrong. Please try again.';

const THEMES = {
  light: { card: '#ffffff', border: '#e9d5ff', text: '#1a1a2e', quiet: '#6b7280', soft: '#f5f0ff', accent: '#6b21a8', input: '#ffffff', inputBorder: '#d0d3e0' },
  dark: { card: 'rgba(15,20,40,0.65)', border: 'rgba(255,255,255,0.12)', text: '#ffffff', quiet: 'rgba(255,255,255,0.55)', soft: 'rgba(255,255,255,0.06)', accent: '#c4b5fd', input: 'rgba(255,255,255,0.08)', inputBorder: 'rgba(255,255,255,0.2)' },
};
const STATUS = {
  pending: ['Waiting for the customer', '#b45309'],
  approved_cash: ['Approved · cash to driver', '#1a9e5a'],
  awaiting_payment: ['Approved · customer paying by card', '#6b21a8'],
  paid: ['Paid by card', '#1a9e5a'],
  declined: ['Declined', '#dc2626'],
};

export function useRideExtras(bookingId) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!bookingId) return undefined;
    const q = query(collection(getFirestore(getApp()), 'bookings', bookingId, 'extras'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [bookingId]);
  return list;
}

// Driver or admin: ask for an extra amount.
export function ExtraFareRequest({ bookingId, theme = 'light', compact }) {
  const t = THEMES[theme];
  const [open, setOpen] = useState(!compact);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async () => {
    const n = Math.round(Number(String(amount).replace(/[^0-9.]/g, '')));
    if (!reason) { setMsg('Choose a reason.'); return; }
    if (!n) { setMsg('Enter the amount in J$.'); return; }
    setBusy(true); setMsg('');
    try {
      await call('rideExtraRequest', { bookingId, reason, amount: n, note: note.trim() });
      setMsg(`Sent. The customer will be asked to approve J$${n.toLocaleString('en-JM')}.`);
      setReason(''); setAmount(''); setNote(''); if (compact) setOpen(false);
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ width: '100%', padding: '11px 16px', background: t.soft, border: `1px solid ${t.border}`, borderRadius: 12, fontSize: 12.5, fontWeight: 700, color: t.text, cursor: 'pointer', marginBottom: 12, textAlign: 'left' }}>
        ➕ Request extra fare (waiting, extra stop, detour…)
        {msg && <span style={{ display: 'block', fontWeight: 500, color: t.quiet, marginTop: 4 }}>{msg}</span>}
      </button>
    );
  }
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 4 }}>Request extra fare</div>
      <div style={{ fontSize: 11.5, color: t.quiet, marginBottom: 10, lineHeight: 1.5 }}>The customer approves or declines in their app. Nothing is added without their OK.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {EXTRA_REASONS.map(([k, l]) => (
          <button key={k} onClick={() => setReason(k)} aria-pressed={reason === k}
            style={{ padding: '7px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${reason === k ? t.accent : t.inputBorder}`, background: reason === k ? t.accent : 'transparent', color: reason === k ? (theme === 'dark' ? '#1a1a2e' : '#fff') : t.text }}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Amount J$" aria-label="Amount in J$"
          style={{ width: 120, padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: 'none' }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={reason === 'other' ? 'What is it for? (required)' : 'Note for the customer (optional)'} aria-label="Note"
          style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: 'none' }} />
      </div>
      {msg && <div style={{ fontSize: 12, color: t.quiet, marginTop: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={send} disabled={busy}
          style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#6b21a8', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Sending…' : 'Send to customer'}
        </button>
        {compact && <button onClick={() => setOpen(false)} style={{ padding: '11px 14px', borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: 'transparent', color: t.quiet, fontSize: 13, cursor: 'pointer' }}>Close</button>}
      </div>
    </div>
  );
}

// Driver/admin: the list of requests and what to collect.
export function ExtraFareList({ bookingId, theme = 'light' }) {
  const t = THEMES[theme];
  const list = useRideExtras(bookingId);
  if (!list || !list.length) return null;
  const cash = list.filter((x) => x.status === 'approved_cash').reduce((s, x) => s + x.amountCents, 0);
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>Extra fare requests</div>
      {list.map((x) => (
        <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '6px 0', borderTop: `1px solid ${t.border}` }}>
          <span style={{ color: t.text }}>{x.reasonLabel}{x.note ? ` · ${x.note}` : ''}{x.requestedBy === 'admin' ? ' · by admin' : ''}</span>
          <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b style={{ color: t.text }}>{jm(x.amountCents)}</b><br /><span style={{ color: (STATUS[x.status] || [])[1] || t.quiet, fontSize: 11.5, fontWeight: 600 }}>{(STATUS[x.status] || [x.status])[0]}</span></span>
        </div>
      ))}
      {cash > 0 && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fcd34d', marginTop: 6, ...(theme === 'light' ? { color: '#b45309' } : {}) }}>Collect {jm(cash)} extra in cash.</div>}
    </div>
  );
}

// Customer: approve or decline, then pay.
export function ExtraFareCustomer({ bookingId, user }) {
  const list = useRideExtras(bookingId);
  const { cardOn } = useCardPayments(user && user.uid);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  if (!list) return null;
  const open = list.filter((x) => ['pending', 'awaiting_payment'].includes(x.status));
  const done = list.filter((x) => ['approved_cash', 'paid'].includes(x.status));
  if (!open.length && !done.length) return null;
  const respond = async (x, decision, payWith) => {
    setBusy(`${x.id}:${decision}:${payWith || ''}`); setErr('');
    try {
      const r = await call('rideExtraRespond', { bookingId, extraId: x.id, decision, payWith });
      if (r.status === 'awaiting_payment') { await goToCard('extra', r.payId); return; }
    } catch (e) { setErr(errMsg(e)); }
    setBusy('');
  };
  const payCard = async (x) => { setBusy(`${x.id}:card`); setErr(''); try { await goToCard('extra', `${bookingId}/${x.id}`); } catch (e) { setErr(errMsg(e)); setBusy(''); } };
  const payCash = async (x) => { setBusy(`${x.id}:cash`); setErr(''); try { await dashApi.payUseCash({ kind: 'extra', id: `${bookingId}/${x.id}` }); } catch (e) { setErr(errMsg(e)); } setBusy(''); };
  return (
    <div style={{ background: '#fffaf0', border: '1.5px solid #fbbf24', borderRadius: 14, padding: 14, marginBottom: 12 }}>
      {open.map((x) => (
        <div key={x.id} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a2e' }}>
            {x.status === 'pending' ? `${x.requestedBy === 'admin' ? 'VilleCabs' : x.driverName || 'Your driver'} is asking for ${jm(x.amountCents)} extra` : `Finish paying ${jm(x.amountCents)} by card`}
          </div>
          <div style={{ fontSize: 12.5, color: '#6b4300', marginTop: 3 }}>Reason: {x.reasonLabel}{x.note ? ` — ${x.note}` : ''}</div>
          {x.status === 'pending' ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <button disabled={!!busy} onClick={() => respond(x, 'approve', 'cash')} style={btn('#1a9e5a')}>✓ Approve · pay {jm(x.amountCents)} cash to driver</button>
              {cardOn && x.amountCents >= CARD_MIN_CENTS && (
                <button disabled={!!busy} onClick={() => respond(x, 'approve', 'card')} style={btn('#6b21a8')}>💳 Approve · pay by card</button>
              )}
              <button disabled={!!busy} onClick={() => respond(x, 'decline')} style={{ ...btn('#fff'), color: '#dc2626', border: '1px solid #fecaca' }}>✕ Decline</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <button disabled={!!busy} onClick={() => payCard(x)} style={btn('#6b21a8')}>💳 Pay {jm(x.amountCents)} by card</button>
              <button disabled={!!busy} onClick={() => payCash(x)} style={{ ...btn('#fff'), color: '#6b21a8', border: '1px solid #e9d5ff' }}>Pay cash to the driver instead</button>
            </div>
          )}
        </div>
      ))}
      {done.length > 0 && (
        <div style={{ fontSize: 12, color: '#6b4300' }}>
          Extras approved: {done.map((x) => `${x.reasonLabel} ${jm(x.amountCents)} (${x.status === 'paid' ? 'paid by card' : 'cash'})`).join(', ')}.
        </div>
      )}
      {err && <div style={{ fontSize: 12.5, color: '#dc2626', marginTop: 8 }}>{err}</div>}
      <div style={{ fontSize: 11, color: '#8a6d3b', marginTop: 8 }}>Think a charge is wrong? Decline it and contact VilleCabs support.</div>
    </div>
  );
}
const btn = (bg) => ({ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: bg, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' });

// Customer dashboard: rides with an extra-fare request waiting for an answer.
export function usePendingExtraRides(uid) {
  const [rides, setRides] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(getFirestore(getApp()), 'bookings'), where('customerId', '==', uid), where('extraPending', '==', true));
    return onSnapshot(q, (s) => setRides(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRides([]));
  }, [uid]);
  return rides;
}
