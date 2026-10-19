// Admin → Creators: private creator promo codes, completed-ride tracking and payouts.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import { C, st, Pill, Spinner } from '../dash/ui';

const call = (name, data) => httpsCallable(getFunctions(getApp()), name)(data).then((r) => r.data);
const jmd = (n) => `J$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const small = { padding: '7px 11px', fontSize: 12.5, borderRadius: 9, cursor: 'pointer', fontWeight: 600, border: `1px solid ${C.line}`, background: C.white, color: C.ink };
const fmtDate = (t) => (t && t.toDate ? t.toDate().toLocaleDateString('en-JM', { timeZone: 'America/Jamaica', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const owed = (c) => Math.max(0, (c.earnedJmd || 0) - (c.paidJmd || 0));
const linkFor = (c) => `${window.location.origin}/creator/${c.statsToken}`;
const EMPTY = { name: '', handle: '', platform: 'Instagram', phone: '', email: '', code: '', discountType: 'percent', discount: '10', payoutJmd: '200', notes: '', active: true };

function Editor({ creator, onClose }) {
  const isNew = !creator;
  const [f, setF] = useState(() => (creator ? { ...EMPTY, ...creator, discount: String(creator.discount), payoutJmd: String(creator.payoutJmd) } : EMPTY));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await call('creatorSave', { ...(isNew ? {} : { id: creator.id }), ...f, discount: Number(f.discount), payoutJmd: Number(f.payoutJmd) });
      onClose(isNew ? `Creator added with code ${r.code}.` : 'Creator updated.');
    } catch (e) { setMsg(e.message || 'Could not save.'); setBusy(false); }
  };
  return (
    <div style={{ ...st.card, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={st.h2}>{isNew ? 'New creator' : `Edit ${creator.name}`}</div>
        <button type="button" style={small} onClick={() => onClose()}>Close</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <div><label style={st.label} htmlFor="cr-name">Name</label><input id="cr-name" style={st.input} value={f.name} onChange={set('name')} /></div>
        <div><label style={st.label} htmlFor="cr-handle">Social handle</label><input id="cr-handle" style={st.input} value={f.handle} onChange={set('handle')} placeholder="@handle" /></div>
        <div><label style={st.label} htmlFor="cr-platform">Main platform</label><select id="cr-platform" style={st.input} value={f.platform} onChange={set('platform')}>{['Instagram', 'TikTok', 'Facebook', 'YouTube', 'X', 'Snapchat', 'WhatsApp', 'Other'].map((p) => <option key={p}>{p}</option>)}</select></div>
        <div><label style={st.label} htmlFor="cr-phone">Phone</label><input id="cr-phone" style={st.input} value={f.phone} onChange={set('phone')} /></div>
        <div><label style={st.label} htmlFor="cr-email">Email</label><input id="cr-email" style={st.input} value={f.email} onChange={set('email')} /></div>
        <div>
          <label style={st.label} htmlFor="cr-code">Promo code</label>
          <input id="cr-code" style={{ ...st.input, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} disabled={!isNew} placeholder="e.g. SHANICE10" maxLength={20} />
          {!isNew && <div style={{ fontSize: 11.5, color: C.quiet, marginTop: 4 }}>Codes can’t change once created, so creators’ posts keep working.</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <div><label style={st.label} htmlFor="cr-dtype">Rider discount type</label><select id="cr-dtype" style={st.input} value={f.discountType} onChange={set('discountType')}><option value="percent">% off the fare</option><option value="fixed">J$ off the fare</option></select></div>
        <div><label style={st.label} htmlFor="cr-disc">Rider discount {f.discountType === 'fixed' ? '(J$)' : '(%)'}</label><input id="cr-disc" style={st.input} inputMode="numeric" value={f.discount} onChange={set('discount')} /></div>
        <div><label style={st.label} htmlFor="cr-pay">Creator earns per completed ride (J$)</label><input id="cr-pay" style={st.input} inputMode="numeric" value={f.payoutJmd} onChange={set('payoutJmd')} /></div>
      </div>
      <div style={st.note}>Each customer can use a creator’s code once. The creator only earns when that ride is completed; cancelled rides don’t count. VilleCabs covers the rider’s discount, so the driver is still paid on the full fare.</div>
      <label style={st.label} htmlFor="cr-notes">Notes (only admins see these)</label><textarea id="cr-notes" style={{ ...st.input, minHeight: 64 }} value={f.notes} onChange={set('notes')} />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 8 }}><input type="checkbox" checked={f.active !== false} onChange={set('active')} /> Code is active</label>
      {msg && <div style={st.err}>{msg}</div>}
      <button type="button" style={{ ...st.btn, width: 'auto', padding: '11px 20px', marginTop: 14 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Add creator' : 'Save changes'}</button>
    </div>
  );
}

function Rides({ creator }) {
  const [uses, setUses] = useState(null);
  const [pays, setPays] = useState([]);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'creator_uses'), where('creatorId', '==', creator.id)),
    (s) => setUses(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.completedAt && b.completedAt.toMillis ? b.completedAt.toMillis() : 0) - (a.completedAt && a.completedAt.toMillis ? a.completedAt.toMillis() : 0)))), () => setUses([])), [creator.id]);
  useEffect(() => onSnapshot(query(collection(dashDb(), 'creator_payouts'), where('creatorId', '==', creator.id)),
    (s) => setPays(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPays([])), [creator.id]);
  if (!uses) return <Spinner />;
  return (
    <div style={{ marginTop: 12, overflowX: 'auto' }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, margin: '4px 0 6px' }}>Completed rides with this code</div>
      {uses.length === 0 ? <div style={st.sub}>No completed rides yet.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['Completed', 'Ride ID', 'Full fare', 'Rider paid', 'Discount (VilleCabs)', 'Creator earns', 'Status'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>{uses.map((u) => (
            <tr key={u.id} style={{ borderTop: `1px solid ${C.line}` }}>
              <td style={{ padding: 6 }}>{fmtDate(u.completedAt)}</td>
              <td style={{ padding: 6, fontFamily: 'monospace' }}>{u.bookingId}</td>
              <td style={{ padding: 6 }}>{jmd(u.fareBeforeDiscount)}</td>
              <td style={{ padding: 6 }}>{jmd(u.fare)}</td>
              <td style={{ padding: 6 }}>{jmd(u.discountJmd)}</td>
              <td style={{ padding: 6, fontWeight: 700 }}>{jmd(u.payoutJmd)}</td>
              <td style={{ padding: 6 }}>{u.paid ? <Pill tone="green">Paid</Pill> : <Pill>Owed</Pill>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {pays.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13.5, margin: '14px 0 6px' }}>Payouts</div>
          {pays.sort((a, b) => ((b.paidAt && b.paidAt.toMillis ? b.paidAt.toMillis() : 0) - (a.paidAt && a.paidAt.toMillis ? a.paidAt.toMillis() : 0))).map((p) => (
            <div key={p.id} style={{ fontSize: 12.5, padding: '5px 0', borderTop: `1px solid ${C.line}` }}>{fmtDate(p.paidAt)} · <b>{jmd(p.amountJmd)}</b> for {p.rides} ride{p.rides === 1 ? '' : 's'}{p.method ? ` · ${p.method}` : ''}{p.note ? ` · ${p.note}` : ''}</div>
          ))}
        </>
      )}
    </div>
  );
}

export default function AdminCreators() {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => onSnapshot(collection(dashDb(), 'creators'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.completed || 0) - (a.completed || 0))), () => setList([])), []);
  const totals = useMemo(() => (list || []).reduce((t, c) => ({ completed: t.completed + (c.completed || 0), owed: t.owed + owed(c), paid: t.paid + (c.paidJmd || 0), discount: t.discount + (c.discountJmd || 0) }), { completed: 0, owed: 0, paid: 0, discount: 0 }), [list]);

  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); setMsg(`${label} copied.`); } catch (e) { setMsg(text); } };
  const pay = async (c) => {
    const method = window.prompt(`Record ${jmd(owed(c))} paid to ${c.name} for their unpaid completed rides.\n\nHow did you pay? (e.g. Bank transfer, Lynk, Cash)`, 'Bank transfer'); // eslint-disable-line no-alert
    if (method === null) return;
    setBusy(c.id); setMsg('');
    try { const r = await call('creatorRecordPayout', { creatorId: c.id, method }); setMsg(`Recorded ${jmd(r.amountJmd)} paid to ${c.name} for ${r.rides} ride(s).`); } catch (e) { setMsg(e.message || 'Could not record payout.'); }
    setBusy('');
  };
  const toggle = async (c) => {
    setBusy(c.id);
    try { await call('creatorSave', { ...c, active: c.active === false }); setMsg(`${c.code} ${c.active === false ? 'activated' : 'paused'}.`); } catch (e) { setMsg(e.message || 'Could not update.'); }
    setBusy('');
  };
  const rotate = async (c) => {
    if (!window.confirm(`Make a new private link for ${c.name}? The old link stops working.`)) return; // eslint-disable-line no-alert
    try { await call('creatorRotateLink', { creatorId: c.id }); setMsg('New link created. Copy it and send it to the creator.'); } catch (e) { setMsg(e.message || 'Could not make a new link.'); }
  };

  if (!list) return <Spinner />;
  if (editing) return <Editor creator={editing === 'new' ? null : editing} onClose={(m) => { setEditing(null); if (m) setMsg(m); }} />;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginBottom: 12 }}>
        {[['Creators', list.length], ['Completed rides', totals.completed], ['Owed to creators', jmd(totals.owed)], ['Paid to creators', jmd(totals.paid)], ['Discounts covered', jmd(totals.discount)]].map(([l, v]) => (
          <div key={l} style={{ ...st.card, margin: 0 }}><div style={{ fontSize: 12, color: C.quiet }}>{l}</div><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ ...st.sub, flex: 1, minWidth: 240 }}>Creator codes are private: they never appear on the website. VilleCabs covers rider discounts on these rides, so drivers are paid on the full fare.</div>
        <button type="button" style={{ ...small, background: C.purple, color: C.white, border: 'none' }} onClick={() => setEditing('new')}>+ New creator</button>
      </div>
      {msg && <div style={st.note}>{msg}</div>}
      {list.length === 0 && <div style={{ ...st.card, ...st.sub }}>No creators yet. Add one to give them their own promo code and private stats link.</div>}
      {list.map((c) => {
        const inProg = Math.max(0, (c.booked || 0) - (c.completed || 0) - (c.released || 0));
        return (
          <div key={c.id} style={st.card}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{c.name} {c.handle && <span style={{ color: C.quiet, fontWeight: 600 }}>@{c.handle}</span>} {c.active === false ? <Pill tone="grey">Paused</Pill> : <Pill tone="green">Active</Pill>}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.purple, letterSpacing: 2, margin: '4px 0' }}>{c.code}</div>
                <div style={st.sub}>Rider gets {c.discountType === 'fixed' ? `${jmd(c.discount)} off` : `${c.discount}% off`} (once per customer) · creator earns {jmd(c.payoutJmd)} per completed ride{c.platform ? ` · ${c.platform}` : ''}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(80px, auto))', gap: '4px 16px', fontSize: 12.5 }}>
                <span>Booked <b>{c.booked || 0}</b></span><span>In progress <b>{inProg}</b></span><span>Completed <b>{c.completed || 0}</b></span>
                <span>Cancelled <b>{c.released || 0}</b></span><span>Earned <b>{jmd(c.earnedJmd)}</b></span><span>Owed <b style={{ color: owed(c) ? C.purple : C.ink }}>{jmd(owed(c))}</b></span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" style={small} onClick={() => copy(linkFor(c), 'Private stats link')}>Copy private stats link</button>
              <button type="button" style={small} onClick={() => copy(c.code, 'Code')}>Copy code</button>
              <button type="button" style={small} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide rides' : 'Rides & payouts'}</button>
              {owed(c) > 0 && <button type="button" style={{ ...small, background: C.purple, color: C.white, border: 'none' }} disabled={busy === c.id} onClick={() => pay(c)}>Mark {jmd(owed(c))} paid</button>}
              <button type="button" style={small} onClick={() => setEditing(c)}>Edit</button>
              <button type="button" style={small} disabled={busy === c.id} onClick={() => toggle(c)}>{c.active === false ? 'Activate' : 'Pause code'}</button>
              <button type="button" style={small} onClick={() => rotate(c)}>New link</button>
            </div>
            {open === c.id && <Rides creator={c} />}
          </div>
        );
      })}
    </div>
  );
}
