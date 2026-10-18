// Card payments (WiPay hosted page) on the customer side. Nothing here shows
// unless config/payments turns card payments on for the customer.
import React, { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { api, dashDb, errText, formatJMD } from './dashApi';
import { Shell, Icon, Skeleton, ErrorState, EmptyState, useLive, docOf, shortId } from './kit';
import { DoneArt } from './art';

// Ask the server for WiPay's payment page and go there.
export async function goToCard(kind, id) {
  const r = await api.payCardStart({ kind, id, returnOrigin: window.location.origin });
  window.location.assign(r.url);
}

export function CardNote({ sandbox }) {
  return (
    <p className="vd-field__hint" style={{ marginTop: 8 }}>
      You’ll pay on WiPay’s secure page (Visa or Mastercard), where WiPay adds its card processing fee. VilleDash never sees your card number.
      {sandbox ? ' Test mode: use a WiPay test card; no real money moves.' : ''}
    </p>
  );
}

// Shown on an order or delivery that is still waiting for its card payment.
export function PaymentPending({ kind, id, target, onCashPicked }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const card = async () => {
    setBusy('card'); setErr('');
    try { await goToCard(kind, id); } catch (e) { setErr(errText(e)); setBusy(''); }
  };
  const cash = async () => {
    setBusy('cash'); setErr('');
    try { await api.payUseCash({ kind, id }); if (onCashPicked) onCashPicked(); } catch (e) { setErr(errText(e)); }
    setBusy('');
  };
  const last = target.payment && target.payment.lastError;
  return (
    <div className="vd-panel" style={{ borderColor: '#f3dcae', background: '#fffaf0' }}>
      <div className="vd-panel__title">Finish paying by card</div>
      <p style={{ fontSize: 14.5 }}>
        {kind === 'order' ? 'The store gets your order once your card payment goes through.' : 'We start looking for a rider once your card payment goes through.'}
        {' '}Unpaid orders are cancelled after 30 minutes.
      </p>
      {last && <div className="vd-errbox">Last attempt: {last}</div>}
      {err && <div className="vd-errbox" role="alert">{err}</div>}
      <div className="vd-choice vd-choice--2" style={{ marginTop: 14 }}>
        <button className="vd-btn vd-btn--primary" disabled={!!busy} onClick={card}>{busy === 'card' ? 'Opening WiPay…' : 'Pay by card'}</button>
        <button className="vd-btn vd-btn--secondary" disabled={!!busy} onClick={cash}>{busy === 'cash' ? 'Switching…' : kind === 'order' ? 'Pay cash on delivery' : 'Pay cash instead'}</button>
      </div>
    </div>
  );
}

// The page WiPay sends the customer back to (?vdpay=<paymentId>).
export function PaymentReturn({ go, paymentId, openDelivery, openOrder, openRide, domains }) {
  const valid = /^VD[0-9A-Z]{14}$/.test(paymentId || '');
  const live = useLive(() => (valid ? doc(dashDb(), 'dash_payments', paymentId) : null), [paymentId], docOf);
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(t); }, []);
  const p = live.data;
  const ride = p && p.targetKind === 'ride';
  const open = () => (ride ? openRide(p.targetId) : p.targetKind === 'order' ? openOrder(p.targetId) : openDelivery(p.targetId));
  const what = ride ? 'Ride' : p && p.targetKind === 'order' ? 'Order' : 'Delivery';
  useEffect(() => {
    if (p && p.status === 'paid' && !p.refundDue) { const t = setTimeout(open, 2500); return () => clearTimeout(t); }
    return undefined;
  }, [p && p.status, p && p.refundDue]); // eslint-disable-line

  const retry = async () => { setBusy('card'); setErr(''); try { await goToCard(p.targetKind, p.targetId); } catch (e) { setErr(errText(e)); setBusy(''); } };
  const cash = async () => {
    setBusy('cash'); setErr('');
    try { await api.payUseCash({ kind: p.targetKind, id: p.targetId }); open(); } catch (e) { setErr(errText(e)); setBusy(''); }
  };

  let body;
  if (!valid) {
    body = <EmptyState title="We couldn’t match that payment" body="If money left your account, contact support with the time you paid." action="My Orders" onAction={() => go('dash-history')} secondary="Contact support" onSecondary={() => go('contact-us')} />;
  } else if (live.error) {
    body = <ErrorState onRetry={live.retry} />;
  } else if (live.loading || ['creating', 'started'].includes(p && p.status)) {
    body = (
      <div className="vd-panel vd-done" role="status">
        <Skeleton h={90} w={90} r={45} style={{ margin: '0 auto 14px' }} />
        <h1>Checking your payment…</h1>
        <p>{slow ? 'WiPay hasn’t confirmed this payment yet. If you finished paying, it will show on your order shortly.' : 'This takes a few seconds.'}</p>
        {slow && <button className="vd-btn vd-btn--secondary" style={{ marginTop: 16 }} onClick={() => go('dash-history')}>My Orders</button>}
      </div>
    );
  } else if (!p) {
    body = <EmptyState title="We couldn’t find this payment" action="My Orders" onAction={() => go('dash-history')} />;
  } else if (p.status === 'paid') {
    body = (
      <div className="vd-panel vd-done">
        <div className="vd-done__art"><DoneArt /></div>
        <h1>{p.refundDue ? 'Payment received' : 'Payment received, thank you'}</h1>
        <p>{p.refundDue
          ? `Your ${ride ? 'ride' : 'order'} had already closed when the payment arrived. We’ll review a refund to your card.`
          : `${formatJMD(p.amountCents)} paid by card${p.card ? ` (${p.card})` : ''}. ${ride ? 'We’re finding your driver now.' : p.targetKind === 'order' ? 'Your order is on its way to the store.' : 'We’re finding your rider now.'}`}</p>
        <span className="vd-done__id">{what} {shortId(p.targetId)}</span>
        <div style={{ marginTop: 20 }}><button className="vd-btn vd-btn--primary vd-btn--block" onClick={open}>{ride ? 'Continue to your ride' : p.targetKind === 'order' ? 'Track order' : 'Track delivery'}</button></div>
      </div>
    );
  } else {
    body = (
      <div className="vd-panel vd-done">
        <div style={{ width: 64, height: 64, borderRadius: 32, background: '#fdecec', color: 'var(--vd-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Icon name="close" size={30} stroke={2.4} /></div>
        <h1>Payment didn’t go through</h1>
        <p>{p.message || 'Your card wasn’t charged.'} You can try again, pay cash instead, or cancel from your {ride ? 'ride' : 'order'}.</p>
        {err && <div className="vd-errbox" role="alert">{err}</div>}
        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          <button className="vd-btn vd-btn--primary vd-btn--block" disabled={!!busy} onClick={retry}>{busy === 'card' ? 'Opening WiPay…' : 'Try card again'}</button>
          <button className="vd-btn vd-btn--secondary vd-btn--block" disabled={!!busy} onClick={cash}>{busy === 'cash' ? 'Switching…' : 'Pay cash instead'}</button>
          <button className="vd-link" style={{ justifySelf: 'center' }} onClick={open}>{ride ? 'View ride' : 'View order'}</button>
        </div>
      </div>
    );
  }
  // VilleCabs rides come back to a plain VilleCabs-branded page, not the VilleDash shell.
  if (ride) {
    return (
      <div className="vd-root vd-root--tabbar-off" style={{ background: '#f5f6fa' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid var(--vd-line)', padding: '10px 16px' }}>
          <img src="/logo.png" alt="VilleCabs" style={{ height: 36, width: 'auto' }} />
        </div>
        <div className="vd-wrap vd-narrow" style={{ maxWidth: 560, paddingTop: 24, paddingBottom: 40 }}>{body}</div>
      </div>
    );
  }
  return (
    <Shell go={go} active="orders" domains={domains}>
      <div className="vd-wrap vd-narrow" style={{ maxWidth: 560, paddingTop: 24, paddingBottom: 40 }}>{body}</div>
    </Shell>
  );
}
