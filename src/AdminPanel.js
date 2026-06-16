import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot, updateDoc, doc, orderBy, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

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
  page:     { minHeight:'100vh', background:'#0f1015', color:WHITE, fontFamily:"'Segoe UI', sans-serif" },
  topbar:   { background:DARK, padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid rgba(255,255,255,0.1)' },
  logo:     { display:'flex', alignItems:'center', gap:10, fontSize:18, fontWeight:600, color:WHITE },
  logobadge:{ background:YELLOW, borderRadius:8, padding:'4px 10px', fontSize:12, color:DARK, fontWeight:700 },
  sidebar:  { width:200, background:DARK, minHeight:'100vh', padding:'20px 0', flexShrink:0, borderRight:'0.5px solid rgba(255,255,255,0.08)' },
  navitem:  { padding:'12px 20px', fontSize:14, cursor:'pointer', color:'rgba(255,255,255,0.6)', display:'flex', alignItems:'center', gap:10, borderLeft:'3px solid transparent' },
  navactive:{ padding:'12px 20px', fontSize:14, cursor:'pointer', color:WHITE, fontWeight:500, display:'flex', alignItems:'center', gap:10, borderLeft:`3px solid ${YELLOW}`, background:'rgba(232,180,0,0.08)' },
  main:     { flex:1, padding:'24px', overflowY:'auto' },
  card:     { background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'16px 20px', marginBottom:14 },
  statgrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 },
  stat:     { background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'16px 20px' },
  badge:    { display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500 },
  btnApprove:{ background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:500, cursor:'pointer', marginRight:8 },
  btnReject: { background:'rgba(226,75,74,0.15)', color:'#f09595', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer' },
  btnSuspend:{ background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.5)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer' },
  inp:      { width:'100%', padding:'12px 14px', background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:10, color:WHITE, fontSize:14, boxSizing:'border-box', outline:'none', marginBottom:12 },
  errBox:   { background:'rgba(226,75,74,0.15)', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#f09595' },
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
    <div style={{ minHeight:'100vh', background:'#0f1015', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ width:380, background:DARK, border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:20, padding:32 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🚕</div>
          <div style={{ fontSize:22, fontWeight:700, color:WHITE, letterSpacing:2 }}>VilleCabs</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', marginTop:4 }}>Admin Panel</div>
        </div>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <label style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4, display:'block' }}>Admin Email</label>
        <input style={s.inp} type="email" placeholder="admin@villecabs.com" value={email} onChange={e => setEmail(e.target.value)}/>
        <label style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4, display:'block' }}>Password</label>
        <input style={s.inp} type="password" placeholder="Admin password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key==='Enter' && handleLogin()}/>
        <button onClick={handleLogin} disabled={loading}
          style={{ width:'100%', padding:'14px', background:YELLOW, color:DARK, border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginTop:4, opacity:loading?0.7:1 }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

// ── STAT CARD ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color = WHITE, sub }) {
  return (
    <div style={s.stat}>
      <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:500, color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:4 }}>{sub}</div>}
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
    const q = filter === 'all'
      ? query(collection(db,'drivers'))
      : query(collection(db,'drivers'), where('status','==',filter));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id:d.id, ...d.data() }));
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

  const statusBadge = (status) => {
    const map = {
      pending:   { bg:'rgba(232,180,0,0.15)',  color:'#e8b400',  text:'Pending'   },
      approved:  { bg:'rgba(26,158,90,0.15)',  color:'#1a9e5a',  text:'Approved'  },
      rejected:  { bg:'rgba(226,75,74,0.15)', color:'#f09595',  text:'Rejected'  },
      suspended: { bg:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)', text:'Suspended' },
    };
    const m = map[status] || map.pending;
    return <span style={{ ...s.badge, background:m.bg, color:m.color }}>{m.text}</span>;
  };

  const filters = ['pending','approved','rejected','all'];

  return (
    <div>
      {/* Confirm reject modal */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:DARK, borderRadius:16, padding:24, width:360, border:'0.5px solid rgba(255,255,255,0.15)' }}>
            <div style={{ fontSize:16, fontWeight:500, marginBottom:8 }}>Reject driver application?</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:16 }}>Optionally enter a reason — this will be stored on their profile.</div>
            <input style={s.inp} placeholder="Reason (optional)" id="reject-reason"/>
            <div style={{ display:'flex', gap:8, marginTop:4 }}>
              <button onClick={() => reject(confirm, document.getElementById('reject-reason')?.value||'')}
                style={{ flex:1, background:RED, color:WHITE, border:'none', borderRadius:8, padding:10, cursor:'pointer', fontWeight:500 }}>Confirm Reject</button>
              <button onClick={() => setConfirm(null)}
                style={{ flex:1, background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.6)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:8, padding:10, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'0.5px solid rgba(255,255,255,0.15)', background:filter===f?YELLOW:'rgba(255,255,255,0.05)', color:filter===f?DARK:'rgba(255,255,255,0.6)', cursor:'pointer', textTransform:'capitalize', fontWeight:filter===f?600:400 }}>
            {f === 'all' ? 'All drivers' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>Loading drivers...</div>
      ) : drivers.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14 }}>No {filter} applications</div>
        </div>
      ) : drivers.map(driver => (
        <div key={driver.id} style={s.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:44, height:44, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>👤</div>
              <div>
                <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>{driver.name}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{driver.email} · {driver.phone}</div>
              </div>
            </div>
            {statusBadge(driver.status)}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
            {[['TRN', driver.trn],['Date of Birth', driver.dob],['Vehicle', `${driver.vehicleMake||''} ${driver.vehicleModel||''}`],['Plate', driver.licensePlate],['Applied', driver.createdAt?.toDate?.()?.toLocaleDateString('en-JM')||'--'],['Rating', driver.rating ? `★ ${driver.rating}` : 'New']].map(([k,v]) => (
              <div key={k} style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:12, color:WHITE }}>{v||'--'}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Documents</div>
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
                      <span style={{ ...s.badge, background:'rgba(226,75,74,0.12)', color:'#f09595', fontSize:11, padding:'5px 10px' }}>
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
      completed: { bg:'rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.5)', text:'Completed' },
      cancelled: { bg:'rgba(226,75,74,0.12)', color:'#f09595',  text:'Cancelled' },
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
        <StatCard label="Total revenue" value={`J$${total.toLocaleString()}`} color={YELLOW} sub="all rides"/>
        <StatCard label="Active now"    value={rides.filter(r=>r.status==='active').length} color={GREEN} sub="in progress"/>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'7px 16px', borderRadius:20, fontSize:13, border:'0.5px solid rgba(255,255,255,0.15)', background:filter===f?YELLOW:'rgba(255,255,255,0.05)', color:filter===f?DARK:'rgba(255,255,255,0.6)', cursor:'pointer', textTransform:'capitalize', fontWeight:filter===f?600:400 }}>
            {f === 'all' ? 'All rides' : f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>Loading rides...</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🚕</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14 }}>No {filter} rides yet</div>
        </div>
      ) : sorted.map((r,i) => (
        <div key={r.id} style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'16px 18px', marginBottom:12 }}>

          {/* Top row: customer + status + changer */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>{r.customerName||'--'}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>#{r.id?.slice(-6).toUpperCase()}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {statusBadge(r.status)}
              <select value={r.status} onChange={e => changeStatus(r.id, e.target.value)}
                style={{ background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:8, color:WHITE, fontSize:12, padding:'4px 8px', cursor:'pointer', outline:'none' }}>
                <option value="searching">Searching</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Date/time row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:2 }}>Booked</div>
              <div style={{ fontSize:11, color:WHITE }}>{fmtDateTime(r.createdAt)}</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:2 }}>Accepted</div>
              <div style={{ fontSize:11, color:WHITE }}>{fmtDateTime(r.acceptedAt)}</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:2 }}>Completed</div>
              <div style={{ fontSize:11, color:WHITE }}>{fmtDateTime(r.completedAt)}</div>
            </div>
          </div>

          {/* Route + driver + fare */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:8, alignItems:'center' }}>
            <div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:4 }}>Route</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}><span style={{ color:GREEN }}>●</span> {r.pickup?.address?.split(',')[0]||'--'}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}><span style={{ color:YELLOW }}>●</span> {r.dropoff?.address?.split(',')[0]||'--'}</div>
            </div>
            <div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:4 }}>Driver</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{r.driverName||'Unassigned'}</div>
              {r.licensePlate && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{r.licensePlate}</div>}
            </div>
            <div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:4 }}>Vehicle</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{r.vehicleType||'--'}</div>
              {r.distanceKm && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{r.distanceKm} km</div>}
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginBottom:4 }}>Fare</div>
              <div style={{ fontSize:16, fontWeight:600, color:GREEN }}>J${r.fare?.toLocaleString()||'--'}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:2 }}>{r.paymentMethod||'cash'}</div>
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
      <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:20, marginBottom:24 }}>
        <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:16 }}>➕ Create Promo Code</div>
        {error   && <div style={{ background:'rgba(226,75,74,0.15)', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#f09595' }}>⚠️ {error}</div>}
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
          style={{ padding:'11px 24px', background:YELLOW, color:DARK, border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
          {saving ? 'Creating...' : 'Create Promo Code'}
        </button>
      </div>

      {/* Promo list */}
      <div style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.5)', marginBottom:12, textTransform:'uppercase', letterSpacing:0.5 }}>
        {promos.length} promo code{promos.length !== 1 ? 's' : ''}
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>Loading...</div>
      ) : promos.length === 0 ? (
        <div style={{ textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🎟️</div>
          <div style={{ color:'rgba(255,255,255,0.4)' }}>No promo codes yet</div>
        </div>
      ) : promos.map(p => {
        const expired = isExpired(p.expiry);
        const status  = !p.active ? 'disabled' : expired ? 'expired' : 'active';
        const statusColor = status==='active' ? GREEN : status==='expired' ? '#f09595' : 'rgba(255,255,255,0.3)';
        return (
          <div key={p.id} style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'16px 18px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                  <span style={{ fontSize:18, fontWeight:700, color:YELLOW, letterSpacing:2 }}>{p.code}</span>
                  <span style={{ background:`${statusColor}22`, color:statusColor, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:500, textTransform:'uppercase' }}>{status}</span>
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>{p.description}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:22, fontWeight:700, color:GREEN }}>{p.discount}% off</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Used {p.usageCount||0} time{p.usageCount!==1?'s':''}</div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'0.5px solid rgba(255,255,255,0.06)', paddingTop:10 }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>
                Expires: <span style={{ color: expired ? '#f09595' : 'rgba(255,255,255,0.6)' }}>{p.expiry || '--'}</span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => toggleActive(p.id, p.active)}
                  style={{ padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer', border:'0.5px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:WHITE }}>
                  {p.active ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => handleDelete(p.id, p.code)}
                  style={{ padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer', border:'0.5px solid rgba(226,75,74,0.3)', background:'rgba(226,75,74,0.1)', color:'#f09595' }}>
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

// ── OVERVIEW TAB ──────────────────────────────────────────────────────────────
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
        <StatCard label="Pending applications" value={stats.pending}    color={YELLOW} sub="awaiting review"/>
        <StatCard label="Active drivers"        value={stats.approved}  color={GREEN}  sub="approved"/>
        <StatCard label="Total rides"           value={stats.total_rides}              sub="all time"/>
        <StatCard label="Total revenue"         value={`J$${stats.revenue.toLocaleString()}`} color={YELLOW} sub="platform earnings × 15%"/>
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
          <div onClick={() => setTab('drivers')} style={{ background:'rgba(232,180,0,0.1)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:10, padding:'12px 16px', fontSize:13, color:YELLOW, cursor:'pointer' }}>
            👤 Review pending drivers ({stats.pending})
          </div>
          <div onClick={() => setTab('rides')} style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.25)', borderRadius:10, padding:'12px 16px', fontSize:13, color:'#9fe1cb', cursor:'pointer' }}>
            🚕 View active rides ({stats.active_rides})
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ADMIN APP ────────────────────────────────────────────────────────────
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
    <div style={{ minHeight:'100vh', background:'#0f1015', display:'flex', alignItems:'center', justifyContent:'center', color:WHITE, fontFamily:"'Segoe UI', sans-serif" }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:40, marginBottom:12 }}>🚕</div><div style={{ color:'rgba(255,255,255,0.4)' }}>Loading...</div></div>
    </div>
  );

  if (!adminUser) return <AdminLogin onLogin={setAdminUser}/>;

  const tabs = [
    { id:'overview', label:'Overview',    icon:'📊' },
    { id:'drivers',  label:'Drivers',     icon:'🚗' },
    { id:'rides',    label:'Rides',       icon:'🚕' },
    { id:'promos',   label:'Promo Codes', icon:'🎟️' },
  ];

  return (
    <div style={s.page}>
      <div style={s.topbar}>
        <div style={s.logo}>
          <span>🚕</span> VilleCabs
          <span style={s.logobadge}>ADMIN</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>{adminUser.email}</span>
          <button onClick={handleLogout} style={{ background:'none', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:8, color:'rgba(255,255,255,0.5)', fontSize:12, padding:'6px 14px', cursor:'pointer' }}>Logout</button>
        </div>
      </div>

      <div style={{ display:'flex' }}>
        <div style={s.sidebar}>
          <div style={{ padding:'12px 20px', fontSize:11, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>Menu</div>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={tab===t.id ? s.navactive : s.navitem}>
              <span>{t.icon}</span> {t.label}
            </div>
          ))}
          <div style={{ margin:'20px 20px 0', height:'0.5px', background:'rgba(255,255,255,0.08)' }}/>
          <div style={{ padding:'16px 20px', fontSize:12, color:'rgba(255,255,255,0.3)', lineHeight:1.6 }}>
            VilleCabs Admin<br/>Manchester, Jamaica
          </div>
        </div>

        <div style={s.main}>
          <div style={{ fontSize:20, fontWeight:500, marginBottom:20, color:WHITE, textTransform:'capitalize' }}>
            {tab === 'overview' ? '📊 Dashboard Overview' : tab === 'drivers' ? '🚗 Driver Management' : tab === 'rides' ? '🚕 Ride Management' : '🎟️ Promo Codes'}
          </div>
          {tab === 'overview' && <OverviewTab setTab={setTab}/>}
          {tab === 'drivers'  && <DriversTab/>}
          {tab === 'rides'    && <RidesTab/>}
          {tab === 'promos'   && <PromoCodesTab/>}
        </div>
      </div>
    </div>
  );
}
