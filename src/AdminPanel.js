import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, updateDoc, doc, orderBy, addDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';

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
  errBox:   { background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#dc2626' },
};

// ── ADMIN LOGIN ───────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

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

  return (
    <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ width:380, background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:20, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🚕</div>
          <div style={{ fontSize:22, fontWeight:700, color:'#1a1a2e', letterSpacing:2 }}>VilleCabs</div>
          <div style={{ fontSize:13, color:'#9199ad', marginTop:4 }}>Admin Panel</div>
        </div>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <label style={{ fontSize:11, color:'#6b7280', marginBottom:4, display:'block' }}>Admin Email</label>
        <input style={s.inp} type="email" placeholder="admin@villecabs.com" value={email} onChange={e => setEmail(e.target.value)}/>
        <label style={{ fontSize:11, color:'#6b7280', marginBottom:4, display:'block' }}>Password</label>
        <input style={s.inp} type="password" placeholder="Admin password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key==='Enter' && handleLogin()}/>
        <button onClick={handleLogin} disabled={loading}
          style={{ width:'100%', padding:'14px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginTop:4, opacity:loading?0.7:1 }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
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
function DriversTab() {
  const [drivers, setDrivers]   = useState([]);
  const [filter,  setFilter]    = useState('pending');
  const [loading, setLoading]   = useState(true);
  const [confirm, setConfirm]   = useState(null);

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

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'1px solid #e5e7eb', background:filter===f?'#6b21a8':'#f3f4f6', color:filter===f?'#fff':'#555', cursor:'pointer', textTransform:'capitalize', fontWeight:filter===f?600:400 }}>
            {f === 'all' ? 'All drivers' : f === 'reuploads' ? '⏳ Re-uploads' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading drivers...</div>
      ) : drivers.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <div style={{ color:'#9199ad', fontSize:14 }}>No {filter} applications</div>
        </div>
      ) : drivers.map(driver => (
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
              <button onClick={() => suspend(driver.id)} style={s.btnSuspend}>Suspend driver</button>
            )}
            {(driver.status === 'rejected' || driver.status === 'suspended') && (
              <button onClick={() => approve(driver.id)} style={s.btnApprove}>Re-activate</button>
            )}
          </div>
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
    };
    const m = map[status] || map.searching;
    return <span style={{ ...s.badge, background:m.bg, color:m.color }}>{m.text}</span>;
  };

  const total = rides.reduce((sum, r) => sum + (r.fare||0), 0);
  const filters = ['all','searching','active','completed','cancelled'];

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

  const sorted = [...rides].sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="Total rides"   value={rides.length} sub="in current filter"/>
        <StatCard label="Total revenue" value={`J$${total.toLocaleString()}`} color="#b45309" sub="all rides"/>
        <StatCard label="Active now"    value={rides.filter(r=>r.status==='active').length} color={GREEN} sub="in progress"/>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'1px solid #e5e7eb', background:filter===f?'#6b21a8':'#f3f4f6', color:filter===f?'#fff':'#555', cursor:'pointer', textTransform:'capitalize', fontWeight:filter===f?600:400 }}>
            {f === 'all' ? 'All rides' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading rides...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🚕</div>
          <div style={{ color:'#9199ad', fontSize:14 }}>No {filter} rides yet</div>
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
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'contact_submissions'), snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      list.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setContacts(list); setLoading(false);
    });
    return () => unsub();
  }, []);
  const fmtDate = (ts) => ts?.seconds ? new Date(ts.seconds*1000).toLocaleDateString('en-JM',{day:'numeric',month:'short',year:'numeric'}) : '--';
  return (
    <div>
      <StatCard label="Total messages" value={contacts.length} sub="contact submissions"/>
      <div style={{ marginTop:16 }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>Loading...</div>
        : contacts.length === 0 ? <div style={{ textAlign:'center', padding:40, color:'#9199ad' }}>No messages yet</div>
        : contacts.map(c => (
          <div key={c.id} style={{ background:'#ffffff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 18px', marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:500, color:'#1a1a2e' }}>{c.name}</div>
                <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>{c.email} · {c.role==='driver'?'Driver':'Customer'}</div>
              </div>
              <div style={{ fontSize:11, color:'#9199ad' }}>{fmtDate(c.createdAt)}</div>
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:'#6b21a8', marginBottom:6 }}>{c.subject}</div>
            <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6, background:'#f9fafb', borderRadius:8, padding:10 }}>{c.message}</div>
            <a href={`mailto:${c.email}?subject=Re: ${c.subject}`}
              style={{ display:'inline-block', marginTop:10, padding:'6px 14px', background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:8, color:'#6b21a8', fontSize:12, textDecoration:'none' }}>
              📧 Reply via email
            </a>
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
  useEffect(() => {
    const u1 = onSnapshot(collection(db,'drivers'), snap => setDrivers(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(query(collection(db,'bookings'), where('status','in',['active','enroute','arrived'])), snap => setRides(snap.docs.map(d=>({id:d.id,...d.data()}))), () => {});
    return () => { u1(); u2(); };
  }, []);

  const nowMs = Date.now();
  const isFresh = (loc) => loc?.lat && (!loc.updatedAt?.seconds || (nowMs - loc.updatedAt.seconds*1000) < 5*60*1000);
  const onlineDrivers   = drivers.filter(d => d.isOnline);
  const locatedDrivers  = onlineDrivers.filter(d => isFresh(d.currentLocation));

  return (
    <div>
      <div style={s.statgrid}>
        <StatCard label="Online drivers" value={onlineDrivers.length} color={GREEN} sub="signed in now"/>
        <StatCard label="Active rides"   value={rides.length} color="#6b21a8" sub="in progress"/>
        <StatCard label="Live locations" value={locatedDrivers.length + rides.filter(r=>r.driverLocation?.lat).length} sub="broadcasting GPS"/>
        <StatCard label="Idle online"    value={onlineDrivers.length - locatedDrivers.length} sub="no live GPS"/>
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
function PartnersTab() {
  const [partners, setPartners] = useState([]);
  const [loading,  setLoading]  = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'partnerRequests'), snap => { setPartners(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }, ()=>setLoading(false));
    return () => unsub();
  }, []);
  const setStatus = async (id, status) => { await updateDoc(doc(db,'partnerRequests',id), { status }); };
  const badge = (st) => {
    const map = { new:{bg:'#fffbeb',color:'#b45309'}, approved:{bg:'rgba(26,158,90,0.15)',color:GREEN}, featured:{bg:'rgba(107,33,168,0.2)',color:'#c9a3f5'}, rejected:{bg:'rgba(226,75,74,0.12)',color:'#dc2626'} };
    const m = map[(st||'new').toLowerCase()] || map.new;
    return <span style={{ ...s.badge, background:m.bg, color:m.color }}>{st||'new'}</span>;
  };
  if (loading) return <div style={{ color:'#9199ad', fontSize:13 }}>Loading...</div>;
  return (
    <div>
      <div style={s.statgrid}>
        <StatCard label="Total" value={partners.length}/>
        <StatCard label="New requests" value={partners.filter(p=>(p.status||'new')==='new').length} color="#b45309"/>
        <StatCard label="Approved" value={partners.filter(p=>['approved','featured'].includes((p.status||'').toLowerCase())).length} color={GREEN}/>
        <StatCard label="Featured" value={partners.filter(p=>(p.status||'').toLowerCase()==='featured').length} color="#c9a3f5"/>
      </div>
      {partners.length===0 && <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>No partner requests yet.</div></div>}
      {partners.map(p => (
        <div key={p.id} style={s.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:15, fontWeight:500, color:'#1a1a2e' }}>{p.businessName||p.name||'Business'}</span>
            {badge(p.status)}
          </div>
          <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>{p.businessType||'Business'} · {p.address||'Manchester, Jamaica'}</div>
          {p.email && <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>📧 {p.email}{p.phone?` · ☎ ${p.phone}`:''}</div>}
          {p.message && <div style={{ fontSize:12, color:'#4b5563', marginBottom:10, lineHeight:1.5 }}>{p.message}</div>}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
            <button onClick={()=>setStatus(p.id,'approved')} style={s.btnApprove}>Approve</button>
            <button onClick={()=>setStatus(p.id,'featured')} style={{ ...s.btnApprove, background:'#6b21a8' }}>⭐ Feature</button>
            <button onClick={()=>setStatus(p.id,'rejected')} style={s.btnReject}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SAFETY ALERTS TAB ─────────────────────────────────────────────────────────
function AlertsTab() {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'sos_alerts'), snap => { setAlerts(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }, ()=>setLoading(false));
    return () => unsub();
  }, []);
  const setStatus = async (id, status) => { await updateDoc(doc(db,'sos_alerts',id), { status }); };
  const sorted = [...alerts].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  if (loading) return <div style={{ color:'#9199ad', fontSize:13 }}>Loading...</div>;
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        <StatCard label="Total alerts" value={alerts.length}/>
        <StatCard label="New" value={alerts.filter(a=>(a.status||'new')==='new').length} color={RED}/>
        <StatCard label="Resolved" value={alerts.filter(a=>a.status==='resolved').length} color={GREEN}/>
      </div>
      {sorted.length===0 && <div style={s.card}><div style={{ color:'#9199ad', fontSize:13, textAlign:'center', padding:20 }}>✅ No safety alerts.</div></div>}
      {sorted.map(a => (
        <div key={a.id} style={{ ...s.card, borderLeft:`3px solid ${a.status==='resolved'?GREEN:RED}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:14, fontWeight:600, color:RED }}>🆘 SOS Alert</span>
            <span style={{ ...s.badge, background: a.status==='resolved'?'rgba(26,158,90,0.15)':'rgba(226,75,74,0.15)', color: a.status==='resolved'?GREEN:'#dc2626' }}>{a.status||'new'}</span>
          </div>
          <div style={{ fontSize:12, color:'#4b5563', marginBottom:3 }}>👤 {a.customerName||'—'} · 🚗 {a.driverName||'—'}</div>
          {a.location && <div style={{ fontSize:12, color:'#4b5563', marginBottom:3 }}>📍 {a.location}</div>}
          <div style={{ fontSize:11, color:'#9199ad', marginBottom:10 }}>{a.createdAt?.seconds ? new Date(a.createdAt.seconds*1000).toLocaleString() : '—'}</div>
          <div style={{ display:'flex', gap:8 }}>
            {a.status!=='responding' && <button onClick={()=>setStatus(a.id,'responding')} style={{ ...s.btnApprove, background:'#f59e0b', color:'#fff' }}>Responding</button>}
            {a.status!=='resolved' && <button onClick={()=>setStatus(a.id,'resolved')} style={s.btnApprove}>✅ Resolved</button>}
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
          {tab==='overview'?'📊 Dashboard Overview':tab==='analytics'?'📉 Analytics':tab==='drivers'?'🚗 Driver Management':tab==='rides'?'🚕 Ride Management':tab==='livemap'?'🗺️ Live Operations Map':tab==='scheduled'?'🗓️ Scheduled Rides':tab==='customers'?'👥 Customers':tab==='revenue'?'💰 Revenue':tab==='performance'?'📈 Driver Performance':tab==='partners'?'🤝 Partner Requests':tab==='contacts'?'📬 Messages':tab==='alerts'?'🆘 Safety Alerts':tab==='unfulfilled'?'📍 No Driver Available':tab==='broadcast'?'📢 Broadcast to Drivers':'🎟️ Promo Codes'}
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
        {tab === 'contacts'  && <ContactsTab/>}
        {tab === 'alerts'    && <AlertsTab/>}
        {tab === 'unfulfilled' && <UnfulfilledTab/>}
        {tab === 'broadcast' && <BroadcastTab/>}
        {tab === 'promos'    && <PromoCodesTab/>}
      </div>
    </div>
  );
}
