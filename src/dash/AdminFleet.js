// Admin → VilleDash → Fleet and Schedule.
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, addDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { api, dashDb, errText, formatJMD, BIKE_STATUS_LABEL, SHIFT_LABEL, DAYS, jmToday, addDays, weekday, centsFromJ } from './dashApi';
import { demandGrid, ridersNeeded, coverageFor, gaps, shiftWeekForward } from './coverage';
import { C, st, Pill, Spinner } from './ui';

const card = { ...st.card, padding: 14 };
const small = { padding: '6px 10px', fontSize: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const daysUntil = (iso) => (iso ? Math.floor((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${jmToday()}T12:00:00Z`)) / 864e5) : null);

// Live query. `key` must change whenever the constraints change.
function useLive(path, constraints = [], key = '') {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    const q = constraints.length ? query(collection(dashDb(), path), ...constraints) : collection(dashDb(), path);
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn(path, e.message); setRows([]); });
  }, [path, key]); // eslint-disable-line
  return rows;
}

// ═════════════════════════════════════════════════════════════════════════════
//  FLEET
// ═════════════════════════════════════════════════════════════════════════════
const BIKE_FIELDS = [
  ['plate', 'Registration plate'], ['make', 'Make'], ['model', 'Model'], ['colour', 'Colour'], ['year', 'Year'],
  ['insurer', 'Insurer'], ['policyNumber', 'Insurance policy no.'], ['insuranceExpiry', 'Insurance expiry', 'date'],
  ['registrationExpiry', 'Registration expiry', 'date'], ['fitnessExpiry', 'Fitness expiry', 'date'],
  ['mileageKm', 'Mileage (km)'], ['nextServiceDue', 'Next service due', 'date'], ['agreementRef', 'Fleet agreement ref'],
];
function BikeForm({ bike, providers, onDone }) {
  const [f, setF] = useState(() => ({ providerId: '', notes: '', ...Object.fromEntries(BIKE_FIELDS.map(([k]) => [k, ''])), ...(bike || {}) }));
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!String(f.plate).trim()) { setMsg('Plate is required.'); return; }
    const data = { providerId: f.providerId || null, notes: String(f.notes || '').slice(0, 500), updatedAt: serverTimestamp() };
    BIKE_FIELDS.forEach(([k]) => { data[k] = String(f[k] ?? '').trim() || null; });
    data.plate = data.plate.toUpperCase();
    data.year = data.year ? Number(data.year) || null : null;
    data.mileageKm = data.mileageKm ? Number(data.mileageKm) || null : null;
    try {
      if (bike) await updateDoc(doc(dashDb(), 'fleet_motorcycles', bike.id), data);
      else await addDoc(collection(dashDb(), 'fleet_motorcycles'), { ...data, status: 'available', assignedRiderId: null, createdAt: serverTimestamp() });
      onDone();
    } catch (e) { setMsg('Could not save.'); }
  };
  return (
    <div style={{ ...card, border: `2px solid ${C.purpleLine}` }}>
      <div style={st.h2}>{bike ? `Edit ${bike.plate}` : 'Add motorcycle'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '0 12px' }}>
        {BIKE_FIELDS.map(([k, l, t]) => (
          <div key={k}><label style={st.label}>{l}</label><input style={st.input} type={t || 'text'} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div><label style={st.label}>Fleet provider (legal owner)</label>
          <select style={st.input} value={f.providerId || ''} onChange={(e) => setF({ ...f, providerId: e.target.value })}>
            <option value="">—</option>{(providers || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
      </div>
      <label style={st.label}>Notes</label><textarea style={{ ...st.input, minHeight: 50 }} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      {msg && <div style={st.err}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={{ ...st.btnGhost, width: 'auto', padding: '10px 18px' }} onClick={onDone}>Cancel</button>
        <button style={{ ...st.btn, width: 'auto', padding: '10px 18px' }} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function BikeLog({ bikeId }) {
  const log = useLive(`fleet_motorcycles/${bikeId}/log`, [orderBy('at', 'desc'), limit(30)]);
  const [type, setType] = useState('inspection');
  const [note, setNote] = useState('');
  const [km, setKm] = useState('');
  const add = async () => {
    if (!note.trim()) return;
    await addDoc(collection(dashDb(), 'fleet_motorcycles', bikeId, 'log'), { type, note: note.trim().slice(0, 300), mileageKm: km ? Number(km) : null, at: serverTimestamp() }).catch(() => {});
    if (km) updateDoc(doc(dashDb(), 'fleet_motorcycles', bikeId), { mileageKm: Number(km) }).catch(() => {});
    setNote(''); setKm('');
  };
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select style={{ ...st.input, width: 'auto', padding: '6px 8px' }} value={type} onChange={(e) => setType(e.target.value)}>
          {['inspection', 'fault', 'maintenance', 'accident', 'other'].map((t) => <option key={t}>{t}</option>)}
        </select>
        <input style={{ ...st.input, flex: 1, minWidth: 160, padding: '6px 10px' }} placeholder="What happened / what was done" value={note} onChange={(e) => setNote(e.target.value)} />
        <input style={{ ...st.input, width: 110, padding: '6px 10px' }} placeholder="Mileage km" value={km} onChange={(e) => setKm(e.target.value)} />
        <button onClick={add} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Add to log</button>
      </div>
      {(log || []).map((l) => (
        <div key={l.id} style={{ fontSize: 12.5, padding: '5px 0', borderBottom: `1px solid ${C.line}` }}>
          <b>{l.type}</b> · {l.at?.toDate?.().toLocaleDateString('en-JM') || ''} — {l.note}{l.mileageKm ? ` · ${l.mileageKm} km` : ''}
        </div>
      ))}
    </div>
  );
}

function BikeCard({ b, riders, providers, onEdit }) {
  const [open, setOpen] = useState(false);
  const [rid, setRid] = useState('');
  const [status, setStatus] = useState(b.status);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const run = async (fn) => { setMsg(''); try { await fn(); setMsg('Done.'); } catch (e) { setMsg(errText(e)); } };
  const warnings = [['insuranceExpiry', 'Insurance'], ['registrationExpiry', 'Registration'], ['fitnessExpiry', 'Fitness'], ['nextServiceDue', 'Service']]
    .map(([k, l]) => [l, daysUntil(b[k])]).filter(([, d]) => d != null && d <= 30);
  const free = riders.filter((r) => r.status === 'approved' && !r.motorcycleId);
  const provider = providers.find((p) => p.id === b.providerId);
  const tone = { available: 'green', assigned: 'purple', in_service: 'purple', maintenance: 'amber', unavailable: 'red', removed: 'grey' }[b.status];
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div><b style={{ fontSize: 15 }}>{b.plate}</b> <span style={{ fontSize: 12.5, color: C.quiet }}>{[b.make, b.model, b.colour, b.year].filter(Boolean).join(' · ')}{provider ? ` · owner ${provider.name}` : ''}</span></div>
        <Pill tone={tone}>{BIKE_STATUS_LABEL[b.status]}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 4 }}>
        Rider: <b style={{ color: C.ink }}>{b.assignedRiderName || 'none'}</b>{b.mileageKm ? ` · ${b.mileageKm} km` : ''}{b.statusNote ? ` · ${b.statusNote}` : ''}
      </div>
      {warnings.length > 0 && <div style={{ fontSize: 12.5, color: C.red, marginTop: 4 }}>{warnings.map(([l, d]) => (d < 0 ? `${l} EXPIRED` : `${l} due in ${d} day(s)`)).join(' · ')}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {b.assignedRiderId
          ? <button onClick={() => run(() => api.assignBike({ motorcycleId: b.id, riderId: null }))} style={{ ...small, background: '#f3f4f6', border: '1px solid #e5e7eb' }}>Unassign</button>
          : <>
            <select style={{ ...st.input, width: 'auto', padding: '6px 8px' }} value={rid} onChange={(e) => setRid(e.target.value)}>
              <option value="">Assign to rider…</option>{free.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button disabled={!rid} onClick={() => run(() => api.assignBike({ motorcycleId: b.id, riderId: rid }))} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>Assign</button>
          </>}
        <select style={{ ...st.input, width: 'auto', padding: '6px 8px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(BIKE_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {status !== b.status && <>
          <input style={{ ...st.input, width: 180, padding: '6px 10px' }} placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={() => run(() => api.bikeStatus({ motorcycleId: b.id, status, note }))} style={{ ...small, background: C.amber, color: C.white, border: 'none' }}>Change status</button>
        </>}
        <button onClick={onEdit} style={{ ...small, background: C.purpleSoft, color: C.purple, border: 'none' }}>Edit</button>
        <button onClick={() => setOpen(!open)} style={{ ...small, background: 'none', color: C.purple, border: 'none' }}>{open ? 'Hide log' : 'Log'}</button>
        {msg && <span style={{ fontSize: 12, color: C.quiet }}>{msg}</span>}
      </div>
      {open && <BikeLog bikeId={b.id} />}
    </div>
  );
}

function Providers({ providers }) {
  const [f, setF] = useState({ name: '', contactName: '', phone: '', email: '', agreementRef: '', rate: '', ratePeriod: 'week' });
  const [msg, setMsg] = useState('');
  const add = async () => {
    if (!f.name.trim()) { setMsg('Name the provider.'); return; }
    const cents = f.rate ? centsFromJ(f.rate) : null;
    if (f.rate && Number.isNaN(cents)) { setMsg('Rate must be a number.'); return; }
    await addDoc(collection(dashDb(), 'fleet_providers'), {
      name: f.name.trim(), contactName: f.contactName.trim(), phone: f.phone.trim(), email: f.email.trim(),
      agreementRef: f.agreementRef.trim(), ratePerBikeCents: cents, ratePeriod: f.ratePeriod, createdAt: serverTimestamp(),
    }).then(() => { setF({ name: '', contactName: '', phone: '', email: '', agreementRef: '', rate: '', ratePeriod: 'week' }); setMsg('Added.'); }).catch(() => setMsg('Could not save.'));
  };
  return (
    <div style={card}>
      <div style={st.h2}>Fleet providers</div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>The company that owns the motorcycles. Riders and customers never see this.</div>
      {(providers || []).map((p) => (
        <div key={p.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
          <b>{p.name}</b> · {p.contactName} {p.phone} {p.email}{p.agreementRef ? ` · agreement ${p.agreementRef}` : ''}{p.ratePerBikeCents ? ` · ${formatJMD(p.ratePerBikeCents)} per bike per ${p.ratePeriod}` : ' · rate not set'}
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '0 10px', marginTop: 8 }}>
        {[['name', 'Company name'], ['contactName', 'Contact person'], ['phone', 'Phone'], ['email', 'Email'], ['agreementRef', 'Agreement ref'], ['rate', 'Rate per bike (J$)']].map(([k, l]) => (
          <div key={k}><label style={st.label}>{l}</label><input style={st.input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
        ))}
        <div><label style={st.label}>Rate period</label>
          <select style={st.input} value={f.ratePeriod} onChange={(e) => setF({ ...f, ratePeriod: e.target.value })}>{['day', 'week', 'month'].map((x) => <option key={x}>{x}</option>)}</select></div>
      </div>
      <button onClick={add} style={{ ...small, marginTop: 8, background: C.purple, color: C.white, border: 'none' }}>Add provider</button>
      {msg && <span style={{ fontSize: 12, color: C.quiet, marginLeft: 8 }}>{msg}</span>}
    </div>
  );
}

export function FleetTab({ riders }) {
  const bikes = useLive('fleet_motorcycles');
  const providers = useLive('fleet_providers');
  const [editing, setEditing] = useState(null);
  if (!bikes || !providers || !riders) return <Spinner />;
  if (editing) return <BikeForm bike={editing === 'new' ? null : editing} providers={providers} onDone={() => setEditing(null)} />;
  const count = (s) => bikes.filter((b) => b.status === s).length;
  const onRoad = bikes.filter((b) => ['available', 'assigned', 'in_service'].includes(b.status)).length;
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, fontSize: 13 }}>
        <Pill tone="green">{onRoad} operational</Pill><Pill>{count('assigned')} assigned</Pill><Pill tone="green">{count('available')} free</Pill>
        <Pill tone="amber">{count('maintenance')} in maintenance</Pill><Pill tone="red">{count('unavailable')} unavailable</Pill>
      </div>
      <button style={{ ...st.btn, width: 'auto', padding: '10px 18px', marginBottom: 12 }} onClick={() => setEditing('new')}>+ Add motorcycle</button>
      {bikes.length === 0 && <div style={{ ...card, color: C.quiet }}>No motorcycles yet. Add the bikes from your fleet provider — riders need one before they can take deliveries.</div>}
      {[...bikes].filter((b) => b.status !== 'removed').sort((a, b) => (a.plate || '').localeCompare(b.plate || '')).map((b) => (
        <BikeCard key={b.id} b={b} riders={riders} providers={providers} onEdit={() => setEditing(b)} />
      ))}
      <Providers providers={providers} />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  SCHEDULE
// ═════════════════════════════════════════════════════════════════════════════
const TEMPLATES = { morning: ['07:00', '12:00'], afternoon: ['12:00', '17:00'], evening: ['17:00', '22:00'] };
const mondayOf = (date) => addDays(date, -((weekday(date) + 6) % 7));
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`;

function ShiftEditor({ shift, riders, date, presetStart, presetEnd, presetRider, onDone }) {
  const [f, setF] = useState(() => shift
    ? { ...shift }
    : { riderId: presetRider || '', date, type: presetStart ? 'custom' : 'morning', start: presetStart || TEMPLATES.morning[0], end: presetEnd || TEMPLATES.morning[1], isBackup: false, notes: '' });
  const [msg, setMsg] = useState('');
  const setType = (type) => setF({ ...f, type, ...(TEMPLATES[type] ? { start: TEMPLATES[type][0], end: TEMPLATES[type][1] } : {}) });
  const save = async () => {
    if (!f.riderId) { setMsg('Choose a rider.'); return; }
    const r = riders.find((x) => x.id === f.riderId);
    const data = { riderId: f.riderId, riderName: r?.name || '', date: f.date, start: f.start, end: f.end, type: f.type, isBackup: !!f.isBackup, notes: (f.notes || '').slice(0, 200), updatedAt: serverTimestamp() };
    try {
      if (shift) {
        const moved = shift.date !== f.date || shift.start !== f.start || shift.end !== f.end || shift.riderId !== f.riderId;
        await updateDoc(doc(dashDb(), 'rider_shifts', shift.id), { ...data, ...(moved ? { status: 'scheduled', reminderSent: false } : {}) });
      } else {
        await addDoc(collection(dashDb(), 'rider_shifts'), { ...data, status: 'scheduled', reminderSent: false, createdAt: serverTimestamp() });
      }
      onDone();
    } catch (e) { setMsg('Could not save the shift.'); }
  };
  const remove = async () => { await updateDoc(doc(dashDb(), 'rider_shifts', shift.id), { status: 'cancelled', updatedAt: serverTimestamp() }).catch(() => {}); onDone(); };
  return (
    <div style={{ ...card, border: `2px solid ${C.purpleLine}` }}>
      <div style={st.h2}>{shift ? 'Edit shift' : 'New shift'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '0 10px' }}>
        <div><label style={st.label}>Rider</label>
          <select style={st.input} value={f.riderId} onChange={(e) => setF({ ...f, riderId: e.target.value })}>
            <option value="">Choose…</option>{riders.filter((r) => r.status === 'approved').map((r) => <option key={r.id} value={r.id}>{r.name}{r.motorcycleId ? '' : ' (no bike)'}</option>)}
          </select></div>
        <div><label style={st.label}>Date</label><input style={st.input} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label style={st.label}>Shift</label>
          <select style={st.input} value={f.type} onChange={(e) => setType(e.target.value)}>
            <option value="morning">Morning 7–12</option><option value="afternoon">Afternoon 12–5</option><option value="evening">Evening 5–10</option><option value="custom">Custom</option>
          </select></div>
        <div><label style={st.label}>Start</label><input style={st.input} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, type: 'custom' })} /></div>
        <div><label style={st.label}>End</label><input style={st.input} type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value, type: 'custom' })} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '8px 0' }}>
        <input type="checkbox" checked={!!f.isBackup} onChange={(e) => setF({ ...f, isBackup: e.target.checked })} /> Backup rider (on call, not counted as planned cover)
      </label>
      <input style={st.input} placeholder="Notes (optional)" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      {msg && <div style={st.err}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button style={{ ...st.btnGhost, width: 'auto', padding: '9px 16px' }} onClick={onDone}>Close</button>
        <button style={{ ...st.btn, width: 'auto', padding: '9px 16px' }} onClick={save}>Save shift</button>
        {shift && shift.status !== 'cancelled' && <button style={{ ...st.btnDanger, width: 'auto', padding: '9px 16px' }} onClick={remove}>Cancel shift</button>}
      </div>
    </div>
  );
}

function CoverageDay({ date, shifts, demandRow, perRiderHour, riders, onAddAt }) {
  const cov = coverageFor(shifts, date);
  const now = new Date(Date.now() - 5 * 3600000);
  const isToday = date === jmToday();
  const onlineNow = riders.filter((r) => r.status === 'approved' && r.isOnline);
  const hours = [...Array(24).keys()].filter((h) => h >= 6 || cov[h].planned || demandRow[h]);
  const maxV = Math.max(1, ...hours.map((h) => Math.max(ridersNeeded(demandRow[h], perRiderHour), cov[h].planned + cov[h].backup)));
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <div style={st.h2}>{DAYS[weekday(date)]} {date} — cover vs demand</div>
        {isToday && <div style={{ fontSize: 12.5 }}>Right now: <b>{onlineNow.filter((r) => !r.activeDeliveryId).length}</b> available · <b>{onlineNow.filter((r) => r.activeDeliveryId).length}</b> on deliveries · <b>{onlineNow.length}</b> online</div>}
      </div>
      <div style={{ fontSize: 12, color: C.quiet, marginBottom: 8 }}>
        Bars: <span style={{ color: C.purple }}>■</span> planned riders, <span style={{ color: '#c4b5fd' }}>■</span> backups, outline = riders needed from the last 4 weeks of demand ({perRiderHour} deliveries per rider-hour). Tap a red hour to add a shift there.
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120, overflowX: 'auto' }}>
        {hours.map((h) => {
          const need = ridersNeeded(demandRow[h], perRiderHour);
          const c = cov[h];
          const short = need > c.planned;
          const unit = 96 / maxV;
          return (
            <button key={h} title={`${hourLabel(h)}: ${demandRow[h]} requests/hr avg · need ${need} · planned ${c.planned} (${c.confirmed} confirmed) · backup ${c.backup}`}
              onClick={() => short && onAddAt(h)}
              style={{ flex: '1 0 22px', minWidth: 22, background: 'none', border: 'none', padding: 0, cursor: short ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '100%', height: 98, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                {need > 0 && <div style={{ position: 'absolute', bottom: 0, left: 1, right: 1, height: need * unit, border: `1.5px dashed ${short ? C.red : C.green}`, borderRadius: 3 }} />}
                <div style={{ height: c.backup * unit, background: '#c4b5fd', margin: '0 4px', borderRadius: '3px 3px 0 0' }} />
                <div style={{ height: c.planned * unit, background: C.purple, margin: '0 4px', borderRadius: c.backup ? 0 : '3px 3px 0 0' }} />
              </div>
              <div style={{ fontSize: 10, color: short ? C.red : C.quiet, fontWeight: short ? 800 : 500, marginTop: 2 }}>{hourLabel(h)}</div>
              {isToday && now.getUTCHours() === h && <div style={{ width: 6, height: 6, borderRadius: 3, background: C.green }} />}
            </button>
          );
        })}
      </div>
      {(() => { const g = gaps(cov, demandRow, perRiderHour); return g.length ? <div style={{ fontSize: 12.5, color: C.red, marginTop: 6 }}>Short at {g.map((x) => `${hourLabel(x.hour)} (need ${x.need}, have ${x.have})`).join(', ')}</div> : <div style={{ fontSize: 12.5, color: C.green, marginTop: 6 }}>Planned cover meets past demand for this day.</div>; })()}
    </div>
  );
}

export function ScheduleTab({ riders, perRiderHour = 2 }) {
  const [week, setWeek] = useState(() => mondayOf(jmToday()));
  const [day, setDay] = useState(jmToday());
  const [editing, setEditing] = useState(null); // {shift} | {new:true, date, start, end}
  const [msg, setMsg] = useState('');
  const days = [...Array(7).keys()].map((i) => addDays(week, i));
  const shifts = useLive('rider_shifts', [where('date', '>=', addDays(week, -1)), where('date', '<=', days[6])], `w${week}`);
  const lastWeek = useLive('rider_shifts', [where('date', '>=', addDays(week, -7)), where('date', '<=', addDays(week, -1))], `lw${week}`);
  const since = useMemo(() => Timestamp.fromDate(new Date(Date.now() - 28 * 864e5)), []);
  const events = useLive('dash_demand_events', [where('at', '>=', since)], 'demand');
  const timeOff = useLive('rider_time_off', [where('status', '==', 'pending')], 'timeoff');
  const grid = useMemo(() => demandGrid(events || [], 4), [events]);
  if (!shifts || !riders) return <Spinner />;

  const copyLastWeek = async () => {
    setMsg('');
    const existing = new Set(shifts.map((s) => `${s.riderId}|${s.date}|${s.start}`));
    const copies = shiftWeekForward(lastWeek || []).filter((s) => !existing.has(`${s.riderId}|${s.date}|${s.start}`));
    if (!copies.length) { setMsg('Nothing to copy from last week.'); return; }
    const b = writeBatch(dashDb());
    copies.forEach((s) => b.set(doc(collection(dashDb(), 'rider_shifts')), { ...s, reminderSent: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    try { await b.commit(); setMsg(`Copied ${copies.length} shift(s). Riders will be asked to confirm.`); } catch (e) { setMsg('Could not copy shifts.'); }
  };
  const decideTimeOff = async (t, status) => updateDoc(doc(dashDb(), 'rider_time_off', t.id), { status, decidedAt: serverTimestamp() }).catch(() => {});
  const approved = riders.filter((r) => r.status === 'approved');
  const dayShifts = (d) => shifts.filter((s) => s.date === d && s.status !== 'cancelled');
  const toneOf = (s) => ({ confirmed: 'green', scheduled: 'amber', declined: 'red', missed: 'red', completed: 'grey' }[s.status] || 'grey');

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <button onClick={() => setWeek(addDays(week, -7))} style={{ ...small, background: '#f3f4f6', border: 'none' }}>‹ Prev week</button>
        <b style={{ fontSize: 13.5 }}>Week of {week}</b>
        <button onClick={() => setWeek(addDays(week, 7))} style={{ ...small, background: '#f3f4f6', border: 'none' }}>Next week ›</button>
        <button onClick={() => { setWeek(mondayOf(jmToday())); setDay(jmToday()); }} style={{ ...small, background: '#f3f4f6', border: 'none' }}>Today</button>
        <button onClick={copyLastWeek} style={{ ...small, background: C.purpleSoft, color: C.purple, border: `1px solid ${C.purpleLine}` }}>Copy last week</button>
        <button onClick={() => setEditing({ new: true, date: days.includes(day) ? day : week })} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>+ Add shift</button>
      </div>
      {msg && <div style={st.note}>{msg}</div>}
      {editing && (
        <ShiftEditor key={JSON.stringify(editing)} riders={riders} shift={editing.shift} date={editing.date} presetStart={editing.start} presetEnd={editing.end} presetRider={editing.riderId}
          onDone={() => setEditing(null)} />
      )}

      {(timeOff || []).length > 0 && (
        <div style={{ ...card, border: `2px solid ${C.amber}` }}>
          <div style={st.h2}>Day-off requests</div>
          {timeOff.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
              <span><b>{t.riderName}</b> · {t.date}{t.reason ? ` — ${t.reason}` : ''}</span>
              <span>
                <button onClick={() => decideTimeOff(t, 'approved')} style={{ ...small, background: C.green, color: C.white, border: 'none', marginRight: 6 }}>Approve</button>
                <button onClick={() => decideTimeOff(t, 'declined')} style={{ ...small, background: '#f3f4f6', border: 'none' }}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Week grid: riders × days */}
      <div style={{ ...card, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 6 }}>Rider</th>
              {days.map((d) => (
                <th key={d} onClick={() => setDay(d)} style={{ padding: 6, cursor: 'pointer', background: d === day ? C.purpleSoft : 'transparent', borderRadius: 8, color: d === jmToday() ? C.purple : C.ink }}>
                  {DAYS[weekday(d)]}<br /><span style={{ fontWeight: 500, color: C.quiet }}>{d.slice(5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {approved.length === 0 && <tr><td colSpan={8} style={{ padding: 10, color: C.quiet }}>No approved riders yet.</td></tr>}
            {approved.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}<div style={{ fontSize: 10.5, color: r.motorcycleId ? C.quiet : C.red, fontWeight: 500 }}>{r.motorcyclePlate || 'no bike'}</div></td>
                {days.map((d) => {
                  const mine = shifts.filter((s) => s.riderId === r.id && s.date === d && s.status !== 'cancelled');
                  const off = (timeOff || []).some((t) => t.riderId === r.id && t.date === d);
                  return (
                    <td key={d} style={{ padding: 4, verticalAlign: 'top', background: d === day ? '#fbf9ff' : 'transparent' }}>
                      {mine.map((s) => (
                        <button key={s.id} onClick={() => setEditing({ shift: s })}
                          style={{ display: 'block', width: '100%', marginBottom: 3, padding: '4px 5px', borderRadius: 7, border: 'none', cursor: 'pointer', textAlign: 'left',
                            background: { green: '#e8f7ef', amber: '#fff7e6', red: '#fdecec', grey: '#f3f4f6' }[toneOf(s)], color: C.ink, fontSize: 11 }}>
                          <b>{s.start}–{s.end}</b>{s.isBackup ? ' · backup' : ''}<br /><span style={{ color: C.quiet }}>{SHIFT_LABEL[s.status]}</span>
                        </button>
                      ))}
                      {off && <div style={{ fontSize: 10.5, color: C.amber }}>day-off request</div>}
                      <button onClick={() => setEditing({ new: true, date: d, riderId: r.id })} style={{ width: '100%', border: `1px dashed ${C.line}`, background: 'none', borderRadius: 7, color: C.quiet, cursor: 'pointer', fontSize: 11, padding: 2 }}>+</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CoverageDay date={day} shifts={shifts} demandRow={grid[weekday(day)]} perRiderHour={perRiderHour} riders={riders}
        onAddAt={(h) => setEditing({ new: true, date: day, start: `${String(h).padStart(2, '0')}:00`, end: `${String(Math.min(23, h + 4)).padStart(2, '0')}:00` })} />

      <div style={card}>
        <div style={st.h2}>Typical demand by day (last 4 weeks)</div>
        <div style={{ fontSize: 12, color: C.quiet, marginBottom: 6 }}>Average delivery and order requests per hour, including ones no rider could take.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 10.5, minWidth: 640 }}>
            <thead><tr><th />{[...Array(24).keys()].map((h) => <th key={h} style={{ padding: 2, fontWeight: 500, color: C.quiet }}>{hourLabel(h)}</th>)}</tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const mx = Math.max(0.1, ...grid.flat());
                return (
                  <tr key={d}><td style={{ padding: '2px 6px', fontWeight: 600 }}>{DAYS[d]}</td>
                    {grid[d].map((v, h) => (
                      <td key={h} title={`${DAYS[d]} ${hourLabel(h)}: ${v}/hr`} style={{ width: 22, height: 18, background: v ? `rgba(107,33,168,${0.12 + 0.8 * (v / mx)})` : '#f6f5f9', color: v / mx > 0.5 ? C.white : C.ink, textAlign: 'center', borderRadius: 3 }}>{v || ''}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {events && events.length === 0 && <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 6 }}>No demand recorded yet — this fills in as customers use VilleDash.</div>}
      </div>
    </>
  );
}
