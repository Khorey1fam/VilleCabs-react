// Live tracking for one delivery (customer view).
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { api, dashDb, errText, formatJMD, STATUS_LABEL, STEPS, FINAL } from './dashApi';
import { Shell, PageHead, Field, Icon, Chip, Skeleton, SkeletonRows, EmptyState, ErrorState, Timeline, useLive, docOf, fmtWhen, shortId } from './kit';
import { deliveryTone } from './Orders';
import { PaymentPending } from './Payments';

const TRACKABLE = ['assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'];
const STALE_MS = 2 * 60 * 1000;

export default function DeliveryTrack({ go, deliveryId, shared, domains }) {
  const { VilleMap, vcConfirm } = shared;
  const live = useLive(() => (deliveryId ? doc(dashDb(), 'dash_deliveries', deliveryId) : null), [deliveryId], docOf);
  const d = live.data;
  const [pin, setPin] = useState(null);
  const [loc, setLoc] = useState(null);
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!deliveryId) return undefined;
    const db = dashDb();
    const u2 = onSnapshot(doc(db, 'dash_deliveries', deliveryId, 'customer', 'pin'), (s) => setPin(s.exists() ? s.data().pin : null), () => {});
    const u3 = onSnapshot(query(collection(db, 'dash_deliveries', deliveryId, 'events'), orderBy('at', 'asc')), (s) => setEvents(s.docs.map((x) => x.data())), () => {});
    return () => { u2(); u3(); };
  }, [deliveryId]);

  const tracking = d && TRACKABLE.includes(d.status);
  useEffect(() => {
    if (!tracking) { setLoc(null); return undefined; }
    const u = onSnapshot(doc(dashDb(), 'dash_locations', deliveryId), (s) => setLoc(s.exists() ? s.data() : null), () => setLoc(null));
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => { u(); clearInterval(t); };
  }, [tracking, deliveryId]);

  const back = () => go('dash-history');
  const shell = (body) => <Shell go={go} active="track" domains={domains}><div className="vd-wrap">{body}</div></Shell>;
  if (live.error) return shell(<div style={{ paddingTop: 24 }}><ErrorState onRetry={live.retry} /></div>);
  if (live.loading) return shell(<div style={{ paddingTop: 24 }}><Skeleton h={34} w="60%" /><div style={{ marginTop: 16 }}><SkeletonRows n={3} h={140} /></div></div>);
  if (!d) return shell(<div style={{ paddingTop: 24 }}><EmptyState title="We couldn’t find this delivery" action="My Orders" onAction={back} /></div>);

  const stepIndex = STEPS.indexOf(d.status);
  const locAge = loc?.at ? now - (loc.at.toMillis ? loc.at.toMillis() : loc.at) : null;
  const locFresh = loc && locAge != null && locAge < STALE_MS;
  const canCancel = d.type !== 'market' && ['awaiting_payment', 'requested', 'assigned', 'to_pickup'].includes(d.status);
  const card = d.payment && d.payment.method === 'card';
  const ended = d.status === 'cancelled' || d.status === 'failed';
  const markers = [
    { position: { lat: d.pickup.lat, lng: d.pickup.lng }, title: 'Pickup' },
    { position: { lat: d.dropoff.lat, lng: d.dropoff.lng }, title: 'Drop-off' },
    ...(locFresh ? [{ position: { lat: loc.lat, lng: loc.lng }, title: 'Rider' }] : []),
  ];
  const lastAt = events.length ? events[events.length - 1].at : null;
  const timeline = STEPS.map((s, i) => ({
    key: s, title: STATUS_LABEL[s],
    state: i < stepIndex || (i === stepIndex && s === 'delivered') ? 'done' : i === stepIndex ? 'now' : 'todo',
    sub: i === stepIndex && lastAt?.toDate ? `Updated ${lastAt.toDate().toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' })}` : null,
  }));

  const cancel = async () => {
    if (!(await vcConfirm('Cancel this delivery?', { confirmText: 'Yes, cancel', danger: true }))) return;
    setBusy(true); setErr('');
    try { await api.cancel({ deliveryId, reason: 'Cancelled by customer' }); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const title = d.type === 'market' ? `Delivery from ${d.merchantName || 'store'}` : `Package to ${d.dropoff.recipientName || 'recipient'}`;

  return shell(
    <>
      <PageHead title={title} sub={`Delivery ${shortId(d.id)}, requested ${fmtWhen(d.createdAt)}`} crumb="My Orders" onCrumb={back}
        right={<Chip tone={deliveryTone(d.status)}>{STATUS_LABEL[d.status]}</Chip>} />
      <div className="vd-split" style={{ paddingBottom: 40 }}>
        <div className="vd-stack">
          {tracking && (
            <div>
              <div className="vd-map" style={{ marginTop: 0 }}>
                <VilleMap height={260} center={locFresh ? { lat: loc.lat, lng: loc.lng } : { lat: d.pickup.lat, lng: d.pickup.lng }} zoom={14} markers={markers} />
              </div>
              {!locFresh && <p className="vd-field__hint">Live rider location isn’t available right now{loc ? '; the last update is over 2 minutes old' : ''}. Status updates still arrive here.</p>}
            </div>
          )}
          {d.status === 'awaiting_payment' && <PaymentPending kind="delivery" id={d.id} target={d} />}
          {d.status === 'requested' && (
            <div className="vd-note"><b>Finding a rider.</b> We’ll notify you when a rider accepts. You can cancel free of charge until the package is collected.</div>
          )}
          {!FINAL.includes(d.status) && d.status !== 'awaiting_payment' && pin && (
            <div className="vd-pin">
              <div style={{ fontWeight: 650, color: 'var(--vd-deep)' }}>Delivery PIN</div>
              <div className="vd-pin__code" aria-label={`PIN ${String(pin).split('').join(' ')}`}>{pin}</div>
              <p>Share this with {d.dropoff.recipientName || 'the recipient'}. They give it to the rider only after receiving the package.</p>
            </div>
          )}
          <div className="vd-panel">
            <div className="vd-panel__title">Progress</div>
            {ended
              ? <p>{d.status === 'cancelled' ? `Cancelled${d.cancelReason ? `: ${d.cancelReason}` : ''}.` : `Couldn’t be delivered${d.failReason ? `: ${d.failReason}` : ''}. Support will contact you.`}</p>
              : <Timeline items={timeline} />}
            {d.riderId && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--vd-line)' }}>
                <div>
                  <div style={{ fontWeight: 650, color: 'var(--vd-ink)' }}>Your rider: {d.riderName}</div>
                  {d.riderPlate && <div className="vd-field__hint" style={{ marginTop: 0 }}>Motorcycle {d.riderPlate}</div>}
                </div>
                {d.riderPhone && !FINAL.includes(d.status) && <a className="vd-btn vd-btn--secondary vd-btn--sm" href={`tel:${d.riderPhone}`}><Icon name="phone" size={17} /> Call</a>}
              </div>
            )}
          </div>
        </div>
        <aside className="vd-split__aside">
          <div className="vd-panel">
            <div className="vd-panel__title">Receipt</div>
            <div className="vd-row"><span>From</span><span>{d.pickup.address}</span></div>
            <div className="vd-row"><span>To</span><span>{d.dropoff.address}</span></div>
            <div className="vd-row"><span>Package</span><span>{d.package.description}</span></div>
            {(d.quote?.lines || []).map((l) => <div key={l.key} className="vd-row"><span>{l.label}</span><span>{formatJMD(l.cents)}</span></div>)}
            <div className="vd-total"><span>{card ? 'Total, by card' : 'Total, cash'}</span><b>{formatJMD(card ? d.quote.totalCents : (d.cashToCollectCents ?? d.quote.totalCents))}</b></div>
            <p className="vd-field__hint">{card
              ? ({ paid: 'Paid by card.', refund_due: 'VilleDash is reviewing a refund of your card payment.', refunded: `${formatJMD(d.payment.refundedCents || d.quote.totalCents)} was refunded to your card.` }[d.payment.status] || 'Waiting for your card payment.')
              : `Paid in cash by the ${d.payment?.collectFrom === 'recipient' ? 'recipient on delivery' : 'sender at pickup'}.`}</p>
            {d.proofPhotos && (d.proofPhotos.pickup || d.proofPhotos.dropoff) && (
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                {['pickup', 'dropoff'].filter((k) => d.proofPhotos[k]).map((k) => (
                  <a key={k} href={d.proofPhotos[k].url} target="_blank" rel="noreferrer" style={{ fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>
                    <img src={d.proofPhotos[k].url} alt={k === 'pickup' ? 'Photo at pickup' : 'Photo at delivery'} loading="lazy" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
                    {k === 'pickup' ? 'At pickup' : 'At delivery'}
                  </a>
                ))}
              </div>
            )}
          </div>
          {err && <div className="vd-errbox" role="alert">{err}</div>}
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {canCancel && <button className="vd-btn vd-btn--danger vd-btn--block" disabled={busy} onClick={cancel}>Cancel delivery</button>}
            <button className="vd-btn vd-btn--secondary vd-btn--block" aria-expanded={issueOpen} onClick={() => setIssueOpen(!issueOpen)}>Report a problem</button>
          </div>
          {issueOpen && <IssueForm deliveryId={deliveryId} onDone={() => setIssueOpen(false)} />}
        </aside>
      </div>
    </>,
  );
}

const CUSTOMER_ISSUES = [
  ['missing', 'Missing delivery'], ['late', 'Late delivery'], ['wrong_item', 'Wrong item'], ['damaged', 'Damaged item'],
  ['wrong_charge', 'Incorrect charge'], ['rider_conduct', 'Rider conduct'], ['other', 'Something else'],
];
// Also used by the rider portal (which passes its own categories).
export function IssueForm({ deliveryId, onDone, categories = CUSTOMER_ISSUES }) {
  const [cat, setCat] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.reportIssue({ deliveryId, category: cat, description: text });
      setMsg(`Reported. Your case number is ${r.caseId.slice(0, 8).toUpperCase()}; support will follow up.`);
      setTimeout(onDone, 2500);
    } catch (e) { setMsg(errText(e)); }
    setBusy(false);
  };
  return (
    <div className="vd-root" style={{ minHeight: 0, padding: 0, background: 'transparent' }}>
    <div className="vd-panel" style={{ marginTop: 12 }}>
      <Field label="What went wrong?">
        <select className="vd-input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Choose…</option>
          {categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Details">
        <textarea className="vd-input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      </Field>
      {msg && <p className="vd-note" style={{ marginTop: 12 }} role="status">{msg}</p>}
      <button className="vd-btn vd-btn--primary vd-btn--block" style={{ marginTop: 12 }} disabled={!cat || busy} onClick={send}>{busy ? 'Sending…' : 'Send report'}</button>
    </div>
    </div>
  );
}
