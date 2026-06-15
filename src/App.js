// VilleCabs v2.1 - hamburger menu + contained map
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendEmailVerification, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, addDoc, collection, onSnapshot, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};
const app            = initializeApp(firebaseConfig);
const auth           = getAuth(app);
const db             = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const YELLOW = '#e8b400';
const DARK   = '#1a1a2e';
const GREEN  = '#1a9e5a';
const WHITE  = '#ffffff';
const MANCHESTER_CENTER = { lat: 18.0416, lng: -77.5036 };

const s = {
  screen:  { minHeight:'100vh', fontFamily:"'Segoe UI', sans-serif", background:DARK, color:WHITE },
  content: { minHeight:'100vh', position:'relative', zIndex:2 },
  btnY:    { width:'100%', padding:'14px', background:YELLOW, color:DARK, border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10 },
  btnO:    { width:'100%', padding:'13px', background:'transparent', color:WHITE, border:'1px solid rgba(255,255,255,0.25)', borderRadius:12, fontSize:14, cursor:'pointer', marginBottom:10 },
  inp:     { width:'100%', padding:'12px 14px', background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:10, color:WHITE, fontSize:14, marginBottom:14, boxSizing:'border-box' },
  lbl:     { fontSize:11, color:'rgba(255,255,255,0.5)', display:'block', marginBottom:4 },
  errBox:  { background:'rgba(226,75,74,0.15)', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#f09595' },
};

function Field({ label, value, onChange, type='text', placeholder='', obscure=false }) {
  return (
    <div>
      <label style={s.lbl}>{label}</label>
      <input style={s.inp} type={obscure?'password':type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>
    </div>
  );
}

function MapBg() {
  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:0, backgroundImage:"url('/bg.jpg')", backgroundSize:'cover', backgroundPosition:'center', filter:'blur(6px)', transform:'scale(1.05)' }}/>
      <div style={{ position:'fixed', inset:0, zIndex:1, background:'rgba(10,15,30,0.72)' }}/>
    </>
  );
}

function VilleMap({ height=300, center=MANCHESTER_CENTER, zoom=13, children }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: 'AIzaSyDwEPuCCS1fkHG3p2s1F_TvTCqKxINYq4w' });
  if (!isLoaded) return <div style={{ height, background:'#1a1a2e', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.4)', fontSize:13 }}>Loading map...</div>;
  return (
    <GoogleMap mapContainerStyle={{ width:'100%', height }} center={center} zoom={zoom}
      options={{ styles:[{featureType:'all',elementType:'geometry',stylers:[{color:'#1a1a2e'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#0e1626'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#2a2a4a'}]},{featureType:'all',elementType:'labels.text.fill',stylers:[{color:'#8888aa'}]}], disableDefaultUI:true }}>
      {children}
    </GoogleMap>
  );
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
function Splash({ go }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center', position:'relative', zIndex:2 }}>
      <div style={{ marginBottom:20 }}>
        <img src="/villecabs-logo.png" alt="VilleCabs" style={{ width:130, height:130, borderRadius:'50%', objectFit:'cover', border:'3px solid rgba(255,255,255,0.15)' }}/>
      </div>
      <h1 style={{ fontSize:38, fontWeight:700, letterSpacing:3, margin:'0 0 8px', color:WHITE }}>VilleCabs</h1>
      <p style={{ color:'rgba(255,255,255,0.55)', fontSize:15, margin:'0 0 48px' }}>Mandeville, Manchester Taxi Service</p>
      <button style={s.btnY} onClick={() => go('role')}>Get Started</button>
      <button style={s.btnO} onClick={() => go('driver-login')}>Driver Login</button>
      <p style={{ color:'rgba(255,255,255,0.25)', fontSize:11, marginTop:32 }}>Mandeville · Christiana · Spaldings · Porus</p>
    </div>
  );
}

// ── ROLE SELECT ───────────────────────────────────────────────────────────────
function RoleSelect({ go }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative', zIndex:2 }}>
      <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, marginBottom:8 }}>Join VilleCabs</h2>
      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginBottom:32 }}>Choose how you want to use the app</p>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div onClick={() => go('customer-signup')} style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:16, padding:'20px 18px', marginBottom:14, cursor:'pointer', display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:36 }}>👤</span>
          <div><div style={{ fontSize:15, fontWeight:500, color:WHITE }}>Book a Ride</div><div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:3 }}>Request rides around Manchester</div></div>
        </div>
        <div onClick={() => go('driver-signup')} style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:16, padding:'20px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:14 }}>
          <span style={{ fontSize:36 }}>🚗</span>
          <div><div style={{ fontSize:15, fontWeight:500, color:WHITE }}>Become a Driver</div><div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:3 }}>Earn money driving in Manchester</div></div>
        </div>
        <button style={{ ...s.btnO, marginTop:16 }} onClick={() => go('customer-login')}>Already have an account? Log in</button>
      </div>
    </div>
  );
}

// ── CUSTOMER SIGNUP ───────────────────────────────────────────────────────────
function CustomerSignup({ go, setUser }) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmail = async () => {
    setError('');
    if (!name||!phone||!email||!pass) { setError('Please fill in all fields.'); return; }
    if (pass.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);
      await setDoc(doc(db,'customers',cred.user.uid), { name, phone, email, role:'customer', createdAt:serverTimestamp() });
      setUser({ uid:cred.user.uid, name, email, role:'customer' });
      go('otp');
    } catch(err) { setError(err.code==='auth/email-already-in-use'?'Email already registered.':err.message); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const r = await signInWithPopup(auth, googleProvider);
      const snap = await getDoc(doc(db,'customers',r.user.uid));
      if (!snap.exists()) {
        await setDoc(doc(db,'customers',r.user.uid), { name:r.user.displayName, phone:'', email:r.user.email, role:'customer', createdAt:serverTimestamp() });
      }
      setUser({ uid:r.user.uid, name:r.user.displayName, email:r.user.email, role:'customer' });
      go('customer-dash');
    } catch(err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative', zIndex:2 }}>
      <div style={{ width:'100%', maxWidth:380, background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:20, padding:'28px 24px' }}>
        <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, margin:'0 0 4px' }}>Create Account</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:'0 0 20px' }}>Join VilleCabs as a rider</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <Field label="Full Name" value={name} onChange={setName} placeholder="Kezia Brown"/>
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="+1 (876) 555-0100"/>
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@email.com"/>
        <Field label="Password" value={pass} onChange={setPass} obscure placeholder="Min 6 characters"/>
        <button style={s.btnY} onClick={handleEmail} disabled={loading}>{loading?'Creating account...':'Create Account'}</button>
        <button style={{ ...s.btnO, background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }} onClick={handleGoogle} disabled={loading}>
          <span style={{ fontSize:18 }}>G</span> Continue with Google
        </button>
        <div style={{ textAlign:'center', marginTop:8 }}>
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:13 }}>Already have an account? </span>
          <span style={{ color:YELLOW, fontSize:13, cursor:'pointer' }} onClick={() => go('customer-login')}>Log in</span>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER LOGIN ────────────────────────────────────────────────────────────
function CustomerLogin({ go, setUser }) {
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (!cred.user.emailVerified) {
        const snap = await getDoc(doc(db,'customers',cred.user.uid));
        const d = snap.data();
        setUser({ uid:cred.user.uid, name:d?.name, email:cred.user.email, role:'customer' });
        go('otp'); return;
      }
      const snap = await getDoc(doc(db,'customers',cred.user.uid));
      const d = snap.data();
      setUser({ uid:cred.user.uid, name:d?.name, email:cred.user.email, role:'customer' });
      go('customer-dash');
    } catch(err) { setError('Incorrect email or password.'); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const r = await signInWithPopup(auth, googleProvider);
      const snap = await getDoc(doc(db,'customers',r.user.uid));
      if (!snap.exists()) { await setDoc(doc(db,'customers',r.user.uid), { name:r.user.displayName, phone:'', email:r.user.email, role:'customer', createdAt:serverTimestamp() }); }
      const d = snap.data();
      setUser({ uid:r.user.uid, name:r.user.displayName||d?.name, email:r.user.email, role:'customer' });
      go('customer-dash');
    } catch(err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative', zIndex:2 }}>
      <div style={{ width:'100%', maxWidth:380, background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:20, padding:'28px 24px' }}>
        <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, margin:'0 0 4px' }}>Welcome Back</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:'0 0 20px' }}>Log in to your VilleCabs account</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@email.com"/>
        <Field label="Password" value={pass} onChange={setPass} obscure placeholder="Your password"/>
        <button style={s.btnY} onClick={handleLogin} disabled={loading}>{loading?'Logging in...':'Log In'}</button>
        <button style={{ ...s.btnO, background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }} onClick={handleGoogle}>
          <span style={{ fontSize:18 }}>G</span> Continue with Google
        </button>
        <div style={{ textAlign:'center', marginTop:8 }}>
          <span style={{ color:'rgba(255,255,255,0.4)', fontSize:13 }}>New to VilleCabs? </span>
          <span style={{ color:YELLOW, fontSize:13, cursor:'pointer' }} onClick={() => go('customer-signup')}>Create account</span>
        </div>
      </div>
    </div>
  );
}

// ── OTP SCREEN ────────────────────────────────────────────────────────────────
function OTPScreen({ go, user }) {
  const [resent, setResent] = useState(false);
  const resend = async () => { if (auth.currentUser) { await sendEmailVerification(auth.currentUser); setResent(true); } };
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative', zIndex:2 }}>
      <div style={{ width:'100%', maxWidth:380, background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:20, padding:'32px 24px', textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>📧</div>
        <h2 style={{ fontSize:20, fontWeight:500, color:WHITE, marginBottom:8 }}>Verify your email</h2>
        <p style={{ color:'rgba(255,255,255,0.6)', fontSize:14, marginBottom:8 }}>We sent a verification link to</p>
        <p style={{ color:YELLOW, fontSize:14, fontWeight:500, marginBottom:24 }}>{user?.email || auth.currentUser?.email}</p>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:24 }}>Click the link in the email then come back and tap the button below.</p>
        <button style={s.btnY} onClick={async () => {
          await auth.currentUser?.reload();
          if (auth.currentUser?.emailVerified) {
            go(user?.role === 'driver' ? 'driver-dash' : 'customer-dash');
          } else {
            alert('Email not verified yet. Please check your inbox and click the link first.');
          }
        }}>I've verified my email →</button>
        {resent ? <p style={{ color:GREEN, fontSize:13 }}>✓ Email resent!</p> : <p style={{ color:'rgba(255,255,255,0.4)', fontSize:13, cursor:'pointer' }} onClick={resend}>Resend email</p>}
        <p style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginTop:16, cursor:'pointer' }} onClick={() => { signOut(auth); go('splash'); }}>← Back to home</p>
      </div>
    </div>
  );
}

// ── DRIVER SIGNUP ─────────────────────────────────────────────────────────────
function DriverSignup({ go }) {
  const [form, setForm] = useState({ name:'', trn:'', dob:'', phone:'', email:'', password:'', make:'', model:'', plate:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await sendEmailVerification(cred.user);
      await setDoc(doc(db,'drivers',cred.user.uid), { name:form.name, trn:form.trn, dob:form.dob, phone:form.phone, email:form.email, vehicleMake:form.make, vehicleModel:form.model, licensePlate:form.plate, status:'pending', role:'driver', createdAt:serverTimestamp() });
      go('driver-pending');
    } catch(err) { setError(err.code==='auth/email-already-in-use'?'Email already registered.':err.message); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:'100vh', padding:24, position:'relative', zIndex:2 }}>
      <div style={{ maxWidth:420, margin:'0 auto', paddingTop:24 }}>
        <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, marginBottom:4 }}>Driver Registration</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:20 }}>Apply to drive with VilleCabs</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <Field label="Full Legal Name" value={form.name} onChange={v=>set('name',v)} placeholder="As on your ID"/>
        <Field label="TRN" value={form.trn} onChange={v=>set('trn',v)} placeholder="000-000-000"/>
        <Field label="Date of Birth" value={form.dob} onChange={v=>set('dob',v)} placeholder="DD/MM/YYYY"/>
        <Field label="Phone Number" value={form.phone} onChange={v=>set('phone',v)} placeholder="+1 (876) 555-0100"/>
        <Field label="Email" value={form.email} onChange={v=>set('email',v)} type="email" placeholder="you@email.com"/>
        <Field label="Password" value={form.password} onChange={v=>set('password',v)} obscure placeholder="Min 6 characters"/>
        <div style={{ borderTop:'0.5px solid rgba(255,255,255,0.1)', margin:'8px 0 16px' }}/>
        <Field label="Vehicle Make" value={form.make} onChange={v=>set('make',v)} placeholder="e.g. Toyota"/>
        <Field label="Vehicle Model" value={form.model} onChange={v=>set('model',v)} placeholder="e.g. Corolla"/>
        <Field label="License Plate" value={form.plate} onChange={v=>set('plate',v)} placeholder="e.g. PP1234"/>
        <button style={s.btnY} onClick={handleSubmit} disabled={loading}>{loading?'Submitting...':'Submit Application'}</button>
        <button style={s.btnO} onClick={() => go('driver-login')}>Already registered? Log in</button>
      </div>
    </div>
  );
}

// ── DRIVER LOGIN ──────────────────────────────────────────────────────────────
function DriverLogin({ go, setUser }) {
  const [email, setEmail] = useState('');
  const [pass, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError(''); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const snap = await getDoc(doc(db,'drivers',cred.user.uid));
      if (!snap.exists()) { setError('No driver account found.'); setLoading(false); return; }
      const d = snap.data();
      if (d.status === 'pending')  { setError('Your application is pending admin approval.'); setLoading(false); return; }
      if (d.status === 'rejected') { setError('Your application was not approved.'); setLoading(false); return; }
      if (!cred.user.emailVerified) {
        setUser({ uid:cred.user.uid, name:d.name, email:cred.user.email, role:'driver' });
        go('otp'); return;
      }
      setUser({ uid:cred.user.uid, name:d.name, email:cred.user.email, role:'driver' });
      go('driver-dash');
    } catch(err) { setError('Incorrect email or password.'); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative', zIndex:2 }}>
      <div style={{ width:'100%', maxWidth:380, background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:20, padding:'28px 24px' }}>
        <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, margin:'0 0 4px' }}>Driver Login</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, margin:'0 0 20px' }}>Log in to your driver account</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@email.com"/>
        <Field label="Password" value={pass} onChange={setPass} obscure placeholder="Your password"/>
        <button style={s.btnY} onClick={handleLogin} disabled={loading}>{loading?'Logging in...':'Login'}</button>
        <button style={s.btnO} onClick={() => go('driver-signup')}>New driver? Apply here</button>
      </div>
    </div>
  );
}

// ── DRIVER PENDING ────────────────────────────────────────────────────────────
function DriverPending({ go }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, position:'relative', zIndex:2, textAlign:'center' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>⏳</div>
      <h2 style={{ fontSize:20, fontWeight:500, color:WHITE, marginBottom:12 }}>Pending Admin Approval</h2>
      <p style={{ color:'rgba(255,255,255,0.5)', fontSize:14, marginBottom:32, maxWidth:300 }}>Our team will review your application within 24–48 hours.</p>
      <button style={{ ...s.btnO, maxWidth:320 }} onClick={() => { signOut(auth); go('splash'); }}>Back to Home</button>
    </div>
  );
}

// ── CUSTOMER DASHBOARD ────────────────────────────────────────────────────────
function CustomerDash({ go, user, setUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab]           = useState('book');
  const [history, setHistory]   = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [notification, setNotification] = useState(null);
  const prevStatusRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('customerId','==',user.uid), where('status','==','completed'));
    const unsub = onSnapshot(q, snap => {
      const rides = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      rides.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setHistory(rides);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('customerId','==',user.uid));
    const unsub = onSnapshot(q, snap => {
      const rides = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      const active = rides.find(r => r.status === 'active');
      const completed = rides.find(r => r.status === 'completed' && (Date.now()/1000-(r.completedAt?.seconds||0)) < 300);
      if (active) {
        setActiveRide(active);
        if (prevStatusRef.current !== 'active' && prevStatusRef.current !== 'arrived') {
          prevStatusRef.current = 'active';
          setNotification({ type:'driver_accepted', driverName:active.driverName||'Your driver', vehicleMake:active.vehicleMake||'', vehicleModel:active.vehicleModel||'', licensePlate:active.licensePlate||'' });
          if (Notification.permission === 'granted') new Notification('🚗 Driver found!', { body:`${active.driverName||'Your driver'} is on the way`, icon:'/villecabs-logo.png' });
        }
        if (active.driverArrived && prevStatusRef.current !== 'arrived') {
          prevStatusRef.current = 'arrived';
          setNotification({ type:'driver_arrived', driverName:active.driverName||'Your driver' });
          if (Notification.permission === 'granted') new Notification('📍 Driver arrived!', { body:`${active.driverName||'Your driver'} is at your pickup!`, icon:'/villecabs-logo.png' });
        }
      } else if (completed && (prevStatusRef.current === 'active' || prevStatusRef.current === 'arrived')) {
        prevStatusRef.current = 'completed';
        setActiveRide(null);
        setNotification(null);
      } else if (!active && !completed) {
        setActiveRide(null);
        setNotification(null);
        prevStatusRef.current = null;
      }
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeRide?.id) return;
    const unsub = onSnapshot(doc(db,'bookings',activeRide.id), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.driverArrived && prevStatusRef.current !== 'arrived') {
        prevStatusRef.current = 'arrived';
        setNotification({ type:'driver_arrived', driverName:data.driverName||'Your driver' });
        if (Notification.permission === 'granted') new Notification('📍 Driver arrived!', { body:`${data.driverName||'Your driver'} is at your pickup!`, icon:'/villecabs-logo.png' });
      }
      if (data.status === 'completed') { setNotification(null); setActiveRide(null); prevStatusRef.current = 'completed'; }
    });
    return () => unsub();
  }, [activeRide?.id]);

  useEffect(() => { if (Notification.permission === 'default') Notification.requestPermission(); }, []);

  const totalSpent = history.reduce((s,r) => s+(r.fare||0), 0);

  return (
    <div style={{ minHeight:'100vh', position:'relative', zIndex:2 }}>
      {/* Top bar */}
      <div style={{ background:'rgba(10,15,35,0.9)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50, borderBottom:'0.5px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setMenuOpen(true)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ width:24, height:2.5, background:WHITE, borderRadius:2 }}/>
          <div style={{ width:18, height:2.5, background:WHITE, borderRadius:2 }}/>
          <div style={{ width:24, height:2.5, background:WHITE, borderRadius:2 }}/>
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src="/villecabs-logo.png" alt="V" style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover' }}/>
          <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {activeRide && <div onClick={() => go('live-ride')} style={{ background:GREEN, borderRadius:20, padding:'4px 10px', fontSize:11, color:WHITE, cursor:'pointer' }}>🚕 Live</div>}
        </div>
      </div>

      {/* Side drawer */}
      {menuOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)' }}/>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:270, background:'rgba(10,15,35,0.98)', borderRight:'0.5px solid rgba(255,255,255,0.1)', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'20px 16px', borderBottom:'0.5px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <img src="/villecabs-logo.png" alt="V" style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover' }}/>
                <button onClick={() => setMenuOpen(false)} style={{ background:'rgba(255,255,255,0.08)', border:'none', color:WHITE, width:30, height:30, borderRadius:'50%', cursor:'pointer' }}>✕</button>
              </div>
              <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>{user?.name}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>{user?.email}</div>
            </div>
            <div style={{ flex:1, padding:'8px 0' }}>
              {[['🚕','Book a Ride',()=>{setTab('book');setMenuOpen(false);}],['📋','Ride History',()=>{setTab('history');setMenuOpen(false);}],['👤','My Profile',()=>{go('customer-profile');setMenuOpen(false);}],['⚙️','Settings',()=>{go('customer-settings');setMenuOpen(false);}]].map(([icon,label,action],i) => (
                <div key={i} onClick={action} style={{ padding:'13px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <span style={{ fontSize:14, color:WHITE }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:16, borderTop:'0.5px solid rgba(255,255,255,0.08)' }}>
              <button onClick={async()=>{await signOut(auth);setUser(null);go('splash');}} style={{ width:'100%', padding:11, background:'rgba(226,75,74,0.12)', border:'0.5px solid rgba(226,75,74,0.3)', borderRadius:10, color:'#f09595', fontSize:13, cursor:'pointer' }}>🚪 Log Out</button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      {notification?.type === 'driver_accepted' && (
        <div style={{ background:'rgba(26,158,90,0.15)', border:'1.5px solid rgba(26,158,90,0.5)', margin:'10px 14px 0', borderRadius:12, padding:14, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:26 }}>🚗</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:GREEN }}>Driver found!</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{notification.driverName} is on the way</div>
            {notification.licensePlate && <div style={{ fontSize:11, color:YELLOW, marginTop:2 }}>{notification.vehicleMake} {notification.vehicleModel} · {notification.licensePlate}</div>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <button onClick={() => go('live-ride')} style={{ background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>Track →</button>
            <button onClick={() => setNotification(null)} style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', border:'none', borderRadius:8, padding:'6px 12px', fontSize:11, cursor:'pointer' }}>Dismiss</button>
          </div>
        </div>
      )}
      {notification?.type === 'driver_arrived' && (
        <div style={{ background:'rgba(232,180,0,0.15)', border:'1.5px solid rgba(232,180,0,0.6)', margin:'10px 14px 0', borderRadius:12, padding:14, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:26 }}>📍</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:YELLOW }}>Driver has arrived!</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{notification.driverName} is at your pickup</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <button onClick={() => go('live-ride')} style={{ background:YELLOW, color:DARK, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:700 }}>View →</button>
            <button onClick={() => setNotification(null)} style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', border:'none', borderRadius:8, padding:'6px 12px', fontSize:11, cursor:'pointer' }}>OK</button>
          </div>
        </div>
      )}

      {/* Book tab */}
      {tab === 'book' && (
        <div style={{ padding:16 }}>
          <p style={{ color:'rgba(255,255,255,0.6)', fontSize:13, marginBottom:14 }}>Good day, <strong style={{ color:WHITE }}>{user?.name?.split(' ')[0]||'Rider'}</strong> 👋</p>
          <div style={{ borderRadius:14, overflow:'hidden', marginBottom:14, border:'0.5px solid rgba(255,255,255,0.1)' }}>
            <VilleMap height={200} center={MANCHESTER_CENTER} zoom={13}>
              <Marker position={MANCHESTER_CENTER} title="Manchester, Jamaica"/>
            </VilleMap>
          </div>
          <div onClick={() => go('pin-pickup')} style={{ background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:14, marginBottom:10, display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
            <div style={{ width:11, height:11, borderRadius:'50%', background:GREEN, flexShrink:0 }}/>
            <div style={{ flex:1 }}><div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:2 }}>PICKUP</div><div style={{ fontSize:13, color:WHITE }}>Tap to set pickup location</div></div>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:18 }}>›</span>
          </div>
          <div onClick={() => go('pin-dropoff')} style={{ background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:14, marginBottom:16, display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
            <div style={{ width:11, height:11, borderRadius:'50%', background:YELLOW, flexShrink:0 }}/>
            <div style={{ flex:1 }}><div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:2 }}>DROP-OFF</div><div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Where are you going?</div></div>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:18 }}>›</span>
          </div>
          <button style={s.btnY} onClick={() => go('vehicle-select')}>🚕 Find a Ride</button>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ padding:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            <div style={{ background:'rgba(232,180,0,0.1)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>Total rides</div>
              <div style={{ fontSize:26, fontWeight:500, color:YELLOW }}>{history.length}</div>
            </div>
            <div style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.25)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>Total spent</div>
              <div style={{ fontSize:22, fontWeight:500, color:GREEN }}>J${totalSpent.toLocaleString()}</div>
            </div>
          </div>
          {history.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🚕</div>
              <div style={{ fontSize:15 }}>No rides yet</div>
              <button style={{ ...s.btnY, marginTop:16 }} onClick={() => setTab('book')}>Book your first ride</button>
            </div>
          ) : history.map((ride,i) => {
            const date = ride.completedAt?.seconds ? new Date(ride.completedAt.seconds*1000).toLocaleDateString('en-JM',{day:'numeric',month:'short',year:'numeric'}) : '--';
            const from = (ride.pickup?.address||'--').split(',')[0];
            const to   = (ride.dropoff?.address||'--').split(',')[0];
            return (
              <div key={ride.id||i} style={{ background:'rgba(15,20,40,0.75)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>{date}</div>
                  <div style={{ fontSize:15, fontWeight:500, color:GREEN }}>J${(ride.fare||0).toLocaleString()}</div>
                </div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}><div style={{ width:8, height:8, borderRadius:'50%', background:GREEN }}/><div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{from}</div></div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}><div style={{ width:8, height:8, borderRadius:'50%', background:YELLOW }}/><div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{to}</div></div>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>👤 {ride.driverName||'VilleCabs driver'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── LOADING ───────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, position:'relative', zIndex:2 }}>
      <div style={{ fontSize:48 }}>🚕</div>
      <div style={{ color:YELLOW, fontSize:16, fontWeight:500 }}>VilleCabs</div>
      <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13 }}>Loading...</div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,     setScreen]     = useState('splash');
  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [bookingId,  setBookingId]  = useState(null);
  const [pickupData, setPickupData] = useState(null);
  const [dropoffData,setDropoffData]= useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (fu) {
        const cSnap = await getDoc(doc(db,'customers',fu.uid));
        const dSnap = await getDoc(doc(db,'drivers',fu.uid));
        const isVerified = fu.emailVerified || fu.providerData[0]?.providerId !== 'password';
        if (cSnap.exists()) {
          const d = cSnap.data();
          setUser({ uid:fu.uid, name:d.name||fu.displayName, email:fu.email, role:'customer' });
          setScreen(isVerified ? 'customer-dash' : 'otp');
        } else if (dSnap.exists()) {
          const d = dSnap.data();
          if (d.status === 'approved') {
            setUser({ uid:fu.uid, name:d.name, email:fu.email, role:'driver' });
            setScreen(isVerified ? 'driver-dash' : 'otp');
          } else {
            setScreen('driver-pending');
          }
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return (
    <div style={{ ...s.screen }}>
      <MapBg/>
      <LoadingScreen/>
    </div>
  );

  if (window.location.pathname.startsWith('/admin')) {
    const AdminPanel = React.lazy(() => import('./AdminPanel'));
    return (
      <React.Suspense fallback={<div style={{color:'white',padding:20}}>Loading admin...</div>}>
        <AdminPanel/>
      </React.Suspense>
    );
  }

  const props = { go:setScreen, user, setUser, bookingId, setBookingId, pickupData, setPickupData, dropoffData, setDropoffData };

  // Import remaining screens lazily to keep this file manageable
  const screens = {
    splash:            <Splash {...props}/>,
    role:              <RoleSelect {...props}/>,
    'customer-signup': <CustomerSignup {...props}/>,
    'customer-login':  <CustomerLogin {...props}/>,
    otp:               <OTPScreen {...props}/>,
    'driver-signup':   <DriverSignup {...props}/>,
    'driver-login':    <DriverLogin {...props}/>,
    'driver-pending':  <DriverPending {...props}/>,
    'customer-dash':   <CustomerDash {...props}/>,
  };

  return (
    <div style={s.screen}>
      <MapBg/>
      {screens[screen] || <LoadingScreen/>}
    </div>
  );
}
