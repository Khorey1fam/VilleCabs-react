// VilleDash section of the admin panel (/admin → VilleDash tab).
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, orderBy, limit, setDoc, updateDoc, where, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { api, dashDb, errText, formatJMD, STATUS_LABEL, FINAL, ORDER_LABEL, MERCHANT_CATEGORIES } from './dashApi';
import { C, st, Pill, statusTone, Spinner } from './ui';
import { FleetTab, ScheduleTab } from './AdminFleet';
import { SitesTab } from './AdminSites';
import { FinanceTab, SupportTab, AuditTab } from './AdminFinance';

const ACTIVE = ['requested', 'assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'];
const card = { ...st.card, padding: 14 };
const small = { padding: '6px 10px', fontSize: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const ts = (t) => (t?.toDate ? t.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

function useCol(path, ...constraints) {
  const [rows, setRows] = useState(null);
  const key = JSON.stringify([path, constraints.map(String)]);
  useEffect(() => {
    const q = constraints.length ? query(collection(dashDb(), path), ...constraints) : collection(dashDb(), path);
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn(path, e.message); setRows([]); });
  }, [key]);
  return rows;
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <div style={{ fontSize: 11, color: '#8a83a0', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.ink, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.quiet }}>{sub}</div>}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ deliveries, riders }) {
  const since = useMemo(() => Timestamp.fromDate(new Date(Date.now() - 30 * 864e5)), []);
  const unserved = useCol('dash_demand_events', where('kind', '==', 'unserved'), where('at', '>=', since));
  if (!deliveries || !riders) return <Spinner />;
  const by = (s) => deliveries.filter((d) => d.status === s).length;
  const done = deliveries.filter((d) => d.status === 'delivered');
  const fees = done.reduce((s, d) => s + (d.quote?.totalCents || 0), 0);
  const riderPay = done.reduce((s, d) => s + (d.riderPayCents || 0), 0);
  const marketDone = done.filter((d) => d.type === 'market');
  const sales = marketDone.reduce((s, d) => s + (d.market?.subtotalCents || 0), 0);
  const commission = marketDone.reduce((s, d) => s + (d.market?.commissionCents || 0), 0);
  const approved = riders.filter((r) => r.status === 'approved');
  const online = approved.filter((r) => r.isOnline);
  const busy = online.filter((r) => r.activeDeliveryId);
  const noBike = online.filter((r) => !r.motorcycleId);
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>Last 30 days. Fleet-provider charges and rider cash are in the Finance tab.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Requests" value={deliveries.length} sub="all statuses" />
        <Stat label="Active now" value={deliveries.filter((d) => ACTIVE.includes(d.status)).length} color={C.purple} />
        <Stat label="Unassigned" value={by('requested')} color={by('requested') ? C.amber : undefined} />
        <Stat label="Delivered" value={done.length} color={C.green} />
        <Stat label="Cancelled" value={by('cancelled')} />
        <Stat label="Failed" value={by('failed')} color={by('failed') ? C.red : undefined} />
        <Stat label="Missed requests" value={unserved ? unserved.length : '…'} sub="no rider free" />
        <Stat label="Riders online" value={`${online.length - busy.length} free / ${online.length}`} sub={`${busy.length} on deliveries · ${approved.length} approved${noBike.length ? ` · ${noBike.length} without a bike` : ''}`} />
        <Stat label="Delivery fees" value={formatJMD(fees)} sub="gross, completed only" />
        <Stat label="Rider pay" value={formatJMD(riderPay)} sub="earned on completed" />
        <Stat label="Store sales" value={formatJMD(sales)} sub={`${marketDone.length} orders · merchants' gross`} />
        <Stat label="Commission" value={formatJMD(commission)} sub="platform share of store sales" />
        <Stat label="Contribution" value={formatJMD(fees + commission - riderPay)} sub="delivery fees + commission − rider pay, before fleet & other costs" />
      </div>
    </>
  );
}

// ── Deliveries / dispatch ────────────────────────────────────────────────────
function DeliveryCard({ d, riders }) {
  const [riderId, setRiderId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState({});
  useEffect(() => { if (open) getDoc(doc(dashDb(), 'dash_deliveries', d.id, 'private', 'contact')).then((x) => setContact(x.exists() ? x.data() : {})).catch(() => {}); }, [open, d.id]);
  const run = async (fn) => { setBusy(true); setMsg(''); try { await fn(); setMsg('Done.'); } catch (e) { setMsg(errText(e)); } setBusy(false); };
  const assignable = ['requested', 'assigned', 'to_pickup', 'at_pickup'].includes(d.status);
  const alert = d.needsDispatcher && d.status === 'requested';
  const candidates = riders.filter((r) => r.status === 'approved' && (!r.activeDeliveryId || r.activeDeliveryId === d.id));
  return (
    <div style={{ ...card, ...(alert ? { border: `2px solid ${C.red}` } : {}) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.pickup.address.split(',')[0]} → {d.dropoff.address.split(',')[0]}</div>
        <Pill tone={statusTone(d.status)}>{STATUS_LABEL[d.status]}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>
        {d.id} · {ts(d.createdAt)} · collect {formatJMD(d.cashToCollectCents ?? d.quote.totalCents)} cash{d.type === 'market' ? ` (delivery ${formatJMD(d.quote.totalCents)})` : ''} · {d.quote.distanceKm} km · {d.package.size}{d.package.fragile ? ' fragile' : ''}
        {d.riderName ? ` · Rider: ${d.riderName}` : d.offeredTo ? ` · Offered to ${riders.find((r) => r.id === d.offeredTo)?.name || 'a rider'}` : ' · No rider'}{d.pinLocked ? ' · PIN LOCKED' : ''}{d.needsDispatcher && d.status === 'requested' ? ' · ⚠ NO RIDER TOOK IT — assign by hand' : ''}
      </div>
      <button onClick={() => setOpen(!open)} style={{ ...small, marginTop: 8, background: C.purpleSoft, color: C.purple, border: `1px solid ${C.purpleLine}` }}>{open ? 'Hide' : 'Manage'}</button>
      {open && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div><b>Customer:</b> {d.customerName} {contact.customerPhone || d.customerPhone || ''}</div>
          <div><b>Sender:</b> {d.pickup.contactName} {contact.senderPhone || d.pickup.contactPhone || ''} — {d.pickup.address}</div>
          <div><b>Recipient:</b> {d.dropoff.recipientName} {contact.recipientPhone || d.dropoff.recipientPhone || ''}{contact.altPhone ? ` (alt ${contact.altPhone})` : ''} — {d.dropoff.address}</div>
          <div><b>Package:</b> {d.package.category} · {d.package.description}</div>
          {d.proofPhotos && <div style={{ marginTop: 4 }}><b>Proof:</b> {['pickup', 'dropoff'].filter((k) => d.proofPhotos[k]).map((k) => <a key={k} href={d.proofPhotos[k].url} target="_blank" rel="noreferrer" style={{ color: C.purple, marginRight: 10 }}>{k} photo</a>)}</div>}
          {d.proofOfDelivery && <div><b>Completed by:</b> {d.proofOfDelivery.method === 'pin' ? 'PIN verified' : `admin exception — ${d.proofOfDelivery.note || ''}`}</div>}
          {assignable && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <select style={{ ...st.input, width: 'auto', flex: 1, minWidth: 180 }} value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                <option value="">Choose a rider…</option>
                {candidates.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isOnline ? ' (online)' : ' (offline)'}</option>)}
              </select>
              <button disabled={!riderId || busy} onClick={() => run(() => api.assign({ deliveryId: d.id, riderId }))}
                style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>{d.riderId ? 'Reassign' : 'Assign'}</button>
            </div>
          )}
          {!FINAL.includes(d.status) && (
            <>
              <input style={{ ...st.input, marginTop: 10 }} placeholder="Reason (required — saved in the audit log)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {['collected', 'to_dropoff', 'at_dropoff'].includes(d.status) && (
                  <button disabled={!note || busy} onClick={() => run(() => api.resolve({ deliveryId: d.id, action: 'complete', note }))}
                    style={{ ...small, background: '#e8f7ef', color: C.green, border: '1px solid #bfe8d0' }}>Mark delivered (exception)</button>
                )}
                <button disabled={!note || busy} onClick={() => run(() => api.resolve({ deliveryId: d.id, action: 'fail', note }))}
                  style={{ ...small, background: '#fff7e6', color: C.amber, border: '1px solid #fde3b0' }}>Mark failed</button>
                <button disabled={busy} onClick={() => run(() => (d.type === 'market'
                  ? api.marketCancel({ orderId: d.orderId, reason: note || 'Cancelled by admin' })
                  : api.cancel({ deliveryId: d.id, reason: note || 'Cancelled by admin' })))}
                  style={{ ...small, background: '#fff5f5', color: C.red, border: '1px solid #fecaca' }}>Cancel</button>
              </div>
            </>
          )}
          {msg && <div style={{ ...st.note, marginTop: 8 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

function Deliveries({ deliveries, riders }) {
  const [filter, setFilter] = useState('active');
  if (!deliveries || !riders) return <Spinner />;
  const list = filter === 'active' ? deliveries.filter((d) => ACTIVE.includes(d.status))
    : filter === 'unassigned' ? deliveries.filter((d) => d.status === 'requested') : deliveries;
  // Jobs nobody took come first.
  const sorted = [...list].sort((a, b) => Number(!!(b.needsDispatcher && b.status === 'requested')) - Number(!!(a.needsDispatcher && a.status === 'requested')));
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['active', 'Active'], ['unassigned', 'Unassigned'], ['all', 'All (30 days)']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...small, background: filter === k ? C.purple : '#f3f4f6', color: filter === k ? C.white : '#555', border: 'none' }}>{l}</button>
        ))}
      </div>
      {sorted.length === 0 ? <div style={{ ...card, color: C.quiet }}>Nothing here.</div> : sorted.map((d) => <DeliveryCard key={d.id} d={d} riders={riders} />)}
    </>
  );
}

// ── Riders ───────────────────────────────────────────────────────────────────
function RiderRow({ r }) {
  const [plate, setPlate] = useState(r.motorcyclePlate || '');
  const [msg, setMsg] = useState('');
  const save = async (patch) => {
    setMsg('');
    try { await updateDoc(doc(dashDb(), 'riders', r.id), { ...patch, updatedAt: serverTimestamp() }); setMsg('Saved.'); } catch (e) { setMsg('Could not save.'); }
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div><b>{r.name}</b> <span style={{ color: C.quiet, fontSize: 12.5 }}>{r.phone} · {r.email}</span></div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill tone={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : 'red'}>{r.status}</Pill>
          {r.status === 'approved' && <Pill tone={r.isOnline ? 'green' : 'grey'}>{r.isOnline ? (r.activeDeliveryId ? 'on a job' : 'online') : 'offline'}</Pill>}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>
        Licence {r.licenceNumber || '—'}{r.licenceExpiry ? ` (exp ${r.licenceExpiry})` : ''} · Emergency: {r.emergencyContact?.name} {r.emergencyContact?.phone} · Completed: {r.completedCount || 0}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={r.backgroundCheck || 'not_started'} onChange={(e) => save({ backgroundCheck: e.target.value })} style={{ ...st.input, width: 'auto', padding: '6px 8px' }}>
          <option value="not_started">Background check: not started</option><option value="in_progress">Background check: in progress</option>
          <option value="passed">Background check: passed</option><option value="failed">Background check: failed</option>
        </select>
        {r.status !== 'approved' && <button disabled={r.backgroundCheck !== 'passed'} title={r.backgroundCheck !== 'passed' ? 'Mark the background check passed first' : ''}
          onClick={() => save({ status: 'approved', approvedAt: serverTimestamp() })} style={{ ...small, background: C.green, color: C.white, border: 'none', opacity: r.backgroundCheck === 'passed' ? 1 : 0.45 }}>Approve</button>}
        {r.status === 'pending' && <button onClick={() => save({ status: 'rejected' })} style={{ ...small, background: '#fff5f5', color: C.red, border: '1px solid #fecaca' }}>Reject</button>}
        {r.status === 'approved' && !r.activeDeliveryId && <button onClick={() => save({ status: 'suspended', isOnline: false })} style={{ ...small, background: '#f3f4f6', color: '#555', border: '1px solid #e5e7eb' }}>Suspend</button>}
        {r.status === 'approved' && r.isOnline && !r.activeDeliveryId && <button onClick={() => save({ isOnline: false })} style={{ ...small, background: '#f3f4f6', color: '#555', border: '1px solid #e5e7eb' }}>Set offline</button>}
        <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Motorcycle plate" style={{ ...st.input, width: 150, padding: '6px 10px' }} />
        <button onClick={() => save({ motorcyclePlate: plate.trim() || null })} style={{ ...small, background: C.purpleSoft, color: C.purple, border: `1px solid ${C.purpleLine}` }}>Save plate</button>
        {msg && <span style={{ fontSize: 12, color: C.quiet }}>{msg}</span>}
      </div>
    </div>
  );
}
function Riders({ riders }) {
  if (!riders) return <Spinner />;
  const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
  const list = [...riders].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>Riders apply at villecabs.com/rider. Approve only after ID, licence, police record and road check.</div>
      {list.length === 0 ? <div style={{ ...card, color: C.quiet }}>No rider applications yet.</div> : list.map((r) => <RiderRow key={r.id} r={r} />)}
    </>
  );
}

// ── Pricing ──────────────────────────────────────────────────────────────────
const PRICE_FIELDS = [
  ['baseFeeCents', 'Base delivery fee (J$)', true], ['perKmCents', 'Price per km (J$)', true], ['minimumCents', 'Minimum charge (J$)', true],
  ['fragileSurchargeCents', 'Fragile surcharge (J$)', true], ['roundToCents', 'Round totals up to the next (J$)', true],
  ['riderBaseCents', 'Rider pay per delivery (J$)', true], ['riderPerKmCents', 'Rider pay per km (J$)', true],
  ['roadFactor', 'Road distance factor (× straight line)', false], ['maxDistanceKm', 'Longest delivery (km)', false],
  ['merchantCommissionPct', 'Merchant commission (%)', false], ['settlementPeriodDays', 'Merchant settlement period (days)', false],
  ['maxActivePerCustomer', 'Max deliveries in progress per customer', false], ['pinMaxAttempts', 'Wrong PIN attempts before lock', false],
  ['deliveriesPerRiderHour', 'Deliveries one rider handles per hour (for scheduling)', false],
  ['offerSeconds', 'Seconds a rider has to accept an offer', false], ['maxOfferRounds', 'Riders to try before opening a job to all', false],
];
const DEFAULTS = {
  baseFeeCents: 30000, perKmCents: 6000, minimumCents: 50000, fragileSurchargeCents: 10000, roundToCents: 1000,
  riderBaseCents: 20000, riderPerKmCents: 3000, roadFactor: 1.3, maxDistanceKm: 25,
  merchantCommissionPct: 15, settlementPeriodDays: 14, maxActivePerCustomer: 3, pinMaxAttempts: 5, deliveriesPerRiderHour: 2, offerSeconds: 45, maxOfferRounds: 5,
  serviceArea: { lat: 18.0416, lng: -77.5036, radiusKm: 15 },
  sizes: { small: { label: 'Small — fits in a backpack', maxKg: 5, surchargeCents: 0 }, medium: { label: 'Medium — shoebox to small box', maxKg: 10, surchargeCents: 15000 }, large: { label: 'Large — strapped to the bike', maxKg: 20, surchargeCents: 30000 } },
};
function Pricing() {
  const [cur, setCur] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(doc(dashDb(), 'dash_pricing', 'current'), (s) => {
    const v = s.exists() ? s.data() : { ...DEFAULTS, version: 0, placeholder: true };
    setCur(v);
    const f = {};
    PRICE_FIELDS.forEach(([k, , money]) => { const raw = v[k] ?? DEFAULTS[k]; f[k] = money ? String(raw / 100) : String(raw); });
    f.radiusKm = String(v.serviceArea?.radiusKm ?? DEFAULTS.serviceArea.radiusKm);
    ['small', 'medium', 'large'].forEach((z) => { f[`${z}Sur`] = String(((v.sizes || DEFAULTS.sizes)[z]?.surchargeCents ?? DEFAULTS.sizes[z].surchargeCents) / 100); });
    setForm(f);
  }), []);
  if (!form) return <Spinner />;
  const save = async () => {
    setMsg('');
    const out = {};
    for (const [k, label, money] of PRICE_FIELDS) {
      const n = Number(form[k]);
      if (!Number.isFinite(n) || n < 0) { setMsg(`${label} must be a number.`); return; }
      out[k] = money ? Math.round(n * 100) : n;
    }
    const sizes = JSON.parse(JSON.stringify(cur.sizes || DEFAULTS.sizes));
    for (const z of ['small', 'medium', 'large']) {
      const n = Number(form[`${z}Sur`]);
      if (!Number.isFinite(n) || n < 0) { setMsg('Size surcharges must be numbers.'); return; }
      sizes[z] = { ...(sizes[z] || DEFAULTS.sizes[z]), surchargeCents: Math.round(n * 100) };
    }
    try {
      await setDoc(doc(dashDb(), 'dash_pricing', 'current'), {
        ...out, sizes, serviceArea: { ...(cur.serviceArea || DEFAULTS.serviceArea), radiusKm: Number(form.radiusKm) || 15 },
        version: (cur.version || 0) + 1, placeholder: false, currency: 'JMD', updatedAt: serverTimestamp(),
      }, { merge: true });
      setMsg('Saved. New quotes use these prices immediately.');
    } catch (e) { setMsg('Could not save prices.'); }
  };
  const input = (k, label) => (
    <div key={k}><label style={st.label}>{label}</label><input style={st.input} inputMode="decimal" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
  );
  return (
    <div style={card}>
      {cur.placeholder !== false && <div style={st.note}>These are placeholder prices. Set your real rates and save to replace them.</div>}
      <div style={{ fontSize: 12.5, color: C.quiet }}>Version {cur.version || 0}{cur.updatedAt ? ` · updated ${ts(cur.updatedAt)}` : ''}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0 14px' }}>
        {PRICE_FIELDS.map(([k, l]) => input(k, l))}
        {input('radiusKm', 'Service radius around Mandeville (km)')}
        {input('smallSur', 'Small package surcharge (J$)')}
        {input('mediumSur', 'Medium package surcharge (J$)')}
        {input('largeSur', 'Large package surcharge (J$)')}
      </div>
      <button onClick={save} style={{ ...st.btn, marginTop: 14 }}>Save prices</button>
      {msg && <div style={st.note}>{msg}</div>}
    </div>
  );
}

// ── Launch switch ────────────────────────────────────────────────────────────
function Launch() {
  const [f, setF] = useState(null);
  const [tester, setTester] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'features'), (s) => setF(s.exists() ? s.data() : {})), []);
  if (!f) return <Spinner />;
  const save = async (patch) => {
    setMsg('');
    try { await setDoc(doc(dashDb(), 'config', 'features'), { ...patch, updatedAt: serverTimestamp() }, { merge: true }); setMsg('Saved.'); } catch (e) { setMsg('Could not save.'); }
  };
  const addTester = async () => {
    const v = tester.trim(); if (!v) return;
    let uid = v;
    if (v.includes('@')) { setMsg('Paste the customer’s user ID (from the Customers tab), not their email.'); return; }
    const snap = await getDoc(doc(dashDb(), 'customers', uid)).catch(() => null);
    if (!snap || !snap.exists()) { setMsg('No customer with that ID.'); return; }
    await save({ dashTesters: [...new Set([...(f.dashTesters || []), uid])] });
    setTester('');
  };
  return (
    <div style={card}>
      <div style={st.h2}>VilleDash visibility</div>
      <div style={{ fontSize: 13, color: C.quiet, marginBottom: 10 }}>
        When off, customers see VilleCabs exactly as before. Testers below see VILLE and VilleDash even while it's off.
      </div>
      <button onClick={() => save({ dash: !f.dash })}
        style={{ ...st.btn, width: 'auto', padding: '10px 18px', background: f.dash ? C.red : `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})` }}>
        {f.dash ? 'Turn VilleDash OFF for everyone' : 'Turn VilleDash ON for everyone'}
      </button>
      <div style={{ marginTop: 6, fontSize: 13 }}>Currently: <b>{f.dash ? 'ON for all customers' : 'OFF (testers only)'}</b></div>
      <label style={st.label}>Pilot testers (customer user IDs)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ ...st.input, flex: 1 }} value={tester} onChange={(e) => setTester(e.target.value)} placeholder="Customer user ID" />
        <button onClick={addTester} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Add</button>
      </div>
      {(f.dashTesters || []).map((u) => (
        <div key={u} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
          <span>{u}</span>
          <button onClick={() => save({ dashTesters: (f.dashTesters || []).filter((x) => x !== u) })} style={{ ...small, background: 'none', border: 'none', color: C.red }}>Remove</button>
        </div>
      ))}
      {msg && <div style={st.note}>{msg}</div>}
      <AutoDispatchSwitch />
    </div>
  );
}

function AutoDispatchSwitch() {
  const [p, setP] = useState(null);
  useEffect(() => onSnapshot(doc(dashDb(), 'dash_pricing', 'current'), (s) => setP(s.exists() ? s.data() : {}), () => setP({})), []);
  if (!p) return null;
  const on = p.autoDispatch !== false;
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
      <div style={st.h2}>Dispatch mode</div>
      <div style={{ fontSize: 13, color: C.quiet, marginBottom: 8 }}>
        {on ? `Automatic: each job is offered to the nearest free rider for ${p.offerSeconds || 45} seconds, then the next. After ${p.maxOfferRounds || 5} riders it opens to everyone and shows red in Dispatch.`
          : 'Open: every free rider is notified and the first to accept gets the job.'} You can always assign by hand.
      </div>
      <button onClick={() => setDoc(doc(dashDb(), 'dash_pricing', 'current'), { autoDispatch: !on, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {})}
        style={{ ...small, padding: '8px 14px', background: C.purple, color: C.white, border: 'none' }}>{on ? 'Switch to open dispatch' : 'Switch to automatic dispatch'}</button>
    </div>
  );
}

// ── Store orders ─────────────────────────────────────────────────────────────
function StoreOrders() {
  const since = useMemo(() => Timestamp.fromDate(new Date(Date.now() - 14 * 864e5)), []);
  const orders = useCol('dash_orders', where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(300));
  const [msg, setMsg] = useState('');
  if (!orders) return <Spinner />;
  const stuck = (o) => o.status === 'awaiting_merchant' && o.createdAt?.toMillis && Date.now() - o.createdAt.toMillis() > 10 * 60000;
  const cancel = async (o) => {
    setMsg('');
    try { await api.marketCancel({ orderId: o.id, reason: 'Cancelled by VilleDash admin' }); setMsg(`Order ${o.id.slice(-6)} cancelled.`); } catch (e) { setMsg(errText(e)); }
  };
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>Last 14 days. Orders waiting more than 10 minutes for the store are flagged — call the store.</div>
      {msg && <div style={st.note}>{msg}</div>}
      {orders.length === 0 ? <div style={{ ...card, color: C.quiet }}>No store orders yet.</div> : orders.map((o) => (
        <div key={o.id} style={{ ...card, border: stuck(o) ? `2px solid ${C.amber}` : card.border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <b>{o.merchantName} → {o.customerName}</b>
            <Pill tone={o.status === 'delivered' ? 'green' : ['rejected', 'cancelled', 'failed'].includes(o.status) ? 'grey' : stuck(o) ? 'amber' : 'purple'}>{ORDER_LABEL[o.status]}</Pill>
          </div>
          <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>
            #{o.id.slice(-6)} · {ts(o.createdAt)} · {o.items.reduce((s, i) => s + i.qty, 0)} items · total {formatJMD(o.totalCents)} · store gets {formatJMD(o.merchantPayableCents)} · store {o.merchantPhone || '—'} · customer {o.customerPhone}
          </div>
          {['awaiting_merchant', 'accepted', 'preparing', 'ready'].includes(o.status) && (
            <button onClick={() => cancel(o)} style={{ ...small, marginTop: 8, background: '#fff5f5', color: C.red, border: '1px solid #fecaca' }}>Cancel order</button>
          )}
        </div>
      ))}
    </>
  );
}

// ── Merchants ────────────────────────────────────────────────────────────────
function MerchantRow({ m }) {
  const [pct, setPct] = useState(m.commissionPct ?? '');
  const [msg, setMsg] = useState('');
  const save = async (patch) => {
    setMsg('');
    try { await updateDoc(doc(dashDb(), 'merchants', m.id), { ...patch, updatedAt: serverTimestamp() }); setMsg('Saved.'); } catch (e) { setMsg('Could not save.'); }
  };
  const cat = (MERCHANT_CATEGORIES.find(([k]) => k === m.category) || [m.category, m.category])[1];
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div><b>{m.name}</b> <span style={{ fontSize: 12.5, color: C.quiet }}>{cat} · {m.phone} · rep: {m.representative || '—'}</span></div>
        <Pill tone={m.status === 'approved' ? 'green' : m.status === 'pending' ? 'amber' : 'red'}>{m.status}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>{m.address}{m.registrationNo ? ` · Reg/TRN ${m.registrationNo}` : ''}{m.location ? '' : ' · NO PICKUP PIN'}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {m.status !== 'approved' && <button disabled={!m.location} onClick={() => save({ status: 'approved', approvedAt: serverTimestamp() })} style={{ ...small, background: C.green, color: C.white, border: 'none' }}>Approve</button>}
        {m.status === 'pending' && <button onClick={() => save({ status: 'rejected' })} style={{ ...small, background: '#fff5f5', color: C.red, border: '1px solid #fecaca' }}>Reject</button>}
        {m.status === 'approved' && <button onClick={() => save({ status: 'suspended', isAcceptingOrders: false })} style={{ ...small, background: '#f3f4f6', color: '#555', border: '1px solid #e5e7eb' }}>Suspend</button>}
        <input value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Commission % (default 15)" style={{ ...st.input, width: 190, padding: '6px 10px' }} />
        <button onClick={() => { const n = pct === '' ? null : Number(pct); if (n !== null && !(n >= 0 && n <= 50)) { setMsg('Commission must be 0–50%.'); return; } save({ commissionPct: n }); }}
          style={{ ...small, background: C.purpleSoft, color: C.purple, border: `1px solid ${C.purpleLine}` }}>Save commission</button>
        {msg && <span style={{ fontSize: 12, color: C.quiet }}>{msg}</span>}
      </div>
    </div>
  );
}
function Merchants() {
  const list = useCol('merchants');
  if (!list) return <Spinner />;
  const order = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>Stores register at villecabs.com/merchant. Approve only after checking business documents and agreeing settlement details offline. Pharmacies and regulated goods stay off.</div>
      {list.length === 0 ? <div style={{ ...card, color: C.quiet }}>No store applications yet.</div>
        : [...list].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)).map((m) => <MerchantRow key={m.id} m={m} />)}
    </>
  );
}

// ── Settlements ──────────────────────────────────────────────────────────────
function Settlements() {
  const unsettled = useCol('ledger_entries', where('kind', '==', 'merchant_payable'), where('settled', '==', false));
  const settlements = useCol('settlements', orderBy('createdAt', 'desc'), limit(100));
  const [msg, setMsg] = useState('');
  const [refs, setRefs] = useState({});
  if (!unsettled || !settlements) return <Spinner />;
  const owed = {};
  unsettled.forEach((e) => {
    const k = e.partyId; owed[k] = owed[k] || { n: 0, net: 0, oldest: Infinity };
    owed[k].n += 1; owed[k].net += e.amountCents; owed[k].oldest = Math.min(owed[k].oldest, e.createdAt?.toMillis?.() || Date.now());
  });
  const names = Object.fromEntries(settlements.map((s) => [s.merchantId, s.merchantName]));
  const create = async (merchantId) => {
    setMsg('');
    try { const r = await api.settle({ merchantId, upTo: new Date().toISOString() }); setMsg(`Settlement created: ${r.orderCount} orders, ${formatJMD(r.netPayableCents)} to pay.`); } catch (e) { setMsg(errText(e)); }
  };
  const paid = async (id) => {
    setMsg('');
    try { await api.settlePaid({ settlementId: id, reference: refs[id] || '' }); setMsg('Marked paid.'); } catch (e) { setMsg(errText(e)); }
  };
  return (
    <>
      {msg && <div style={st.note}>{msg}</div>}
      <div style={st.h2}>Owed to stores (not yet settled)</div>
      {Object.keys(owed).length === 0 ? <div style={{ ...card, color: C.quiet }}>Nothing owed right now.</div> : Object.entries(owed).map(([mid, o]) => {
        const days = Math.floor((Date.now() - o.oldest) / 864e5);
        return (
          <div key={mid} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div><b>{names[mid] || mid}</b><div style={{ fontSize: 12.5, color: C.quiet }}>{o.n} delivered orders · oldest {days} day(s) ago{days >= 14 ? ' · DUE' : ''}</div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><b>{formatJMD(o.net)}</b>
              <button onClick={() => create(mid)} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Create settlement</button></div>
          </div>
        );
      })}
      <div style={{ ...st.h2, marginTop: 16 }}>Settlements</div>
      {settlements.length === 0 ? <div style={{ ...card, color: C.quiet }}>None yet.</div> : settlements.map((s) => (
        <div key={s.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b>{s.merchantName}</b><Pill tone={s.status === 'paid' ? 'green' : 'amber'}>{s.status === 'paid' ? 'Paid' : 'To pay'}</Pill>
          </div>
          <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>{ts(s.periodStart)} – {ts(s.periodEnd)} · {s.orderCount} orders · gross {formatJMD(s.grossSalesCents)} − commission {formatJMD(s.commissionCents)} = <b style={{ color: C.ink }}>{formatJMD(s.netPayableCents)}</b>{s.paymentReference ? ` · ref ${s.paymentReference}` : ''}</div>
          {s.status !== 'paid' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input style={{ ...st.input, flex: 1, padding: '6px 10px' }} placeholder="Bank transfer / receipt reference" value={refs[s.id] || ''} onChange={(e) => setRefs({ ...refs, [s.id]: e.target.value })} />
              <button onClick={() => paid(s.id)} style={{ ...small, background: C.green, color: C.white, border: 'none' }}>Mark paid</button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export default function AdminDashTab() {
  const [sub, setSub] = useState('overview');
  const since = useMemo(() => Timestamp.fromDate(new Date(Date.now() - 30 * 864e5)), []);
  const deliveries = useCol('dash_deliveries', where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(500));
  const riders = useCol('riders');
  const [perRiderHour, setPerRiderHour] = useState(2);
  useEffect(() => onSnapshot(doc(dashDb(), 'dash_pricing', 'current'), (s) => { const v = s.exists() ? s.data().deliveriesPerRiderHour : null; if (v > 0) setPerRiderHour(v); }, () => {}), []);
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['overview', 'Overview'], ['deliveries', 'Dispatch'], ['orders', 'Store orders'], ['schedule', 'Schedule'], ['riders', 'Riders'], ['fleet', 'Fleet'], ['merchants', 'Merchants'], ['settlements', 'Settlements'], ['finance', 'Finance'], ['support', 'Support'], ['pricing', 'Pricing'], ['sites', 'Sites & ads'], ['audit', 'Audit log'], ['launch', 'Launch']].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} style={{ ...small, padding: '7px 14px', borderRadius: 20, background: sub === k ? C.purple : '#f3f4f6', color: sub === k ? C.white : '#555', border: 'none' }}>{l}</button>
        ))}
      </div>
      {sub === 'overview' && <Overview deliveries={deliveries} riders={riders} />}
      {sub === 'deliveries' && <Deliveries deliveries={deliveries} riders={riders} />}
      {sub === 'riders' && <Riders riders={riders} />}
      {sub === 'pricing' && <Pricing />}
      {sub === 'launch' && <Launch />}
      {sub === 'orders' && <StoreOrders />}
      {sub === 'schedule' && <ScheduleTab riders={riders} perRiderHour={perRiderHour} />}
      {sub === 'fleet' && <FleetTab riders={riders} />}
      {sub === 'sites' && <SitesTab />}
      {sub === 'finance' && <FinanceTab riders={riders} />}
      {sub === 'support' && <SupportTab />}
      {sub === 'audit' && <AuditTab />}
      {sub === 'merchants' && <Merchants />}
      {sub === 'settlements' && <Settlements />}
    </div>
  );
}
