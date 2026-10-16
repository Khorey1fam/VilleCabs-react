/* ═══════════════════════════════════════════════════════════════════════════
   VilleDash Fleet & Shifts — Cloud Functions
   FILE LOCATION: functions/dash/fleet.js   (loaded from functions/dash/index.js)

   fleet_providers/{id}            the company that owns the bikes (admin only)
   fleet_motorcycles/{id}          one per bike; assignedRiderId, status, expiry dates
     /log/{id}                     inspections, faults, maintenance
   rider_shifts/{id}               planned shifts (admin writes; rider confirms/declines)
   rider_time_off/{id}             rider day-off requests (rider creates, admin decides)
   rider_online_sessions/{id}      when each rider was actually online

   A planned shift is never treated as proof a rider is online. Attendance is
   worked out from rider_online_sessions after the shift ends.
   ═══════════════════════════════════════════════════════════════════════════ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { FieldValue } = require('firebase-admin/firestore');
const L = require('./logic');
const { db, requireAdmin, audit, pushTo } = require('./common');
const { runShiftJobs } = require('./shiftjobs');

// ── Assign / unassign a motorcycle ───────────────────────────────────────────
exports.dashAdminAssignMotorcycle = onCall(async (req) => {
  const auth = requireAdmin(req);
  const bikeId = L.cleanText(req.data && req.data.motorcycleId, 60);
  const riderId = req.data && req.data.riderId ? L.cleanText(req.data.riderId, 128) : null;
  const bikeRef = db().doc(`fleet_motorcycles/${bikeId}`);
  await db().runTransaction(async (tx) => {
    const bike = await tx.get(bikeRef);
    if (!bike.exists) throw new HttpsError('not-found', 'Motorcycle not found.');
    const b = bike.data();
    const prevRef = b.assignedRiderId ? db().doc(`riders/${b.assignedRiderId}`) : null;
    const prev = prevRef ? await tx.get(prevRef) : null;
    const riderRef = riderId ? db().doc(`riders/${riderId}`) : null;
    const rider = riderRef ? await tx.get(riderRef) : null;
    if (riderId) {
      if (!rider.exists || rider.get('status') !== 'approved') throw new HttpsError('failed-precondition', 'Only approved riders can be given a motorcycle.');
      if (!L.BIKE_ASSIGNABLE.includes(b.status)) throw new HttpsError('failed-precondition', `This motorcycle is ${b.status.replace('_', ' ')}.`);
      const other = rider.get('motorcycleId');
      if (other && other !== bikeId) throw new HttpsError('failed-precondition', `${rider.get('name')} already has ${rider.get('motorcyclePlate') || 'another motorcycle'}. Unassign it first.`);
    }
    if (prev && prev.exists && prev.id !== riderId) {
      if (prev.get('activeDeliveryId')) throw new HttpsError('failed-precondition', `${prev.get('name')} is on a delivery with this motorcycle.`);
      tx.update(prevRef, { motorcycleId: null, motorcyclePlate: null, isOnline: false, updatedAt: FieldValue.serverTimestamp() });
    }
    if (riderId) {
      tx.update(riderRef, { motorcycleId: bikeId, motorcyclePlate: b.plate || null, updatedAt: FieldValue.serverTimestamp() });
      tx.update(bikeRef, { assignedRiderId: riderId, assignedRiderName: rider.get('name') || null, status: 'assigned', assignedAt: FieldValue.serverTimestamp() });
    } else {
      tx.update(bikeRef, { assignedRiderId: null, assignedRiderName: null, status: b.status === 'assigned' || b.status === 'in_service' ? 'available' : b.status });
    }
    tx.set(bikeRef.collection('log').doc(), {
      type: 'assignment', note: riderId ? `Assigned to ${rider.get('name')}` : 'Unassigned', by: auth.uid, at: FieldValue.serverTimestamp(),
    });
    audit(tx, { actor: auth.uid, role: 'admin', action: riderId ? 'fleet.assign' : 'fleet.unassign', target: bikeId, details: { riderId, previous: b.assignedRiderId || null } });
  });
  return { ok: true };
});

// ── Change a motorcycle's status (maintenance etc.) ──────────────────────────
exports.dashAdminSetMotorcycleStatus = onCall(async (req) => {
  const auth = requireAdmin(req);
  const bikeId = L.cleanText(req.data && req.data.motorcycleId, 60);
  const status = L.cleanText(req.data && req.data.status, 20);
  const note = L.cleanText(req.data && req.data.note, 300);
  if (!L.BIKE_STATUSES.includes(status)) throw new HttpsError('invalid-argument', 'Unknown status.');
  const bikeRef = db().doc(`fleet_motorcycles/${bikeId}`);
  await db().runTransaction(async (tx) => {
    const bike = await tx.get(bikeRef);
    if (!bike.exists) throw new HttpsError('not-found', 'Motorcycle not found.');
    const b = bike.data();
    const riderRef = b.assignedRiderId ? db().doc(`riders/${b.assignedRiderId}`) : null;
    const rider = riderRef ? await tx.get(riderRef) : null;
    const offRoad = !L.BIKE_ASSIGNABLE.includes(status);
    if (offRoad && rider && rider.exists && rider.get('activeDeliveryId')) {
      throw new HttpsError('failed-precondition', `${rider.get('name')} is on a delivery. Reassign the delivery first.`);
    }
    const patch = { status, statusNote: note || null, updatedAt: FieldValue.serverTimestamp() };
    if (offRoad && riderRef) {
      // Taking a bike off the road takes it off its rider too.
      Object.assign(patch, { assignedRiderId: null, assignedRiderName: null });
      tx.update(riderRef, { motorcycleId: null, motorcyclePlate: null, isOnline: false, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.update(bikeRef, patch);
    tx.set(bikeRef.collection('log').doc(), { type: 'status', note: `${b.status} → ${status}${note ? `: ${note}` : ''}`, by: auth.uid, at: FieldValue.serverTimestamp() });
    audit(tx, { actor: auth.uid, role: 'admin', action: 'fleet.status', target: bikeId, details: { from: b.status, to: status, note } });
  });
  return { ok: true };
});

// ── Online sessions: the record of when riders were actually working ────────
exports.dashRiderOnlineLog = onDocumentUpdated('riders/{uid}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (!before.isOnline && after.isOnline) {
    await event.data.after.ref.update({ onlineSince: FieldValue.serverTimestamp() });
  } else if (before.isOnline && !after.isOnline) {
    const start = before.onlineSince || before.lastOnlineChange || null;
    await db().collection('rider_online_sessions').add({
      riderId: event.params.uid, start, end: FieldValue.serverTimestamp(),
    });
    await event.data.after.ref.update({ onlineSince: null });
  }
});

// ── Tell riders about new or changed shifts ──────────────────────────────────
const fmtShift = (s) => `${s.date} ${s.start}–${s.end}`;
exports.dashNotifyShiftChange = onDocumentWritten('rider_shifts/{id}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const s = after || before;
  if (!s) return;
  if (!before && after) {
    await pushTo('riders', after.riderId, '🗓️ New shift', `${fmtShift(after)}${after.isBackup ? ' (backup)' : ''}. Open VilleDash to confirm.`, { tag: 'vd-shift' });
  } else if (before && !after) {
    await pushTo('riders', before.riderId, 'Shift removed', `Your shift ${fmtShift(before)} was removed.`, { tag: 'vd-shift' });
  } else if (before.status !== 'cancelled' && after.status === 'cancelled') {
    await pushTo('riders', after.riderId, 'Shift cancelled', `Your shift ${fmtShift(after)} was cancelled.`, { tag: 'vd-shift' });
  } else if (before.date !== after.date || before.start !== after.start || before.end !== after.end) {
    await pushTo('riders', after.riderId, 'Shift changed', `Now ${fmtShift(after)}. Please confirm again.`, { tag: 'vd-shift' });
  }
});

exports.dashShiftJobs = onSchedule({ schedule: 'every 15 minutes', timeZone: 'America/Jamaica' }, async () => { await runShiftJobs(); });

// ── House-ad click counter (VILLE cross-site ads) ────────────────────────────
// Open to signed-out visitors; only bumps counters on an existing active ad.
exports.trackAdClick = onCall(async (req) => {
  const adId = L.cleanText(req.data && req.data.adId, 60);
  const site = ['cabs', 'dash', 'ville'].includes(req.data && req.data.site) ? req.data.site : 'other';
  if (!adId) return { ok: false };
  const ref = db().doc(`site_ads/${adId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('active') !== true) return { ok: false };
  await ref.update({ clicks: FieldValue.increment(1), [`clicksBySite.${site}`]: FieldValue.increment(1) });
  return { ok: true };
});
