import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendEmailVerification,
  onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, addDoc, collection,
  onSnapshot, updateDoc, query, where, orderBy, serverTimestamp
} from 'firebase/firestore';

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

const s = {
  screen:    { minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", background: DARK, color: WHITE },
  mapBg:     { position: 'fixed', inset: 0, zIndex: 0, background: DARK },
  overlay:   { position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(15,25,50,0.72)', backdropFilter: 'blur(4px)' },
  content:   { position: 'relative', zIndex: 2, minHeight: '100vh' },
  center:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '0 24px' },
  card:      { background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 380 },
  btnY:      { width: '100%', padding: '14px 20px', background: YELLOW, color: DARK, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 },
  btnO:      { width: '100%', padding: '14px 20px', background: 'transparent', color: WHITE, border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', marginBottom: 10 },
  btnG:      { width: '100%', padding: '14px 20px', background: GREEN, color: WHITE, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  inp:       { width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 10, color: WHITE, fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' },
  lbl:       { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4, display: 'block', fontWeight: 500 },
  topBar:    { background: 'rgba(26,26,46,0.95)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '0.5px solid rgba(255,255,255,0.1)' },
  backBtn:   { background: 'none', border: 'none', color: YELLOW, fontSize: 22, cursor: 'pointer', padding: '2px 6px' },
  topTitle:  { color: WHITE, fontSize: 16, fontWeight: 500 },
  link:      { color: YELLOW, fontSize: 13, cursor: 'pointer', textAlign: 'center', marginTop: 8, background: 'none', border: 'none', width: '100%', display: 'block', padding: 4 },
  divLine:   { display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px', color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  errBox:    { background: 'rgba(226,75,74,0.15)', border: '0.5px solid rgba(226,75,74,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#f09595' },
  successBox:{ background: 'rgba(26,158,90,0.15)', border: '0.5px solid rgba(26,158,90,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#9fe1cb' },
  uploadBox: { border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: 'rgba(255,255,255,0.04)' },
  uploadOk:  { border: '1.5px dashed #1a9e5a', borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: 'rgba(26,158,90,0.1)' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function MapBg() {
  return (
    <>
      <div style={s.mapBg}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{ position:'absolute', inset:0 }}>
          <rect width="800" height="600" fill="#1e3a5f"/>
          <ellipse cx="200" cy="150" rx="180" ry="120" fill="#1a4a2e" opacity="0.6"/>
          <ellipse cx="600" cy="100" rx="220" ry="140" fill="#1a4a2e" opacity="0.5"/>
          <ellipse cx="400" cy="400" rx="250" ry="150" fill="#1a4a2e" opacity="0.4"/>
          <ellipse cx="100" cy="450" rx="150" ry="100" fill="#1a4a2e" opacity="0.5"/>
          <ellipse cx="700" cy="480" rx="180" ry="120" fill="#1a4a2e" opacity="0.4"/>
          <line x1="0" y1="300" x2="800" y2="300" stroke={YELLOW} strokeWidth="4" opacity="0.35"/>
          <line x1="400" y1="0" x2="400" y2="600" stroke={YELLOW} strokeWidth="4" opacity="0.35"/>
          <line x1="0" y1="150" x2="800" y2="450" stroke={YELLOW} strokeWidth="2.5" opacity="0.2"/>
          <line x1="800" y1="150" x2="0" y2="450" stroke={YELLOW} strokeWidth="2.5" opacity="0.2"/>
          <line x1="200" y1="0" x2="200" y2="600" stroke={WHITE} strokeWidth="1.5" opacity="0.1"/>
          <line x1="600" y1="0" x2="600" y2="600" stroke={WHITE} strokeWidth="1.5" opacity="0.1"/>
          <circle cx="375" cy="285" r="10" fill={YELLOW} opacity="0.9"/>
          <circle cx="375" cy="285" r="5" fill={DARK}/>
          <circle cx="575" cy="170" r="7" fill={GREEN} opacity="0.8"/>
          <circle cx="575" cy="170" r="3.5" fill={WHITE}/>
          <text x="370" y="316" textAnchor="middle" fill={YELLOW} fontSize="11" opacity="0.7" fontWeight="bold">Mandeville</text>
          <text x="580" y="195" textAnchor="middle" fill={WHITE} fontSize="9" opacity="0.5">Christiana</text>
        </svg>
      </div>
      <div style={s.overlay}/>
    </>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={s.topBar}>
      {onBack && <button style={s.backBtn} onClick={onBack}>←</button>}
      <span style={s.topTitle}>{title}</span>
    </div>
  );
}

function Divider() {
  return (
    <div style={s.divLine}>
      <div style={{ flex:1, height:'0.5px', background:'rgba(255,255,255,0.15)' }}/>
      <span>or</span>
      <div style={{ flex:1, height:'0.5px', background:'rgba(255,255,255,0.15)' }}/>
    </div>
  );
}

function GoogleBtn({ onClick, loading }) {
  return (
    <button style={{ ...s.btnO, display:'flex', alignItems:'center', justifyContent:'center', gap:10, opacity: loading ? 0.7 : 1 }} onClick={onClick} disabled={loading}>
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      {loading ? 'Connecting...' : 'Continue with Google'}
    </button>
  );
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
function Splash({ go }) {
  return (
    <div style={s.content}>
      <div style={s.center}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:YELLOW, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:40 }}>🚕</div>
        <h1 style={{ fontSize:42, fontWeight:700, letterSpacing:3, margin:'0 0 8px', color:WHITE }}>VilleCabs</h1>
        <p style={{ color:'rgba(255,255,255,0.55)', fontSize:15, margin:'0 0 48px' }}>Manchester, Jamaica's ride service</p>
        <div style={{ width:'100%', maxWidth:320 }}>
          <button style={s.btnY} onClick={() => go('role')}>Get Started</button>
          <button style={s.btnO} onClick={() => go('driver-login')}>Driver Login</button>
        </div>
        <p style={{ color:'rgba(255,255,255,0.25)', fontSize:11, marginTop:40 }}>Mandeville · Christiana · Spaldings · Porus</p>
      </div>
    </div>
  );
}

// ── ROLE SELECT ───────────────────────────────────────────────────────────────
function RoleSelect({ go }) {
  return (
    <div style={s.content}>
      <TopBar title="Join VilleCabs" onBack={() => go('splash')}/>
      <div style={{ ...s.center, paddingTop:40 }}>
        <p style={{ color:'rgba(255,255,255,0.6)', marginBottom:24, fontSize:14 }}>How would you like to use VilleCabs?</p>
        <div style={{ width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:14 }}>
          <div onClick={() => go('customer-signup')} style={{ ...s.card, cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:38, marginBottom:10 }}>👤</div>
            <div style={{ fontSize:16, fontWeight:500, marginBottom:4 }}>Book a Ride</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Request rides around Manchester</div>
          </div>
          <div onClick={() => go('driver-signup')} style={{ ...s.card, cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:38, marginBottom:10 }}>🚗</div>
            <div style={{ fontSize:16, fontWeight:500, marginBottom:4 }}>Become a Driver</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Earn money driving in Manchester</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER SIGNUP ───────────────────────────────────────────────────────────
function CustomerSignup({ go, setUser }) {
  const [form, setForm]     = useState({ name:'', phone:'', email:'', password:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleEmailSignup = async () => {
    setError('');
    if (!form.name||!form.phone||!form.email||!form.password) { setError('Please fill in all fields.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await sendEmailVerification(cred.user);
      await setDoc(doc(db,'customers',cred.user.uid), { name:form.name, phone:form.phone, email:form.email, role:'customer', createdAt:serverTimestamp() });
      setUser({ uid:cred.user.uid, name:form.name, email:form.email, role:'customer' });
      go('otp');
    } catch(err) { setError(err.code==='auth/email-already-in-use' ? 'This email is already registered.' : err.message); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      const snap = await getDoc(doc(db,'customers',u.uid));
      if (!snap.exists()) await setDoc(doc(db,'customers',u.uid), { name:u.displayName, email:u.email, role:'customer', createdAt:serverTimestamp() });
      setUser({ uid:u.uid, name:u.displayName, email:u.email, role:'customer' });
      go('customer-dash');
    } catch(err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Create Account" onBack={() => go('role')}/>
      <div style={{ padding:'24px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>Welcome to VilleCabs</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:20 }}>Create your rider account</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <GoogleBtn onClick={handleGoogle} loading={loading}/>
        <Divider/>
        {[['name','Full Name','e.g. Kezia Brown','text'],['phone','Phone Number','+1 (876) 555-0100','tel'],['email','Email Address','you@email.com','email'],['password','Password','At least 6 characters','password']].map(([k,lbl,ph,type]) => (
          <div key={k}><label style={s.lbl}>{lbl}</label><input style={s.inp} type={type} placeholder={ph} value={form[k]} onChange={e => set(k,e.target.value)}/></div>
        ))}
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleEmailSignup} disabled={loading}>{loading?'Creating account...':'Send Confirmation Code'}</button>
        <button style={s.link} onClick={() => go('customer-login')}>Already have an account? Log in</button>
      </div>
    </div>
  );
}

// ── OTP ───────────────────────────────────────────────────────────────────────
function OTPScreen({ go, user }) {
  const [resent, setResent] = useState(false);
  const resend = async () => { if (auth.currentUser) { await sendEmailVerification(auth.currentUser); setResent(true); } };
  return (
    <div style={s.content}>
      <TopBar title="Verify Email" onBack={() => go('customer-signup')}/>
      <div style={{ ...s.center, paddingTop:40 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>📧</div>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>Check your inbox</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:8, textAlign:'center' }}>We sent a verification link to</p>
        <p style={{ color:YELLOW, fontSize:14, fontWeight:500, marginBottom:28 }}>{user?.email||'your email'}</p>
        {resent && <div style={s.successBox}>✅ Verification email resent!</div>}
        <div style={{ width:'100%', maxWidth:320 }}>
          <button style={s.btnY} onClick={() => go('customer-dash')}>I've verified my email →</button>
          <button style={s.btnO} onClick={resend}>Resend verification email</button>
          <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', textAlign:'center', marginTop:8 }}>Check your spam folder if you don't see it</p>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER LOGIN ────────────────────────────────────────────────────────────
function CustomerLogin({ go, setUser }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email||!password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db,'customers',cred.user.uid));
      const data = snap.exists() ? snap.data() : {};
      setUser({ uid:cred.user.uid, name:data.name||cred.user.displayName||'Rider', email:cred.user.email, role:'customer' });
      go('customer-dash');
    } catch(err) { setError(err.code==='auth/invalid-credential'?'Incorrect email or password.':err.message); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      const snap = await getDoc(doc(db,'customers',u.uid));
      if (!snap.exists()) await setDoc(doc(db,'customers',u.uid), { name:u.displayName, email:u.email, role:'customer', createdAt:serverTimestamp() });
      const data = snap.exists() ? snap.data() : {};
      setUser({ uid:u.uid, name:data.name||u.displayName, email:u.email, role:'customer' });
      go('customer-dash');
    } catch(err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Log In" onBack={() => go('customer-signup')}/>
      <div style={{ padding:'32px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>Welcome back</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:20 }}>Log in to book a VilleCabs ride</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <GoogleBtn onClick={handleGoogle} loading={loading}/>
        <Divider/>
        <label style={s.lbl}>Email</label>
        <input style={s.inp} type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)}/>
        <label style={s.lbl}>Password</label>
        <input style={s.inp} type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)}/>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleLogin} disabled={loading}>{loading?'Logging in...':'Log In'}</button>
        <button style={s.link} onClick={() => go('customer-signup')}>Create an account</button>
      </div>
    </div>
  );
}

// ── DRIVER LOGIN ──────────────────────────────────────────────────────────────
function DriverLogin({ go, setUser }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email||!password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db,'drivers',cred.user.uid));
      if (!snap.exists()) { setError('No driver account found. Please apply first.'); setLoading(false); return; }
      const data = snap.data();
      if (data.status==='pending')  { setError('Your application is still pending admin approval.'); setLoading(false); return; }
      if (data.status==='rejected') { setError('Your application was not approved. Contact support.'); setLoading(false); return; }
      setUser({ uid:cred.user.uid, name:data.name, email:cred.user.email, role:'driver' });
      go('driver-dash');
    } catch(err) { setError(err.code==='auth/invalid-credential'?'Incorrect email or password.':err.message); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Login" onBack={() => go('splash')}/>
      <div style={{ padding:'32px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>Welcome back</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:20 }}>Sign in to your VilleCabs driver account</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <label style={s.lbl}>Email</label>
        <input style={s.inp} type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)}/>
        <label style={s.lbl}>Password</label>
        <input style={s.inp} type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)}/>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleLogin} disabled={loading}>{loading?'Logging in...':'Login'}</button>
        <button style={s.link} onClick={() => go('driver-signup')}>New driver? Apply here</button>
      </div>
    </div>
  );
}

// ── DRIVER SIGNUP ─────────────────────────────────────────────────────────────
function DriverSignup({ go }) {
  const [form, setForm] = useState({ name:'',trn:'',dob:'',phone:'',email:'',password:'',make:'',model:'',plate:'' });
  const [docs, setDocs] = useState({ license:false, fitness:false, registration:false });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = async () => {
    setError('');
    if (Object.values(form).some(v => !v)) { setError('Please fill in all fields.'); return; }
    if (!docs.license||!docs.fitness||!docs.registration) { setError('Please upload all 3 documents.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await setDoc(doc(db,'drivers',cred.user.uid), {
        name:form.name, trn:form.trn, dob:form.dob, phone:form.phone, email:form.email,
        vehicleMake:form.make, vehicleModel:form.model, licensePlate:form.plate,
        status:'pending', role:'driver', createdAt:serverTimestamp(),
        docs:{ license:'pending_upload', fitness:'pending_upload', registration:'pending_upload' },
      });
      go('driver-pending');
    } catch(err) { setError(err.code==='auth/email-already-in-use'?'This email is already registered.':err.message); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Registration" onBack={() => go('role')}/>
      <div style={{ padding:'20px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>Drive with VilleCabs</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:16 }}>Fill in your details to apply</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        {[['name','Full Legal Name','As on your ID','text'],['trn','TRN','000-000-000','text'],['dob','Date of Birth','DD/MM/YYYY','text'],['phone','Phone Number','+1 (876) 555-0100','tel'],['email','Email Address','you@email.com','email'],['password','Password','At least 6 characters','password']].map(([k,lbl,ph,type]) => (
          <div key={k}><label style={s.lbl}>{lbl}</label><input style={s.inp} type={type} placeholder={ph} value={form[k]} onChange={e => set(k,e.target.value)}/></div>
        ))}
        <div style={{ height:'0.5px', background:'rgba(255,255,255,0.1)', margin:'8px 0 16px' }}/>
        {[['make','Make of Vehicle','e.g. Toyota'],['model','Model','e.g. Corolla'],['plate','License Plate Number','e.g. PP1234']].map(([k,lbl,ph]) => (
          <div key={k}><label style={s.lbl}>{lbl}</label><input style={s.inp} placeholder={ph} value={form[k]} onChange={e => set(k,e.target.value)}/></div>
        ))}
        <div style={{ height:'0.5px', background:'rgba(255,255,255,0.1)', margin:'8px 0 16px' }}/>
        {[['license',"Driver's License"],['fitness','Vehicle Fitness Certificate'],['registration','Vehicle Registration']].map(([k,lbl]) => (
          <div key={k} onClick={() => setDocs(p => ({ ...p, [k]:!p[k] }))} style={docs[k]?s.uploadOk:s.uploadBox}>
            <div style={{ fontSize:24, marginBottom:6 }}>{docs[k]?'✅':'📄'}</div>
            <div style={{ fontSize:12, color:docs[k]?GREEN:'rgba(255,255,255,0.4)' }}>{docs[k]?`${lbl} uploaded ✓`:`Tap to upload ${lbl}`}</div>
          </div>
        ))}
        <button style={{ ...s.btnY, marginTop:8, opacity:loading?0.7:1 }} onClick={handleSubmit} disabled={loading}>{loading?'Submitting...':'Submit Application'}</button>
      </div>
    </div>
  );
}

// ── DRIVER PENDING ────────────────────────────────────────────────────────────
function DriverPending({ go }) {
  return (
    <div style={s.content}>
      <TopBar title="Application Submitted"/>
      <div style={{ ...s.center, paddingTop:20 }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <div style={{ background:'rgba(232,180,0,0.1)', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:16, padding:24, textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>
            <div style={{ fontSize:17, fontWeight:500, marginBottom:8 }}>Pending Admin Approval</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.6 }}>Our team in Manchester will review your documents and activate your account within 24–48 hours.</div>
          </div>
          <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:16, marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:500, marginBottom:10 }}>What happens next?</div>
            {['Admin reviews your documents','Background check completed','Account activated via SMS','Start accepting rides in Manchester'].map((t,i) => (
              <div key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:8, display:'flex', gap:8 }}>
                <span style={{ color:YELLOW }}>0{i+1}</span>{t}
              </div>
            ))}
          </div>
          <button style={s.btnO} onClick={() => go('splash')}>Back to Home</button>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER DASHBOARD ────────────────────────────────────────────────────────
function CustomerDash({ go, user, setUser }) {
  const [pickup,  setPickup]  = useState('Manchester, Jamaica');
  const [dropoff, setDropoff] = useState('');
  const handleLogout = async () => { await signOut(auth); setUser(null); go('splash'); };

  return (
    <div style={{ ...s.content, background:'#0f1923', minHeight:'100vh' }}>
      <div style={{ background:DARK, padding:'16px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:13 }}>Good day,</div>
            <div style={{ color:WHITE, fontSize:20, fontWeight:500 }}>{user?.name?.split(' ')[0]||'Rider'} 👋</div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Balance:</span>
              <span style={{ background:YELLOW, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:500, color:DARK }}>J$1,200</span>
            </div>
          </div>
          <button onClick={handleLogout} style={{ background:'none', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:8, color:'rgba(255,255,255,0.5)', fontSize:11, padding:'6px 12px', cursor:'pointer' }}>Logout</button>
        </div>
      </div>
      <div style={{ height:200, background:'#1a2744', position:'relative', overflow:'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="200" fill="#1a2744"/>
          <line x1="0" y1="100" x2="400" y2="100" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="200" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="0" y1="60" x2="400" y2="140" stroke="rgba(255,255,255,0.07)" strokeWidth="2"/>
          <circle cx="130" cy="80" r="8" fill={GREEN} opacity="0.9"/>
          <circle cx="130" cy="80" r="4" fill={WHITE}/>
          <circle cx="270" cy="120" r="8" fill={YELLOW} opacity="0.9"/>
          <circle cx="270" cy="120" r="4" fill={DARK}/>
        </svg>
        <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', background:'rgba(26,26,46,0.85)', borderRadius:20, padding:'3px 12px', fontSize:11, color:YELLOW, fontWeight:500, whiteSpace:'nowrap' }}>📍 Manchester, Jamaica</div>
        <button onClick={() => go('pin-pickup')} style={{ position:'absolute', right:10, bottom:10, background:YELLOW, border:'none', borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:500, color:DARK, cursor:'pointer' }}>📌 Pin location</button>
      </div>
      <div style={{ padding:16 }}>
        <div onClick={() => go('pin-pickup')} style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:12, marginBottom:10, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:GREEN, flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:WHITE }}>Pickup location</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{pickup}</div>
          </div>
          <span style={{ color:'rgba(255,255,255,0.3)' }}>›</span>
        </div>
        <div onClick={() => go('pin-dropoff')} style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:12, marginBottom:16, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:YELLOW, flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:WHITE }}>Drop-off location</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{dropoff||'Where are you going?'}</div>
          </div>
          <span style={{ color:'rgba(255,255,255,0.3)' }}>›</span>
        </div>
        <button style={s.btnY} onClick={() => go('vehicle-select')}>Find a Ride</button>
      </div>
    </div>
  );
}

// ── PIN PICKUP ────────────────────────────────────────────────────────────────
function PinPickup({ go }) {
  const [address, setAddress] = useState('Caledonia Rd, Mandeville, Manchester');
  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Pin Pickup Location" onBack={() => go('customer-dash')}/>
      <div style={{ height:280, background:'#1a2744', position:'relative', overflow:'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="280" fill="#1a2744"/>
          <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="0" y1="160" x2="400" y2="160" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="100" y1="0" x2="100" y2="280" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="220" y1="0" x2="220" y2="280" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <text x="55" y="76" fill="rgba(255,255,255,0.3)" fontSize="10">Caledonia Rd</text>
          <text x="228" y="146" fill="rgba(255,255,255,0.3)" fontSize="10">Ward Ave</text>
        </svg>
        <div style={{ position:'absolute', left:'50%', top:'44%', transform:'translate(-50%,-100%)', display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:36, height:36, borderRadius:'50% 50% 50% 0', transform:'rotate(-45deg)', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ transform:'rotate(45deg)', fontSize:16 }}>📍</span>
          </div>
          <div style={{ width:2, height:14, background:'rgba(0,0,0,0.4)' }}/>
        </div>
        <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', background:'rgba(26,26,46,0.85)', borderRadius:20, padding:'3px 12px', fontSize:10, color:YELLOW, whiteSpace:'nowrap' }}>📍 Manchester, Jamaica</div>
        <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.6)', color:WHITE, fontSize:11, padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap' }}>Drag map to move pin</div>
      </div>
      <div style={{ padding:16 }}>
        <label style={s.lbl}>Pinned address</label>
        <input style={s.inp} value={address} onChange={e => setAddress(e.target.value)}/>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:16 }}>ℹ️ You can also type an address to search</p>
        <button style={s.btnY} onClick={() => go('pin-dropoff')}>Confirm Pickup</button>
      </div>
    </div>
  );
}

// ── PIN DROPOFF ───────────────────────────────────────────────────────────────
function PinDropoff({ go }) {
  const suggestions = ['Manchester Market, Mandeville','Spaldings, Manchester','Christiana, Manchester','Porus, Manchester'];
  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Pin Drop-off Location" onBack={() => go('customer-dash')}/>
      <div style={{ height:220, background:'#1a2744', position:'relative', overflow:'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="220" fill="#1a2744"/>
          <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="0" y1="150" x2="400" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="130" y1="0" x2="130" y2="220" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="260" y1="0" x2="260" y2="220" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
        </svg>
        <div style={{ position:'absolute', left:'62%', top:'40%', transform:'translate(-50%,-100%)', display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:36, height:36, borderRadius:'50% 50% 50% 0', transform:'rotate(-45deg)', background:YELLOW, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ transform:'rotate(45deg)', fontSize:16 }}>🏁</span>
          </div>
          <div style={{ width:2, height:14, background:'rgba(0,0,0,0.3)' }}/>
        </div>
        <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.6)', color:WHITE, fontSize:11, padding:'3px 12px', borderRadius:20, whiteSpace:'nowrap' }}>Drag map to set drop-off</div>
      </div>
      <div style={{ padding:16 }}>
        <input style={s.inp} placeholder="🔍 Search drop-off address..."/>
        <div style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
          {suggestions.map((sug,i) => (
            <div key={i} onClick={() => go('vehicle-select')} style={{ padding:'11px 14px', fontSize:13, color:'rgba(255,255,255,0.8)', borderBottom:i<suggestions.length-1?'0.5px solid rgba(255,255,255,0.08)':'none', cursor:'pointer' }}>
              📍 {sug}
            </div>
          ))}
        </div>
        <button style={s.btnY} onClick={() => go('vehicle-select')}>Confirm Drop-off</button>
      </div>
    </div>
  );
}

// ── VEHICLE SELECT ────────────────────────────────────────────────────────────
function VehicleSelect({ go, user, setBookingId }) {
  const [sel, setSel]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const vehicles = [
    { name:'VilleRide', eta:'4 min away',    price:750,  base:300, rate:55, icon:'🚗' },
    { name:'VilleXL',   eta:'7 min · up to 6', price:1200, base:400, rate:98, icon:'🚙' },
    { name:'VilleMoto', eta:'2 min away',    price:500,  base:200, rate:37, icon:'🏍️' },
  ];
  const v = vehicles[sel];

  const handleBook = async () => {
    setLoading(true); setError('');
    try {
      const ref = await addDoc(collection(db,'bookings'), {
        customerId:   user.uid,
        customerName: user.name,
        pickup:       { address:'Caledonia Rd, Mandeville', lat:18.0416, lng:-77.5036 },
        dropoff:      { address:'Christiana, Manchester',   lat:18.0200, lng:-77.4800 },
        vehicleType:  v.name,
        fare:         v.price,
        distanceKm:   8.2,
        status:       'searching',
        createdAt:    serverTimestamp(),
      });
      setBookingId(ref.id);
      go('booking-confirm');
    } catch(err) { setError('Failed to create booking. Please try again.'); }
    setLoading(false);
  };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Choose Ride" onBack={() => go('customer-dash')}/>
      <div style={{ height:140, background:'#1a2744', position:'relative', overflow:'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="140" fill="#1a2744"/>
          <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="140" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <circle cx="110" cy="50" r="7" fill={GREEN} opacity="0.9"/>
          <circle cx="290" cy="90" r="7" fill={YELLOW} opacity="0.9"/>
          <line x1="117" y1="53" x2="283" y2="87" stroke={YELLOW} strokeWidth="2" opacity="0.4" strokeDasharray="6,4"/>
        </svg>
      </div>
      <div style={{ padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:10 }}>
          <span>Caledonia Rd → Christiana</span><span>~8.2 km</span>
        </div>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        {vehicles.map((veh,i) => (
          <div key={i} onClick={() => setSel(i)} style={{ border:`${i===sel?'2px solid '+YELLOW:'0.5px solid rgba(255,255,255,0.12)'}`, borderRadius:12, padding:'11px 13px', marginBottom:8, display:'flex', alignItems:'center', gap:10, cursor:'pointer', background:i===sel?'rgba(232,180,0,0.08)':'rgba(255,255,255,0.04)' }}>
            <div style={{ width:44, height:44, borderRadius:10, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{veh.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>{veh.name}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{veh.eta}</div>
            </div>
            <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>J${veh.price.toLocaleString()}</div>
          </div>
        ))}
        <div style={{ background:DARK, borderRadius:12, padding:14, margin:'10px 0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}><span>Base fare</span><span>J${v.base}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}><span>Distance (8.2 km × J${v.rate})</span><span>J${Math.round(8.2*v.rate)}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}><span>Service fee</span><span>J$0</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:500, color:YELLOW, borderTop:'0.5px solid rgba(255,255,255,0.12)', paddingTop:8, marginTop:4 }}><span>Total</span><span>J${v.price.toLocaleString()}</span></div>
        </div>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleBook} disabled={loading}>
          {loading?'Creating booking...`:`Book Ride — J$${v.price.toLocaleString()}`}
        </button>
      </div>
    </div>
  );
}

// ── BOOKING CONFIRM ───────────────────────────────────────────────────────────
function BookingConfirm({ go, bookingId }) {
  const [booking, setBooking] = useState(null);
  const [payment, setPayment] = useState('cash');

  useEffect(() => {
    if (!bookingId) return;
    const unsub = onSnapshot(doc(db,'bookings',bookingId), snap => {
      if (snap.exists()) setBooking({ id:snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [bookingId]);

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Confirm Booking" onBack={() => go('vehicle-select')}/>
      <div style={{ padding:16 }}>
        {booking && (
          <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:16, marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:DARK, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🚗</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>{booking.vehicleType}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Booking #{bookingId?.slice(-6).toUpperCase()}</div>
              </div>
              <div style={{ fontSize:16, fontWeight:500, color:GREEN }}>J${booking.fare?.toLocaleString()}</div>
            </div>
            <div style={{ borderTop:'0.5px solid rgba(255,255,255,0.1)', paddingTop:12 }}>
              <div style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:GREEN, marginTop:3, flexShrink:0 }}/>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>{booking.pickup?.address}</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:YELLOW, marginTop:3, flexShrink:0 }}/>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>{booking.dropoff?.address}</div>
              </div>
            </div>
            <div style={{ marginTop:12, padding:'8px 12px', background:'rgba(26,158,90,0.1)', borderRadius:8, fontSize:12, color:'#9fe1cb' }}>
              ✅ Booking saved — drivers are being notified
            </div>
          </div>
        )}
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Payment method</div>
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          {['cash','card'].map(p => (
            <div key={p} onClick={() => setPayment(p)} style={{ flex:1, border:payment===p?`1.5px solid ${YELLOW}`:'0.5px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 12px', textAlign:'center', cursor:'pointer', background:payment===p?'rgba(232,180,0,0.1)':'transparent', color:payment===p?YELLOW:'rgba(255,255,255,0.5)', fontSize:13, fontWeight:payment===p?500:400 }}>
              {p==='cash'?'💵':'💳'} {p}
            </div>
          ))}
        </div>
        <button style={s.btnY} onClick={() => go('live-ride')}>Go to Live Tracking</button>
        <button style={s.btnO} onClick={() => go('customer-dash')}>Cancel</button>
      </div>
    </div>
  );
}

// ── LIVE RIDE ─────────────────────────────────────────────────────────────────
function LiveRide({ go, bookingId }) {
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    if (!bookingId) return;
    const unsub = onSnapshot(doc(db,'bookings',bookingId), snap => {
      if (snap.exists()) setBooking({ id:snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [bookingId]);

  const statusLabel = booking?.status === 'active' ? '🟢 Driver on the way' : booking?.status === 'completed' ? '✅ Ride completed' : '🔍 Finding your driver...';

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <div style={{ height:220, background:'#1a2744', position:'relative', overflow:'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="220" fill="#1a2744"/>
          <line x1="0" y1="110" x2="400" y2="110" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="220" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <circle cx="110" cy="70" r="8" fill={GREEN} opacity="0.9"/>
          <circle cx="110" cy="70" r="4" fill={WHITE}/>
          <circle cx="280" cy="130" r="8" fill={YELLOW} opacity="0.9"/>
          <circle cx="280" cy="130" r="4" fill={DARK}/>
          <circle cx="160" cy="95" r="7" fill={DARK} stroke={YELLOW} strokeWidth="2"/>
        </svg>
        <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', background:'rgba(26,26,46,0.9)', borderRadius:20, padding:'5px 16px', fontSize:12, color:YELLOW, whiteSpace:'nowrap', fontWeight:500 }}>
          {statusLabel}
        </div>
      </div>
      <div style={{ padding:14 }}>
        {booking?.driverId ? (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:12, marginBottom:12 }}>
            <div style={{ width:42, height:42, borderRadius:'50%', background:DARK, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>👤</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>Driver assigned</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>On the way to your location</div>
              <div style={{ fontSize:11, color:YELLOW }}>★ 4.8</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:16 }}>📞</div>
            </div>
          </div>
        ) : (
          <div style={{ background:'rgba(232,180,0,0.08)', border:'1px solid rgba(232,180,0,0.3)', borderRadius:12, padding:14, marginBottom:12, textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:6 }}>🔍</div>
            <div style={{ fontSize:14, fontWeight:500, color:YELLOW }}>Finding your driver...</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:4 }}>Drivers in Manchester are being notified</div>
          </div>
        )}
        <div style={{ display:'flex', gap:10, marginBottom:14 }}>
          <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:10, padding:10, textAlign:'center' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Status</div>
            <div style={{ fontSize:14, fontWeight:500, color:WHITE, textTransform:'capitalize' }}>{booking?.status||'searching'}</div>
          </div>
          <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:10, padding:10, textAlign:'center' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Fare</div>
            <div style={{ fontSize:14, fontWeight:500, color:GREEN }}>J${booking?.fare?.toLocaleString()||'--'}</div>
          </div>
        </div>
        <button style={s.btnO} onClick={() => go('customer-dash')}>Back to Dashboard</button>
      </div>
    </div>
  );
}

// ── DRIVER DASHBOARD (REAL-TIME BOOKINGS) ─────────────────────────────────────
function DriverDash({ go, user, setUser }) {
  const [rides, setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const handleLogout = async () => { await signOut(auth); setUser(null); go('splash'); };

  useEffect(() => {
    const q = query(collection(db,'bookings'), where('status','==','searching'), orderBy('createdAt','desc'));
    const unsub = onSnapshot(q, snap => {
      setRides(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const acceptRide = async (rideId) => {
    try {
      await updateDoc(doc(db,'bookings',rideId), {
        driverId:   user.uid,
        driverName: user.name,
        status:     'active',
        acceptedAt: serverTimestamp(),
      });
      go('driver-active');
    } catch(err) { console.error(err); }
  };

  return (
    <div style={{ ...s.content, background:'#0f1923', minHeight:'100vh' }}>
      <div style={{ background:DARK, padding:'14px 18px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>Online as driver</div>
            <div style={{ color:WHITE, fontSize:18, fontWeight:500 }}>{user?.name||'Driver'}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ background:GREEN, borderRadius:20, padding:'5px 14px', fontSize:12, color:WHITE, fontWeight:500 }}>● Online</div>
            <button onClick={handleLogout} style={{ background:'none', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:8, color:'rgba(255,255,255,0.5)', fontSize:11, padding:'6px 10px', cursor:'pointer' }}>Out</button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Today's earnings:</span>
          <span style={{ background:YELLOW, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:500, color:DARK }}>J$3,450</span>
        </div>
      </div>
      <div style={{ padding:14 }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>Loading rides...</div>
        ) : rides.length === 0 ? (
          <div style={{ textAlign:'center', padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🚕</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:14 }}>No ride requests right now</div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginTop:6 }}>New bookings will appear here instantly</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:12 }}>{rides.length} ride request{rides.length!==1?'s':''} near you in Manchester</div>
            {rides.map(r => (
              <div key={r.id} style={{ border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, marginBottom:10, background:'rgba(255,255,255,0.03)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:14, fontWeight:500, color:WHITE }}>👤 {r.customerName}</span>
                  <span style={{ fontSize:16, fontWeight:500, color:GREEN }}>J${r.fare?.toLocaleString()}</span>
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>📍 {r.pickup?.address}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:6 }}>🏁 {r.dropoff?.address}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:10 }}>🚗 {r.vehicleType} · {r.distanceKm} km · Cash</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => acceptRide(r.id)} style={{ flex:1, background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:10, fontSize:13, fontWeight:500, cursor:'pointer' }}>✓ Accept</button>
                  <button style={{ flex:1, background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.5)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:8, padding:10, fontSize:13, cursor:'pointer' }}>Decline</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── DRIVER ACTIVE ─────────────────────────────────────────────────────────────
function DriverActive({ go, user }) {
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','active'));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) setBooking({ id:snap.docs[0].id, ...snap.docs[0].data() });
    });
    return () => unsub();
  }, [user]);

  const completeRide = async () => {
    if (!booking?.id) return;
    await updateDoc(doc(db,'bookings',booking.id), { status:'completed', completedAt:serverTimestamp() });
    go('driver-dash');
  };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Active Ride" onBack={() => go('driver-dash')}/>
      <div style={{ height:180, background:'#1a2744', position:'relative', overflow:'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="180" fill="#1a2744"/>
          <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="180" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <circle cx="130" cy="60" r="8" fill={GREEN} opacity="0.9"/>
          <circle cx="280" cy="110" r="8" fill={YELLOW} opacity="0.9"/>
          <circle cx="160" cy="75" r="7" fill={DARK} stroke={YELLOW} strokeWidth="2"/>
        </svg>
      </div>
      <div style={{ padding:14 }}>
        {booking ? (
          <>
            <div style={{ background:'rgba(232,180,0,0.1)', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, color:YELLOW, marginBottom:8 }}>Pick up passenger</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:GREEN }}/>
                <div style={{ fontSize:13, color:WHITE }}>{booking.pickup?.address}</div>
              </div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, color:WHITE, marginBottom:8 }}>Passenger</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:DARK, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>{booking.customerName}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Verified rider</div>
                </div>
                <div style={{ width:32, height:32, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:15 }}>📞</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', background:'rgba(255,255,255,0.05)', borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:YELLOW }}/>
              <div style={{ fontSize:13, color:WHITE, flex:1 }}>{booking.dropoff?.address}</div>
              <div style={{ fontSize:14, fontWeight:500, color:GREEN }}>J${booking.fare?.toLocaleString()}</div>
            </div>
            <button style={s.btnG} onClick={completeRide}>Complete Ride ✓</button>
          </>
        ) : (
          <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>Loading ride details...</div>
        )}
      </div>
    </div>
  );
}

// ── LOADING ───────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ ...s.screen, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
      <div style={{ fontSize:48 }}>🚕</div>
      <div style={{ color:YELLOW, fontSize:16, fontWeight:500 }}>VilleCabs</div>
      <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13 }}>Loading...</div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
const MAP_BG = new Set(['splash','role','customer-signup','customer-login','otp','driver-signup','driver-pending','driver-login']);

export default function App() {
  const [screen,    setScreen]    = useState('splash');
  const [user,      setUser]      = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (fu) {
        const cSnap = await getDoc(doc(db,'customers',fu.uid));
        const dSnap = await getDoc(doc(db,'drivers',fu.uid));
        if (cSnap.exists()) {
          const d = cSnap.data();
          setUser({ uid:fu.uid, name:d.name||fu.displayName, email:fu.email, role:'customer' });
          setScreen('customer-dash');
        } else if (dSnap.exists()) {
          const d = dSnap.data();
          if (d.status==='approved') {
            setUser({ uid:fu.uid, name:d.name, email:fu.email, role:'driver' });
            setScreen('driver-dash');
          } else { setScreen('driver-pending'); }
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <LoadingScreen/>;

  const props = { go:setScreen, user, setUser, bookingId, setBookingId };
  const screens = {
    splash:           <Splash {...props}/>,
    role:             <RoleSelect {...props}/>,
    'customer-signup':<CustomerSignup {...props}/>,
    'customer-login': <CustomerLogin {...props}/>,
    otp:              <OTPScreen {...props}/>,
    'customer-dash':  <CustomerDash {...props}/>,
    'pin-pickup':     <PinPickup {...props}/>,
    'pin-dropoff':    <PinDropoff {...props}/>,
    'vehicle-select': <VehicleSelect {...props}/>,
    'booking-confirm':<BookingConfirm {...props}/>,
    'live-ride':      <LiveRide {...props}/>,
    'driver-signup':  <DriverSignup {...props}/>,
    'driver-pending': <DriverPending {...props}/>,
    'driver-login':   <DriverLogin {...props}/>,
    'driver-dash':    <DriverDash {...props}/>,
    'driver-active':  <DriverActive {...props}/>,
  };

  return (
    <div style={s.screen}>
      {MAP_BG.has(screen) && <MapBg/>}
      {screens[screen]||<Splash {...props}/>}
    </div>
  );
}