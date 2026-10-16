// Live tracking for one delivery (customer view).
import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { api, dashDb, errText, formatJMD, STATUS_LABEL, STEPS, FINAL } from './dashApi';
import { C, st, Header, Pill, statusTone, Spinner } from './ui';

const TRACKABLE = ['assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'];
const STALE_MS = 2 * 60 * 1000;

export default function DeliveryTrack({ go, deliveryId, shared }) {
  const { VilleMap, vcConfirm } = shared;
  const [d, setD] = useState(undefined);
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
    const u1 = onSnapshot(doc(db, 'dash_deliveries', deliveryId), (s) => setD(s.exists() ? { id: s.id, ...s.data() } : null), () => setD(null));
    const u2 = onSnapshot(doc(db, 'dash_deliveries', deliveryId, 'customer', 'pin'), (s) => setPin(s.exists() ? s.data().pin : null), () => {});
    const u3 = onSnapshot(query(collection(db, 'dash_deliveries', deliveryId, 'events'), orderBy('at', 'asc')),
      (s) => setEvents(s.docs.map((x) => x.data())), () => {});
    return () => { u1(); u2(); u3(); };
  }, [deliveryId]);

  // Rider location only while the job is active.
  const tracking = d && TRACKABLE.includes(d.status);
  useEffect(() => {
    if (!tracking) { setLoc(null); return undefined; }
    const u = onSnapshot(doc(dashDb(), 'dash_locations', deliveryId), (s) => setLoc(s.exists() ? s.data() : null), () => setLoc(null));
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => { u(); clearInterval(t); };
  }, [tracking, deliveryId]);

  if (d === undefined) return <div style={st.page}><Header title="Delivery" onBack={() => go('dash-home')} /><Spinner /></div>;
  if (d === null) return <div style={st.page}><Header title="Delivery" onBack={() => go('dash-home')} /><div style={st.wrap}><div style={st.card}>We couldn't find this delivery.</div></div></div>;

  const stepIndex = STEPS.indexOf(d.status);
  const locAge = loc?.at ? now - (loc.at.toMillis ? loc.at.toMillis() : loc.at) : null;
  const locFresh = loc && locAge != null && locAge < STALE_MS;
  const canCancel = d.type !== 'market' && ['requested', 'assigned', 'to_pickup'].includes(d.status);

  const markers = [
    { position: { lat: d.pickup.lat, lng: d.pickup.lng }, title: 'Pickup' },
    { position: { lat: d.dropoff.lat, lng: d.dropoff.lng }, title: 'Drop-off' },
  ];
  if (locFresh) markers.push({ position: { lat: loc.lat, lng: loc.lng }, title: 'Rider' });

  const cancel = async () => {
    const ok = await vcConfirm('Cancel this delivery?', { confirmText: 'Yes, cancel', danger: true });
    if (!ok) return;
    setBusy(true); setErr('');
    try { await api.cancel({ deliveryId, reason: 'Cancelled by customer' }); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <div style={st.page}>
      <Header title="Track delivery" onBack={() => go('dash-home')} right={<Pill tone={statusTone(d.status)}>{STATUS_LABEL[d.status]}</Pill>} />
      <div style={st.wrap}>
        {tracking && (
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`, marginBottom: 8 }}>
            <VilleMap height={240} center={locFresh ? { lat: loc.lat, lng: loc.lng } : { lat: d.pickup.lat, lng: d.pickup.lng }} zoom={14} markers={markers} />
          </div>
        )}
        {tracking && !locFresh && (
          <div style={st.note}>Live rider location is temporarily unavailable{loc ? ' — the last update is more than 2 minutes old' : ''}. Status updates still arrive here.</div>
        )}

        {d.status === 'requested' && (
          <div style={st.card}><div style={st.h2}>Finding a rider…</div><div style={st.sub}>We'll notify you when a rider accepts. You can cancel free of charge until the package is collected.</div></div>
        )}

        {!FINAL.includes(d.status) && pin && (
          <div style={{ ...st.card, textAlign: 'center', border: `2px solid ${C.purpleLine}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, textTransform: 'uppercase', letterSpacing: 0.6 }}>Delivery PIN</div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: 10, color: C.ink, margin: '6px 0' }}>{pin}</div>
            <div style={st.sub}>Share this with {d.dropoff.recipientName}. They give it to the rider only after receiving the package.</div>
          </div>
        )}

        {d.riderId && (
          <div style={st.card}>
            <div style={st.h2}>Your rider</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{d.riderName}</div>
                {d.riderPlate && <div style={{ fontSize: 12.5, color: C.quiet }}>Motorcycle {d.riderPlate}</div>}
              </div>
              {d.riderPhone && !FINAL.includes(d.status) && <a href={`tel:${d.riderPhone}`} style={{ ...st.btnGhost, width: 'auto', padding: '9px 14px', textDecoration: 'none' }}>📞 Call</a>}
            </div>
          </div>
        )}

        <div style={st.card}>
          <div style={st.h2}>Progress</div>
          {(d.status === 'cancelled' || d.status === 'failed')
            ? <div style={st.sub}>{d.status === 'cancelled' ? `Cancelled${d.cancelReason ? ` — ${d.cancelReason}` : ''}.` : `Could not be delivered${d.failReason ? ` — ${d.failReason}` : ''}. Support will contact you.`}</div>
            : STEPS.map((s, i) => (
              <div key={s} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0', opacity: i <= stepIndex ? 1 : 0.4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: i <= stepIndex ? C.purple : C.purpleLine }} />
                <div style={{ fontSize: 13.5, fontWeight: i === stepIndex ? 700 : 500 }}>{STATUS_LABEL[s]}</div>
              </div>
            ))}
          {events.length > 0 && <div style={{ fontSize: 11.5, color: C.quiet, marginTop: 8 }}>Last update {events[events.length - 1].at?.toDate?.().toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' })}</div>}
        </div>

        <div style={st.card}>
          <div style={st.h2}>Details</div>
          <div style={st.row}><span style={{ color: C.quiet }}>From</span><span style={{ textAlign: 'right' }}>{d.pickup.address}</span></div>
          <div style={st.row}><span style={{ color: C.quiet }}>To</span><span style={{ textAlign: 'right' }}>{d.dropoff.address}</span></div>
          <div style={st.row}><span style={{ color: C.quiet }}>Package</span><span>{d.package.description}</span></div>
          <div style={st.row}><span style={{ color: C.quiet }}>Total</span><b>{formatJMD(d.cashToCollectCents ?? d.quote.totalCents)} cash · paid by {d.payment.collectFrom === 'recipient' ? 'recipient' : 'sender'}</b></div>
          <div style={{ fontSize: 11.5, color: C.quiet, marginTop: 6 }}>Delivery ID {d.id}</div>
        </div>

        {err && <div style={st.err}>{err}</div>}
        {canCancel && <button style={{ ...st.btnDanger, marginBottom: 10 }} disabled={busy} onClick={cancel}>Cancel delivery</button>}
        <button style={st.btnGhost} onClick={() => setIssueOpen(!issueOpen)}>Report a problem</button>
        {issueOpen && <IssueForm deliveryId={deliveryId} onDone={() => setIssueOpen(false)} />}
      </div>
    </div>
  );
}

const CUSTOMER_ISSUES = [
  ['missing', 'Missing delivery'], ['late', 'Late delivery'], ['wrong_item', 'Wrong item'], ['damaged', 'Damaged item'],
  ['wrong_charge', 'Incorrect charge'], ['rider_conduct', 'Rider conduct'], ['other', 'Something else'],
];
export function IssueForm({ deliveryId, onDone, categories = CUSTOMER_ISSUES }) {
  const [cat, setCat] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.reportIssue({ deliveryId, category: cat, description: text });
      setMsg(`Reported. Case ${r.caseId.slice(0, 8).toUpperCase()} — support will follow up.`);
      setTimeout(onDone, 2500);
    } catch (e) { setMsg(errText(e)); }
    setBusy(false);
  };
  return (
    <div style={{ ...st.card, marginTop: 10 }}>
      <label style={st.label}>What went wrong?</label>
      <select style={st.input} value={cat} onChange={(e) => setCat(e.target.value)}>
        <option value="">Choose…</option>
        {categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label style={st.label}>Details</label>
      <textarea style={{ ...st.input, minHeight: 70 }} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      {msg && <div style={st.note}>{msg}</div>}
      <button style={{ ...st.btn, marginTop: 10, opacity: cat && !busy ? 1 : 0.5 }} disabled={!cat || busy} onClick={send}>Send report</button>
    </div>
  );
}
