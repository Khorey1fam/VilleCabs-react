// VilleDash Rider portal — served at /rider. Separate from the VilleCabs driver
// app; one login can be both a VilleCabs driver and a VilleDash rider.
import React, { useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc, onSnapshot, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { api, dashAuth, dashDb, errText, formatJMD, STATUS_LABEL, SHIFT_LABEL, DAYS, jmToday, weekday, uploadProof } from './dashApi';
import { C, st, Header, Pill, statusTone, Spinner } from './ui';
import { IssueForm } from './DeliveryTrack';
import { registerRiderPushToken } from '../App';

const NEXT = {
  assigned:   ['to_pickup', 'Start — heading to pickup'],
  to_pickup:  ['at_pickup', 'I’ve arrived at pickup'],
  at_pickup:  ['collected', 'Package collected'],
  collected:  ['to_dropoff', 'Start — heading to drop-off'],
  to_dropoff: ['at_dropoff', 'I’ve arrived at drop-off'],
};
const RIDER_ISSUES = [
  ['sender_unreachable', 'Can’t contact sender'], ['merchant_not_ready', 'Merchant not ready'],
  ['recipient_unavailable', 'Recipient unavailable'], ['wrong_address', 'Incorrect address'],
  ['damaged_package', 'Damaged package'], ['motorcycle_breakdown', 'Motorcycle breakdown'], ['other', 'Other problem'],
];
const mapsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

function SignIn() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try {
      if (mode === 'in') await signInWithEmailAndPassword(dashAuth(), email.trim(), pw);
      else await createUserWithEmailAndPassword(dashAuth(), email.trim(), pw);
    } catch (e) {
      const c = e.code || '';
      setErr(c.includes('email-already') ? 'That email already has an account — sign in instead.'
        : c.includes('weak-password') ? 'Use at least 6 characters.'
        : c.includes('invalid') || c.includes('wrong') || c.includes('not-found') ? 'Incorrect email or password.'
        : 'Could not sign in. Check your connection and try again.');
    }
    setBusy(false);
  };
  const reset = async () => {
    if (!email.trim()) { setErr('Enter your email first.'); return; }
    try { await sendPasswordResetEmail(dashAuth(), email.trim()); setErr('Password reset email sent.'); } catch (e) { setErr('Could not send the reset email.'); }
  };
  return (
    <div style={st.page}>
      <Header title="VilleDash Rider" />
      <div style={st.wrap}>
        <div style={st.card}>
          <div style={st.h1}>{mode === 'in' ? 'Rider sign in' : 'Create a rider login'}</div>
          <div style={st.sub}>Already a VilleCabs driver or customer? Sign in with the same account.</div>
          <label style={st.label}>Email</label>
          <input style={st.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label style={st.label}>Password</label>
          <input style={st.input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          {err && <div style={st.err}>{err}</div>}
          <button style={{ ...st.btn, marginTop: 12 }} disabled={busy} onClick={go}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create login'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 13 }}>
            <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 600, cursor: 'pointer' }}>
              {mode === 'in' ? 'New rider? Create a login' : 'Have a login? Sign in'}
            </button>
            {mode === 'in' && <button onClick={reset} style={{ background: 'none', border: 'none', color: C.quiet, cursor: 'pointer' }}>Forgot password?</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Apply({ user }) {
  const [f, setF] = useState({ name: user.displayName || '', phone: '', licenceNumber: '', licenceExpiry: '', trn: '', emName: '', emPhone: '' });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && f.phone.replace(/\D/g, '').length >= 7 && f.licenceNumber.trim() && f.emName.trim() && f.emPhone.replace(/\D/g, '').length >= 7 && agree;
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      await setDoc(doc(dashDb(), 'riders', user.uid), {
        name: f.name.trim().slice(0, 80), phone: f.phone.trim().slice(0, 20), email: user.email || null,
        licenceNumber: f.licenceNumber.trim().slice(0, 40), licenceExpiry: f.licenceExpiry || null, trn: f.trn.trim().slice(0, 20) || null,
        emergencyContact: { name: f.emName.trim().slice(0, 80), phone: f.emPhone.trim().slice(0, 20) },
        status: 'pending', isOnline: false, contractorTermsAccepted: true,
        backgroundCheck: 'not_started', createdAt: serverTimestamp(),
      });
    } catch (e) { setErr('Could not send your application. Please try again.'); }
    setBusy(false);
  };
  return (
    <div style={st.page}>
      <Header title="Apply to ride" right={<button onClick={() => signOut(dashAuth())} style={{ ...st.btnGhost, width: 'auto', padding: '6px 10px', fontSize: 12 }}>Sign out</button>} />
      <div style={st.wrap}>
        <div style={st.card}>
          <div style={st.sub}>VilleDash riders are independent contractors paid per completed delivery. Motorcycles are supplied through our fleet partner.</div>
          {[['name', 'Full name'], ['phone', 'Phone'], ['licenceNumber', 'Motorcycle licence number'], ['trn', 'TRN (optional)']].map(([k, l]) => (
            <div key={k}><label style={st.label}>{l}</label><input style={st.input} value={f[k]} onChange={set(k)} /></div>
          ))}
          <label style={st.label}>Licence expiry</label>
          <input style={st.input} type="date" value={f.licenceExpiry} onChange={set('licenceExpiry')} />
          <label style={st.label}>Emergency contact name</label>
          <input style={st.input} value={f.emName} onChange={set('emName')} />
          <label style={st.label}>Emergency contact phone</label>
          <input style={st.input} value={f.emPhone} onChange={set('emPhone')} />
          <div style={st.note}>After you apply, VilleDash will contact you to collect your ID, licence and police record, and to arrange a road check.</div>
          <label style={{ display: 'flex', gap: 8, fontSize: 13.5, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I understand riders are contractors paid per delivery, and I consent to a background check.</span>
          </label>
          {err && <div style={st.err}>{err}</div>}
          <button style={{ ...st.btn, marginTop: 12, opacity: ok && !busy ? 1 : 0.5 }} disabled={!ok || busy} onClick={submit}>Send application</button>
        </div>
      </div>
    </div>
  );
}

// Sends the rider's GPS while a job is active (throttled to one write / 10 s).
function useLocationSharing(rider, job) {
  const last = useRef(0);
  const [gpsErr, setGpsErr] = useState('');
  const active = job && ['assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'].includes(job.status);
  useEffect(() => {
    if (!active || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition((p) => {
      setGpsErr('');
      if (Date.now() - last.current < 10000) return;
      last.current = Date.now();
      setDoc(doc(dashDb(), 'dash_locations', job.id), {
        lat: p.coords.latitude, lng: p.coords.longitude,
        heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
        accuracy: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
        at: serverTimestamp(), riderId: rider.uid,
      }).catch(() => {});
    }, () => setGpsErr('GPS is off or blocked — the customer can’t see your location.'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [active, job && job.id, rider.uid]);
  return gpsErr;
}

function ProofButton({ job, kind, label }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const done = job.proofPhotos && job.proofPhotos[kind];
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ ...st.btnGhost, display: 'block', textAlign: 'center', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Uploading…' : done ? `✓ ${label} — retake` : `📷 ${label}`}
        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={busy}
          onChange={async (e) => { setBusy(true); setErr(''); try { await uploadProof(job.id, kind, e.target.files[0]); } catch (x) { setErr(errText(x)); } setBusy(false); }} />
      </label>
      {err && <div style={st.err}>{err}</div>}
    </div>
  );
}

function ActiveJob({ rider, job }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pin, setPin] = useState('');
  const [issue, setIssue] = useState(false);
  const gpsErr = useLocationSharing(rider, job);
  // Phone numbers are only readable once the job is ours.
  const [contact, setContact] = useState({});
  useEffect(() => onSnapshot(doc(dashDb(), 'dash_deliveries', job.id, 'private', 'contact'), (x) => setContact(x.exists() ? x.data() : {}), () => setContact({})), [job.id]);
  const next = NEXT[job.status];
  const toPickup = ['assigned', 'to_pickup', 'at_pickup'].includes(job.status);
  const target = toPickup ? job.pickup : job.dropoff;

  const move = async (status) => {
    setBusy(true); setErr('');
    try { await api.riderStatus({ deliveryId: job.id, status }); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const checkPin = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.verifyPin({ deliveryId: job.id, pin });
      if (!r.ok) setErr(r.locked ? 'Too many wrong PINs. Call VilleDash support to finish this delivery.' : `Wrong PIN. ${r.attemptsLeft} tries left.`);
      setPin('');
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  return (
    <>
      <div style={{ ...st.card, border: `2px solid ${C.purpleLine}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={st.h2}>Current delivery</div><Pill tone={statusTone(job.status)}>{STATUS_LABEL[job.status]}</Pill>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.purple, textTransform: 'uppercase', marginTop: 4 }}>{toPickup ? 'Pickup' : 'Drop-off'}</div>
        <div style={{ fontSize: 16, fontWeight: 700, margin: '2px 0' }}>{target.address}</div>
        {target.landmark && <div style={st.sub}>Landmark: {target.landmark}</div>}
        {target.instructions && <div style={st.sub}>Note: {target.instructions}</div>}
        <div style={{ ...st.sub, marginTop: 4 }}>{toPickup ? `${job.pickup.contactName} · ${contact.senderPhone || ''}` : `${job.dropoff.recipientName} · ${contact.recipientPhone || ''}`}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <a href={mapsLink(target.lat, target.lng)} target="_blank" rel="noreferrer" style={{ ...st.btnGhost, textAlign: 'center', textDecoration: 'none' }}>🧭 Navigate</a>
          <a href={`tel:${toPickup ? contact.senderPhone : contact.recipientPhone}`} style={{ ...st.btnGhost, textAlign: 'center', textDecoration: 'none' }}>📞 Call</a>
        </div>
        <div style={{ ...st.row, marginTop: 10 }}><span style={{ color: C.quiet }}>Package</span><span>{job.package.description}{job.package.fragile ? ' · FRAGILE' : ''}</span></div>
        {job.payment.method === 'card'
          ? <div style={st.row}><span style={{ color: C.quiet }}>Payment</span><b style={{ color: C.green }}>Paid by card · collect nothing</b></div>
          : <div style={st.row}><span style={{ color: C.quiet }}>Collect cash</span><b>{formatJMD(job.cashToCollectCents ?? job.quote.totalCents)} from {job.payment.collectFrom === 'recipient' ? 'recipient' : 'sender'}</b></div>}
        <div style={st.row}><span style={{ color: C.quiet }}>Your pay</span><b>{formatJMD(job.riderPayCents)}</b></div>
      </div>
      {job.type === 'market' && ['assigned', 'to_pickup', 'at_pickup'].includes(job.status) && (
        <div style={st.note}>{job.merchantReady ? '✅ The store has marked this order ready.' : `The store is still preparing this order${job.estimatedReadyAt?.toDate ? ` — ready about ${job.estimatedReadyAt.toDate().toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' })}` : ''}. You can collect it once they mark it ready.`}</div>
      )}
      {['at_pickup', 'collected'].includes(job.status) && <ProofButton job={job} kind="pickup" label="Photo of the package at pickup" />}
      {job.status === 'at_dropoff' && <ProofButton job={job} kind="dropoff" label="Photo of the handover (optional)" />}
      {gpsErr && <div style={st.err}>{gpsErr}</div>}
      {err && <div style={st.err}>{err}</div>}
      {next && (() => {
        const waiting = job.type === 'market' && next[0] === 'collected' && !job.merchantReady;
        return <button style={{ ...st.btn, padding: 18, fontSize: 16, opacity: busy || waiting ? 0.5 : 1 }} disabled={busy || waiting} onClick={() => move(next[0])}>{busy ? 'Saving…' : waiting ? 'Waiting for the store…' : next[1]}</button>;
      })()}
      {job.status === 'at_dropoff' && (
        <div style={st.card}>
          <div style={st.h2}>Enter the recipient's PIN</div>
          <div style={st.sub}>Hand over the package, then ask the recipient for their 4-digit delivery PIN.</div>
          <input style={{ ...st.input, fontSize: 28, letterSpacing: 12, textAlign: 'center', marginTop: 10 }} inputMode="numeric" maxLength={4}
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} disabled={job.pinLocked} />
          <button style={{ ...st.btn, marginTop: 10, opacity: pin.length === 4 && !busy ? 1 : 0.5 }} disabled={pin.length !== 4 || busy || job.pinLocked} onClick={checkPin}>Confirm delivery</button>
        </div>
      )}
      <button style={{ ...st.btnGhost, marginTop: 10 }} onClick={() => setIssue(!issue)}>Report a problem</button>
      {issue && <IssueForm deliveryId={job.id} categories={RIDER_ISSUES} onDone={() => setIssue(false)} />}
    </>
  );
}

function Offers({ rider }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    const q = query(collection(dashDb(), 'dash_deliveries'), where('status', '==', 'requested'));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((d) => (!d.offeredTo || d.offeredTo === rider.uid) && !(d.declinedBy || []).includes(rider.uid))
      .sort((a, b) => Number(b.offeredTo === rider.uid) - Number(a.offeredTo === rider.uid))), () => setList([]));
  }, [rider.uid]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const decline = async (id) => {
    setBusyId(id); setErr('');
    try { await api.declineOffer({ deliveryId: id }); } catch (e) { setErr(errText(e)); }
    setBusyId(null);
  };
  const accept = async (id) => {
    setBusyId(id); setErr('');
    try { await api.accept({ deliveryId: id }); } catch (e) { setErr(errText(e)); }
    setBusyId(null);
  };
  if (list === null) return <Spinner label="Looking for deliveries…" />;
  return (
    <>
      <div style={st.h2}>Available deliveries</div>
      {err && <div style={st.err}>{err}</div>}
      {list.length === 0 && <div style={{ ...st.card, ...st.sub }}>No open deliveries right now. You'll get a notification when one comes in.</div>}
      {list.map((d) => {
        const mine = d.offeredTo === rider.uid;
        const left = mine && d.offerExpiresAt?.toMillis ? Math.max(0, Math.round((d.offerExpiresAt.toMillis() - now) / 1000)) : null;
        if (mine && left === 0) return null;
        return (
        <div key={d.id} style={{ ...st.card, ...(mine ? { border: `2px solid ${C.purple}` } : {}) }}>
          {mine && <div style={{ fontSize: 12, fontWeight: 800, color: C.purple, marginBottom: 6 }}>OFFERED TO YOU · {left}s to accept{d.offerKm != null ? ` · ${d.offerKm} km to pickup` : ''}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>{d.pickup.address.split(',')[0]} → {d.dropoff.address.split(',')[0]}</b>
            <b style={{ color: C.green }}>{formatJMD(d.riderPayCents)}</b>
          </div>
          <div style={{ ...st.sub, marginTop: 4 }}>
            ~{d.quote.distanceKm} km · {d.type === 'market' ? `Store order from ${d.merchantName}` : `${d.package.size} ${d.package.category.replace('_', ' ')}`}{d.package.fragile ? ' · fragile' : ''}
          </div>
          {d.pickup.instructions && <div style={{ ...st.sub, marginTop: 2 }}>Pickup note: {d.pickup.instructions}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={{ ...st.btn, flex: 2 }} disabled={!!busyId} onClick={() => accept(d.id)}>{busyId === d.id ? 'Accepting…' : 'Accept'}</button>
            {mine && <button style={{ ...st.btnGhost, flex: 1 }} disabled={!!busyId} onClick={() => decline(d.id)}>Pass</button>}
          </div>
        </div>
        );
      })}
    </>
  );
}

function Earnings({ uid }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const q = query(collection(dashDb(), 'dash_deliveries'), where('riderId', '==', uid), orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => d.data()).filter((d) => d.status === 'delivered')), () => setRows([]));
  }, [uid]);
  if (!rows) return null;
  const doneAt = (d) => (d.statusTimes?.delivered?.toDate ? d.statusTimes.delivered.toDate() : null);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - ((startWeek.getDay() + 6) % 7)); // Monday
  const sum = (from) => rows.filter((d) => doneAt(d) && doneAt(d) >= from).reduce((s, d) => s + (d.riderPayCents || 0), 0);
  const count = (from) => rows.filter((d) => doneAt(d) && doneAt(d) >= from).length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
      <div style={st.card}><div style={st.label}>Today</div><div style={{ fontSize: 20, fontWeight: 800 }}>{formatJMD(sum(startToday))}</div><div style={st.sub}>{count(startToday)} {count(startToday) === 1 ? 'delivery' : 'deliveries'}</div></div>
      <div style={st.card}><div style={st.label}>This week</div><div style={{ fontSize: 20, fontWeight: 800 }}>{formatJMD(sum(startWeek))}</div><div style={st.sub}>{count(startWeek)} {count(startWeek) === 1 ? 'delivery' : 'deliveries'}</div></div>
    </div>
  );
}

function Schedule({ uid, name }) {
  const [shifts, setShifts] = useState(null);
  const [offs, setOffs] = useState([]);
  const [offDate, setOffDate] = useState('');
  const [offReason, setOffReason] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const today = jmToday();
    const u1 = onSnapshot(query(collection(dashDb(), 'rider_shifts'), where('riderId', '==', uid), where('date', '>=', today), orderBy('date', 'asc'), limit(30)),
      (s) => setShifts(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status !== 'cancelled')), () => setShifts([]));
    const u2 = onSnapshot(query(collection(dashDb(), 'rider_time_off'), where('riderId', '==', uid)),
      (s) => setOffs(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.date >= today)), () => setOffs([]));
    return () => { u1(); u2(); };
  }, [uid]);
  const respond = async (sh, status) => {
    setMsg('');
    try { await updateDoc(doc(dashDb(), 'rider_shifts', sh.id), { status, respondedAt: serverTimestamp() }); } catch (e) { setMsg('Could not update the shift.'); }
  };
  const requestOff = async () => {
    setMsg('');
    if (!offDate) return;
    try {
      await addDoc(collection(dashDb(), 'rider_time_off'), { riderId: uid, riderName: name || '', date: offDate, reason: offReason.trim().slice(0, 200), status: 'pending', createdAt: serverTimestamp() });
      setOffDate(''); setOffReason(''); setMsg('Day-off request sent.');
    } catch (e) { setMsg('Could not send the request.'); }
  };
  if (!shifts) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={st.h2}>My schedule</div>
      {shifts.length === 0 && <div style={{ ...st.card, ...st.sub }}>No upcoming shifts. VilleDash will add shifts based on demand.</div>}
      {shifts.map((sh) => (
        <div key={sh.id} style={{ ...st.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <b>{DAYS[weekday(sh.date)]} {sh.date.slice(5)} · {sh.start}–{sh.end}</b>{sh.isBackup ? <span style={{ color: C.quiet }}> · backup</span> : null}
            <div style={{ fontSize: 12.5, color: C.quiet }}>{SHIFT_LABEL[sh.status]}{sh.notes ? ` · ${sh.notes}` : ''}</div>
          </div>
          {['scheduled', 'confirmed'].includes(sh.status) && (
            <div style={{ display: 'flex', gap: 6 }}>
              {sh.status === 'scheduled' && <button onClick={() => respond(sh, 'confirmed')} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: C.green, color: C.white, fontWeight: 700, cursor: 'pointer' }}>Confirm</button>}
              <button onClick={() => respond(sh, 'declined')} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #fecaca', background: '#fff5f5', color: C.red, fontWeight: 700, cursor: 'pointer' }}>Can't do it</button>
            </div>
          )}
        </div>
      ))}
      <div style={st.card}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Request a day off</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input type="date" style={{ ...st.input, width: 'auto' }} value={offDate} min={jmToday()} onChange={(e) => setOffDate(e.target.value)} />
          <input style={{ ...st.input, flex: 1, minWidth: 140 }} placeholder="Reason (optional)" value={offReason} onChange={(e) => setOffReason(e.target.value)} />
          <button onClick={requestOff} disabled={!offDate} style={{ ...st.btn, width: 'auto', padding: '10px 16px', opacity: offDate ? 1 : 0.5 }}>Send</button>
        </div>
        {offs.map((o) => (
          <div key={o.id} style={{ fontSize: 12.5, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>{o.date}{o.reason ? ` — ${o.reason}` : ''}: <b>{o.status}</b></span>
            {o.status === 'pending' && <button onClick={() => deleteDoc(doc(dashDb(), 'rider_time_off', o.id)).catch(() => {})} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer' }}>Withdraw</button>}
          </div>
        ))}
        {msg && <div style={st.note}>{msg}</div>}
      </div>
    </div>
  );
}

function Dashboard({ user, rider }) {
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!rider.activeDeliveryId) { setJob(null); return undefined; }
    return onSnapshot(doc(dashDb(), 'dash_deliveries', rider.activeDeliveryId), (s) => setJob(s.exists() ? { id: s.id, ...s.data() } : null), () => setJob(null));
  }, [rider.activeDeliveryId]);
  useEffect(() => {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') registerRiderPushToken(user.uid); } catch (e) { /* optional */ }
  }, [user.uid]);
  // While online and between jobs, share a rough position once a minute so
  // dispatch can offer the nearest rider each new job.
  useEffect(() => {
    if (!rider.isOnline || rider.activeDeliveryId || !navigator.geolocation) return undefined;
    const send = () => navigator.geolocation.getCurrentPosition((p) => {
      updateDoc(doc(dashDb(), 'riders', user.uid), { lastLocation: { lat: p.coords.latitude, lng: p.coords.longitude, at: serverTimestamp() } }).catch(() => {});
    }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 });
    send();
    const t = setInterval(send, 60000);
    return () => clearInterval(t);
  }, [rider.isOnline, rider.activeDeliveryId, user.uid]);

  const toggle = async () => {
    setErr('');
    if (rider.isOnline && rider.activeDeliveryId) { setErr('Finish your current delivery before going offline.'); return; }
    if (!rider.isOnline && !rider.motorcycleId) { setErr('You need a VilleDash motorcycle assigned before going online. Contact dispatch.'); return; }
    try {
      if (!rider.isOnline && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => {});
        registerRiderPushToken(user.uid);
      }
      await updateDoc(doc(dashDb(), 'riders', user.uid), { isOnline: !rider.isOnline, lastOnlineChange: serverTimestamp() });
    } catch (e) { setErr('Could not change your status. Check your connection.'); }
  };

  return (
    <div style={st.page}>
      <Header title="VilleDash Rider" right={<button onClick={() => signOut(dashAuth())} style={{ ...st.btnGhost, width: 'auto', padding: '6px 10px', fontSize: 12 }}>Sign out</button>} />
      <div style={st.wrap}>
        <div style={{ ...st.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{rider.name}</div>
            <div style={st.sub}>{rider.motorcyclePlate ? `Motorcycle ${rider.motorcyclePlate}` : 'No motorcycle assigned yet'}</div>
          </div>
          <button onClick={toggle}
            style={{ padding: '10px 16px', borderRadius: 24, border: 'none', fontWeight: 800, cursor: 'pointer',
              background: rider.isOnline ? C.green : '#e5e7eb', color: rider.isOnline ? C.white : C.ink }}>
            {rider.isOnline ? '● Online' : 'Go online'}
          </button>
        </div>
        {err && <div style={st.err}>{err}</div>}
        <Earnings uid={user.uid} />
        {job ? <ActiveJob rider={{ uid: user.uid, ...rider }} job={job} />
          : rider.isOnline ? <Offers rider={{ uid: user.uid, ...rider }} />
          : <div style={{ ...st.card, ...st.sub }}>You're offline. Go online to see and accept deliveries.</div>}
        {!job && <Schedule uid={user.uid} name={rider.name} />}
        <div style={{ ...st.note, marginTop: 16 }}>Safety first: don't use the app while riding. Pull over before tapping anything.</div>
      </div>
    </div>
  );
}

export default function RiderPortal() {
  const [user, setUser] = useState(undefined);
  const [rider, setRider] = useState(undefined);
  useEffect(() => onAuthStateChanged(dashAuth(), (u) => setUser(u || null)), []);
  useEffect(() => {
    if (!user) { setRider(user === null ? null : undefined); return undefined; }
    return onSnapshot(doc(dashDb(), 'riders', user.uid), (s) => setRider(s.exists() ? s.data() : null), () => setRider(null));
  }, [user]);

  if (user === undefined || (user && rider === undefined)) return <div style={st.page}><Spinner /></div>;
  if (!user) return <SignIn />;
  if (!rider) return <Apply user={user} />;
  if (rider.status !== 'approved') {
    return (
      <div style={st.page}>
        <Header title="VilleDash Rider" right={<button onClick={() => signOut(dashAuth())} style={{ ...st.btnGhost, width: 'auto', padding: '6px 10px', fontSize: 12 }}>Sign out</button>} />
        <div style={st.wrap}>
          <div style={{ ...st.card, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>{rider.status === 'pending' ? '⏳' : '⛔'}</div>
            <div style={st.h2}>{rider.status === 'pending' ? 'Application under review' : rider.status === 'suspended' ? 'Account suspended' : 'Application not approved'}</div>
            <div style={st.sub}>{rider.status === 'pending' ? 'We’ll contact you to complete your documents and road check.' : 'Contact VilleDash support at admin@villecabs.com.'}</div>
          </div>
        </div>
      </div>
    );
  }
  return <Dashboard user={user} rider={rider} />;
}
