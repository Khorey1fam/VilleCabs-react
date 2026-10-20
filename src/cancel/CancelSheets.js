// Cancel sheets for riders and drivers. Both show the outcome (fee or no fee)
// before anything happens; the server makes the final decision.
import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { dashDb } from '../dash/dashApi';
import {
  CUSTOMER_REASONS, DRIVER_REASONS, FEE_STAGES, mergeCfg, decide, acceptMs, arriveMs,
  freeWindowLeft, noShowWaitLeft, jmd, mmss,
} from './cancelRules';

const P = '#6b21a8';
const INK = '#1a1530';
const MUTED = '#5f5873';

export function useCancelConfig() {
  const [cfg, setCfg] = useState(mergeCfg(null));
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'cancellation'), (s) => setCfg(mergeCfg(s.exists() ? s.data() : null)), () => {}), []);
  return cfg;
}
export function useCancelBalance(uid) {
  const [owed, setOwed] = useState(0);
  useEffect(() => {
    if (!uid) { setOwed(0); return undefined; }
    return onSnapshot(doc(dashDb(), 'customer_balances', uid), (s) => setOwed(Math.max(0, (s.exists() && s.data().cancelFeeOwedJmd) || 0)), () => setOwed(0));
  }, [uid]);
  return owed;
}
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function Sheet({ title, children, onClose, labelId }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={labelId} style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(16,10,30,0.55)', border: 'none', cursor: 'pointer' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '20px 18px calc(18px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)', color: INK, fontFamily: 'inherit' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e4dcef', margin: '0 auto 14px' }} />
        <h2 id={labelId} style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
function Reason({ name, value, checked, onChange, label, hint, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 12px', borderRadius: 12, border: `1.5px solid ${checked ? P : '#ece6f5'}`, background: checked ? '#f7f2fd' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, minHeight: 44, boxSizing: 'border-box' }}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} style={{ width: 18, height: 18, marginTop: 1, accentColor: P, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 }}>{hint}</span>}
      </span>
    </label>
  );
}
function Note({ tone = 'info', children }) {
  const t = { info: ['#f5f0ff', '#4c1d95', '#e4d4fb'], warn: ['#fff7ed', '#9a3412', '#fdba74'], ok: ['#ecfdf3', '#05603a', '#a6f4c5'] }[tone];
  return <div role="status" style={{ background: t[0], color: t[1], border: `1px solid ${t[2]}`, borderRadius: 12, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.5, margin: '12px 0 0' }}>{children}</div>;
}
const btn = (primary, danger) => ({ width: '100%', minHeight: 48, borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', border: primary ? 'none' : '1.5px solid #e4dcef', background: primary ? (danger ? '#dc2626' : P) : '#fff', color: primary ? '#fff' : INK });

// ── Rider ────────────────────────────────────────────────────────────────────
export function CustomerCancelSheet({ booking, bookingId, onClose, onDone }) {
  const cfg = useCancelConfig();
  const now = useNow();
  const stage = booking?.status || 'searching';
  const withDriver = FEE_STAGES.includes(stage) && !!acceptMs(booking);
  const keys = Object.keys(CUSTOMER_REASONS).filter((k) => (withDriver ? k !== 'search_too_long' : !['driver_late', 'driver_asked', 'driver_problem'].includes(k)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const d = decide({ by: 'customer', reasonKey: reason || 'changed_mind', stage, acceptedMs: acceptMs(booking), arrivedMs: arriveMs(booking), nowMs: now, cfg });
  const left = freeWindowLeft(booking || {}, cfg, now);
  const byCard = booking?.payment?.status === 'paid';
  const where = byCard ? 'kept from your card refund' : 'added to your next ride';

  const confirm = async () => {
    if (!reason) { setErr('Choose a reason.'); return; }
    setBusy(true); setErr('');
    try {
      await updateDoc(doc(dashDb(), 'bookings', bookingId), {
        status: 'cancelled', cancelledBy: 'customer', cancelReasonKey: reason, cancelReason: CUSTOMER_REASONS[reason].label, cancelledAt: serverTimestamp(),
      });
      if (booking?.driverId) { try { await updateDoc(doc(dashDb(), 'drivers', booking.driverId), { currentRideId: null }); } catch (e) { /* driver app frees itself */ } }
      onDone && onDone(d);
    } catch (e) { setErr('Couldn’t cancel. Check your connection and try again.'); setBusy(false); }
  };

  return (
    <Sheet title="Cancel this ride?" onClose={onClose} labelId="vc-cancel-title">
      <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 14 }}>Tell us why. It helps us improve.</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <legend style={{ position: 'absolute', left: -9999 }}>Reason for cancelling</legend>
        {keys.map((k) => <Reason key={k} name="vc-cancel-reason" value={k} checked={reason === k} onChange={() => setReason(k)} label={CUSTOMER_REASONS[k].label} />)}
      </fieldset>
      {!withDriver && <Note tone="ok">No fee. A driver hasn’t accepted your ride yet.</Note>}
      {withDriver && d.why === 'free_window' && <Note tone="ok">No fee if you cancel in the next <b>{mmss(left)}</b>. After that, a {jmd(cfg.feeJmd)} cancellation fee applies.</Note>}
      {withDriver && d.why === 'driver_late' && <Note tone="ok">No fee. Your driver still hasn’t arrived {cfg.lateMinutes} minutes after accepting.</Note>}
      {withDriver && d.feeStatus === 'owed' && <Note tone="warn"><b>{jmd(d.feeJmd)} cancellation fee</b>, {where}. Your driver has already been on the way for over {cfg.freeMinutes} minutes.{reason === 'driver_late' ? ` If they still haven’t arrived ${cfg.lateMinutes} minutes after accepting, it’s free.` : ''}</Note>}
      {withDriver && d.feeStatus === 'review' && <Note>We’ll look into what happened. If the fee applies, {jmd(d.feeJmd)} will be {where}. If your driver was at fault, there’s no fee.</Note>}
      {err && <div role="alert" style={{ color: '#b42318', fontSize: 13.5, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <button type="button" style={btn(true, true)} disabled={busy || !reason} onClick={confirm}>{busy ? 'Cancelling…' : d.feeStatus === 'owed' ? `Cancel ride · ${jmd(d.feeJmd)} fee` : 'Cancel ride'}</button>
        <button type="button" style={btn(false)} onClick={onClose}>Keep my ride</button>
      </div>
    </Sheet>
  );
}

// ── Driver ───────────────────────────────────────────────────────────────────
const RIDER_SIDE = ['rider_no_show', 'rider_asked', 'safety'];
const MY_SIDE = ['vehicle', 'emergency', 'too_far', 'personal', 'other'];
export function DriverCancelSheet({ booking, bookingId, onClose, onDone }) {
  const cfg = useCancelConfig();
  const now = useNow();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const wait = noShowWaitLeft(booking || {}, cfg, now);
  const d = useMemo(() => (reason ? decide({ by: 'driver', reasonKey: reason, stage: booking?.status, acceptedMs: acceptMs(booking), arrivedMs: arriveMs(booking), nowMs: now, cfg }) : null), [reason, booking, now, cfg]);
  const share = Math.round((d ? d.feeJmd : 0) * mergeCfg(cfg).driverSharePct / 100);

  const confirm = async () => {
    if (!reason) { setErr('Choose a reason.'); return; }
    setBusy(true); setErr('');
    try {
      const r = (await httpsCallable(getFunctions(getApp()), 'rideDriverCancel')({ bookingId, reasonKey: reason, note })).data;
      onDone && onDone(r);
    } catch (e) { setErr(e?.message || 'Couldn’t cancel. Try again.'); setBusy(false); }
  };
  const hint = (k) => {
    if (k === 'rider_no_show') {
      if (booking?.status !== 'arrived') return 'Tap “Arrived at Pickup” first, then wait for the rider.';
      return wait > 0 ? `Available in ${mmss(wait)} (after waiting ${cfg.noShowWaitMinutes} min at the pickup)` : 'You’ve waited long enough to cancel.';
    }
    return null;
  };

  return (
    <Sheet title="Cancel this trip?" onClose={onClose} labelId="vc-dcancel-title">
      <p style={{ margin: '0 0 12px', color: MUTED, fontSize: 14 }}>Choose what happened.</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', padding: '2px 0 6px' }}>The rider</legend>
        {RIDER_SIDE.map((k) => <Reason key={k} name="vc-dcancel" value={k} checked={reason === k} onChange={() => setReason(k)} label={DRIVER_REASONS[k].label} hint={hint(k)} disabled={k === 'rider_no_show' && wait > 0} />)}
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: '14px 0 0', display: 'grid', gap: 8 }}>
        <legend style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', padding: '2px 0 6px' }}>My side: we’ll find the rider another driver</legend>
        {MY_SIDE.map((k) => <Reason key={k} name="vc-dcancel" value={k} checked={reason === k} onChange={() => setReason(k)} label={DRIVER_REASONS[k].label} />)}
      </fieldset>
      {d && d.feeStatus === 'owed' && <Note tone="ok">The rider pays a {jmd(d.feeJmd)} cancellation fee on their next ride. You’ll earn {jmd(share)} from it once it’s collected.</Note>}
      {d && reason === 'rider_asked' && d.why === 'free_window' && <Note>No fee: you accepted less than {cfg.freeMinutes} minutes ago. The ride will be cancelled.</Note>}
      {d && reason === 'safety' && <Note>The ride will be cancelled with no fee, and VilleCabs will review what happened. If you’re in danger, use SOS or call 119.</Note>}
      {d && DRIVER_REASONS[reason].outcome === 'redispatch' && <Note tone="warn">The rider isn’t charged, and we’ll send the ride to another driver. Cancelling often on your side can affect your account.</Note>}
      {reason && (
        <label style={{ display: 'block', marginTop: 12, fontSize: 13.5, fontWeight: 600 }}>
          Add a note (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, borderRadius: 12, border: '1.5px solid #e4dcef', padding: 10, font: 'inherit', fontSize: 14 }} />
        </label>
      )}
      {err && <div role="alert" style={{ color: '#b42318', fontSize: 13.5, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <button type="button" style={btn(true, true)} disabled={busy || !reason} onClick={confirm}>{busy ? 'Cancelling…' : 'Cancel trip'}</button>
        <button type="button" style={btn(false)} onClick={onClose}>Keep the trip</button>
      </div>
    </Sheet>
  );
}
