import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendEmailVerification,
  onAuthStateChanged, signOut
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, addDoc, collection,
  onSnapshot, updateDoc, query, where, orderBy, serverTimestamp, getDocs
} from 'firebase/firestore';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
const messaging     = getMessaging(app);
const functions_     = getFunctions(app);
const createPaymentIntentFn   = httpsCallable(functions_, 'createPaymentIntent');
const updateDriverLocationFn  = httpsCallable(functions_, 'updateDriverLocation');
const YELLOW = '#e8b400';
const DARK   = '#1a1a2e';
const GREEN  = '#1a9e5a';
const WHITE  = '#ffffff';

// Manchester, Jamaica centre
const MANCHESTER_CENTER = { lat: 18.0416, lng: -77.5036 };
const LIBRARIES = ['places'];

// Dark map style matching VilleCabs theme
const MAP_STYLE = [
  { elementType:'geometry', stylers:[{ color:'#1a2744' }] },
  { elementType:'labels.text.fill', stylers:[{ color:'#8ec3b9' }] },
  { elementType:'labels.text.stroke', stylers:[{ color:'#1a3646' }] },
  { featureType:'road', elementType:'geometry', stylers:[{ color:'#304a7d' }] },
  { featureType:'road', elementType:'geometry.stroke', stylers:[{ color:'#255763' }] },
  { featureType:'road.highway', elementType:'geometry', stylers:[{ color:'#e8b400' }] },
  { featureType:'road.highway', elementType:'geometry.stroke', stylers:[{ color:'#1f2835' }] },
  { featureType:'road.highway', elementType:'labels.text.fill', stylers:[{ color:'#f3d19c' }] },
  { featureType:'water', elementType:'geometry', stylers:[{ color:'#0e1626' }] },
  { featureType:'water', elementType:'labels.text.fill', stylers:[{ color:'#515c6d' }] },
  { featureType:'poi', elementType:'geometry', stylers:[{ color:'#1a3a2a' }] },
  { featureType:'poi.park', elementType:'geometry', stylers:[{ color:'#1a4a2e' }] },
  { featureType:'transit', elementType:'geometry', stylers:[{ color:'#2f3948' }] },
  { featureType:'administrative', elementType:'geometry', stylers:[{ color:'#2a3a5a' }] },
  { featureType:'administrative.country', elementType:'labels.text.fill', stylers:[{ color:'#9d9d9d' }] },
  { featureType:'administrative.locality', elementType:'labels.text.fill', stylers:[{ color:'#e8b400' }] },
];

const s = {
  screen:    { minHeight:'100vh', fontFamily:"'Segoe UI', sans-serif", background:DARK, color:WHITE },
  mapBg:     { position:'fixed', inset:0, zIndex:0, background:DARK },
  overlay:   { position:'fixed', inset:0, zIndex:1, background:'rgba(15,25,50,0.72)', backdropFilter:'blur(4px)' },
  content:   { position:'relative', zIndex:2, minHeight:'100vh' },
  center:    { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'0 24px' },
  card:      { background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:20, padding:'28px 24px', width:'100%', maxWidth:380 },
  btnY:      { width:'100%', padding:'14px 20px', background:YELLOW, color:DARK, border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10 },
  btnO:      { width:'100%', padding:'14px 20px', background:'transparent', color:WHITE, border:'1.5px solid rgba(255,255,255,0.35)', borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer', marginBottom:10 },
  btnG:      { width:'100%', padding:'14px 20px', background:GREEN, color:WHITE, border:'none', borderRadius:12, fontSize:15, fontWeight:600, cursor:'pointer', marginBottom:10 },
  inp:       { width:'100%', padding:'12px 14px', background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:10, color:WHITE, fontSize:14, marginBottom:12, boxSizing:'border-box', outline:'none' },
  lbl:       { fontSize:11, color:'rgba(255,255,255,0.55)', marginBottom:4, display:'block', fontWeight:500 },
  topBar:    { background:'rgba(26,26,46,0.97)', padding:'12px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:'0.5px solid rgba(255,255,255,0.1)', position:'sticky', top:0, zIndex:10 },
  backBtn:   { background:'none', border:'none', color:YELLOW, fontSize:22, cursor:'pointer', padding:'2px 6px' },
  topTitle:  { color:WHITE, fontSize:16, fontWeight:500 },
  link:      { color:YELLOW, fontSize:13, cursor:'pointer', textAlign:'center', marginTop:8, background:'none', border:'none', width:'100%', display:'block', padding:4 },
  divLine:   { display:'flex', alignItems:'center', gap:10, margin:'8px 0 14px', color:'rgba(255,255,255,0.3)', fontSize:12 },
  errBox:    { background:'rgba(226,75,74,0.15)', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#f09595' },
  successBox:{ background:'rgba(26,158,90,0.15)', border:'0.5px solid rgba(26,158,90,0.4)', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#9fe1cb' },
  uploadBox: { border:'1.5px dashed rgba(255,255,255,0.25)', borderRadius:10, padding:14, textAlign:'center', cursor:'pointer', marginBottom:12, background:'rgba(255,255,255,0.04)' },
  uploadOk:  { border:'1.5px dashed #1a9e5a', borderRadius:10, padding:14, textAlign:'center', cursor:'pointer', marginBottom:12, background:'rgba(26,158,90,0.1)' },
};

// ── SVG fallback map (for auth screens) ──────────────────────────────────────
function MapBg() {
  return (
    <>
      <div style={s.mapBg}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{ position:'absolute', inset:0 }}>
          <rect width="800" height="600" fill="#1e3a5f"/>
          <ellipse cx="200" cy="150" rx="180" ry="120" fill="#1a4a2e" opacity="0.6"/>
          <ellipse cx="600" cy="100" rx="220" ry="140" fill="#1a4a2e" opacity="0.5"/>
          <ellipse cx="400" cy="400" rx="250" ry="150" fill="#1a4a2e" opacity="0.4"/>
          <line x1="0" y1="300" x2="800" y2="300" stroke={YELLOW} strokeWidth="4" opacity="0.35"/>
          <line x1="400" y1="0" x2="400" y2="600" stroke={YELLOW} strokeWidth="4" opacity="0.35"/>
          <line x1="0" y1="150" x2="800" y2="450" stroke={YELLOW} strokeWidth="2.5" opacity="0.2"/>
          <circle cx="375" cy="285" r="10" fill={YELLOW} opacity="0.9"/>
          <circle cx="375" cy="285" r="5" fill={DARK}/>
          <text x="370" y="316" textAnchor="middle" fill={YELLOW} fontSize="11" opacity="0.7" fontWeight="bold">Mandeville</text>
        </svg>
      </div>
      <div style={s.overlay}/>
    </>
  );
}

// ── Google Map component ──────────────────────────────────────────────────────
function VilleMap({ height = 260, center = MANCHESTER_CENTER, zoom = 14, onClick, markers = [], directions = null, children }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  if (!isLoaded) return (
    <div style={{ height, background:'#1a2744', display:'flex', alignItems:'center', justifyContent:'center', color:YELLOW, fontSize:13 }}>
      Loading map...
    </div>
  );

  return (
    <GoogleMap
      mapContainerStyle={{ width:'100%', height }}
      center={center}
      zoom={zoom}
      onClick={onClick}
      options={{ styles:MAP_STYLE, disableDefaultUI:true, zoomControl:true }}
    >
      {markers.map((m, i) => (
        <Marker key={i} position={m.position} label={m.label} title={m.title}/>
      ))}
      {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers:false }}/>}
      {children}
    </GoogleMap>
  );
}

// ── Geocode helper ────────────────────────────────────────────────────────────
function geocodeLatLng(lat, lng) {
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location:{ lat, lng } }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        // Try to find result with a street/road name
        const withStreet = results.find(r => {
          const c = r.address_components || [];
          return c.some(x => x.types.includes('route') || x.types.includes('street_address'));
        });
        const best = withStreet || results.find(r => !r.formatted_address.includes('+')) || results[0];
        const components = best.address_components || [];
        const streetNumber = components.find(c => c.types.includes('street_number'))?.long_name || '';
        const street       = components.find(c => c.types.includes('route'))?.long_name || '';
        const neighborhood = components.find(c => c.types.includes('neighborhood') || c.types.includes('sublocality_level_1'))?.long_name || '';
        const locality     = components.find(c => c.types.includes('locality') || c.types.includes('postal_town'))?.long_name || '';
        const parish       = components.find(c => c.types.includes('administrative_area_level_1'))?.long_name || '';
        // Build address prioritizing street name
        let address = '';
        if (street) {
          address = streetNumber ? `${streetNumber} ${street}` : street;
          if (locality) address += `, ${locality}`;
          else if (neighborhood) address += `, ${neighborhood}`;
          if (parish && parish !== locality) address += `, ${parish}`;
        } else if (neighborhood) {
          address = locality ? `${neighborhood}, ${locality}` : neighborhood;
          if (parish) address += `, ${parish}`;
        } else if (locality) {
          address = parish ? `${locality}, ${parish}` : locality;
        } else {
          // fallback — clean up plus codes from the formatted address
          address = best.formatted_address.replace(/^[A-Z0-9+]+\s/, '').trim();
        }
        resolve(address || best.formatted_address);
      } else {
        resolve(`Near ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    });
  });
}

function getDirections(origin, destination) {
  return new Promise((resolve) => {
    const service = new window.google.maps.DirectionsService();
    service.route({ origin, destination, travelMode: window.google.maps.TravelMode.DRIVING }, (result, status) => {
      if (status === 'OK') resolve(result);
      else resolve(null);
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
      <div style={{ flex:1, height:'0.5px', background:'rgba(255,255,255,0.15)' }}/><span>or</span>
      <div style={{ flex:1, height:'0.5px', background:'rgba(255,255,255,0.15)' }}/>
    </div>
  );
}
function GoogleBtn({ onClick, loading }) {
  return (
    <button style={{ ...s.btnO, display:'flex', alignItems:'center', justifyContent:'center', gap:10, opacity:loading?0.7:1 }} onClick={onClick} disabled={loading}>
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
  const [form, setForm]       = useState({ name:'', phone:'', email:'', password:'' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleEmail = async () => {
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
    } catch(err) { setError(err.code==='auth/email-already-in-use'?'Email already registered.':err.message); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const r = await signInWithPopup(auth, googleProvider);
      const snap = await getDoc(doc(db,'customers',r.user.uid));
      if (!snap.exists()) await setDoc(doc(db,'customers',r.user.uid), { name:r.user.displayName, email:r.user.email, role:'customer', createdAt:serverTimestamp() });
      setUser({ uid:r.user.uid, name:r.user.displayName, email:r.user.email, role:'customer' });
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
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleEmail} disabled={loading}>{loading?'Creating account...':'Send Confirmation Code'}</button>
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
    } catch(err) { setError('Incorrect email or password.'); }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try {
      const r = await signInWithPopup(auth, googleProvider);
      const snap = await getDoc(doc(db,'customers',r.user.uid));
      if (!snap.exists()) await setDoc(doc(db,'customers',r.user.uid), { name:r.user.displayName, email:r.user.email, role:'customer', createdAt:serverTimestamp() });
      const data = snap.exists() ? snap.data() : {};
      setUser({ uid:r.user.uid, name:data.name||r.user.displayName, email:r.user.email, role:'customer' });
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
    } catch(err) { setError('Incorrect email or password.'); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Login" onBack={() => go('splash')}/>
      <div style={{ padding:'32px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>Welcome back</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:20 }}>Sign in to your driver account</p>
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
  const [form, setForm]       = useState({ name:'',trn:'',dob:'',phone:'',email:'',password:'',make:'',model:'',plate:'' });
  const [docs, setDocs]       = useState({ license:false, fitness:false, registration:false });
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
    } catch(err) { setError(err.code==='auth/email-already-in-use'?'Email already registered.':err.message); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Registration" onBack={() => go('role')}/>
      <div style={{ padding:'20px', maxWidth:420, margin:'0 auto' }}>
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
  const [tab,      setTab]      = useState('book');
  const [history,  setHistory]  = useState([]);
  const [loadingH, setLoadingH] = useState(true);
  const handleLogout = async () => { await signOut(auth); setUser(null); go('splash'); };

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db,'bookings'),
      where('customerId','==',user.uid),
      where('status','==','completed')
    );
    const unsub = onSnapshot(q, snap => {
      const rides = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      rides.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      setHistory(rides);
      setLoadingH(false);
    }, () => setLoadingH(false));
    return () => unsub();
  }, [user]);

  const totalSpent = history.reduce((s,r) => s+(r.fare||0), 0);

  const TabBar = () => (
    <div style={{ display:'flex', background:'#1a1a2e', borderTop:'0.5px solid rgba(255,255,255,0.08)', position:'sticky', bottom:0, zIndex:10 }}>
      {[['book','🚕','Book'],['history','📋','History'],['profile','👤','Profile'],['settings','⚙️','Settings']].map(([t,icon,label]) => (
        <div key={t} onClick={() => t==='profile'?go('customer-profile'):t==='settings'?go('customer-settings'):setTab(t)}
          style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:10, cursor:'pointer',
            color:tab===t?YELLOW:'rgba(255,255,255,0.45)',
            borderTop:tab===t?`2px solid ${YELLOW}`:'2px solid transparent' }}>
          <div style={{ fontSize:20, marginBottom:2 }}>{icon}</div>{label}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ ...s.content, background:'#0f1923', minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background:DARK, padding:'14px 18px', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>Good day,</div>
            <div style={{ color:WHITE, fontSize:18, fontWeight:500 }}>{user?.name?.split(' ')[0]||'Rider'} 👋</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ background:YELLOW, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:500, color:DARK }}>{history.length} rides</span>
          </div>
        </div>
      </div>

      {/* BOOK TAB */}
      {tab === 'book' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
          <VilleMap height={210} center={MANCHESTER_CENTER} zoom={13}>
            <Marker position={MANCHESTER_CENTER} title="Manchester, Jamaica"/>
          </VilleMap>
          <div style={{ padding:16 }}>
            <div onClick={() => go('pin-pickup')} style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:12, marginBottom:10, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:GREEN, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:WHITE }}>Pickup location</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>Manchester, Jamaica (tap to pin)</div>
              </div>
              <span style={{ color:'rgba(255,255,255,0.3)' }}>›</span>
            </div>
            <div onClick={() => go('pin-dropoff')} style={{ background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:12, padding:12, marginBottom:16, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:YELLOW, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:WHITE }}>Drop-off location</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>Where are you going?</div>
              </div>
              <span style={{ color:'rgba(255,255,255,0.3)' }}>›</span>
            </div>
            <button style={s.btnY} onClick={() => go('vehicle-select')}>Find a Ride</button>
          </div>
          <TabBar/>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
          <div style={{ flex:1, overflowY:'auto', padding:16 }}>
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

            {loadingH ? (
              <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>
                <div style={{ fontSize:32, marginBottom:10 }}>⏳</div>Loading rides...
              </div>
            ) : history.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🚕</div>
                <div style={{ fontSize:15, marginBottom:6 }}>No rides yet</div>
                <div style={{ fontSize:13 }}>Your completed rides will appear here</div>
                <button style={{ ...s.btnY, marginTop:20 }} onClick={() => setTab('book')}>Book your first ride</button>
              </div>
            ) : history.map((ride,i) => {
              const date = ride.completedAt?.seconds
                ? new Date(ride.completedAt.seconds*1000).toLocaleDateString('en-JM',{day:'numeric',month:'short',year:'numeric'})
                : ride.createdAt?.seconds
                ? new Date(ride.createdAt.seconds*1000).toLocaleDateString('en-JM',{day:'numeric',month:'short',year:'numeric'})
                : '--';
              const time = ride.completedAt?.seconds
                ? new Date(ride.completedAt.seconds*1000).toLocaleTimeString('en-JM',{hour:'2-digit',minute:'2-digit'}) : '';
              const from = (ride.pickup?.address||'--').split(',')[0];
              const to   = (ride.dropoff?.address||'--').split(',')[0];
              return (
                <div key={ride.id} style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:14, marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>{date}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{time}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16, fontWeight:500, color:GREEN }}>J${(ride.fare||0).toLocaleString()}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>{ride.vehicleType||'VilleRide'}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:GREEN, flexShrink:0 }}/>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{from}</div>
                    </div>
                    <div style={{ width:2, height:10, background:'rgba(255,255,255,0.15)', marginLeft:3, marginBottom:4 }}/>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:YELLOW, flexShrink:0 }}/>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{to}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'0.5px solid rgba(255,255,255,0.07)', paddingTop:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:13 }}>👤</span>
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{ride.driverName||'VilleCabs driver'}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {ride.distanceKm && <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{ride.distanceKm} km</span>}
                      {ride.customerRating && <span style={{ fontSize:11, color:YELLOW }}>{'⭐'.repeat(ride.customerRating)}</span>}
                      <span style={{ background:'rgba(26,158,90,0.15)', color:GREEN, borderRadius:20, padding:'2px 8px', fontSize:10, fontWeight:500 }}>✓ Done</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <TabBar/>
        </div>
      )}
    </div>
  );
}

// ── CUSTOMER PROFILE ──────────────────────────────────────────────────────────
function CustomerProfile({ go, user, setUser }) {
  const [form,    setForm]    = useState({ name:user?.name||'', phone:'' });
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');
  const [error,   setError]   = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db,'customers',user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setForm({ name:d.name||'', phone:d.phone||'' });
      }
    });
  }, [user]);

  const handleSave = async () => {
    setError(''); setMsg(''); setLoading(true);
    try {
      await updateDoc(doc(db,'customers',user.uid), { name:form.name, phone:form.phone });
      setUser(prev => ({ ...prev, name:form.name }));
      setMsg('Profile updated successfully!');
    } catch(err) { setError('Failed to update profile. Try again.'); }
    setLoading(false);
  };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="My Profile" onBack={() => go('customer-dash')}/>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>

        {/* Avatar */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:76, height:76, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:34, margin:'0 auto 10px' }}>👤</div>
          <div style={{ fontSize:16, fontWeight:500, color:WHITE }}>{user?.name}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{user?.email}</div>
          <div style={{ display:'inline-block', marginTop:6, background:'rgba(26,158,90,0.15)', color:GREEN, borderRadius:20, padding:'3px 12px', fontSize:11, fontWeight:500 }}>✓ Verified Rider</div>
        </div>

        {msg   && <div style={s.successBox}>{msg}</div>}
        {error && <div style={s.errBox}>{error}</div>}

        <label style={s.lbl}>Full Name</label>
        <input style={s.inp} value={form.name} onChange={e => set('name',e.target.value)} placeholder="Your full name"/>

        <label style={s.lbl}>Phone Number</label>
        <input style={s.inp} value={form.phone} onChange={e => set('phone',e.target.value)} placeholder="+1 (876) 555-0100"/>

        <label style={s.lbl}>Email Address</label>
        <input style={{ ...s.inp, opacity:0.5 }} value={user?.email||''} disabled/>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:16 }}>To change your email go to Settings</p>

        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
        <button style={s.btnO} onClick={() => go('customer-settings')}>Go to Settings</button>
      </div>
    </div>
  );
}

// ── CUSTOMER SETTINGS ─────────────────────────────────────────────────────────
function CustomerSettings({ go, user, setUser }) {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail,        setNewEmail]        = useState('');
  const [loadingPass,     setLoadingPass]     = useState(false);
  const [loadingEmail,    setLoadingEmail]    = useState(false);
  const [loadingDeact,    setLoadingDeact]    = useState(false);
  const [msgPass,         setMsgPass]         = useState('');
  const [msgEmail,        setMsgEmail]        = useState('');
  const [errPass,         setErrPass]         = useState('');
  const [errEmail,        setErrEmail]        = useState('');

  const handlePasswordChange = async () => {
    setErrPass(''); setMsgPass('');
    if (!newPassword || !confirmPassword) { setErrPass('Please fill in both fields.'); return; }
    if (newPassword.length < 6) { setErrPass('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setErrPass('Passwords do not match.'); return; }
    setLoadingPass(true);
    try {
      const { updatePassword } = await import('firebase/auth');
      await updatePassword(auth.currentUser, newPassword);
      setMsgPass('Password updated successfully!');
      setNewPassword(''); setConfirmPassword('');
    } catch(err) {
      if (err.code === 'auth/requires-recent-login') setErrPass('Please log out and log back in before changing your password.');
      else setErrPass(err.message);
    }
    setLoadingPass(false);
  };

  const handleEmailChange = async () => {
    setErrEmail(''); setMsgEmail('');
    if (!newEmail) { setErrEmail('Please enter a new email address.'); return; }
    setLoadingEmail(true);
    try {
      const { updateEmail, sendEmailVerification } = await import('firebase/auth');
      await updateEmail(auth.currentUser, newEmail);
      await sendEmailVerification(auth.currentUser);
      await updateDoc(doc(db,'customers',user.uid), { email:newEmail });
      setUser(prev => ({ ...prev, email:newEmail }));
      setMsgEmail('Email updated! Please verify your new email address.');
      setNewEmail('');
    } catch(err) {
      if (err.code === 'auth/requires-recent-login') setErrEmail('Please log out and log back in before changing your email.');
      else setErrEmail(err.message);
    }
    setLoadingEmail(false);
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Are you sure you want to deactivate your account?')) return;
    setLoadingDeact(true);
    try {
      await updateDoc(doc(db,'customers',user.uid), { status:'deactivated', deactivatedAt:serverTimestamp() });
      await signOut(auth);
      setUser(null);
      go('splash');
    } catch(err) { alert('Error: ' + err.message); }
    setLoadingDeact(false);
  };

  const handleLogout = async () => { await signOut(auth); setUser(null); go('splash'); };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Settings" onBack={() => go('customer-dash')}/>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>

        {/* Change Password */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:14 }}>🔒 Change Password</div>
          {errPass && <div style={s.errBox}>{errPass}</div>}
          {msgPass && <div style={s.successBox}>{msgPass}</div>}
          <label style={s.lbl}>New Password</label>
          <input style={s.inp} type="password" placeholder="At least 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)}/>
          <label style={s.lbl}>Confirm New Password</label>
          <input style={s.inp} type="password" placeholder="Repeat new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/>
          <button style={{ ...s.btnY, opacity:loadingPass?0.7:1 }} onClick={handlePasswordChange} disabled={loadingPass}>
            {loadingPass ? 'Updating...' : 'Update Password'}
          </button>
        </div>

        {/* Change Email */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:4 }}>✉️ Change Email</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:14 }}>Current: {user?.email}</div>
          {errEmail && <div style={s.errBox}>{errEmail}</div>}
          {msgEmail && <div style={s.successBox}>{msgEmail}</div>}
          <label style={s.lbl}>New Email Address</label>
          <input style={s.inp} type="email" placeholder="new@email.com" value={newEmail} onChange={e => setNewEmail(e.target.value)}/>
          <button style={{ ...s.btnY, opacity:loadingEmail?0.7:1 }} onClick={handleEmailChange} disabled={loadingEmail}>
            {loadingEmail ? 'Updating...' : 'Update Email'}
          </button>
        </div>

        {/* Notifications */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:12 }}>🔔 Notifications</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>You will receive updates when your driver accepts your ride and when the ride is completed.</div>
        </div>

        {/* Logout */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:12 }}>🚪 Logout</div>
          <button style={s.btnO} onClick={handleLogout}>Log out of VilleCabs</button>
        </div>

        {/* Deactivate */}
        <div style={{ background:'rgba(226,75,74,0.08)', border:'0.5px solid rgba(226,75,74,0.2)', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:15, fontWeight:500, color:'#f09595', marginBottom:6 }}>⚠️ Deactivate Account</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:14, lineHeight:1.6 }}>
            Deactivating your account will remove your access to VilleCabs. Contact support to reactivate.
          </div>
          <button onClick={handleDeactivate} disabled={loadingDeact}
            style={{ width:'100%', padding:'12px', background:'rgba(226,75,74,0.15)', color:'#f09595', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:12, fontSize:14, cursor:'pointer', opacity:loadingDeact?0.7:1 }}>
            {loadingDeact ? 'Deactivating...' : 'Deactivate My Account'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── PIN PICKUP ────────────────────────────────────────────────────────────────
function PinPickup({ go, setPickupData }) {
  const [pinPos,   setPinPos]   = useState(MANCHESTER_CENTER);
  const [address,  setAddress]  = useState('Manchester, Jamaica');
  const [loading,  setLoading]  = useState(false);

  const handleMapClick = useCallback(async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPinPos({ lat, lng });
    setLoading(true);
    const addr = await geocodeLatLng(lat, lng);
    setAddress(addr);
    setLoading(false);
  }, []);

  const handleConfirm = () => {
    setPickupData({ coords:pinPos, address });
    go('pin-dropoff');
  };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Pin Pickup Location" onBack={() => go('customer-dash')}/>
      <VilleMap height={300} center={MANCHESTER_CENTER} zoom={14} onClick={handleMapClick}
        markers={[{ position:pinPos, title:'Pickup' }]}/>
      <div style={{ padding:16 }}>
        <div style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.3)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#9fe1cb' }}>
          📍 Tap anywhere on the map to pin your exact pickup location
        </div>
        <label style={s.lbl}>Pinned address</label>
        <input style={s.inp} value={loading ? 'Getting address...' : address} onChange={e => setAddress(e.target.value)}/>
        <button style={s.btnY} onClick={handleConfirm}>Confirm Pickup</button>
      </div>
    </div>
  );
}

// ── PIN DROPOFF ───────────────────────────────────────────────────────────────
function PinDropoff({ go, pickupData, setDropoffData }) {
  const [pinPos,  setPinPos]  = useState({ lat:18.02, lng:-77.48 });
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const suggestions = ['Manchester Market, Mandeville','Spaldings, Manchester','Christiana, Manchester','Porus, Manchester'];

  const handleMapClick = useCallback(async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPinPos({ lat, lng });
    setLoading(true);
    const addr = await geocodeLatLng(lat, lng);
    setAddress(addr);
    setLoading(false);
  }, []);

  const handleConfirm = () => {
    if (!address) return;
    setDropoffData({ coords:pinPos, address });
    go('vehicle-select');
  };

  const markers = [];
  if (pickupData?.coords) markers.push({ position:pickupData.coords, title:'Pickup' });
  if (address) markers.push({ position:pinPos, title:'Drop-off' });

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Pin Drop-off Location" onBack={() => go('pin-pickup')}/>
      <VilleMap height={260} center={MANCHESTER_CENTER} zoom={12} onClick={handleMapClick} markers={markers}/>
      <div style={{ padding:16 }}>
        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'rgba(232,180,0,0.9)' }}>
          🏁 Tap the map or choose a location below
        </div>
        {address && (
          <div style={{ marginBottom:12 }}>
            <label style={s.lbl}>Pinned address</label>
            <input style={s.inp} value={loading ? 'Getting address...' : address} onChange={e => setAddress(e.target.value)}/>
          </div>
        )}
        <div style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
          {suggestions.map((sug,i) => (
            <div key={i} onClick={() => { setAddress(sug); setDropoffData({ coords:pinPos, address:sug }); go('vehicle-select'); }}
              style={{ padding:'11px 14px', fontSize:13, color:'rgba(255,255,255,0.8)', borderBottom:i<suggestions.length-1?'0.5px solid rgba(255,255,255,0.08)':'none', cursor:'pointer' }}>
              📍 {sug}
            </div>
          ))}
        </div>
        <button style={{ ...s.btnY, opacity:!address?0.5:1 }} onClick={handleConfirm} disabled={!address}>Confirm Drop-off</button>
      </div>
    </div>
  );
}

// ── VEHICLE SELECT ────────────────────────────────────────────────────────────
function VehicleSelect({ go, user, pickupData, dropoffData, setBookingId }) {
  const [sel,     setSel]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [dist,    setDist]    = useState(8.2);
  const [directions, setDirections] = useState(null);

  const vehicles = [
    { name:'VilleRide', eta:'4 min away',      price:0, base:300, rate:55,  icon:'🚗' },
    { name:'VilleXL',   eta:'7 min · up to 6', price:0, base:400, rate:98,  icon:'🚙' },
    { name:'VilleMoto', eta:'2 min away',       price:0, base:200, rate:37,  icon:'🏍️' },
  ];

  const calcPrice = (v) => Math.round(v.base + dist * v.rate);

  useEffect(() => {
    if (pickupData?.coords && dropoffData?.coords) {
      getDirections(pickupData.coords, dropoffData.coords).then(result => {
        if (result) {
          setDirections(result);
          const meters = result.routes[0].legs[0].distance.value;
          setDist(parseFloat((meters/1000).toFixed(1)));
        }
      });
    }
  }, [pickupData, dropoffData]);

  const markers = [];
  if (pickupData?.coords && !directions)  markers.push({ position:pickupData.coords,  title:'Pickup' });
  if (dropoffData?.coords && !directions) markers.push({ position:dropoffData.coords, title:'Drop-off' });

  const handleBook = async () => {
    setLoading(true); setError('');
    try {
      const v = vehicles[sel];
      const price = calcPrice(v);
      const ref = await addDoc(collection(db,'bookings'), {
        customerId:   user.uid,
        customerName: user.name,
        pickup:       { address: pickupData?.address||'Manchester, Jamaica', lat: pickupData?.coords?.lat||MANCHESTER_CENTER.lat, lng: pickupData?.coords?.lng||MANCHESTER_CENTER.lng },
        dropoff:      { address: dropoffData?.address||'Destination', lat: dropoffData?.coords?.lat||18.02, lng: dropoffData?.coords?.lng||-77.48 },
        vehicleType:  v.name,
        fare:         price,
        distanceKm:   dist,
        status:       'searching',
        createdAt:    serverTimestamp(),
      });
      setBookingId(ref.id);
      // Notify all approved drivers via FCM
      try {
        const driverSnap = await getDocs(query(collection(db,"drivers"), where("status","==","approved")));
        const tokens = driverSnap.docs.map(d => d.data().fcmToken).filter(Boolean);
        await setDoc(doc(db,"notifications","latest_ride"), {
          title: "New VilleCabs ride request!",
          body: `${user.name} needs a ${v.name} from ${pickupData?.address?.split(",")[0]||"Manchester"} — J$${price}`,
          tokens,
          bookingId: ref.id,
          createdAt: serverTimestamp(),
        });
      } catch(e) { console.log("Notification send skipped:", e.message); }
      go('booking-confirm');
    } catch(err) { setError('Failed to create booking. Please try again.'); }
    setLoading(false);
  };

  const v = vehicles[sel];

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Choose Ride" onBack={() => go('pin-dropoff')}/>
      <VilleMap height={160} center={pickupData?.coords||MANCHESTER_CENTER} zoom={12} markers={markers} directions={directions}/>
      <div style={{ padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:10 }}>
          <span>📍 {pickupData?.address?.split(',')[0]||'Pickup'} → {dropoffData?.address?.split(',')[0]||'Destination'}</span>
          <span>{dist} km</span>
        </div>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        {vehicles.map((veh,i) => (
          <div key={i} onClick={() => setSel(i)} style={{ border:`${i===sel?'2px solid '+YELLOW:'0.5px solid rgba(255,255,255,0.12)'}`, borderRadius:12, padding:'11px 13px', marginBottom:8, display:'flex', alignItems:'center', gap:10, cursor:'pointer', background:i===sel?'rgba(232,180,0,0.08)':'rgba(255,255,255,0.04)' }}>
            <div style={{ width:44, height:44, borderRadius:10, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{veh.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>{veh.name}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{veh.eta}</div>
            </div>
            <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>J${calcPrice(veh).toLocaleString()}</div>
          </div>
        ))}
        <div style={{ background:DARK, borderRadius:12, padding:14, margin:'10px 0' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}><span>Base fare</span><span>J${v.base}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}><span>Distance ({dist} km × J${v.rate})</span><span>J${Math.round(dist*v.rate)}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}><span>Service fee</span><span>J$0</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:500, color:YELLOW, borderTop:'0.5px solid rgba(255,255,255,0.12)', paddingTop:8, marginTop:4 }}><span>Total</span><span>J${calcPrice(v).toLocaleString()}</span></div>
        </div>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleBook} disabled={loading}>
          {loading ? 'Creating booking...' : 'Book Ride — J$' + calcPrice(v).toLocaleString()}
        </button>
      </div>
    </div>
  );
}

// ── BOOKING CONFIRM ──────────────────────────────────────────────────────────
function BookingConfirm({ go, bookingId }) {
  const [booking,    setBooking]    = useState(null);
  const [payment,    setPayment]    = useState('cash');
  const [step,       setStep]       = useState('select');
  const [cardName,   setCardName]   = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV,    setCardCVV]    = useState('');
  const [processing, setProcessing] = useState(false);
  const [cardError,  setCardError]  = useState('');
  const [cardPaid,   setCardPaid]   = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    const unsub = onSnapshot(doc(db,'bookings',bookingId), snap => {
      if (snap.exists()) setBooking({ id:snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [bookingId]);

  const fmtCard   = v => v.replace(/\D/g,'').slice(0,16).replace(/(\d{4})/g,'$1 ').trim();
  const fmtExpiry = v => { const d=v.replace(/\D/g,'').slice(0,4); return d.length>2?d.slice(0,2)+'/'+d.slice(2):d; };

  const handleConfirm = async () => {
    if (payment === 'cash') {
      await updateDoc(doc(db,'bookings',bookingId), { paymentMethod:'cash', paymentStatus:'pending_cash' });
      go('live-ride');
    } else {
      setStep('card-form');
    }
  };

  const handleCardPay = async () => {
    setCardError('');
    if (!cardName)                                { setCardError('Please enter the cardholder name.'); return; }
    if (cardNumber.replace(/\s/g,'').length < 16) { setCardError('Please enter a valid 16-digit card number.'); return; }
    if (cardExpiry.length < 5)                    { setCardError('Please enter a valid expiry date (MM/YY).'); return; }
    if (cardCVV.length < 3)                       { setCardError('Please enter a valid CVV.'); return; }
    setProcessing(true);
    try {
      const stripeKey  = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
      const backendUrl = 'https://villecabs-backend.onrender.com';

      if (stripeKey && stripeKey !== 'undefined' && stripeKey.startsWith('pk_')) {
        // ── Real Stripe via Render backend ───────────────────────────────────
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(stripeKey);
        // Create payment intent
        const res  = await fetch(`${backendUrl}/create-payment-intent`, {
          method: 'POST', headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ bookingId, amount: booking.fare, currency: 'jmd' }),
        });
        const data = await res.json();
        if (data.error) { setCardError(data.error); setProcessing(false); return; }
        // Confirm card payment
        const [expMonth, expYear] = cardExpiry.split('/');
        const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
          payment_method: {
            card: { number: cardNumber.replace(/\s/g,''), exp_month: parseInt(expMonth), exp_year: parseInt('20'+expYear), cvc: cardCVV },
            billing_details: { name: cardName },
          },
        });
        if (error) { setCardError(error.message); setProcessing(false); return; }
        if (paymentIntent.status === 'succeeded') {
          await updateDoc(doc(db,'bookings',bookingId), {
            paymentMethod: 'card', paymentStatus: 'paid',
            cardLast4: cardNumber.replace(/\s/g,'').slice(-4), paidAt: serverTimestamp(),
          });
          setCardPaid(true);
        }
      } else {
        // ── Demo mode ────────────────────────────────────────────────────────
        await new Promise(r => setTimeout(r, 2000));
        await updateDoc(doc(db,'bookings',bookingId), {
          paymentMethod: 'card', paymentStatus: 'demo_paid',
          cardLast4: cardNumber.replace(/\s/g,'').slice(-4), paidAt: serverTimestamp(),
        });
        setCardPaid(true);
      }
    } catch(err) { setCardError('Payment failed: ' + err.message); }
    setProcessing(false);
  };

  // ── Payment success screen ────────────────────────────────────────────────
  if (cardPaid) {
    return (
      <div style={{ ...s.content, background:'#0f1923', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:24 }}>
        <div style={{ fontSize:72, marginBottom:16 }}>✅</div>
        <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, marginBottom:8 }}>Payment successful!</h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:6 }}>J${booking?.fare?.toLocaleString()} charged to your card</p>
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, marginBottom:28, width:'100%', maxWidth:320 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
            <span style={{ color:'rgba(255,255,255,0.5)' }}>Card</span>
            <span style={{ color:WHITE }}>•••• {booking?.cardLast4||'****'}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
            <span style={{ color:'rgba(255,255,255,0.5)' }}>Amount</span>
            <span style={{ color:GREEN, fontWeight:500 }}>J${booking?.fare?.toLocaleString()}</span>
          </div>
        </div>
        <button style={{ ...s.btnY, maxWidth:320 }} onClick={() => go('live-ride')}>Track your ride →</button>
      </div>
    );
  }

  // ── Card form screen ──────────────────────────────────────────────────────
  if (step === 'card-form') {
    return (
      <div style={{ ...s.content, background:'#0f1923' }}>
        <TopBar title="Card Payment" onBack={() => { setStep('select'); setCardError(''); }}/>
        <div style={{ padding:16, maxWidth:420, margin:'0 auto' }}>

          {/* Amount banner */}
          <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:12, padding:14, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>Amount to charge</span>
            <span style={{ fontSize:20, fontWeight:700, color:YELLOW }}>J${booking?.fare?.toLocaleString()}</span>
          </div>

          {/* Mode banner */}
          {(!process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY === 'undefined') ? (
            <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'rgba(232,180,0,0.8)' }}>
              ⚠️ Demo mode — no real charge. Add REACT_APP_STRIPE_PUBLISHABLE_KEY to Vercel to enable live Stripe payments.
            </div>
          ) : (
            <div style={{ background:'rgba(26,158,90,0.08)', border:'0.5px solid rgba(26,158,90,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#9fe1cb' }}>
              🔒 Secured by Stripe — your card details are encrypted
            </div>
          )}

          {/* Card form */}
          <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>Card Details</div>
              <div style={{ display:'flex', gap:6 }}>
                {['VISA','MC','AMEX'].map(b => (
                  <span key={b} style={{ background:'rgba(255,255,255,0.07)', borderRadius:6, padding:'3px 8px', fontSize:10, color:'rgba(255,255,255,0.5)' }}>{b}</span>
                ))}
              </div>
            </div>

            {cardError && <div style={s.errBox}>⚠️ {cardError}</div>}

            <label style={s.lbl}>Cardholder Name</label>
            <input style={s.inp} placeholder="Name on card" value={cardName}
              onChange={e => setCardName(e.target.value)}/>

            <label style={s.lbl}>Card Number</label>
            <input style={{ ...s.inp, letterSpacing:2, fontFamily:'monospace' }}
              placeholder="0000 0000 0000 0000" value={cardNumber}
              onChange={e => setCardNumber(fmtCard(e.target.value))} maxLength={19}/>

            <div style={{ display:'flex', gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={s.lbl}>Expiry Date</label>
                <input style={s.inp} placeholder="MM/YY" value={cardExpiry}
                  onChange={e => setCardExpiry(fmtExpiry(e.target.value))} maxLength={5}/>
              </div>
              <div style={{ flex:1 }}>
                <label style={s.lbl}>CVV</label>
                <input style={s.inp} placeholder="123" type="password" value={cardCVV}
                  onChange={e => setCardCVV(e.target.value.replace(/\D/g,'').slice(0,4))} maxLength={4}/>
              </div>
            </div>

            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
              🔒 256-bit SSL encrypted · Powered by Stripe
            </div>
          </div>

          {/* Fare summary */}
          <div style={{ background:DARK, borderRadius:12, padding:14, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
              <span>Ride fare</span><span>J${booking?.fare?.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
              <span>Card processing fee</span><span>J$0</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:500, color:YELLOW, borderTop:'0.5px solid rgba(255,255,255,0.12)', paddingTop:8, marginTop:4 }}>
              <span>Total charge</span><span>J${booking?.fare?.toLocaleString()}</span>
            </div>
          </div>

          <button style={{ ...s.btnY, opacity:processing?0.7:1, fontSize:16 }}
            onClick={handleCardPay} disabled={processing}>
            {processing ? '⏳ Processing payment...' : `Pay J$${booking?.fare?.toLocaleString()}`}
          </button>
          <button style={s.btnO} onClick={() => { setStep('select'); setCardError(''); }}>
            ← Change payment method
          </button>
        </div>
      </div>
    );
  }

  // ── Payment method selection screen ──────────────────────────────────────
  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Confirm Booking" onBack={() => go('vehicle-select')}/>
      <div style={{ padding:16 }}>

        {/* Booking summary */}
        {booking && (
          <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:DARK, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🚗</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>{booking.vehicleType}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Booking #{bookingId?.slice(-6).toUpperCase()}</div>
              </div>
              <div style={{ fontSize:18, fontWeight:500, color:GREEN }}>J${booking.fare?.toLocaleString()}</div>
            </div>
            <div style={{ borderTop:'0.5px solid rgba(255,255,255,0.1)', paddingTop:12, display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:GREEN, flexShrink:0 }}/>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>{booking.pickup?.address}</div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:YELLOW, flexShrink:0 }}/>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)' }}>{booking.dropoff?.address}</div>
              </div>
            </div>
            <div style={{ marginTop:12, padding:'8px 12px', background:'rgba(26,158,90,0.1)', borderRadius:8, fontSize:12, color:'#9fe1cb' }}>
              ✅ Booking saved — drivers are being notified
            </div>
          </div>
        )}

        {/* Payment selector */}
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>Choose payment method</div>
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          <div onClick={() => setPayment('cash')}
            style={{ flex:1, border:payment==='cash'?`2px solid ${YELLOW}`:'0.5px solid rgba(255,255,255,0.12)', borderRadius:14, padding:'16px 12px', textAlign:'center', cursor:'pointer', background:payment==='cash'?'rgba(232,180,0,0.1)':'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize:28, marginBottom:6 }}>💵</div>
            <div style={{ fontSize:13, fontWeight:500, color:payment==='cash'?YELLOW:WHITE }}>Cash</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>Pay driver directly</div>
          </div>
          <div onClick={() => setPayment('card')}
            style={{ flex:1, border:payment==='card'?`2px solid ${YELLOW}`:'0.5px solid rgba(255,255,255,0.12)', borderRadius:14, padding:'16px 12px', textAlign:'center', cursor:'pointer', background:payment==='card'?'rgba(232,180,0,0.1)':'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize:28, marginBottom:6 }}>💳</div>
            <div style={{ fontSize:13, fontWeight:500, color:payment==='card'?YELLOW:WHITE }}>Card</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>Pay securely online</div>
          </div>
        </div>

        {payment === 'cash' && (
          <div style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14, marginBottom:16, fontSize:13, color:'rgba(255,255,255,0.65)', lineHeight:1.6 }}>
            💵 You will pay <strong style={{ color:WHITE }}>J${booking?.fare?.toLocaleString()}</strong> in cash to your driver at the destination.
          </div>
        )}
        {payment === 'card' && (
          <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:12, padding:14, marginBottom:16, fontSize:13, color:'rgba(255,255,255,0.65)', lineHeight:1.6 }}>
            💳 You will enter your card details securely to pay <strong style={{ color:YELLOW }}>J${booking?.fare?.toLocaleString()}</strong>.
          </div>
        )}

        <button style={s.btnY} onClick={handleConfirm}>
          Confirm {payment === 'card' ? '— Enter Card Details →' : '— Pay Cash'}
        </button>
        <button style={s.btnO} onClick={() => go('customer-dash')}>Cancel</button>
      </div>
    </div>
  );
}

// ── LIVE RIDE ─────────────────────────────────────────────────────────────────
function LiveRide({ go, bookingId }) {
  const [booking,    setBooking]    = useState(null);
  const [driverInfo, setDriverInfo] = useState(null);
  const [rating,     setRating]     = useState(0);
  const [rated,      setRated]      = useState(false);

  // Watch booking in real time
  useEffect(() => {
    if (!bookingId) return;
    const unsub = onSnapshot(doc(db,'bookings',bookingId), snap => {
      if (snap.exists()) setBooking({ id:snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [bookingId]);

  // Load driver profile when driver is assigned
  useEffect(() => {
    if (!booking?.driverId) return;
    getDoc(doc(db,'drivers',booking.driverId)).then(snap => {
      if (snap.exists()) setDriverInfo(snap.data());
    });
  }, [booking?.driverId]);

  const submitRating = async () => {
    if (!rating || !bookingId) return;
    try {
      await updateDoc(doc(db,'bookings',bookingId), { customerRating:rating });
      if (booking?.driverId) {
        const driverRef  = doc(db,'drivers',booking.driverId);
        const driverSnap = await getDoc(driverRef);
        if (driverSnap.exists()) {
          const d = driverSnap.data();
          const prevTotal = (d.ratingTotal||0) + rating;
          const prevCount = (d.ratingCount||0) + 1;
          await updateDoc(driverRef, { ratingTotal:prevTotal, ratingCount:prevCount, rating:Math.round((prevTotal/prevCount)*10)/10 });
        }
      }
      setRated(true);
    } catch(err) { console.error(err); setRated(true); }
  };

  const pickupCoords  = booking?.pickup        ? { lat:booking.pickup.lat,         lng:booking.pickup.lng         } : MANCHESTER_CENTER;
  const dropoffCoords = booking?.dropoff        ? { lat:booking.dropoff.lat,        lng:booking.dropoff.lng        } : null;
  const driverCoords  = booking?.driverLocation ? { lat:booking.driverLocation.lat, lng:booking.driverLocation.lng } : null;

  // ── Completed screen ──
  if (booking?.status === 'completed') {
    return (
      <div style={{ ...s.content, background:'#0f1923', minHeight:'100vh' }}>
        <div style={{ padding:24, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
          <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
          <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, marginBottom:8 }}>Ride completed!</h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:24, textAlign:'center' }}>You have arrived at your destination</p>
          <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:16, width:'100%', maxWidth:380, marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:8 }}><span style={{ color:'rgba(255,255,255,0.6)' }}>Driver</span><span style={{ color:WHITE, fontWeight:500 }}>{booking.driverName||'--'}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:8 }}><span style={{ color:'rgba(255,255,255,0.6)' }}>From</span><span style={{ color:WHITE }}>{booking.pickup?.address?.split(',')[0]}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, marginBottom:8 }}><span style={{ color:'rgba(255,255,255,0.6)' }}>To</span><span style={{ color:WHITE }}>{booking.dropoff?.address?.split(',')[0]}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:500, borderTop:'0.5px solid rgba(255,255,255,0.1)', paddingTop:10, marginTop:4 }}><span style={{ color:'rgba(255,255,255,0.6)' }}>Total paid</span><span style={{ color:GREEN }}>J${booking.fare?.toLocaleString()}</span></div>
          </div>
          {!rated ? (
            <div style={{ width:'100%', maxWidth:380, marginBottom:20, textAlign:'center' }}>
              <p style={{ fontSize:14, color:'rgba(255,255,255,0.6)', marginBottom:12 }}>Rate your driver</p>
              <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:16 }}>
                {[1,2,3,4,5].map(star => (
                  <div key={star} onClick={() => setRating(star)} style={{ fontSize:32, cursor:'pointer', opacity:star<=rating?1:0.3 }}>⭐</div>
                ))}
              </div>
              {rating > 0 && <button style={s.btnY} onClick={submitRating}>Submit Rating</button>}
            </div>
          ) : (
            <div style={{ ...s.successBox, width:'100%', maxWidth:380, textAlign:'center', marginBottom:20 }}>⭐ Thanks for rating your driver!</div>
          )}
          <button style={{ ...s.btnO, width:'100%', maxWidth:380 }} onClick={() => go('customer-dash')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Live tracking screen ──
  return (
    <div style={{ ...s.content, background:'#0f1923' }}>

      {/* Map — centers on driver if available, otherwise pickup */}
      <div style={{ position:'relative' }}>
        <VilleMap height={240} center={driverCoords||pickupCoords} zoom={15}>
          {/* Pickup pin */}
          <Marker position={pickupCoords} title="Pickup"
            icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#1a9e5a" stroke="white" stroke-width="2.5"/></svg>'), scaledSize:{width:28,height:28} }}/>
          {/* Dropoff pin */}
          {dropoffCoords && (
            <Marker position={dropoffCoords} title="Drop-off"
              icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#e8b400" stroke="white" stroke-width="2.5"/></svg>'), scaledSize:{width:28,height:28} }}/>
          )}
          {/* Driver car icon — updates live */}
          {driverCoords && (
            <Marker position={driverCoords} title="Your driver"
              icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#1a1a2e" stroke="#e8b400" stroke-width="3"/><text x="22" y="29" text-anchor="middle" font-size="20">🚗</text></svg>'), scaledSize:{width:44,height:44} }}/>
          )}
        </VilleMap>

        {/* Status bar over map */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(26,26,46,0.9)', padding:'7px 14px', textAlign:'center', fontSize:12, color:YELLOW, fontWeight:500 }}>
          {booking?.status==='active'
            ? driverCoords ? '📍 Tracking driver live on map' : '🟢 Driver accepted — heading to you'
            : '🔍 Finding your driver...'}
        </div>
      </div>

      <div style={{ padding:14, overflowY:'auto' }}>
        {booking?.driverId ? (
          <>
            {/* Driver safety card */}
            <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:10, fontWeight:500 }}>
                🛡️ Driver & Vehicle Info — for your safety
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:46, height:46, borderRadius:'50%', background:'rgba(232,180,0,0.15)', border:'1.5px solid rgba(232,180,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>👤</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>{booking.driverName||'--'}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>
                    {driverInfo?.rating ? `⭐ ${driverInfo.rating.toFixed(1)} · ${driverInfo.ratingCount||0} reviews` : booking?.driverRating ? `⭐ ${booking.driverRating.toFixed(1)}` : '⭐ New driver'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>📞</div>
                    <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>Call</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }} onClick={() => go('chat')}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(232,180,0,0.15)', border:'1px solid #e8b400', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>💬</div>
                    <span style={{ fontSize:9, color:YELLOW }}>Chat</span>
                  </div>
                </div>
              </div>

              {/* Vehicle details */}
              <div style={{ borderTop:'0.5px solid rgba(255,255,255,0.08)', paddingTop:12 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Make & Model</div>
                    <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>
                      {driverInfo ? `${driverInfo.vehicleMake||''} ${driverInfo.vehicleModel||''}`.trim() : booking?.vehicleMake ? `${booking.vehicleMake} ${booking.vehicleModel||''}`.trim() : '...'}
                    </div>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>License Plate</div>
                    <div style={{ fontSize:15, fontWeight:700, color:YELLOW, letterSpacing:1 }}>
                      {driverInfo?.licensePlate || booking?.licensePlate || '...'}
                    </div>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Vehicle Type</div>
                    <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>{booking.vehicleType||'--'}</div>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Status</div>
                    <div style={{ fontSize:13, fontWeight:500, color:GREEN }}>
                      {driverCoords ? '📍 Live' : '🟢 Active'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fare & status */}
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Status</div>
                <div style={{ fontSize:13, fontWeight:500, color:WHITE, textTransform:'capitalize' }}>{booking?.status||'searching'}</div>
              </div>
              <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Fare</div>
                <div style={{ fontSize:13, fontWeight:500, color:GREEN }}>J${booking?.fare?.toLocaleString()||'--'}</div>
              </div>
              <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Payment</div>
                <div style={{ fontSize:11, fontWeight:500, color:YELLOW, textTransform:'capitalize' }}>{booking?.paymentMethod||'cash'}</div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ background:'rgba(232,180,0,0.08)', border:'1px solid rgba(232,180,0,0.3)', borderRadius:12, padding:20, marginBottom:12, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
            <div style={{ fontSize:15, fontWeight:500, color:YELLOW, marginBottom:4 }}>Finding your driver...</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Drivers in Manchester are being notified</div>
          </div>
        )}
        <button style={s.btnO} onClick={() => go('customer-dash')}>Back to Dashboard</button>
      </div>
    </div>
  );
}

// ── DRIVER DASHBOARD ──────────────────────────────────────────────────────────
function DriverDash({ go, user, setUser, setBookingId }) {
  const [rides,       setRides]       = useState([]);
  const [driverTab,   setDriverTab]   = useState('rides');
  const [notifStatus, setNotifStatus] = useState("idle");
  const [loading,     setLoading]     = useState(true);
  const [earnings,    setEarnings]    = useState({ today:0, week:0, month:0, total:0, todayRides:0, weekRides:0, monthRides:0, totalRides:0, history:[] });
  const handleLogout = async () => { await signOut(auth); setUser(null); go('splash'); };

  useEffect(() => {
    const q = query(collection(db,'bookings'), where('status','==','searching'), orderBy('createdAt','desc'));
    const unsub = onSnapshot(q, snap => {
      setRides(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('driverId','==',user.uid));
    const unsub = onSnapshot(q, snap => {
      const completed = snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(b => b.status === 'completed');
      const now   = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const week  = new Date(today); week.setDate(today.getDate() - 7);
      const month = new Date(today); month.setDate(today.getDate() - 30);
      const inRange = (b, from) => b.completedAt?.toDate ? b.completedAt.toDate() >= from : false;
      const todayRides  = completed.filter(b => inRange(b, today));
      const weekRides   = completed.filter(b => inRange(b, week));
      const monthRides  = completed.filter(b => inRange(b, month));
      const sum = arr => arr.reduce((s,b) => s + (b.fare||0), 0);
      // Driver gets 85% after 15% platform fee
      const driverCut = n => Math.round(n * 0.85);
      setEarnings({
        today:      driverCut(sum(todayRides)),
        week:       driverCut(sum(weekRides)),
        month:      driverCut(sum(monthRides)),
        total:      driverCut(sum(completed)),
        todayRides: todayRides.length,
        weekRides:  weekRides.length,
        monthRides: monthRides.length,
        totalRides: completed.length,
        history:    completed.sort((a,b) => (b.completedAt?.toDate?.()?.getTime()||0) - (a.completedAt?.toDate?.()?.getTime()||0)).slice(0,20),
      });
    });
    return () => unsub();
  }, [user]);

  const requestNotifPermission = async () => {
    setNotifStatus("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const token = await getToken(messaging, { vapidKey: process.env.REACT_APP_VAPID_KEY });
        if (token) {
          await setDoc(doc(db,"drivers",user.uid), { fcmToken: token }, { merge: true });
          setNotifStatus("enabled");
          onMessage(messaging, payload => {
            const n = new Notification(payload.notification.title, { body: payload.notification.body, icon: "/favicon.ico" });
          });
        }
      } else { setNotifStatus("denied"); }
    } catch(err) { console.error(err); setNotifStatus("error"); }
  };

  const acceptRide = async (rideId) => {
    try {
      // Fetch driver vehicle info to save on booking for customer safety
      const dSnap = await getDoc(doc(db,'drivers',user.uid));
      const dData = dSnap.exists() ? dSnap.data() : {};
      await updateDoc(doc(db,'bookings',rideId), {
        driverId:     user.uid,
        driverName:   user.name,
        vehicleMake:  dData.vehicleMake  || '',
        vehicleModel: dData.vehicleModel || '',
        licensePlate: dData.licensePlate || '',
        driverRating: dData.rating       || null,
        status:       'active',
        acceptedAt:   serverTimestamp(),
      });
      setBookingId(rideId);
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

      {/* Rides tab */}
      {driverTab === 'rides' && <>
      <VilleMap height={160} center={MANCHESTER_CENTER} zoom={12}/>
      <div style={{ padding:14 }}>
        {notifStatus === "idle" && (
          <div onClick={requestNotifPermission} style={{ background:"rgba(232,180,0,0.1)", border:"1px solid rgba(232,180,0,0.3)", borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:13 }}>
            <span style={{ fontSize:18 }}>🔔</span>
            <div style={{ flex:1 }}><div style={{ color:"#e8b400", fontWeight:500 }}>Enable ride notifications</div><div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", marginTop:2 }}>Tap to get alerted when customers book</div></div>
          </div>
        )}
        {notifStatus === "enabled" && (
          <div style={{ background:"rgba(26,158,90,0.1)", border:"0.5px solid rgba(26,158,90,0.3)", borderRadius:10, padding:"8px 14px", marginBottom:12, fontSize:12, color:"#9fe1cb", display:"flex", alignItems:"center", gap:8 }}>
            🔔 Notifications enabled — you'll be alerted for new rides
          </div>
        )}
        {notifStatus === "denied" && (
          <div style={{ background:"rgba(226,75,74,0.1)", border:"0.5px solid rgba(226,75,74,0.3)", borderRadius:10, padding:"8px 14px", marginBottom:12, fontSize:12, color:"#f09595" }}>
            ⚠️ Notifications blocked. Enable them in your browser settings.
          </div>
        )}
        {loading ? (
          <div style={{ textAlign:'center', padding:30, color:'rgba(255,255,255,0.4)' }}>Loading rides...</div>
        ) : rides.length === 0 ? (
          <div style={{ textAlign:'center', padding:30 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🚕</div>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:14 }}>No ride requests right now</div>
            <div style={{ color:'rgba(255,255,255,0.3)', fontSize:12, marginTop:6 }}>New bookings appear here instantly</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:12 }}>{rides.length} ride request{rides.length!==1?'s':''} in Manchester</div>
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
      </>}

      {/* Earnings tab */}
      {driverTab === 'earnings' && (
        <div style={{ padding:16, overflowY:'auto' }}>
          {/* Summary stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            <div style={{ background:'rgba(232,180,0,0.1)', border:'0.5px solid rgba(232,180,0,0.3)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>Today</div>
              <div style={{ fontSize:22, fontWeight:500, color:'#e8b400' }}>J${earnings.today.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{earnings.todayRides} ride{earnings.todayRides!==1?'s':''}</div>
            </div>
            <div style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.3)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>This week</div>
              <div style={{ fontSize:22, fontWeight:500, color:'#1a9e5a' }}>J${earnings.week.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{earnings.weekRides} ride{earnings.weekRides!==1?'s':''}</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>This month</div>
              <div style={{ fontSize:22, fontWeight:500, color:'#fff' }}>J${earnings.month.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{earnings.monthRides} ride{earnings.monthRides!==1?'s':''}</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>All time</div>
              <div style={{ fontSize:22, fontWeight:500, color:'#fff' }}>J${earnings.total.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{earnings.totalRides} ride{earnings.totalRides!==1?'s':''}</div>
            </div>
          </div>

          {/* Platform fee note */}
          <div style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, color:'rgba(255,255,255,0.45)', display:'flex', alignItems:'center', gap:8 }}>
            ℹ️ Earnings shown after 15% VilleCabs platform fee
          </div>

          {/* Ride history */}
          <div style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.6)', marginBottom:10, textTransform:'uppercase', letterSpacing:0.5, fontSize:11 }}>Recent completed rides</div>
          {earnings.history.length === 0 ? (
            <div style={{ textAlign:'center', padding:30, color:'rgba(255,255,255,0.3)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>💰</div>
              <div>No completed rides yet</div>
              <div style={{ fontSize:12, marginTop:6 }}>Accept rides to start earning</div>
            </div>
          ) : earnings.history.map((ride, i) => (
            <div key={ride.id||i} style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(26,158,90,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>✅</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:'#fff', fontWeight:500 }}>{ride.customerName||'Customer'}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                  {(ride.pickup?.address||'').split(',')[0]} → {(ride.dropoff?.address||'').split(',')[0]}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>
                  {ride.completedAt?.toDate?.()?.toLocaleDateString('en-JM', { day:'numeric', month:'short', year:'numeric' }) || '--'}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:15, fontWeight:500, color:'#1a9e5a' }}>J${Math.round((ride.fare||0)*0.85).toLocaleString()}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{ride.distanceKm||'--'} km</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom tab bar */}
      <div style={{ position:'sticky', bottom:0, background:'#1a1a2e', borderTop:'0.5px solid rgba(255,255,255,0.1)', display:'flex', zIndex:10 }}>
        {[['rides','🚕','Rides'],['earnings','💰','Earnings'],['profile','👤','Profile'],['settings','⚙️','Settings']].map(([tab,icon,label]) => (
          <div key={tab} onClick={() => tab==='profile' ? go('driver-profile') : tab==='settings' ? go('driver-settings') : setDriverTab(tab)}
            style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:10, cursor:'pointer', color:driverTab===tab?'#e8b400':'rgba(255,255,255,0.45)', borderTop:driverTab===tab?'2px solid #e8b400':'2px solid transparent' }}>
            <div style={{ fontSize:18, marginBottom:2 }}>{icon}</div>{label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DRIVER ACTIVE ─────────────────────────────────────────────────────────────
function DriverActive({ go, user, bookingId, setBookingId }) {
  const [booking,       setBooking]       = useState(null);
  const [locationStatus,setLocationStatus] = useState('idle'); // idle | tracking | denied
  const watchRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','active'));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const b = { id:snap.docs[0].id, ...snap.docs[0].data() };
        setBooking(b);
        if (b.id) setBookingId(b.id);
      }
    });
    return () => unsub();
  }, [user]);

  // Start GPS location tracking when ride is active
  useEffect(() => {
    if (!booking?.id || !user?.uid) return;
    if (!navigator.geolocation) return;

    setLocationStatus('tracking');
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          // Update location via Cloud Function
          await updateDriverLocationFn({ lat, lng, bookingId: booking.id });
        } catch(err) {
          // Fallback: update Firestore directly
          try {
            await updateDoc(doc(db,'bookings',booking.id), {
              driverLocation: { lat, lng, updatedAt: serverTimestamp() }
            });
            await updateDoc(doc(db,'drivers',user.uid), {
              currentLocation: { lat, lng, updatedAt: serverTimestamp() }
            });
          } catch(e) { console.error(e); }
        }
      },
      (err) => {
        console.warn('Location error:', err);
        setLocationStatus(err.code === 1 ? 'denied' : 'idle');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, [booking?.id, user?.uid]);

  const completeRide = async () => {
    if (!booking?.id) return;
    // Stop location tracking
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    await updateDoc(doc(db,'bookings',booking.id), { status:'completed', completedAt:serverTimestamp() });
    // Clear driver location
    try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:false, currentLocation:null }); } catch(e) {}
    go('driver-dash');
  };

  const pickupCoords  = booking?.pickup  ? { lat:booking.pickup.lat,  lng:booking.pickup.lng  } : MANCHESTER_CENTER;
  const dropoffCoords = booking?.dropoff ? { lat:booking.dropoff.lat, lng:booking.dropoff.lng } : null;
  const driverCoords  = booking?.driverLocation ? { lat:booking.driverLocation.lat, lng:booking.driverLocation.lng } : null;

  const markers = [{ position:pickupCoords, title:'Pickup' }];
  if (dropoffCoords) markers.push({ position:dropoffCoords, title:'Drop-off' });

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Active Ride" onBack={() => go('driver-dash')}/>

      {/* Location tracking status */}
      <div style={{ background: locationStatus==='tracking' ? 'rgba(26,158,90,0.15)' : locationStatus==='denied' ? 'rgba(226,75,74,0.15)' : 'rgba(255,255,255,0.05)', padding:'6px 16px', fontSize:11, color: locationStatus==='tracking' ? '#9fe1cb' : locationStatus==='denied' ? '#f09595' : 'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:6 }}>
        {locationStatus==='tracking' ? '📍 Sharing your live location with passenger' : locationStatus==='denied' ? '⚠️ Location access denied — passenger cannot see you on map' : '📍 Getting your location...'}
      </div>

      <VilleMap height={200} center={driverCoords||pickupCoords} zoom={14} markers={markers}>
        {driverCoords && (
          <Marker position={driverCoords} title="Your location"
            icon={{ url:'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#e8b400" stroke="white" stroke-width="3"/><text x="16" y="21" text-anchor="middle" font-size="14">🚗</text></svg>'), scaledSize: { width:32, height:32 } }}/>
        )}
      </VilleMap>

      <div style={{ padding:14 }}>
        {booking ? (
          <>
            <div style={{ background:'rgba(232,180,0,0.1)', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, color:'#e8b400', marginBottom:8 }}>Pick up passenger</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ width:9, height:9, borderRadius:'50%', background:'#1a9e5a' }}/>
                <div style={{ fontSize:13, color:'#fff' }}>{booking.pickup?.address}</div>
              </div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, color:'#fff', marginBottom:8 }}>Passenger</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'#1a1a2e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'#fff' }}>{booking.customerName}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Verified rider</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'#1a9e5a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📞</div>
                    <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)' }}>Call</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }} onClick={() => { setBookingId(booking?.id||bookingId); go('chat'); }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'rgba(232,180,0,0.2)', border:'1.5px solid #e8b400', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>💬</div>
                    <span style={{ fontSize:9, color:'#e8b400' }}>Chat</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', background:'rgba(255,255,255,0.05)', borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:'#e8b400' }}/>
              <div style={{ fontSize:13, color:'#fff', flex:1 }}>{booking.dropoff?.address}</div>
              <div style={{ fontSize:14, fontWeight:500, color:'#1a9e5a' }}>J${booking.fare?.toLocaleString()}</div>
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

// ── DRIVER PROFILE ───────────────────────────────────────────────────────────
function DriverProfile({ go, user, setUser }) {
  const [form, setForm]       = useState({ name: user?.name||'', phone: '', email: user?.email||'' });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');
  const [error, setError]     = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db,'drivers',user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setForm({ name:d.name||'', phone:d.phone||'', email:user.email||'' });
      }
    });
  }, [user]);

  const handleSave = async () => {
    setError(''); setMsg(''); setLoading(true);
    try {
      await updateDoc(doc(db,'drivers',user.uid), { name:form.name, phone:form.phone });
      setUser(prev => ({ ...prev, name:form.name }));
      setMsg('Profile updated successfully!');
    } catch(err) { setError('Failed to update profile.'); }
    setLoading(false);
  };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="My Profile" onBack={() => go('driver-dash')}/>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 10px' }}>👤</div>
          <div style={{ fontSize:16, fontWeight:500, color:WHITE }}>{user?.name}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{user?.email}</div>
          <div style={{ display:'inline-block', marginTop:6, background:'rgba(26,158,90,0.15)', color:'#1a9e5a', borderRadius:20, padding:'3px 12px', fontSize:11, fontWeight:500 }}>✓ Approved Driver</div>
        </div>
        {msg   && <div style={s.successBox}>{msg}</div>}
        {error && <div style={s.errBox}>{error}</div>}
        <label style={s.lbl}>Full Name</label>
        <input style={s.inp} value={form.name} onChange={e => set('name',e.target.value)} placeholder="Your full name"/>
        <label style={s.lbl}>Phone Number</label>
        <input style={s.inp} value={form.phone} onChange={e => set('phone',e.target.value)} placeholder="+1 (876) 555-0100"/>
        <label style={s.lbl}>Email Address</label>
        <input style={{ ...s.inp, opacity:0.5 }} value={form.email} disabled placeholder="Email cannot be changed here"/>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:16 }}>To change your email go to Settings</p>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
        <button style={s.btnO} onClick={() => go('driver-settings')}>Go to Settings</button>
      </div>
    </div>
  );
}

// ── DRIVER SETTINGS ───────────────────────────────────────────────────────────
function DriverSettings({ go, user, setUser }) {
  const [newPassword,    setNewPassword]    = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [newEmail,       setNewEmail]       = useState('');
  const [loadingPass,    setLoadingPass]    = useState(false);
  const [loadingEmail,   setLoadingEmail]   = useState(false);
  const [loadingDeact,   setLoadingDeact]   = useState(false);
  const [msgPass,        setMsgPass]        = useState('');
  const [msgEmail,       setMsgEmail]       = useState('');
  const [errPass,        setErrPass]        = useState('');
  const [errEmail,       setErrEmail]       = useState('');
  const [showDeact,      setShowDeact]      = useState(false);

  const handlePasswordChange = async () => {
    setErrPass(''); setMsgPass('');
    if (!newPassword || !confirmPassword) { setErrPass('Please fill in both fields.'); return; }
    if (newPassword.length < 6) { setErrPass('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setErrPass('Passwords do not match.'); return; }
    setLoadingPass(true);
    try {
      const { updatePassword } = await import('firebase/auth');
      await updatePassword(auth.currentUser, newPassword);
      setMsgPass('Password updated successfully!');
      setNewPassword(''); setConfirmPassword('');
    } catch(err) {
      if (err.code === 'auth/requires-recent-login') setErrPass('Please log out and log back in before changing your password.');
      else setErrPass(err.message);
    }
    setLoadingPass(false);
  };

  const handleEmailChange = async () => {
    setErrEmail(''); setMsgEmail('');
    if (!newEmail) { setErrEmail('Please enter a new email address.'); return; }
    setLoadingEmail(true);
    try {
      const { updateEmail, sendEmailVerification } = await import('firebase/auth');
      await updateEmail(auth.currentUser, newEmail);
      await sendEmailVerification(auth.currentUser);
      await updateDoc(doc(db,'drivers',user.uid), { email:newEmail });
      setUser(prev => ({ ...prev, email:newEmail }));
      setMsgEmail('Email updated! Please verify your new email address.');
      setNewEmail('');
    } catch(err) {
      if (err.code === 'auth/requires-recent-login') setErrEmail('Please log out and log back in before changing your email.');
      else setErrEmail(err.message);
    }
    setLoadingEmail(false);
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Are you sure you want to deactivate your account? You will not be able to accept rides.')) return;
    setLoadingDeact(true);
    try {
      await updateDoc(doc(db,'drivers',user.uid), { status:'suspended', deactivatedAt:serverTimestamp() });
      await signOut(auth);
      setUser(null);
      go('splash');
    } catch(err) { alert('Error: ' + err.message); }
    setLoadingDeact(false);
  };

  const handleLogout = async () => { await signOut(auth); setUser(null); go('splash'); };

  return (
    <div style={{ ...s.content, background:'#0f1923' }}>
      <TopBar title="Settings" onBack={() => go('driver-dash')}/>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>

        {/* Change Password */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:14 }}>🔒 Change Password</div>
          {errPass && <div style={s.errBox}>{errPass}</div>}
          {msgPass && <div style={s.successBox}>{msgPass}</div>}
          <label style={s.lbl}>New Password</label>
          <input style={s.inp} type="password" placeholder="At least 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)}/>
          <label style={s.lbl}>Confirm New Password</label>
          <input style={s.inp} type="password" placeholder="Repeat new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/>
          <button style={{ ...s.btnY, opacity:loadingPass?0.7:1 }} onClick={handlePasswordChange} disabled={loadingPass}>
            {loadingPass ? 'Updating...' : 'Update Password'}
          </button>
        </div>

        {/* Change Email */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:4 }}>✉️ Change Email</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:14 }}>Current: {user?.email}</div>
          {errEmail && <div style={s.errBox}>{errEmail}</div>}
          {msgEmail && <div style={s.successBox}>{msgEmail}</div>}
          <label style={s.lbl}>New Email Address</label>
          <input style={s.inp} type="email" placeholder="new@email.com" value={newEmail} onChange={e => setNewEmail(e.target.value)}/>
          <button style={{ ...s.btnY, opacity:loadingEmail?0.7:1 }} onClick={handleEmailChange} disabled={loadingEmail}>
            {loadingEmail ? 'Updating...' : 'Update Email'}
          </button>
        </div>

        {/* Logout */}
        <div style={{ background:'#1a1f2e', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:12 }}>🚪 Logout</div>
          <button style={s.btnO} onClick={handleLogout}>Log out of VilleCabs</button>
        </div>

        {/* Deactivate */}
        <div style={{ background:'rgba(226,75,74,0.08)', border:'0.5px solid rgba(226,75,74,0.25)', borderRadius:14, padding:16 }}>
          <div style={{ fontSize:15, fontWeight:500, color:'#f09595', marginBottom:6 }}>⚠️ Deactivate Account</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginBottom:14, lineHeight:1.6 }}>
            Deactivating your account will suspend your driver profile. You will no longer receive ride requests. Contact admin to reactivate.
          </div>
          <button style={{ width:'100%', padding:'12px', background:'rgba(226,75,74,0.15)', color:'#f09595', border:'0.5px solid rgba(226,75,74,0.4)', borderRadius:12, fontSize:14, cursor:'pointer', opacity:loadingDeact?0.7:1 }}
            onClick={handleDeactivate} disabled={loadingDeact}>
            {loadingDeact ? 'Deactivating...' : 'Deactivate My Account'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── CHAT SCREEN ──────────────────────────────────────────────────────────────
function ChatScreen({ go, user, bookingId, setBookingId }) {
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');
  const [chatBookingId, setChatBookingId] = useState(bookingId);
  const bottomRef = useRef(null);

  // If bookingId changes externally sync it
  useEffect(() => { if (bookingId) setChatBookingId(bookingId); }, [bookingId]);

  // Load messages real-time — no index needed, sort client side
  useEffect(() => {
    if (!chatBookingId) return;
    const colRef = collection(db, 'bookings', chatBookingId, 'messages');
    const unsub = onSnapshot(colRef, snap => {
      const msgs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      msgs.sort((a,b) => {
        const ta = a.createdAt?.seconds ?? 0;
        const tb = b.createdAt?.seconds ?? 0;
        return ta - tb;
      });
      setMessages(msgs);
    }, err => {
      setError('Could not load messages: ' + err.message);
    });
    return () => unsub();
  }, [chatBookingId]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (!chatBookingId) { setError('No booking found. Go back and try again.'); return; }
    setSending(true);
    setText('');
    setError('');
    try {
      const colRef = collection(db, 'bookings', chatBookingId, 'messages');
      await addDoc(colRef, {
        text:       trimmed,
        senderId:   user.uid,
        senderName: user.name || 'User',
        senderRole: user.role || 'customer',
        createdAt:  serverTimestamp(),
      });
    } catch(err) {
      setError('Send failed: ' + err.message);
      setText(trimmed);
    }
    setSending(false);
  };

  const goBack = () => user?.role === 'driver' ? go('driver-active') : go('live-ride');
  const mine   = (msg) => msg.senderId === user?.uid;
  const fmtTime = (ts) => {
    if (!ts?.seconds) return '';
    return new Date(ts.seconds * 1000).toLocaleTimeString('en-JM', { hour:'2-digit', minute:'2-digit' });
  };

  return (
    <div style={{ ...s.content, background:'#0f1923', display:'flex', flexDirection:'column', height:'100vh', maxHeight:'100vh', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:DARK, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0, borderBottom:'0.5px solid rgba(255,255,255,0.1)' }}>
        <button style={s.backBtn} onClick={goBack}>←</button>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
          {user?.role === 'customer' ? '🚗' : '👤'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>
            {user?.role === 'customer' ? 'Your Driver' : 'Passenger'}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>🟢 Ride in progress</div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background:'rgba(226,75,74,0.2)', padding:'8px 16px', fontSize:12, color:'#f09595', flexShrink:0 }}>
          ⚠️ {error}
          {!chatBookingId && <span style={{ display:'block', marginTop:4 }}>Booking ID missing — go back and tap Chat again</span>}
        </div>
      )}

      {/* Debug info — remove after testing */}
      <div style={{ background:'rgba(255,255,255,0.03)', padding:'4px 16px', fontSize:10, color:'rgba(255,255,255,0.2)', flexShrink:0 }}>
        Booking: {chatBookingId || 'NONE'} · User: {user?.uid?.slice(-6)||'?'} · Role: {user?.role||'?'}
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 8px' }}>
        {messages.length === 0 && !error && (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'rgba(255,255,255,0.3)' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>💬</div>
            <div style={{ fontSize:14 }}>No messages yet</div>
            <div style={{ fontSize:12, marginTop:6, color:'rgba(255,255,255,0.2)' }}>Say hello!</div>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = mine(msg);
          return (
            <div key={msg.id || i} style={{ display:'flex', justifyContent:isMe?'flex-end':'flex-start', marginBottom:10, alignItems:'flex-end', gap:8 }}>
              {!isMe && (
                <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                  {user?.role === 'customer' ? '🚗' : '👤'}
                </div>
              )}
              <div style={{ maxWidth:'72%' }}>
                <div style={{
                  background:   isMe ? '#e8b400' : 'rgba(255,255,255,0.1)',
                  color:        isMe ? '#1a1a2e' : WHITE,
                  padding:      '10px 14px',
                  borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  fontSize:     14,
                  lineHeight:   1.4,
                  wordBreak:    'break-word',
                }}>
                  {msg.text}
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:3, textAlign:isMe?'right':'left' }}>
                  {fmtTime(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Input */}
      <div style={{ background:'#1a1a2e', padding:'10px 14px', display:'flex', gap:10, alignItems:'center', flexShrink:0, borderTop:'0.5px solid rgba(255,255,255,0.1)' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message..."
          style={{ flex:1, padding:'11px 16px', background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:24, color:WHITE, fontSize:14, outline:'none' }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          style={{ width:44, height:44, borderRadius:'50%', background:text.trim()?'#e8b400':'rgba(255,255,255,0.08)', border:'none', cursor:text.trim()?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
          {sending ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  );
}

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
const MAP_BG_SCREENS = new Set(['splash','role','customer-signup','customer-login','otp','driver-signup','driver-pending','driver-login']);

export default function App() {
  const [screen,      setScreen]      = useState('splash');
  const [user,        setUser]        = useState(null);
  const [bookingId,   setBookingId]   = useState(null);
  const [pickupData,  setPickupData]  = useState(null);
  const [dropoffData, setDropoffData] = useState(null);
  const [loading,     setLoading]     = useState(true);

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
          if (d.status==='approved') { setUser({ uid:fu.uid, name:d.name, email:fu.email, role:'driver' }); setScreen('driver-dash'); }
          else setScreen('driver-pending');
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return <LoadingScreen/>;

  const props = { go:setScreen, user, setUser, bookingId, setBookingId, pickupData, setPickupData, dropoffData, setDropoffData };

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
    'driver-profile': <DriverProfile {...props}/>,
    'driver-settings':<DriverSettings {...props}/>,
    'chat':           <ChatScreen {...props}/>,
    'customer-profile': <CustomerProfile {...props}/>,
    'customer-settings':<CustomerSettings {...props}/>,
  };

  return (
    <div style={s.screen}>
      {MAP_BG_SCREENS.has(screen) && <MapBg/>}
      {screens[screen]||<Splash {...props}/>}
    </div>
  );
}