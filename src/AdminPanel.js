import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, updateDoc, doc, orderBy, addDoc, deleteDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';

const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || '';
const MAP_LIBRARIES = ['places'];

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

const YELLOW = '#e8b400';
const DARK   = '#1a1a2e';
const GREEN  = '#1a9e5a';
const WHITE  = '#ffffff';
const RED    = '#e24b4a';

const s = {
  page:     { minHeight:'100vh', background:'#f5f6fa', color:'#1a1a2e', fontFamily:"'Segoe UI', sans-serif" },
  topbar:   { background:'#ffffff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:50, borderBottom:'1px solid #e5e7eb', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' },
  logo:     { display:'flex', alignItems:'center', gap:8, fontSize:15, fontWeight:700, color:'#6b21a8' },
  logobadge:{ background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:8, padding:'3px 9px', fontSize:11, color:'#6b21a8', fontWeight:700 },
  tabstrip: { display:'flex', gap:6, padding:'10px 14px', background:'#fff', borderBottom:'1px solid #e5e7eb', overflowX:'auto', scrollbarWidth:'none', position:'sticky', top:49, zIndex:40 },
  tab:      { flexShrink:0, padding:'7px 14px', borderRadius:20, border:'none', background:'#f3f4f6', color:'#555', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 },
  tabActive:{ flexShrink:0, padding:'7px 14px', borderRadius:20, border:'none', background:'#6b21a8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 },
  main:     { padding:'16px 14px 48px', maxWidth:1000, margin:'0 auto' },
  card:     { background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:14, padding:'16px 18px', marginBottom:14, boxShadow:'0 1px 6px rgba(0,0,0,0.05)' },
  statgrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 },
  stat:     { background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.05)' },
  badge:    { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600 },
  btnApprove:{ background:GREEN, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer', marginRight:8 },
  btnReject: { background:'#fff0f0', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' },
  btnSuspend:{ background:'#f3f4f6', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer' },
  inp:      { width:'100%', padding:'12px 14px', background:'#ffffff', border:'1px solid #d0d3e0', borderRadius:10, color:'#1a1a2e', fontSize:14, boxSizing:'border-box', outline:'none', marginBottom:12 },
  lbl:      { fontSize:11, color:'#8a83a0', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  errBox:   { background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' },
};

// ── ADMIN LOGIN ───────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [resetSent, setResetSent] = useState(false);

  const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || 'admin@villecabs.com';

  const handleLogin = async () => {
    setError('');
    if (!email || !password) { setError('Please enter email and password.'); return; }
    if (email !== ADMIN_EMAIL) { setError('Access denied. Admin accounts only.'); return; }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      onLogin(cred.user);
    } catch(err) { setError('Incorrect email or password.'); }
    setLoading(false);
  };

  // Send a Firebase password-reset link to the admin address.
  const handleReset = async () => {
    setError(''); setResetSent(false);
    if (email !== ADMIN_EMAIL) { setError('Password reset is only available for the admin account.'); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, ADMIN_EMAIL);
      setResetSent(true);
    } catch(err) {
      if (err?.code === 'auth/too-many-requests') setError('Too many attempts. Please wait a few minutes.');
      else setError('Could not send the reset link. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ width:380, background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:20, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🚕</div>
          <div style={{ fontSize:22, fontWeight:700, color:'#1a1a2e', letterSpacing:2 }}>VilleCabs</div>
          <div style={{ fontSize:13, color:'#9199ad', marginTop:4 }}>Admin Panel</div>
        </div>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        {resetSent && (
          <div style={{ background:'#f0fff4', border:'1px solid #86efac', color:'#166534', borderRadius:10, padding:'10px 12px', fontSize:12.5, marginBottom:12, lineHeight:1.6 }}>
            ✉️ Reset link sent to {ADMIN_EMAIL}. It expires in one hour — check spam if you don't see it.
          </div>
        )}
        <label style={{ fontSize:11, color:'#6b7280', marginBottom:4, display:'block' }}>Admin Email</label>
        <input style={s.inp} type="email" placeholder="admin@villecabs.com" value={email} onChange={e => setEmail(e.target.value)}/>
        <label style={{ fontSize:11, color:'#6b7280', marginBottom:4, display:'block' }}>Password</label>
        <input style={s.inp} type="password" placeholder="Admin password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key==='Enter' && handleLogin()}/>
        <button onClick={handleLogin} disabled={loading}
          style={{ width:'100%', padding:'14px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginTop:4, opacity:loading?0.7:1 }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        <div style={{ textAlign:'center', marginTop:14 }}>
          <span onClick={() => !loading && handleReset()}
            style={{ fontSize:12.5, color:'#6b21a8', fontWeight:600, cursor:loading?'default':'pointer' }}>
            Forgot password?
          </span>
        </div>
      </div>
    </div>
  );
}

// ── STAT CARD ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color = '#1a1a2e', sub }) {
  return (
    <div style={s.stat}>
      <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#9199ad', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ── DRIVERS TAB ───────────────────────────────────────────────────────────────
// ── Driver tiers ──────────────────────────────────────────────────────────────
// Recognition labels shown on the driver's card. Add to this list freely — the
// dropdown and badge both read from it.
const DRIVER_TIERS = [
  { id:'',           label:'— none —',        color:'#9199ad', bg:'#f3f4f6' },
  { id:'new',        label:'New Driver',      color:'#0369a1', bg:'#f0f9ff' },
  { id:'founding',   label:'Founding Driver', color:'#b45309', bg:'#fffbeb' },
  { id:'veteran',    label:'Veteran Driver',  color:'#6b21a8', bg:'#f5f0ff' },
  { id:'topRated',   label:'Top Rated',       color:'#166534', bg:'#f0fdf4' },
  { id:'elite',      label:'Elite',           color:'#be123c', bg:'#fff1f2' },
];
const tierMeta = (id) => DRIVER_TIERS.find(t => t.id === (id||'')) || DRIVER_TIERS[0];

// Per-driver earnings, grouped by day. Loads only when the row is expanded so we
// aren't querying every driver's ride history on page load.
function DriverEarnings({ driverId }) {
  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!driverId) return;
    const q = query(collection(db,'bookings'), where('driverId','==',driverId), where('status','==','completed'));
    const unsub = onSnapshot(q,
      snap => { setRides(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); },
      e => { console.error('Driver earnings load failed:', e); setLoading(false); });
    return () => unsub();
  }, [driverId]);

  if (loading) return <div style={{ fontSize:12, color:'#9199ad', padding:'10px 0' }}>Loading earnings…</div>;
  if (rides.length === 0) return <div style={{ fontSize:12, color:'#9199ad', padding:'10px 0' }}>No completed rides yet.</div>;

  // Group by calendar day (most recent first).
  const byDay = {};
  rides.forEach(r => {
    const secs = r.completedAt?.seconds || r.createdAt?.seconds;
    if (!secs) return;
    const d = new Date(secs*1000);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!byDay[key]) byDay[key] = { key, date:d, gross:0, count:0 };
    byDay[key].gross += (r.fare || 0);
    byDay[key].count += 1;
  });
  const days = Object.values(byDay).sort((a,b) => b.date - a.date);
  const grandGross = days.reduce((s,d)=>s+d.gross,0);
  // Platform takes 15%, so the driver keeps 85% — same split shown elsewhere.
  const net = n => Math.round(n * 0.85);
  const max = Math.max(...days.map(d=>d.gross), 1);

  // Today / this-month windows, for working out what to pay out.
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const todayRow  = byDay[todayKey];
  const todayGross = todayRow ? todayRow.gross : 0;
  const todayRides = todayRow ? todayRow.count : 0;
  const monthDays  = days.filter(d => d.date.getFullYear()===now.getFullYear() && d.date.getMonth()===now.getMonth());
  const monthGross = monthDays.reduce((s,d)=>s+d.gross,0);
  const monthRides = monthDays.reduce((s,d)=>s+d.count,0);

  const box = (label, gross, rides, accent) => (
    <div style={{ flex:1, minWidth:150, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 12px' }}>
      <div style={{ fontSize:10.5, color:'#8a83a0', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:800, color:accent, marginTop:3 }}>J${net(gross).toLocaleString()}</div>
      <div style={{ fontSize:10.5, color:'#9199ad', marginTop:2 }}>payout · gross J${gross.toLocaleString()} · {rides} ride{rides!==1?'s':''}</div>
    </div>
  );

  return (
    <div style={{ padding:'4px 0 2px' }}>
      {/* Payout summary — what this driver is owed */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
        {box('Today',      todayGross, todayRides, '#6b21a8')}
        {box('This month', monthGross, monthRides, GREEN)}
        {box('All time',   grandGross, rides.length, '#1a1a2e')}
      </div>
      <div style={{ fontSize:11, color:'#8a83a0', marginBottom:10 }}>
        Payout = 85% of gross fares (after the 15% platform fee).
      </div>

      <div style={{ fontSize:11, color:'#8a83a0', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:2 }}>Daily breakdown</div>
      <div style={{ maxHeight:260, overflowY:'auto' }}>
        {days.map(d => (
          <div key={d.key} style={{ padding:'7px 0', borderTop:'1px solid #f0f0f4' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, fontSize:12.5 }}>
              <span style={{ color:'#374151', minWidth:120 }}>{d.date.toLocaleDateString('en-JM',{ weekday:'short', day:'numeric', month:'short' })}</span>
              <span style={{ color:'#9199ad', fontSize:11.5 }}>{d.count} ride{d.count!==1?'s':''}</span>
              <span style={{ flex:1, height:6, background:'#f3f4f6', borderRadius:3, overflow:'hidden', minWidth:40 }}>
                <span style={{ display:'block', width:`${Math.round((d.gross/max)*100)}%`, height:'100%', background:'#6b21a8' }}/>
              </span>
              <span style={{ fontWeight:700, color:'#1a1a2e', minWidth:78, textAlign:'right' }}>J${d.gross.toLocaleString()}</span>
              <span style={{ color:GREEN, fontSize:11.5, minWidth:70, textAlign:'right' }}>J${net(d.gross).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:10.5, color:'#9199ad', marginTop:8 }}>Gross fare · driver's 85% share after the 15% platform fee.</div>
    </div>
  );
}

function DriversTab() {
  const [drivers, setDrivers]   = useState([]);
  const [filter,  setFilter]    = useState('pending');
  const [loading, setLoading]   = useState(true);
  const [confirm, setConfirm]   = useState(null);
  const [search,  setSearch]    = useState('');
  const [earnOpen, setEarnOpen] = useState(null);   // driver id whose earnings are expanded

  useEffect(() => {
    const q = (filter === 'all' || filter === 'reuploads')
      ? query(collection(db,'drivers'))
      : query(collection(db,'drivers'), where('status','==',filter));
    const unsub = onSnapshot(q, snap => {
      let list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      // "Re-uploads" = any driver with a document/photo currently pending review
      if (filter === 'reuploads') {
        list = list.filter(d => Object.values(d.documents || {}).some(x => x && x.status === 'pending'));
      }
      list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setDrivers(list);
      setLoading(false);
    });
    return () => unsub();
  }, [filter]);

  const approve = async (id) => {
    await updateDoc(doc(db,'drivers',id), { status:'approved', approvedAt:serverTimestamp() });
  };

  const reject = async (id, reason = '') => {
    await updateDoc(doc(db,'drivers',id), { status:'rejected', rejectionReason:reason, rejectedAt:serverTimestamp() });
    setConfirm(null);
  };

  const suspend = async (id) => {
    await updateDoc(doc(db,'drivers',id), { status:'suspended', suspendedAt:serverTimestamp() });
  };

  // Recognition tier (Founding Driver, New Driver, …). Purely a label for now.
  const setTier = async (id, tier) => {
    try { await updateDoc(doc(db,'drivers',id), { tier: tier || null, tierSetAt: serverTimestamp() }); }
    catch(e) { console.error('Could not set driver tier:', e); }
  };

  // Force a driver offline (they stop receiving ride requests immediately).
  // Also clears any stale currentRideId so they aren't stuck "busy".
  const forceOffline = async (id) => {
    try {
      await updateDoc(doc(db,'drivers',id), { isOnline:false, currentRideId:null, forcedOfflineAt:serverTimestamp() });
    } catch(e) { console.error('forceOffline failed:', e); }
  };

  // Review an individual re-uploaded document/photo (from the driver's documents screen)
  const reviewDoc = async (driverId, key, decision) => {
    try {
      await updateDoc(doc(db,'drivers',driverId), {
        ['documents.'+key+'.status']: decision, // 'approved' | 'rejected'
        ['documents.'+key+'.reviewedAt']: serverTimestamp(),
      });
    } catch(e) { console.error('Doc review failed:', e); }
  };

  const statusBadge = (status) => {
    const map = {
      pending:   { bg:'rgba(232,180,0,0.15)',  color:'#e8b400',  text:'Pending'   },
      approved:  { bg:'rgba(26,158,90,0.15)',  color:'#1a9e5a',  text:'Approved'  },
      rejected:  { bg:'rgba(226,75,74,0.15)', color:'#dc2626',  text:'Rejected'  },
      suspended: { bg:'#f3f4f6',color:'#6b7280', text:'Suspended' },
    };
    const m = map[status] || map.pending;
    return <span style={{ ...s.badge, background:m.bg, color:m.color }}>{m.text}</span>;
  };

  const filters = ['pending','reuploads','approved','rejected','all'];

  // Client-side search across the fields an admin would actually look up by.
  const q = search.trim().toLowerCase();
  const visibleDrivers = !q ? drivers : drivers.filter(d => {
    const hay = [
      d.name, d.email, d.phone, d.trn,
      d.licensePlate, d.vehicleMake, d.vehicleModel, d.vehicleColor,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  return (
    <div>
      {/* Confirm reject modal */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#ffffff', borderRadius:16, padding:24, width:360, border:'1px solid #e5e7eb' }}>
            <div style={{ fontSize:16, fontWeight:500, marginBottom:8 }}>Reject driver application?</div>
            <div style={{ fontSize:13, color:'#6b7280', marginBottom:16 }}>Optionally enter a reason — this will be stored on their profile.</div>
            <input style={s.inp} placeholder="Reason (optional)" id="reject-reason"/>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button onClick={() => reject(confirm, document.getElementById('reject-reason')?.value||'')}
                style={{ flex:1, background:RED, color:'#1a1a2e', border:'none', borderRadius:8, padding:10, cursor:'pointer', fontWeight:500 }}>Confirm Reject</button>
              <button onClick={() => setConfirm(null)}
                style={{ flex:1, background:'#f3f4f6', color:'#4b5563', border:'1px solid #e5e7eb', borderRadius:8, padding:10, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'1px solid #e5e7eb', background:filter===f?'#6b21a8':'#f3f4f6', color:filter===f?'#fff':'#555', cursor:'pointer', textTransform:'capitalize', fontWeight:filter===f?600:400 }}>
            {f === 'all' ? 'All drivers' : f === 'reuploads' ? '⏳ Re-uploads' : f}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:18 }}>
        <div style={{ position:'relative', flex:1 }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, opacity:0.5 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, TRN, plate or vehicle…"
            style={{ ...s.inp, paddingLeft:34, marginBottom:0 }}/>
        </div>
        {search && (
          <button onClick={() => setSearch('')}
            style={{ padding:'10px 14px', borderRadius:10, border:'1px solid #e5e7eb', background:'#f3f4f6', color:'#555', fontSize:13, cursor:'pointer' }}>
            Clear
          </button>
        )}
      </div>
      {search && (
        <div style={{ fontSize:12, color:'#9199ad', marginBottom:12 }}>
          {visibleDrivers.length} result{visibleDrivers.length!==1?'s':''} for “{search}”
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading drivers...</div>
      ) : visibleDrivers.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <div style={{ color:'#9199ad', fontSize:14 }}>
            {search ? `No drivers match “${search}”` : `No ${filter} applications`}
          </div>
        </div>
      ) : visibleDrivers.map(driver => (
        <div key={driver.id} style={s.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              {(() => {
                const pic = driver.profilePhotoUrl || driver.docs?.profilePhoto || driver.documents?.profilePhoto?.url;
                const has = pic && pic !== 'pending_upload';
                return (
                  <div onClick={() => has && window.open(pic, '_blank')}
                    style={{ width:44, height:44, borderRadius:'50%', background:'rgba(107,33,168,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, overflow:'hidden', cursor: has?'pointer':'default' }}>
                    {has ? <img src={pic} alt={driver.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : '👤'}
                  </div>
                );
              })()}
              <div>
                <div style={{ fontSize:15, fontWeight:500, color:'#1a1a2e' }}>{driver.name}</div>
                <div style={{ fontSize:12, color:'#6b7280' }}>{driver.email} · {driver.phone}</div>
              </div>
            </div>
            {statusBadge(driver.status)}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
            {[['TRN', driver.trn],['Date of Birth', driver.dob],['Vehicle', `${driver.vehicleMake||''} ${driver.vehicleModel||''}`],['Plate', driver.licensePlate],['Applied', driver.createdAt?.toDate?.()?.toLocaleDateString('en-JM')||'--'],['Rating', driver.rating ? `★ ${driver.rating}` : 'New']].map(([k,v]) => (
              <div key={k} style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#9199ad', marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:12, color:'#1a1a2e' }}>{v||'--'}</div>
              </div>
            ))}
          </div>

          {/* Pending re-uploaded documents/photos awaiting review */}
          {(() => {
            const labels = { licence:'Driver Licence', license:'Driver Licence', fitness:'Vehicle Fitness', registration:'Vehicle Registration', insurance:'Insurance', vehiclePhoto:'Vehicle Photo', profilePhoto:'Profile Photo' };
            const pendingDocs = Object.entries(driver.documents || {}).filter(([, d]) => d && d.status === 'pending');
            if (pendingDocs.length === 0) return null;
            return (
              <div style={{ marginBottom:12, background:'#fff7ed', border:'1px solid #fdba74', borderRadius:12, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:'#9a3412', marginBottom:10, textTransform:'uppercase', letterSpacing:0.5, fontWeight:700 }}>⏳ Awaiting Review ({pendingDocs.length})</div>
                {pendingDocs.map(([key, d]) => (
                  <div key={key} style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'8px 0', borderTop:'1px solid #fde3c4' }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'#1a1a2e', flex:1, minWidth:120 }}>{labels[key] || key}</span>
                    {d.url && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                        style={{ ...s.badge, background:'#eef2ff', color:'#4338ca', fontSize:11, textDecoration:'none', padding:'5px 10px' }}>🔍 View</a>
                    )}
                    <button onClick={() => reviewDoc(driver.id, key, 'approved')}
                      style={{ padding:'6px 12px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer' }}>✓ Approve</button>
                    <button onClick={() => reviewDoc(driver.id, key, 'rejected')}
                      style={{ padding:'6px 12px', background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer' }}>✗ Reject</button>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Profile & Vehicle photos */}
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#9199ad', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Photos</div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
              {[['Profile Photo', driver.profilePhotoUrl || driver.docs?.profilePhoto || driver.documents?.profilePhoto?.url],
                ['Vehicle Photo', driver.vehiclePhotoUrl || driver.docs?.vehiclePhoto || driver.documents?.vehiclePhoto?.url]].map(([label, url]) => {
                const has = url && url !== 'pending_upload';
                return (
                  <div key={label} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'#9199ad', marginBottom:5 }}>{label}</div>
                    {has ? (
                      <div onClick={() => window.open(url, '_blank')}
                        style={{ width:96, height:72, borderRadius:10, overflow:'hidden', border:'1px solid #ece3f5', cursor:'pointer', position:'relative' }}>
                        <img src={url} alt={label} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        <div style={{ position:'absolute', bottom:3, right:3, background:'rgba(0,0,0,0.6)', color:'#fff', fontSize:8, fontWeight:600, padding:'1px 5px', borderRadius:8 }}>🔍 View</div>
                      </div>
                    ) : (
                      <div style={{ width:96, height:72, borderRadius:10, border:'1px dashed #fca5a5', background:'#fff5f5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#dc2626', textAlign:'center', padding:4 }}>
                        Not uploaded
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#9199ad', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Documents</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[['license',"Driver's License"],['fitness','Fitness Certificate'],['registration','Registration']].map(([docType,docLabel]) => {
                const url = driver.docs?.[docType];
                const uploaded = url && url !== 'pending_upload';
                return (
                  <div key={docType}>
                    {uploaded ? (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        style={{ ...s.badge, background:'rgba(26,158,90,0.15)', color:'#9fe1cb', fontSize:11, textDecoration:'none', cursor:'pointer', padding:'5px 10px' }}>
                        📄 View {docLabel}
                      </a>
                    ) : (
                      <span style={{ ...s.badge, background:'rgba(226,75,74,0.12)', color:'#dc2626', fontSize:11, padding:'5px 10px' }}>
                        ⚠️ {docLabel} not uploaded
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {driver.status === 'pending' && (
              <>
                <button onClick={() => approve(driver.id)} style={s.btnApprove}>✓ Approve</button>
                <button onClick={() => setConfirm(driver.id)} style={s.btnReject}>✗ Reject</button>
              </>
            )}
            {driver.status === 'approved' && (
              <>
                <span style={{ ...s.badge,
                  background: driver.isOnline ? 'rgba(26,158,90,0.15)' : 'rgba(145,153,173,0.15)',
                  color: driver.isOnline ? GREEN : '#9199ad',
                  display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background: driver.isOnline ? GREEN : '#9199ad', display:'inline-block' }}/>
                  {driver.isOnline ? 'Online' : 'Offline'}
                </span>
                <button onClick={() => driver.isOnline && forceOffline(driver.id)}
                  disabled={!driver.isOnline}
                  style={{ ...s.btnSuspend,
                    background: driver.isOnline ? '#b45309' : '#e5e7eb',
                    color: driver.isOnline ? '#fff' : '#9199ad',
                    cursor: driver.isOnline ? 'pointer' : 'not-allowed' }}
                  title={driver.isOnline
                    ? 'Immediately stop this driver receiving ride requests'
                    : 'This driver is already offline'}>
                  ⏸ {driver.isOnline ? 'Put offline' : 'Already offline'}
                </button>
                <button onClick={() => suspend(driver.id)} style={s.btnSuspend}>Suspend driver</button>
              </>
            )}
            {(driver.status === 'rejected' || driver.status === 'suspended') && (
              <button onClick={() => approve(driver.id)} style={s.btnApprove}>Re-activate</button>
            )}
          </div>

          {/* Tier + earnings — only meaningful once a driver is on the road */}
          {driver.status === 'approved' && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #f0f0f4' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, color:'#8a83a0', fontWeight:700 }}>DRIVER STATUS</span>
                <select value={driver.tier || ''} onChange={e => setTier(driver.id, e.target.value)}
                  style={{ padding:'7px 10px', background:'#fff', border:'1px solid #d0d3e0', borderRadius:8, fontSize:12.5, color:'#1a1a2e', cursor:'pointer' }}>
                  {DRIVER_TIERS.map(t => <option key={t.id||'none'} value={t.id}>{t.label}</option>)}
                </select>
                {driver.tier && (
                  <span style={{ fontSize:11, fontWeight:700, color:tierMeta(driver.tier).color, background:tierMeta(driver.tier).bg, border:`1px solid ${tierMeta(driver.tier).color}33`, padding:'4px 11px', borderRadius:12 }}>
                    ★ {tierMeta(driver.tier).label}
                  </span>
                )}
                <button onClick={() => setEarnOpen(earnOpen === driver.id ? null : driver.id)}
                  style={{ marginLeft:'auto', padding:'7px 14px', background:'#f5f0ff', color:'#6b21a8', border:'1px solid #e9d5ff', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  💰 {earnOpen === driver.id ? 'Hide earnings' : 'Earnings by day'}
                </button>
              </div>
              {earnOpen === driver.id && (
                <div style={{ marginTop:10, background:'#fafafc', border:'1px solid #eee', borderRadius:10, padding:'10px 12px' }}>
                  <DriverEarnings driverId={driver.id}/>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── RIDES TAB ─────────────────────────────────────────────────────────────────
function RidesTab() {
  const [rides,   setRides]   = useState([]);
  const [filter,  setFilter]  = useState('all');
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  useEffect(() => {
    const q = filter === 'all'
      ? query(collection(db,'bookings'))
      : query(collection(db,'bookings'), where('status','==',filter));
    const unsub = onSnapshot(q, snap => {
      setRides(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [filter]);

  const statusBadge = (status) => {
    const map = {
      searching: { bg:'rgba(232,180,0,0.15)',  color:'#e8b400',  text:'Searching' },
      active:    { bg:'rgba(26,158,90,0.15)',  color:'#1a9e5a',  text:'Active'    },
      completed: { bg:'#f3f4f6',color:'#6b7280', text:'Completed' },
      cancelled: { bg:'rgba(226,75,74,0.12)', color:'#dc2626',  text:'Cancelled' },
      expired:   { bg:'rgba(180,83,9,0.14)',  color:'#b45309',  text:'No Driver' },
    };
    const m = map[status] || map.searching;
    return <span style={{ ...s.badge, background:m.bg, color:m.color }}>{m.text}</span>;
  };

  // ── Search + date-range filtering (client-side over the live list) ──
  const q = search.trim().toLowerCase();
  const fromTs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() / 1000 : null;
  const toTs   = dateTo   ? new Date(dateTo   + 'T23:59:59').getTime() / 1000 : null;

  const visible = rides.filter(r => {
    const ts = r.createdAt?.seconds;
    if (fromTs && (!ts || ts < fromTs)) return false;
    if (toTs   && (!ts || ts > toTs))   return false;
    if (!q) return true;
    const hay = [
      r.customerName, r.customerPhone, r.driverName, r.id,
      r.pickup?.address, r.dropoff?.address, r.promoCode, r.licensePlate,
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });

  // Quick date presets
  const iso = (d) => d.toISOString().slice(0,10);
  const setPreset = (days) => {
    const now = new Date();
    if (days === 0) { const t = iso(now); setDateFrom(t); setDateTo(t); return; }
    if (days === 'month') {
      setDateFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
      setDateTo(iso(now)); return;
    }
    const from = new Date(now); from.setDate(from.getDate() - (days - 1));
    setDateFrom(iso(from)); setDateTo(iso(now));
  };
  const clearDates = () => { setDateFrom(''); setDateTo(''); };
  const filtersActive = !!(search || dateFrom || dateTo);

  const total = visible.reduce((sum, r) => sum + (r.fare||0), 0);
  const filters = ['all','searching','active','completed','cancelled','expired'];

  const fmtDateTime = (ts) => {
    if (!ts?.seconds) return '--';
    const d = new Date(ts.seconds * 1000);
    return d.toLocaleDateString('en-JM', { day:'numeric', month:'short', year:'numeric' })
      + ' · ' + d.toLocaleTimeString('en-JM', { hour:'2-digit', minute:'2-digit' });
  };

  const changeStatus = async (id, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === 'completed') updates.completedAt = serverTimestamp();
    if (newStatus === 'cancelled') updates.cancelledAt = serverTimestamp();
    await updateDoc(doc(db,'bookings',id), updates);
  };

  const sorted = [...visible].sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="Total rides"   value={visible.length} sub={filtersActive ? 'matching filters' : 'in current filter'}/>
        <StatCard label="Total revenue" value={`J$${total.toLocaleString()}`} color="#b45309" sub={filtersActive ? 'matching filters' : 'all rides'}/>
        <StatCard label="Active now"    value={visible.filter(r=>r.status==='active').length} color={GREEN} sub="in progress"/>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'1px solid #e5e7eb', background:filter===f?'#6b21a8':'#f3f4f6', color:filter===f?'#fff':'#555', cursor:'pointer', textTransform:'capitalize', fontWeight:filter===f?600:400 }}>
            {f === 'all' ? 'All rides' : f === 'expired' ? '🚫 No Driver' : f}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position:'relative', marginBottom:12 }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:14, opacity:0.5 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer, driver, phone, address, promo code or ride ID…"
          style={{ ...s.inp, paddingLeft:34, marginBottom:0 }}/>
      </div>

      {/* Date range */}
      <div style={{ background:'#faf7fd', border:'1px solid #ece3f5', borderRadius:12, padding:'12px 14px', marginBottom:18 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10 }}>📅 Filter by date</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>From</label>
            <input type="date" value={dateFrom} max={dateTo || undefined}
              onChange={e => setDateFrom(e.target.value)}
              style={{ ...s.inp, marginBottom:0, width:160, cursor:'pointer' }}/>
          </div>
          <div>
            <label style={{ fontSize:11, color:'#6b7280', display:'block', marginBottom:4 }}>To</label>
            <input type="date" value={dateTo} min={dateFrom || undefined}
              onChange={e => setDateTo(e.target.value)}
              style={{ ...s.inp, marginBottom:0, width:160, cursor:'pointer' }}/>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[['Today',0],['7 days',7],['30 days',30],['This month','month']].map(([lbl,v]) => (
              <button key={lbl} onClick={() => setPreset(v)}
                style={{ padding:'8px 12px', borderRadius:8, fontSize:12, border:'1px solid #d8b4fe', background:'#fff', color:'#6b21a8', fontWeight:600, cursor:'pointer' }}>
                {lbl}
              </button>
            ))}
            {(dateFrom || dateTo) && (
              <button onClick={clearDates}
                style={{ padding:'8px 12px', borderRadius:8, fontSize:12, border:'1px solid #e5e7eb', background:'#f3f4f6', color:'#555', cursor:'pointer' }}>
                Clear dates
              </button>
            )}
          </div>
        </div>
      </div>

      {filtersActive && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <span style={{ fontSize:12, color:'#9199ad' }}>
            {visible.length} ride{visible.length!==1?'s':''} found
            {(dateFrom || dateTo) && ` · ${dateFrom||'start'} → ${dateTo||'today'}`}
          </span>
          <button onClick={() => { setSearch(''); clearDates(); }}
            style={{ padding:'6px 12px', borderRadius:8, fontSize:12, border:'1px solid #e5e7eb', background:'#fff', color:'#6b21a8', fontWeight:600, cursor:'pointer' }}>
            Reset all
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading rides...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🚕</div>
          <div style={{ color:'#9199ad', fontSize:14 }}>
            {filtersActive ? 'No rides match your search or date range' : filter === 'expired' ? 'No “no driver” rides yet' : `No ${filter} rides yet`}
          </div>
        </div>
      ) : sorted.map((r,i) => (
        <div key={r.id} style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 18px', marginBottom:12 }}>

          {/* Top row: customer + status + changer */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:500, color:'#1a1a2e' }}>{r.customerName||'--'}</div>
              <div style={{ fontSize:11, color:'#9199ad', marginTop:2 }}>#{r.id?.slice(-6).toUpperCase()}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {statusBadge(r.status)}
              <select value={r.status} onChange={e => changeStatus(r.id, e.target.value)}
                style={{ background:'#f3f4f6', border:'1px solid #d0d3e0', borderRadius:8, color:'#1a1a2e', fontSize:12, padding:'4px 8px', cursor:'pointer', outline:'none' }}>
                <option value="searching">Searching</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Date/time row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
            <div style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:2 }}>Booked</div>
              <div style={{ fontSize:11, color:'#1a1a2e' }}>{fmtDateTime(r.createdAt)}</div>
            </div>
            <div style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:2 }}>Accepted</div>
              <div style={{ fontSize:11, color:'#1a1a2e' }}>{fmtDateTime(r.acceptedAt)}</div>
            </div>
            <div style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:2 }}>Completed</div>
              <div style={{ fontSize:11, color:'#1a1a2e' }}>{fmtDateTime(r.completedAt)}</div>
            </div>
          </div>

          {/* Route + driver + fare */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:8, alignItems:'center' }}>
            <div>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:4 }}>Route</div>
              <div style={{ fontSize:12, color:'#6b7280' }}><span style={{ color:GREEN }}>●</span> {r.pickup?.address?.split(',')[0]||'--'}</div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}><span style={{ color:'#6b21a8' }}>●</span> {r.dropoff?.address?.split(',')[0]||'--'}</div>
            </div>
            <div>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:4 }}>Driver</div>
              <div style={{ fontSize:12, color:'#6b7280' }}>{r.driverName||'Unassigned'}</div>
              {r.licensePlate && <div style={{ fontSize:11, color:'#9199ad', marginTop:2 }}>{r.licensePlate}</div>}
            </div>
            <div>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:4 }}>Vehicle</div>
              <div style={{ fontSize:12, color:'#6b7280' }}>{r.vehicleType||'--'}</div>
              {r.distanceKm && <div style={{ fontSize:11, color:'#9199ad', marginTop:2 }}>{r.distanceKm} km</div>}
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'#9199ad', marginBottom:4 }}>Fare</div>
              <div style={{ fontSize:16, fontWeight:600, color:GREEN }}>J${r.fare?.toLocaleString()||'--'}</div>
              <div style={{ fontSize:10, color:'#9199ad', marginTop:2 }}>{r.paymentMethod||'cash'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ── PROMO CODES TAB ───────────────────────────────────────────────────────────
function PromoCodesTab() {
  const [promos,  setPromos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState({ code:'', discount:'', expiry:'', description:'' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  useEffect(() => {
    const unsub = onSnapshot(collection(db,'promo_codes'), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setPromos(list); setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleCreate = async () => {
    setError(''); setSuccess('');
    if (!form.code.trim()) { setError('Please enter a promo code.'); return; }
    if (!form.discount || isNaN(form.discount) || +form.discount <= 0 || +form.discount > 100) { setError('Discount must be between 1 and 100%.'); return; }
    if (!form.expiry) { setError('Please set an expiry date.'); return; }
    // Check duplicate
    if (promos.find(p => p.code.toUpperCase() === form.code.toUpperCase())) { setError('That code already exists.'); return; }
    setSaving(true);
    try {
      await addDoc(collection(db,'promo_codes'), {
        code:        form.code.toUpperCase().trim(),
        discount:    +form.discount,
        description: form.description.trim() || `${form.discount}% off`,
        expiry:      form.expiry,
        active:      true,
        usedBy:      [],
        usageCount:  0,
        createdAt:   serverTimestamp(),
      });
      setSuccess(`Promo code "${form.code.toUpperCase()}" created!`);
      setForm({ code:'', discount:'', expiry:'', description:'' });
    } catch(err) { setError(err.message); }
    setSaving(false);
  };

  const toggleActive = async (id, current) => {
    await updateDoc(doc(db,'promo_codes',id), { active: !current });
  };

  const handleDelete = async (id, code) => {
    if (!window.confirm(`Delete promo code "${code}"?`)) return;
    await deleteDoc(doc(db,'promo_codes',id));
  };

  const isExpired = (expiry) => expiry && new Date(expiry) < new Date();

  return (
    <div>
      {/* Create form */}
      <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:14, padding:20, marginBottom:24 }}>
        <div style={{ fontSize:15, fontWeight:500, color:'#1a1a2e', marginBottom:16 }}>➕ Create Promo Code</div>
        {error   && <div style={{ background:'rgba(226,75,74,0.15)', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' }}>⚠️ {error}</div>}
        {success && <div style={{ background:'rgba(26,158,90,0.15)', border:'0.5px solid rgba(26,158,90,0.4)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#9fe1cb' }}>✅ {success}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div>
            <label style={s.lbl}>Promo Code</label>
            <input style={s.inp} placeholder="e.g. VILLE20" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}/>
          </div>
          <div>
            <label style={s.lbl}>Discount (%)</label>
            <input style={s.inp} type="number" placeholder="e.g. 20" min="1" max="100" value={form.discount} onChange={e => set('discount', e.target.value)}/>
          </div>
          <div>
            <label style={s.lbl}>Expiry Date</label>
            <input style={{ ...s.inp, colorScheme:'dark' }} type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)}/>
          </div>
          <div>
            <label style={s.lbl}>Description (optional)</label>
            <input style={s.inp} placeholder="e.g. Launch promo" value={form.description} onChange={e => set('description', e.target.value)}/>
          </div>
        </div>
        <button onClick={handleCreate} disabled={saving}
          style={{ padding:'11px 24px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
          {saving ? 'Creating...' : 'Create Promo Code'}
        </button>
      </div>

      {/* Promo list */}
      <div style={{ fontSize:13, fontWeight:500, color:'#6b7280', marginBottom:12, textTransform:'uppercase', letterSpacing:0.5 }}>
        {promos.length} promo code{promos.length !== 1 ? 's' : ''}
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading...</div>
      ) : promos.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🎟️</div>
          <div style={{ color:'#9199ad' }}>No promo codes yet</div>
        </div>
      ) : promos.map(p => {
        const expired = isExpired(p.expiry);
        const status  = !p.active ? 'disabled' : expired ? 'expired' : 'active';
        const statusColor = status==='active' ? GREEN : status==='expired' ? '#dc2626' : '#9199ad';
        return (
          <div key={p.id} style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 18px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                  <span style={{ fontSize:18, fontWeight:700, color:'#6b21a8', letterSpacing:2 }}>{p.code}</span>
                  <span style={{ background:`${statusColor}22`, color:statusColor, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:500, textTransform:'uppercase' }}>{status}</span>
                </div>
                <div style={{ fontSize:13, color:'#6b7280' }}>{p.description}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:22, fontWeight:700, color:GREEN }}>{p.discount}% off</div>
                <div style={{ fontSize:11, color:'#9199ad', marginTop:2 }}>Used {p.usageCount||0} time{p.usageCount!==1?'s':''}</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #f0f0f0', paddingTop:10 }}>
              <div style={{ fontSize:12, color:'#9199ad' }}>
                Expires: <span style={{ color: expired ? '#dc2626' : '#4b5563' }}>{p.expiry || '--'}</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => toggleActive(p.id, p.active)}
                  style={{ padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer', border:'1px solid #e5e7eb', background:'#f3f4f6', color:'#1a1a2e' }}>
                  {p.active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => handleDelete(p.id, p.code)}
                  style={{ padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer', border:'0.5px solid rgba(226,75,74,0.3)', background:'rgba(226,75,74,0.1)', color:'#dc2626' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── ADMIN GLOBAL STYLES ───────────────────────────────────────────────────────
function AdminGlobalStyles() {
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      button:hover:not(:disabled) { filter:brightness(1.12); transform:translateY(-1px); transition:all 0.15s ease; }
      button:active:not(:disabled) { transform:translateY(0) scale(0.98); }
      button { transition:all 0.15s ease; }
      a:hover { opacity:0.8; transition:opacity 0.15s; }
      input:focus, textarea:focus, select:focus { border-color:#6b21a8!important; box-shadow:0 0 0 2px rgba(107,33,168,0.15); transition:all 0.2s; }
      ::-webkit-scrollbar { width:4px; height:4px; } ::-webkit-scrollbar-thumb { background:rgba(107,33,168,0.3); border-radius:4px; }
    `;
    document.head.appendChild(style);
    return () => { if (style.parentNode) style.parentNode.removeChild(style); };
  }, []);
  return null;
}

// ── CUSTOMERS TAB ─────────────────────────────────────────────────────────────
function CustomersTab() {
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'customers'), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setCustomers(list); setLoading(false);
    });
    return () => unsub();
  }, []);
  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );
  const suspendCustomer = async (id, current) => {
    await updateDoc(doc(db,'customers',id), { status: current==='suspended'?'active':'suspended' });
  };
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        <StatCard label="Total customers" value={customers.length} sub="registered"/>
        <StatCard label="Active" value={customers.filter(c=>c.status!=='suspended').length} color={GREEN} sub="accounts"/>
        <StatCard label="Suspended" value={customers.filter(c=>c.status==='suspended').length} color="#f09595" sub="accounts"/>
      </div>
      <input style={{ width:'100%', padding:'10px 14px', background:'#f3f4f6', border:'1px solid #e5e7eb', borderRadius:10, color:'#fff', fontSize:13, outline:'none', marginBottom:16, boxSizing:'border-box' }}
        placeholder="Search by name, email or phone..." value={search} onChange={e => setSearch(e.target.value)}/>
      {loading ? <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading...</div>
      : filtered.map(c => (
        <div key={c.id} style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:'14px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:42, height:42, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>👤</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#1a1a2e' }}>{c.name||'--'}</div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>{c.email}</div>
            <div style={{ fontSize:11, color:'#9199ad', marginTop:2 }}>{c.phone||'No phone'} · Ref: {c.referralCode||'--'}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:c.status==='suspended'?'#dc2626':GREEN, marginBottom:6, fontWeight:500 }}>
              {c.status==='suspended'?'⛔ Suspended':'✓ Active'}
            </div>
            <button onClick={() => suspendCustomer(c.id, c.status)}
              style={{ padding:'5px 12px', borderRadius:8, fontSize:11, cursor:'pointer', border:'1px solid #e5e7eb', background:'#f3f4f6', color:'#1a1a2e' }}>
              {c.status==='suspended'?'Unsuspend':'Suspend'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── CONTACT SUBMISSIONS TAB ───────────────────────────────────────────────────
function ContactsTab() {
  const [contacts, setContacts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState('new');   // new | solved
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'contact_submissions'), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setContacts(list); setLoading(false);
    });
    return () => unsub();
  }, []);
  const fmtDate = (ts) => ts?.seconds ? new Date(ts.seconds*1000).toLocaleDateString('en-JM',{day:'numeric',month:'short',year:'numeric'}) : '--';

  // Marking solved moves the message into the Solved tab so the inbox only shows
  // what still needs a reply.
  const markSolved = async (id, solved) => {
    try {
      await updateDoc(doc(db,'contact_submissions',id), {
        status: solved ? 'solved' : 'new',
        solvedAt: solved ? serverTimestamp() : null,
      });
    } catch(e) { console.error('Could not update message:', e); }
  };

  const isSolved = c => c.status === 'solved';
  const newMsgs  = contacts.filter(c => !isSolved(c));
  const solved   = contacts.filter(isSolved);
  const shown    = view === 'new' ? newMsgs : solved;

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:14 }}>
        <StatCard label="New messages" value={newMsgs.length} color={newMsgs.length?'#b45309':GREEN} sub="awaiting reply"/>
        <StatCard label="Solved" value={solved.length} color={GREEN} sub="closed out"/>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {[['new',`📬 New (${newMsgs.length})`],['solved',`✅ Solved (${solved.length})`]].map(([k,label]) => (
          <button key={k} onClick={()=>setView(k)}
            style={{ padding:'8px 16px', borderRadius:18, fontSize:12.5, fontWeight:700, cursor:'pointer',
              background: view===k ? '#6b21a8' : '#f5f0ff', color: view===k ? '#fff' : '#6b21a8', border:'1px solid #e9d5ff' }}>
            {label}
          </button>
        ))}
      </div>

      <div>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading...</div>
        : shown.length === 0 ? <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>
            {view==='new' ? '✅ No new messages — inbox clear.' : 'No solved messages yet.'}
          </div>
        : shown.map(c => (
          <div key={c.id} style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 18px', marginBottom:12, borderLeft:`3px solid ${isSolved(c)?GREEN:'#b45309'}`, opacity:isSolved(c)?0.85:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:'#1a1a2e' }}>{c.name}</div>
                <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>{c.email} · {c.role==='driver'?'Driver':'Customer'}</div>
              </div>
              <div style={{ fontSize:11, color:'#9199ad', textAlign:'right' }}>
                {fmtDate(c.createdAt)}
                {isSolved(c) && c.solvedAt?.seconds && <div style={{ color:GREEN }}>solved {fmtDate(c.solvedAt)}</div>}
              </div>
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'#6b21a8', marginBottom:6 }}>{c.subject}</div>
            <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6, background:'#f9fafb', borderRadius:8, padding:10 }}>{c.message}</div>
            <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <a href={`mailto:${c.email}?subject=Re: ${c.subject}`}
                style={{ display:'inline-block', padding:'6px 14px', background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:8, color:'#6b21a8', fontSize:12, textDecoration:'none' }}>
                📧 Reply via email
              </a>
              {!isSolved(c)
                ? <button onClick={()=>markSolved(c.id, true)} style={{ padding:'6px 14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, color:'#166534', fontSize:12, fontWeight:700, cursor:'pointer' }}>✅ Mark solved</button>
                : <button onClick={()=>markSolved(c.id, false)} style={{ padding:'6px 14px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, color:'#6b7280', fontSize:12, fontWeight:600, cursor:'pointer' }}>↩ Re-open</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── REVENUE TAB ───────────────────────────────────────────────────────────────
function RevenueTab() {
  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState('month');
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db,'bookings'), where('status','==','completed')), snap => {
      setRides(snap.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false);
    });
    return () => unsub();
  }, []);
  const now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const week=new Date(today); week.setDate(today.getDate()-7);
  const month=new Date(today); month.setDate(today.getDate()-30);
  const inRange=(r,from)=>r.completedAt?.seconds?new Date(r.completedAt.seconds*1000)>=from:false;
  const periodRides=rides.filter(r=>inRange(r,period==='today'?today:period==='week'?week:month));
  const totalRev=periodRides.reduce((s,r)=>s+(r.fare||0),0);
  const villeCut=Math.round(totalRev*0.15);
  const driverCut=Math.round(totalRev*0.85);
  const last7=Array.from({length:7},(_,i)=>{
    const d=new Date(today); d.setDate(today.getDate()-i);
    const dayRides=rides.filter(r=>{if(!r.completedAt?.seconds)return false;return new Date(r.completedAt.seconds*1000).toDateString()===d.toDateString();});
    return{label:d.toLocaleDateString('en-JM',{weekday:'short',day:'numeric'}),total:dayRides.reduce((s,r)=>s+(r.fare||0),0),count:dayRides.length};
  }).reverse();
  const maxVal=Math.max(...last7.map(d=>d.total),1);
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['today','Today'],['week','7 Days'],['month','30 Days']].map(([k,l])=>(
          <button key={k} onClick={()=>setPeriod(k)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'1px solid #e5e7eb', background:period===k?'#6b21a8':'#f3f4f6', color:period===k?'#fff':'#555', cursor:'pointer', fontWeight:period===k?600:400 }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        <StatCard label="Total revenue" value={`J$${totalRev.toLocaleString()}`} color="#b45309" sub={`${periodRides.length} rides`}/>
        <StatCard label="VilleCabs (15%)" value={`J$${villeCut.toLocaleString()}`} color={GREEN} sub="platform fee"/>
        <StatCard label="Driver payouts" value={`J$${driverCut.toLocaleString()}`} sub="85% to drivers"/>
      </div>
      <div style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:14, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#1a1a2e', marginBottom:16 }}>Last 7 Days Revenue</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:120 }}>
          {last7.map((d,i)=>(
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ fontSize:10, color:'#9199ad' }}>J${(d.total/1000).toFixed(0)}k</div>
              <div style={{ width:'100%', background:'#6b21a8', borderRadius:'4px 4px 0 0', height:`${Math.max((d.total/maxVal)*90,d.total>0?6:2)}px`, minHeight:2 }}/>
              <div style={{ fontSize:9, color:'#9199ad', textAlign:'center' }}>{d.label}</div>
              <div style={{ fontSize:9, color:'#9199ad' }}>{d.count}</div>
            </div>
          ))}
        </div>
      </div>
      <button onClick={()=>{
        const rows=[['Date','Customer','Driver','Vehicle','Distance','Fare','Promo','Payment']];
        rides.forEach(r=>{const date=r.completedAt?.seconds?new Date(r.completedAt.seconds*1000).toLocaleDateString():'--';rows.push([date,r.customerName||'--',r.driverName||'--',r.vehicleType||'--',r.distanceKm||'--',r.fare||0,r.promoCode||'',r.paymentMethod||'cash']);});
        const csv=rows.map(r=>r.join(',')).join('\n');
        const blob=new Blob([csv],{type:'text/csv'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download='villecabs_revenue.csv';a.click();
      }} style={{ padding:'11px 20px', background:'rgba(26,158,90,0.15)', border:'0.5px solid rgba(26,158,90,0.4)', borderRadius:10, color:GREEN, fontSize:13, cursor:'pointer', fontWeight:500 }}>
        📊 Export All Rides to CSV
      </button>
    </div>
  );
}

// ── OVERVIEW TAB ──────────────────────────────────────────────────────────────
// ── ANALYTICS TAB ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'bookings'), snap => {
      setRides(snap.docs.map(d => ({ id:d.id, ...d.data() }))); setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  if (loading) return <div style={{ color:'#8a83a0', fontSize:13 }}>Loading analytics…</div>;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ts = (r, f='createdAt') => r[f]?.seconds ? new Date(r[f].seconds*1000) : null;
  const areaOf = (addr) => (addr || '').split(',')[0].trim() || 'Unknown';

  // Busiest hour today (by ride creation)
  const todays = rides.filter(r => { const d = ts(r); return d && d >= todayStart; });
  const hourBuckets = {};
  todays.forEach(r => { const d = ts(r); if (d) { const h = d.getHours(); hourBuckets[h] = (hourBuckets[h]||0)+1; } });
  let busiestHour = null, busiestCount = 0;
  Object.entries(hourBuckets).forEach(([h,c]) => { if (c > busiestCount) { busiestCount = c; busiestHour = +h; } });
  const fmtHour = (h) => h==null ? '—' : `${((h+11)%12)+1}${h<12?'am':'pm'}`;

  // Most requested pickup / dropoff (all rides)
  const tally = (getter) => {
    const m = {};
    rides.forEach(r => { const k = getter(r); if (k && k!=='Unknown') m[k]=(m[k]||0)+1; });
    let best=null, n=0; Object.entries(m).forEach(([k,c])=>{ if(c>n){n=c;best=k;} });
    return { name:best||'—', count:n };
  };
  const topPickup  = tally(r => areaOf(r.pickup?.address));
  const topDropoff = tally(r => areaOf(r.dropoff?.address));

  // Highest revenue area (by pickup area, completed rides)
  const revByArea = {};
  rides.filter(r => r.status==='completed').forEach(r => {
    const a = areaOf(r.pickup?.address);
    if (a && a!=='Unknown') revByArea[a] = (revByArea[a]||0) + (r.fare||0);
  });
  let topRevArea=null, topRev=0; Object.entries(revByArea).forEach(([a,v])=>{ if(v>topRev){topRev=v;topRevArea=a;} });

  // Driver acceptance rate = accepted / (accepted + unfulfilled/expired)
  const accepted = rides.filter(r => r.driverId && ['active','completed','arrived','enroute'].includes(r.status)).length;
  const searched = rides.filter(r => r.status==='searching' || r.status==='cancelled' || r.status==='no_driver').length;
  const acceptDenom = accepted + searched;
  const acceptRate = acceptDenom > 0 ? Math.round((accepted/acceptDenom)*100) : null;

  // Average pickup time = acceptedAt → startedAt (minutes) across rides that have both
  const pickupTimes = rides.map(r => {
    const a = r.acceptedAt?.seconds, s = r.startedAt?.seconds || r.arrivedAt?.seconds;
    return (a && s && s>a) ? (s-a)/60 : null;
  }).filter(v => v!=null && v < 120);
  const avgPickup = pickupTimes.length ? Math.round(pickupTimes.reduce((x,y)=>x+y,0)/pickupTimes.length) : null;

  const cards = [
    { icon:'⏰', label:'Busiest hour today', value: busiestHour!=null ? fmtHour(busiestHour) : 'No rides yet', sub: busiestHour!=null ? `${busiestCount} ride${busiestCount!==1?'s':''} booked` : 'today', color:'#6b21a8' },
    { icon:'📍', label:'Most requested pickup', value: topPickup.name, sub: topPickup.count ? `${topPickup.count} rides` : '—', color:'#2a1a4a' },
    { icon:'🎯', label:'Most requested drop-off', value: topDropoff.name, sub: topDropoff.count ? `${topDropoff.count} rides` : '—', color:'#2a1a4a' },
    { icon:'💰', label:'Highest revenue area', value: topRevArea || '—', sub: topRev ? `J$${topRev.toLocaleString()}` : '—', color:'#b45309' },
    { icon:'✅', label:'Driver acceptance rate', value: acceptRate!=null ? `${acceptRate}%` : '—', sub: acceptDenom ? `${accepted} of ${acceptDenom} requests` : 'no data yet', color: acceptRate!=null && acceptRate>=70 ? GREEN : '#b45309' },
    { icon:'⚡', label:'Average pickup time', value: avgPickup!=null ? `${avgPickup} min` : '—', sub: pickupTimes.length ? `across ${pickupTimes.length} rides` : 'no data yet', color:'#6b21a8' },
  ];

  return (
    <div>
      <div style={{ fontSize:13, color:'#8a83a0', marginBottom:16 }}>Live operational insights across Mandeville & Manchester.</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:14 }}>
        {cards.map((c,i) => (
          <div key={i} style={s.card}>
            <div style={{ fontSize:26, marginBottom:8 }}>{c.icon}</div>
            <div style={{ fontSize:11, color:'#8a83a0', textTransform:'uppercase', letterSpacing:0.6, marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:c.color, lineHeight:1.2, marginBottom:3 }}>{c.value}</div>
            <div style={{ fontSize:12, color:'#9199ad' }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:16, fontSize:11, color:'#aaa', lineHeight:1.6 }}>
        Areas are grouped by the first part of each address. Acceptance rate and pickup time improve in accuracy as more rides are completed.
      </div>
    </div>
  );
}

// ── ANALYTICS: RIDE REQUEST TOGGLE (accepting vs paused) ──────────────────────
function ForceLogoutButton() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const run = async () => {
    if (!window.confirm('Log out EVERY driver and customer? They will each have to sign in again next time they open the app. Use this after suspending someone who still has an open session.')) return;
    setBusy(true);
    try {
      await setDoc(doc(db,'config','app'), { forceLogoutAfter: serverTimestamp() }, { merge:true });
      setDone(true);
    } catch(e) { console.error(e); window.alert('Could not trigger logout. Try again.'); }
    setBusy(false);
  };
  return (
    <div style={{ ...s.card, marginTop:14, borderLeft:'3px solid #dc2626' }}>
      <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginBottom:4 }}>🔒 Force logout everyone</div>
      <div style={{ fontSize:12.5, color:'#6b7280', lineHeight:1.5, marginBottom:12 }}>
        Signs out all drivers and customers on their next app open. Useful when a suspended account still has an open session. Active sessions end within a minute or on their next screen change.
      </div>
      <button onClick={run} disabled={busy}
        style={{ padding:'10px 18px', background: done ? '#166534' : '#dc2626', color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:700, cursor: busy?'default':'pointer' }}>
        {busy ? 'Working…' : done ? '✓ Logout triggered' : 'Log everyone out'}
      </button>
    </div>
  );
}

function RideRequestToggle() {
  const [accepting, setAccepting] = useState(true);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db,'settings','operations'), snap => {
      setAccepting(snap.exists() ? snap.data().acceptingRides !== false : true);
      setLoaded(true);
    }, () => setLoaded(true));
    return () => unsub();
  }, []);
  const toggle = async () => {
    const next = !accepting;
    setAccepting(next); // optimistic
    try { await setDoc(doc(db,'settings','operations'), { acceptingRides: next, updatedAt: serverTimestamp() }, { merge:true }); }
    catch(e) { setAccepting(!next); }
  };
  return (
    <div style={{ ...s.card, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:14, borderLeft:`4px solid ${accepting?GREEN:'#dc2626'}` }}>
      <div>
        <div style={{ fontSize:15, fontWeight:800, color:'#2a1a4a', marginBottom:3 }}>
          {accepting ? '🟢 Accepting Ride Requests' : '🔴 Ride Requests Paused'}
        </div>
        <div style={{ fontSize:12, color:'#8a83a0' }}>
          {accepting ? 'Customers can book rides normally.' : 'New bookings are paused platform-wide.'}
        </div>
      </div>
      <div onClick={loaded ? toggle : undefined}
        style={{ width:64, height:34, borderRadius:20, background:accepting?GREEN:'#dc2626', position:'relative', cursor:loaded?'pointer':'default', transition:'background 0.25s', flexShrink:0, opacity:loaded?1:0.5 }}>
        <div style={{ position:'absolute', top:4, left:accepting?34:4, width:26, height:26, borderRadius:'50%', background:'#fff', transition:'left 0.25s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}/>
      </div>
    </div>
  );
}

// ── LIVE ACTIVITY FEED (overview) ─────────────────────────────────────────────
function LiveActivityFeed() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    const items = [];
    const push = (list) => {
      const merged = [...items, ...list].sort((a,b)=>b.t-a.t).slice(0, 12);
      setEvents(merged);
    };
    const unsubRides = onSnapshot(collection(db,'bookings'), snap => {
      const evts = [];
      snap.docs.forEach(d => {
        const r = d.data();
        const who = r.customerName || 'A rider';
        if (r.completedAt?.seconds) evts.push({ t:r.completedAt.seconds, icon:'✅', text:`Ride completed for ${who}`, color:GREEN });
        else if (r.acceptedAt?.seconds) evts.push({ t:r.acceptedAt.seconds, icon:'🚗', text:`${r.driverName||'A driver'} accepted ${who}'s ride`, color:'#6b21a8' });
        else if (r.createdAt?.seconds) evts.push({ t:r.createdAt.seconds, icon:'🚕', text:`${who} booked a ride`, color:'#2a1a4a' });
      });
      items.length = 0; items.push(...evts); push([]);
    }, ()=>{});
    const unsubDrivers = onSnapshot(collection(db,'drivers'), snap => {
      const evts = [];
      snap.docs.forEach(d => {
        const dr = d.data();
        if (dr.createdAt?.seconds) evts.push({ t:dr.createdAt.seconds, icon:'🧑‍✈️', text:`New driver sign-up: ${dr.name||'Driver'}`, color:'#b45309', tag:'driver' });
      });
      // merge driver events with current ride events
      setEvents(prev => {
        const rideEvents = prev.filter(e => e.tag !== 'driver');
        return [...rideEvents, ...evts].sort((a,b)=>b.t-a.t).slice(0, 12);
      });
    }, ()=>{});
    return () => { unsubRides(); unsubDrivers(); };
  }, []);

  const ago = (t) => {
    const s = Math.max(0, Math.floor(Date.now()/1000 - t));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };

  return (
    <div style={{ ...s.card, marginTop:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <span style={{ width:8, height:8, borderRadius:'50%', background:GREEN, display:'inline-block', boxShadow:'0 0 0 3px rgba(26,158,90,0.2)' }}/>
        <span style={{ fontSize:14, fontWeight:700, color:'#2a1a4a' }}>Live Activity</span>
      </div>
      {events.length === 0 ? (
        <div style={{ fontSize:13, color:'#9199ad', textAlign:'center', padding:16 }}>Activity will appear here as rides and sign-ups happen.</div>
      ) : events.map((e,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'9px 0', borderBottom: i<events.length-1?'1px solid #f0f0f4':'none' }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:'#f6f2fb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{e.icon}</div>
          <div style={{ flex:1, fontSize:13, color:'#2a1a4a' }}>{e.text}</div>
          <div style={{ fontSize:11, color:'#9199ad', flexShrink:0 }}>{ago(e.t)}</div>
        </div>
      ))}
    </div>
  );
}

function OverviewTab({ setTab }) {
  const [stats, setStats] = useState({ pending:0, approved:0, total_rides:0, revenue:0, active_rides:0, customers:0 });

  useEffect(() => {
    const unsubDrivers = onSnapshot(collection(db,'drivers'), snap => {
      const pending  = snap.docs.filter(d => d.data().status==='pending').length;
      const approved = snap.docs.filter(d => d.data().status==='approved').length;
      setStats(p => ({ ...p, pending, approved }));
    });
    const unsubRides = onSnapshot(collection(db,'bookings'), snap => {
      const rides       = snap.docs.map(d => d.data());
      const total_rides = rides.length;
      const revenue     = rides.reduce((sum,r) => sum + (r.fare||0), 0);
      const active_rides= rides.filter(r => r.status==='active').length;
      setStats(p => ({ ...p, total_rides, revenue, active_rides }));
    });
    const unsubCustomers = onSnapshot(collection(db,'customers'), snap => {
      setStats(p => ({ ...p, customers:snap.size }));
    });
    return () => { unsubDrivers(); unsubRides(); unsubCustomers(); };
  }, []);

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:500, marginBottom:16 }}>Overview — Manchester, Jamaica</div>

      {/* Safety alerts first — never bury these */}
      <OverviewAlerts setTab={setTab}/>

      <div style={s.statgrid}>
        <StatCard label="Pending applications" value={stats.pending}    color="#b45309" sub="awaiting review"/>
        <StatCard label="Active drivers"        value={stats.approved}  color={GREEN}  sub="approved"/>
        <StatCard label="Total rides"           value={stats.total_rides}              sub="all time"/>
        <StatCard label="Total revenue"         value={`J$${stats.revenue.toLocaleString()}`} color="#b45309" sub="platform earnings × 15%"/>
      </div>
      <div style={s.statgrid}>
        <StatCard label="Active rides now" value={stats.active_rides} color={GREEN} sub="in progress"/>
        <StatCard label="Registered customers" value={stats.customers} sub="signed up"/>
        <StatCard label="Platform fee" value="15%" sub="per ride"/>
        <StatCard label="Service area" value="Manchester" sub="Jamaica"/>
      </div>

      <div style={{ ...s.card, marginTop:8 }}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:12 }}>Quick actions</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <div onClick={() => setTab('drivers')} style={{ background:'#fffbeb', border:'1px solid #fde047', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#b45309', cursor:'pointer' }}>
            👤 Review pending drivers ({stats.pending})
          </div>
          <div onClick={() => setTab('rides')} style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.25)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#1a9e5a', cursor:'pointer' }}>
            🚕 View active rides ({stats.active_rides})
          </div>
        </div>
      </div>

      {/* Global ride-request switch */}
      <div style={{ marginTop:14 }}>
        <RideRequestToggle/>
      </div>

      <ForceLogoutButton/>

      {/* Live activity feed */}
      <LiveActivityFeed/>
    </div>
  );
}

// ── MAIN ADMIN APP ────────────────────────────────────────────────────────────
// ── LIVE MAP TAB ──────────────────────────────────────────────────────────────
function LiveMapTab() {
  const [drivers, setDrivers] = useState([]);
  const [rides,   setRides]   = useState([]);
  const [selected, setSelected] = useState(null); // {type, data} for InfoWindow
  const mapRef = useRef(null);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: MAP_LIBRARIES,
    id: 'villecabs-admin-map',
  });
  useEffect(() => {
    const u1 = onSnapshot(collection(db,'drivers'), snap => setDrivers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(query(collection(db,'bookings'), where('status','in',['active','enroute','arrived'])), snap => setRides(snap.docs.map(d=>({id:d.id,...d.data()}))), () => {});
    return () => { u1(); u2(); };
  }, []);

  const nowMs = Date.now();
  const isFresh = (loc) => loc?.lat && (!loc.updatedAt?.seconds || (nowMs - loc.updatedAt.seconds*1000) < 5*60*1000);
  const onlineDrivers   = drivers.filter(d => d.isOnline);
  const locatedDrivers  = onlineDrivers.filter(d => isFresh(d.currentLocation));

  // Build clickable markers: available drivers (green) + active-ride drivers (purple).
  const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };
  const driverMarkers = locatedDrivers
    .filter(d => !rides.some(r => r.driverId === d.id))  // not already shown as an active ride
    .map(d => ({ type:'driver', id:d.id, pos:{ lat:d.currentLocation.lat, lng:d.currentLocation.lng }, data:d }));
  const rideMarkers = rides
    .filter(r => r.driverLocation?.lat)
    .map(r => ({ type:'ride', id:r.id, pos:{ lat:r.driverLocation.lat, lng:r.driverLocation.lng }, data:r }));
  const allMarkers = [...driverMarkers, ...rideMarkers];

  // Center on the average of all markers, else Mandeville.
  const center = allMarkers.length
    ? { lat: allMarkers.reduce((s,m)=>s+m.pos.lat,0)/allMarkers.length,
        lng: allMarkers.reduce((s,m)=>s+m.pos.lng,0)/allMarkers.length }
    : MANDEVILLE;

  const dotIcon = (color) => isLoaded && window.google ? {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3,
  } : undefined;

  return (
    <div>
      <div style={s.statgrid}>
        <StatCard label="Online drivers" value={onlineDrivers.length} color={GREEN} sub="signed in now"/>
        <StatCard label="Active rides"   value={rides.length} color="#6b21a8" sub="in progress"/>
        <StatCard label="Live locations" value={locatedDrivers.length + rides.filter(r=>r.driverLocation?.lat).length} sub="broadcasting GPS"/>
        <StatCard label="Idle online"    value={onlineDrivers.length - locatedDrivers.length} sub="no live GPS"/>
      </div>

      {/* Interactive live map */}
      <div style={s.card}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:12, color:'#1a1a2e', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <span>🗺️ Live Map</span>
          <span style={{ fontSize:11, color:GREEN, display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:9,height:9,borderRadius:'50%',background:GREEN,display:'inline-block',border:'2px solid #fff',boxShadow:'0 0 0 1px '+GREEN }}/> Available driver</span>
          <span style={{ fontSize:11, color:'#6b21a8', display:'inline-flex', alignItems:'center', gap:4 }}><span style={{ width:9,height:9,borderRadius:'50%',background:'#6b21a8',display:'inline-block',border:'2px solid #fff',boxShadow:'0 0 0 1px #6b21a8' }}/> On a ride</span>
        </div>
        {!GOOGLE_MAPS_KEY ? (
          <div style={{ padding:30, textAlign:'center', color:'#b45309', fontSize:13, background:'#fffbeb', borderRadius:10 }}>
            ⚠️ Google Maps key not configured (REACT_APP_GOOGLE_MAPS_KEY). The lists below still work.
          </div>
        ) : !isLoaded ? (
          <div style={{ padding:40, textAlign:'center', color:'#9199ad', fontSize:13 }}>Loading map…</div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width:'100%', height:420, borderRadius:12 }}
            center={center}
            zoom={allMarkers.length ? 13 : 12}
            onLoad={(m)=>{ mapRef.current = m; }}
            options={{ disableDefaultUI:false, zoomControl:true, streetViewControl:false, mapTypeControl:false, fullscreenControl:true }}
          >
            {allMarkers.map(m => (
              <Marker
                key={m.type+'-'+m.id}
                position={m.pos}
                icon={dotIcon(m.type==='ride' ? '#6b21a8' : GREEN)}
                onClick={() => setSelected(m)}
              />
            ))}
            {selected && (
              <InfoWindow position={selected.pos} onCloseClick={() => setSelected(null)}>
                <div style={{ fontSize:12, lineHeight:1.6, minWidth:150 }}>
                  {selected.type === 'driver' ? (
                    <>
                      <div style={{ fontWeight:700, color:'#1a1a2e' }}>{selected.data.name || 'Driver'}</div>
                      <div style={{ color:'#6b7280' }}>{selected.data.vehicleMake||''} {selected.data.vehicleModel||''}</div>
                      <div style={{ color:'#6b7280' }}>Plate: {selected.data.licensePlate||'—'}</div>
                      <div style={{ color:GREEN, fontWeight:600, marginTop:2 }}>🟢 Available</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight:700, color:'#1a1a2e' }}>{selected.data.driverName||'Driver'} → {selected.data.customerName||'Rider'}</div>
                      <div style={{ color:'#6b7280' }}>{(selected.data.pickup?.address||'—').split(',')[0]} → {(selected.data.dropoff?.address||'—').split(',')[0]}</div>
                      <div style={{ color:'#6b21a8', fontWeight:600, marginTop:2 }}>🚕 {selected.data.status} · J${(selected.data.fare||0).toLocaleString()}</div>
                    </>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
        {isLoaded && allMarkers.length === 0 && (
          <div style={{ marginTop:10, fontSize:12, color:'#9199ad', textAlign:'center' }}>
            No drivers are broadcasting live GPS right now. Markers appear when a driver is online with the app open.
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14, color:'#1a1a2e' }}>🚗 Active Rides</div>
        {rides.length === 0 && <div style={{ color:'#9199ad', fontSize:13 }}>No rides in progress right now.</div>}
        {rides.map(r => (
          <div key={r.id} style={{ padding:'12px 0', borderBottom:'1px solid #f0f0f0' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <span style={{ fontSize:14, fontWeight:500, color:'#1a1a2e' }}>{r.driverName||'Driver'} → {r.customerName||'Rider'}</span>
              <span style={{ ...s.badge, background:'rgba(26,158,90,0.15)', color:GREEN }}>{r.status}</span>
            </div>
            <div style={{ fontSize:12, color:'#6b7280' }}>{(r.pickup?.address||'—').split(',')[0]} → {(r.dropoff?.address||'—').split(',')[0]} · J${(r.fare||0).toLocaleString()}</div>
            <div style={{ fontSize:11, color:r.driverLocation?.lat?GREEN:'#9199ad', marginTop:3 }}>{r.driverLocation?.lat ? '📍 Live GPS active' : '⏳ Awaiting driver GPS'}</div>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14, color:'#1a1a2e' }}>🟢 Available Drivers (online)</div>
        {onlineDrivers.length === 0 && <div style={{ color:'#9199ad', fontSize:13 }}>No drivers online right now.</div>}
        {onlineDrivers.map(d => (
          <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f0f0f0' }}>
            <div>
              <div style={{ fontSize:14, color:'#1a1a2e' }}>{d.name||'Driver'}</div>
              <div style={{ fontSize:11, color:'#9199ad' }}>{d.vehicleMake||''} {d.vehicleModel||''} · {d.licensePlate||'—'}</div>
            </div>
            <span style={{ ...s.badge, background: isFresh(d.currentLocation)?'rgba(26,158,90,0.15)':'#fffbeb', color: isFresh(d.currentLocation)?GREEN:'#b45309' }}>
              {isFresh(d.currentLocation) ? '📍 Live GPS' : 'No GPS'}
            </span>
          </div>
        ))}
        {onlineDrivers.length > locatedDrivers.length && (
          <div style={{ marginTop:12, fontSize:11, color:'#9199ad', background:'rgba(232,180,0,0.06)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:8, padding:'8px 10px' }}>
            ℹ️ Drivers only broadcast GPS while the app is open. Idle drivers with the app closed won't show a live location.
          </div>
        )}
      </div>
    </div>
  );
}

// ── SCHEDULED RIDES TAB ───────────────────────────────────────────────────────
function ScheduledTab() {
  const [rides,   setRides]   = useState([]);
  const [drivers, setDrivers] = useState([]);
  useEffect(() => {
    const u1 = onSnapshot(query(collection(db,'bookings'), where('status','==','scheduled')), snap => setRides(snap.docs.map(d=>({id:d.id,...d.data()}))), () => {});
    const u2 = onSnapshot(collection(db,'drivers'), snap => setDrivers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1(); u2(); };
  }, []);

  const now = Date.now();
  const scheduled  = [...rides].sort((a,b)=>(a.scheduledFor?.seconds||0)-(b.scheduledFor?.seconds||0));
  const unassigned = scheduled.filter(r=>!r.driverId);
  const assigned   = scheduled.filter(r=>r.driverId);
  const approved   = drivers.filter(d=>d.status==='approved');

  const fmt = (v) => { const sec=v?.seconds; if(!sec) return '—'; return new Date(sec*1000).toLocaleString('en-JM',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}); };
  const isSoon = (v) => v?.seconds && (v.seconds*1000-now)<2*3600*1000 && (v.seconds*1000-now)>0;
  const isPast = (v) => v?.seconds && (v.seconds*1000<now);

  const reassign = async (id, driverId) => {
    if (!driverId) { await updateDoc(doc(db,'bookings',id), { driverId:null, driverName:null }); return; }
    const drv = drivers.find(d=>d.id===driverId);
    await updateDoc(doc(db,'bookings',id), { driverId, driverName: drv?.name||'Driver' });
  };
  const cancelRide = async (id) => {
    if (window.confirm('Cancel this scheduled ride? The customer will see it as cancelled.'))
      await updateDoc(doc(db,'bookings',id), { status:'cancelled', cancelledBy:'admin', cancelledAt:serverTimestamp() });
  };

  const Card = ({ r }) => (
    <div style={{ ...s.card, borderLeft:`3px solid ${isPast(r.scheduledFor)?RED:isSoon(r.scheduledFor)?'#f59e0b':'#4c8bf5'}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:14, fontWeight:500, color:'#1a1a2e' }}>🗓️ {fmt(r.scheduledFor)}</span>
        <span style={{ fontSize:15, fontWeight:600, color:GREEN }}>J${(r.fare||0).toLocaleString()}</span>
      </div>
      {isPast(r.scheduledFor) && <div style={{ fontSize:11, color:'#dc2626', marginBottom:4 }}>⚠️ Pickup time has passed</div>}
      {isSoon(r.scheduledFor) && <div style={{ fontSize:11, color:'#b45309', marginBottom:4 }}>⏰ Within 2 hours</div>}
      <div style={{ fontSize:12, color:'#4b5563', marginBottom:3 }}>👤 {r.customerName||'Customer'} · {r.vehicleType||'VilleRide'}</div>
      <div style={{ fontSize:12, color:'#4b5563', marginBottom:10 }}>{(r.pickup?.address||'—').split(',')[0]} → {(r.dropoff?.address||'—').split(',')[0]}</div>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <select value={r.driverId||''} onChange={e=>reassign(r.id, e.target.value)}
          style={{ flex:1, minWidth:150, padding:'8px 10px', borderRadius:8, border:'1px solid #d0d3e0', background:'#ffffff', color:'#1a1a2e', fontSize:12 }}>
          <option value="">— Unassigned (any driver can claim) —</option>
          {approved.map(d => <option key={d.id} value={d.id}>{d.name||'Driver'}{d.isOnline?' 🟢':''}</option>)}
        </select>
        <button onClick={()=>cancelRide(r.id)} style={{ ...s.btnReject, marginRight:0 }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="Needs a driver" value={unassigned.length} color="#b45309" sub="unassigned"/>
        <StatCard label="Assigned"       value={assigned.length}   color={GREEN}  sub="driver claimed"/>
      </div>
      {scheduled.length === 0 && (
        <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>🗓️ No scheduled rides. Future bookings customers schedule will appear here.</div></div>
      )}
      {unassigned.length > 0 && <div style={{ fontSize:13, fontWeight:600, color:'#b45309', marginBottom:10 }}>⚠️ Needs a Driver ({unassigned.length})</div>}
      {unassigned.map(r => <Card key={r.id} r={r}/>)}
      {assigned.length > 0 && <div style={{ fontSize:13, fontWeight:500, color:'#4c8bf5', margin:'16px 0 10px' }}>✅ Assigned ({assigned.length})</div>}
      {assigned.map(r => <Card key={r.id} r={r}/>)}
    </div>
  );
}

// ── PARTNERS TAB ──────────────────────────────────────────────────────────────
// ── ADMIN ADDRESS AUTOCOMPLETE ────────────────────────────────────────────────
// Same Google Places search the rider's pickup box uses, so the address an admin
// picks carries real lat/lng. Those coords are what let "Book a Ride Here" on the
// Featured page drop the rider straight at the partner's door.
function AdminAddressInput({ value, onChange, onPlaceSelect, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [preds, setPreds] = useState([]);
  const [open,  setOpen]  = useState(false);
  const debRef   = useRef(null);
  const tokenRef = useRef(null);
  useEffect(() => { setQuery(value || ''); }, [value]);

  const search = async (text) => {
    if (!text || text.length < 2) { setPreds([]); setOpen(false); return; }
    if (!window.google?.maps?.importLibrary) return;
    try {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = await window.google.maps.importLibrary('places');
      if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
      const req = {
        input: text,
        includedRegionCodes: ['jm'],
        locationBias: { center:{ lat:18.0417, lng:-77.5071 }, radius:30000 },
        language: 'en',
        sessionToken: tokenRef.current,
      };
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
      setPreds(suggestions || []);
      setOpen((suggestions || []).length > 0);
    } catch(e) { setPreds([]); setOpen(false); }
  };

  const handleSelect = async (sg) => {
    const pred = sg.placePrediction;
    const main = pred.mainText?.text || pred.text?.text || '';
    setOpen(false); setPreds([]);
    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields:['displayName','formattedAddress','location'] });
      const addr = place.formattedAddress || place.displayName || main;
      setQuery(addr);
      onChange && onChange(addr);
      onPlaceSelect && onPlaceSelect({ address: addr, lat: place.location.lat(), lng: place.location.lng() });
      tokenRef.current = null; // session ends on selection
    } catch(e) {
      setQuery(main); onChange && onChange(main);
    }
  };

  return (
    <div style={{ position:'relative' }}>
      <input value={query} placeholder={placeholder || 'Search address…'}
        onChange={e => {
          const v = e.target.value; setQuery(v); onChange && onChange(v);
          clearTimeout(debRef.current);
          if (!v) { setPreds([]); setOpen(false); return; }
          debRef.current = setTimeout(() => search(v), 350);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{ ...s.inp, marginBottom:0 }}/>
      {open && preds.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e9d5ff', borderRadius:10, boxShadow:'0 8px 24px rgba(107,33,168,0.15)', zIndex:50, maxHeight:220, overflowY:'auto' }}>
          {preds.map((sg, i) => {
            const main = sg.placePrediction?.mainText?.text || sg.placePrediction?.text?.text || '';
            const sub  = sg.placePrediction?.secondaryText?.text || '';
            return (
              <div key={i} onMouseDown={e => { e.preventDefault(); handleSelect(sg); }}
                style={{ padding:'10px 12px', cursor:'pointer', borderBottom: i<preds.length-1?'1px solid #f5f0ff':'none' }}>
                <div style={{ fontSize:13, color:'#1a1a2e', fontWeight:600 }}>{main}</div>
                {sub && <div style={{ fontSize:11, color:'#9199ad' }}>{sub}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── CHARTER BOOKINGS (admin) ──────────────────────────────────────────────────
const CHARTER_STATUSES = ['pending','underReview','confirmed','driverAssigned','inProgress','completed','cancelled','rejected'];
const CHARTER_STATUS_META = {
  pending:       { label:'Pending',        color:'#b45309', bg:'#fffbeb' },
  underReview:   { label:'Under Review',   color:'#6b21a8', bg:'#f5f0ff' },
  confirmed:     { label:'Confirmed',      color:'#1a9e5a', bg:'#f0fdf4' },
  driverAssigned:{ label:'Driver Assigned',color:'#0369a1', bg:'#f0f9ff' },
  inProgress:    { label:'In Progress',    color:'#0369a1', bg:'#eff6ff' },
  completed:     { label:'Completed',      color:'#166534', bg:'#f0fdf4' },
  cancelled:     { label:'Cancelled',      color:'#6b7280', bg:'#f3f4f6' },
  rejected:      { label:'Rejected',       color:'#dc2626', bg:'#fff0f0' },
};

function CharterTab() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState([]);
  const [openId, setOpenId]   = useState(null);
  const [filter, setFilter]   = useState('all');
  const [adjust, setAdjust]   = useState({}); // { [id]: { amount, reason } }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db,'charterRequests'), orderBy('createdAt','desc')),
      snap => { setRows(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); },
      () => setLoading(false));
    const u2 = onSnapshot(query(collection(db,'drivers'), where('status','==','approved')),
      snap => setDrivers(snap.docs.map(d=>({id:d.id,...d.data()}))), ()=>{});
    return () => { u1(); u2(); };
  }, []);

  const setStatus = async (id, status) => {
    try { await updateDoc(doc(db,'charterRequests',id), { status, updatedAt:serverTimestamp() }); } catch(e){ console.error(e); }
  };
  const assignDriver = async (id, driverId) => {
    const drv = drivers.find(d=>d.id===driverId);
    try {
      await updateDoc(doc(db,'charterRequests',id), {
        assignedDriverId: driverId || null,
        assignedDriverName: drv?.name || null,
        status: driverId ? 'driverAssigned' : 'confirmed',
        updatedAt: serverTimestamp(),
      });
    } catch(e){ console.error(e); }
  };
  const saveAdjustment = async (id) => {
    const a = adjust[id] || {};
    const amount = Number(a.amount);
    if (!amount || amount <= 0) { window.alert('Enter a valid adjusted amount.'); return; }
    if (!a.reason || !a.reason.trim()) { window.alert('Please record a reason for the price adjustment.'); return; }
    try {
      await updateDoc(doc(db,'charterRequests',id), {
        adjustedTotal: amount, adjustmentReason: a.reason.trim(),
        quotedTotal: amount, updatedAt: serverTimestamp(),
      });
      setAdjust(prev => ({ ...prev, [id]: { amount:'', reason:'' } }));
    } catch(e){ console.error(e); window.alert('Could not save adjustment.'); }
  };

  const shown = filter==='all' ? rows : rows.filter(r => (r.status||'pending')===filter);
  const money = n => 'J$' + (n||0).toLocaleString();
  const fmtDate = ts => ts?.seconds ? new Date(ts.seconds*1000).toLocaleString('en-JM',{ dateStyle:'medium', timeStyle:'short' }) : '—';

  if (loading) return <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>Loading charter bookings…</div></div>;

  return (
    <div>
      <div style={s.statgrid}>
        <StatCard label="Total" value={rows.length}/>
        <StatCard label="Pending" value={rows.filter(r=>(r.status||'pending')==='pending').length} color="#b45309"/>
        <StatCard label="Confirmed" value={rows.filter(r=>['confirmed','driverAssigned','inProgress'].includes(r.status)).length} color={GREEN}/>
        <StatCard label="Completed" value={rows.filter(r=>r.status==='completed').length} color="#166534"/>
      </div>

      {/* status filter */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
        {['all',...CHARTER_STATUSES].map(f => (
          <button key={f} onClick={()=>setFilter(f)}
            style={{ padding:'6px 12px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer',
              background: filter===f ? '#6b21a8' : '#f5f0ff', color: filter===f ? '#fff' : '#6b21a8',
              border:'1px solid #e9d5ff' }}>
            {f==='all' ? 'All' : (CHARTER_STATUS_META[f]?.label||f)}
          </button>
        ))}
      </div>

      {shown.length===0 && <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>No charter bookings{filter!=='all'?' in this status':''} yet.</div></div>}

      {shown.map(r => {
        const meta = CHARTER_STATUS_META[r.status||'pending'] || CHARTER_STATUS_META.pending;
        const open = openId === r.id;
        const finalAmount = r.adjustedTotal || r.total;
        return (
          <div key={r.id} style={{ ...s.card, marginBottom:12 }}>
            {/* header row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, cursor:'pointer' }} onClick={()=>setOpenId(open?null:r.id)}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#1a1a2e' }}>{r.name || 'Charter'} · {r.dayCount||r.days?.length||0} day{(r.dayCount||1)!==1?'s':''}</div>
                <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>☎ {r.phone||'—'}{r.email?` · ${r.email}`:''} · {Math.round(r.totalKm||0)} km</div>
                <div style={{ fontSize:11, color:'#9199ad', marginTop:2 }}>Requested {fmtDate(r.createdAt)} · pricing {r.pricingVersion||'—'}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <span style={{ display:'inline-block', fontSize:11, fontWeight:700, color:meta.color, background:meta.bg, border:`1px solid ${meta.color}33`, padding:'3px 10px', borderRadius:12 }}>{meta.label}</span>
                <div style={{ fontSize:17, fontWeight:800, color:'#6b21a8', marginTop:6 }}>{money(finalAmount)}</div>
                {r.adjustedTotal && <div style={{ fontSize:10.5, color:'#9199ad', textDecoration:'line-through' }}>{money(r.total)}</div>}
              </div>
            </div>

            {open && (
              <div style={{ marginTop:14, borderTop:'1px solid #f0f0f4', paddingTop:14 }}>
                {/* itinerary per day */}
                {(r.days||[]).map((d, di) => (
                  <div key={di} style={{ background:'#faf7fd', border:'1px solid #ece3f5', borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
                    <div style={{ fontSize:12.5, fontWeight:800, color:'#6b21a8', marginBottom:6 }}>Day {di+1} · {d.date}{d.startTime?` · ${d.startTime}`:''} · {d.hours}h · {d.purpose||'—'}</div>
                    <div style={{ fontSize:12.5, color:'#374151', lineHeight:1.7 }}>
                      <div>🟢 <strong>Start:</strong> {d.start||'—'}</div>
                      {(d.stops||[]).map((sp,x)=><div key={x}>📍 <strong>Stop {x+1}:</strong> {sp}</div>)}
                      <div>🏁 <strong>End:</strong> {d.destination||'—'}</div>
                      {d.returnTo && <div>↩️ <strong>Return:</strong> {d.returnTo}</div>}
                      {d.airport && <div style={{ color:'#b45309' }}>✈️ Airport: {d.airport}</div>}
                      {d.driverNotes && <div style={{ color:'#6b7280', fontStyle:'italic', marginTop:4 }}>📝 {d.driverNotes}</div>}
                    </div>
                    <div style={{ fontSize:11.5, color:'#6b7280', marginTop:8, display:'flex', gap:14, flexWrap:'wrap', borderTop:'1px dashed #e9d5ff', paddingTop:8 }}>
                      <span>{Math.round(d.km||0)} km · {d.mins||0} min</span>
                      <span>Time {money(d.timeCharge)}</span>
                      {d.distanceCharge>0 && <span>Distance {money(d.distanceCharge)}</span>}
                      {d.airportFee>0 && <span>Airport {money(d.airportFee)}</span>}
                      {d.surcharge>0 && <span>+10% {money(d.surcharge)}</span>}
                      <span style={{ fontWeight:700, color:'#6b21a8' }}>Day {money(d.dayTotal)}</span>
                    </div>
                  </div>
                ))}

                {/* price breakdown */}
                <div style={{ background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:10, padding:'12px 14px', marginBottom:12, fontSize:12.5, color:'#374151' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}><span>Time charge</span><span>{money(r.timeCharge)}</span></div>
                  <div style={{ display:'flex', justifyContent:'space-between' }}><span>Distance charge</span><span>{money(r.distanceCharge)}</span></div>
                  {r.airportFee>0 && <div style={{ display:'flex', justifyContent:'space-between' }}><span>Airport fee</span><span>{money(r.airportFee)}</span></div>}
                  {r.surcharge>0 && <div style={{ display:'flex', justifyContent:'space-between', color:'#b45309' }}><span>Long-distance surcharge</span><span>{money(r.surcharge)}</span></div>}
                  {r.discount>0 && <div style={{ display:'flex', justifyContent:'space-between', color:'#1a9e5a' }}><span>Multi-day discount</span><span>−{money(r.discount)}</span></div>}
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:800, color:'#2a1a4a', borderTop:'1px solid #e9d5ff', marginTop:6, paddingTop:6 }}><span>System estimate</span><span>{money(r.total)}</span></div>
                  {r.adjustedTotal && <div style={{ display:'flex', justifyContent:'space-between', fontWeight:800, color:'#6b21a8', marginTop:4 }}><span>Adjusted price</span><span>{money(r.adjustedTotal)}</span></div>}
                  {r.adjustmentReason && <div style={{ fontSize:11, color:'#9199ad', marginTop:4, fontStyle:'italic' }}>Reason: {r.adjustmentReason}</div>}
                </div>

                {/* admin controls */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <div>
                    <div style={s.lbl}>Status</div>
                    <select value={r.status||'pending'} onChange={e=>setStatus(r.id, e.target.value)} style={{ ...s.inp, marginBottom:0 }}>
                      {CHARTER_STATUSES.map(st=><option key={st} value={st}>{CHARTER_STATUS_META[st]?.label||st}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={s.lbl}>Assign driver</div>
                    <select value={r.assignedDriverId||''} onChange={e=>assignDriver(r.id, e.target.value)} style={{ ...s.inp, marginBottom:0 }}>
                      <option value="">— none —</option>
                      {drivers.map(dr=><option key={dr.id} value={dr.id}>{dr.name||dr.email}</option>)}
                    </select>
                  </div>
                </div>

                {/* price adjustment */}
                <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
                  <div style={{ fontSize:11.5, fontWeight:700, color:'#6b21a8', marginBottom:8 }}>Adjust quoted price</div>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <input type="number" placeholder="New amount (J$)" value={(adjust[r.id]?.amount)||''}
                      onChange={e=>setAdjust(p=>({ ...p, [r.id]:{ ...(p[r.id]||{}), amount:e.target.value } }))}
                      style={{ ...s.inp, marginBottom:0, flex:1 }}/>
                    <button onClick={()=>saveAdjustment(r.id)} style={{ padding:'0 16px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>Save</button>
                  </div>
                  <input placeholder="Reason for adjustment (recorded)" value={(adjust[r.id]?.reason)||''}
                    onChange={e=>setAdjust(p=>({ ...p, [r.id]:{ ...(p[r.id]||{}), reason:e.target.value } }))}
                    style={{ ...s.inp, marginBottom:0 }}/>
                </div>

                {/* actions */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <a href={`tel:${r.phone}`} style={{ textDecoration:'none', padding:'9px 16px', background:GREEN, color:'#fff', borderRadius:8, fontSize:12.5, fontWeight:700 }}>📞 Call</a>
                  <a href={`https://wa.me/${(r.phone||'').replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none', padding:'9px 16px', background:'#25D366', color:'#fff', borderRadius:8, fontSize:12.5, fontWeight:700 }}>💬 WhatsApp</a>
                  {r.status!=='confirmed' && <button onClick={()=>setStatus(r.id,'confirmed')} style={{ padding:'9px 16px', background:'#f0fdf4', color:'#166534', border:'1px solid #86efac', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>✓ Confirm</button>}
                  {r.status!=='rejected' && <button onClick={()=>setStatus(r.id,'rejected')} style={{ padding:'9px 16px', background:'#fff0f0', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>✕ Reject</button>}
                </div>
                <div style={{ fontSize:10.5, color:'#9199ad', marginTop:10 }}>Updated {fmtDate(r.updatedAt)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PartnersTab() {
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [busyImg,  setBusyImg]  = useState('');   // partner id currently uploading
  const [imgErr,   setImgErr]   = useState('');
  const [editing,  setEditing]  = useState(null); // partner id being edited
  const [form,     setForm]     = useState({});   // working copy of that partner
  const [savedMsg, setSavedMsg] = useState('');
  const [pFilter,  setPFilter]  = useState('pending');  // pending | approved | all
  const TOTAL_SLOTS = 10; // secret internal slot names (admin-only)
  // Load Google Places so the address box can capture real coordinates.
  useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_KEY, libraries: MAP_LIBRARIES, id: 'villecabs-admin-map' });
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'partnerRequests'), snap => { setPartners(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }, ()=>setLoading(false));
    return () => unsub();
  }, []);

  // ── Edit the public-facing details shown on the Featured page ────────────
  const startEdit = (p) => {
    setEditing(p.id);
    setForm({
      bizName:     p.bizName || p.businessName || p.name || '',
      bizType:     p.bizType || p.businessType || '',
      address:     p.address || '',
      lat:         p.lat ?? null,
      lng:         p.lng ?? null,
      hours:       p.hours || '',
      website:     p.website || '',
      phone:       p.phone || '',
      email:       p.email || '',
      description: p.description || p.message || '',
      eventDate:   p.eventDate || '',
      eventTime:   p.eventTime || '',
    });
  };
  const cancelEdit = () => { setEditing(null); setForm({}); };
  const saveEdit = async (id) => {
    try {
      await updateDoc(doc(db,'partnerRequests',id), {
        bizName:     form.bizName || '',
        bizType:     form.bizType || '',
        address:     form.address || '',
        lat:         form.lat ?? null,
        lng:         form.lng ?? null,
        hours:       form.hours || '',
        website:     form.website || '',
        phone:       form.phone || '',
        email:       form.email || '',
        description: form.description || '',
        eventDate:   form.eventDate || '',
        eventTime:   form.eventTime || '',
        editedAt:    serverTimestamp(),
      });
      setSavedMsg(id);
      setTimeout(() => setSavedMsg(''), 2500);
      setEditing(null); setForm({});
    } catch (e) {
      console.error('Save partner failed:', e);
      window.alert('Could not save. Please try again.');
    }
  };

  // ── Slideshow image management (admin) ──────────────────────────────────
  // Uploads land in partnerUploads/ (same bucket the public form uses) and the
  // URL is appended to the partner's `uploads` array, which drives the
  // customer-facing slideshow.
  const addImages = async (partnerId, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setImgErr(''); setBusyImg(partnerId);
    try {
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024) { setImgErr(`"${file.name}" is over 8MB — skipped.`); continue; }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `partnerUploads/${partnerId}_${Date.now()}_${safe}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        await updateDoc(doc(db,'partnerRequests',partnerId), { uploads: arrayUnion(url) });
      }
    } catch (e) {
      console.error('Partner image upload failed:', e);
      setImgErr('Upload failed. Please try again.');
    }
    setBusyImg('');
  };

  // Removes the image from the partner's slideshow. NOTE: the file itself stays
  // in Storage (client deletes are blocked by the storage rules) — this only
  // detaches it from the partner, which is what the slideshow reads.
  const removeImage = async (partnerId, url) => {
    if (!window.confirm('Remove this image from the partner\'s slideshow?')) return;
    try {
      await updateDoc(doc(db,'partnerRequests',partnerId), { uploads: arrayRemove(url) });
    } catch (e) {
      console.error('Remove image failed:', e);
      setImgErr('Could not remove that image.');
    }
  };

  const setStatus = async (id, status) => { await updateDoc(doc(db,'partnerRequests',id), { status }); };
  // Approve a partner INTO a specific slot (slot names are internal/admin-only)
  const approveToSlot = async (id, slot) => {
    await updateDoc(doc(db,'partnerRequests',id), { status:'approved', slot, approvedAt: serverTimestamp() });
  };
  const clearSlot = async (id) => {
    await updateDoc(doc(db,'partnerRequests',id), { slot: null });
  };
  const requestChanges = async (id) => {
    const note = window.prompt('What changes should the advertiser make? (this is saved on the request)');
    if (note === null) return;
    await updateDoc(doc(db,'partnerRequests',id), { status:'changes_requested', changesNote: note || '', slot: null });
  };
  // Which slots are already taken (by another approved partner)
  const takenSlots = {};
  partners.forEach(p => { if (p.slot && ['approved','featured'].includes((p.status||'').toLowerCase())) takenSlots[p.slot] = p.id; });

  // Anything approved/featured has been actioned; everything else still needs a
  // decision (new, pending, rejected all sit in the queue).
  const isApproved = p => ['approved','featured'].includes((p.status||'').toLowerCase());
  const approvedPartners = partners.filter(isApproved);
  const pendingPartners  = partners.filter(p => !isApproved(p));
  const shownPartners = pFilter==='approved' ? approvedPartners
                      : pFilter==='pending'  ? pendingPartners
                      : partners;

  const badge = (st) => {
    const map = { new:{bg:'#fffbeb',color:'#b45309'}, approved:{bg:'rgba(26,158,90,0.15)',color:GREEN}, featured:{bg:'rgba(107,33,168,0.2)',color:'#c9a3f5'}, changes_requested:{bg:'#eff6ff',color:'#2563eb'}, rejected:{bg:'rgba(226,75,74,0.12)',color:'#dc2626'} };
    const label = { changes_requested:'changes requested' };
    const key = (st||'new').toLowerCase();
    const m = map[key] || map.new;
    return <span style={{ ...s.badge, background:m.bg, color:m.color }}>{label[key] || st || 'new'}</span>;
  };
  if (loading) return <div style={{ color:'#9199ad', fontSize:13 }}>Loading...</div>;
  return (
    <div>
      <div style={s.statgrid}>
        <StatCard label="Total" value={partners.length}/>
        <StatCard label="New requests" value={partners.filter(p=>(p.status||'new')==='new').length} color="#b45309"/>
        <StatCard label="Approved" value={partners.filter(p=>['approved','featured'].includes((p.status||'').toLowerCase())).length} color={GREEN}/>
        <StatCard label="Slots filled" value={`${Object.keys(takenSlots).length}/${TOTAL_SLOTS}`} color="#c9a3f5"/>
      </div>

      {/* Pending / Approved split — approving a partner moves them out of Pending
          so the queue only shows what still needs a decision. */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        {[['pending',`⏳ Pending (${pendingPartners.length})`],
          ['approved',`✅ Approved (${approvedPartners.length})`],
          ['all',`All (${partners.length})`]].map(([k,label]) => (
          <button key={k} onClick={()=>setPFilter(k)}
            style={{ padding:'8px 16px', borderRadius:18, fontSize:12.5, fontWeight:700, cursor:'pointer',
              background: pFilter===k ? '#6b21a8' : '#f5f0ff', color: pFilter===k ? '#fff' : '#6b21a8', border:'1px solid #e9d5ff' }}>
            {label}
          </button>
        ))}
      </div>

      {shownPartners.length===0 && <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>
        {pFilter==='pending' ? '✅ No partner requests waiting for review.' : pFilter==='approved' ? 'No approved partners yet.' : 'No partner requests yet.'}
      </div></div>}
      {shownPartners.map(p => (
        <div key={p.id} style={s.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:15, fontWeight:500, color:'#1a1a2e' }}>{p.bizName||p.businessName||p.name||'Business'}</span>
            {badge(p.status)}
          </div>
          {editing === p.id ? (
            /* ── EDIT MODE — these fields are what riders see on the Featured page ── */
            <div style={{ background:'#faf7fd', border:'1px solid #e9d5ff', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#6b21a8', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:10 }}>
                ✏️ Editing public details
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <div style={s.lbl}>Business name</div>
                  <input value={form.bizName} onChange={e=>setForm({...form, bizName:e.target.value})}
                    placeholder="e.g. Vibes Vault" style={{ ...s.inp, marginBottom:0 }}/>
                </div>
                <div>
                  <div style={s.lbl}>Type / category</div>
                  <input value={form.bizType} onChange={e=>setForm({...form, bizType:e.target.value})}
                    placeholder="e.g. Events, Restaurant" style={{ ...s.inp, marginBottom:0 }}/>
                </div>
              </div>

              {/* Address with the same Places search the rider's pickup box uses,
                  so we capture real coordinates for "Book a Ride Here". */}
              <div style={{ marginBottom:8 }}>
                <div style={s.lbl}>Address (search to set the map pin)</div>
                <AdminAddressInput
                  value={form.address}
                  placeholder="Search the business address…"
                  onChange={v => setForm(f => ({ ...f, address:v }))}
                  onPlaceSelect={pl => setForm(f => ({ ...f, address:pl.address, lat:pl.lat, lng:pl.lng }))}
                />
                <div style={{ fontSize:10.5, marginTop:5, color: (form.lat && form.lng) ? GREEN : '#b45309' }}>
                  {(form.lat && form.lng)
                    ? `📍 Coordinates set (${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}) — "Book a Ride Here" will drop riders at this exact spot.`
                    : '⚠️ No coordinates yet. Pick an address from the dropdown so riders can book straight here.'}
                </div>
              </div>

              {/* Event date — drives which month section the flyer appears under
                  on the VilleEvents page, and when it drops off. */}
              {form.bizType === 'Events' && (
                <div style={{ background:'#fff', border:'1.5px solid #e9d5ff', borderRadius:8, padding:'10px 12px', marginBottom:8 }}>
                  <div style={{ fontSize:11, color:'#6b21a8', fontWeight:700, marginBottom:8 }}>🗓️ EVENT SCHEDULING</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div>
                      <div style={s.lbl}>Event date</div>
                      <input type="date" value={form.eventDate} onChange={e=>setForm({...form, eventDate:e.target.value})}
                        style={{ ...s.inp, marginBottom:0 }}/>
                    </div>
                    <div>
                      <div style={s.lbl}>Start time</div>
                      <input type="time" value={form.eventTime} onChange={e=>setForm({...form, eventTime:e.target.value})}
                        style={{ ...s.inp, marginBottom:0 }}/>
                    </div>
                  </div>
                  <div style={{ fontSize:10.5, marginTop:6, color: form.eventDate ? GREEN : '#b45309' }}>
                    {form.eventDate
                      ? '📅 Will show under this month on VilleEvents, then drop off after the date passes.'
                      : '⚠️ No date — this event lands in "More Events" instead of a month section.'}
                  </div>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <div style={s.lbl}>Opening hours</div>
                  <input value={form.hours} onChange={e=>setForm({...form, hours:e.target.value})}
                    placeholder="e.g. Mon–Sat 9am–9pm" style={{ ...s.inp, marginBottom:0 }}/>
                </div>
                <div>
                  <div style={s.lbl}>Website</div>
                  <input value={form.website} onChange={e=>setForm({...form, website:e.target.value})}
                    placeholder="e.g. vibesvault.com" style={{ ...s.inp, marginBottom:0 }}/>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <div>
                  <div style={s.lbl}>Phone</div>
                  <input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}
                    placeholder="876-000-0000" style={{ ...s.inp, marginBottom:0 }}/>
                </div>
                <div>
                  <div style={s.lbl}>Email</div>
                  <input value={form.email} onChange={e=>setForm({...form, email:e.target.value})}
                    placeholder="business@email.com" style={{ ...s.inp, marginBottom:0 }}/>
                </div>
              </div>

              <div style={{ marginBottom:10 }}>
                <div style={s.lbl}>Description (shown on the Featured page)</div>
                <textarea value={form.description} onChange={e=>setForm({...form, description:e.target.value})}
                  rows={3} placeholder="Short blurb riders will read…"
                  style={{ ...s.inp, marginBottom:0, resize:'vertical', fontFamily:'inherit' }}/>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => saveEdit(p.id)}
                  style={{ padding:'9px 18px', background:GREEN, color:'#fff', border:'none', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
                  ✓ Save details
                </button>
                <button onClick={cancelEdit}
                  style={{ padding:'9px 18px', background:'#fff', color:'#6b7280', border:'1px solid #e5e7eb', borderRadius:8, fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── READ-ONLY VIEW ── */
            <>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>{p.bizType||p.businessType||'Business'}{(p.address)?` · ${p.address}`:''}</div>
              {(p.contact) && <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>👤 {p.contact}</div>}
              {p.email && <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>📧 {p.email}{p.phone?` · ☎ ${p.phone}`:''}</div>}
              {(p.website) && <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>🔗 {p.website}</div>}
              {(p.hours) && <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>🕒 {p.hours}</div>}
              {p.packageLabel && (
                <div style={{ display:'inline-block', fontSize:12, background:'#f5f0ff', color:'#6b21a8', border:'1px solid #e9d5ff', padding:'3px 10px', borderRadius:8, fontWeight:700, margin:'4px 0 6px' }}>
                  📦 {p.packageLabel}
                </div>
              )}
              {(p.description||p.message) && <div style={{ fontSize:12, color:'#4b5563', margin:'6px 0 10px', lineHeight:1.5 }}>{p.description||p.message}</div>}
              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'0 0 10px' }}>
                <button onClick={() => startEdit(p)}
                  style={{ padding:'7px 14px', background:'#f5f0ff', color:'#6b21a8', border:'1px solid #e9d5ff', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  ✏️ Edit details
                </button>
                {savedMsg === p.id && <span style={{ fontSize:11.5, color:GREEN, fontWeight:700 }}>✓ Saved</span>}
                {!(p.lat && p.lng) && (
                  <span style={{ fontSize:11, color:'#b45309' }}>⚠️ No map pin — riders can't book straight here</span>
                )}
              </div>
            </>
          )}
          {/* Slideshow images — admin can add and remove */}
          <div style={{ background:'#faf7fd', border:'1px solid #ece3f5', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
            <div style={{ fontSize:11, color:'#8a83a0', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 }}>
              Slideshow Images {Array.isArray(p.uploads) && p.uploads.length>0 ? `(${p.uploads.length})` : '— none yet'}
            </div>
            {Array.isArray(p.uploads) && p.uploads.length>0 && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                {p.uploads.map((url,i) => (
                  <div key={i} style={{ position:'relative', width:74, height:74 }}>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      style={{ width:74, height:74, borderRadius:8, overflow:'hidden', border:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'center', background:'#f9fafb', textDecoration:'none' }}>
                      {url.match(/\.pdf($|\?)/i)
                        ? <span style={{ fontSize:24 }}>📄</span>
                        : <img src={url} alt="promo" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
                    </a>
                    <button onClick={() => removeImage(p.id, url)} title="Remove from slideshow"
                      style={{ position:'absolute', top:-7, right:-7, width:22, height:22, borderRadius:'50%', background:'#dc2626', color:'#fff', border:'2px solid #fff', fontSize:12, fontWeight:700, cursor:'pointer', lineHeight:1, padding:0, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px', background: busyImg===p.id ? '#e5e7eb' : '#6b21a8', color: busyImg===p.id ? '#9199ad' : '#fff', borderRadius:8, fontSize:12, fontWeight:700, cursor: busyImg===p.id ? 'default' : 'pointer' }}>
              {busyImg===p.id ? 'Uploading…' : '＋ Add images'}
              <input type="file" accept="image/*" multiple style={{ display:'none' }}
                disabled={busyImg===p.id}
                onChange={e => { addImages(p.id, e.target.files); e.target.value=''; }}/>
            </label>
            <div style={{ fontSize:10.5, color:'#9199ad', marginTop:6 }}>
              Images appear in the customer slideshow in the order added. Max 8MB each.
            </div>
            {imgErr && busyImg==='' && <div style={{ fontSize:11, color:'#dc2626', marginTop:6 }}>⚠️ {imgErr}</div>}
          </div>
          {p.changesNote && (p.status==='changes_requested') && (
            <div style={{ fontSize:11.5, color:'#2563eb', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'6px 10px', marginBottom:10 }}>
              ✏️ Changes requested: {p.changesNote}
            </div>
          )}

          {/* Slot assignment (internal names — only admins see these) */}
          <div style={{ background:'#faf7fd', border:'1px solid #ece3f5', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
            <div style={{ fontSize:11, color:'#8a83a0', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 }}>
              Featured Slot {p.slot ? `— currently in Slot ${p.slot}` : '(not placed)'}
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {Array.from({length:TOTAL_SLOTS},(_, n) => n+1).map(slotNum => {
                const takenByOther = takenSlots[slotNum] && takenSlots[slotNum] !== p.id;
                const mine = p.slot === slotNum;
                return (
                  <button key={slotNum} disabled={takenByOther}
                    onClick={() => approveToSlot(p.id, slotNum)}
                    title={takenByOther ? 'Taken by another partner' : `Place in Slot ${slotNum}`}
                    style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:700, cursor:takenByOther?'not-allowed':'pointer',
                      border:`1px solid ${mine?'#6b21a8':takenByOther?'#e5e7eb':'#d8b4fe'}`,
                      background: mine?'#6b21a8':takenByOther?'#f3f4f6':'#fff',
                      color: mine?'#fff':takenByOther?'#c9c2d8':'#6b21a8', opacity:takenByOther?0.6:1 }}>
                    Slot {slotNum}{mine?' ✓':''}
                  </button>
                );
              })}
            </div>
            {p.slot && (
              <button onClick={() => clearSlot(p.id)} style={{ marginTop:8, padding:'5px 10px', background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, fontSize:11, color:'#6b7280', cursor:'pointer' }}>Remove from slot</button>
            )}
          </div>

          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
            <button onClick={()=>setStatus(p.id,'approved')} style={s.btnApprove}>✓ Approve</button>
            <button onClick={()=>requestChanges(p.id)} style={{ ...s.btnApprove, background:'#2563eb' }}>✏️ Request Changes</button>
            <button onClick={()=>setStatus(p.id,'rejected')} style={s.btnReject}>✗ Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SAFETY ALERTS TAB ─────────────────────────────────────────────────────────
// ── Active SOS alerts banner for the Overview tab ─────────────────────────────
// Safety alerts are the one thing the admin must never miss, so they surface at
// the very top of Overview rather than only inside the Alerts tab.
function OverviewAlerts({ setTab }) {
  const [active, setActive] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'sos_alerts'), snap => {
      setActive(snap.docs.map(d=>({id:d.id,...d.data()})).filter(a => a.status !== 'resolved'));
    }, ()=>{});
    return () => unsub();
  }, []);

  if (active.length === 0) {
    return (
      <div style={{ ...s.card, marginBottom:14, borderLeft:`3px solid ${GREEN}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:13.5, color:'#4b5563' }}>✅ No active safety alerts</div>
        <button onClick={()=>setTab('alerts')} style={{ background:'none', border:'none', color:'#6b21a8', fontSize:12.5, fontWeight:700, cursor:'pointer' }}>View alert history →</button>
      </div>
    );
  }

  const recent = [...active].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,3);
  return (
    <div style={{ ...s.card, marginBottom:14, borderLeft:`3px solid ${RED}`, background:'#fff5f5' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#dc2626' }}>
          🆘 {active.length} active safety alert{active.length!==1?'s':''}
        </div>
        <button onClick={()=>setTab('alerts')}
          style={{ padding:'8px 16px', background:RED, color:'#fff', border:'none', borderRadius:18, fontSize:12.5, fontWeight:700, cursor:'pointer' }}>
          Respond now →
        </button>
      </div>
      {recent.map(a => (
        <div key={a.id} onClick={()=>setTab('alerts')}
          style={{ fontSize:12.5, color:'#4b5563', padding:'7px 0', borderTop:'1px solid #fee2e2', cursor:'pointer' }}>
          👤 {a.customerName||'—'} · 🚗 {a.driverName||'—'}
          {a.location ? ` · 📍 ${a.location}` : ''}
          <span style={{ color:'#9199ad' }}> · {a.createdAt?.seconds ? new Date(a.createdAt.seconds*1000).toLocaleTimeString() : '—'}</span>
          {a.status==='responding' && <span style={{ color:'#b45309', fontWeight:700 }}> · responding</span>}
        </div>
      ))}
      {active.length > recent.length && (
        <div style={{ fontSize:11.5, color:'#9199ad', marginTop:8 }}>+{active.length - recent.length} more in the Alerts tab</div>
      )}
    </div>
  );
}

function AlertsTab() {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState('active');   // active | history
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'sos_alerts'), snap => { setAlerts(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }, ()=>setLoading(false));
    return () => unsub();
  }, []);
  // Resolving stamps the time so History can show when it was closed out.
  const setStatus = async (id, status) => {
    const patch = { status };
    if (status === 'resolved') patch.resolvedAt = serverTimestamp();
    await updateDoc(doc(db,'sos_alerts',id), patch);
  };
  const reopen = async (id) => { await updateDoc(doc(db,'sos_alerts',id), { status:'new', resolvedAt:null }); };

  const isResolved = a => a.status === 'resolved';
  const active  = alerts.filter(a => !isResolved(a));
  const history = alerts.filter(isResolved);
  const list = (view === 'active' ? active : history)
    .sort((a,b) => ((view==='active' ? b.createdAt?.seconds : b.resolvedAt?.seconds||b.createdAt?.seconds)||0)
                 - ((view==='active' ? a.createdAt?.seconds : a.resolvedAt?.seconds||a.createdAt?.seconds)||0));

  if (loading) return <div style={{ color:'#9199ad', fontSize:13 }}>Loading...</div>;
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
        <StatCard label="Active alerts" value={active.length} color={active.length?RED:GREEN}/>
        <StatCard label="Responding" value={alerts.filter(a=>a.status==='responding').length} color="#b45309"/>
        <StatCard label="Resolved" value={history.length} color={GREEN}/>
      </div>

      {/* Active / History switch */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        {[['active',`🆘 Active (${active.length})`],['history',`🗂 Alert History (${history.length})`]].map(([k,label]) => (
          <button key={k} onClick={()=>setView(k)}
            style={{ padding:'8px 16px', borderRadius:18, fontSize:12.5, fontWeight:700, cursor:'pointer',
              background: view===k ? '#6b21a8' : '#f5f0ff', color: view===k ? '#fff' : '#6b21a8', border:'1px solid #e9d5ff' }}>
            {label}
          </button>
        ))}
      </div>

      {list.length===0 && (
        <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>
          {view==='active' ? '✅ No active safety alerts.' : 'No resolved alerts yet.'}
        </div></div>
      )}

      {list.map(a => (
        <div key={a.id} style={{ ...s.card, borderLeft:`3px solid ${isResolved(a)?GREEN:RED}`, opacity: isResolved(a)?0.85:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:14, fontWeight:600, color: isResolved(a)?'#4b5563':RED }}>🆘 SOS Alert</span>
            <span style={{ ...s.badge, background: isResolved(a)?'rgba(26,158,90,0.15)':'rgba(226,75,74,0.15)', color: isResolved(a)?GREEN:'#dc2626' }}>{a.status||'new'}</span>
          </div>
          <div style={{ fontSize:12, color:'#4b5563', marginBottom:3 }}>👤 {a.customerName||'—'} · 🚗 {a.driverName||'—'}</div>
          {a.location && <div style={{ fontSize:12, color:'#4b5563', marginBottom:3 }}>📍 {a.location}</div>}
          <div style={{ fontSize:11, color:'#9199ad', marginBottom:10 }}>
            Raised {a.createdAt?.seconds ? new Date(a.createdAt.seconds*1000).toLocaleString() : '—'}
            {isResolved(a) && a.resolvedAt?.seconds ? ` · Resolved ${new Date(a.resolvedAt.seconds*1000).toLocaleString()}` : ''}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {!isResolved(a) && a.status!=='responding' && <button onClick={()=>setStatus(a.id,'responding')} style={{ ...s.btnApprove, background:'#f59e0b', color:'#fff' }}>Responding</button>}
            {!isResolved(a) && <button onClick={()=>setStatus(a.id,'resolved')} style={s.btnApprove}>✅ Resolved</button>}
            {isResolved(a)  && <button onClick={()=>reopen(a.id)} style={s.btnSuspend}>↩ Re-open</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NO DRIVER (UNFULFILLED) TAB ───────────────────────────────────────────────
function UnfulfilledTab() {
  const [reqs,    setReqs]    = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'unfulfilled_ride_requests'), snap => { setReqs(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }, ()=>setLoading(false));
    return () => unsub();
  }, []);
  const sorted = [...reqs].sort((a,b)=>(b.created_at?.seconds||0)-(a.created_at?.seconds||0));
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayCount = reqs.filter(r=>new Date((r.created_at?.seconds||0)*1000)>=todayStart).length;
  if (loading) return <div style={{ color:'#9199ad', fontSize:13 }}>Loading...</div>;
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="Total unmatched" value={reqs.length} color="#b45309" sub="no driver available"/>
        <StatCard label="Today" value={todayCount} sub="requests today"/>
      </div>
      {sorted.length===0 && <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>No unmatched requests logged.</div></div>}
      {sorted.map(r => (
        <div key={r.id} style={s.card}>
          <div style={{ fontSize:13, color:'#1a1a2e', marginBottom:4 }}>{(r.pickup_address||r.pickup?.address||'—').split(',')[0]} → {(r.dropoff_address||r.dropoff?.address||'—').split(',')[0]}</div>
          <div style={{ fontSize:12, color:'#6b7280' }}>👤 {r.customer_name||r.customerName||'Customer'} · {r.created_at?.seconds ? new Date(r.created_at.seconds*1000).toLocaleString() : '—'}</div>
        </div>
      ))}
    </div>
  );
}

// ── DRIVER PERFORMANCE TAB ────────────────────────────────────────────────────
function PerformanceTab() {
  const [drivers, setDrivers] = useState([]);
  const [rides,   setRides]   = useState([]);
  useEffect(() => {
    const u1 = onSnapshot(collection(db,'drivers'), snap => setDrivers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(collection(db,'bookings'), snap => setRides(snap.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1(); u2(); };
  }, []);
  const approved = drivers.filter(d => d.status==='approved' || d.status==='suspended');
  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:14, color:'#1a1a2e' }}>📈 Driver Performance</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:640 }}>
            <thead>
              <tr>
                {['Driver','Rating','Rides','Cancelled','Cancel %','Earned (85%)','Status'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 10px', fontSize:11, color:'#9199ad', borderBottom:'1px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approved.map(d => {
                const dr = rides.filter(r=>r.driverId===d.id);
                const done = dr.filter(r=>r.status==='completed');
                const canc = dr.filter(r=>r.status==='cancelled');
                const pct = dr.length ? Math.round(canc.length/dr.length*100) : 0;
                const earned = Math.round(done.reduce((s,r)=>s+(r.fare||0),0)*0.85);
                return (
                  <tr key={d.id}>
                    <td style={{ padding:'8px 10px', color:'#1a1a2e', fontWeight:500, whiteSpace:'nowrap' }}>{d.name||'—'}</td>
                    <td style={{ padding:'8px 10px', color:'#6b7280', whiteSpace:'nowrap' }}>⭐ {(d.rating||5).toFixed(1)}</td>
                    <td style={{ padding:'8px 10px', color:'#6b7280' }}>{done.length}</td>
                    <td style={{ padding:'8px 10px', color: canc.length>0?'#dc2626':'#374151' }}>{canc.length}</td>
                    <td style={{ padding:'8px 10px', color: pct>=20?'#dc2626':pct>=10?'#b45309':GREEN, fontWeight:500 }}>{pct}%</td>
                    <td style={{ padding:'8px 10px', color:GREEN, whiteSpace:'nowrap' }}>J${earned.toLocaleString()}</td>
                    <td style={{ padding:'8px 10px' }}>
                      <span style={{ ...s.badge, background: d.isOnline?'#f0fff4':'#f3f4f6', color: d.isOnline?GREEN:'#9199ad' }}>{d.isOnline?'Online':(d.status||'—')}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {approved.length===0 && <div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>No approved drivers yet.</div>}
        </div>
      </div>
    </div>
  );
}

// ── BROADCAST TAB ─────────────────────────────────────────────────────────────
function BroadcastTab() {
  const [drivers, setDrivers] = useState([]);
  const [msg,     setMsg]     = useState('');
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db,'drivers'), where('status','==','approved')), snap => setDrivers(snap.docs.map(d=>({id:d.id,...d.data()}))), ()=>{});
    return () => unsub();
  }, []);
  const normalizePhone = (raw) => {
    if (!raw) return null;
    let d = String(raw).replace(/\D/g,'');
    if (d.length===7) d='876'+d;
    if (d.length===10) d='1'+d;
    if (d.length===11 && d.startsWith('1')) return d;
    return d.length>=10 ? d : null;
  };
  const targets = drivers.map(d=>({ ...d, wa:normalizePhone(d.phone) })).filter(d=>d.wa);
  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize:14, fontWeight:500, marginBottom:6, color:'#1a1a2e' }}>📢 Broadcast to Drivers</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>Type one message, then tap each driver to open WhatsApp with it pre-filled. {targets.length} approved driver{targets.length!==1?'s':''} with valid numbers.</div>
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} placeholder="e.g. Heavy rain expected this evening — surge pricing is ON. Drive safe!"
          style={{ width:'100%', padding:12, borderRadius:8, border:'1px solid #d0d3e0', background:'#f5f6fa', color:'#1a1a2e', fontSize:14, fontFamily:'inherit', resize:'vertical', boxSizing:'border-box', marginBottom:12 }}/>
        <button onClick={()=>{ navigator.clipboard?.writeText(msg).catch(()=>{}); }} disabled={!msg.trim()} style={{ ...s.btnApprove, background:'#f3f4f6', color:'#1a1a2e', opacity: msg.trim()?1:0.5 }}>📋 Copy Message</button>
      </div>
      {targets.map(d => (
        <div key={d.id} style={{ ...s.card, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:14, color:'#1a1a2e' }}>{d.name||'Driver'} {d.isOnline && <span style={{ fontSize:11, color:GREEN }}>● online</span>}</div>
            <div style={{ fontSize:12, color:'#9199ad' }}>+{d.wa}</div>
          </div>
          <a href={`https://wa.me/${d.wa}?text=${encodeURIComponent(msg||'')}`} target="_blank" rel="noreferrer"
            style={{ padding:'8px 14px', background: msg.trim()?'#25D366':'#e5e7eb', color: msg.trim()?'#fff':'#9199ad', borderRadius:8, fontSize:12, fontWeight:600, textDecoration:'none', pointerEvents: msg.trim()?'auto':'none' }}>💬 WhatsApp</a>
        </div>
      ))}
      {targets.length===0 && <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>No approved drivers with phone numbers yet.</div></div>}
    </div>
  );
}

export default function AdminPanel() {
  const [adminUser, setAdminUser] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('overview');

  // Must match the isAdmin() email list in firestore.rules
  const ADMIN_EMAILS = ['admin@villecabs.com'];
  const isAdminEmail = (u) => u && ADMIN_EMAILS.includes((u.email || '').toLowerCase());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAdminUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => { await signOut(auth); setAdminUser(null); };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', alignItems:'center', justifyContent:'center', color:'#1a1a2e', fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:40, marginBottom:12 }}>🚕</div><div style={{ color:'#9199ad' }}>Loading...</div></div>
    </div>
  );

  if (!adminUser) return <AdminLogin onLogin={setAdminUser}/>;

  // Signed in but NOT an admin — deny access (data is also protected by Firestore rules)
  if (!isAdminEmail(adminUser)) return (
    <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Segoe UI', sans-serif", padding:24 }}>
      <div style={{ textAlign:'center', maxWidth:340 }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
        <div style={{ fontSize:20, fontWeight:800, color:'#1a1a2e', marginBottom:8 }}>Access Denied</div>
        <div style={{ fontSize:14, color:'#6b7280', lineHeight:1.6, marginBottom:20 }}>This account doesn't have admin access. If you're a driver or customer, please use the main app.</div>
        <button onClick={handleLogout} style={{ padding:'11px 24px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:22, fontSize:14, fontWeight:700, cursor:'pointer' }}>Sign Out</button>
      </div>
    </div>
  );

  const tabs = [
    { id:'overview',  label:'Overview',    icon:'📊' },
    { id:'analytics', label:'Analytics',   icon:'📉' },
    { id:'drivers',   label:'Drivers',     icon:'🚗' },
    { id:'rides',     label:'Rides',       icon:'🚕' },
    { id:'livemap',   label:'Live Map',    icon:'🗺️' },
    { id:'scheduled', label:'Scheduled',   icon:'🗓️' },
    { id:'customers', label:'Customers',   icon:'👥' },
    { id:'revenue',   label:'Revenue',     icon:'💰' },
    { id:'performance',label:'Performance',icon:'📈' },
    { id:'partners',  label:'Partners',    icon:'🤝' },
    { id:'charter',   label:'Charter',     icon:'🚘' },
    { id:'contacts',  label:'Messages',    icon:'📬' },
    { id:'alerts',    label:'Alerts',      icon:'🆘' },
    { id:'unfulfilled',label:'No Driver',  icon:'📍' },
    { id:'broadcast', label:'Broadcast',   icon:'📢' },
    { id:'promos',    label:'Promos',      icon:'🎟️' },
  ];

  return (
    <div style={s.page}>
      <AdminGlobalStyles/>

      {/* ── TOP BAR ── */}
      <div style={s.topbar}>
        <img src="/logo.png" style={{ height:28, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:15, fontWeight:700, color:'#6b21a8', marginLeft:2 }}>Admin Dashboard</span>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:'#888', display:'none' }} className="admin-email">{adminUser.email}</span>
          <button onClick={handleLogout} style={{ padding:'6px 12px', background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:10, color:'#6b21a8', fontSize:11, fontWeight:600, cursor:'pointer' }}>Logout</button>
        </div>
      </div>

      {/* ── SCROLLING TAB STRIP ── */}
      <div style={s.tabstrip}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tab===t.id ? s.tabActive : s.tab}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div style={s.main}>
        <div style={{ fontSize:18, fontWeight:800, marginBottom:16, color:'#1a1a2e' }}>
          {tab==='overview'?'📊 Dashboard Overview':tab==='analytics'?'📉 Analytics':tab==='drivers'?'🚗 Driver Management':tab==='rides'?'🚕 Ride Management':tab==='livemap'?'🗺️ Live Operations Map':tab==='scheduled'?'🗓️ Scheduled Rides':tab==='customers'?'👥 Customers':tab==='revenue'?'💰 Revenue':tab==='performance'?'📈 Driver Performance':tab==='partners'?'🤝 Partner Requests':tab==='charter'?'🚘 Charter Bookings':tab==='contacts'?'📬 Messages':tab==='alerts'?'🆘 Safety Alerts':tab==='unfulfilled'?'📍 No Driver Available':tab==='broadcast'?'📢 Broadcast to Drivers':'🎟️ Promo Codes'}
        </div>
        {tab === 'overview'  && <OverviewTab setTab={setTab}/>}
        {tab === 'analytics' && <AnalyticsTab/>}
        {tab === 'drivers'   && <DriversTab/>}
        {tab === 'rides'     && <RidesTab/>}
        {tab === 'livemap'   && <LiveMapTab/>}
        {tab === 'scheduled' && <ScheduledTab/>}
        {tab === 'customers' && <CustomersTab/>}
        {tab === 'revenue'   && <RevenueTab/>}
        {tab === 'performance' && <PerformanceTab/>}
        {tab === 'partners'  && <PartnersTab/>}
        {tab === 'charter'   && <CharterTab/>}
        {tab === 'contacts'  && <ContactsTab/>}
        {tab === 'alerts'    && <AlertsTab/>}
        {tab === 'unfulfilled' && <UnfulfilledTab/>}
        {tab === 'broadcast' && <BroadcastTab/>}
        {tab === 'promos'    && <PromoCodesTab/>}
      </div>
    </div>
  );
}
