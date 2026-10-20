// Admin → Cancellations: fee settings, rider cancellation fees (review / waive),
// and driver cancellations.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import { C, st, Pill, Spinner } from '../dash/ui';
import { mergeCfg, jmd } from './cancelRules';

const small = { padding: '7px 11px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer', fontWeight: 600, border: `1px solid ${C.line}`, background: C.white, color: C.ink };
const when = (t) => (t && t.toDate ? t.toDate().toLocaleString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);
const TONE = { review: 'purple', owed: 'red', collecting: 'purple', collected: 'green', waived: 'grey' };
const LABEL = { review: 'Needs review', owed: 'Owed', collecting: 'Being collected', collected: 'Collected', waived: 'Waived' };

function Settings() {
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'cancellation'), (s) => { const c = mergeCfg(s.exists() ? s.data() : null); setCfg(c); setF((x) => x || c); }, () => { const c = mergeCfg(null); setCfg(c); setF(c); }), []);
  if (!f) return <Spinner />;
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    const c = mergeCfg({ ...f, feeJmd: Number(f.feeJmd), freeMinutes: Number(f.freeMinutes), noShowWaitMinutes: Number(f.noShowWaitMinutes), lateMinutes: Number(f.lateMinutes) });
    try { await setDoc(doc(dashDb(), 'config', 'cancellation'), { ...c, updatedAt: serverTimestamp() }); setF(c); setMsg('Saved. New cancellations use these settings.'); } catch (e) { setMsg('Could not save. Check you are signed in as admin.'); }
  };
  const changed = cfg && JSON.stringify(mergeCfg(f)) !== JSON.stringify(cfg);
  return (
    <div style={st.card}>
      <div style={st.h2}>Cancellation fee settings</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '6px 0 4px' }}><input type="checkbox" checked={f.enabled !== false} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Charge customers a cancellation fee</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
        <div><label style={st.label} htmlFor="cx-fee">Fee (J$)</label><input id="cx-fee" style={st.input} inputMode="numeric" value={f.feeJmd} onChange={num('feeJmd')} /></div>
        <div><label style={st.label} htmlFor="cx-free">Free minutes after a driver accepts</label><input id="cx-free" style={st.input} inputMode="numeric" value={f.freeMinutes} onChange={num('freeMinutes')} /></div>
        <div><label style={st.label} htmlFor="cx-wait">Driver waits before “no-show” (min)</label><input id="cx-wait" style={st.input} inputMode="numeric" value={f.noShowWaitMinutes} onChange={num('noShowWaitMinutes')} /></div>
        <div><label style={st.label} htmlFor="cx-late">Free if driver hasn’t arrived after (min)</label><input id="cx-late" style={st.input} inputMode="numeric" value={f.lateMinutes} onChange={num('lateMinutes')} /></div>
      </div>
      <div style={st.note}>Cash riders pay the fee on their next ride. The driver they cancelled on earns {mergeCfg(f).driverSharePct}% of it once it’s collected. No fee when the driver cancels for their own reasons; the ride goes to another driver instead.</div>
      {msg && <div style={{ fontSize: 13, color: C.purple, marginBottom: 6 }}>{msg}</div>}
      <button type="button" style={{ ...st.btn, width: 'auto', padding: '10px 18px' }} disabled={!changed} onClick={save}>Save settings</button>
    </div>
  );
}

export default function AdminCancellations() {
  const [fees, setFees] = useState(null);
  const [drv, setDrv] = useState([]);
  const [filter, setFilter] = useState('review');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => onSnapshot(collection(dashDb(), 'cancel_fees'), (s) => setFees(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))), () => setFees([])), []);
  useEffect(() => onSnapshot(collection(dashDb(), 'driver_cancellations'), (s) => setDrv(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.at) - ms(a.at))), () => setDrv([])), []);

  const counts = useMemo(() => (fees || []).reduce((o, f) => ({ ...o, [f.status]: (o[f.status] || 0) + 1 }), {}), [fees]);
  const owedTotal = (fees || []).filter((f) => ['owed', 'collecting'].includes(f.status)).reduce((s, f) => s + (f.amountJmd || 0), 0);
  const collectedTotal = (fees || []).filter((f) => f.status === 'collected').reduce((s, f) => s + (f.amountJmd || 0), 0);
  const recent = drv.filter((d) => Date.now() - ms(d.at) < 30 * 86400e3);
  const byDriver = Object.values(recent.reduce((o, d) => {
    const k = d.driverId; o[k] = o[k] || { driverId: k, name: d.driverName || k, own: 0, noShow: 0, asked: 0, safety: 0 };
    if (d.outcome === 'redispatch') o[k].own += 1; else if (d.reasonKey === 'rider_no_show') o[k].noShow += 1; else if (d.reasonKey === 'safety') o[k].safety += 1; else o[k].asked += 1;
    return o;
  }, {})).sort((a, b) => b.own - a.own);

  const act = async (f, action) => {
    if (action === 'waive' && !window.confirm(`Waive the ${jmd(f.amountJmd)} fee for ${f.customerName || 'this customer'}?`)) return; // eslint-disable-line no-alert
    setBusy(f.id); setMsg('');
    try { await httpsCallable(getFunctions(getApp()), 'cancelFeeAdmin')({ feeId: f.id, action }); setMsg(action === 'waive' ? 'Fee waived.' : 'Fee confirmed. It will be added to the customer’s next ride.'); } catch (e) { setMsg(e.message || 'Could not update the fee.'); }
    setBusy('');
  };

  if (!fees) return <Spinner />;
  const shown = fees.filter((f) => filter === 'all' || f.status === filter);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 12 }}>
        {[['Needs review', counts.review || 0], ['Owed by riders', jmd(owedTotal)], ['Collected', jmd(collectedTotal)], ['Driver cancellations (30 days)', recent.filter((d) => d.outcome === 'redispatch').length]].map(([l, v]) => (
          <div key={l} style={{ ...st.card, margin: 0 }}><div style={{ fontSize: 12, color: C.quiet }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div></div>
        ))}
      </div>
      <Settings />
      <div style={st.card}>
        <div style={st.h2}>Rider cancellation fees</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {['review', 'owed', 'collecting', 'collected', 'waived', 'all'].map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...small, background: filter === k ? C.purpleSoft : C.white, borderColor: filter === k ? C.purple : C.line }}>{k === 'all' ? 'All' : LABEL[k]} ({k === 'all' ? fees.length : counts[k] || 0})</button>
          ))}
        </div>
        {msg && <div style={st.note}>{msg}</div>}
        {shown.length === 0 ? <div style={st.sub}>Nothing here.</div> : shown.map((f) => (
          <div key={f.id} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700 }}>{jmd(f.amountJmd)} · {f.customerName || 'Customer'} <Pill tone={TONE[f.status]}>{LABEL[f.status] || f.status}</Pill></div>
              <div style={st.sub}>{when(f.createdAt)} · {f.cancelledBy === 'driver' ? `Driver ${f.driverName || ''} cancelled` : 'Customer cancelled'}: {f.reasonLabel || '—'} · driver {f.driverName || '—'} gets {jmd(f.driverShareJmd)}{f.collectVia === 'card_refund' ? ' · keep from card refund' : ''}</div>
              <div style={{ ...st.sub, fontSize: 11.5, fontFamily: 'monospace' }}>Ride {f.bookingId}{f.collectBookingId ? ` · collecting on ride ${f.collectBookingId}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {f.status === 'review' && <button type="button" style={{ ...small, background: C.purple, color: C.white, border: 'none' }} disabled={busy === f.id} onClick={() => act(f, 'confirm')}>Charge fee</button>}
              {['review', 'owed'].includes(f.status) && <button type="button" style={small} disabled={busy === f.id} onClick={() => act(f, 'waive')}>Waive</button>}
            </div>
          </div>
        ))}
      </div>
      <div style={st.card}>
        <div style={st.h2}>Driver cancellations, last 30 days</div>
        {byDriver.length === 0 ? <div style={st.sub}>No driver cancellations.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Driver', 'Their reasons (sent to another driver)', 'Rider no-shows', 'Rider asked', 'Safety reports'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6 }}>{h}</th>)}</tr></thead>
              <tbody>{byDriver.map((r) => (
                <tr key={r.driverId} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: 6, fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: 6, color: r.own >= 3 ? C.red : C.ink, fontWeight: r.own >= 3 ? 800 : 400 }}>{r.own}</td>
                  <td style={{ padding: 6 }}>{r.noShow}</td><td style={{ padding: 6 }}>{r.asked}</td><td style={{ padding: 6 }}>{r.safety}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {recent.filter((d) => d.reasonKey === 'safety').map((d) => (
          <div key={d.id} style={{ ...st.note, background: '#fdecec', borderColor: '#f5c2c2', color: '#7a1d1d' }}>Safety report · {when(d.at)} · {d.driverName}: {d.note || 'no note'} (ride {d.bookingId})</div>
        ))}
      </div>
    </div>
  );
}
