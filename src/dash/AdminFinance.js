// Admin → VilleDash → Finance, Support and Audit log.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, limit, addDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb, errText, formatJMD, jmToday, addDays, centsFromJ } from './dashApi';
import { C, st, Pill, Spinner } from './ui';

const card = { ...st.card, padding: 14 };
const small = { padding: '6px 10px', fontSize: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const call = (name, data) => httpsCallable(getFunctions(getApp()), name)(data).then((r) => r.data);
const ts = (t) => (t?.toDate ? t.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const jmStart = (date) => Timestamp.fromMillis(Date.parse(`${date}T00:00:00-05:00`));

function useQuery(path, constraints, key) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    const q = query(collection(dashDb(), path), ...constraints);
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn(path, e.message); setRows([]); });
  }, [path, key]); // eslint-disable-line
  return rows;
}

// ═════════════════════════════════════════════════════════════════════════════
//  FINANCE
// ═════════════════════════════════════════════════════════════════════════════
function Report() {
  const [from, setFrom] = useState(addDays(jmToday(), -29));
  const [to, setTo] = useState(jmToday());
  const rows = useQuery('ledger_entries', [where('createdAt', '>=', jmStart(from)), where('createdAt', '<', jmStart(addDays(to, 1)))], `${from}|${to}`);
  if (!rows) return <Spinner />;
  const sum = (k) => rows.filter((e) => e.kind === k).reduce((s, e) => s + (e.amountCents || 0), 0);
  const deliveryFees = sum('delivery_fee'); const productSales = sum('product_sales'); const serviceFees = sum('service_fee');
  const commission = sum('commission'); const riderPay = sum('rider_earning'); const fleet = sum('fleet_charge');
  const collected = deliveryFees + productSales + serviceFees;
  const revenue = deliveryFees + commission + serviceFees;
  const contribution = revenue - riderPay - fleet;
  const Row = ({ l, v, strong, sub, neg }) => (
    <div style={{ ...st.row, borderTop: strong ? `2px solid ${C.purpleLine}` : 'none', paddingTop: strong ? 8 : 5 }}>
      <span style={{ color: strong ? C.ink : C.quiet, fontWeight: strong ? 800 : 500 }}>{l}{sub && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: C.quiet }}>{sub}</span>}</span>
      <span style={{ fontWeight: strong ? 800 : 600, color: neg ? C.red : C.ink }}>{neg ? '− ' : ''}{formatJMD(v)}</span>
    </div>
  );
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <b style={{ fontSize: 14 }}>VilleDash money</b>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...st.input, width: 'auto', padding: '6px 8px' }} />
        <span>to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...st.input, width: 'auto', padding: '6px 8px' }} />
      </div>
      <Row l="Cash collected from customers" v={collected} sub="Gross order value — not revenue. Includes store sales that belong to merchants." />
      <Row l="  of which store sales (merchants' money)" v={productSales} />
      <div style={{ height: 8 }} />
      <Row l="Delivery fees" v={deliveryFees} />
      <Row l="Merchant commission" v={commission} />
      {serviceFees > 0 && <Row l="Service fees" v={serviceFees} />}
      <Row l="VilleDash revenue" v={revenue} strong />
      <Row l="Rider pay" v={riderPay} neg />
      <Row l="Fleet-provider charges recorded" v={fleet} neg />
      <Row l="Contribution" v={contribution} strong sub="Revenue minus rider pay and fleet charges. Not net profit — other costs, fees and taxes aren't included." />
    </div>
  );
}

function RiderCash({ riders }) {
  const entries = useQuery('ledger_entries', [where('kind', 'in', ['rider_cash_held', 'rider_cash_received'])], 'cash');
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState('');
  const owed = useMemo(() => {
    const o = {};
    (entries || []).forEach((e) => { o[e.partyId] = (o[e.partyId] || 0) + (e.kind === 'rider_cash_held' ? 1 : -1) * (e.amountCents || 0); });
    return o;
  }, [entries]);
  if (!entries || !riders) return <Spinner />;
  const list = riders.filter((r) => owed[r.id]);
  const record = async (r) => {
    setMsg('');
    const f = form[r.id] || {};
    const cents = centsFromJ(f.amount);
    if (Number.isNaN(cents) || cents <= 0) { setMsg('Enter the amount received.'); return; }
    try { const res = await call('dashAdminRecordRiderCash', { riderId: r.id, amountCents: cents, reference: f.ref || '' }); setMsg(`Recorded. ${r.name} now owes ${formatJMD(res.owedCents)}.`); setForm({ ...form, [r.id]: {} }); } catch (e) { setMsg(errText(e)); }
  };
  return (
    <div style={card}>
      <div style={st.h2}>Cash held by riders</div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>Riders keep their pay from the cash they collect and owe VilleDash the rest. Record each handover with a receipt or deposit reference.</div>
      {msg && <div style={st.note}>{msg}</div>}
      {list.length === 0 ? <div style={{ fontSize: 13, color: C.quiet }}>No rider owes anything right now.</div> : list.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
          <div style={{ flex: 1, minWidth: 140 }}><b>{r.name}</b><div style={{ fontSize: 12.5, color: owed[r.id] > 0 ? C.red : C.green }}>owes {formatJMD(owed[r.id])}</div></div>
          <input style={{ ...st.input, width: 110, padding: '6px 8px' }} placeholder="J$ received" value={form[r.id]?.amount || ''} onChange={(e) => setForm({ ...form, [r.id]: { ...form[r.id], amount: e.target.value } })} />
          <input style={{ ...st.input, width: 150, padding: '6px 8px' }} placeholder="Receipt / deposit ref" value={form[r.id]?.ref || ''} onChange={(e) => setForm({ ...form, [r.id]: { ...form[r.id], ref: e.target.value } })} />
          <button onClick={() => record(r)} style={{ ...small, background: C.green, color: C.white, border: 'none' }}>Record</button>
        </div>
      ))}
    </div>
  );
}

function FleetCharges() {
  const providers = useQuery('fleet_providers', [], 'prov');
  const charges = useQuery('ledger_entries', [where('kind', '==', 'fleet_charge')], 'fleet');
  const bikes = useQuery('fleet_motorcycles', [], 'bikes');
  const [f, setF] = useState({ providerId: '', periodStart: addDays(jmToday(), -6), periodEnd: jmToday(), amount: '', invoiceRef: '' });
  const [refs, setRefs] = useState({});
  const [msg, setMsg] = useState('');
  if (!providers || !charges || !bikes) return <Spinner />;
  const prov = providers.find((p) => p.id === f.providerId);
  const nBikes = bikes.filter((b) => b.providerId === f.providerId && b.status !== 'removed').length;
  const days = Math.max(1, Math.round((Date.parse(f.periodEnd) - Date.parse(f.periodStart)) / 864e5) + 1);
  const per = { day: 1, week: 7, month: 30 }[prov?.ratePeriod] || 7;
  const suggested = prov?.ratePerBikeCents ? Math.round(prov.ratePerBikeCents * nBikes * days / per) : null;
  const add = async () => {
    setMsg('');
    const cents = centsFromJ(f.amount || (suggested ? suggested / 100 : ''));
    if (!f.providerId || Number.isNaN(cents)) { setMsg('Choose a provider and enter the amount.'); return; }
    try { await call('dashAdminRecordFleetCharge', { ...f, amountCents: cents, bikes: nBikes }); setMsg('Charge recorded.'); setF({ ...f, amount: '', invoiceRef: '' }); } catch (e) { setMsg(errText(e)); }
  };
  const pay = async (c) => { setMsg(''); try { await call('dashAdminMarkFleetChargePaid', { entryId: c.id, reference: refs[c.id] || '' }); } catch (e) { setMsg(errText(e)); } };
  return (
    <div style={card}>
      <div style={st.h2}>Fleet-provider charges</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '0 10px' }}>
        <div><label style={st.label}>Provider</label>
          <select style={st.input} value={f.providerId} onChange={(e) => setF({ ...f, providerId: e.target.value })}><option value="">Choose…</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label style={st.label}>From</label><input type="date" style={st.input} value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></div>
        <div><label style={st.label}>To</label><input type="date" style={st.input} value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></div>
        <div><label style={st.label}>Amount (J$)</label><input style={st.input} value={f.amount} placeholder={suggested ? String(suggested / 100) : ''} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
        <div><label style={st.label}>Invoice ref</label><input style={st.input} value={f.invoiceRef} onChange={(e) => setF({ ...f, invoiceRef: e.target.value })} /></div>
      </div>
      {suggested != null && <div style={{ fontSize: 12, color: C.quiet }}>Suggested from the provider's rate: {nBikes} bike(s) × {formatJMD(prov.ratePerBikeCents)} per {prov.ratePeriod} × {days} day(s) = {formatJMD(suggested)}. Use the invoice amount if it differs.</div>}
      <button onClick={add} style={{ ...small, marginTop: 8, background: C.purple, color: C.white, border: 'none' }}>Record charge</button>
      {msg && <div style={st.note}>{msg}</div>}
      {[...charges].sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || '')).map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
          <span><b>{c.providerName}</b> · {c.periodStart} – {c.periodEnd} · {formatJMD(c.amountCents)}{c.invoiceRef ? ` · inv ${c.invoiceRef}` : ''}</span>
          {c.paid ? <Pill tone="green">Paid · {c.paymentReference}</Pill> : (
            <span style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...st.input, width: 140, padding: '5px 8px' }} placeholder="Payment ref" value={refs[c.id] || ''} onChange={(e) => setRefs({ ...refs, [c.id]: e.target.value })} />
              <button onClick={() => pay(c)} style={{ ...small, background: C.green, color: C.white, border: 'none' }}>Mark paid</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function FinanceTab({ riders }) {
  return (<><Report /><RiderCash riders={riders} /><FleetCharges /></>);
}

// ═════════════════════════════════════════════════════════════════════════════
//  SUPPORT
// ═════════════════════════════════════════════════════════════════════════════
const CASE_TONE = { open: 'amber', in_progress: 'purple', resolved: 'green', closed: 'grey' };
function CaseCard({ c }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const notes = useQuery(`support_cases/${c.id}/notes`, [orderBy('at', 'asc')], open ? `n${c.id}` : 'closed');
  const setStatus = (status) => updateDoc(doc(dashDb(), 'support_cases', c.id), { status, updatedAt: serverTimestamp() }).catch(() => {});
  const addNote = async () => {
    if (!note.trim()) return;
    await addDoc(collection(dashDb(), 'support_cases', c.id, 'notes'), { text: note.trim().slice(0, 1000), at: serverTimestamp() }).catch(() => {});
    await updateDoc(doc(dashDb(), 'support_cases', c.id), { updatedAt: serverTimestamp(), ...(c.status === 'open' ? { status: 'in_progress' } : {}) }).catch(() => {});
    setNote('');
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div><b>{c.category.replace(/_/g, ' ')}</b> <span style={{ fontSize: 12.5, color: C.quiet }}>from {c.reporterRole} · {ts(c.createdAt)} · delivery {c.deliveryId}</span></div>
        <Pill tone={CASE_TONE[c.status]}>{c.status.replace('_', ' ')}</Pill>
      </div>
      {c.description && <div style={{ fontSize: 13.5, marginTop: 6 }}>{c.description}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {['open', 'in_progress', 'resolved', 'closed'].filter((s) => s !== c.status).map((s) => (
          <button key={s} onClick={() => setStatus(s)} style={{ ...small, background: '#f3f4f6', border: 'none' }}>Mark {s.replace('_', ' ')}</button>
        ))}
        <button onClick={() => setOpen(!open)} style={{ ...small, background: C.purpleSoft, color: C.purple, border: 'none' }}>{open ? 'Hide notes' : 'Notes'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {(notes || []).map((n) => <div key={n.id} style={{ fontSize: 12.5, padding: '4px 0', borderTop: `1px solid ${C.line}` }}><span style={{ color: C.quiet }}>{ts(n.at)}</span> — {n.text}</div>)}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input style={{ ...st.input, flex: 1, padding: '6px 10px' }} placeholder="What was done / agreed (refund, call-back…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={addNote} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Add note</button>
          </div>
        </div>
      )}
    </div>
  );
}
export function SupportTab() {
  const [filter, setFilter] = useState('active');
  const cases = useQuery('support_cases', [orderBy('createdAt', 'desc'), limit(200)], 'cases');
  if (!cases) return <Spinner />;
  const list = cases.filter((c) => (filter === 'active' ? ['open', 'in_progress'].includes(c.status) : true));
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['active', `Open (${cases.filter((c) => ['open', 'in_progress'].includes(c.status)).length})`], ['all', 'All']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ ...small, borderRadius: 20, background: filter === k ? C.purple : '#f3f4f6', color: filter === k ? C.white : '#555', border: 'none' }}>{l}</button>
        ))}
      </div>
      {list.length === 0 ? <div style={{ ...card, color: C.quiet }}>No support cases.</div> : list.map((c) => <CaseCard key={c.id} c={c} />)}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ═════════════════════════════════════════════════════════════════════════════
export function AuditTab() {
  const rows = useQuery('audit_logs', [orderBy('at', 'desc'), limit(300)], 'audit');
  const [q, setQ] = useState('');
  if (!rows) return <Spinner />;
  const list = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={st.h2}>Audit log</div>
        <input style={{ ...st.input, width: 220, padding: '6px 10px' }} placeholder="Search (delivery, rider, action…)" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 6 }}>Every manual assignment, cancellation, delivery exception, fleet change, settlement and cash record. Entries can't be edited or deleted.</div>
      {list.map((r) => (
        <div key={r.id} style={{ fontSize: 12.5, padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
          <span style={{ color: C.quiet }}>{ts(r.at)}</span> · <b>{r.action}</b> · {r.target}
          {r.details && <span style={{ color: C.quiet }}> — {Object.entries(r.details).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${typeof v === 'number' && /Cents$/.test(k) ? formatJMD(v) : v}`).join(', ')}</span>}
        </div>
      ))}
    </div>
  );
}
