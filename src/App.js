import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, sendEmailVerification,
  onAuthStateChanged, signOut, setPersistence, browserLocalPersistence,
  updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, addDoc, collection,
  onSnapshot, updateDoc, query, where, orderBy, serverTimestamp, getDocs,
  arrayUnion, increment, arrayRemove
} from 'firebase/firestore';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
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
// Set persistence FIRST before any auth listeners - this survives page refresh
setPersistence(auth, browserLocalPersistence).catch(e => console.warn('Persistence:', e));
const db             = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Global flag to prevent onAuthStateChanged from overriding manual navigation
let _manualNavDone = false;
const storage = getStorage(app);
let messaging = null;
try { messaging = getMessaging(app); } catch(e) { console.warn('Messaging unavailable'); }
const functions_     = getFunctions(app);
const createPaymentIntentFn   = httpsCallable(functions_, 'createPaymentIntent');
const updateDriverLocationFn  = httpsCallable(functions_, 'updateDriverLocation');
const YELLOW = '#e8b400';
const DARK   = '#1a1a2e';
const GREEN  = '#1a9e5a';
const WHITE  = '#ffffff';

// Manchester, Jamaica centre
const MANCHESTER_CENTER = { lat: 18.0416, lng: -77.5036 };

// Send welcome email via EmailJS
const sendWelcomeEmail = async (toEmail, toName) => {
  try {
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  'service_h9ryisl',
        template_id: 'template_welcome',
        user_id:     '9-C6Nw3ZGGd5R7jto',
        template_params: {
          to_email:    toEmail,
          to_name:     toName,
          from_name:   'VilleCabs',
          reply_to:    'admin@villecabs.com',
          message:     'Welcome to VilleCabs! Your account is ready. Book your first ride at villecabs.com',
        },
      }),
    });
    console.log('Welcome email sent to', toEmail);
  } catch(e) {
    console.warn('Welcome email failed:', e);
  }
};
const LIBRARIES       = ['places'];
const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || '';


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
  screen:    { minHeight:'100vh', fontFamily:"'Segoe UI', sans-serif", background:'#ffffff', color:'#1a1a2e', position:'relative', zIndex:1 },
  mapBg:     { display:'none' },
  overlay:   { position:'fixed', inset:0, zIndex:1, background:'rgba(15,25,50,0.72)', backdropFilter:'blur(4px)' },
  content:   { position:'relative', zIndex:2, minHeight:'100vh', background:'#f5f6fa' },
  center:    { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'0 24px', background:'#f5f6fa' },
  card:      { background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:20, padding:'28px 24px', width:'100%', maxWidth:380, boxShadow:'0 4px 24px rgba(0,0,0,0.08)' },
  btnY:      { width:'100%', padding:'14px 20px', background:YELLOW, color:DARK, border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10 },
  btnO:      { width:'100%', padding:'14px 20px', background:'#ffffff', color:'#1a1a2e', border:'1.5px solid #d0d3e0', borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer', marginBottom:10 },
  btnG:      { width:'100%', padding:'14px 20px', background:GREEN, color:WHITE, border:'none', borderRadius:12, fontSize:15, fontWeight:600, cursor:'pointer', marginBottom:10 },
  inp:       { width:'100%', padding:'14px', background:'#ffffff', border:'1px solid #d0d3e0', borderRadius:10, color:'#1a1a2e', fontSize:16, marginBottom:12, boxSizing:'border-box', outline:'none' },
  lbl:       { fontSize:12, color:'#374151', marginBottom:5, display:'block', fontWeight:600 },
  topBar:    { background:'#ffffff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', minHeight:50 },
  backBtn:   { background:'none', border:'none', color:'#1a1a2e', fontSize:22, cursor:'pointer', padding:'0 8px 0 0', lineHeight:1, flexShrink:0 },
  topTitle:  { color:'#1a1a2e', fontSize:13, fontWeight:600, flex:1 },
  link:      { color:YELLOW, fontSize:13, cursor:'pointer', textAlign:'center', marginTop:8, background:'none', border:'none', width:'100%', display:'block', padding:4 },
  divLine:   { display:'flex', alignItems:'center', gap:10, margin:'8px 0 14px', color:'rgba(255,255,255,0.3)', fontSize:12 },
  errBox:    { background:'#fff0f0', border:'1px solid #ffcccc', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#cc2222' },
  successBox:{ background:'#f0fff8', border:'1px solid #99ddbb', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#1a7a45' },
  uploadBox: { border:'1.5px dashed rgba(255,255,255,0.25)', borderRadius:10, padding:14, textAlign:'center', cursor:'pointer', marginBottom:12, background:'rgba(15,20,40,0.6)' },
  uploadOk:  { border:'1.5px dashed #1a9e5a', borderRadius:10, padding:14, textAlign:'center', cursor:'pointer', marginBottom:12, background:'rgba(26,158,90,0.1)' },
};

// ── SVG fallback map (for auth screens) ──────────────────────────────────────
function GlobalStyles() {
  React.useEffect(() => {
    // Ensure proper mobile viewport
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.name='viewport'; document.head.appendChild(meta); }
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    document.documentElement.style.height = '100%';
    // Inject all keyframe animations
    const styleId = 'villecabs-keyframes';
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style');
      el.id = styleId;
      el.textContent = [
        '@keyframes fadeSlideIn { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }',
        '@keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }',
        '@keyframes gentleBounce { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-8px) } }',
        '@keyframes floatUp { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-20px) } }',
        '@keyframes driveAcross { 0% { transform:translateX(0) } 100% { transform:translateX(110vw) } }',
        '@keyframes autoScroll { 0% { transform:translateX(0) } 100% { transform:translateX(-50%) } }',
        '@keyframes slideInLeft { from { transform:translateX(-100%);opacity:0 } to { transform:translateX(0);opacity:1 } }',
        '@keyframes pulse { 0%,100% { opacity:1;transform:scale(1) } 50% { opacity:0.6;transform:scale(1.3) } }',
        '@keyframes spin { to { transform:rotate(360deg) } }',
      ].join(' ');
      document.head.appendChild(el);
    }
    document.body.style.height = '100%';
    document.body.style.overscrollBehavior = 'none';
    const style = document.createElement('style');
    style.innerHTML = '* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; } html, body { margin:0; padding:0; overflow-x:hidden; font-size:16px; background:#f5f6fa; } button { transition:all 0.15s ease; -webkit-appearance:none; } input, textarea, select { font-size:16px !important; } ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-thumb { background:rgba(107,33,168,0.3); border-radius:4px; }';
    document.head.appendChild(style);
    return () => { if (style.parentNode) style.parentNode.removeChild(style); };
  }, []);
  return null;
}

function MapBg() { return null; }

function VilleMap({ height = 260, center = MANCHESTER_CENTER, zoom = 14, onClick, markers = [], directions = null, children, expandable = false }) {
  const [expanded, setExpanded] = useState(false);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
    version: 'weekly',
  });
  useEffect(() => {
    if (isLoaded) {
      window.__googleMapsLoaded = true;
      window.dispatchEvent(new Event('google-maps-ready'));
    }
  }, [isLoaded]);

  // Use window height for mobile-aware sizing
  const mobileHeight = Math.min(height, window.innerHeight * 0.45);

  if (!isLoaded) return (
    <div style={{ height:mobileHeight, background:'#1a2744', display:'flex', alignItems:'center', justifyContent:'center', color:YELLOW, fontSize:13 }}>
      Loading map...
    </div>
  );

  const handleMapClick = (e) => {
    if (expandable && !expanded) {
      setExpanded(true);
    }
    if (onClick) onClick(e);
  };

  const mapEl = (
    <GoogleMap
      mapContainerStyle={{ width:'100%', height: expanded ? '100%' : mobileHeight }}
      center={center}
      zoom={expanded ? zoom + 1 : zoom}
      onClick={handleMapClick}
      options={{ styles:MAP_STYLE, disableDefaultUI:true, zoomControl:true, gestureHandling:'greedy' }}
    >
      {markers.map((m, i) => (
        <Marker key={i} position={m.position} label={m.label} title={m.title}/>
      ))}
      {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers:false }}/>}
      {children}
    </GoogleMap>
  );

  if (expanded) {
    return (
      <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:300, display:'flex', flexDirection:'column' }}>
        {mapEl}
        {/* Close bar */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(10,15,35,0.95)', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', backdropFilter:'blur(10px)' }}>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>
            {markers.length > 0 ? `📍 ${markers[markers.length-1]?.title || 'Location pinned'}` : 'Tap map to pin location'}
          </div>
          <button onClick={() => setExpanded(false)}
            style={{ padding:'10px 24px', background:YELLOW, color:DARK, border:'none', borderRadius:10, fontSize:14, fontWeight:700, cursor:'pointer' }}>
            ✓ Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'relative' }}>
      {mapEl}
      {/* Expand button */}
      {expandable && (
        <button onClick={() => setExpanded(true)}
          style={{ position:'absolute', top:10, right:10, background:'rgba(10,15,35,0.85)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:8, color:WHITE, fontSize:11, padding:'6px 10px', cursor:'pointer', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', gap:4 }}>
          ⛶ Expand
        </button>
      )}
    </div>
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
function TopBar({ title, onBack, go, user }) {
  return (
    <div style={s.topBar}>
      {onBack && <button style={s.backBtn} onClick={onBack}>←</button>}
      <img src="/logo.png" alt="VilleCabs"
        onClick={() => go ? go(user ? 'customer-dash' : 'splash') : null}
        style={{ height:32, width:'auto', objectFit:'contain', cursor:'pointer', flexShrink:0, maxWidth:160 }}/>
      <div style={{ display:'flex', gap:5, marginLeft:'auto' }}>
        <button onClick={() => go && go('partner-with-us')}
          style={{ padding:'4px 10px', background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:12, color:'#6b21a8', fontSize:10, fontWeight:600, cursor:'pointer' }}>
          Business
        </button>
        <button onClick={() => go && go('featured')}
          style={{ padding:'4px 10px', background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:12, color:'#6b21a8', fontSize:10, fontWeight:600, cursor:'pointer' }}>
          Featured
        </button>
      </div>
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

// ── FOOTER COMPONENT ─────────────────────────────────────────────────────────
function Footer({ go }) {
  return (
    <div style={{ background:'#000000', borderTop:'none', padding:'40px 24px 24px', marginTop:'auto' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        {/* Logo + tagline */}
        <div style={{ marginBottom:32 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <img src="/logo.png" alt="V" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }}/>
            <span style={{ fontSize:18, fontWeight:700, color:WHITE }}>VilleCabs</span>
          </div>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', margin:0 }}>Your city. Your ride. Your way.</p>
        </div>

        {/* Columns */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:32, marginBottom:32 }}>
          {/* Company */}
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:WHITE, marginBottom:14, textTransform:'uppercase', letterSpacing:1 }}>Company</div>
            {[
              ['About VilleCabs',     () => go('about-us')],
              ['Contact Us',          () => go('contact-us')],
              ['Help & Info',         () => go('help')],
              ['Privacy Policy',      () => window.open('/privacy','_blank')],
              ['Terms & Conditions',  () => go('terms')],
              ['Become a Driver',     () => go('driver-signup')],
              ['Partner With Us',     () => window.open('mailto:admin@villecabs.com?subject=VilleCabs Partnership', '_blank')],
            ].map(([label, action], i) => (
              <div key={i} onClick={action}
                style={{ fontSize:13, color:'#6b7280', marginBottom:10, cursor:'pointer' }}
                onMouseEnter={e => e.target.style.color=YELLOW}
                onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.5)'}>
                {label}
              </div>
            ))}
          </div>

          {/* Products */}
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:WHITE, marginBottom:14, textTransform:'uppercase', letterSpacing:1 }}>Products</div>
            {[
              ['🚕 VilleCabs Ride', null],
              ['🍔 VilleCabs Food', null, true],
              ['📦 VilleCabs Delivery', null, true],
              ['💼 VilleCabs Business', null, true],
            ].map(([label, action, soon], i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
                <span style={{ fontSize:13, color:soon?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.5)', cursor:action?'pointer':'default' }}
                  onMouseEnter={e => { if(action) e.target.style.color=YELLOW; }}
                  onMouseLeave={e => { if(action) e.target.style.color='rgba(255,255,255,0.5)'; }}
                  onClick={action||undefined}>
                  {label}
                </span>
                {soon && <span style={{ fontSize:9, background:'rgba(232,180,0,0.15)', color:YELLOW, borderRadius:4, padding:'1px 5px', fontWeight:500 }}>SOON</span>}
              </div>
            ))}
          </div>

          {/* Travel */}
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:WHITE, marginBottom:14, textTransform:'uppercase', letterSpacing:1 }}>Travel</div>
            <div onClick={() => window.open('https://www.tripadvisor.com/Tourism-g1877491-Mandeville_Manchester_Parish_Jamaica-Vacations.html','_blank')}
              style={{ fontSize:13, color:'#6b7280', marginBottom:10, cursor:'pointer' }}
              onMouseEnter={e => e.target.style.color=YELLOW}
              onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.5)'}>
              Explore Mandeville
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop:'0.5px solid rgba(255,255,255,0.06)', paddingTop:20, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
          <p style={{ fontSize:11, color:'rgba(255,255,255,0.25)', margin:0 }}>© 2026 VilleCabs · Mandeville, Manchester, Jamaica</p>
          <div style={{ display:'flex', gap:16 }}>
            <a href="https://wa.me/18765158113+1876-515-8113" target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'rgba(255,255,255,0.35)', textDecoration:'none' }}
              onMouseEnter={e => e.target.style.color=YELLOW} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.35)'}>
              💬 WhatsApp
            </a>
            <a href="mailto:daviskeneile@gmail.com" style={{ fontSize:12, color:'rgba(255,255,255,0.35)', textDecoration:'none' }}
              onMouseEnter={e => e.target.style.color=YELLOW} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.35)'}>
              📧 Email
            </a>
            <a href="https://www.villecabs.com" style={{ fontSize:12, color:'rgba(255,255,255,0.35)', textDecoration:'none' }}
              onMouseEnter={e => e.target.style.color=YELLOW} onMouseLeave={e => e.target.style.color='rgba(255,255,255,0.35)'}>
              🌐 villecabs.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
function Splash({ go }) {
  const [slide, setSlide] = useState(0);
  const slides = [
    { bg:'#6b21a8', emoji:'🚕', title:"Mandeville's Local Ride App",   sub:'Fast, safe, and reliable rides across Mandeville and Manchester.' },
    { bg:'#4c1d95', emoji:'🛡️', title:'Your Safety Comes First',       sub:'Verified drivers, GPS tracking, and SOS emergency button.' },
    { bg:'#1e1b4b', emoji:'🚗', title:'Drive With VilleCabs',          sub:'Use your vehicle, set your hours, and keep 85% of every fare.' },
    { bg:'#2d1b69', emoji:'🤝', title:'Partner With VilleCabs',        sub:'Help your customers move safely across Manchester.' },
  ];
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % 4), 5000);
    return () => clearInterval(t);
  }, []);
  const cur = slides[slide] || slides[0];
  return (
    <div style={{ background:'#ffffff', minHeight:'100vh' }}>

      {/* NAV */}
      <div style={{ background:'#ffffff', borderBottom:'1px solid #eee', padding:'10px 16px', display:'flex', alignItems:'center', position:'sticky', top:0, zIndex:100 }}>
        <img src="/logo.png" alt="VilleCabs" style={{ height:30, objectFit:'contain' }}/>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button onClick={() => go('partner-with-us')} style={{ padding:'5px 10px', background:'#f5f0ff', border:'1px solid #d8b4fe', borderRadius:12, color:'#6b21a8', fontSize:11, fontWeight:600, cursor:'pointer' }}>Partners</button>
          <button onClick={() => go('customer-login')} style={{ padding:'5px 10px', background:'#fff', border:'1px solid #e2e4ed', borderRadius:12, color:'#1a1a2e', fontSize:11, fontWeight:600, cursor:'pointer' }}>Login</button>
          <button onClick={() => go('role')} style={{ padding:'5px 10px', background:'#6b21a8', border:'none', borderRadius:12, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>Sign Up</button>
        </div>
      </div>

      {/* HERO */}
      <div style={{ background:cur.bg, padding:'48px 20px 40px', textAlign:'center' }}>
        <div style={{ fontSize:60, marginBottom:12 }}>{cur.emoji}</div>
        <h1 style={{ fontSize:26, fontWeight:800, color:'#fff', margin:'0 0 10px', lineHeight:1.2 }}>{cur.title}</h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.8)', margin:'0 0 24px', lineHeight:1.6 }}>{cur.sub}</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', marginBottom:24 }}>
          <button onClick={() => go('customer-login')} style={{ padding:'12px 22px', background:'#fff', color:'#6b21a8', border:'none', borderRadius:24, fontSize:14, fontWeight:700, cursor:'pointer' }}>Book a Ride</button>
          <button onClick={() => go('driver-signup')} style={{ padding:'12px 22px', background:'transparent', color:'#fff', border:'2px solid rgba(255,255,255,0.5)', borderRadius:24, fontSize:14, fontWeight:600, cursor:'pointer' }}>Drive With Us</button>
        </div>
        <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
          {[0,1,2,3].map(i => (
            <button key={i} onClick={() => setSlide(i)} style={{ width:i===slide?22:6, height:6, borderRadius:3, border:'none', background:i===slide?'#fff':'rgba(255,255,255,0.35)', cursor:'pointer', padding:0 }}/>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={{ padding:'28px 16px', background:'#f9f5ff' }}>
        <p style={{ fontSize:11, color:'#6b21a8', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', textAlign:'center', margin:'0 0 6px' }}>Simple Steps</p>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#1a1a2e', textAlign:'center', margin:'0 0 16px' }}>How It Works</h2>
        {[['1','📍','Pin Your Location','Set your pickup and destination on the map'],
          ['2','🚗','Choose Your Ride','Select VilleRide, VilleXL, or VilleMoto'],
          ['3','📲','Track Your Driver','Watch your driver arrive in real time'],
          ['4','💵','Pay and Arrive','Pay cash directly to your driver']
        ].map(([n,icon,title,desc],i) => (
          <div key={i} style={{ display:'flex', gap:12, background:'#fff', borderRadius:14, padding:'13px 15px', marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.05)', alignItems:'flex-start' }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'#6b21a8', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, flexShrink:0 }}>{n}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{icon} {title}</div>
              <div style={{ fontSize:12, color:'#555770', marginTop:2 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* WHY VILLECABS */}
      <div style={{ padding:'28px 16px' }}>
        <p style={{ fontSize:11, color:'#6b21a8', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', textAlign:'center', margin:'0 0 6px' }}>Our Promise</p>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#1a1a2e', textAlign:'center', margin:'0 0 16px' }}>Why VilleCabs?</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[['🏝️','Built for Mandeville','Made by locals for locals'],
            ['👤','Trusted Drivers','Verified before they drive'],
            ['💰','Clear Fares','No hidden charges'],
            ['🛡️','Safety First','SOS, GPS, share trip'],
            ['📱','Easy Booking','Book in under 2 minutes'],
            ['🤝','Local Support','Here when you need us']
          ].map(([icon,title,desc],i) => (
            <div key={i} style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:14, padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontSize:26, marginBottom:6 }}>{icon}</div>
              <div style={{ fontSize:12, fontWeight:700, color:'#1a1a2e', marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:10, color:'#555770', lineHeight:1.4 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* EXPLORE MANDEVILLE */}
      <div style={{ padding:'28px 0' }}>
        <div style={{ padding:'0 16px', marginBottom:14 }}>
          <p style={{ fontSize:11, color:'#6b21a8', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', margin:'0 0 4px' }}>Mandeville</p>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#1a1a2e', margin:0 }}>Explore Mandeville</h2>
        </div>
        <div style={{ display:'flex', gap:12, overflowX:'auto', padding:'4px 16px 8px' }}>
          {[['🏨','Hotels','Comfortable stays'],
            ['🍽️','Restaurants','Your favourite food spots'],
            ['🎭','Attractions','Local landmarks and parks'],
            ['🛍️','Shopping','Plazas and supermarkets'],
            ['🌙','Nightlife','Safe rides to clubs'],
            ['🏥','Hospitals','Medical appointment rides']
          ].map(([icon,title,desc],i) => (
            <div key={i} style={{ flexShrink:0, width:140, background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:14, padding:'14px 12px', textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:6 }}>{icon}</div>
              <div style={{ fontSize:12, fontWeight:700, color:'#1a1a2e', marginBottom:4 }}>{title}</div>
              <div style={{ fontSize:10, color:'#555', lineHeight:1.4, marginBottom:10 }}>{desc}</div>
              <button onClick={() => go('customer-login')} style={{ width:'100%', padding:'7px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:700, cursor:'pointer' }}>Book a Ride</button>
            </div>
          ))}
        </div>
      </div>

      {/* SAFETY */}
      <div style={{ padding:'28px 16px', background:'#1a1a2e' }}>
        <p style={{ fontSize:11, color:'#d8b4fe', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', textAlign:'center', margin:'0 0 6px' }}>Trust</p>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#fff', textAlign:'center', margin:'0 0 16px' }}>Your Safety Comes First</h2>
        {[['✅','Verified Drivers','Every driver is approved before receiving ride requests.'],
          ['📍','GPS Tracked','All rides are monitored live for your safety.'],
          ['🆘','SOS Emergency','Hold SOS 5 seconds for immediate emergency support.'],
          ['📲','Share Your Trip','Send live ride details to someone you trust.']
        ].map(([icon,title,desc],i) => (
          <div key={i} style={{ display:'flex', gap:12, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(167,139,250,0.2)', borderRadius:14, padding:'13px 15px', marginBottom:10 }}>
            <div style={{ fontSize:22, flexShrink:0 }}>{icon}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#d8b4fe', marginBottom:3 }}>{title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', lineHeight:1.5 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* FOR DRIVERS */}
      <div style={{ padding:'28px 16px', background:'#6b21a8' }}>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.7)', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', textAlign:'center', margin:'0 0 6px' }}>Earn</p>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#fff', textAlign:'center', margin:'0 0 8px' }}>Drive With VilleCabs</h2>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.8)', textAlign:'center', margin:'0 0 18px', lineHeight:1.6 }}>Use your vehicle, set your own schedule, and keep 85% of every fare.</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:18 }}>
          {[['⏰','Flexible Hours'],['💰','Keep 85%'],['🚗','Your Vehicle'],['🚀','Join Early']].map(([icon,label],i) => (
            <div key={i} style={{ background:'rgba(255,255,255,0.12)', borderRadius:12, padding:'11px', textAlign:'center' }}>
              <div style={{ fontSize:20, marginBottom:3 }}>{icon}</div>
              <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.9)' }}>{label}</div>
            </div>
          ))}
        </div>
        <button onClick={() => go('driver-signup')} style={{ display:'block', width:'100%', maxWidth:300, margin:'0 auto', padding:'13px', background:'#fff', color:'#6b21a8', border:'none', borderRadius:22, fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Become a Driver
        </button>
      </div>

      {/* FOR BUSINESSES */}
      <div style={{ padding:'28px 16px', background:'#f9f5ff' }}>
        <p style={{ fontSize:11, color:'#6b21a8', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', textAlign:'center', margin:'0 0 6px' }}>Business</p>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#1a1a2e', textAlign:'center', margin:'0 0 8px' }}>Partner With VilleCabs</h2>
        <p style={{ fontSize:13, color:'#555770', textAlign:'center', margin:'0 0 18px', lineHeight:1.6 }}>Help your customers, staff, and visitors move safely and conveniently.</p>
        <button onClick={() => go('partner-with-us')} style={{ display:'block', width:'100%', maxWidth:300, margin:'0 auto', padding:'13px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:22, fontSize:14, fontWeight:700, cursor:'pointer' }}>
          Become a Partner
        </button>
      </div>

      {/* PROMOTIONS */}
      <div style={{ padding:'28px 16px', background:'#1a1a2e' }}>
        <p style={{ fontSize:11, color:'#d8b4fe', fontWeight:700, letterSpacing:1.2, textTransform:'uppercase', textAlign:'center', margin:'0 0 6px' }}>Launch Offers</p>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#fff', textAlign:'center', margin:'0 0 14px' }}>Current Promotions</h2>
        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:4 }}>
          {[['WELCOME200','J$200 Off First Ride','New riders get J$200 off their first booking.'],
            ['VILLEFRIEND200','J$200 Referral Credit','Refer a friend and both get J$200 credit.'],
            ['AIRPORT200','Beat The Rush','J$200 off rides during peak hours.']
          ].map(([code,title,desc],i) => (
            <div key={i} style={{ flexShrink:0, width:200, background:'rgba(107,33,168,0.4)', border:'1px solid rgba(167,139,250,0.3)', borderRadius:14, padding:16 }}>
              <div style={{ fontSize:10, color:'#d8b4fe', fontWeight:700, letterSpacing:1, marginBottom:4 }}>{code}</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:6 }}>{title}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', lineHeight:1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ background:'#000', padding:'32px 20px', textAlign:'center' }}>
        <img src="/logo.png" alt="VilleCabs" style={{ height:36, objectFit:'contain', marginBottom:12 }}/>
        <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 14px' }}>Your city. Your ride. Your way.</p>
        <div style={{ display:'flex', gap:14, justifyContent:'center', flexWrap:'wrap', marginBottom:16 }}>
          {[['About',() => go('about-us')],['Contact',() => go('contact-us')],['Help',() => go('help')],['Driver Signup',() => go('driver-signup')],['Partner',() => go('partner-with-us')]].map(([l,a],i) => (
            <span key={i} onClick={a} style={{ fontSize:12, color:'#6b7280', cursor:'pointer' }}>{l}</span>
          ))}
        </div>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', margin:0 }}>admin@villecabs.com · +1876-515-8113</p>
        <p style={{ fontSize:10, color:'rgba(255,255,255,0.2)', margin:'6px 0 0' }}>2026 VilleCabs · Mandeville, Manchester, Jamaica</p>
      </div>

      {/* Driver login pill */}
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:50 }}>
        <button onClick={() => go('driver-login')} style={{ padding:'9px 16px', background:'#6b21a8', border:'none', borderRadius:22, color:'#fff', fontSize:11, cursor:'pointer', boxShadow:'0 4px 16px rgba(107,33,168,0.4)', fontWeight:600 }}>
          🚗 Driver Login
        </button>
      </div>

    </div>
  );
}

function LoginChoice({ go, user }) {
  return (
    <div style={s.content}>
      <TopBar title="Log In" go={go} user={user}/>
      <div style={{ ...s.center, padding:'0 24px' }}>
        <div style={{ width:'100%', maxWidth:360, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>👋</div>
          <h2 style={{ fontSize:22, fontWeight:600, color:WHITE, marginBottom:8 }}>Welcome back!</h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:40 }}>How would you like to log in?</p>

          <div onClick={() => go('login')}
            style={{ background:'rgba(232,180,0,0.08)', border:'1.5px solid rgba(232,180,0,0.3)', borderRadius:16, padding:24, marginBottom:14, cursor:'pointer', textAlign:'left', transition:'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(232,180,0,0.7)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(232,180,0,0.3)'}>
            <div style={{ fontSize:28, marginBottom:8 }}>🚕</div>
            <div style={{ fontSize:16, fontWeight:600, color:WHITE, marginBottom:4 }}>Customer Login</div>
            <div style={{ fontSize:13, color:'#6b7280' }}>Book rides in Manchester, Jamaica</div>
          </div>

          <div onClick={() => go('driver-login')}
            style={{ background:'rgba(26,158,90,0.08)', border:'1.5px solid rgba(26,158,90,0.25)', borderRadius:16, padding:24, cursor:'pointer', textAlign:'left', transition:'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(26,158,90,0.6)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(26,158,90,0.25)'}>
            <div style={{ fontSize:28, marginBottom:8 }}>🚗</div>
            <div style={{ fontSize:16, fontWeight:600, color:WHITE, marginBottom:4 }}>Driver Login</div>
            <div style={{ fontSize:13, color:'#6b7280' }}>Access your driver dashboard</div>
          </div>

          <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', marginTop:24 }}>
            New to VilleCabs? <span onClick={() => go('role')} style={{ color:YELLOW, cursor:'pointer' }}>Sign up</span>
          </p>
        </div>
      </div>
    <Footer go={go}/>
    </div>
  );
}

// ── ROLE SELECT ───────────────────────────────────────────────────────────────
function RoleSelect({ go, user }) {
  return (
    <div style={s.content}>
      <TopBar title="Join VilleCabs" go={go} user={user}/>
      <div style={{ ...s.center, paddingTop:40 }}>
        <p style={{ color:'#6b7280', marginBottom:24, fontSize:14 }}>How would you like to use VilleCabs?</p>
        <div style={{ width:'100%', maxWidth:360, display:'flex', flexDirection:'column', gap:14 }}>
          <div onClick={() => go('customer-signup')} style={{ ...s.card, cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:38, marginBottom:10 }}>👤</div>
            <div style={{ fontSize:16, fontWeight:500, marginBottom:4 }}>Book a Ride</div>
            <div style={{ fontSize:13, color:'#6b7280' }}>Request rides around Manchester</div>
          </div>
          <div onClick={() => go('driver-signup')} style={{ ...s.card, cursor:'pointer', textAlign:'center' }}>
            <div style={{ fontSize:38, marginBottom:10 }}>🚗</div>
            <div style={{ fontSize:16, fontWeight:500, marginBottom:4 }}>Become a Driver</div>
            <div style={{ fontSize:13, color:'#6b7280' }}>Earn money driving in Manchester</div>
          </div>
        </div>
      </div>
    <Footer go={go}/>
    </div>
  );
}

// ── CUSTOMER SIGNUP ───────────────────────────────────────────────────────────
function CustomerSignup({ go, setUser, user }) {
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
      const refCode = 'VC' + Math.random().toString(36).substring(2,7).toUpperCase();
      await setDoc(doc(db,'customers',cred.user.uid), { name:form.name, phone:form.phone, email:form.email, role:'customer', referralCode:refCode, referralCount:0, createdAt:serverTimestamp() });
      await sendEmailVerification(cred.user);
      sendWelcomeEmail(form.email, form.name); // non-blocking
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
      if (!snap.exists()) {
        await setDoc(doc(db,'customers',r.user.uid), { name:r.user.displayName, email:r.user.email, role:'customer', createdAt:serverTimestamp() });
        setUser({ uid:r.user.uid, name:r.user.displayName, email:r.user.email, role:'customer' });
        go('terms');
      } else {
        const d = snap.data();
        setUser({ uid:r.user.uid, name:d.name||r.user.displayName, email:r.user.email, role:'customer' });
        go(d.termsAccepted ? (d.tipsSeen ? 'customer-dash' : 'welcome-tips') : 'terms');
      }
    } catch(err) { setError(err.message); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Create Account" go={go} user={user}/>
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
  const [resent,    setResent]    = useState(false);
  const [cooldown,  setCooldown]  = useState(0);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const resend = async () => {
    if (cooldown > 0 || !auth.currentUser) return;
    setError('');
    try {
      await sendEmailVerification(auth.currentUser);
      setResent(true);
      setCooldown(60);
    } catch(err) {
      if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes before trying again.');
      } else {
        setError(err.message);
      }
    }
  };

  return (
    <div style={s.content}>
      <TopBar title="Verify Email" go={go} user={user}/>
      <div style={{ ...s.center, paddingTop:40 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>📧</div>
        <h2 style={{ fontSize:20, fontWeight:500, marginBottom:6 }}>Check your inbox</h2>
        <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:8, textAlign:'center' }}>We sent a verification link to</p>
        <p style={{ color:YELLOW, fontSize:14, fontWeight:500, marginBottom:28 }}>{user?.email||'your email'}</p>
        {resent && <div style={s.successBox}>✅ Verification email sent! Check your inbox and spam folder.</div>}
        {error  && <div style={s.errBox}>⚠️ {error}</div>}
        <div style={{ width:'100%', maxWidth:320 }}>
          <button style={s.btnY} onClick={async () => {
            await auth.currentUser?.reload();
            if (auth.currentUser?.emailVerified) {
              go(user?.role==='driver' ? 'driver-pending' : 'terms');
            } else {
              alert('Email not verified yet. Please check your inbox (and spam folder) and click the verification link.');
            }
          }}>I've verified my email →</button>
          <button
            style={{ ...s.btnO, opacity:cooldown>0?0.5:1 }}
            onClick={resend}
            disabled={cooldown>0}>
            {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend verification email'}
          </button>
          <p style={{ color:'rgba(255,255,255,0.3)', fontSize:11, textAlign:'center', marginTop:8 }}>
            Also check your spam or junk folder
          </p>
        </div>
      </div>
    <Footer go={go}/>
    </div>
  );
}

// ── CUSTOMER LOGIN ────────────────────────────────────────────────────────────
function CustomerLogin({ go, setUser, user }) {
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
      let data = {};
      try {
        const snap = await Promise.race([
          getDoc(doc(db,'customers',cred.user.uid)),
          new Promise((_,r) => setTimeout(() => r(new Error('timeout')), 6000))
        ]);
        if (snap && snap.exists && snap.exists()) data = snap.data();
      } catch(e) { console.warn('Firestore slow, proceeding anyway'); }
      setUser({ uid:cred.user.uid, name:data.name||cred.user.displayName||email, email:cred.user.email, role:'customer' });
      if (!data.termsAccepted) go('terms');
      else if (!data.tipsSeen) go('welcome-tips');
      else go('customer-dash');
    } catch(err) {
      const code = err.code||'';
      if (code.includes('user-not-found')||code.includes('wrong-password')||code.includes('invalid-credential')) {
        setError('Incorrect email or password.');
      } else {
        setError('Login failed. Check your connection and try again.');
      }
    }
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
      <TopBar title="Log In" go={go} user={user}/>
      <div style={{ padding:'32px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#1a1a2e", marginBottom:4 }}>Welcome back</h2>
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
    <Footer go={go}/>
    </div>
  );
}

// ── DRIVER LOGIN ──────────────────────────────────────────────────────────────
function DriverLogin({ go, user, setUser }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError('');
    try {
      // Step 1: Firebase Auth
      console.log('Step 1: signing in...');
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      console.log('Step 1 OK - uid:', cred.user.uid);

      // Step 2: Get Firestore driver doc
      console.log('Step 2: getting driver doc...');
      const snap = await getDoc(doc(db,'drivers',cred.user.uid));
      console.log('Step 2 OK - exists:', snap.exists());

      if (!snap.exists()) {
        setError('No driver account found with this email. Please apply to become a driver.');
        setLoading(false); return;
      }
      const data = snap.data();
      console.log('Driver status:', data.status);

      if (data.status === 'pending')   { setError('Your application is pending admin approval.'); setLoading(false); return; }
      if (data.status === 'rejected')  { setError('Your application was not approved. Contact support.'); setLoading(false); return; }
      if (data.status === 'suspended') { setError('Your account has been suspended. Contact support.'); setLoading(false); return; }

      // Step 3: Update last login
      updateDoc(doc(db,'drivers',cred.user.uid), { lastLogin:serverTimestamp() }).catch(()=>{});

      // Step 4: Navigate
      console.log('Step 4: navigating...');
      setUser({ uid:cred.user.uid, name:data.name||'Driver', email:cred.user.email, role:'driver' });
      _manualNavDone = true;
      if      (!data.termsAccepted) go('driver-terms');
      else if (!data.tipsSeen)      go('driver-welcome-tips');
      else                          go('driver-dash');
      console.log('Login complete!');

    } catch(err) {
      console.error('Login error:', err);
      const code = err.code || '';
      const msg  = err.message || String(err) || '';
      console.error('Code:', code, 'Msg:', msg);
      if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('invalid-login')) {
        setError('Incorrect email or password.');
      } else if (code.includes('user-not-found')) {
        setError('No account found with this email.');
      } else if (code.includes('too-many-requests')) {
        setError('Too many attempts. Please wait a few minutes.');
      } else if (code.includes('network')) {
        setError('Network error. Check your connection.');
      } else if (code.includes('permission-denied')) {
        setError('Account access denied. Please contact support.');
      } else {
        setError('Error: ' + (code || msg || 'Unknown error. Check console for details.'));
      }
      setLoading(false);
    }
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Login" go={go} user={user}/>
      <div style={{ padding:'32px 20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#1a1a2e', marginBottom:4 }}>Welcome back</h2>
        <p style={{ color:'#6b7280', fontSize:13, marginBottom:20 }}>Sign in to your driver account</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        <label style={s.lbl}>Email</label>
        <input style={s.inp} type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==='Enter' && handleLogin()}/>
        <label style={s.lbl}>Password</label>
        <input style={s.inp} type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==='Enter' && handleLogin()}/>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleLogin} disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        <button style={s.link} onClick={() => go('driver-signup')}>New driver? Apply here →</button>
        <button style={{ ...s.link, marginTop:4 }} onClick={() => go('login-choice')}>← Back</button>
      </div>
    </div>
  );
}

// ── DRIVER SIGNUP ─────────────────────────────────────────────────────────────
function DriverSignup({ go, user }) {
  const [form, setForm]       = useState({ name:'',trn:'',dob:'',phone:'',email:'',password:'',make:'',model:'',plate:'' });
  const [docs, setDocs]       = useState({ license:null, fitness:null, registration:null, profilePhoto:null, vehiclePhoto:null });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [previews, setPreviews] = useState({ profilePhoto:null, vehiclePhoto:null });
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = async () => {
    setError('');
    if (Object.values(form).some(v => !v)) { setError('Please fill in all fields.'); return; }
    if (!docs.license||!docs.fitness||!docs.registration) { setError('Please upload all 3 required documents.'); return; }
    if (!docs.profilePhoto) { setError('Please upload your profile photo.'); return; }
    if (!docs.vehiclePhoto)  { setError('Please upload a photo of your vehicle.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const maxSize = 5 * 1024 * 1024;
      for (const [k,f] of Object.entries(docs)) {
        if (f && f.size > maxSize) { setError(`${k} file must be under 5MB.`); setLoading(false); return; }
      }
      setError('Creating your account...');
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uploadFile = async (file, name, label) => {
        if (!file) return null;
        setError('Uploading ' + label + '...');
        const r = storageRef(storage, 'driver-docs/' + cred.user.uid + '/' + name);
        const snap = await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
        return await getDownloadURL(snap.ref);
      };
      const licenseUrl      = await uploadFile(docs.license,       'license',       "Driver's Licence");
      const fitnessUrl      = await uploadFile(docs.fitness,       'fitness',       'Fitness Certificate');
      const registrationUrl = await uploadFile(docs.registration,  'registration',  'Vehicle Registration');
      const profilePhotoUrl = await uploadFile(docs.profilePhoto,  'profilePhoto',  'Profile Photo');
      const vehiclePhotoUrl = await uploadFile(docs.vehiclePhoto,  'vehiclePhoto',  'Vehicle Photo');
      setError('Saving your profile...');
      await setDoc(doc(db,'drivers',cred.user.uid), {
        name:form.name, trn:form.trn, dob:form.dob, phone:form.phone, email:form.email,
        vehicleMake:form.make, vehicleModel:form.model, licensePlate:form.plate,
        status:'pending', role:'driver', createdAt:serverTimestamp(),
        profilePhotoUrl, vehiclePhotoUrl,
        docs:{ license:licenseUrl, fitness:fitnessUrl, registration:registrationUrl, profilePhoto:profilePhotoUrl, vehiclePhoto:vehiclePhotoUrl },
      });
      setError('');
      sendWelcomeEmail(form.email, form.name);
      go('driver-pending');
    } catch(e) {
      console.error('Signup error:', e);
      setError(e.code==='auth/email-already-in-use' ? 'This email is already registered.' : 'Signup failed: ' + e.message);
      setLoading(false);
    }
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Registration" go={go} user={user}/>
      <div style={{ padding:'20px', maxWidth:420, margin:'0 auto' }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:'#1a1a2e', marginBottom:4 }}>Drive with VilleCabs</h2>
        <p style={{ color:'#6b7280', fontSize:13, marginBottom:16 }}>Fill in your details to apply as a VilleCabs driver.</p>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        {[['name','Full Legal Name','As on your ID','text'],['trn','TRN','000-000-000','text'],['dob','Date of Birth','DD/MM/YYYY','text'],['phone','Phone Number','+1876-XXX-XXXX','tel'],['email','Email Address','you@email.com','email'],['password','Password','At least 6 characters','password']].map(([k,lbl,ph,type]) => (
          <div key={k}>
            <label style={s.lbl}>{lbl}</label>
            <input style={s.inp} type={type} placeholder={ph} value={form[k]} onChange={e => set(k,e.target.value)}/>
          </div>
        ))}
        <div style={{ borderTop:'1px solid #e5e7eb', marginTop:8, paddingTop:16, marginBottom:8 }}>
          <label style={s.lbl}>Vehicle Make</label>
          <input style={s.inp} type="text" placeholder="e.g. Toyota" value={form.make} onChange={e => set('make',e.target.value)}/>
          <label style={s.lbl}>Vehicle Model</label>
          <input style={s.inp} type="text" placeholder="e.g. Corolla" value={form.model} onChange={e => set('model',e.target.value)}/>
          <label style={s.lbl}>Licence Plate</label>
          <input style={s.inp} type="text" placeholder="e.g. 1234AB" value={form.plate} onChange={e => set('plate',e.target.value)}/>
        </div>

        {/* Profile Photo */}
        <div style={{ marginBottom:14 }}>
          <label style={s.lbl}>Profile Photo *</label>
          <input type="file" id="doc-profilePhoto" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(f){setDocs(p=>({...p,profilePhoto:f}));setPreviews(p=>({...p,profilePhoto:URL.createObjectURL(f)}));} }}/>
          <div onClick={() => document.getElementById('doc-profilePhoto').click()} style={{ border:'2px dashed '+(docs.profilePhoto?'#1a9e5a':'#e9d5ff'), borderRadius:14, padding:16, textAlign:'center', cursor:'pointer', background:docs.profilePhoto?'#f0fff4':'#f9f5ff' }}>
            {previews.profilePhoto ? <div><img src={previews.profilePhoto} alt="Profile" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'3px solid #1a9e5a' }}/><div style={{ fontSize:12, color:'#1a9e5a', fontWeight:600, marginTop:6 }}>✅ Profile Photo Added</div></div>
            : <div><div style={{ fontSize:32, marginBottom:6 }}>📸</div><div style={{ fontSize:13, fontWeight:600, color:'#6b21a8' }}>Upload Profile Photo</div><div style={{ fontSize:11, color:'#888', marginTop:2 }}>Clear face photo required</div></div>}
          </div>
        </div>

        {/* Vehicle Photo */}
        <div style={{ marginBottom:14 }}>
          <label style={s.lbl}>Vehicle Photo *</label>
          <input type="file" id="doc-vehiclePhoto" accept="image/*" style={{ display:'none' }} onChange={e => { const f=e.target.files?.[0]; if(f){setDocs(p=>({...p,vehiclePhoto:f}));setPreviews(p=>({...p,vehiclePhoto:URL.createObjectURL(f)}));} }}/>
          <div onClick={() => document.getElementById('doc-vehiclePhoto').click()} style={{ border:'2px dashed '+(docs.vehiclePhoto?'#1a9e5a':'#e9d5ff'), borderRadius:14, padding:16, textAlign:'center', cursor:'pointer', background:docs.vehiclePhoto?'#f0fff4':'#f9f5ff', marginBottom:4 }}>
            {previews.vehiclePhoto ? <div><img src={previews.vehiclePhoto} alt="Vehicle" style={{ width:'100%', maxHeight:120, objectFit:'cover', borderRadius:10, border:'3px solid #1a9e5a' }}/><div style={{ fontSize:12, color:'#1a9e5a', fontWeight:600, marginTop:6 }}>✅ Vehicle Photo Added</div></div>
            : <div><div style={{ fontSize:32, marginBottom:6 }}>🚗</div><div style={{ fontSize:13, fontWeight:600, color:'#6b21a8' }}>Upload Vehicle Photo</div><div style={{ fontSize:11, color:'#888', marginTop:2 }}>Show full vehicle with licence plate</div></div>}
          </div>
        </div>

        {/* Documents */}
        <label style={s.lbl}>Required Documents</label>
        {[['license',"Driver's Licence",'🪪'],['fitness','Vehicle Fitness','📋'],['registration','Vehicle Registration','📄']].map(([k,lbl,icon]) => (
          <div key={k} style={{ marginBottom:10 }}>
            <input type="file" id={'doc-'+k} accept="image/*,application/pdf" style={{ display:'none' }} onChange={e => { if(e.target.files?.[0]) setDocs(p=>({...p,[k]:e.target.files[0]})); }}/>
            <div onClick={() => document.getElementById('doc-'+k).click()} style={{ border:'2px dashed '+(docs[k]?'#1a9e5a':'#e9d5ff'), borderRadius:12, padding:'12px 14px', cursor:'pointer', background:docs[k]?'#f0fff4':'#f9f5ff', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:22 }}>{docs[k]?'✅':icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{lbl}</div>
                <div style={{ fontSize:11, color:docs[k]?'#1a9e5a':'#888' }}>{docs[k]?docs[k].name:'Tap to upload'}</div>
              </div>
            </div>
          </div>
        ))}

        <button style={{ ...s.btnY, marginTop:8, opacity:(loading||Object.values(form).some(v=>!v)||!docs.license||!docs.fitness||!docs.registration||!docs.profilePhoto||!docs.vehiclePhoto)?0.5:1 }}
          onClick={handleSubmit}
          disabled={loading||Object.values(form).some(v=>!v)||!docs.license||!docs.fitness||!docs.registration||!docs.profilePhoto||!docs.vehiclePhoto}>
          {loading ? 'Submitting...' : 'Submit Application'}
        </button>
        <button style={s.link} onClick={() => go('login-choice')}>Already a driver? Login →</button>
      </div>
    </div>
  );
}


function DriverPending({ go, user }) {
  return (
    <div style={s.content}>
      <TopBar title="Application Submitted" go={go} user={null}/>
      <div style={{ ...s.center, paddingTop:20 }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <div style={{ background:'rgba(232,180,0,0.1)', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:16, padding:24, textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>
            <div style={{ fontSize:17, fontWeight:500, marginBottom:8 }}>Pending Admin Approval</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:1.6 }}>Our team in Manchester will review your documents and activate your account within 24–48 hours.</div>
          </div>
          <div style={{ background:'rgba(15,20,40,0.65)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:16, marginBottom:20 }}>
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


// ── TERMS & AGREEMENTS ────────────────────────────────────────────────────────
function TermsScreen({ go, user }) {
  const [agreed1, setAgreed1] = useState(false);
  const [agreed2, setAgreed2] = useState(false);
  const [agreed3, setAgreed3] = useState(false);
  const canContinue = agreed1 && agreed2 && agreed3;

  const handleContinue = async () => {
    // Mark terms accepted in Firestore
    try { await updateDoc(doc(db,'customers',user.uid), { termsAccepted:true, termsAcceptedAt:serverTimestamp() }); } catch(e) {}
    go('welcome-tips');
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <div style={{ background:'rgba(10,15,35,0.92)', padding:'16px 18px', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', gap:10 }}>
        <img src="/logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
        <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs</span>
      </div>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:100 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:WHITE, marginBottom:4 }}>Terms & Agreements</h2>
        <p style={{ fontSize:13, color:'#6b7280', marginBottom:20 }}>Please read and agree to continue</p>

        {/* Terms Box */}
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:18, marginBottom:16, maxHeight:300, overflowY:'auto' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8', marginBottom:12 }}>VilleCabs Terms of Service</div>
          {[
            ['1. Acceptance', 'By using VilleCabs you agree to these terms. If you do not agree, please do not use the service.'],
            ['2. Eligibility', 'You must be 18 years or older to use VilleCabs. By continuing you confirm you meet this requirement.'],
            ['3. Service', 'VilleCabs connects passengers with independent local drivers in Manchester, Jamaica. VilleCabs is a platform and is not responsible for the actions of drivers.'],
            ['4. Fares', 'Fares are calculated based on distance. The fare shown at booking is the amount you agree to pay. Fares are paid in cash directly to the driver unless otherwise stated.'],
            ['5. Cancellations', 'You may cancel a ride before a driver accepts it. Once a driver is en route, cancellations may be subject to a cancellation notice.'],
            ['6. Safety', 'VilleCabs takes safety seriously. All drivers are vetted and approved by our admin team. You can use the SOS button at any time during a ride.'],
            ['7. Conduct', 'You agree to treat drivers with respect. Abusive or dangerous behaviour may result in your account being suspended.'],
            ['8. Privacy', 'We collect your name, phone number, email and location during rides. This information is used only to provide the service and is not sold to third parties.'],
            ['9. Changes', 'VilleCabs reserves the right to update these terms at any time. Continued use of the app means you accept any changes.'],
            ['10. Contact', 'For questions or concerns contact us via WhatsApp at +1876-515-8113 or email daviskeneile@gmail.com'],
          ].map(([title, text], i) => (
            <div key={i} style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:WHITE, marginBottom:4 }}>{title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>{text}</div>
            </div>
          ))}
        </div>

        {/* Checkboxes */}
        {[
          [agreed1, setAgreed1, 'I have read and agree to the VilleCabs Terms of Service'],
          [agreed2, setAgreed2, 'I confirm I am 18 years of age or older'],
          [agreed3, setAgreed3, 'I agree to the VilleCabs Privacy Policy and consent to my data being used to provide the service'],
        ].map(([val, setter, label], i) => (
          <div key={i} onClick={() => setter(!val)}
            style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', background:'rgba(15,20,40,0.6)', border:`1px solid ${val?YELLOW:'rgba(255,255,255,0.1)'}`, borderRadius:10, marginBottom:10, cursor:'pointer' }}>
            <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${val?YELLOW:'rgba(255,255,255,0.3)'}`, background:val?YELLOW:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
              {val && <span style={{ color:DARK, fontSize:13, fontWeight:700 }}>✓</span>}
            </div>
            <span style={{ fontSize:13, color:'rgba(255,255,255,0.8)', lineHeight:1.5 }}>{label}</span>
          </div>
        ))}

        <button
          onClick={handleContinue}
          disabled={!canContinue}
          style={{ ...s.btnY, opacity:canContinue?1:0.4, marginTop:8 }}>
          Agree & Continue →
        </button>
      </div>
    <Footer go={go}/>
    </div>
  );
}

// ── WELCOME TIPS ──────────────────────────────────────────────────────────────
function WelcomeTips({ go, user }) {
  const [step, setStep] = useState(0);

  const tips = [
    {
      icon: '📍',
      title: 'Pin Your Exact Location',
      desc: 'Always place your pickup and drop-off pins as close as possible to your actual location. This helps your driver find you quickly and ensures your fare is calculated accurately.',
      color: GREEN,
    },
    {
      icon: '📡',
      title: 'Enable Location Services',
      desc: "Turn on your phone's GPS/Location before booking. Go to your phone Settings → Location → turn On. This allows the app to track your ride in real time.",
      color: YELLOW,
    },
    {
      icon: '💬',
      title: 'Chat With Your Driver',
      desc: 'Once a driver accepts your ride you can chat with them directly in the app. Use this to share extra directions, landmark details, or to confirm your estimated fare.',
      color: '#a78bfa',
    },
    {
      icon: '🏘️',
      title: 'Rural Areas & Unnamed Roads',
      desc: "If you're in an area with unnamed roads, use the \"Additional Details\" field when pinning your location. Describe your location — e.g. \"Top of Caledonia Road, near the blue gate, Hatfield district.\"",
      color: '#38bdf8',
    },
    {
      icon: '🆘',
      title: 'SOS Emergency Button',
      desc: 'Your safety is our priority. During any ride, hold the SOS button for 5 seconds to send an emergency alert with your location to our admin team immediately.',
      color: '#f09595',
    },
  ];

  const handleContinue = async () => {
    if (step < tips.length - 1) { setStep(step + 1); return; }
    // Mark tips seen in Firestore
    try { await updateDoc(doc(db,'customers',user.uid), { tipsSeen:true }); } catch(e) {}
    go('customer-dash');
  };

  const t = tips[step];

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <div style={{ background:'rgba(10,15,35,0.92)', padding:'16px 18px', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
          <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs</span>
        </div>
        <span style={{ color:'#888', fontSize:12 }}>{step+1} of {tips.length}</span>
      </div>

      <div style={{ ...s.center, paddingTop:0 }}>
        <div style={{ width:'100%', maxWidth:420, padding:'0 20px' }}>
          {/* Progress dots */}
          <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:40 }}>
            {tips.map((_,i) => (
              <div key={i} style={{ width:i===step?24:8, height:8, borderRadius:4, background:i===step?t.color:'rgba(255,255,255,0.15)', transition:'all 0.3s' }}/>
            ))}
          </div>

          {/* Tip card */}
          <div style={{ background:'rgba(15,20,40,0.75)', border:`1.5px solid ${t.color}33`, borderRadius:20, padding:28, marginBottom:32, textAlign:'center', backdropFilter:'blur(10px)' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>{t.icon}</div>
            <div style={{ fontSize:18, fontWeight:600, color:t.color, marginBottom:12 }}>{t.title}</div>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>{t.desc}</div>
          </div>

          <button onClick={handleContinue} style={{ ...s.btnY, background:t.color, color:t.color===YELLOW?DARK:WHITE }}>
            {step < tips.length - 1 ? 'Next →' : 'Got it — Take Me In! 🚕'}
          </button>
          {step < tips.length - 1 && (
            <button onClick={async () => {
              try { await updateDoc(doc(db,'customers',user.uid), { tipsSeen:true }); } catch(e) {}
              go('customer-dash');
            }} style={s.link}>Skip all tips</button>
          )}
        </div>
      </div>
    <Footer go={go}/>
    </div>
  );
}

// ── ABOUT US ──────────────────────────────────────────────────────────────────
function AboutUs({ go, user }) {
  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="About VilleCabs" go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/logo.png" alt="VilleCabs" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(232,180,0,0.4)', marginBottom:12 }}/>
          <h2 style={{ fontSize:20, fontWeight:700, color:WHITE, marginBottom:4 }}>Welcome to VilleCabs</h2>
          <p style={{ fontSize:13, color:YELLOW, fontStyle:'italic' }}>Your city. Your ride. Your way.</p>
        </div>

        {[
          { text:'VilleCabs is a modern ride-hailing and taxi platform built for the people of Mandeville, Manchester, Jamaica. Created to bring convenience, reliability, and opportunity to our community, VilleCabs connects passengers with trusted local drivers through a simple and accessible transportation service.' },
          { text:"We're bringing the ease and flexibility of app-based transportation to Mandeville while supporting local drivers and creating new earning opportunities within our parish." },
          { text:"Whether you need a quick ride across town, transportation to work, school, appointments, shopping, or getting home safely — VilleCabs is designed to make moving around easier." },
        ].map((p,i) => (
          <p key={i} style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.8, marginBottom:14 }}>{p.text}</p>
        ))}

        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8', marginBottom:10 }}>Why Choose VilleCabs?</div>
          {['Fast and reliable rides','Local drivers who know Mandeville','Safe and convenient transportation','Flexible earning opportunities for drivers','Built with the community in mind'].map((item,i) => (
            <div key={i} style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginBottom:6, display:'flex', gap:8 }}>
              <span style={{ color:GREEN }}>✔</span>{item}
            </div>
          ))}
        </div>

        <div style={{ background:'rgba(26,158,90,0.08)', border:'0.5px solid rgba(26,158,90,0.25)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:600, color:GREEN, marginBottom:8 }}>Our Mission</div>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.7, margin:0 }}>To provide safe, dependable, and affordable transportation while empowering local drivers and improving how people move across Mandeville and Manchester.</p>
        </div>

        <div style={{ background:'rgba(168,139,250,0.08)', border:'0.5px solid rgba(168,139,250,0.25)', borderRadius:14, padding:16, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#a78bfa', marginBottom:8 }}>Our Vision</div>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.7, margin:0 }}>To become the leading ride-hailing service in Manchester and expand transportation access across Jamaica through innovation, trust, and community.</p>
        </div>

        <p style={{ fontSize:13, color:YELLOW, textAlign:'center', fontStyle:'italic', marginBottom:20 }}>Ride local. Move smarter. Grow together with VilleCabs.</p>

        <div style={{ background:'rgba(15,20,40,0.7)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14, fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:2 }}>
          <div>📍 Serving Mandeville & Manchester, Jamaica</div>
          <div>🌐 villecabs.com</div>
          <div>📞 Call / WhatsApp: <a href="https://wa.me/18765158113+1876-515-8113" style={{ color:YELLOW, textDecoration:'none' }}>+1876-515-8113</a></div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── CONTACT US ────────────────────────────────────────────────────────────────
function ContactUs({ go, user }) {
  const [form,    setForm]    = useState({ name:user?.name||'', email:user?.email||'', subject:'', message:'' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSend = async () => {
    setError(''); setSuccess('');
    if (!form.name||!form.email||!form.subject||!form.message) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      // Save to Firestore contact_submissions collection
      await addDoc(collection(db,'contact_submissions'), {
        name:      form.name,
        email:     form.email,
        subject:   form.subject,
        message:   form.message,
        userId:    user?.uid || null,
        createdAt: serverTimestamp(),
      });
      // Send via EmailJS
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          service_id:  'service_h9ryisl',
          template_id: 'template_ss6rofa',
          user_id:     '9-C6Nw3ZGGd5R7jto',
          template_params: {
            to_email:  'daviskeneile@gmail.com',
            to_name:   'VilleCabs Admin',
            from_name: form.name,
            from_email:form.email,
            subject:   form.subject,
            otp_code:  `Message from: ${form.name} (${form.email})\n\nSubject: ${form.subject}\n\n${form.message}`,
          },
        }),
      });
      setSuccess('Your message has been sent! We will get back to you shortly.');
      setForm({ name:user?.name||'', email:user?.email||'', subject:'', message:'' });
    } catch(err) {
      // Even if email fails, message is saved to Firestore
      setSuccess('Your message has been received! We will get back to you shortly.');
    }
    setLoading(false);
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <div style={s.topBar}><span style={s.topTitle}>Contact Support</span></div>
      <div style={{ padding:'14px 16px 0' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
          {[
            ['💬','WhatsApp',  () => window.open('https://wa.me/18765158113+1876-515-8113','_blank')],
            ['📧','Email',     () => window.open('mailto:admin@villecabs.com','_blank')],
            ['🚨','Safety',    () => { document.getElementById('subj-inp')?.focus?.(); }],
            ['🚗','Ride Issue',() => { document.getElementById('subj-inp')?.focus?.(); }],
          ].map(([icon,label,action],i) => (
            <div key={i} onClick={action} style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:12, padding:'12px', textAlign:'center', cursor:'pointer', boxShadow:'0 2px 6px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#1a1a2e' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 18px 40px', maxWidth:480, margin:'0 auto' }}>

        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:12, padding:14, marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:28 }}>💬</span>
          <div>
            <div style={{ fontSize:13, color:WHITE, fontWeight:500 }}>WhatsApp us directly</div>
            <a href="https://wa.me/18765158113+1876-515-8113" target="_blank" rel="noopener noreferrer"
              style={{ fontSize:13, color:YELLOW, textDecoration:'none' }}>+1876-515-8113</a>
          </div>
        </div>

        <div style={{ fontSize:14, fontWeight:500, color:WHITE, marginBottom:14 }}>Send us a message</div>
        {error   && <div style={s.errBox}>⚠️ {error}</div>}
        {success && <div style={s.successBox}>✅ {success}</div>}

        <label style={s.lbl}>Full Name</label>
        <input style={s.inp} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Your name"/>
        <label style={s.lbl}>Email Address</label>
        <input style={s.inp} type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="your@email.com"/>
        <label style={s.lbl}>Subject</label>
        <input style={s.inp} value={form.subject} onChange={e=>set('subject',e.target.value)} placeholder="e.g. Issue with my ride"/>
        <label style={s.lbl}>Message</label>
        <textarea style={{ ...s.inp, height:120, resize:'vertical', fontFamily:'inherit' }} value={form.message} onChange={e=>set('message',e.target.value)} placeholder="Describe your issue or question..."/>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleSend} disabled={loading}>
          {loading ? 'Sending...' : 'Send Message'}
        </button>
      </div>
    <Footer go={go}/>
    </div>
  );
}

// ── HELP SCREEN ───────────────────────────────────────────────────────────────
function HelpScreen({ go, user }) {
  const [section, setSection] = useState(null); // 'terms' | 'tips'

  if (section === 'terms') return <TermsScreen go={(s) => s==='welcome-tips'?setSection(null):go(s)} user={user} readOnly/>;
  if (section === 'tips')  return <WelcomeTips go={(s) => s==='customer-dash'?setSection(null):go(s)} user={user} readOnly/>;

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Help & Info" go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto' }}>
        {[
          { icon:'📋', title:'Terms & Agreements', desc:'View VilleCabs terms of service and privacy policy', action:() => setSection('terms') },
          { icon:'💡', title:'App Tips & Guide', desc:'How to use VilleCabs for the best experience', action:() => setSection('tips') },
          { icon:'🙋', title:'Contact Us', desc:'Get in touch with our support team', action:() => go('contact-us') },
          { icon:'ℹ️', title:'About VilleCabs', desc:'Learn more about who we are', action:() => go('about-us') },
        ].map((item,i) => (
          <div key={i} onClick={item.action}
            style={{ background:'rgba(15,20,40,0.7)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'16px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
            <div style={{ fontSize:26, width:44, height:44, background:'rgba(255,255,255,0.05)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{item.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>{item.title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{item.desc}</div>
            </div>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:18 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CUSTOMER DASHBOARD ────────────────────────────────────────────────────────
// ── DASH HERO SLIDER ──────────────────────────────────────────────────────────
function DashHeroSlider({ go }) {
  const [slide, setSlide] = useState(0);
  const slides = [
    { bg:'#111111', icon:'🚕', title:'Safe rides in Manchester',  sub:'Trusted local drivers · GPS tracked · SOS protected',    accent:'#1a9e5a' },
    { bg:'#0f1a35', icon:'📍', title:'Book rides across Mandeville', sub:'Fast, simple, and built for your city',             accent:'#e8b400' },
    { bg:'#1a0a2a', icon:'🛡️', title:'Your safety comes first',  sub:'Verify your driver, share your trip, and use SOS anytime', accent:'#e8b400' },
    { bg:'#0a2a1a', icon:'✨', title:'VilleCabs is growing',      sub:'More drivers, more routes, more convenience',           accent:'#1a9e5a' },
  ];
  useEffect(() => { const t=setInterval(()=>setSlide(s=>(s+1)%slides.length),5000); return ()=>clearInterval(t); }, [slides.length]);
  const cur = slides[slide];
  return (
    <div style={{ margin:'16px 16px 0', borderRadius:16, overflow:'hidden', position:'relative', minHeight:130, background: cur.bg, transition:'background 0.8s ease', display:'flex', alignItems:'center', padding:'16px 20px' }}>
      {/* Floating taxis */}
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ position:'absolute', fontSize:20, opacity:0.08, top:(20+i*25)+'%', left:'-30px', animation:'driveAcross '+(12+i*3)+'s linear infinite', animationDelay:(i*2)+'s', pointerEvents:'none' }}>🚕</div>
      ))}
      <div key={slide} style={{ animation:'fadeSlideIn 0.5s ease', flex:1, position:'relative', zIndex:1 }}>
        <div style={{ fontSize:32, marginBottom:6 }}>{cur.icon}</div>
        <div style={{ fontSize:17, fontWeight:700, color:'#ffffff', marginBottom:4, lineHeight:1.3 }}>{cur.title}</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginBottom:12, lineHeight:1.5 }}>{cur.sub}</div>
        <button onClick={() => go('pin-pickup')} style={{ padding:'7px 18px', background: cur.accent, border:'none', borderRadius:20, color: cur.accent==='#e8b400'?'#0f1a35':'#ffffff', fontSize:12, fontWeight:700, cursor:'pointer' }}>Book Now →</button>
      </div>
      {/* Slide dots */}
      <div style={{ position:'absolute', bottom:10, right:14, display:'flex', gap:5 }}>
        {slides.map((_, i) => (
          <button key={i} onClick={() => setSlide(i)} style={{ width: i===slide?20:5, height:5, borderRadius:3, border:'none', background: i===slide?'#ffffff':'rgba(255,255,255,0.3)', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
        ))}
      </div>
    </div>
  );
}

// ── DASH SAFETY SLIDER ─────────────────────────────────────────────────────────
function DashSafetySlider() {
  const [slide, setSlide] = useState(0);
  const tips = [
    { icon:'👀', title:'Verify Your Driver',  desc:'Check plate number, car colour, vehicle make, and driver photo.' },
    { icon:'📲', title:'Share Your Trip',     desc:'Send live ride details to a trusted friend or family member.' },
    { icon:'🆘', title:'Use SOS Emergency',   desc:'Hold SOS for 5 seconds if you need urgent help.' },
    { icon:'💵', title:'Cash Ready',          desc:'Have your cash ready at the end of your ride.' },
    { icon:'⭐', title:'Rate Your Driver',    desc:'Your feedback helps keep VilleCabs safe and reliable.' },
  ];
  useEffect(() => { const t=setInterval(()=>setSlide(s=>(s+1)%tips.length),4000); return ()=>clearInterval(t); }, [tips.length]);
  return (
    <div style={{ padding:'20px 16px 0' }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#999bbb', marginBottom:12, textTransform:'uppercase', letterSpacing:0.8 }}>Safety Tips</div>
      <div style={{ background:'#0f1a35', borderRadius:16, padding:'20px', position:'relative', overflow:'hidden', minHeight:140 }}>
        <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle, rgba(232,180,0,0.15) 0%, transparent 70%)', pointerEvents:'none' }}/>
        <div key={slide} style={{ animation:'fadeSlideIn 0.5s ease', position:'relative', zIndex:1, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:36, flexShrink:0 }}>{tips[slide].icon}</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#e8b400', marginBottom:6 }}>{tips[slide].title}</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>{tips[slide].desc}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:5, marginTop:16, position:'relative', zIndex:1 }}>
          {tips.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} style={{ width: i===slide?20:5, height:5, borderRadius:3, border:'none', background: i===slide?'#e8b400':'rgba(255,255,255,0.25)', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DASH DRIVER SLIDER ─────────────────────────────────────────────────────────
function DashDriverSlider({ go }) {
  const [slide, setSlide] = useState(0);
  const slides = [
    { icon:'💰', title:'Earn With Your Vehicle', desc:'Keep 85% of every fare.' },
    { icon:'⏰', title:'Flexible Hours',          desc:'Drive when it works for you.' },
    { icon:'📍', title:'Local Trips',             desc:'Serve Mandeville and Manchester.' },
    { icon:'🚀', title:'Join Early',              desc:'Be part of a growing local platform.' },
    { icon:'🤝', title:'Driver Support',          desc:'Get onboarding and support from VilleCabs.' },
  ];
  useEffect(() => { const t=setInterval(()=>setSlide(s=>(s+1)%slides.length),4000); return ()=>clearInterval(t); }, [slides.length]);
  return (
    <div style={{ margin:'20px 16px 0', background:'#111111', border:'1px solid rgba(232,180,0,0.3)', borderRadius:16, padding:'20px', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', right:-20, top:-20, opacity:0.06, fontSize:100 }}>💰</div>
      <div style={{ fontSize:11, color:'#e8b400', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>For Drivers</div>
      <div style={{ fontSize:17, fontWeight:700, color:'#ffffff', marginBottom:14 }}>Drive With VilleCabs</div>
      <div key={slide} style={{ animation:'fadeSlideIn 0.5s ease', background:'rgba(255,255,255,0.06)', borderRadius:12, padding:'14px', marginBottom:14, display:'flex', gap:12, alignItems:'flex-start' }}>
        <div style={{ fontSize:28, flexShrink:0 }}>{slides[slide].icon}</div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:4 }}>{slides[slide].title}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.5 }}>{slides[slide].desc}</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:5, marginBottom:14 }}>
        {slides.map((_, i) => (
          <button key={i} onClick={() => setSlide(i)} style={{ width: i===slide?20:5, height:5, borderRadius:3, border:'none', background: i===slide?'#e8b400':'rgba(255,255,255,0.2)', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
        ))}
      </div>
      <button onClick={() => go('driver-signup')} style={{ padding:'10px 22px', background:'#e8b400', border:'none', borderRadius:20, color:'#0f1a35', fontSize:13, fontWeight:700, cursor:'pointer' }}>Become a Driver →</button>
    </div>
  );
}

// ── DASH PARTNERS SLIDER ───────────────────────────────────────────────────────
function DashPartnersSlider() {
  const partners = [
    { icon:'🍔', name:'Juici Patties',   cat:'Restaurant' },
    { icon:'📚', name:'Bargain Books',   cat:'Bookstore'  },
    { icon:'🏨', name:'Golf View Hotel', cat:'Hotel'      },
    { icon:'🍽️', name:'Restaurants',    cat:'Food'       },
    { icon:'🎉', name:'Clubs & Lounges', cat:'Nightlife'  },
    { icon:'🛒', name:'Supermarkets',   cat:'Grocery'    },
    { icon:'💊', name:'Pharmacies',     cat:'Health'     },
    { icon:'🎫', name:'Events',         cat:'Events'     },
  ];
  return (
    <div style={{ padding:'20px 0 20px' }}>
      <div style={{ padding:'0 16px', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#999bbb', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Featured Partners</div>
        <div style={{ fontSize:11, color:'#aaa', }}>Local businesses connected with VilleCabs.</div>
      </div>
      <div style={{ overflow:'hidden', position:'relative' }}>
        <div style={{ display:'flex', gap:10, animation:'autoScroll 28s linear infinite', width:'fit-content', padding:'0 16px' }}>
          {[...partners, ...partners].map((p, i) => (
            <div key={i} style={{ flexShrink:0, width:130, background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:12, padding:'14px 10px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:28, marginBottom:6 }}>{p.icon}</div>
              <div style={{ fontSize:11, fontWeight:700, color:'#1a1a2e', marginBottom:2 }}>{p.name}</div>
              <div style={{ fontSize:9, color:'#888aaa', marginBottom:6 }}>{p.cat}</div>
              <div style={{ fontSize:8, background:'rgba(232,180,0,0.15)', color:'#b38600', padding:'2px 7px', borderRadius:8, fontWeight:600, display:'inline-block' }}>Coming Soon</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CustomerDash({ go, user, setUser, setBookingId, bookingId }) {
  const [tab,        setTab]        = useState('book');
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [history,    setHistory]    = useState([]);
  const [loadingH,   setLoadingH]   = useState(true);
  const [activeRide, setActiveRide] = useState(null);
  const [rideNotif, setRideNotif] = useState(null);
  const prevStatusRef = useRef(null);
  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      _manualNavDone = false;
      await signOut(auth);
      setUser(null);
      go('splash');
    } catch(e) {
      console.error('Logout error:', e);
      go('splash');
    }
  };

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

  // Watch ALL customer bookings to track status changes
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db,'bookings'),
      where('customerId','==',user.uid)
    );
    const unsub = onSnapshot(q, snap => {
      const rides = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      // Sort by most recent first
      rides.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      const active    = rides.find(r => r.status === 'active');
      const completed = rides.find(r => r.status === 'completed' &&
        (Date.now()/1000 - (r.completedAt?.seconds||0)) < 300);

      if (active) {
        setActiveRide(active);
        // Show driver accepted rideNotif
        if (prevStatusRef.current !== 'active' && prevStatusRef.current !== 'arrived') {
          prevStatusRef.current = 'active';
          setRideNotif({
            type:         'driver_accepted',
            driverName:   active.driverName   || 'Your driver',
            vehicleMake:  active.vehicleMake  || '',
            vehicleModel: active.vehicleModel || '',
            licensePlate: active.licensePlate || '',
          });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('🚗 Driver found!', {
              body: `${active.driverName||'Your driver'} is on the way · ${active.licensePlate||''}`,
              icon: '/logo.png',
            });
          }
        }
        // Show driver arrived rideNotif - check driverArrived field
        if (active.driverArrived && prevStatusRef.current !== 'arrived') {
          prevStatusRef.current = 'arrived';
          setRideNotif({
            type:        'driver_arrived',
            driverName:  active.driverName  || 'Your driver',
            licensePlate:active.licensePlate || '',
          });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('📍 Driver has arrived!', {
              body: `${active.driverName||'Your driver'} is at your pickup location. Please come outside!`,
              icon: '/logo.png',
            });
          }
        }
      } else if (completed && (prevStatusRef.current === 'active' || prevStatusRef.current === 'arrived')) {
        // Ride just completed — clear ALL notifications regardless of previous state
        prevStatusRef.current = 'completed';
        setActiveRide(null);
        setRideNotif(null);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('✅ Ride completed!', {
            body: `Your ride with ${completed.driverName||'your driver'} is complete. Rate your driver!`,
            icon: '/logo.png',
          });
        }
      } else if (!active && !completed) {
        setActiveRide(null);
        setRideNotif(null);
        if (prevStatusRef.current !== null) prevStatusRef.current = null;
      }
    });
    return () => unsub();
  }, [user]);

  // Request rideNotif permission on mount
  useEffect(() => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch(e) {}
  }, []);

  // Watch active booking directly for driverArrived field
  useEffect(() => {
    if (!activeRide?.id) return;
    const unsub = onSnapshot(doc(db,'bookings',activeRide.id), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      // Fire arrived rideNotif regardless of prevStatusRef
      if (data.driverArrived && prevStatusRef.current !== 'arrived') {
        prevStatusRef.current = 'arrived';
        setRideNotif({
          type:        'driver_arrived',
          driverName:  data.driverName  || 'Your driver',
          licensePlate:data.licensePlate || '',
        });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('📍 Driver has arrived!', {
            body: `${data.driverName||'Your driver'} is at your pickup location. Please come outside!`,
            icon: '/logo.png',
          });
        }
      }
      // Clear if ride completed
      if (data.status === 'completed') {
        setRideNotif(null);
        setActiveRide(null);
        prevStatusRef.current = 'completed';
      }
    });
    return () => unsub();
  }, [activeRide?.id]);

  const totalSpent = history.reduce((s,r) => s+(r.fare||0), 0);



  return (
    <div style={{ ...s.content, background:'transparent', minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* Hamburger top bar */}
      <div style={{ background:'#ffffff', padding:'10px 16px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #e5e7eb', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <button onClick={() => setMenuOpen(true)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ width:24, height:2.5, background:'#1a1a2e', borderRadius:2 }}/>
          <div style={{ width:18, height:2.5, background:'#1a1a2e', borderRadius:2 }}/>
          <div style={{ width:24, height:2.5, background:'#1a1a2e', borderRadius:2 }}/>
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src="/logo.png" alt="VilleCabs" onClick={() => setTab('book')} style={{ height:26, width:'auto', objectFit:'contain', cursor:'pointer' }}/>
        </div>
        <div style={{ display:'flex', gap:5, marginLeft:'auto', alignItems:'center' }}>
          <button onClick={() => go('business')} style={{ padding:'3px 8px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'rgba(255,255,255,0.8)', fontSize:10, fontWeight:600, cursor:'pointer' }}>Business</button>
          <button onClick={() => go('featured')} style={{ padding:'3px 8px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'rgba(255,255,255,0.8)', fontSize:10, fontWeight:600, cursor:'pointer' }}>Featured</button>
          {activeRide && <div onClick={() => { if (activeRide?.id) setBookingId(activeRide.id); go('live-ride'); }} style={{ background:GREEN, borderRadius:14, padding:'3px 8px', fontSize:10, color:WHITE, cursor:'pointer', fontWeight:600 }}>🚕 Live</div>}
          <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.85)', maxWidth:70, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name?.split(' ')[0]||''}</span>
        </div>
      </div>

      {/* Side drawer menu */}
      {menuOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'82%', maxWidth:320, background:'#0f1a35', display:'flex', flexDirection:'column', boxShadow:'6px 0 32px rgba(0,0,0,0.4)', animation:'slideInLeft 0.28s ease' }}>

            {/* Header — user profile */}
            <div style={{ padding:'32px 20px 18px', background:'linear-gradient(135deg, #1a2744 0%, #0f1a35 100%)', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(232,180,0,0.2)', border:'2px solid rgba(232,180,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>👤</div>
                <button onClick={() => setMenuOpen(false)} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#ffffff', width:34, height:34, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
              <div style={{ fontSize:18, fontWeight:700, color:'#ffffff', marginBottom:2 }}>{user?.name}</div>
              <div style={{ fontSize:12, color:'#6b7280', marginBottom:10 }}>{user?.email}</div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(26,158,90,0.15)', border:'1px solid rgba(26,158,90,0.3)', borderRadius:20, padding:'4px 12px' }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#1a9e5a' }}/>
                <span style={{ fontSize:11, color:'#1a9e5a', fontWeight:600 }}>Verified Rider</span>
              </div>
              {/* Stats */}
              <div style={{ display:'flex', gap:16, marginTop:14 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'#e8b400' }}>{history.length}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5 }}>Rides</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'#e8b400' }}>J${totalSpent.toLocaleString()}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5 }}>Spent</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:'#e8b400' }}>⭐ 5.0</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5 }}>Rating</div>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
              {[
                ['🚕', 'Book a Ride',      () => { setTab('book'); setMenuOpen(false); }],
                ['🕐', 'Ride History',     () => { setTab('history'); setMenuOpen(false); }],
                ['👤', 'My Profile',       () => { go('customer-profile'); setMenuOpen(false); }],
                ['💰', 'Payments',         () => { go('payments'); setMenuOpen(false); }],
                ['🎁', 'Promotions',       () => { go('promotions'); setMenuOpen(false); }],
                ['🛡️', 'Safety Centre',   () => { go('safety-centre'); setMenuOpen(false); }],
                ['⚙️', 'Settings',         () => { go('customer-settings'); setMenuOpen(false); }],
                ['❓', 'Help Centre',      () => { go('help'); setMenuOpen(false); }],
                ['📬', 'Contact Support',  () => { go('contact-us'); setMenuOpen(false); }],
                ['ℹ️', 'About VilleCabs', () => { go('about-us'); setMenuOpen(false); }],
              ].map(([icon, label, action], i) => (
                <div key={i} onClick={action}
                  style={{ padding:'13px 20px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ fontSize:18, width:26, textAlign:'center' }}>{icon}</span>
                  <span style={{ fontSize:14, color:'rgba(255,255,255,0.85)', fontWeight:500 }}>{label}</span>
                </div>
              ))}
              {/* Divider */}
              <div style={{ height:1, background:'rgba(255,255,255,0.06)', margin:'8px 20px' }}/>
              {[
                ['🚗', 'Become a Driver',  () => { go('driver-signup'); setMenuOpen(false); }],
                ['🤝', 'Partner With Us',  () => { window.open('mailto:admin@villecabs.com?subject=VilleCabs Partnership','_blank'); setMenuOpen(false); }],
              ].map(([icon, label, action], i) => (
                <div key={i} onClick={action}
                  style={{ padding:'12px 20px', display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <span style={{ fontSize:18, width:26, textAlign:'center' }}>{icon}</span>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,0.45)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Logout */}
            <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={handleLogout} style={{ width:'100%', padding:'12px', background:'rgba(226,75,74,0.12)', border:'1px solid rgba(226,75,74,0.3)', borderRadius:12, color:'#f09595', fontSize:14, cursor:'pointer', fontWeight:600 }}>🚪 Log Out</button>
            </div>
          </div>
        </div>
      )}

      {/* BOOK TAB */}
      {/* BOOK TAB */}
      {tab === 'book' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column' }}>

          {/* Notification banners */}
          {rideNotif?.type === 'driver_accepted' && (
            <div style={{ background:'#f0fff8', border:'2px solid #1a9e5a', margin:'10px 14px 0', borderRadius:12, padding:14, display:'flex', alignItems:'center', gap:10, boxShadow:'0 2px 8px rgba(26,158,90,0.1)' }}>
              <div style={{ fontSize:28, flexShrink:0 }}>🚗</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:'#1a7a45' }}>Driver found!</div>
                <div style={{ fontSize:12, color:'#444', marginTop:2 }}>{rideNotif?.driverName} is on the way</div>
                {rideNotif?.licensePlate && <div style={{ fontSize:11, color:'#b38600', marginTop:2 }}>🔑 {rideNotif?.vehicleMake} {rideNotif?.vehicleModel} · {rideNotif?.licensePlate}</div>}
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <button onClick={() => { if (activeRide?.id) setBookingId(activeRide.id); go('live-ride'); }} style={{ background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:500 }}>Track →</button>
                <button onClick={() => setRideNotif(null)} style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', border:'none', borderRadius:8, padding:'6px 12px', fontSize:11, cursor:'pointer' }}>Dismiss</button>
              </div>
            </div>
          )}
          {rideNotif?.type === 'driver_arrived' && (
            <div style={{ background:'#fffbe6', border:'2px solid #e8b400', margin:'10px 14px 0', borderRadius:12, padding:14, display:'flex', alignItems:'center', gap:10, boxShadow:'0 2px 8px rgba(232,180,0,0.15)' }}>
              <div style={{ fontSize:28, flexShrink:0 }}>📍</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:'#b38600' }}>Driver has arrived!</div>
                <div style={{ fontSize:12, color:'#555', marginTop:2 }}>{rideNotif?.driverName} is at your pickup location</div>
                <div style={{ fontSize:11, color:'#777', marginTop:2 }}>Please come outside 🚶</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <button onClick={() => { if (activeRide?.id) setBookingId(activeRide.id); go('live-ride'); }} style={{ background:YELLOW, color:DARK, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:700 }}>View →</button>
                <button onClick={() => setRideNotif(null)} style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', border:'none', borderRadius:8, padding:'6px 12px', fontSize:11, cursor:'pointer' }}>OK</button>
              </div>
            </div>
          )}
          {rideNotif?.type === 'enroute_dropoff' && (
            <div style={{ background:'#f0fff8', border:'2px solid #1a9e5a', margin:'10px 14px 0', borderRadius:12, padding:14, display:'flex', alignItems:'center', gap:10, boxShadow:'0 2px 8px rgba(26,158,90,0.1)' }}>
              <div style={{ fontSize:28, flexShrink:0 }}>🚗</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:500, color:'#1a7a45' }}>On the way to drop-off!</div>
                <div style={{ fontSize:12, color:'#444', marginTop:2 }}>{rideNotif?.driverName} has picked you up</div>
              </div>
              <button onClick={() => { if (activeRide?.id) setBookingId(activeRide.id); go('live-ride'); }} style={{ background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:500 }}>Track →</button>
            </div>
          )}
          {activeRide && !rideNotif && (
            <div style={{ background:'rgba(232,180,0,0.1)', border:'0.5px solid rgba(232,180,0,0.3)', margin:'10px 14px 0', borderRadius:12, padding:12, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={() => { if (activeRide?.id) setBookingId(activeRide.id); go('live-ride'); }}>
              <div style={{ fontSize:22 }}>🚕</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500, color:YELLOW }}>Ride in progress</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Tap to track your ride</div>
              </div>
              <span style={{ color:YELLOW, fontSize:18 }}>›</span>
            </div>
          )}

          {/* ── REDESIGNED HOME DASHBOARD ── */}
          <div style={{ flex:1, overflowY:'auto', background:'#f5f6fa' }}>

            {/* Greeting + Book a Ride */}
            <div style={{ background:'#ffffff', padding:'28px 20px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-40, left:'50%', transform:'translateX(-50%)', width:400, height:300, background:'radial-gradient(circle, rgba(232,180,0,0.07) 0%, transparent 70%)', pointerEvents:'none' }}/>
              <div style={{ fontSize:26, fontWeight:800, color:'#1a1a2e', marginBottom:4, lineHeight:1.2 }}>
                Good day, {user?.name?.split(' ')[0]||'Rider'} 👋
              </div>
              <button onClick={() => go('pin-pickup')}
                style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', margin:'14px auto 0', padding:0 }}>
                <div style={{ width:190, height:190, borderRadius:'50%', background:'#ffffff', boxShadow:'0 8px 40px rgba(0,0,0,0.15), 0 0 0 6px rgba(232,180,0,0.2)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 50% 60%, rgba(232,180,0,0.12) 0%, transparent 70%)' }}/>
                  <div style={{ fontSize:76, lineHeight:1, position:'relative', zIndex:1 }}>🚕</div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#1a1a2e', marginTop:6, letterSpacing:0.3, position:'relative', zIndex:1 }}>Book a Ride</div>
                </div>
              </button>
              <div style={{ fontSize:14, color:'#888aaa', marginTop:12 }}>Where are you going today?</div>
            </div>

            {/* ── HERO BANNER SLIDESHOW ── */}
            <DashHeroSlider go={go}/>

            {/* ── WHY VILLECABS — horizontal scroll ── */}
            <div style={{ padding:'20px 16px 0' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#999bbb', marginBottom:12, textTransform:'uppercase', letterSpacing:0.8 }}>Why VilleCabs</div>
              <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8, scrollbarWidth:'none' }}>
                {[
                  ['⚡','Fast','Rides in minutes, not hours'],
                  ['🛡️','Safe','Vetted drivers + SOS button'],
                  ['💰','Affordable','Clear estimated fares'],
                  ['📍','Local','Built for Mandeville & Manchester'],
                  ['📱','Easy','Simple booking from your phone'],
                ].map(([icon, title, desc], i) => (
                  <div key={i} style={{ flexShrink:0, width:130, background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:'14px 12px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize:26, marginBottom:6 }}>{icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#1a1a2e', marginBottom:4 }}>{title}</div>
                    <div style={{ fontSize:10, color:'#666888', lineHeight:1.4 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── SAFETY TIPS SLIDESHOW ── */}
            <DashSafetySlider/>

            {/* ── HOW IT WORKS ── */}
            <div style={{ padding:'20px 16px 0' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#999bbb', marginBottom:12, textTransform:'uppercase', letterSpacing:0.8 }}>How it works</div>
              <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
                {[
                  ['1','📍','Pin your location','Drop your pickup & drop-off on the map'],
                  ['2','🚗','Choose your ride','Pick VilleRide, XL or Moto'],
                  ['3','✅','Ride & arrive','Track live and pay cash on arrival'],
                ].map(([step, icon, title, desc], i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom: i < 2 ? 16 : 0 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:YELLOW, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:DARK, flexShrink:0, marginTop:2 }}>{step}</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#1a1a2e' }}>{icon} {title}</div>
                      <div style={{ fontSize:12, color:'#666888', marginTop:2 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── DRIVER PROMO SLIDESHOW ── */}
            <DashDriverSlider go={go}/>

            {/* ── FEATURED PARTNERS ── */}
            <DashPartnersSlider/>

          </div>

          
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
                <div key={ride.id} style={{ background:'rgba(15,20,40,0.6)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:14, marginBottom:10 }}>
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
                      <span style={{ fontSize:12, color:'#6b7280' }}>{ride.driverName||'VilleCabs driver'}</span>
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
          
        </div>
      )}
      <Footer go={go}/>
    </div>
  );
}

// ── CUSTOMER PROFILE ──────────────────────────────────────────────────────────
function CustomerProfile({ go, user, setUser }) {
  const [form,    setForm]    = useState({ name:user?.name||'', phone:'' });
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState('');
  const [error,   setError]   = useState('');
  const [rideCount, setRideCount] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db,'customers',user.uid)).then(snap => {
      if (snap.exists()) { const d=snap.data(); setForm({ name:d.name||'', phone:d.phone||'' }); }
    });
    getDocs(query(collection(db,'bookings'), where('customerId','==',user.uid))).then(snap => {
      const completed = snap.docs.map(d=>d.data()).filter(b=>b.status==='completed');
      setRideCount(completed.length);
      setTotalSpent(completed.reduce((s,b)=>s+(b.fare||0),0));
    }).catch(()=>{});
  }, [user]);

  const handleSave = async () => {
    setError(''); setMsg(''); setLoading(true);
    try {
      await updateDoc(doc(db,'customers',user.uid), { name:form.name, phone:form.phone });
      setUser(prev => ({ ...prev, name:form.name }));
      setMsg('Profile updated!');
    } catch(err) { setError('Failed to update profile.'); }
    setLoading(false);
  };

  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <div style={s.topBar}><span style={s.topTitle}>My Profile</span></div>
      <div style={{ background:'linear-gradient(135deg, #0f1a35 0%, #1a2744 100%)', padding:'24px 20px 28px', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(232,180,0,0.2)', border:'2px solid rgba(232,180,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, margin:'0 auto 12px' }}>👤</div>
        <div style={{ fontSize:20, fontWeight:700, color:'#ffffff', marginBottom:2 }}>{user?.name}</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:10 }}>{user?.email}</div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(26,158,90,0.2)', border:'1px solid rgba(26,158,90,0.4)', borderRadius:20, padding:'4px 12px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#1a9e5a' }}/>
          <span style={{ fontSize:11, color:'#1a9e5a', fontWeight:600 }}>Verified Rider</span>
        </div>
        <div style={{ display:'flex', justifyContent:'center', gap:32, marginTop:18 }}>
          {[['Rides', rideCount], ['Spent', `J$${totalSpent.toLocaleString()}`], ['Rating', '⭐ 5.0']].map(([label, val], i) => (
            <div key={i}>
              <div style={{ fontSize:18, fontWeight:700, color:'#e8b400' }}>{val}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>
        {msg   && <div style={s.successBox}>{msg}</div>}
        {error && <div style={s.errBox}>{error}</div>}
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:18, marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:14 }}>Edit Profile</div>
          <label style={s.lbl}>Full Name</label>
          <input style={s.inp} value={form.name} onChange={e => set('name',e.target.value)} placeholder="Your full name"/>
          <label style={s.lbl}>Phone Number</label>
          <input style={s.inp} value={form.phone} onChange={e => set('phone',e.target.value)} placeholder="+1 (876) 555-0100"/>
          <label style={s.lbl}>Email Address</label>
          <input style={{ ...s.inp, background:'#f5f6fa', color:'#888aaa' }} value={user?.email||''} disabled/>
          <p style={{ fontSize:11, color:'#888aaa', marginBottom:14 }}>To change your email, go to Settings</p>
          <button style={{ width:'100%', padding:'13px', background:'#0f1a35', border:'none', borderRadius:12, color:'#ffffff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading?0.7:1 }} onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        <button style={s.btnO} onClick={() => go('customer-settings')}>⚙️ Settings</button>
        <button style={s.btnO} onClick={() => go('safety-centre')}>🛡️ Safety Centre</button>
      </div>
    </div>
  );
}
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
      // (statically imported)
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
      // (statically imported)
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

  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      _manualNavDone = false;
      await signOut(auth);
      setUser(null);
      go('splash');
    } catch(e) {
      console.error('Logout error:', e);
      go('splash');
    }
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Settings" go={go} user={user}/>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>

        {/* Change Password */}
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
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
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
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
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
          <div style={{ fontSize:15, fontWeight:500, color:WHITE, marginBottom:12 }}>🔔 Notifications</div>
          <div style={{ fontSize:13, color:'#6b7280' }}>You will receive updates when your driver accepts your ride and when the ride is completed.</div>
        </div>

        {/* Logout */}
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
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
    <Footer go={go}/>
    </div>
  );
}

// ── PIN PICKUP ────────────────────────────────────────────────────────────────
// ── ADDRESS AUTOCOMPLETE INPUT ────────────────────────────────────────────────
// Biased to Mandeville, Manchester, Jamaica
const MANDEVILLE_BIAS = { lat:18.0417, lng:-77.5071 };
const BIAS_RADIUS_METERS = 25000;

function AddressAutocompleteInput({ value, onChange, onPlaceSelect, placeholder }) {
  const [query,   setQuery]   = useState(value || '');
  const [preds,   setPreds]   = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const debRef  = useRef(null);
  const tokenRef= useRef(null);
  const inputRef= useRef(null);

  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value || '');
  }, [value]);

  const getToken = async () => {
    try {
      const { AutocompleteSessionToken } = await window.google.maps.importLibrary('places');
      if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
    } catch(e) {}
  };

  const search = async (text) => {
    if (!text || text.length < 2) { setPreds([]); setOpen(false); return; }
    if (!window.google?.maps?.importLibrary) return;
    setLoading(true);
    try {
      await getToken();
      const { AutocompleteSuggestion } = await window.google.maps.importLibrary('places');
      const req = {
        input:               text,
        includedRegionCodes: ['jm'],
        locationBias: { center:{ lat:18.0417, lng:-77.5071 }, radius:30000 },
        language:            'en',
      };
      if (tokenRef.current) req.sessionToken = tokenRef.current;
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
      setPreds(suggestions || []);
      setOpen((suggestions || []).length > 0);
    } catch(e) {
      console.error('Search error:', e.message);
      setPreds([]);
      setOpen(false);
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v); if (onChange) onChange(v);
    clearTimeout(debRef.current);
    if (!v) { setPreds([]); setOpen(false); return; }
    debRef.current = setTimeout(() => search(v), 350);
  };

  const handleSelect = async (s) => {
    const pred = s.placePrediction;
    const main = pred.mainText?.text || pred.text?.text || '';
    setQuery(main); setOpen(false); setPreds([]);
    if (onChange) onChange(main);
    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields:['displayName','formattedAddress','location'] });
      const addr = place.formattedAddress || place.displayName || main;
      setQuery(addr); if (onChange) onChange(addr);
      if (onPlaceSelect) onPlaceSelect({
        name: place.displayName,
        formattedAddress: place.formattedAddress,
        lat: place.location.lat(),
        lng: place.location.lng(),
      });
      const { AutocompleteSessionToken } = await window.google.maps.importLibrary('places');
      tokenRef.current = new AutocompleteSessionToken();
    } catch(e) { console.warn('Detail error:', e.message); }
  };

  const mainText = (s) => s.placePrediction?.mainText?.text || s.placePrediction?.text?.text || '';
  const subText  = (s) => s.placePrediction?.secondaryText?.text || '';

  return (
    <div style={{ position:'relative', zIndex:50 }}>
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'#6b21a8', pointerEvents:'none' }}>🔍</span>
        <input ref={inputRef} type="text" value={query} onChange={handleChange}
          onFocus={() => { if (preds.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder || 'Search address or landmark'}
          autoComplete="off" autoCorrect="off" spellCheck="false"
          style={{ width:'100%', padding:'13px 36px 13px 38px', background:'#fff', border:'2px solid #e9d5ff', borderRadius:12, fontSize:14, color:'#1a1a2e', boxSizing:'border-box', outline:'none', boxShadow:'0 2px 8px rgba(107,33,168,0.08)' }}
        />
        {loading && <span style={{ position:'absolute', right:36, top:'50%', transform:'translateY(-50%)' }}>⏳</span>}
        {query.length > 0 && (
          <span onMouseDown={e => { e.preventDefault(); setQuery(''); setPreds([]); setOpen(false); if (onChange) onChange(''); }}
            style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'#aaa', cursor:'pointer', padding:4 }}>✕</span>
        )}
      </div>
      {open && preds.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1px solid #e9d5ff', borderRadius:12, boxShadow:'0 8px 24px rgba(107,33,168,0.15)', zIndex:100, maxHeight:280, overflowY:'auto', overflow:'hidden' }}>
          {preds.map((s, i) => (
            <div key={i}
              onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
              onTouchEnd={e => { e.preventDefault(); handleSelect(s); }}
              style={{ padding:'12px 14px', cursor:'pointer', borderBottom:i<preds.length-1?'1px solid #f5f0ff':'none', display:'flex', gap:10, background:'#fff' }}
              onMouseEnter={e => e.currentTarget.style.background='#f9f5ff'}
              onMouseLeave={e => e.currentTarget.style.background='#fff'}>
              <span style={{ color:'#6b21a8', fontSize:16, flexShrink:0 }}>📍</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{mainText(s)}</div>
                <div style={{ fontSize:11, color:'#888', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{subText(s)}</div>
              </div>
            </div>
          ))}
          <div style={{ padding:'4px 12px', fontSize:10, color:'#bbb', textAlign:'right', background:'#fafafa' }}>Powered by Google</div>
        </div>
      )}
    </div>
  );
}


function PinPickup({ go, setPickupData, user }) {
  const [mapsReady, setMapsReady] = useState(!!window.google?.maps?.places);
  const [pinPos,      setPinPos]      = useState(MANCHESTER_CENTER);
  const [address,     setAddress]     = useState('');
  const [note,        setNote]        = useState('');
  const [loading,     setLoading]     = useState(false);
  const [passengers,  setPassengers]  = useState(1);

  useEffect(() => {
    if (window.google?.maps?.places) { setMapsReady(true); return; }
    const iv = setInterval(() => { if (window.google?.maps?.places) { setMapsReady(true); clearInterval(iv); } }, 300);
    return () => clearInterval(iv);
  }, []);

  const handleMapClick = useCallback(async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPinPos({ lat, lng });
    setLoading(true);
    const addr = await geocodeLatLng(lat, lng);
    setAddress(addr);
    setLoading(false);
  }, []);

  const handlePlaceSelect = (place) => {
    const pos = { lat: place.lat, lng: place.lng };
    setPinPos(pos);
    setAddress(place.formattedAddress || place.name);
  };

  const handleConfirm = () => {
    const finalAddress = note.trim() ? `${address} — ${note.trim()}` : address;
    setPickupData({ coords:pinPos, address: finalAddress, passengers });
    go('pin-dropoff');
  };

  return (
    <div style={{ minHeight:'100vh', background:'#F5F6FA', display:'flex', flexDirection:'column' }}>

      {/* ── HEADER ── */}
      <div style={{ background:'#111827', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, boxShadow:'0 2px 12px rgba(0,0,0,0.4)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => go('customer-dash')} style={{ background:'none', border:'none', color:'#ffffff', fontSize:20, cursor:'pointer', padding:'2px 6px' }}>←</button>
          <img src="/logo.png" alt="VilleCabs" style={{ height:26, objectFit:'contain' }}/>
        </div>
        <span style={{ color:'#ffffff', fontSize:14, fontWeight:700, letterSpacing:0.3 }}>Pin Pickup Location</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => go('business')} style={{ padding:'4px 10px', background:'rgba(106,27,185,0.3)', border:'1px solid #6A1BB9', borderRadius:20, color:'#ffffff', fontSize:10, fontWeight:600, cursor:'pointer' }}>Business</button>
          <button onClick={() => go('featured')} style={{ padding:'4px 10px', background:'rgba(212,175,55,0.2)', border:'1px solid #D4AF37', borderRadius:20, color:'#D4AF37', fontSize:10, fontWeight:600, cursor:'pointer' }}>Featured</button>
        </div>
      </div>

      {/* ── SEARCH BAR ── */}
      <div style={{ background:'#111827', padding:'10px 16px 14px', flexShrink:0 }}>
        <AddressAutocompleteInput
          value={address}
          onChange={setAddress}
          onPlaceSelect={handlePlaceSelect}
          placeholder="Where should we pick you up?"
        />
      </div>

      {/* ── MAP ── */}
      <div style={{ flexShrink:0 }}>
        <VilleMap height={300} center={pinPos||MANCHESTER_CENTER} zoom={14}
          onClick={handleMapClick} markers={[{ position:pinPos, title:'Pickup' }]} expandable={true}/>
      </div>

      {/* ── INSTRUCTION BANNER ── */}
      <div style={{ margin:'14px 14px 0', background:'#0D0D0D', borderRadius:14, padding:'12px 16px', display:'flex', gap:12, alignItems:'center', border:'1px solid rgba(212,175,55,0.3)', flexShrink:0 }}>
        <span style={{ fontSize:22 }}>📍</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:2 }}>Tap the map or search above</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', lineHeight:1.5 }}>Place your pickup pin exactly where the driver should meet you.</div>
        </div>
      </div>

      {/* ── SCROLLABLE BOTTOM CONTENT ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 100px' }}>

        {/* Additional Details */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'14px 16px', marginBottom:12, border:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#D4AF37', textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>Additional Details (Optional)</div>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Gate colour, landmark, apartment number..."
            style={{ width:'100%', padding:'11px 13px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, fontSize:13, color:'#ffffff', boxSizing:'border-box', outline:'none' }}
          />
        </div>

        {/* Passenger Selector */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'14px 16px', marginBottom:12, border:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#D4AF37', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>Number of Passengers</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:12 }}>Including yourself · Driver will be notified</div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <button onClick={() => setPassengers(p => Math.max(1,p-1))}
              style={{ width:38, height:38, borderRadius:'50%', border:'1.5px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.06)', color:passengers<=1?'rgba(255,255,255,0.2)':'#ffffff', fontSize:20, cursor:passengers<=1?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
            <span style={{ fontSize:22, fontWeight:800, color:'#ffffff', minWidth:30, textAlign:'center' }}>{passengers}</span>
            <button onClick={() => setPassengers(p => Math.min(6,p+1))}
              style={{ width:38, height:38, borderRadius:'50%', border:'1.5px solid #D4AF37', background:'rgba(212,175,55,0.15)', color:'#D4AF37', fontSize:20, cursor:passengers>=6?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{passengers > 1 ? `${passengers} passengers` : '1 passenger'}</span>
          </div>
        </div>

        {/* Help Card 1 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>📌</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>Pin Your Exact Location</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Place your pickup pin as close as possible to where you are standing. This helps your driver find you quickly and ensures your fare is calculated accurately.</div>
            </div>
          </div>
        </div>

        {/* Help Card 2 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>🌿</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>In a Rural Area?</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>If you're on an unnamed road or in a district not on the map, use the Additional Details field to describe your location. Example: "Blue gate, top of Caledonia Road, Hatfield district."</div>
            </div>
          </div>
        </div>

        {/* Help Card 3 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>💡</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>Quick Tip</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Make sure your phone location is on so your driver can find you faster.</div>
            </div>
          </div>
        </div>

        {/* Help Card 4 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>💬</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>Chat With Your Driver</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Once a driver accepts your ride, you can chat directly with them if they need help finding your exact location.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STICKY CONFIRM BUTTON ── */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'12px 16px 20px', background:'linear-gradient(to top, #111827 60%, transparent)', zIndex:20 }}>
        <button onClick={handleConfirm} disabled={!address}
          style={{ width:'100%', maxWidth:500, display:'block', margin:'0 auto', padding:'16px', background:address?'linear-gradient(135deg,#6A1BB9,#4c1d95)':'#2a2a2a', color:address?'#ffffff':'rgba(255,255,255,0.3)', border:'none', borderRadius:14, fontSize:15, fontWeight:700, cursor:address?'pointer':'default', boxShadow:address?'0 4px 20px rgba(106,27,185,0.5)':'none', letterSpacing:0.3 }}>
          {address ? 'Confirm Pickup →' : 'Search or tap map to set pickup'}
        </button>
      </div>
    </div>
  );
}


function PinDropoff({ go, pickupData, setDropoffData, user }) {
  const [mapsReady, setMapsReady] = useState(!!window.google?.maps?.places);
  // Start map centered on pickup location if available, else Mandeville
  const startPos = pickupData?.coords || MANCHESTER_CENTER;
  const [pinPos,   setPinPos]   = useState(MANCHESTER_CENTER);
  const [address,  setAddress]  = useState('');
  const [note,     setNote]     = useState('');

  useEffect(() => {
    if (window.google?.maps?.places) { setMapsReady(true); return; }
    const iv = setInterval(() => { if (window.google?.maps?.places) { setMapsReady(true); clearInterval(iv); } }, 300);
    return () => clearInterval(iv);
  }, []);

  const handlePlaceSelect = (place) => {
    const pos = { lat: place.lat, lng: place.lng };
    setPinPos(pos);
    setAddress(place.formattedAddress || place.name);
  };

  const handleMapClick = async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPinPos({ lat, lng });
    try {
      const addr = await geocodeLatLng(lat, lng);
      setAddress(addr);
    } catch(err) {}
  };

  const handleConfirm = () => {
    if (!address || !pinPos) return;
    const finalAddress = note.trim() ? address + ' — ' + note.trim() : address;
    setDropoffData({ coords: pinPos, address: finalAddress });
    go('vehicle-select');
  };

  // Show pickup marker (green) + dropoff marker (purple) if set
  const markers = [
    ...(pickupData?.coords ? [{ position:{ lat: pickupData.coords.lat, lng: pickupData.coords.lng }, label:'A', title:'Pickup' }] : []),
    { position:{ lat: pinPos.lat, lng: pinPos.lng }, label:'B', title:'Drop-off' },
  ];

  const mapCenter = pinPos || startPos;

  return (
    <div style={{ minHeight:'100vh', background:'#F5F6FA', display:'flex', flexDirection:'column' }}>

      {/* ── HEADER ── */}
      <div style={{ background:'#111827', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, boxShadow:'0 2px 12px rgba(0,0,0,0.4)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => go('pin-pickup')} style={{ background:'none', border:'none', color:'#ffffff', fontSize:20, cursor:'pointer', padding:'2px 6px' }}>←</button>
          <img src="/logo.png" alt="VilleCabs" style={{ height:26, objectFit:'contain' }}/>
        </div>
        <span style={{ color:'#ffffff', fontSize:14, fontWeight:700, letterSpacing:0.3 }}>Pin Drop-off Location</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => go('business')} style={{ padding:'4px 10px', background:'rgba(106,27,185,0.3)', border:'1px solid #6A1BB9', borderRadius:20, color:'#ffffff', fontSize:10, fontWeight:600, cursor:'pointer' }}>Business</button>
          <button onClick={() => go('featured')} style={{ padding:'4px 10px', background:'rgba(212,175,55,0.2)', border:'1px solid #D4AF37', borderRadius:20, color:'#D4AF37', fontSize:10, fontWeight:600, cursor:'pointer' }}>Featured</button>
        </div>
      </div>

      {/* ── SEARCH BAR ── */}
      <div style={{ background:'#111827', padding:'10px 16px 14px', flexShrink:0 }}>
        <AddressAutocompleteInput
          value={address}
          onChange={setAddress}
          onPlaceSelect={handlePlaceSelect}
          placeholder="Where are you going?"
        />
      </div>

      {/* ── MAP ── */}
      <div style={{ flexShrink:0 }}>
        <VilleMap height={300} center={mapCenter} zoom={14}
          onClick={handleMapClick} markers={markers} expandable={true}/>
      </div>

      {/* ── INSTRUCTION BANNER ── */}
      <div style={{ margin:'14px 14px 0', background:'#0D0D0D', borderRadius:14, padding:'12px 16px', display:'flex', gap:12, alignItems:'center', border:'1px solid rgba(212,175,55,0.3)', flexShrink:0 }}>
        <span style={{ fontSize:22 }}>🏁</span>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:2 }}>Choose Your Destination</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', lineHeight:1.5 }}>Search, tap the map, or pin the exact drop-off location.</div>
        </div>
      </div>

      {/* ── FROM / TO PANEL ── */}
      {pickupData?.address && (
        <div style={{ margin:'10px 14px 0', background:'#0D0D0D', borderRadius:14, padding:'12px 16px', border:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
          <div style={{ display:'flex', gap:10, marginBottom:8, alignItems:'flex-start' }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#1a9e5a', flexShrink:0, marginTop:4 }}/>
            <div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', marginBottom:1, textTransform:'uppercase', letterSpacing:0.8 }}>FROM</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#ffffff' }}>{(pickupData.address||'').split('—')[0].trim()}</div>
            </div>
          </div>
          {address && (
            <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#D4AF37', flexShrink:0, marginTop:4 }}/>
              <div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', marginBottom:1, textTransform:'uppercase', letterSpacing:0.8 }}>TO</div>
                <div style={{ fontSize:12, fontWeight:600, color:'#D4AF37' }}>{address.split(',')[0]}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SCROLLABLE BOTTOM CONTENT ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 100px' }}>

        {/* Drop-off Details */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'14px 16px', marginBottom:12, border:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#D4AF37', textTransform:'uppercase', letterSpacing:0.8, marginBottom:8 }}>Drop-off Details (Optional)</div>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Building name, gate, landmark, or special instructions..."
            style={{ width:'100%', padding:'11px 13px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, fontSize:13, color:'#ffffff', boxSizing:'border-box', outline:'none' }}
          />
        </div>

        {/* Help Card 1 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>🛡️</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>Safety & Accuracy</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Pin your drop-off as precisely as possible. Use the Details field to add landmarks such as "Blue gate, top of hill" or "near the plaza entrance."</div>
            </div>
          </div>
        </div>

        {/* Help Card 2 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>✅</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>Confirm the Right Place</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Check the address carefully before continuing. This helps calculate your fare correctly and reduces confusion for your driver.</div>
            </div>
          </div>
        </div>

        {/* Help Card 3 */}
        <div style={{ background:'#0D0D0D', borderRadius:14, padding:'16px', marginBottom:10, border:'1px solid rgba(106,27,185,0.3)', borderLeft:'3px solid #6A1BB9' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>🗺️</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#D4AF37', marginBottom:6 }}>After Pickup</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Once your ride starts, your driver will follow the route to your selected drop-off location.</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STICKY CONFIRM BUTTON ── */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'12px 16px 20px', background:'linear-gradient(to top, #111827 60%, transparent)', zIndex:20 }}>
        <button onClick={handleConfirm} disabled={!address}
          style={{ width:'100%', maxWidth:500, display:'block', margin:'0 auto', padding:'16px', background:address?'linear-gradient(135deg,#6A1BB9,#4c1d95)':'#2a2a2a', color:address?'#ffffff':'rgba(255,255,255,0.3)', border:'none', borderRadius:14, fontSize:15, fontWeight:700, cursor:address?'pointer':'default', boxShadow:address?'0 4px 20px rgba(106,27,185,0.5)':'none', letterSpacing:0.3 }}>
          {address ? 'Confirm Drop-off →' : 'Search or tap map to set drop-off'}
        </button>
      </div>
    </div>
  );
}


function VehicleSelect({ go, user, pickupData, setPickupData, dropoffData, setBookingId }) {
  const [sel,        setSel]        = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [noDrivers,  setNoDrivers]  = useState(false);
  const [checking,   setChecking]   = useState(false);
  const [dist,       setDist]       = useState(8.2);
  const [directions, setDirections] = useState(null);
  const [completed,  setCompleted]  = useState(false);
  const [promoCode,  setPromoCode]  = useState('');
  const [promoMsg,   setPromoMsg]   = useState('');
  const [promoData,  setPromoData]  = useState(null); // { id, discount, code }
  const [promoLoading, setPromoLoading] = useState(false);

  const vehicles = [
    { name:'VilleRide', eta:'4 min away',      icon:'🚗', multiplier:1.0 },
    { name:'VilleXL',   eta:'7 min · up to 6', icon:'🚙', multiplier:1.3 },
    { name:'VilleMoto', eta:'2 min away',       icon:'🏍️', multiplier:0.7 },
  ];

  // ── VilleCabs Fare Formula ──────────────────────────────────────────────────
  // Band fares (0.1–1.0 km), then J$751 + J$10.44 per 100m beyond 1km
  const FARE_BANDS = [
    [0.1, 0.2, 500], [0.2, 0.3, 525], [0.3, 0.4, 550], [0.4, 0.5, 575],
    [0.5, 0.6, 600], [0.6, 0.7, 650], [0.7, 0.8, 700], [0.8, 0.9, 725],
    [0.9, 1.0, 751],
  ];
  const OVER_1KM_BASE = 751;
  const OVER_1KM_PER_100M = 10.44;

  // ── Surcharge Logic (highest only, no stacking) ───────────────────────────
  const getSurcharge = () => {
    const now   = new Date();
    const h     = now.getHours();
    const dow   = now.getDay(); // 0=Sun, 6=Sat
    // Public holidays 2025-2026 Jamaica (month is 0-indexed)
    const holidays = [
      '1-1','3-3','4-18','5-23','8-1','8-6','10-20','12-25','12-26',
    ].map(s => { const [m,d] = s.split('-'); return `${m}-${d}`; });
    const dateKey = `${now.getMonth()+1}-${now.getDate()}`;
    const isHoliday = holidays.includes(dateKey);
    const isPeak    = dow >= 1 && dow <= 5 && h >= 17 && h < 19; // Mon–Fri 5–7pm
    const isNight   = h >= 22 || h < 5;  // 10pm–5am
    if (isHoliday) return { pct:20, label:'Holiday Fee Applied (+20%)', key:'holiday' };
    if (isNight)   return { pct:15, label:'Night Fee Applied (+15%)',   key:'night'   };
    if (isPeak)    return { pct:10, label:'Peak Hour Fee Applied (+10%)',key:'peak'    };
    return null;
  };
  const surcharge = getSurcharge();
  const SURCHARGE_MULT = surcharge ? 1 + surcharge.pct / 100 : 1.0;

  const baseFare = (km) => {
    if (km < 0.1) return 500; // minimum
    for (const [lo, hi, fare] of FARE_BANDS) {
      if (km >= lo && km < hi) return fare;
    }
    // Over 1km
    const extra100m = Math.ceil((km - 1.0) / 0.1);
    return Math.round(OVER_1KM_BASE + extra100m * OVER_1KM_PER_100M);
  };

  const calcPrice = (v) => {
    const base = baseFare(dist);
    return Math.round(base * v.multiplier * SURCHARGE_MULT);
  };

  const fareBreakdown = (v) => {
    const base  = baseFare(dist);
    const after = Math.round(base * v.multiplier);
    const surchargeAmt = Math.round(after * (surcharge ? surcharge.pct/100 : 0));
    const total = after + surchargeAmt;
    return { baseFare: after, surchargeAmt, total, surchargeLabel: surcharge?.label || null };
  };
  // Haversine formula for straight-line distance fallback
  const haversine = (p1, p2) => {
    const R = 6371;
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(p1.lat*Math.PI/180) * Math.cos(p2.lat*Math.PI/180) * Math.sin(dLng/2)**2;
    return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1));
  };

  useEffect(() => {
    if (pickupData?.coords && dropoffData?.coords) {
      // Set Haversine distance immediately so fares show right away
      const straight = haversine(pickupData.coords, dropoffData.coords);
      setDist(straight);
      // Then get real road distance from Google Directions
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

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true); setPromoMsg(''); setPromoData(null);
    try {
      const snap = await getDocs(query(collection(db,'promo_codes'), where('code','==',promoCode.toUpperCase().trim())));
      if (snap.empty) { setPromoMsg('❌ Invalid promo code.'); setPromoLoading(false); return; }
      const pd = { id: snap.docs[0].id, ...snap.docs[0].data() };
      if (!pd.active) { setPromoMsg('❌ This promo code is no longer active.'); setPromoLoading(false); return; }
      if (pd.expiry && new Date(pd.expiry) < new Date()) { setPromoMsg('❌ This promo code has expired.'); setPromoLoading(false); return; }
      if (pd.usedBy && pd.usedBy.includes(user.uid)) { setPromoMsg('❌ You have already used this promo code.'); setPromoLoading(false); return; }
      setPromoData(pd);
      setPromoMsg(`✅ "${pd.code}" applied — ${pd.discount}% off!`);
    } catch(err) { setPromoMsg('❌ Error applying code. Try again.'); }
    setPromoLoading(false);
  };

  const removePromo = () => { setPromoData(null); setPromoCode(''); setPromoMsg(''); };

  const calcFinalPrice = (v) => {
    const base = calcPrice(v);
    if (!promoData) return base;
    return Math.round(base * (1 - promoData.discount / 100));
  };

  const saveUnfulfilledRequest = async (v, price, dist) => {
    const now = new Date();
    try {
      await addDoc(collection(db, 'unfulfilled_ride_requests'), {
        customer_id:             user.uid,
        customer_name:           user.name || '',
        customer_email:          user.email || '',
        pickup_address:          pickupData?.address || '',
        pickup_lat:              pickupData?.coords?.lat || 0,
        pickup_lng:              pickupData?.coords?.lng || 0,
        dropoff_address:         dropoffData?.address || '',
        dropoff_lat:             dropoffData?.coords?.lat || 0,
        dropoff_lng:             dropoffData?.coords?.lng || 0,
        ride_type:               v.name,
        estimated_fare:          price,
        estimated_distance_km:   dist,
        estimated_duration_min:  Math.ceil(dist / 0.5),
        passenger_count:         pickupData?.passengers || 1,
        payment_method:          'Cash',
        reason:                  'no_drivers_available',
        status:                  'unfulfilled',
        service_area:            'Mandeville',
        day_of_week:             now.toLocaleDateString('en-US', { weekday:'long' }),
        hour_of_day:             now.getHours(),
        created_at:              serverTimestamp(),
      });
      console.log('Unfulfilled request saved');
    } catch(e) { console.error('Failed to save unfulfilled request:', e); }
  };

  const checkDriverAvailability = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'drivers'),
        where('status',   '==', 'approved'),
        where('isOnline', '==', true),
      ));
      const available = snap.docs.filter(d => {
        const data = d.data();
        return !data.currentRideId && data.isOnline === true;
      });
      return available.length > 0;
    } catch(e) {
      console.warn('Driver check failed:', e);
      return true; // fail open - allow booking if check fails
    }
  };

  const handleBook = async () => {
    setLoading(true); setError(''); setChecking(true);
    try {
      const v          = vehicles[sel];
      const price      = calcPrice(v);
      const finalPrice = calcFinalPrice(v);

      // ── CHECK DRIVER AVAILABILITY ────────────────────────────────────
      const driversAvailable = await checkDriverAvailability();
      setChecking(false);

      if (!driversAvailable) {
        await saveUnfulfilledRequest(v, finalPrice, dist);
        setLoading(false);
        setNoDrivers(true);
        return;
      }
      // ── DRIVERS AVAILABLE — CREATE NORMAL BOOKING ────────────────────

      const ref = await addDoc(collection(db,'bookings'), {
        customerId:   user.uid,
        customerName: user.name,
        passengers:   pickupData?.passengers || 1,
        pickup:       { address: pickupData?.address||'Manchester, Jamaica', lat: pickupData?.coords?.lat||MANCHESTER_CENTER.lat, lng: pickupData?.coords?.lng||MANCHESTER_CENTER.lng },
        dropoff:      { address: dropoffData?.address||'Destination', lat: dropoffData?.coords?.lat||18.02, lng: dropoffData?.coords?.lng||-77.48 },
        vehicleType:  v.name,
        fare:         finalPrice,
        originalFare: price,
        promoCode:    promoData?.code || null,
        promoDiscount:promoData?.discount || null,
        distanceKm:   dist,
        status:       'searching',
        createdAt:    serverTimestamp(),
      });
      // Mark promo as used
      if (promoData?.id) {
        try {
          // (statically imported)
          await updateDoc(doc(db,'promo_codes',promoData.id), {
            usedBy:     arrayUnion(user.uid),
            usageCount: increment(1),
          });
        } catch(e) { console.error('Promo update error:', e); }
      }
      setBookingId(ref.id);
      // Store fare in pickupData so BookingConfirm shows it immediately
      if (typeof setPickupData === 'function') {
        setPickupData(prev => ({ ...prev, fare: finalPrice, vehicleType: v.name, distanceKm: dist }));
      }
      // Navigate immediately - don't wait for notifications
      setLoading(false);
      go('booking-confirm');
      // Notify drivers in background (non-blocking)
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
    } catch(err) { setError('Failed to create booking. Please try again.'); setLoading(false); }
  };

  const v = vehicles[sel];

  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <TopBar title="Choose Ride" onBack={() => go('pin-dropoff')} go={go} user={user}/>
      <VilleMap height={220} center={pickupData?.coords||MANCHESTER_CENTER} zoom={12} markers={markers} directions={directions} expandable={true}/>
      {/* SOS + cash reminder */}
      <div style={{ background:'#111111', padding:'12px 16px', display:'flex', gap:10, alignItems:'flex-start' }}>
        <span style={{ fontSize:18, flexShrink:0 }}>🆘</span>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'#e8b400', marginBottom:2 }}>Reminder — Before You Go</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', lineHeight:1.5 }}>Your driver is almost there! Hold the <strong style={{color:'#f09595'}}>SOS button 5 seconds</strong> in any emergency. Don't forget your <strong style={{color:'#ffffff'}}>cash, keys, and phone</strong> before you step out.</div>
        </div>
      </div>
      <div style={{ padding:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6b7280', marginBottom:10 }}>
          <span>📍 {pickupData?.address?.split(',')[0]||'Pickup'} → {dropoffData?.address?.split(',')[0]||'Destination'}</span>
          <span>{dist} km</span>
        </div>
        {error && <div style={s.errBox}>⚠️ {error}</div>}
        {vehicles.map((veh,i) => (
          <div key={i} onClick={() => setSel(i)} style={{ border:`${i===sel?'2px solid #6b21a8':'1.5px solid #e5e7eb'}`, borderRadius:14, padding:'13px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:12, cursor:'pointer', background:i===sel?'#f5f0ff':'#ffffff', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
            <div style={{ width:44, height:44, borderRadius:10, background:i===sel?'#ede9fe':'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{veh.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e' }}>{veh.name}</div>
              <div style={{ fontSize:11, color:'#6b7280' }}>{veh.eta}</div>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'#6b21a8' }}>J${calcPrice(veh).toLocaleString()}</div>
          </div>
        ))}
        {surcharge && (
          <div style={{ background:'#fff0f0', border:'1.5px solid #fca5a5', borderRadius:10, padding:'10px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:18 }}>{surcharge.key==='night'?'🌙':surcharge.key==='holiday'?'🎉':'⚡'}</span>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#dc2626' }}>{surcharge.label}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Added to your estimated fare</div>
            </div>
          </div>
        )}
        {(() => { const bd = fareBreakdown(v); return (
          <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:12, padding:14, margin:'10px 0' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#6b7280', marginBottom:6 }}>
              <span>Base Fare ({dist} km)</span>
              <span style={{ color:'#1a1a2e', fontWeight:500 }}>J${bd.baseFare.toLocaleString()}</span>
            </div>
            {bd.surchargeAmt > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                <span style={{ color:'#f09595' }}>{bd.surchargeLabel}</span>
                <span style={{ color:'#f09595', fontWeight:500 }}>+J${bd.surchargeAmt.toLocaleString()}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:700, color:'#6b21a8', borderTop:'0.5px solid rgba(255,255,255,0.15)', paddingTop:8, marginTop:4 }}>
              <span>Estimated Fare</span>
              <span>J${bd.total.toLocaleString()}</span>
            </div>
          </div>
        ); })()}
        {/* Referral Code */}
        <div style={{ background:'rgba(15,20,40,0.6)', border:'0.5px solid rgba(168,139,250,0.2)', borderRadius:12, padding:12, marginBottom:10 }}>
          <div style={{ fontSize:12, color:'rgba(168,139,250,0.9)', marginBottom:8, fontWeight:500 }}>🎁 Have a referral code?</div>
          <input
            style={{ width:'100%', padding:'9px 12px', background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(168,139,250,0.3)', borderRadius:8, color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box' }}
            placeholder="Enter referral code e.g. VCABC12"
            onChange={async (e) => {
              const code = e.target.value.toUpperCase().trim();
              if (code.length >= 7) {
                const snap = await getDocs(query(collection(db,'customers'), where('referralCode','==',code)));
                if (!snap.empty && snap.docs[0].id !== user.uid) {
                  // Valid referral - store for use
                  e.target.style.borderColor = '#1a9e5a';
                  e.target.nextSibling.textContent = '✅ Valid referral code — 20% off your first ride!';
                  e.target.nextSibling.style.color = '#9fe1cb';
                  window._referralDoc = snap.docs[0].id;
                } else {
                  e.target.style.borderColor = 'rgba(226,75,74,0.4)';
                  e.target.nextSibling.textContent = code.length >= 7 ? '❌ Invalid referral code' : '';
                  e.target.nextSibling.style.color = '#f09595';
                  window._referralDoc = null;
                }
              }
            }}
          />
          <div style={{ fontSize:12, marginTop:6, color:'rgba(255,255,255,0.4)' }}></div>
        </div>

        {/* Promo Code */}
        <div style={{ background:'rgba(15,20,40,0.6)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:12, marginBottom:10 }}>
          <div style={{ fontSize:12, color:'#6b7280', marginBottom:8, fontWeight:500 }}>🎟️ Promo Code</div>
          {!promoData ? (
            <div style={{ display:'flex', gap:8 }}>
              <input
                style={{ flex:1, padding:'9px 12px', background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:8, color:'#fff', fontSize:13, outline:'none' }}
                placeholder="Enter code e.g. VILLE20"
                value={promoCode}
                onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoMsg(''); }}
                onKeyDown={e => { if (e.key==='Enter') applyPromo(); }}
              />
              <button onClick={applyPromo} disabled={promoLoading||!promoCode.trim()}
                style={{ padding:'9px 16px', background:YELLOW, color:DARK, border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', opacity:promoLoading||!promoCode.trim()?0.5:1 }}>
                {promoLoading ? '...' : 'Apply'}
              </button>
            </div>
          ) : (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <span style={{ color:GREEN, fontWeight:600 }}>{promoData.code}</span>
                <span style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginLeft:8 }}>{promoData.discount}% off applied</span>
              </div>
              <button onClick={removePromo} style={{ background:'none', border:'none', color:'#f09595', cursor:'pointer', fontSize:12 }}>✕ Remove</button>
            </div>
          )}
          {promoMsg && <div style={{ fontSize:12, marginTop:8, color: promoMsg.startsWith('✅') ? GREEN : '#f09595' }}>{promoMsg}</div>}
        </div>

        {/* Price summary with discount */}
        {promoData && (
          <div style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:12, color:'#6b7280', textDecoration:'line-through' }}>J${calcPrice(v).toLocaleString()}</div>
              <div style={{ fontSize:15, fontWeight:700, color:GREEN }}>J${calcFinalPrice(v).toLocaleString()} after {promoData.discount}% off</div>
            </div>
            <div style={{ fontSize:22 }}>🎉</div>
          </div>
        )}

        <button onClick={handleBook} disabled={loading}
          style={{ width:'100%', padding:'16px', background:loading?'#2a2a2a':'linear-gradient(135deg,#6A1BB9,#4c1d95)', color:loading?'rgba(255,255,255,0.3)':'#ffffff', border:'none', borderRadius:14, fontSize:15, fontWeight:700, cursor:loading?'default':'pointer', boxShadow:loading?'none':'0 4px 20px rgba(106,27,185,0.5)', letterSpacing:0.3, marginTop:4 }}>
          {loading ? 'Creating booking...' : 'Book Ride — J$' + calcFinalPrice(v).toLocaleString()}
        </button>
      </div>

      {/* ── CHOOSE RIDE BANNERS ── */}
      <div style={{ padding:'16px 16px 0', background:'#f5f6fa' }}>

        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>🆘</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>SOS Emergency Button</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>During your ride, hold the <strong style={{color:'#f09595'}}>SOS button for 5 seconds</strong> at any time to send an emergency alert with your live location to our admin team. Your safety always comes first.</div>
          </div>
        </div>

        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>💳</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>Get Ready — Driver Coming Soon!</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Make sure you have your <strong style={{color:'#ffffff'}}>cash ready</strong> to pay your driver on arrival. Also grab your <strong style={{color:'#ffffff'}}>keys, phone, and any belongings</strong> — your driver will be at your pickup point shortly!</div>
          </div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>🚗 Choosing the Right Vehicle</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>
            <strong>VilleRide</strong> — Standard car, great for 1–4 passengers.<br/>
            <strong>VilleXL</strong> — Larger vehicle for 5–6 passengers or extra luggage.<br/>
            <strong>VilleMoto</strong> — Motorcycle, fastest option for short solo trips.
          </div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>⚡ Surge Pricing Explained</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>Between <strong>5pm and 8pm</strong> peak hours, fares may be slightly higher due to high demand. Book early or travel off-peak to get the best rates.</div>
        </div>
      </div>

      {/* ── NO DRIVERS AVAILABLE MODAL ── */}
      {noDrivers && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ background:'#ffffff', borderRadius:20, padding:28, maxWidth:360, width:'100%', textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', border:'1px solid #e9d5ff' }}>
          <img src="/logo.png" alt="VilleCabs" style={{ height:40, objectFit:'contain', marginBottom:16 }}/>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#f5f0ff', border:'2px solid #e9d5ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 16px' }}>🚕</div>
          <h2 style={{ fontSize:18, fontWeight:800, color:'#6b21a8', margin:'0 0 12px', lineHeight:1.3 }}>No Drivers Available Right Now</h2>
          <p style={{ fontSize:14, color:'#374151', lineHeight:1.7, margin:'0 0 8px' }}>
            Thank you for choosing VilleCabs.
          </p>
          <p style={{ fontSize:14, color:'#374151', lineHeight:1.7, margin:'0 0 8px' }}>
            We are currently expanding our driver network in Mandeville. Please try again shortly.
          </p>
          <p style={{ fontSize:14, color:'#374151', lineHeight:1.7, margin:'0 0 20px' }}>
            We're working hard to bring more drivers online every day.
          </p>
          <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:10, padding:'10px 14px', marginBottom:20, fontSize:12, color:'#6b21a8' }}>
            📊 Your request has been saved to help us improve driver coverage in your area.
          </div>
          <button onClick={() => { setNoDrivers(false); go('customer-dash'); }}
            style={{ width:'100%', padding:'14px', background:'#6b21a8', color:'#ffffff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(107,33,168,0.3)' }}>
            Got It
          </button>
          <button onClick={() => setNoDrivers(false)}
            style={{ width:'100%', padding:'10px', background:'transparent', color:'#6b21a8', border:'none', borderRadius:12, fontSize:13, cursor:'pointer', marginTop:8, fontWeight:600 }}>
            Try Again
          </button>
        </div>
      </div>
    )}
  </div>
  );
}
function BookingConfirm({ go, bookingId, setBookingId, pickupData, dropoffData, user }) {
  const [booking,  setBooking]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Load booking details
  useEffect(() => {
    if (!bookingId) return;
    getDoc(doc(db,'bookings',bookingId)).then(snap => {
      if (snap.exists()) setBooking({ id:snap.id, ...snap.data() });
    }).catch(e => console.error(e));
  }, [bookingId]);

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true); setError('');
    try {
      if (bookingId) {
        // Update booking status to searching if needed
        await updateDoc(doc(db,'bookings',bookingId), { status:'searching', confirmedAt: serverTimestamp() });
      }
      go('live-ride');
    } catch(e) {
      setError('Failed to confirm. Please try again.');
      setLoading(false);
    }
  };

  // Get fare from booking (Firestore) or pickupData (passed from VehicleSelect)
  const fare    = booking?.fare || pickupData?.fare || 0;
  const dist    = booking?.distanceKm || pickupData?.distanceKm || 0;
  const address = booking?.pickup?.address || pickupData?.address || '';
  const dropoff = booking?.dropoff?.address || dropoffData?.address || '';
  const vehicle = booking?.vehicleType || pickupData?.vehicleType || 'VilleRide';

  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <TopBar title="Confirm Booking" onBack={() => go('vehicle-select')} go={go} user={user}/>

      <div style={{ padding:16, maxWidth:520, margin:'0 auto' }}>

        {error && (
          <div style={{ background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:12, padding:'12px 14px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>
        )}

        {/* Route card */}
        <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }}>Your Route</div>
          <div style={{ display:'flex', gap:10, marginBottom:8 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:'#1a9e5a', flexShrink:0, marginTop:3 }}/>
            <div>
              <div style={{ fontSize:10, color:'#888', marginBottom:1 }}>PICKUP</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{address||'—'}</div>
            </div>
          </div>
          <div style={{ width:1, height:14, background:'#e9d5ff', marginLeft:4, marginBottom:8 }}/>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:'#6b21a8', flexShrink:0, marginTop:3 }}/>
            <div>
              <div style={{ fontSize:10, color:'#888', marginBottom:1 }}>DROP-OFF</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{dropoff||'—'}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
            {dist>0 && <div style={{ fontSize:11, background:'#f9f5ff', color:'#6b21a8', padding:'3px 10px', borderRadius:8 }}>📏 {dist} km</div>}
            <div style={{ fontSize:11, background:'#f9f5ff', color:'#6b21a8', padding:'3px 10px', borderRadius:8 }}>🚗 {vehicle}</div>
            <div style={{ fontSize:11, background:'#f9f5ff', color:'#6b21a8', padding:'3px 10px', borderRadius:8 }}>👥 {booking?.passengers||pickupData?.passengers||1} passenger{(booking?.passengers||1)>1?'s':''}</div>
          </div>
        </div>

        {/* Fare */}
        <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 }}>Estimated Fare</div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:15, color:'#555' }}>Total</span>
            <span style={{ fontSize:24, fontWeight:800, color:'#6b21a8' }}>J${fare.toLocaleString()}</span>
          </div>
          <div style={{ fontSize:11, color:'#888', marginTop:8, lineHeight:1.5 }}>
            Fares may vary based on route changes, traffic, waiting time, or additional stops.
          </div>
        </div>

        {/* Payment */}
        <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 }}>Payment</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:28 }}>💵</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e' }}>Cash Payment</div>
              <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Pay J${fare.toLocaleString()} directly to your driver on arrival.</div>
            </div>
          </div>
        </div>

        {/* Safety */}
        <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:14, padding:'12px 14px', marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', marginBottom:4 }}>🛡️ Before You Board</div>
          <div style={{ fontSize:12, color:'#555', lineHeight:1.6 }}>Verify the driver name, licence plate, vehicle make and colour before entering the vehicle.</div>
        </div>

        <button onClick={handleConfirm} disabled={loading}
          style={{ width:'100%', padding:'16px', background:loading?'#9ca3af':'#6b21a8', color:'#fff', border:'none', borderRadius:14, fontSize:16, fontWeight:700, cursor:loading?'default':'pointer', boxShadow:'0 4px 16px rgba(107,33,168,0.35)', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
          {loading ? (
            <><div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.4)', borderTop:'2px solid #fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>Finding your driver...</>
          ) : (
            <>🚕 Confirm — Pay J${fare.toLocaleString()} Cash</>
          )}
        </button>
        <button onClick={() => go('vehicle-select')} disabled={loading}
          style={{ width:'100%', padding:'13px', background:'#fff', color:'#888', border:'1px solid #e5e7eb', borderRadius:14, fontSize:14, cursor:'pointer' }}>
          ← Change Ride
        </button>
      </div>
    </div>
  );
}


// ── LIVE RIDE ─────────────────────────────────────────────────────────────────
// ── SEARCHING ANIMATION ───────────────────────────────────────────────────────
function SearchingAnimation({ onCancel }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const msgs = ['Checking nearby drivers…','Sending your request…','Almost there…','Searching Mandeville area…'];
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i+1) % msgs.length), 2500);
    return () => clearInterval(t);
  }, [msgs.length]);
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 20px', textAlign:'center' }}>
      <div style={{ position:'relative', width:80, height:80, marginBottom:20 }}>
        <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid rgba(232,180,0,0.2)', animation:'pulse 2s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', inset:6, borderRadius:'50%', border:'2px solid rgba(232,180,0,0.4)', animation:'pulse 2s ease-in-out infinite', animationDelay:'0.3s' }}/>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:36 }}>🚕</div>
      </div>
      <div style={{ fontSize:17, fontWeight:700, color:'#1a1a2e', marginBottom:6 }}>Finding your driver…</div>
      <div key={msgIdx} style={{ fontSize:13, color:'#888aaa', marginBottom:6, animation:'fadeSlideIn 0.4s ease' }}>{msgs[msgIdx]}</div>
      <div style={{ fontSize:12, color:'#aaa', marginBottom:24 }}>Searching nearby VilleCabs drivers in Mandeville</div>
      <button onClick={onCancel} style={{ padding:'10px 24px', background:'#fff0f0', border:'1px solid #ffcccc', borderRadius:20, color:'#cc2222', fontSize:13, cursor:'pointer', fontWeight:500 }}>Cancel Ride</button>
    </div>
  );
}

function LiveRide({ go, bookingId, setBookingId, user, setUser, pickupData, dropoffData }) {
  const [forceUpdate,  setForceUpdate]  = useState(0);
  const [booking,      setBooking]      = useState(null);
  const [rating,       setRating]       = useState(0);
  const [rated,        setRated]        = useState(false);
  const [driverInfo,   setDriverInfo]   = useState(null);
  const [directions,   setDirections]   = useState(null);
  const [sosSent,    setSosSent]    = useState(false);
  const [sosHolding, setSosHolding] = useState(false);
  const [sosCount,   setSosCount]   = useState(5);
  const [cancelling, setCancelling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const sosRef = useRef(null);

  const cancelRide = async () => {
    if (!bookingId || !window.confirm('Cancel this ride? The booking will be removed.')) return;
    setCancelling(true);
    try {
      await updateDoc(doc(db,'bookings',bookingId), {
        status:      'cancelled',
        cancelledBy: 'customer',
        cancelledAt: serverTimestamp(),
      });
      setCancelDone(true);
    } catch(err) { console.error('Cancel error:', err); }
    setCancelling(false);
  };

  // Block browser back button when searching
  useEffect(() => {
    if (!booking || booking?.status !== 'searching') return;
    const handlePop = () => {
      window.history.pushState(null, '', window.location.href);
      alert('Please cancel your ride before leaving this page.');
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [booking?.status]);

  useEffect(() => {
    if (!bookingId && user?.uid) {
      // BookingId missing - find customer's active booking automatically
      getDocs(query(
        collection(db,'bookings'),
        where('customerId','==',user.uid),
        where('status','in',['searching','active'])
      )).then(snap => {
        if (!snap.empty) {
          const active = snap.docs[0];
          setBookingId(active.id);
        }
      }).catch(e => console.error(e));
      return;
    }
    if (!bookingId) return;
    let prevStatus = null;
    const unsub = onSnapshot(doc(db,'bookings',bookingId), snap => {
      if (snap.exists()) {
        const data = { id:snap.id, ...snap.data() };
        setBooking(data);
        // Browser notification when driver accepts
        if (data.status === 'active' && prevStatus !== 'active') {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('🚗 Driver found!', {
              body: `${data.driverName||'Your driver'} is on the way in a ${data.vehicleMake||''} ${data.vehicleModel||''} · ${data.licensePlate||''}`,
              icon: '/logo.png',
            });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') {
                new Notification('🚗 Driver found!', {
                  body: `${data.driverName||'Your driver'} is on the way!`,
                  icon: '/logo.png',
                });
              }
            });
          }
        }
        // Browser notification when driver arrives
        if (data.driverArrived && prevStatus !== 'arrived') {
          prevStatus = 'arrived';
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('📍 Driver has arrived!', {
              body: `${data.driverName||'Your driver'} is at your pickup location. Please come outside!`,
              icon: '/logo.png',
            });
          }
        }
        prevStatus = data.status;
      }
    }, err => {
      console.error('LiveRide listener error:', err);
    });
    return () => unsub();
  }, [bookingId]);

  useEffect(() => {
    if (!booking?.driverId) return;
    getDoc(doc(db,'drivers',booking.driverId)).then(snap => {
      if (snap.exists()) setDriverInfo(snap.data());
    });
  }, [booking?.driverId]);

  // Force completed screen when booking status changes to completed
  useEffect(() => {
    if (booking?.status === 'completed') {
      setForceUpdate(n => n + 1);
    }
  }, [booking?.status]);


  useEffect(() => () => { if (sosRef.current) clearInterval(sosRef.current); }, []);

  const startSOS = () => {
    if (sosSent) return;
    setSosHolding(true);
    setSosCount(5);
    sosRef.current = setInterval(() => {
      setSosCount(prev => {
        if (prev <= 1) {
          clearInterval(sosRef.current);
          triggerSOS();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (sosSent) return;
    setSosHolding(false);
    setSosCount(5);
    clearInterval(sosRef.current);
  };

  const triggerSOS = async () => {
    setSosHolding(false);
    setSosSent(true);
    try {
      let lat = booking?.pickup?.lat || 18.0416;
      let lng = booking?.pickup?.lng || -77.5036;
      if (navigator.geolocation) {
        await new Promise(res => navigator.geolocation.getCurrentPosition(
          p => { lat = p.coords.latitude; lng = p.coords.longitude; res(); },
          () => res(), { timeout: 3000 }
        ));
      }
      await addDoc(collection(db,'sos_alerts'), {
        userId:       user?.uid || '',
        userName:     user?.name || 'Customer',
        userRole:     'customer',
        bookingId:    bookingId,
        driverName:   booking?.driverName || '--',
        customerName: booking?.customerName || '--',
        vehicleMake:  booking?.vehicleMake || '',
        vehicleModel: booking?.vehicleModel || '',
        licensePlate: booking?.licensePlate || '',
        pickup:       booking?.pickup?.address || '--',
        dropoff:      booking?.dropoff?.address || '--',
        lat, lng,
        mapsLink:     `https://maps.google.com/?q=${lat},${lng}`,
        status:       'ACTIVE',
        createdAt:    serverTimestamp(),
      });
    } catch(err) { console.error('SOS error:', err); }
  };

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

  // Safe defaults - never crash even if booking is null
  const pickupCoords  = booking?.pickup?.lat    ? { lat:booking.pickup.lat,         lng:booking.pickup.lng         } : MANCHESTER_CENTER;
  const dropoffCoords = booking?.dropoff?.lat   ? { lat:booking.dropoff.lat,        lng:booking.dropoff.lng        } : null;
  const driverCoords  = booking?.driverLocation ? { lat:booking.driverLocation.lat, lng:booking.driverLocation.lng } : null;

  // Compute directions: driver→pickup OR pickup→dropoff
  useEffect(() => {
    if (!window.google?.maps?.DirectionsService) return;
    const enroute     = booking?.enrouteToDropoff;
    const origin      = enroute ? pickupCoords  : driverCoords;
    const destination = enroute ? dropoffCoords : pickupCoords;
    if (!origin?.lat || !destination?.lat) { setDirections(null); return; }
    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin:      { lat: origin.lat, lng: origin.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode:  window.google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK') setDirections(result);
      else { console.warn('Directions failed:', status); setDirections(null); }
    });
  }, [driverCoords?.lat, driverCoords?.lng, pickupCoords?.lat, booking?.enrouteToDropoff]);

  // ── Cancelled screen ──
  if (cancelDone || booking?.status === 'cancelled') {
    return (
      <div style={{ ...s.content, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ textAlign:'center', padding:24 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>❌</div>
          <h2 style={{ fontSize:20, fontWeight:500, color:'#fff', marginBottom:8 }}>Ride Cancelled</h2>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:13, marginBottom:28 }}>Your booking has been cancelled successfully.</p>
          <button style={s.btnY} onClick={() => go('customer-dash')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Loading screen ──
  if (!booking) {
    return (
      <div style={{ ...s.content, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🚕</div>
          <div style={{ color:YELLOW, fontSize:16, fontWeight:500, marginBottom:8 }}>Finding your driver...</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13 }}>Setting up your ride</div>
          <button style={{ ...s.btnO, marginTop:24 }} onClick={async () => {
            if (bookingId) {
              if (!window.confirm('You must cancel your ride before leaving.')) return;
              try { await updateDoc(doc(db,'bookings',bookingId), { status:'cancelled', cancelledBy:'customer', cancelledAt:serverTimestamp() }); } catch(e) {}
            }
            go('customer-dash');
          }}>Cancel & Go Back</button>
        </div>
      </div>
    );
  }

  // ── Completed screen ──
  if (booking?.status === 'completed') {
    const completedTime = booking.completedAt?.seconds
      ? new Date(booking.completedAt.seconds*1000).toLocaleTimeString('en-JM',{hour:'2-digit',minute:'2-digit'})
      : '--';
    const completedDate = booking.completedAt?.seconds
      ? new Date(booking.completedAt.seconds*1000).toLocaleDateString('en-JM',{day:'numeric',month:'short',year:'numeric'})
      : '--';
    return (
      <div style={{ ...s.content, minHeight:'100vh', background:'transparent' }}>
        <div style={{ padding:'24px 20px', display:'flex', flexDirection:'column', alignItems:'center', minHeight:'100vh' }}>
          {/* Receipt header */}
          <div style={{ textAlign:'center', marginBottom:20, paddingTop:20 }}>
            <div style={{ width:70, height:70, borderRadius:'50%', background:'rgba(26,158,90,0.15)', border:'2px solid rgba(26,158,90,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 12px' }}>✅</div>
            <h2 style={{ fontSize:22, fontWeight:700, color:WHITE, margin:'0 0 4px' }}>Ride Complete!</h2>
            <p style={{ fontSize:13, color:'#6b7280', margin:0 }}>You have arrived safely</p>
          </div>

          {/* Receipt card */}
          <div style={{ background:'rgba(15,20,40,0.85)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:18, padding:20, width:'100%', maxWidth:400, marginBottom:16 }}>
            {/* Receipt title */}
            <div style={{ textAlign:'center', marginBottom:16, paddingBottom:14, borderBottom:'0.5px dashed rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>VilleCabs Receipt</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>{completedDate} · {completedTime}</div>
            </div>
            {/* Route */}
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:GREEN, flexShrink:0, marginTop:3 }}/>
                <div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:2 }}>PICKUP</div>
                  <div style={{ fontSize:13, color:WHITE }}>{booking.pickup?.address?.split('—')[0]?.trim() || '--'}</div>
                </div>
              </div>
              <div style={{ width:1, height:16, background:'rgba(255,255,255,0.1)', marginLeft:4, marginBottom:8 }}/>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:YELLOW, flexShrink:0, marginTop:3 }}/>
                <div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:2 }}>DROP-OFF</div>
                  <div style={{ fontSize:13, color:WHITE }}>{booking.dropoff?.address?.split('—')[0]?.trim() || '--'}</div>
                </div>
              </div>
            </div>
            {/* Details */}
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:12, marginBottom:14 }}>
              {[
                ['Driver', booking.driverName||'--'],
                ['Vehicle', booking.vehicleMake ? `${booking.vehicleMake} ${booking.vehicleModel||''}` : '--'],
                ['Plate', booking.licensePlate||'--'],
                ['Distance', `${booking.distanceKm||'--'} km`],
                ['Vehicle type', booking.vehicleType||'--'],
                ['Payment', booking.paymentMethod||'Cash'],
              ].map(([k,v],i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:i<5?8:0 }}>
                  <span style={{ color:'rgba(255,255,255,0.5)' }}>{k}</span>
                  <span style={{ color:WHITE, fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
            {/* Total */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'0.5px dashed rgba(255,255,255,0.1)', paddingTop:14 }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:1 }}>Total Paid</div>
                {booking.promoCode && <div style={{ fontSize:11, color:GREEN, marginTop:2 }}>🎟️ {booking.promoCode} applied</div>}
              </div>
              <div style={{ fontSize:24, fontWeight:700, color:GREEN }}>J${booking.fare?.toLocaleString()}</div>
            </div>
          </div>

          {/* Rating */}
          {!rated ? (
            <div style={{ width:'100%', maxWidth:400, background:'rgba(15,20,40,0.7)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14, textAlign:'center' }}>
              <p style={{ fontSize:14, color:WHITE, fontWeight:500, marginBottom:4 }}>How was your ride?</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:14 }}>Rate your driver</p>
              <div style={{ display:'flex', gap:10, justifyContent:'center', marginBottom:14 }}>
                {[1,2,3,4,5].map(star => (
                  <div key={star} onClick={() => setRating(star)} style={{ fontSize:36, cursor:'pointer', opacity:star<=rating?1:0.25, transition:'opacity 0.2s' }}>⭐</div>
                ))}
              </div>
              {rating > 0 && <button style={s.btnY} onClick={submitRating}>Submit Rating</button>}
            </div>
          ) : (
            <div style={{ ...s.successBox, width:'100%', maxWidth:400, textAlign:'center', marginBottom:14 }}>⭐ Thanks for rating your driver!</div>
          )}

          <button style={{ ...s.btnY, width:'100%', maxWidth:400 }} onClick={() => go('customer-dash')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Live tracking screen ──
  return (
    <div style={{ ...s.content }}>
      <div style={{ position:'relative' }}>
        <VilleMap height={typeof window!=='undefined'?Math.max(320,window.innerHeight*0.45):320} center={driverCoords||pickupCoords} zoom={15} expandable={true} directions={directions}>
          <Marker position={pickupCoords} title="Pickup"
            icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#1a9e5a" stroke="white" stroke-width="2.5"/></svg>'), scaledSize:{width:28,height:28} }}/>
          {dropoffCoords && (
            <Marker position={dropoffCoords} title="Drop-off"
              icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#e8b400" stroke="white" stroke-width="2.5"/></svg>'), scaledSize:{width:28,height:28} }}/>
          )}
          {driverCoords && (
            <Marker position={driverCoords} title="Your driver"
              icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#1a1a2e" stroke="#e8b400" stroke-width="3"/><text x="22" y="29" text-anchor="middle" font-size="20">🚗</text></svg>'), scaledSize:{width:44,height:44} }}/>
          )}
        </VilleMap>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(10,15,35,0.88)', backdropFilter:'blur(8px)', padding:'7px 14px', textAlign:'center', fontSize:12, color:YELLOW, fontWeight:500 }}>
          {(booking?.status==='active'||booking?.status==='arrived')
            ? booking?.enrouteToDropoff
              ? '🚗 En route to drop-off — tracking live'
              : driverCoords
                ? '📍 Tracking driver live on map'
                : '🟢 Driver accepted — heading to you'
            : '🔍 Finding your driver...'}
        </div>
      </div>

      <div style={{ padding:14 }}>
        {booking?.driverId ? (
          <>
            {/* Driver safety card */}
            <div style={{ background:'rgba(15,20,40,0.65)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:14, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:10, fontWeight:500 }}>🛡️ Driver & Vehicle Info</div>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:46, height:46, borderRadius:'50%', background:'rgba(232,180,0,0.15)', border:'1.5px solid rgba(232,180,0,0.3)', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                  {driverInfo?.photoURL
                    ? <img src={driverInfo.photoURL} alt="Driver" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : '👤'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:500, color:WHITE }}>{booking.driverName||'--'}</div>
                  <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                    {driverInfo?.rating ? `⭐ ${driverInfo.rating.toFixed(1)} · ${driverInfo.ratingCount||0} reviews` : '⭐ New driver'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>📞</div>
                    <span style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>Call</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }} onClick={() => go('chat')}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(232,180,0,0.2)', border:'1px solid #e8b400', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>💬</div>
                    <span style={{ fontSize:9, color:YELLOW }}>Chat</span>
                  </div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>Make & Model</div>
                  <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>{booking.vehicleMake ? `${booking.vehicleMake} ${booking.vehicleModel||''}` : '--'}</div>
                </div>
                <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginBottom:3 }}>License Plate</div>
                  <div style={{ fontSize:15, fontWeight:700, color:YELLOW, letterSpacing:1 }}>{booking.licensePlate||'--'}</div>
                </div>
              </div>
            </div>

            {/* Fare + status */}
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              <div style={{ flex:1, background:'rgba(15,20,40,0.65)', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Status</div>
                <div style={{ fontSize:13, fontWeight:500, color:WHITE, textTransform:'capitalize' }}>{booking?.status||'searching'}</div>
              </div>
              <div style={{ flex:1, background:'rgba(15,20,40,0.65)', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Fare</div>
                <div style={{ fontSize:13, fontWeight:500, color:GREEN }}>J${booking?.fare?.toLocaleString()||'--'}</div>
              </div>
              <div style={{ flex:1, background:'rgba(15,20,40,0.65)', borderRadius:10, padding:10, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)' }}>Payment</div>
                <div style={{ fontSize:11, fontWeight:500, color:YELLOW, textTransform:'capitalize' }}>{booking?.paymentMethod||'cash'}</div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ background:'rgba(232,180,0,0.08)', border:'1px solid rgba(232,180,0,0.3)', borderRadius:12, padding:20, marginBottom:12, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
            <div style={{ fontSize:15, fontWeight:500, color:YELLOW, marginBottom:4 }}>Finding your driver...</div>
            <div style={{ fontSize:12, color:'#6b7280' }}>Drivers in Manchester are being notified</div>
            <button onClick={cancelRide} disabled={cancelling}
              style={{ marginTop:14, padding:'9px 24px', background:'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.4)', borderRadius:10, color:'#f09595', fontSize:13, cursor:'pointer', opacity:cancelling?0.6:1 }}>
              {cancelling ? 'Cancelling...' : '✕ Cancel Ride'}
            </button>
          </div>
        )}

        {/* Driver arrived in-screen alert */}
        {(booking?.driverArrived || booking?.status === 'arrived') && !booking?.enrouteToDropoff && (
          <div style={{ background:'#fffbe6', border:'2px solid #e8b400', borderRadius:12, padding:14, marginBottom:12, display:'flex', alignItems:'center', gap:12, boxShadow:'0 2px 8px rgba(232,180,0,0.2)' }}>
            <div style={{ fontSize:28 }}>📍</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#b38600' }}>Driver has arrived!</div>
              <div style={{ fontSize:12, color:'#555', marginTop:2 }}>{booking.driverName} is at your pickup location</div>
              <div style={{ fontSize:11, color:'#777', marginTop:2 }}>Please come outside 🚶</div>
            </div>
          </div>
        )}

        {/* En route to drop-off banner */}
        {booking?.enrouteToDropoff && booking?.status === 'active' && (
          <div style={{ background:'#f0fff8', border:'2px solid #1a9e5a', borderRadius:12, padding:14, marginBottom:12, display:'flex', alignItems:'center', gap:12, boxShadow:'0 2px 8px rgba(26,158,90,0.15)' }}>
            <div style={{ fontSize:28 }}>🚗</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#1a7a45' }}>On the way to drop-off!</div>
              <div style={{ fontSize:12, color:'#444', marginTop:2 }}>{booking.driverName} has picked you up</div>
              <div style={{ fontSize:11, color:'#666', marginTop:2 }}>Heading to {booking.dropoff?.address?.split(',')[0]} 📍</div>
            </div>
          </div>
        )}

        
        {/* En route to drop-off banner */}
        {booking?.enrouteToDropoff && booking?.status === 'active' && (
          <div style={{ background:'#f0fff8', border:'2px solid #1a9e5a', borderRadius:12, padding:14, marginBottom:12, display:'flex', alignItems:'center', gap:12, boxShadow:'0 2px 8px rgba(26,158,90,0.15)' }}>
            <div style={{ fontSize:28 }}>🚗</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#1a7a45' }}>On the way to drop-off!</div>
              <div style={{ fontSize:12, color:'#444', marginTop:2 }}>{booking.driverName} has picked you up</div>
              <div style={{ fontSize:11, color:'#666', marginTop:2 }}>Heading to {booking.dropoff?.address?.split(',')[0]} 📍</div>
            </div>
          </div>
        )}

        {/* Manual refresh if ride shows completed */}
        {booking?.status === 'completed' && (
          <div style={{ background:'rgba(26,158,90,0.15)', border:'0.5px solid rgba(26,158,90,0.4)', borderRadius:12, padding:14, marginBottom:12, textAlign:'center' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>✅</div>
            <div style={{ fontSize:14, fontWeight:500, color:GREEN, marginBottom:8 }}>Ride completed!</div>
            <button style={s.btnY} onClick={() => setBooking(prev => ({ ...prev }))}>View Receipt & Rate Driver</button>
          </div>
        )}

        {/* SOS Button */}
        {sosSent ? (
          <div style={{ background:'rgba(226,75,74,0.2)', border:'1.5px solid rgba(226,75,74,0.5)', borderRadius:12, padding:'12px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:24 }}>🚨</div>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:'#f09595' }}>SOS Alert Sent!</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Admin notified with your location</div>
            </div>
          </div>
        ) : (
          <div
            onMouseDown={startSOS} onMouseUp={cancelSOS} onMouseLeave={cancelSOS}
            onTouchStart={startSOS} onTouchEnd={cancelSOS}
            style={{ background:sosHolding?'rgba(226,75,74,0.35)':'rgba(226,75,74,0.12)', border:`1.5px solid ${sosHolding?'#e24b4a':'rgba(226,75,74,0.4)'}`, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer', marginBottom:12, userSelect:'none' }}>
            <div style={{ fontSize:26 }}>🆘</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#f09595' }}>{sosHolding ? `Sending SOS in ${sosCount}s...` : 'SOS Emergency'}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{sosHolding ? 'Release to cancel' : 'Hold 5 seconds to send emergency alert'}</div>
            </div>
            {sosHolding && <div style={{ width:34, height:34, borderRadius:'50%', border:'3px solid #e24b4a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#f09595' }}>{sosCount}</div>}
          </div>
        )}

        {/* Only show back button when driver is active — not when searching */}
        {booking?.status === 'searching' ? (
          <button onClick={cancelRide} disabled={cancelling}
            style={{ ...s.btnO, color:'#f09595', borderColor:'rgba(226,75,74,0.4)', marginBottom:0, opacity:cancelling?0.6:1 }}>
            {cancelling ? 'Cancelling...' : '✕ Cancel Ride'}
          </button>
        ) : (
          <button style={s.btnO} onClick={() => go('customer-dash')}>Back to Dashboard</button>
        )}
      </div>
    </div>
  );
}


// ── DRIVER TERMS ──────────────────────────────────────────────────────────────
function DriverTermsScreen({ go, user }) {
  const [agreed1, setAgreed1] = useState(false);
  const [agreed2, setAgreed2] = useState(false);
  const [agreed3, setAgreed3] = useState(false);
  const [agreed4, setAgreed4] = useState(false);
  const canContinue = agreed1 && agreed2 && agreed3 && agreed4;

  const handleContinue = async () => {
    try { await updateDoc(doc(db,'drivers',user.uid), { termsAccepted:true, termsAcceptedAt:serverTimestamp() }); } catch(e) {}
    go('driver-welcome-tips');
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <div style={{ background:'rgba(10,15,35,0.92)', padding:'16px 18px', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', gap:10 }}>
        <img src="/logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
        <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs — Driver Agreement</span>
      </div>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:100 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:WHITE, marginBottom:4 }}>Driver Terms & Agreement</h2>
        <p style={{ fontSize:13, color:'#6b7280', marginBottom:20 }}>Please read carefully before driving with VilleCabs</p>

        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:18, marginBottom:16, maxHeight:320, overflowY:'auto' }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8', marginBottom:12 }}>VilleCabs Driver Agreement</div>
          {[
            ['1. Independent Contractor', 'You are an independent contractor, not an employee of VilleCabs. You are responsible for your own taxes, insurance, and vehicle maintenance.'],
            ['2. Service Fee', 'VilleCabs charges a 15% platform service fee on your monthly earnings. This means you keep 85% of every fare. For example: if you earn J$100,000 in a month, J$15,000 goes to VilleCabs and you keep J$85,000.'],
            ['3. Estimated Fares', 'Fare estimates are calculated by the VilleCabs platform based on distance, time, route, and applicable fees. Final fares may vary because of route changes, traffic conditions, waiting time, tolls, or additional stops.'],
            ['4. Vehicle Standards', 'Your vehicle must be roadworthy, properly licensed, and maintain a valid fitness certificate at all times. VilleCabs reserves the right to suspend drivers whose vehicles do not meet standards.'],
            ['5. Conduct', 'You must treat all passengers with respect and professionalism. Abusive, dangerous, or discriminatory behaviour will result in immediate suspension and possible removal from the platform.'],
            ['6. Safety', 'You are responsible for safe driving at all times. Speeding, driving under the influence, or dangerous driving will result in permanent removal from VilleCabs.'],
            ['7. Ride Completion', 'Once you accept a ride you must complete it or contact the passenger immediately if unable to do so. Frequent cancellations after acceptance may result in account suspension.'],
            ['8. Location Sharing', 'When on an active ride you must allow the app to share your GPS location with the passenger. This is required for the live tracking feature.'],
            ['9. Earnings & Payments', 'Fares are collected in cash from passengers. VilleCabs will track your monthly earnings and the 15% service fee will be settled at the end of each month.'],
            ['10. Account Suspension', 'VilleCabs reserves the right to suspend or terminate your driver account for breach of these terms, poor ratings, or conduct unbecoming of a VilleCabs driver.'],
          ].map(([title, text], i) => (
            <div key={i} style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:WHITE, marginBottom:4 }}>{title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', lineHeight:1.7 }}>{text}</div>
            </div>
          ))}
        </div>

        {[
          [agreed1, setAgreed1, 'I have read and agree to the VilleCabs Driver Agreement'],
          [agreed2, setAgreed2, 'I understand and accept the 15% monthly platform service fee'],
          [agreed3, setAgreed3, 'I confirm my vehicle is roadworthy, licensed and insured'],
          [agreed4, setAgreed4, 'I agree to treat all passengers with respect and drive safely at all times'],
        ].map(([val, setter, label], i) => (
          <div key={i} onClick={() => setter(!val)}
            style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', background:'rgba(15,20,40,0.6)', border:`1px solid ${val?YELLOW:'rgba(255,255,255,0.1)'}`, borderRadius:10, marginBottom:10, cursor:'pointer' }}>
            <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${val?YELLOW:'rgba(255,255,255,0.3)'}`, background:val?YELLOW:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
              {val && <span style={{ color:DARK, fontSize:13, fontWeight:700 }}>✓</span>}
            </div>
            <span style={{ fontSize:13, color:'rgba(255,255,255,0.8)', lineHeight:1.5 }}>{label}</span>
          </div>
        ))}

        <button onClick={handleContinue} disabled={!canContinue}
          style={{ ...s.btnY, opacity:canContinue?1:0.4, marginTop:8 }}>
          Agree & Continue →
        </button>
      </div>
    </div>
  );
}

// ── DRIVER WELCOME TIPS ───────────────────────────────────────────────────────
function DriverWelcomeTips({ go, user }) {
  const [step, setStep] = useState(0);

  const tips = [
    {
      icon: '📱',
      title: 'Go Online to Accept Rides',
      desc: 'Your default status is Offline. From your dashboard tap "Go Online" to start receiving ride requests from customers in Manchester. Go offline anytime you are not available.',
      color: GREEN,
    },
    {
      icon: '💬',
      title: 'Negotiate Fares With Customers',
      desc: "The app shows a suggested fare based on distance. You can chat with the customer directly in the app to confirm the estimated fare before or during the ride. Always agree before starting.",
      color: YELLOW,
    },
    {
      icon: '💰',
      title: '15% Platform Service Fee',
      desc: 'VilleCabs charges 15% of your monthly earnings as a platform fee. You keep 85% of every fare. Example: J$100,000 earned → J$15,000 to VilleCabs → J$85,000 yours. Fees are settled monthly.',
      color: '#38bdf8',
    },
    {
      icon: '📍',
      title: 'Use Live GPS Tracking',
      desc: "When you accept a ride always allow location access. Your GPS location is shared with the customer in real time so they can track you. Tap \"I Have Arrived\" when you reach the pickup point.",
      color: '#a78bfa',
    },
    {
      icon: '🆘',
      title: 'SOS Emergency Button',
      desc: "Your safety matters. During any ride hold the SOS button for 5 seconds to send an emergency alert with your location to our admin team immediately. Use it if you ever feel unsafe.",
      color: '#f09595',
    },
    {
      icon: '⭐',
      title: 'Build Your Rating',
      desc: "Customers rate their experience after every ride. A high rating means more ride requests. Be punctual, polite, and professional. Drivers with ratings below 3.0 may be reviewed by admin.",
      color: YELLOW,
    },
  ];

  const handleContinue = async () => {
    if (step < tips.length - 1) { setStep(step + 1); return; }
    try { await updateDoc(doc(db,'drivers',user.uid), { tipsSeen:true }); } catch(e) {}
    go('driver-dash');
  };

  const t = tips[step];

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <div style={{ background:'rgba(10,15,35,0.92)', padding:'16px 18px', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
          <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>Driver Guide</span>
        </div>
        <span style={{ color:'#888', fontSize:12 }}>{step+1} of {tips.length}</span>
      </div>
      <div style={{ ...s.center, paddingTop:0 }}>
        <div style={{ width:'100%', maxWidth:420, padding:'0 20px' }}>
          <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:40 }}>
            {tips.map((_,i) => (
              <div key={i} style={{ width:i===step?24:8, height:8, borderRadius:4, background:i===step?t.color:'rgba(255,255,255,0.15)', transition:'all 0.3s' }}/>
            ))}
          </div>
          <div style={{ background:'rgba(15,20,40,0.75)', border:`1.5px solid ${t.color}33`, borderRadius:20, padding:28, marginBottom:32, textAlign:'center', backdropFilter:'blur(10px)' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>{t.icon}</div>
            <div style={{ fontSize:18, fontWeight:600, color:t.color, marginBottom:12 }}>{t.title}</div>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>{t.desc}</div>
          </div>
          <button onClick={handleContinue} style={{ ...s.btnY, background:t.color, color:t.color===YELLOW?DARK:WHITE }}>
            {step < tips.length - 1 ? 'Next →' : 'Start Driving with VilleCabs 🚗'}
          </button>
          {step < tips.length - 1 && (
            <button onClick={async () => {
              try { await updateDoc(doc(db,'drivers',user.uid), { tipsSeen:true }); } catch(e) {}
              go('driver-dash');
            }} style={s.link}>Skip all tips</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DRIVER ABOUT US ───────────────────────────────────────────────────────────
function DriverAboutUs({ go, user }) {
  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="About VilleCabs" go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/logo.png" alt="VilleCabs" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(232,180,0,0.4)', marginBottom:12 }}/>
          <h2 style={{ fontSize:20, fontWeight:700, color:WHITE, marginBottom:4 }}>Welcome to VilleCabs</h2>
          <p style={{ fontSize:13, color:YELLOW, fontStyle:'italic' }}>Your city. Your ride. Your way.</p>
        </div>
        {[
          'VilleCabs is a modern ride-hailing and taxi platform built for the people of Mandeville, Manchester, Jamaica. Created to bring convenience, reliability, and opportunity to our community.',
          "We are bringing the ease and flexibility of app-based transportation to Mandeville while supporting local drivers and creating new earning opportunities within our parish.",
        ].map((t,i) => <p key={i} style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.8, marginBottom:14 }}>{t}</p>)}
        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8', marginBottom:10 }}>Driver Earnings</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.8 }}>
            You keep <strong style={{ color:GREEN }}>85%</strong> of every fare. VilleCabs charges a <strong style={{ color:YELLOW }}>15% monthly platform fee</strong> settled at the end of each month.
          </div>
        </div>
        <div style={{ background:'rgba(15,20,40,0.7)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14, fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:2 }}>
          <div>📍 Serving Mandeville & Manchester, Jamaica</div>
          <div>🌐 villecabs.com</div>
          <div>📞 Call / WhatsApp: <a href="https://wa.me/18765158113+1876-515-8113" style={{ color:YELLOW, textDecoration:'none' }}>+1876-515-8113</a></div>
        </div>
      </div>
      <Footer go={go}/>
    </div>
  );
}

// ── DRIVER CONTACT US ─────────────────────────────────────────────────────────
function DriverContactUs({ go, user }) {
  const [form,    setForm]    = useState({ name:user?.name||'', email:user?.email||'', subject:'', message:'' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSend = async () => {
    setError(''); setSuccess('');
    if (!form.name||!form.email||!form.subject||!form.message) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      await addDoc(collection(db,'contact_submissions'), {
        name:form.name, email:form.email, subject:form.subject, message:form.message,
        userId:user?.uid||null, role:'driver', createdAt:serverTimestamp(),
      });
      await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          service_id:'service_h9ryisl', template_id:'template_ss6rofa', user_id:'9-C6Nw3ZGGd5R7jto',
          template_params:{ to_email:'daviskeneile@gmail.com', to_name:'VilleCabs Admin', from_name:form.name, from_email:form.email, subject:form.subject, otp_code:`Driver message from: ${form.name} (${form.email})\\n\\nSubject: ${form.subject}\\n\\n${form.message}` },
        }),
      });
      setSuccess('Your message has been sent! We will get back to you shortly.');
      setForm({ name:user?.name||'', email:user?.email||'', subject:'', message:'' });
    } catch(e) { setSuccess('Your message has been received!'); }
    setLoading(false);
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Contact Us" go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:12, padding:14, marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:28 }}>💬</span>
          <div>
            <div style={{ fontSize:13, color:WHITE, fontWeight:500 }}>WhatsApp us directly</div>
            <a href="https://wa.me/18765158113+1876-515-8113" target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:YELLOW, textDecoration:'none' }}>+1876-515-8113</a>
          </div>
        </div>
        {error   && <div style={s.errBox}>⚠️ {error}</div>}
        {success && <div style={s.successBox}>✅ {success}</div>}
        <label style={s.lbl}>Full Name</label><input style={s.inp} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Your name"/>
        <label style={s.lbl}>Email Address</label><input style={s.inp} type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="your@email.com"/>
        <label style={s.lbl}>Subject</label><input style={s.inp} value={form.subject} onChange={e=>set('subject',e.target.value)} placeholder="e.g. Question about earnings"/>
        <label style={s.lbl}>Message</label>
        <textarea style={{ ...s.inp, height:120, resize:'vertical', fontFamily:'inherit' }} value={form.message} onChange={e=>set('message',e.target.value)} placeholder="Your message..."/>
        <button style={{ ...s.btnY, opacity:loading?0.7:1 }} onClick={handleSend} disabled={loading}>{loading?'Sending...':'Send Message'}</button>
      </div>
    </div>
  );
}

// ── DRIVER HELP ───────────────────────────────────────────────────────────────
function DriverHelp({ go, user }) {
  const [section, setSection] = useState(null);
  if (section === 'terms') return <DriverTermsScreen go={() => setSection(null)} user={user}/>;
  if (section === 'tips')  return <DriverWelcomeTips go={() => setSection(null)} user={user}/>;
  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Help & Info" go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto' }}>
        {[
          { icon:'📋', title:'Driver Agreement', desc:'View VilleCabs driver terms and service fee details', action:() => setSection('terms') },
          { icon:'💡', title:'Driver Guide', desc:'Tips on going online, negotiating fares and more', action:() => setSection('tips') },
          { icon:'🙋', title:'Contact Us', desc:'Get in touch with our support team', action:() => go('driver-contact') },
          { icon:'ℹ️', title:'About VilleCabs', desc:'Learn more about who we are', action:() => go('driver-about') },
        ].map((item,i) => (
          <div key={i} onClick={item.action} style={{ background:'rgba(15,20,40,0.7)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'16px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:14, cursor:'pointer' }}>
            <div style={{ fontSize:26, width:44, height:44, background:'rgba(255,255,255,0.05)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{item.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>{item.title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{item.desc}</div>
            </div>
            <span style={{ color:'rgba(255,255,255,0.3)', fontSize:18 }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DRIVER DASHBOARD ──────────────────────────────────────────────────────────
function DriverDash({ go, user, setUser, setBookingId }) {
  const [rides,        setRides]        = useState([]);
  const [driverTab,    setDriverTab]    = useState('home');
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [isOnline,     setIsOnline]     = useState(false);
  const [earnings,     setEarnings]     = useState({ today:0, week:0, total:0, todayRides:0, weekRides:0, totalRides:0, history:[] });
  const [pendingRides, setPendingRides] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [activeRideId, setActiveRideId] = useState(null);
  const prevCountRef = useRef(0);

  // ── Load driver online status + earnings on mount ─────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, 'drivers', user.uid)).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setIsOnline(d.isOnline || false);
      }
    }).catch(e => console.error('Driver load error:', e));
    getDocs(query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','completed')))
      .then(snap => {
        const history = snap.docs.map(d => ({ id:d.id, ...d.data() }))
          .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
        const now        = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart  = new Date(todayStart.getTime() - 6*86400000);
        const todayRides = history.filter(r => new Date((r.createdAt?.seconds||0)*1000) >= todayStart);
        const weekRides  = history.filter(r => new Date((r.createdAt?.seconds||0)*1000) >= weekStart);
        setEarnings({
          today:      todayRides.reduce((s,r) => s + Math.round((r.fare||0)*0.85), 0),
          week:       weekRides.reduce((s,r)  => s + Math.round((r.fare||0)*0.85), 0),
          total:      history.reduce((s,r)    => s + Math.round((r.fare||0)*0.85), 0),
          todayRides: todayRides.length,
          weekRides:  weekRides.length,
          totalRides: history.length,
          history,
        });
        setRides(history);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  // ── Check if driver already has an active ride ──────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    getDocs(query(collection(db,'bookings'),
      where('driverId','==',user.uid),
      where('status','in',['active','arrived','enroute'])
    )).then(snap => {
      if (!snap.empty) setActiveRideId(snap.docs[0].id);
    }).catch(()=>{});
  }, [user]);

  // ── Listen for incoming ride requests ─────────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('status','==','searching'));
    const unsub = onSnapshot(q, snap => {
      const open = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(r => !r.driverId && !(r.declinedBy||[]).includes(user.uid))
        .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      // Play sound when new ride arrives
      if (open.length > prevCountRef.current && prevCountRef.current >= 0) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            const ctx = new AC();
            const osc = ctx.createOscillator(); const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.frequency.value = 880; osc.type = 'sine';
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.start(); osc.stop(ctx.currentTime + 0.6);
            setTimeout(() => ctx.close(), 1000);
          }
        } catch(e) {}
      }
      prevCountRef.current = open.length;
      setPendingRides(open);
    }, e => console.warn('Ride snapshot error:', e.message));
    return () => unsub();
  }, [user]);

  const goOnline = async () => {
    setIsOnline(true);
    try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:true, lastOnline:serverTimestamp() }); } catch(e) {}
  };
  const goOffline = async () => {
    setIsOnline(false);
    try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:false }); } catch(e) {}
  };
  const declineRide = async (rideId) => {
    try { await updateDoc(doc(db,'bookings',rideId), { declinedBy: arrayUnion(user.uid) }); } catch(e) {}
  };
  const acceptRide = async (rideId) => {
    try {
      const snap = await getDoc(doc(db,'bookings',rideId));
      if (!snap.exists() || snap.data().status !== 'searching' || snap.data().driverId) {
        alert('This ride was already accepted.'); return;
      }
      const dSnap = await getDoc(doc(db,'drivers',user.uid));
      const dData = dSnap.exists() ? dSnap.data() : {};
      // Optimistic: immediately hide ride from list
      setPendingRides(prev => prev.filter(r => r.id !== rideId));

      await updateDoc(doc(db,'bookings',rideId), {
        driverId:     user.uid,
        driverName:   user.name,
        vehicleMake:  dData.vehicleMake  || '',
        vehicleModel: dData.vehicleModel || '',
        vehicleColor: dData.vehicleColor || '',
        licensePlate: dData.licensePlate || '',
        status:       'active',
        acceptedAt:   serverTimestamp(),
      });
      setBookingId(rideId);
      go('driver-active');
    } catch(e) { console.error(e); }
  };
  const handleLogout = async () => {
    await goOffline();
    try { await signOut(auth); } catch(e) {}
    setUser(null);
    go('splash');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f5f6fa', overflow:'hidden' }}>

      {/* ── TOP HEADER ── */}
      <div style={{ background:'#ffffff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', flexShrink:0 }}>
        <button onClick={() => setMenuOpen(true)} style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', gap:4, padding:4 }}>
          <div style={{ width:20, height:2, background:'#1a1a2e', borderRadius:1 }}/>
          <div style={{ width:14, height:2, background:'#1a1a2e', borderRadius:1 }}/>
          <div style={{ width:20, height:2, background:'#1a1a2e', borderRadius:1 }}/>
        </button>
        <img src="/logo.png" alt="VilleCabs" style={{ height:26, objectFit:'contain', flexShrink:0 }}/>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:isOnline?'#f0fff4':'#f5f5f5', border:`1px solid ${isOnline?'#86efac':'#e5e7eb'}` }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:isOnline?'#1a9e5a':'#9ca3af' }}/>
            <span style={{ fontSize:11, fontWeight:700, color:isOnline?'#1a9e5a':'#6b7280' }}>{isOnline?'Online':'Offline'}</span>
          </div>
          {pendingRides.length > 0 && (
            <div style={{ background:'#6b21a8', color:'#fff', borderRadius:10, fontSize:10, fontWeight:700, padding:'2px 7px' }}>{pendingRides.length}</div>
          )}
        </div>
      </div>

      {/* ── SLIDE-IN MENU ── */}
      {menuOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)' }}/>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'80%', maxWidth:300, background:'#ffffff', display:'flex', flexDirection:'column', boxShadow:'4px 0 20px rgba(0,0,0,0.15)' }}>
            <div style={{ background:'linear-gradient(135deg,#6b21a8,#4c1d95)', padding:'28px 20px 20px' }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, marginBottom:10 }}>👤</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{user?.name||'Driver'}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{user?.email||''}</div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {[
                ['🏠','Home',           () => { setDriverTab('home'); setMenuOpen(false); }],
                ['🚗','Ride History',   () => { setDriverTab('rides'); setMenuOpen(false); }],
                ['💰','Earnings',       () => { go('driver-earnings'); setMenuOpen(false); }],
                ['📋','My Documents',  () => { go('driver-documents'); setMenuOpen(false); }],
                ['🔔','Notifications', () => { go('driver-notifications'); setMenuOpen(false); }],
                ['👤','My Profile',    () => { go('driver-profile'); setMenuOpen(false); }],
                ['⚙️','Settings',      () => { go('driver-settings'); setMenuOpen(false); }],
                ['❓','Help',          () => { go('driver-help'); setMenuOpen(false); }],
              ].map(([icon, label, action], i) => (
                <div key={i} onClick={action} style={{ padding:'14px 20px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', borderBottom:'1px solid #f5f5f5' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f9f5ff'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <span style={{ fontSize:18 }}>{icon}</span>
                  <span style={{ fontSize:14, color:'#1a1a2e', fontWeight:500 }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:'14px 20px', borderTop:'1px solid #eee' }}>
              <button onClick={handleLogout} style={{ width:'100%', padding:'11px', background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:10, color:'#dc2626', fontSize:14, fontWeight:600, cursor:'pointer' }}>
                🚪 Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          HOME TAB
          ══════════════════════════════════════════════════════ */}
      {driverTab === 'home' && (
        <div style={{ flex:1, overflowY:'auto', paddingBottom:80 }}>

          {/* Stats cards */}
          <div style={{ padding:'14px 14px 0' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:14, padding:'14px' }}>
                <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>Today's Earnings</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#6b21a8' }}>J${earnings.today.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{earnings.todayRides} ride{earnings.todayRides!==1?'s':''}</div>
              </div>
              <div style={{ background:'#f0fff4', border:'1px solid #86efac', borderRadius:14, padding:'14px' }}>
                <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>This Week</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#1a9e5a' }}>J${earnings.week.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{earnings.weekRides} ride{earnings.weekRides!==1?'s':''}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
              {[['All Time', `J$${earnings.total.toLocaleString()}`], ['Total Rides', earnings.totalRides], ['Rating', earnings.totalRides>0?'⭐ 5.0':'—']].map(([l,v],i) => (
                <div key={i} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'11px 10px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>{l}</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#1a1a2e' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active ride banner */}
          {activeRideId && (
            <div onClick={() => { go('driver-active'); }}
              style={{ margin:'0 14px 12px', background:'#6b21a8', borderRadius:14, padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>🚗 Active Ride In Progress</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:3 }}>Tap to return to your current ride</div>
              </div>
              <div style={{ fontSize:20, color:'#fff' }}>→</div>
            </div>
          )}

          {/* Peak hours banner */}
          {(() => { const h=new Date().getHours(),d=new Date().getDay(); return d>=1&&d<=5&&h>=17&&h<19 ? (
            <div style={{ margin:'0 14px 12px', background:'#fefce8', border:'1px solid #fde047', borderRadius:12, padding:'10px 14px', display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontSize:20 }}>⚡</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#854d0e' }}>Peak Hours Active</div>
                <div style={{ fontSize:11, color:'#92400e' }}>More riders requesting trips right now</div>
              </div>
            </div>
          ) : null; })()}

          {/* Go Online / Offline */}
          <div style={{ padding:'0 14px 14px' }}>
            {isOnline ? (
              <div>
                <div style={{ background:'#f0fff4', border:'1px solid #86efac', borderRadius:14, padding:'14px', marginBottom:10, textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#1a9e5a', marginBottom:4 }}>🟢 Waiting for ride requests</div>
                  <div style={{ fontSize:12, color:'#166534' }}>New bookings appear here instantly</div>
                </div>
                <button onClick={goOffline} style={{ width:'100%', padding:'13px', background:'#fff', border:'1.5px solid #fca5a5', borderRadius:12, color:'#dc2626', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  Go Offline
                </button>
              </div>
            ) : (
              <button onClick={goOnline} style={{ width:'100%', padding:'16px', background:'#6b21a8', border:'none', borderRadius:14, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 14px rgba(107,33,168,0.35)' }}>
                Go Online
              </button>
            )}
          </div>

          {/* ── INCOMING RIDE REQUESTS (shown when online) ── */}
          {isOnline && pendingRides.length > 0 && (
            <div style={{ padding:'0 14px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 }}>
                🔔 {pendingRides.length} Ride Request{pendingRides.length>1?'s':''}
              </div>
              {pendingRides.map((r, i) => (
                <div key={r.id||i} style={{ background:'#fff', border:'2px solid #e9d5ff', borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 4px 16px rgba(107,33,168,0.1)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:10, color:'#6b21a8', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:4 }}>🔔 New Ride Request</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'#1a1a2e' }}>{r.customerName||'Passenger'}</div>
                      <div style={{ fontSize:11, color:'#888', marginTop:2 }}>✓ Verified · 👥 {r.passengers||1} passenger{(r.passengers||1)>1?'s':''}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:20, fontWeight:800, color:'#6b21a8' }}>J${(r.fare||0).toLocaleString()}</div>
                      <div style={{ fontSize:12, color:'#1a9e5a', fontWeight:600 }}>You earn: J${Math.round((r.fare||0)*0.85).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{ background:'#f9f5ff', borderRadius:10, padding:'10px 12px', marginBottom:10 }}>
                    <div style={{ display:'flex', gap:8, marginBottom:6, alignItems:'flex-start' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'#1a9e5a', flexShrink:0, marginTop:3 }}/>
                      <div><div style={{ fontSize:10, color:'#888', marginBottom:1 }}>PICKUP</div><div style={{ fontSize:12, fontWeight:600, color:'#1a1a2e' }}>{r.pickup?.address||'—'}</div></div>
                    </div>
                    <div style={{ width:1, height:10, background:'#e9d5ff', marginLeft:3.5, marginBottom:6 }}/>
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'#6b21a8', flexShrink:0, marginTop:3 }}/>
                      <div><div style={{ fontSize:10, color:'#888', marginBottom:1 }}>DROP-OFF</div><div style={{ fontSize:12, fontWeight:600, color:'#1a1a2e' }}>{r.dropoff?.address||'—'}</div></div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                    {[['🚗',r.vehicleType||'VilleRide'],['📏',`${r.distanceKm||'?'} km`],['⏱️',`~${Math.ceil((r.distanceKm||5)/0.5)} min`],['💵','Cash']].map(([ico,val],j) => (
                      <div key={j} style={{ background:'#f3f4f6', borderRadius:8, padding:'4px 10px', fontSize:11, color:'#555' }}>{ico} {val}</div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={() => acceptRide(r.id)} style={{ flex:2, padding:'13px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(26,158,90,0.35)' }}>
                      ✓ Accept Ride
                    </button>
                    <button onClick={() => declineRide(r.id)} style={{ flex:1, padding:'13px', background:'#f5f5f5', color:'#888', border:'1px solid #e5e7eb', borderRadius:12, fontSize:14, cursor:'pointer' }}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tips */}
          <div style={{ padding:'0 14px 14px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:8 }}>Driver Tips</div>
            <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }}>
              {[['🔋','Keep phone charged'],['👤','Confirm passenger name'],['📱','Use app buttons for ride status'],['🛡️','Contact support if unsafe'],['📍','Stay near Mandeville town']].map(([icon,tip],i) => (
                <div key={i} style={{ flexShrink:0, width:160, background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'12px' }}>
                  <div style={{ fontSize:18, marginBottom:6 }}>{icon}</div>
                  <div style={{ fontSize:11, color:'#374151', lineHeight:1.5 }}>{tip}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div style={{ padding:'0 14px 14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[['💰','Earnings',() => go('driver-earnings')],['📋','Documents',() => go('driver-documents')],['🔔','Notifications',() => go('driver-notifications')],['👤','Profile',() => go('driver-profile')]].map(([icon,label,action],i) => (
                <button key={i} onClick={action} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'13px 12px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          RIDES TAB — HISTORY
          ══════════════════════════════════════════════════════ */}
      {driverTab === 'rides' && (
        <div style={{ flex:1, overflowY:'auto', paddingBottom:80, background:'#f5f6fa' }}>
          <div style={{ padding:'14px 14px 10px' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:12 }}>Ride History</div>
            {loading && <div style={{ textAlign:'center', color:'#888', padding:24 }}>Loading...</div>}
            {!loading && earnings.history.length === 0 && (
              <div style={{ textAlign:'center', padding:40 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🚕</div>
                <div style={{ fontSize:14, color:'#888' }}>No completed rides yet</div>
                <div style={{ fontSize:12, color:'#aaa', marginTop:4 }}>Go online and accept a ride to get started</div>
              </div>
            )}
            {earnings.history.map((r,i) => {
              const d   = new Date((r.createdAt?.seconds||0)*1000);
              const net = Math.round((r.fare||0)*0.85);
              return (
                <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>👤 {r.customerName||'Passenger'}</div>
                      <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{d.toLocaleDateString()} · {d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8' }}>J${net.toLocaleString()}</div>
                      <div style={{ fontSize:10, color:'#aaa' }}>Fare J${(r.fare||0).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:'#555', marginBottom:2 }}>📍 {(r.pickup?.address||'').split(',')[0]}</div>
                  <div style={{ fontSize:11, color:'#555', marginBottom:8 }}>🏁 {(r.dropoff?.address||'').split(',')[0]}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {r.distanceKm && <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>📏 {r.distanceKm} km</span>}
                    <span style={{ fontSize:10, background:'#f0fff4', color:'#1a9e5a', padding:'2px 8px', borderRadius:8 }}>💵 Cash</span>
                    <span style={{ fontSize:10, background:'#f9f5ff', color:'#6b21a8', padding:'2px 8px', borderRadius:8 }}>✅ Completed</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          EARNINGS TAB
          ══════════════════════════════════════════════════════ */}
      {driverTab === 'earnings' && (
        <div style={{ flex:1, overflowY:'auto', paddingBottom:80, background:'#f5f6fa' }}>
          <div style={{ padding:'14px 14px 0' }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:12 }}>Earnings Overview</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {[
                ['Today','J$'+earnings.today.toLocaleString(),'#6b21a8','#f9f5ff','#e9d5ff'],
                ['This Week','J$'+earnings.week.toLocaleString(),'#1a9e5a','#f0fff4','#86efac'],
                ['All Time','J$'+earnings.total.toLocaleString(),'#1a1a2e','#fff','#e5e7eb'],
                ['Total Trips',earnings.totalRides.toString(),'#b45309','#fffbeb','#fde047'],
              ].map(([l,v,c,bg,border],i) => (
                <div key={i} style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:'14px' }}>
                  <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>{l}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                </div>
              ))}
            </div>
            {/* Fee breakdown */}
            <div style={{ background:'#fff', border:'1px solid #e9d5ff', borderRadius:14, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', marginBottom:10 }}>💰 Earnings Breakdown</div>
              {[
                ['Total Fare Collected', `J$${Math.round(earnings.total/0.85).toLocaleString()}`, '#1a1a2e'],
                ['VilleCabs Fee (15%)',  `-J$${Math.round(earnings.total*0.15/0.85).toLocaleString()}`, '#dc2626'],
                ['Your Net Earnings (85%)', `J$${earnings.total.toLocaleString()}`, '#6b21a8'],
              ].map(([l,v,c],i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:i<2?'1px solid #f0f0f0':'none' }}>
                  <span style={{ fontSize:12, color:'#555' }}>{l}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:c }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#6b21a8', marginBottom:14 }}>
              💜 Drivers keep <strong>85%</strong> of every completed fare.
            </div>
            {/* Recent rides */}
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10 }}>Recent Completed Rides</div>
            {earnings.history.length === 0 ? (
              <div style={{ textAlign:'center', padding:30 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>💰</div>
                <div style={{ fontSize:13, color:'#888' }}>No completed rides yet</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:4 }}>Complete rides to see earnings here</div>
              </div>
            ) : earnings.history.slice(0,10).map((r,i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>👤 {r.customerName||'Passenger'}</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#6b21a8' }}>J${Math.round((r.fare||0)*0.85).toLocaleString()}</div>
                </div>
                <div style={{ fontSize:11, color:'#888' }}>{new Date((r.createdAt?.seconds||0)*1000).toLocaleDateString()}</div>
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  <span style={{ fontSize:10, background:'#fff0f0', color:'#dc2626', padding:'2px 8px', borderRadius:8 }}>Fee: J${Math.round((r.fare||0)*0.15).toLocaleString()}</span>
                  <span style={{ fontSize:10, background:'#f9f5ff', color:'#6b21a8', padding:'2px 8px', borderRadius:8 }}>Total: J${(r.fare||0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div style={{ background:'#ffffff', borderTop:'1px solid #eee', display:'flex', flexShrink:0, paddingBottom:'env(safe-area-inset-bottom)', boxShadow:'0 -2px 8px rgba(0,0,0,0.06)' }}>
        {[
          { icon:'🏠', label:'Home',     tab:'home'     },
          { icon:'🚗', label:'Rides',    tab:'rides'    },
          { icon:'💰', label:'Earnings', tab:'earnings' },
          { icon:'🔔', label:'Alerts',   tab:'alerts'   },
          { icon:'👤', label:'Profile',  tab:'profile'  },
        ].map(({ icon, label, tab }) => (
          <button key={tab} onClick={() => {
            if (tab==='profile')  go('driver-profile');
            else if (tab==='alerts') go('driver-notifications');
            else setDriverTab(tab);
          }}
            style={{ flex:1, padding:'10px 0', background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
            <div style={{ fontSize:18, opacity:driverTab===tab?1:0.4 }}>{icon}</div>
            <div style={{ fontSize:10, color:driverTab===tab?'#6b21a8':'#9ca3af', fontWeight:driverTab===tab?700:400 }}>{label}</div>
            {driverTab===tab && <div style={{ width:4, height:4, borderRadius:'50%', background:'#6b21a8' }}/>}
          </button>
        ))}
      </div>
    </div>
  );
}


function DriverActive({ go, user, bookingId, setBookingId }) {
  const [booking,       setBooking]       = useState(null);
  const [locationStatus,setLocationStatus]= useState('idle');
  const [arrived,       setArrived]       = useState(false);
  const [enroute,       setEnroute]       = useState(false);
  const [sosSent,       setSosSent]       = useState(false);
  const [sosHolding,    setSosHolding]    = useState(false);
  const [sosCount,      setSosCount]      = useState(5);
  const [directions, setDirections] = useState(null);
  const [completed,  setCompleted]  = useState(false);
  const watchRef = useRef(null);
  const sosRef   = useRef(null);

  // Block browser back button during active ride
  useEffect(() => {
    const handlePopState = (e) => {
      window.history.pushState(null, '', window.location.href);
      alert('You cannot leave an active ride. Please complete the ride first.');
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','active'));
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        const b = { id:snap.docs[0].id, ...snap.docs[0].data() };
        if (b.driverId === user.uid) {
          setBooking(b);
          if (b.id) setBookingId(b.id);
        }
      }
    });
    return () => unsub();
  }, [user]);

  // Fetch route: driver → pickup (before arrived), pickup → dropoff (after arrived)
  useEffect(() => {
    if (!booking?.pickup || !window.google) return;
    const fetchRoute = async () => {
      if (!arrived) {
        // Route from driver location to pickup
        const origin = booking.driverLocation
          ? { lat: booking.driverLocation.lat, lng: booking.driverLocation.lng }
          : null;
        if (!origin) return;
        const result = await getDirections(origin, { lat: booking.pickup.lat, lng: booking.pickup.lng });
        if (result) setDirections(result);
      } else {
        // Route from pickup to dropoff
        if (!booking.dropoff) return;
        const result = await getDirections(
          { lat: booking.pickup.lat, lng: booking.pickup.lng },
          { lat: booking.dropoff.lat, lng: booking.dropoff.lng }
        );
        if (result) setDirections(result);
      }
    };
    fetchRoute();
  }, [booking?.driverLocation?.lat, booking?.driverLocation?.lng, arrived, booking?.pickup?.lat]);

  useEffect(() => {
    if (!booking?.id || !user?.uid) return;
    if (!navigator.geolocation) { setLocationStatus('denied'); return; }
    // Request permission first then start watching
    navigator.geolocation.getCurrentPosition(
      () => {
        // Permission granted - start watching
        setLocationStatus('tracking');
        watchRef.current = navigator.geolocation.watchPosition(
          async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            try {
              await updateDriverLocationFn({ lat, lng, bookingId: booking.id });
            } catch(err) {
              try {
                await updateDoc(doc(db,'bookings',booking.id), { driverLocation:{ lat, lng, updatedAt:serverTimestamp() } });
                await updateDoc(doc(db,'drivers',user.uid), { currentLocation:{ lat, lng, updatedAt:serverTimestamp() } });
              } catch(e) { console.error(e); }
            }
          },
          (err) => setLocationStatus(err.code===1?'denied':'idle'),
          { enableHighAccuracy:false, maximumAge:10000, timeout:15000 }
        );
      },
      (err) => {
        console.warn('Location permission denied:', err);
        setLocationStatus('denied');
      },
      { enableHighAccuracy:false, timeout:10000 }
    );
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, [booking?.id, user?.uid]);

  useEffect(() => () => { clearInterval(sosRef.current); }, []);

  const startSOS = () => {
    if (sosSent) return;
    setSosHolding(true); setSosCount(5);
    sosRef.current = setInterval(() => {
      setSosCount(prev => {
        if (prev <= 1) { clearInterval(sosRef.current); triggerSOS(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (sosSent) return;
    setSosHolding(false); setSosCount(5);
    clearInterval(sosRef.current);
  };

  const triggerSOS = async () => {
    setSosHolding(false); setSosSent(true);
    try {
      let lat = booking?.pickup?.lat || 18.0416;
      let lng = booking?.pickup?.lng || -77.5036;
      if (navigator.geolocation) {
        await new Promise(res => navigator.geolocation.getCurrentPosition(
          p => { lat = p.coords.latitude; lng = p.coords.longitude; res(); },
          () => res(), { timeout:3000 }
        ));
      }
      await addDoc(collection(db,'sos_alerts'), {
        userId: user?.uid, userName: user?.name||'Driver', userRole:'driver',
        bookingId: booking?.id, driverName: user?.name||'--',
        customerName: booking?.customerName||'--',
        vehicleMake: booking?.vehicleMake||'', vehicleModel: booking?.vehicleModel||'',
        licensePlate: booking?.licensePlate||'',
        pickup: booking?.pickup?.address||'--', dropoff: booking?.dropoff?.address||'--',
        lat, lng, mapsLink:`https://maps.google.com/?q=${lat},${lng}`,
        status:'ACTIVE', createdAt:serverTimestamp(),
      });
    } catch(err) { console.error('SOS error:', err); }
  };

  const notifyArrived = async () => {
    if (!booking?.id) return;
    setArrived(true);
    setDirections(null); // Clear old route, new one will load via useEffect
    try {
      // Update booking with arrived status
      await updateDoc(doc(db,'bookings',booking.id), {
        driverArrived:   true,
        status:          'arrived',
        arrivedAt:       serverTimestamp(),
      });
      // Save arrival notification to Firestore for customer to pick up
      await addDoc(collection(db,'notifications'), {
        type:        'driver_arrived',
        customerId:  booking.customerId,
        bookingId:   booking.id,
        driverName:  user?.name || 'Your driver',
        message:     `${user?.name || 'Your driver'} has arrived at your pickup location!`,
        read:        false,
        createdAt:   serverTimestamp(),
      });
    } catch(err) { console.error('Arrived notification error:', err); }
  };

  const notifyEnroute = async () => {
    if (!booking?.id) return;
    setEnroute(true);
    try {
      await updateDoc(doc(db,'bookings',booking.id), {
        enrouteToDropoff: true,
        enrouteAt:        serverTimestamp(),
      });
      await addDoc(collection(db,'notifications'), {
        type:        'enroute_dropoff',
        customerId:  booking.customerId,
        bookingId:   booking.id,
        driverName:  user?.name || 'Your driver',
        message:     `${user?.name || 'Your driver'} has picked you up and is on the way to your drop-off!`,
        read:        false,
        createdAt:   serverTimestamp(),
      });
    } catch(err) { console.error('Enroute notification error:', err); }
  };

  const completeRide = async () => {
    if (!booking?.id) return;
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    await updateDoc(doc(db,'bookings',booking.id), { status:'completed', completedAt:serverTimestamp() });
    try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:false, currentLocation:null }); } catch(e) {}
    // Show completion summary before going back
    setCompleted(true);
  };



  // Computed coordinates from booking
  const driverCoords  = booking?.driverLocation?.lat
    ? { lat: booking.driverLocation.lat, lng: booking.driverLocation.lng }
    : null;
  const pickupCoords  = booking?.pickup?.lat
    ? { lat: booking.pickup.lat,  lng: booking.pickup.lng  }
    : MANCHESTER_CENTER;
  const dropoffCoords = booking?.dropoff?.lat
    ? { lat: booking.dropoff.lat, lng: booking.dropoff.lng }
    : null;
  const markers = [
    ...(pickupCoords  ? [{ position: pickupCoords,  label:'A', title:'Pickup'   }] : []),
    ...(dropoffCoords ? [{ position: dropoffCoords, label:'B', title:'Drop-off' }] : []),
  ];

  const fare = booking?.fare || 0;
  const fee  = Math.round(fare * 0.15);
  const earn = Math.round(fare * 0.85);

  // Completed screen - rendered as conditional JSX (not early return) to preserve hook count
  if (completed) return (
    <div style={{ ...s.content, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, minHeight:'100vh' }}>
      <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(26,158,90,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, marginBottom:16 }}>✅</div>
      <div style={{ fontSize:22, fontWeight:800, color:'#1a1a2e', marginBottom:6 }}>Ride Complete!</div>
      <div style={{ fontSize:14, color:'#888', marginBottom:24, textAlign:'center' }}>Great job! Your earnings have been recorded.</div>
      <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:16, padding:'20px 24px', width:'100%', maxWidth:340, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:13, color:'#888' }}>Total fare</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>J${fare.toLocaleString()}</span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontSize:13, color:'#888' }}>Platform fee (15%)</span>
          <span style={{ fontSize:13, color:'#e24b4a' }}>−J${fee.toLocaleString()}</span>
        </div>
        <div style={{ borderTop:'1px solid #e9d5ff', paddingTop:10, display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:15, fontWeight:700, color:'#1a1a2e' }}>Your earnings</span>
          <span style={{ fontSize:15, fontWeight:800, color:'#1a9e5a' }}>J${earn.toLocaleString()}</span>
        </div>
      </div>
      <button onClick={() => { go('driver-dash'); }} style={{ ...s.btnY, width:'100%', maxWidth:340, marginBottom:10 }}>Go to Dashboard</button>
      <button onClick={async () => { try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:false }); } catch(e){} go('driver-dash'); }} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:13, cursor:'pointer' }}>Go Offline</button>
    </div>
  );

  return (
    <div style={{ ...s.content }}>
      <TopBar title="Active Ride" onBack={() => { if (window.confirm('You cannot leave an active ride. Please complete the ride first.\n\nPress Cancel to stay on this screen.')) {} }}/>
      <div style={{ background:locationStatus==='tracking'?'rgba(26,158,90,0.15)':'rgba(226,75,74,0.1)', padding:'6px 16px', fontSize:11, color:locationStatus==='tracking'?'#9fe1cb':'#f09595', display:'flex', alignItems:'center', gap:6 }}>
        {locationStatus==='tracking' ? '📍 Sharing live location with passenger' :
         locationStatus==='denied' ? (
           <span>⚠️ Location denied — <span style={{textDecoration:'underline',cursor:'pointer'}} onClick={() => alert('To enable location:\n\n1. Click the 🔒 lock icon in your browser address bar\n2. Set Location to Allow\n3. Refresh the page')}>tap here to fix</span></span>
         ) : '📍 Getting your location...'}
      </div>
      <VilleMap height={typeof window!=='undefined'?Math.max(320,window.innerHeight*0.45):320} center={driverCoords||pickupCoords} zoom={14} markers={arrived?[]:markers} directions={directions} expandable={true}>
        {driverCoords && !directions && (
          <Marker position={driverCoords} title="Your location"
            icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="#e8b400" stroke="white" stroke-width="3"/><text x="18" y="24" text-anchor="middle" font-size="16">🚗</text></svg>'), scaledSize:{width:36,height:36} }}/>
        )}
        {driverCoords && directions && (
          <Marker position={driverCoords} title="You"
            icon={{ url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#e8b400" stroke="white" stroke-width="2.5"/><text x="20" y="26" text-anchor="middle" font-size="18">🚗</text></svg>'), scaledSize:{width:40,height:40} }}/>
        )}
      </VilleMap>
      <div style={{ padding:14 }}>
        {booking ? (
          <>
            <div style={{ background:'rgba(232,180,0,0.1)', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, color:YELLOW, marginBottom:8 }}>Pick up passenger</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}><div style={{ width:9, height:9, borderRadius:'50%', background:GREEN }}/><div style={{ fontSize:13, color:WHITE }}>{booking.pickup?.address}</div></div>
            </div>

            {/* Ride Progress Stepper */}
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:12, padding:'12px 14px', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              {[
                { label:'Accepted', done:true  },
                { label:'Arrived',  done:arrived },
                { label:'Started',  done:enroute },
                { label:'Done',     done:false  },
              ].map((step, i, arr) => (
                <React.Fragment key={i}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:step.done?'#1a9e5a':'rgba(255,255,255,0.12)', border:`2px solid ${step.done?'#1a9e5a':'rgba(255,255,255,0.2)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>
                      {step.done ? '✓' : ''}
                    </div>
                    <div style={{ fontSize:9, color:step.done?'#1a9e5a':'rgba(255,255,255,0.35)', fontWeight:step.done?600:400 }}>{step.label}</div>
                  </div>
                  {i < arr.length-1 && <div style={{ flex:1, height:2, background:step.done?'#1a9e5a':'rgba(255,255,255,0.1)', margin:'0 4px', marginBottom:14 }}/>}
                </React.Fragment>
              ))}
            </div>

            {/* Action buttons — only show relevant one */}
            {!arrived ? (
              <button onClick={notifyArrived}
                style={{ width:'100%', padding:'15px', background:'#1a9e5a', border:'none', borderRadius:14, color:'#ffffff', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:12, boxShadow:'0 4px 16px rgba(26,158,90,0.4)', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                📍 Arrived at Pickup
              </button>
            ) : (
              <div style={{ background:'rgba(26,158,90,0.12)', border:'1px solid rgba(26,158,90,0.35)', borderRadius:12, padding:'11px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:20 }}>✅</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#1a9e5a' }}>Customer Notified</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:1 }}>Passenger knows you have arrived</div>
                </div>
              </div>
            )}

            <div style={{ background:'rgba(15,20,40,0.65)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:500, color:WHITE, marginBottom:8 }}>Passenger</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:DARK, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:WHITE }}>{booking.customerName}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Verified rider · 👥 {booking.passengers||1} passenger{(booking.passengers||1)>1?'s':''}</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:GREEN, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📞</div>
                    <span style={{ fontSize:9, color:'rgba(255,255,255,0.45)' }}>Call</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'pointer' }} onClick={() => { setBookingId(booking?.id||bookingId); go('chat'); }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'rgba(232,180,0,0.2)', border:'1.5px solid #e8b400', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>💬</div>
                    <span style={{ fontSize:9, color:YELLOW }}>Chat</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', background:'rgba(15,20,40,0.65)', borderRadius:10, padding:12, marginBottom:14 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:YELLOW }}/>
              <div style={{ fontSize:13, color:WHITE, flex:1 }}>{booking.dropoff?.address}</div>
              <div style={{ fontSize:14, fontWeight:500, color:GREEN }}>J${booking.fare?.toLocaleString()}</div>
            </div>

            {/* SOS Button */}
            {sosSent ? (
              <div style={{ background:'rgba(226,75,74,0.2)', border:'1.5px solid rgba(226,75,74,0.5)', borderRadius:12, padding:'12px 16px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:24 }}>🚨</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'#f09595' }}>SOS Alert Sent!</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Admin notified with your location</div>
                </div>
              </div>
            ) : (
              <div
                onMouseDown={startSOS} onMouseUp={cancelSOS} onMouseLeave={cancelSOS}
                onTouchStart={startSOS} onTouchEnd={cancelSOS}
                style={{ background:sosHolding?'rgba(226,75,74,0.35)':'rgba(226,75,74,0.12)', border:`1.5px solid ${sosHolding?'#e24b4a':'rgba(226,75,74,0.4)'}`, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer', marginBottom:14, userSelect:'none' }}>
                <div style={{ fontSize:26 }}>🆘</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#f09595' }}>{sosHolding?`Sending SOS in ${sosCount}s...`:'SOS Emergency'}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{sosHolding?'Release to cancel':'Hold 5 seconds to send emergency alert'}</div>
                </div>
                {sosHolding && <div style={{ width:34, height:34, borderRadius:'50%', border:'3px solid #e24b4a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:'#f09595' }}>{sosCount}</div>}
              </div>
            )}

            {/* Start Trip / En route button */}
            {arrived && !enroute && (
              <button onClick={notifyEnroute}
                style={{ width:'100%', padding:'15px', background:'#e8b400', border:'none', borderRadius:14, color:'#0f1a35', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:12, boxShadow:'0 4px 16px rgba(232,180,0,0.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                🚗 Start Trip — On My Way to Drop-off
              </button>
            )}
            {arrived && enroute && (
              <div style={{ background:'rgba(232,180,0,0.1)', border:'1px solid rgba(232,180,0,0.3)', borderRadius:12, padding:'11px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:20 }}>🚗</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#e8b400' }}>Trip in Progress</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:1 }}>En route to drop-off — customer tracking active</div>
                </div>
              </div>
            )}
            {arrived && (
              <button onClick={completeRide} style={{ width:'100%', padding:'15px', background:'#0f1a35', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:14, color:'#e8b400', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
                ✅ Complete Ride
              </button>
            )}
          </>
        ) : (
          <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.4)' }}>Loading ride details...</div>
        )}
      </div>
    </div>
  );
}

// ── DRIVER PROFILE ───────────────────────────────────────────────────────────
function DriverProfile({ go, user }) {
  const [profile, setProfile] = useState(null);
  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');
  const set = (k,v) => setForm(p => ({...p,[k]:v}));

  useEffect(() => {
    if (!user?.uid) return;
    Promise.all([
      getDoc(doc(db,'drivers',user.uid)),
      getDocs(query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','completed'))),
    ]).then(([dSnap, rSnap]) => {
      if (dSnap.exists()) {
        const d = dSnap.data();
        setProfile(d);
        setForm({ name:d.name||'', phone:d.phone||'', email:d.email||user?.email||'', vehicleMake:d.vehicleMake||'', vehicleModel:d.vehicleModel||'', vehicleColor:d.vehicleColor||'', licensePlate:d.licensePlate||'', vehicleYear:d.vehicleYear||'' });
      }
      setRides(rSnap.docs.map(d=>d.data()));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true); setMsg('');
    try {
      await updateDoc(doc(db,'drivers',user.uid), form);
      setProfile(prev => ({...prev,...form}));
      setMsg('Profile updated!');
      setEditing(false);
    } catch(e) { setMsg('Failed to save.'); }
    setSaving(false);
  };

  if (loading) return <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', alignItems:'center', justifyContent:'center', color:'#888' }}>Loading...</div>;

  const totalEarned = rides.reduce((s,r) => s+(r.fare||0), 0);
  const isVerified  = profile?.status === 'approved';
  const isFounding  = true; // early drivers get founding badge
  const isTop       = rides.length >= 50;

  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      {/* Header */}
      <div style={{ background:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', position:'sticky', top:0, zIndex:10 }}>
        
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>My Profile</span>
        <button onClick={() => setEditing(!editing)} style={{ marginLeft:'auto', padding:'6px 14px', background:editing?'#f3f4f6':'#6b21a8', color:editing?'#555':'#fff', border:'none', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer' }}>
          {editing ? 'Cancel' : '✏️ Edit'}
        </button>
      </div>

      {/* Hero card */}
      <div style={{ background:'linear-gradient(135deg,#6b21a8,#4c1d95)', padding:'28px 20px 24px', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(255,255,255,0.15)', border:'3px solid rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, margin:'0 auto 12px' }}>
          👤
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:4 }}>{profile?.name||user?.name||'Driver'}</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginBottom:14 }}>{profile?.email||user?.email||''}</div>
        {/* Badges */}
        <div style={{ display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap' }}>
          {isVerified && <div style={{ background:'rgba(26,158,90,0.2)', border:'1px solid rgba(26,158,90,0.5)', borderRadius:20, padding:'4px 12px', fontSize:11, color:'#86efac', fontWeight:600 }}>✅ Verified Driver</div>}
          {isFounding && <div style={{ background:'rgba(232,180,0,0.2)', border:'1px solid rgba(232,180,0,0.5)', borderRadius:20, padding:'4px 12px', fontSize:11, color:'#fde047', fontWeight:600 }}>🌟 Founding Driver</div>}
          {isTop      && <div style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:20, padding:'4px 12px', fontSize:11, color:'#fff', fontWeight:600 }}>🏆 Top Driver</div>}
          {!isVerified && <div style={{ background:'rgba(255,200,0,0.15)', border:'1px solid rgba(255,200,0,0.4)', borderRadius:20, padding:'4px 12px', fontSize:11, color:'#fde047', fontWeight:600 }}>⏳ Pending Approval</div>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'#e5e7eb', marginBottom:12 }}>
        {[
          ['Rides',      rides.length],
          ['Earned',     `J$${Math.round(totalEarned*0.85).toLocaleString()}`],
          ['Rating',     rides.length>0?'⭐ 5.0':'—'],
        ].map(([l,v],i) => (
          <div key={i} style={{ background:'#fff', padding:'14px', textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#1a1a2e' }}>{v}</div>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding:'0 14px 90px' }}>
        {msg && <div style={{ background:msg.includes('!')? '#f0fff4':'#fff0f0', border:`1px solid ${msg.includes('!')?'#86efac':'#fca5a5'}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:msg.includes('!')?'#1a9e5a':'#dc2626', marginBottom:12 }}>{msg}</div>}

        {/* Personal info */}
        <div style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:12, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }}>Personal Information</div>
          {editing ? (
            <div>
              {[['Full Name','name','Your legal name'],['Phone','phone','876-XXX-XXXX'],['Email','email','your@email.com']].map(([l,k,p]) => (
                <div key={k}>
                  <label style={{ fontSize:11, color:'#888', fontWeight:600, display:'block', marginBottom:3 }}>{l}</label>
                  <input value={form[k]||''} onChange={e=>set(k,e.target.value)} placeholder={p} style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #e2e4ed', borderRadius:10, fontSize:14, marginBottom:10, boxSizing:'border-box', outline:'none', color:'#1a1a2e' }}/>
                </div>
              ))}
            </div>
          ) : (
            [['👤 Name', profile?.name||'—'],['📞 Phone', profile?.phone||'—'],['📧 Email', profile?.email||user?.email||'—']].map(([l,v],i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:i<2?'1px solid #f5f5f5':'none' }}>
                <span style={{ fontSize:12, color:'#888' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{v}</span>
              </div>
            ))
          )}
        </div>

        {/* Vehicle info */}
        <div style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:12, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }}>Vehicle Information</div>
          {editing ? (
            <div>
              {[['Make','vehicleMake','e.g. Toyota'],['Model','vehicleModel','e.g. Corolla'],['Year','vehicleYear','e.g. 2019'],['Color','vehicleColor','e.g. White'],['Licence Plate','licensePlate','e.g. 1234 AB']].map(([l,k,p]) => (
                <div key={k}>
                  <label style={{ fontSize:11, color:'#888', fontWeight:600, display:'block', marginBottom:3 }}>{l}</label>
                  <input value={form[k]||''} onChange={e=>set(k,e.target.value)} placeholder={p} style={{ width:'100%', padding:'10px 12px', border:'1.5px solid #e2e4ed', borderRadius:10, fontSize:14, marginBottom:10, boxSizing:'border-box', outline:'none', color:'#1a1a2e' }}/>
                </div>
              ))}
            </div>
          ) : (
            [
              ['🚗 Make/Model', `${profile?.vehicleMake||'—'} ${profile?.vehicleModel||''}`.trim()],
              ['📅 Year',        profile?.vehicleYear||'—'],
              ['🎨 Color',       profile?.vehicleColor||'—'],
              ['🔢 Plate',       profile?.licensePlate||'—'],
            ].map(([l,v],i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:i<3?'1px solid #f5f5f5':'none' }}>
                <span style={{ fontSize:12, color:'#888' }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{v}</span>
              </div>
            ))
          )}
        </div>

        {editing && (
          <button onClick={handleSave} disabled={saving} style={{ width:'100%', padding:'14px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10, opacity:saving?0.7:1 }}>
            {saving?'Saving...':'Save Changes'}
          </button>
        )}

        {/* Quick links */}
        {!editing && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              ['📋','Documents',    () => go('driver-documents')],
              ['💰','Earnings',     () => go('driver-earnings')],
              ['⚙️','Settings',    () => go('driver-settings')],
              ['🔔','Notifications',() => go('driver-notifications')],
            ].map(([icon,label,action],i) => (
              <button key={i} onClick={action} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'13px 12px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <span style={{ fontSize:20 }}>{icon}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


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
      // (statically imported)
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
      // (statically imported)
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

  const handleLogout = async () => {
    try {
      setMenuOpen(false);
      _manualNavDone = false;
      await signOut(auth);
      setUser(null);
      go('splash');
    } catch(e) {
      console.error('Logout error:', e);
      go('splash');
    }
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Settings" go={go} user={user}/>
      <div style={{ padding:20, maxWidth:420, margin:'0 auto' }}>

        {/* Change Password */}
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:16 }}>
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
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:16 }}>
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
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:16 }}>
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
// The key insight: both driver and customer need the SAME bookingId
// Driver gets it from their active booking query
// Customer gets it from the bookingId prop set when they booked
function ChatScreen({ go, user, bookingId }) {
  const [messages, setMessages] = useState([]);
  const [text,     setText]     = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');
  const [activeBookingId, setActiveBookingId] = useState(bookingId);
  const bottomRef = useRef(null);

  // If driver, find their active booking automatically
  useEffect(() => {
    if (user?.role !== 'driver') return;
    if (activeBookingId) return; // already have one
    const q = query(
      collection(db,'bookings'),
      where('driverId','==',user.uid),
      where('status','==','active')
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        setActiveBookingId(snap.docs[0].id);
      }
    });
    return () => unsub();
  }, [user, activeBookingId]);

  // If customer, find their most recent active booking automatically
  useEffect(() => {
    if (user?.role !== 'customer') return;
    if (activeBookingId) return; // already have one
    const q = query(
      collection(db,'bookings'),
      where('customerId','==',user.uid),
      where('status','==','active')
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        setActiveBookingId(snap.docs[0].id);
      }
    });
    return () => unsub();
  }, [user, activeBookingId]);

  // Load messages in real time — no orderBy to avoid index requirement
  useEffect(() => {
    if (!activeBookingId) return;
    const colRef = collection(db,'bookings',activeBookingId,'messages');
    const unsub  = onSnapshot(colRef, snap => {
      const msgs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      // Sort by createdAt seconds client-side
      msgs.sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
      setMessages(msgs);
      setError('');
    }, err => {
      setError('Could not load messages: ' + err.message);
    });
    return () => unsub();
  }, [activeBookingId]);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' });
  }, [messages]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (!activeBookingId) {
      setError('No active ride found. Accept a ride first.');
      return;
    }
    setSending(true);
    setText('');
    try {
      await addDoc(collection(db,'bookings',activeBookingId,'messages'), {
        text:       trimmed,
        senderId:   user.uid,
        senderName: user.name || 'User',
        senderRole: user.role || 'customer',
        createdAt:  serverTimestamp(),
      });
      setError('');
    } catch(err) {
      setError('Failed to send: ' + err.message);
      setText(trimmed);
    }
    setSending(false);
  };

  const goBack = () => user?.role === 'driver' ? go('driver-active') : go('live-ride');
  const isMe   = (msg) => msg.senderId === user?.uid;
  const fmtTime = (ts) => {
    if (!ts?.seconds) return '';
    return new Date(ts.seconds * 1000).toLocaleTimeString('en-JM', { hour:'2-digit', minute:'2-digit' });
  };

  return (
    <div style={{ ...s.content, background:'transparent', display:'flex', flexDirection:'column', height:'100vh', maxHeight:'100vh', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:DARK, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0, borderBottom:'0.5px solid rgba(255,255,255,0.1)' }}>
        <button onClick={() => go(user?.role==='driver'?'driver-active':'live-ride')}
          style={{ background:'none', border:'none', color:'#fff', fontSize:22, cursor:'pointer', padding:'0 4px', lineHeight:1, flexShrink:0 }}>←</button>
        <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
          {user?.role === 'customer' ? '🚗' : '👤'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>
            {user?.role === 'customer' ? 'Your Driver' : 'Passenger'}
          </div>
          <div style={{ fontSize:11, color: activeBookingId ? '#9fe1cb' : 'rgba(255,255,255,0.4)' }}>
            {activeBookingId ? '🟢 Connected' : '⏳ Finding ride...'}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'rgba(226,75,74,0.15)', padding:'8px 16px', fontSize:12, color:'#f09595', flexShrink:0 }}>
          ⚠️ {error}
        </div>
      )}

      {/* No active booking */}
      {!activeBookingId && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>💬</div>
          <div style={{ fontSize:16, color:WHITE, marginBottom:8 }}>
            {user?.role === 'driver' ? 'No active ride' : 'No active ride'}
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)' }}>
            {user?.role === 'driver' ? 'Accept a ride request to start chatting with your passenger' : 'Book a ride and wait for a driver to start chatting'}
          </div>
        </div>
      )}

      {/* Messages */}
      {activeBookingId && (
        <div style={{ flex:1, overflowY:'auto', padding:'14px 14px 8px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign:'center', padding:'40px 20px', color:'rgba(255,255,255,0.3)' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>💬</div>
              <div style={{ fontSize:14 }}>No messages yet</div>
              <div style={{ fontSize:12, marginTop:6 }}>Say hello!</div>
            </div>
          )}
          {messages.map((msg, i) => {
            const mine = isMe(msg);
            return (
              <div key={msg.id||i} style={{ display:'flex', justifyContent:mine?'flex-end':'flex-start', marginBottom:10, alignItems:'flex-end', gap:8 }}>
                {!mine && (
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(232,180,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                    {user?.role === 'customer' ? '🚗' : '👤'}
                  </div>
                )}
                <div style={{ maxWidth:'72%' }}>
                  <div style={{
                    background:   mine ? YELLOW : 'rgba(255,255,255,0.1)',
                    color:        mine ? DARK   : WHITE,
                    padding:      '10px 14px',
                    borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize:     14,
                    lineHeight:   1.4,
                    wordBreak:    'break-word',
                  }}>
                    {msg.text}
                  </div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:3, textAlign:mine?'right':'left' }}>
                    {fmtTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>
      )}

      {/* Input */}
      {activeBookingId && (
        <div style={{ background:DARK, padding:'10px 14px', display:'flex', gap:10, alignItems:'center', flexShrink:0, borderTop:'0.5px solid rgba(255,255,255,0.1)' }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); }}}
            placeholder="Type a message..."
            style={{ flex:1, padding:'11px 16px', background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:24, color:WHITE, fontSize:14, outline:'none' }}
          />
          <button onClick={send} disabled={!text.trim()||sending}
            style={{ width:44, height:44, borderRadius:'50%', background:text.trim()?YELLOW:'rgba(255,255,255,0.08)', border:'none', cursor:text.trim()?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
            {sending ? '⏳' : '➤'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── PAYMENTS PAGE ─────────────────────────────────────────────────────────────
function PaymentsPage({ go }) {
  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <div style={s.topBar}>
        
        <span style={s.topTitle}>Payments</span>
      </div>
      <div style={{ padding:20 }}>
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:20, marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
            <div style={{ fontSize:36 }}>💵</div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:'#1a1a2e' }}>Cash Payment</div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:'rgba(26,158,90,0.1)', borderRadius:20, padding:'3px 10px', marginTop:4 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#1a9e5a' }}/>
                <span style={{ fontSize:11, color:'#1a9e5a', fontWeight:600 }}>Active</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize:13, color:'#555770', lineHeight:1.6 }}>Pay your driver directly in cash at the end of your trip. Have the correct amount or small bills ready.</div>
        </div>
        {[
          { icon:'💳', title:'Debit / Credit Card',   sub:'Secure card payments coming soon' },
          { icon:'📱', title:'Mobile Wallet',          sub:'Digital wallet payments coming soon' },
          { icon:'🏢', title:'Business Account',       sub:'Corporate billing coming soon' },
        ].map((item, i) => (
          <div key={i} style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:'16px 18px', marginBottom:10, display:'flex', alignItems:'center', gap:14, opacity:0.6 }}>
            <div style={{ fontSize:28 }}>{item.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:'#1a1a2e' }}>{item.title}</div>
              <div style={{ fontSize:12, color:'#888aaa', marginTop:2 }}>{item.sub}</div>
            </div>
            <div style={{ fontSize:10, background:'rgba(232,180,0,0.15)', color:'#b38600', padding:'3px 8px', borderRadius:10, fontWeight:600 }}>Soon</div>
          </div>
        ))}
        <div style={{ background:'#f5f6fa', border:'1px solid #e2e4ed', borderRadius:12, padding:'12px 14px', marginTop:8, fontSize:12, color:'#666888', lineHeight:1.6 }}>
          💡 Card and digital wallet payments will be available in a future VilleCabs update.
        </div>
      </div>
    </div>
  );
}

// ── PROMOTIONS PAGE ───────────────────────────────────────────────────────────
function PromotionsPage({ go, user }) {
  const [copied, setCopied] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoMsg,   setPromoMsg]   = useState('');
  const code = user?.referralCode || 'VILLE' + (user?.uid?.slice(0,5)?.toUpperCase() || 'CABS');

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <div style={s.topBar}>
        
        <span style={s.topTitle}>Promotions</span>
      </div>
      <div style={{ padding:20 }}>
        {/* Referral card */}
        <div style={{ background:'linear-gradient(135deg, #0f1a35 0%, #1a2744 100%)', borderRadius:18, padding:20, marginBottom:16, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', right:-20, top:-20, fontSize:80, opacity:0.08 }}>🎁</div>
          <div style={{ fontSize:11, color:'#e8b400', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>Your Referral Code</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#ffffff', letterSpacing:3, marginBottom:6 }}>{code}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:16 }}>Invite friends — they get 20% off their first ride</div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={copyCode} style={{ flex:1, padding:'10px', background: copied?'#1a9e5a':'#e8b400', border:'none', borderRadius:10, color: copied?'#ffffff':'#0f1a35', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {copied ? '✓ Copied!' : '📋 Copy Code'}
            </button>
            <button onClick={() => window.open(`https://wa.me/?text=Use my VilleCabs code ${code} for 20% off your first ride! villecabs.com`,'_blank')} style={{ flex:1, padding:'10px', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, color:'#ffffff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              💬 Share via WhatsApp
            </button>
          </div>
        </div>

        {/* Active offers */}
        <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>Active Offers</div>
        {[
          { icon:'🚀', title:'Launch Offer', desc:'First ride discount for new customers', badge:'Active' },
          { icon:'👥', title:'Referral Bonus', desc:'Get J$500 credit when a friend completes their first ride', badge:'Active' },
        ].map((offer, i) => (
          <div key={i} style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:'14px 16px', marginBottom:10, display:'flex', gap:12, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:28 }}>{offer.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ fontSize:14, fontWeight:600, color:'#1a1a2e' }}>{offer.title}</div>
                <div style={{ fontSize:10, background:'rgba(26,158,90,0.12)', color:'#1a7a45', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>{offer.badge}</div>
              </div>
              <div style={{ fontSize:12, color:'#666888', marginTop:3 }}>{offer.desc}</div>
            </div>
          </div>
        ))}

        {/* Promo code entry */}
        <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', margin:'16px 0 10px' }}>Enter Promo Code</div>
        <div style={{ display:'flex', gap:10 }}>
          <input value={promoInput} onChange={e => setPromoInput(e.target.value.toUpperCase())} placeholder="e.g. VILLE20"
            style={{ flex:1, padding:'12px 14px', background:'#ffffff', border:'1.5px solid #d0d3e0', borderRadius:12, fontSize:14, color:'#1a1a2e', outline:'none' }}/>
          <button onClick={() => { if(promoInput.length>3) { setPromoMsg('✅ Code saved for your next booking!'); } else { setPromoMsg('❌ Invalid code'); } }}
            style={{ padding:'12px 18px', background:'#0f1a35', border:'none', borderRadius:12, color:'#ffffff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Apply
          </button>
        </div>
        {promoMsg && <div style={{ fontSize:12, marginTop:8, color: promoMsg.startsWith('✅') ? '#1a7a45' : '#cc2222' }}>{promoMsg}</div>}
      </div>
    </div>
  );
}

// ── SAFETY CENTRE PAGE ────────────────────────────────────────────────────────
function SafetyCentre({ go }) {
  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <div style={s.topBar}>
        
        <span style={s.topTitle}>Safety Centre</span>
      </div>
      <div style={{ padding:20 }}>
        {/* SOS card */}
        <div style={{ background:'linear-gradient(135deg, rgba(226,75,74,0.15) 0%, rgba(226,75,74,0.05) 100%)', border:'1.5px solid rgba(226,75,74,0.4)', borderRadius:16, padding:18, marginBottom:20, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:36 }}>🆘</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#cc2222', marginBottom:4 }}>SOS Emergency Button</div>
            <div style={{ fontSize:13, color:'#444', lineHeight:1.6 }}>During an active ride, hold the SOS button for 5 seconds to send an emergency alert with your live location to our admin team.</div>
          </div>
        </div>

        {[
          { title:'Before You Ride', icon:'✅', items:['Confirm driver name, photo, and licence plate','Check vehicle make and colour','Share trip with a trusted contact','Only enter the vehicle if details match'] },
          { title:'During Your Ride', icon:'🚗', items:['Keep your phone charged','Wear your seatbelt','Use SOS only in genuine emergencies','Contact support through the app'] },
          { title:'After Your Ride', icon:'⭐', items:['Rate your driver to help others','Report any safety concerns','Contact support for lost items','Thank your driver for a safe trip'] },
        ].map((section, i) => (
          <div key={i} style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>{section.icon} {section.title}</div>
            {section.items.map((item, j) => (
              <div key={j} style={{ display:'flex', gap:10, marginBottom:8, alignItems:'flex-start' }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#e8b400', flexShrink:0, marginTop:5 }}/>
                <div style={{ fontSize:13, color:'#555770', lineHeight:1.5 }}>{item}</div>
              </div>
            ))}
          </div>
        ))}

        <div style={{ background:'#0f1a35', borderRadius:14, padding:16, marginTop:4 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e8b400', marginBottom:6 }}>🛡️ Our Safety Promise</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.6 }}>Every VilleCabs driver is verified before approval. All rides are GPS tracked. Our admin team monitors active SOS alerts 24/7.</div>
        </div>
      </div>
    </div>
  );
}


// ── BUSINESS PAGE ──────────────────────────────────────────────────────────────
function BusinessPage({ go, user }) {
  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <TopBar title="Business" go={go} user={user}/>
      <div style={{ padding:'40px 24px', textAlign:'center', maxWidth:480, margin:'0 auto' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🤝</div>
        <h2 style={{ fontSize:22, fontWeight:700, color:'#1a1a2e', marginBottom:8 }}>VilleCabs Business</h2>
        <p style={{ fontSize:14, color:'#555770', lineHeight:1.7, marginBottom:24 }}>
          Partner with VilleCabs to connect your business with more customers in Manchester, Jamaica. Restaurants, hotels, clubs, supermarkets and more.
        </p>
        <div style={{ background:'#0f1a35', borderRadius:16, padding:20, marginBottom:16 }}>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:10 }}>Interested in partnering with VilleCabs?</div>
          <button onClick={() => window.open('mailto:admin@villecabs.com?subject=VilleCabs Business Partnership','_blank')}
            style={{ padding:'12px 24px', background:'#e8b400', border:'none', borderRadius:24, color:'#0f1a35', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            Contact Us →
          </button>
        </div>
        <p style={{ fontSize:12, color:'#888aaa' }}>📧 admin@villecabs.com · 📞 +1876-515-8113</p>
      </div>
    </div>
  );
}

// ── FEATURED PAGE ──────────────────────────────────────────────────────────────
function FeaturedPage({ go, user }) {
  const partners = [
    { icon:'🍔', name:'Juici Patties',   cat:'Restaurant'  },
    { icon:'📚', name:'Bargain Books',   cat:'Bookstore'   },
    { icon:'🏨', name:'Golf View Hotel', cat:'Hotel'       },
    { icon:'🍽️', name:'Restaurants',    cat:'Food'        },
    { icon:'🎉', name:'Clubs & Lounges', cat:'Nightlife'   },
    { icon:'🛒', name:'Supermarkets',   cat:'Grocery'     },
  ];
  return (
    <div style={{ ...s.content, background:'#f5f6fa' }}>
      <TopBar title="Featured" go={go} user={user}/>
      <div style={{ padding:20 }}>
        <p style={{ fontSize:13, color:'#666888', marginBottom:16 }}>Local businesses connected with VilleCabs in Mandeville & Manchester.</p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          {partners.map((p, i) => (
            <div key={i} style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:'16px 14px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>{p.icon}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:3 }}>{p.name}</div>
              <div style={{ fontSize:10, color:'#888aaa', marginBottom:8 }}>{p.cat}</div>
              <div style={{ fontSize:9, background:'rgba(232,180,0,0.15)', color:'#b38600', padding:'2px 8px', borderRadius:10, fontWeight:600, display:'inline-block' }}>Coming Soon</div>
            </div>
          ))}
        </div>
        <div style={{ background:'#0f1a35', borderRadius:14, padding:16, textAlign:'center' }}>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginBottom:10 }}>Want to be featured?</div>
          <button onClick={() => window.open('mailto:admin@villecabs.com?subject=VilleCabs Featured Partner','_blank')}
            style={{ padding:'10px 20px', background:'#e8b400', border:'none', borderRadius:20, color:'#0f1a35', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Become a Partner
          </button>
        </div>
      </div>
    </div>
  );
}


// ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────
const ADMIN_EMAILS = ['daviskeneile@gmail.com', 'admin@villecabs.com'];

function AdminDash({ go, user }) {
  const ADMIN_EMAILS = ['daviskeneile@gmail.com', 'admin@villecabs.com'];
  const [tab,         setTab]        = useState('overview');
  const [stats,       setStats]      = useState({ customers:0, drivers:0, pendingDrivers:0, activeDrivers:0, rides:0, completed:0, cancelled:0, totalFare:0, partnerRequests:0 });
  const [drivers,     setDrivers]    = useState([]);
  const [customers,   setCustomers]  = useState([]);
  const [rides,       setRides]      = useState([]);
  const [partners,    setPartners]   = useState([]);
  const [messages,    setMessages]   = useState([]);
  const [alerts,      setAlerts]     = useState([]);
  const [unfulfilled, setUnfulfilled]= useState([]);
  const [promos,      setPromos]     = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [rideFilter,  setRideFilter] = useState('all');
  const [driverFilter,setDriverFilter]=useState('all');
  const [detail,      setDetail]     = useState(null);

  // Access control
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return (
      <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
        <div style={{ fontSize:18, fontWeight:700, color:'#1a1a2e', marginBottom:8 }}>Admin Access Only</div>
        <div style={{ fontSize:13, color:'#888', marginBottom:20 }}>You do not have permission to view this page.</div>
        <button onClick={() => go('splash')} style={{ padding:'12px 24px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer' }}>Go Home</button>
      </div>
    );
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [cSnap, dSnap, rSnap, pSnap, mSnap, aSnap, uSnap, promoSnap] = await Promise.all([
          getDocs(collection(db,'customers')),
          getDocs(collection(db,'drivers')),
          getDocs(collection(db,'bookings')),
          getDocs(collection(db,'partnerRequests')),
          getDocs(collection(db,'contactMessages')),
          getDocs(collection(db,'sosAlerts')),
          getDocs(query(collection(db,'unfulfilled_ride_requests'), orderBy('created_at','desc'))),
          getDocs(collection(db,'promo_codes')),
        ]);
        const cd = cSnap.docs.map(d=>({id:d.id,...d.data()}));
        const dd = dSnap.docs.map(d=>({id:d.id,...d.data()}));
        const rd = rSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
        const pd = pSnap.docs.map(d=>({id:d.id,...d.data()}));
        const md = mSnap.docs.map(d=>({id:d.id,...d.data()}));
        const ad2= aSnap.docs.map(d=>({id:d.id,...d.data()}));
        const ud = uSnap.docs.map(d=>({id:d.id,...d.data()}));
        const prd= promoSnap.docs.map(d=>({id:d.id,...d.data()}));
        const completed = rd.filter(r=>r.status==='completed');
        const totalFare = completed.reduce((s,r)=>s+(r.fare||0),0);
        setCustomers(cd); setDrivers(dd); setRides(rd); setPartners(pd);
        setMessages(md); setAlerts(ad2); setUnfulfilled(ud); setPromos(prd);
        setStats({ customers:cd.length, drivers:dd.length, pendingDrivers:dd.filter(d=>d.status==='pending').length, activeDrivers:dd.filter(d=>d.isOnline).length, rides:rd.length, completed:completed.length, cancelled:rd.filter(r=>r.status==='cancelled').length, totalFare, partnerRequests:pd.filter(p=>p.status==='new').length });
      } catch(e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const updateDriver  = async (id, data) => { await updateDoc(doc(db,'drivers',id), data); setDrivers(p=>p.map(d=>d.id===id?{...d,...data}:d)); };
  const updatePartner = async (id, data) => { await updateDoc(doc(db,'partnerRequests',id), data); setPartners(p=>p.map(d=>d.id===id?{...d,...data}:d)); };
  const updateMessage = async (id, data) => { await updateDoc(doc(db,'contactMessages',id), data); setMessages(p=>p.map(d=>d.id===id?{...d,...data}:d)); };
  const updateAlert   = async (id, data) => { await updateDoc(doc(db,'sosAlerts',id), data); setAlerts(p=>p.map(d=>d.id===id?{...d,...data}:d)); };

  const vcRevenue  = Math.round(stats.totalFare * 0.15);
  const driverPayout = Math.round(stats.totalFare * 0.85);
  const avgFare    = stats.completed > 0 ? Math.round(stats.totalFare / stats.completed) : 0;

  // Filtered rides
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart.getTime() - 7*86400000);
  const filteredRides = rides.filter(r => {
    const d = new Date((r.createdAt?.seconds||0)*1000);
    if (rideFilter==='today')     return d >= todayStart;
    if (rideFilter==='week')      return d >= weekStart;
    if (rideFilter==='completed') return r.status==='completed';
    if (rideFilter==='cancelled') return r.status==='cancelled';
    if (rideFilter==='active')    return r.status==='active'||r.status==='searching';
    return true;
  });

  const filteredDrivers = drivers.filter(d => {
    if (driverFilter==='pending')  return d.status==='pending';
    if (driverFilter==='approved') return d.status==='approved';
    if (driverFilter==='suspended')return d.status==='suspended';
    return true;
  });

  const tabs = [
    ['overview','📊 Overview'], ['drivers','🚗 Drivers'], ['customers','👥 Customers'],
    ['rides','🛣️ Rides'], ['partners','🤝 Partners'], ['revenue','💰 Revenue'],
    ['promos','🎟️ Promos'], ['messages','📩 Messages'], ['alerts','🆘 Alerts'],
    ['unfulfilled','📍 No Driver'],
  ];

  const StatusBadge = ({ status }) => {
    const cfg = { pending:{bg:'#fefce8',color:'#854d0e'}, approved:{bg:'#f0fff4',color:'#1a9e5a'}, active:{bg:'#f0fff4',color:'#1a9e5a'}, rejected:{bg:'#fff0f0',color:'#dc2626'}, suspended:{bg:'#fff0f0',color:'#dc2626'}, new:{bg:'#f5f0ff',color:'#6b21a8'}, completed:{bg:'#f0fff4',color:'#1a9e5a'}, cancelled:{bg:'#fff0f0',color:'#dc2626'}, searching:{bg:'#fefce8',color:'#854d0e'}, contacted:{bg:'#fefce8',color:'#854d0e'}, featured:{bg:'#f5f0ff',color:'#6b21a8'}, online:{bg:'#f0fff4',color:'#1a9e5a'}, offline:{bg:'#f5f5f5',color:'#888'} };
    const c = cfg[status?.toLowerCase()] || {bg:'#f5f5f5',color:'#888'};
    return <span style={{ fontSize:10, background:c.bg, color:c.color, padding:'2px 8px', borderRadius:8, fontWeight:600, textTransform:'capitalize' }}>{status||'unknown'}</span>;
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <img src="/logo.png" style={{ height:40, objectFit:'contain' }} alt="VilleCabs"/>
      <div style={{ fontSize:14, color:'#888' }}>Loading admin dashboard...</div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'#f5f6fa' }}>

      {/* ── TOP BAR ── */}
      <div style={{ background:'#ffffff', borderBottom:'1px solid #e5e7eb', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:50, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <img src="/logo.png" style={{ height:28, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:13, fontWeight:700, color:'#6b21a8', marginLeft:4 }}>Admin Dashboard</span>
        <button onClick={() => go('splash')} style={{ marginLeft:'auto', padding:'6px 12px', background:'#f5f0ff', border:'1px solid #e9d5ff', borderRadius:10, color:'#6b21a8', fontSize:11, fontWeight:600, cursor:'pointer' }}>← Exit Admin</button>
      </div>

      {/* ── TAB NAV ── */}
      <div style={{ display:'flex', gap:4, padding:'10px 14px', background:'#fff', borderBottom:'1px solid #e5e7eb', overflowX:'auto', scrollbarWidth:'none' }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ flexShrink:0, padding:'6px 12px', borderRadius:20, border:'none', background:tab===key?'#6b21a8':'#f3f4f6', color:tab===key?'#fff':'#555', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            {label}{key==='drivers'&&stats.pendingDrivers>0?` (${stats.pendingDrivers})`:''}{key==='messages'&&messages.filter(m=>m.status==='new').length>0?` (${messages.filter(m=>m.status==='new').length})`:''}{key==='alerts'&&alerts.filter(a=>a.status==='new').length>0?` (${alerts.filter(a=>a.status==='new').length})`:''}{key==='unfulfilled'&&unfulfilled.length>0?` (${unfulfilled.length})`:''}{key==='partners'&&stats.partnerRequests>0?` (${stats.partnerRequests})`:''}</button>
        ))}
      </div>

      <div style={{ padding:'14px 14px 40px', maxWidth:1000, margin:'0 auto' }}>

        {/* ══ OVERVIEW ══ */}
        {tab === 'overview' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Overview</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, marginBottom:16 }}>
              {[
                ['Total Customers',    stats.customers,       '#6b21a8','#f9f5ff','#e9d5ff'],
                ['Total Drivers',      stats.drivers,         '#1a1a2e','#fff','#e5e7eb'],
                ['Pending Drivers',    stats.pendingDrivers,  '#b45309','#fffbeb','#fde047'],
                ['Active Drivers',     stats.activeDrivers,   '#1a9e5a','#f0fff4','#86efac'],
                ['Total Rides',        stats.rides,           '#1a1a2e','#fff','#e5e7eb'],
                ['Completed Rides',    stats.completed,       '#1a9e5a','#f0fff4','#86efac'],
                ['Cancelled Rides',    stats.cancelled,       '#dc2626','#fff0f0','#fca5a5'],
                ['Total Fare (J$)',    stats.totalFare.toLocaleString(), '#6b21a8','#f9f5ff','#e9d5ff'],
                ['VilleCabs Revenue',  'J$'+vcRevenue.toLocaleString(), '#1a9e5a','#f0fff4','#86efac'],
                ['Partner Requests',   stats.partnerRequests, '#b45309','#fffbeb','#fde047'],
              ].map(([label, value, color, bg, border], i) => (
                <div key={i} style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:'14px 12px' }}>
                  <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{label}</div>
                  <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
                </div>
              ))}
            </div>
            {/* Recent activity */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ background:'#fff', borderRadius:14, padding:14, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', marginBottom:10 }}>Recent Rides</div>
                {rides.slice(0,5).map((r,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:i<4?'1px solid #f5f5f5':'none', fontSize:12 }}>
                    <span style={{ color:'#1a1a2e' }}>{r.customerName||'Customer'}</span>
                    <StatusBadge status={r.status}/>
                  </div>
                ))}
              </div>
              <div style={{ background:'#fff', borderRadius:14, padding:14, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', marginBottom:10 }}>Pending Drivers</div>
                {drivers.filter(d=>d.status==='pending').slice(0,5).map((d,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:i<4?'1px solid #f5f5f5':'none', fontSize:12 }}>
                    <span style={{ color:'#1a1a2e' }}>{d.name||'Driver'}</span>
                    <button onClick={() => { setTab('drivers'); setDriverFilter('pending'); }} style={{ fontSize:10, color:'#6b21a8', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Review →</button>
                  </div>
                ))}
                {drivers.filter(d=>d.status==='pending').length===0 && <div style={{ fontSize:12, color:'#888' }}>No pending applications</div>}
              </div>
            </div>
          </div>
        )}

        {/* ══ DRIVERS ══ */}
        {tab === 'drivers' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:12 }}>Driver Management</div>
            <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
              {[['all','All'],['pending','Pending'],['approved','Approved'],['suspended','Suspended']].map(([k,l]) => (
                <button key={k} onClick={() => setDriverFilter(k)} style={{ padding:'6px 14px', borderRadius:20, border:'none', background:driverFilter===k?'#6b21a8':'#f3f4f6', color:driverFilter===k?'#fff':'#555', fontSize:11, fontWeight:600, cursor:'pointer' }}>{l}</button>
              ))}
            </div>
            {filteredDrivers.map((d, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    {d.profilePhotoUrl ? <img src={d.profilePhotoUrl} style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover' }} alt=""/> : <div style={{ width:40, height:40, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>👤</div>}
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e' }}>{d.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#888' }}>{d.phone||''} · {d.email||''}</div>
                    </div>
                  </div>
                  <StatusBadge status={d.isOnline?'online':d.status}/>
                </div>
                <div style={{ fontSize:12, color:'#555', marginBottom:8 }}>
                  🚗 {d.vehicleMake||'—'} {d.vehicleModel||''} · {d.vehicleColor||''} · {d.licensePlate||'—'}
                </div>
                {d.vehiclePhotoUrl && <img src={d.vehiclePhotoUrl} style={{ width:'100%', maxHeight:100, objectFit:'cover', borderRadius:8, marginBottom:8 }} alt="Vehicle"/>}
                {/* Documents */}
                {d.docs && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                    {Object.entries(d.docs).map(([key, url]) => url && (
                      <a key={key} href={url} target="_blank" rel="noreferrer" style={{ fontSize:10, background:'#f5f0ff', color:'#6b21a8', padding:'2px 8px', borderRadius:8, textDecoration:'none', fontWeight:600 }}>
                        📄 {key}
                      </a>
                    ))}
                  </div>
                )}
                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {d.status==='pending' && <>
                    <button onClick={() => updateDriver(d.id, { status:'approved' })} style={{ padding:'6px 12px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>✅ Approve</button>
                    <button onClick={() => updateDriver(d.id, { status:'rejected' })} style={{ padding:'6px 12px', background:'#dc2626', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>❌ Reject</button>
                    <button onClick={() => updateDriver(d.id, { status:'pending', docsRequested:true })} style={{ padding:'6px 12px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>📋 Request Docs</button>
                  </>}
                  {d.status==='approved' && <button onClick={() => updateDriver(d.id, { status:'suspended' })} style={{ padding:'6px 12px', background:'#dc2626', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>🚫 Suspend</button>}
                  {d.status==='suspended' && <button onClick={() => updateDriver(d.id, { status:'approved' })} style={{ padding:'6px 12px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>✅ Reinstate</button>}
                </div>
              </div>
            ))}
            {filteredDrivers.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No drivers in this category</div>}
          </div>
        )}

        {/* ══ CUSTOMERS ══ */}
        {tab === 'customers' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Customer Management</div>
            {customers.map((c, i) => {
              const cRides = rides.filter(r => r.customerId===c.id);
              const spent  = cRides.filter(r=>r.status==='completed').reduce((s,r)=>s+(r.fare||0),0);
              return (
                <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e' }}>{c.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#888' }}>{c.email||''} · {c.phone||''}</div>
                    </div>
                    <StatusBadge status={c.status||'active'}/>
                  </div>
                  <div style={{ display:'flex', gap:10, fontSize:11, color:'#555' }}>
                    <span>🚕 {cRides.length} rides</span>
                    <span>💰 J${spent.toLocaleString()} spent</span>
                    <span>📅 {c.createdAt ? new Date((c.createdAt?.seconds||0)*1000).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              );
            })}
            {customers.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No customers yet</div>}
          </div>
        )}

        {/* ══ RIDES ══ */}
        {tab === 'rides' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:12 }}>Ride Management</div>
            <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
              {[['all','All'],['today','Today'],['week','This Week'],['active','Active'],['completed','Completed'],['cancelled','Cancelled']].map(([k,l]) => (
                <button key={k} onClick={() => setRideFilter(k)} style={{ padding:'6px 14px', borderRadius:20, border:'none', background:rideFilter===k?'#6b21a8':'#f3f4f6', color:rideFilter===k?'#fff':'#555', fontSize:11, fontWeight:600, cursor:'pointer' }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>{filteredRides.length} rides</div>
            {filteredRides.slice(0,50).map((r, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>👤 {r.customerName||'Customer'} → 🚗 {r.driverName||'Searching...'}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{new Date((r.createdAt?.seconds||0)*1000).toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#6b21a8' }}>J${(r.fare||0).toLocaleString()}</div>
                    <StatusBadge status={r.status}/>
                  </div>
                </div>
                <div style={{ fontSize:11, color:'#555', marginBottom:2 }}>📍 {r.pickup?.address||'—'}</div>
                <div style={{ fontSize:11, color:'#555', marginBottom:6 }}>🏁 {r.dropoff?.address||'—'}</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {r.distanceKm && <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>📏 {r.distanceKm} km</span>}
                  <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>💵 {r.paymentMethod||'Cash'}</span>
                  <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>🚗 {r.vehicleType||'—'}</span>
                </div>
              </div>
            ))}
            {filteredRides.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No rides found</div>}
          </div>
        )}

        {/* ══ PARTNERS ══ */}
        {tab === 'partners' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Partner Management</div>
            {partners.map((p, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#1a1a2e' }}>{p.bizName||'—'}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{p.bizType||''} · {p.contact||''}</div>
                  </div>
                  <StatusBadge status={p.status||'new'}/>
                </div>
                <div style={{ fontSize:12, color:'#555', marginBottom:6 }}>📞 {p.phone||'—'} · 📧 {p.email||'—'}</div>
                <div style={{ fontSize:12, color:'#555', marginBottom:6 }}>📍 {p.address||'—'}</div>
                {p.message && <div style={{ fontSize:12, color:'#555', background:'#f9f9f9', borderRadius:8, padding:'8px 10px', marginBottom:10 }}>{p.message}</div>}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {(!p.status||p.status==='new') && <button onClick={() => updatePartner(p.id,{status:'contacted'})} style={{ padding:'6px 12px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>📞 Mark Contacted</button>}
                  {p.status!=='approved' && <button onClick={() => updatePartner(p.id,{status:'approved'})} style={{ padding:'6px 12px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>✅ Approve</button>}
                  {p.status!=='featured' && <button onClick={() => updatePartner(p.id,{status:'featured'})} style={{ padding:'6px 12px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>⭐ Feature</button>}
                  {p.status!=='rejected' && <button onClick={() => updatePartner(p.id,{status:'rejected'})} style={{ padding:'6px 12px', background:'#dc2626', color:'#fff', border:'none', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer' }}>❌ Reject</button>}
                </div>
              </div>
            ))}
            {partners.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No partner requests yet</div>}
          </div>
        )}

        {/* ══ REVENUE ══ */}
        {tab === 'revenue' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Revenue Dashboard</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                ['Total Fare Value',      'J$'+stats.totalFare.toLocaleString(), '#1a1a2e','#fff','#e5e7eb'],
                ['VilleCabs Revenue (15%)','J$'+vcRevenue.toLocaleString(),       '#1a9e5a','#f0fff4','#86efac'],
                ['Driver Payout (85%)',   'J$'+driverPayout.toLocaleString(),     '#6b21a8','#f9f5ff','#e9d5ff'],
                ['Average Fare',          'J$'+avgFare.toLocaleString(),           '#b45309','#fffbeb','#fde047'],
                ['Completed Rides',       stats.completed,                          '#1a1a2e','#fff','#e5e7eb'],
                ['Cancelled Rides',       stats.cancelled,                          '#dc2626','#fff0f0','#fca5a5'],
              ].map(([l,v,c,bg,border],i) => (
                <div key={i} style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:'14px 12px' }}>
                  <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{l}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:c }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:12, padding:'12px 14px', fontSize:12, color:'#6b21a8' }}>
              💰 Formula: VilleCabs Revenue = Total Fare × 15% · Driver Payout = Total Fare × 85%
            </div>
            {/* Revenue by ride type */}
            <div style={{ background:'#fff', borderRadius:14, padding:14, marginTop:12, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#6b21a8', marginBottom:10 }}>Revenue by Ride Type</div>
              {['VilleRide','VilleXL','VilleMoto'].map((type, i) => {
                const typeRides = rides.filter(r=>r.vehicleType===type&&r.status==='completed');
                const typeFare  = typeRides.reduce((s,r)=>s+(r.fare||0),0);
                return (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:i<2?'1px solid #f5f5f5':'none' }}>
                    <span style={{ fontSize:13, color:'#1a1a2e' }}>{type}</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#6b21a8' }}>J${typeFare.toLocaleString()}</span>
                      <span style={{ fontSize:11, color:'#888', marginLeft:8 }}>({typeRides.length} rides)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ PROMOS ══ */}
        {tab === 'promos' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Promotions</div>
            {promos.map((p, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#6b21a8' }}>{p.code||'—'}</div>
                  <StatusBadge status={p.active?'active':'inactive'}/>
                </div>
                <div style={{ fontSize:12, color:'#555' }}>Discount: J${(p.discount||0).toLocaleString()} · Used: {(p.usedBy||[]).length} times</div>
                {p.maxUses && <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Max uses: {p.maxUses}</div>}
              </div>
            ))}
            {promos.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No promo codes yet</div>}
          </div>
        )}

        {/* ══ MESSAGES ══ */}
        {tab === 'messages' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Support Messages</div>
            {messages.map((m, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', borderLeft:`3px solid ${m.status==='new'?'#6b21a8':m.status==='resolved'?'#1a9e5a':'#f59e0b'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{m.name||'—'}</div>
                  <StatusBadge status={m.status||'new'}/>
                </div>
                <div style={{ fontSize:11, color:'#888', marginBottom:6 }}>{m.email||''} · {m.createdAt ? new Date((m.createdAt?.seconds||0)*1000).toLocaleDateString() : '—'}</div>
                {m.subject && <div style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>{m.subject}</div>}
                <div style={{ fontSize:12, color:'#555', marginBottom:10, lineHeight:1.5 }}>{m.message||'—'}</div>
                <div style={{ display:'flex', gap:6 }}>
                  {m.status!=='in-progress' && <button onClick={() => updateMessage(m.id,{status:'in-progress'})} style={{ padding:'5px 10px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:8, fontSize:10, fontWeight:600, cursor:'pointer' }}>In Progress</button>}
                  {m.status!=='resolved' && <button onClick={() => updateMessage(m.id,{status:'resolved'})} style={{ padding:'5px 10px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:8, fontSize:10, fontWeight:600, cursor:'pointer' }}>✅ Resolved</button>}
                  {m.email && <a href={'mailto:'+m.email} style={{ padding:'5px 10px', background:'#f5f0ff', color:'#6b21a8', border:'none', borderRadius:8, fontSize:10, fontWeight:600, textDecoration:'none' }}>📧 Reply</a>}
                </div>
              </div>
            ))}
            {messages.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No messages yet</div>}
          </div>
        )}

        {/* ══ SAFETY ALERTS ══ */}
        {tab === 'alerts' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>Safety Alerts</div>
            {alerts.map((a, i) => (
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', borderLeft:`3px solid ${a.status==='new'?'#dc2626':a.status==='resolved'?'#1a9e5a':'#f59e0b'}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#dc2626' }}>🆘 SOS Alert</div>
                  <StatusBadge status={a.status||'new'}/>
                </div>
                <div style={{ fontSize:12, color:'#555', marginBottom:4 }}>👤 Customer: {a.customerName||'—'} · 🚗 Driver: {a.driverName||'—'}</div>
                <div style={{ fontSize:12, color:'#555', marginBottom:4 }}>🔑 Ride ID: {a.rideId||'—'}</div>
                {a.location && <div style={{ fontSize:12, color:'#555', marginBottom:4 }}>📍 {a.location}</div>}
                <div style={{ fontSize:11, color:'#888', marginBottom:10 }}>{a.createdAt ? new Date((a.createdAt?.seconds||0)*1000).toLocaleString() : '—'}</div>
                <div style={{ display:'flex', gap:6 }}>
                  {a.status!=='responding' && <button onClick={() => updateAlert(a.id,{status:'responding'})} style={{ padding:'5px 10px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:8, fontSize:10, fontWeight:600, cursor:'pointer' }}>Responding</button>}
                  {a.status!=='resolved' && <button onClick={() => updateAlert(a.id,{status:'resolved'})} style={{ padding:'5px 10px', background:'#1a9e5a', color:'#fff', border:'none', borderRadius:8, fontSize:10, fontWeight:600, cursor:'pointer' }}>✅ Resolved</button>}
                </div>
              </div>
            ))}
            {alerts.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}><div style={{ fontSize:32, marginBottom:10 }}>✅</div>No safety alerts</div>}
          </div>
        )}

        {/* ══ UNFULFILLED REQUESTS ══ */}
        {tab === 'unfulfilled' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>No Driver Requests</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
              {(() => {
                const todayCount = unfulfilled.filter(r => new Date((r.created_at?.seconds||0)*1000) >= todayStart).length;
                const weekCount  = unfulfilled.filter(r => new Date((r.created_at?.seconds||0)*1000) >= weekStart).length;
                const hours      = unfulfilled.map(r=>r.hour_of_day).filter(h=>h!==undefined);
                const hCounts    = hours.reduce((a,h)=>{a[h]=(a[h]||0)+1;return a;},{});
                const busiest    = Object.entries(hCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
                return [
                  ['Today',unfulfilled.filter(r=>new Date((r.created_at?.seconds||0)*1000)>=todayStart).length,'#6b21a8','#f9f5ff','#e9d5ff'],
                  ['This Week',weekCount,'#1a9e5a','#f0fff4','#86efac'],
                  ['Total',unfulfilled.length,'#1a1a2e','#fff','#e5e7eb'],
                  ['Busiest Hour',busiest!==undefined?`${busiest}:00`:'—','#b45309','#fffbeb','#fde047'],
                ].map(([l,v,c,bg,border],i) => (
                  <div key={i} style={{ background:bg, border:`1px solid ${border}`, borderRadius:12, padding:'12px 14px' }}>
                    <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
                  </div>
                ));
              })()}
            </div>
            {unfulfilled.map((r,i) => {
              const d = new Date((r.created_at?.seconds||0)*1000);
              return (
                <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', borderLeft:'3px solid #e9d5ff' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>👤 {r.customer_name||'Customer'}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#6b21a8' }}>J${(r.estimated_fare||0).toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize:11, color:'#555', marginBottom:2 }}>📍 {(r.pickup_address||'').split(',')[0]}</div>
                  <div style={{ fontSize:11, color:'#555', marginBottom:8 }}>🏁 {(r.dropoff_address||'').split(',')[0]}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>🚗 {r.ride_type}</span>
                    <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>📏 {r.estimated_distance_km} km</span>
                    <span style={{ fontSize:10, background:'#fefce8', color:'#854d0e', padding:'2px 8px', borderRadius:8 }}>⏰ {r.day_of_week} {r.hour_of_day}:00</span>
                  </div>
                  <div style={{ fontSize:10, color:'#aaa', marginTop:6 }}>{d.toLocaleString()}</div>
                </div>
              );
            })}
            {unfulfilled.length===0 && <div style={{ textAlign:'center', padding:40, color:'#888' }}>No unfulfilled requests yet</div>}
          </div>
        )}

      </div>
    </div>
  );
}


function LoadingScreen() {
  return (
    <div style={{ minHeight:'100vh', background:'#ffffff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <img src="/logo.png" alt="VilleCabs" style={{ height:48, objectFit:'contain' }}/>
      <div style={{ width:36, height:36, border:'3px solid #e9d5ff', borderTop:'3px solid #6b21a8', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(e) { return { hasError:true, error:e }; }
  componentDidCatch(e, info) { console.error('App crash:', e, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight:'100vh', background:'#f5f6fa', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
          <div style={{ fontSize:18, fontWeight:700, color:'#1a1a2e', marginBottom:8 }}>Something went wrong</div>
          <div style={{ fontSize:13, color:'#888', marginBottom:20 }}>{this.state.error?.message || 'An unexpected error occurred'}</div>
          <button onClick={() => window.location.reload()} style={{ padding:'12px 24px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}


function PartnerWithUs({ go, user }) {
  const [form, setForm] = useState({ bizName:'', bizType:'', contact:'', phone:'', email:'', address:'', website:'', message:'' });
  const [sent,   setSent]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k,v) => setForm(p => ({...p,[k]:v}));
  const submit = async () => {
    if (!form.bizName||!form.email||!form.phone) { setError('Please fill in all required fields.'); return; }
    setSaving(true); setError('');
    try { await addDoc(collection(db,'partnerRequests'), {...form, status:'new', createdAt:serverTimestamp()}); setSent(true); }
    catch(e) { setError('Failed to submit. Please try again.'); }
    setSaving(false);
  };
  return (
    <div style={{ background:'#fff', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'8px 14px', display:'flex', alignItems:'center', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10 }}>
        <img src="/logo.png" style={{ height:30, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:8 }}>Partner With VilleCabs</span>
      </div>
      <div style={{ background:'linear-gradient(135deg,#6b21a8,#4c1d95)', padding:'28px 20px', textAlign:'center' }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:'0 0 8px' }}>Partner With VilleCabs</h1>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.8)', margin:0 }}>Grow your business. We will drive the customers.</p>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'16px' }}>
        {['Hotels','Restaurants','Guest Houses','Attractions','Businesses','Clubs','Supermarkets','Events'].map((c,i) => (
          <div key={i} style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:12, padding:'10px', textAlign:'center', fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{c}</div>
        ))}
      </div>
      <div style={{ padding:'0 16px 40px' }}>
        {sent ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a1a2e' }}>Request Received!</div>
          </div>
        ) : (
          <div>
            {error && <div style={{ background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:10, padding:'10px', fontSize:13, color:'#dc2626', marginBottom:12 }}>{error}</div>}
            {[['Business Name *','bizName'],['Business Type *','bizType'],['Contact Person','contact'],['Phone *','phone'],['Email *','email'],['Address','address'],['Website','website']].map(([l,k]) => (
              <div key={k}>
                <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>{l}</label>
                <input value={form[k]||''} onChange={e=>set(k,e.target.value)} style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #e2e4ed', borderRadius:10, fontSize:14, marginBottom:12, boxSizing:'border-box', outline:'none', color:'#1a1a2e' }}/>
              </div>
            ))}
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Message</label>
            <textarea value={form.message} onChange={e=>set('message',e.target.value)} rows={3} style={{ width:'100%', padding:'11px', border:'1.5px solid #e2e4ed', borderRadius:10, fontSize:14, marginBottom:14, boxSizing:'border-box', outline:'none', resize:'vertical', color:'#1a1a2e' }}/>
            <button onClick={submit} disabled={saving} style={{ width:'100%', padding:'13px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>{saving?'Submitting...':'Submit Partner Request'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DriverEarnings({ go, user }) {
  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState('week');
  const [detail,  setDetail]  = useState(null);
  useEffect(() => {
    if (!user?.uid) return;
    getDocs(query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','completed')))
      .then(snap => { setRides(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);
  const now=new Date(), todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const weekStart=new Date(todayStart.getTime()-6*86400000), monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const filtered=rides.filter(r=>{const d=new Date((r.createdAt?.seconds||0)*1000);return period==='today'?d>=todayStart:period==='week'?d>=weekStart:d>=monthStart;});
  const totalFare=filtered.reduce((s,r)=>s+(r.fare||0),0);
  const driverNet=Math.round(totalFare*0.85), vcFee=Math.round(totalFare*0.15);
  if (detail) {
    const fare=detail.fare||0;
    return (
      <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
        <div style={{ background:'#fff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10 }}>
          <button onClick={()=>setDetail(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
          <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e' }}>Ride Details</span>
        </div>
        <div style={{ padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:16, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
            {[['Total Fare','J$'+fare.toLocaleString(),'#1a1a2e'],['VilleCabs Fee (15%)','-J$'+Math.round(fare*0.15).toLocaleString(),'#dc2626'],['You Earned (85%)','J$'+Math.round(fare*0.85).toLocaleString(),'#6b21a8']].map(([l,v,c],i)=>(
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:i<2?'1px solid #f0f0f0':'none' }}>
                <span style={{ fontSize:13, color:'#555' }}>{l}</span><span style={{ fontSize:14, fontWeight:700, color:c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10 }}>
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>Earnings</span>
      </div>
      <div style={{ display:'flex', gap:8, padding:'12px 16px', background:'#fff', borderBottom:'1px solid #f0f0f0' }}>
        {[['today','Today'],['week','This Week'],['month','This Month']].map(([k,l])=>(
          <button key={k} onClick={()=>setPeriod(k)} style={{ flex:1, padding:'8px', borderRadius:20, border:'none', background:period===k?'#6b21a8':'#f3f4f6', color:period===k?'#fff':'#555', fontSize:12, fontWeight:600, cursor:'pointer' }}>{l}</button>
        ))}
      </div>
      <div style={{ padding:'14px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', marginBottom:4 }}>You Earned</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#6b21a8' }}>J${driverNet.toLocaleString()}</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', marginBottom:4 }}>Total Fares</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#1a1a2e' }}>J${totalFare.toLocaleString()}</div>
          </div>
        </div>
        {loading && <div style={{ textAlign:'center', color:'#888', padding:24 }}>Loading...</div>}
        {!loading && filtered.length===0 && <div style={{ textAlign:'center', color:'#888', padding:24 }}>No rides in this period</div>}
        {filtered.map((r,i)=>{
          const d=new Date((r.createdAt?.seconds||0)*1000);
          return (<div key={i} onClick={()=>setDetail(r)} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', cursor:'pointer' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{r.customerName||'Passenger'}</div>
              <div style={{ fontSize:15, fontWeight:800, color:'#6b21a8' }}>J${Math.round((r.fare||0)*0.85).toLocaleString()}</div>
            </div>
            <div style={{ fontSize:11, color:'#888' }}>{d.toLocaleDateString()}</div>
          </div>);
        })}
      </div>
    </div>
  );
}

function DriverDocuments({ go, user }) {
  const [docs,   setDocs]   = useState({});
  const [saving, setSaving] = useState('');
  const [msg,    setMsg]    = useState('');
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db,'drivers',user.uid)).then(snap => { if (snap.exists()) setDocs(snap.data().documents||{}); });
  }, [user]);
  const docTypes=[{key:'licence',label:"Driver Licence",icon:'🪪'},{key:'fitness',label:'Vehicle Fitness',icon:'📋'},{key:'registration',label:'Vehicle Registration',icon:'📄'},{key:'insurance',label:'Insurance',icon:'🛡️'},{key:'vehiclePhoto',label:'Vehicle Photo',icon:'🚗'}];
  const handleUpload = async (key, file) => {
    if (!file||!user?.uid) return;
    setSaving(key);
    try {
      const docData={status:'pending',name:file.name,uploadedAt:new Date().toISOString()};
      await updateDoc(doc(db,'drivers',user.uid), {['documents.'+key]:docData});
      setDocs(prev=>({...prev,[key]:docData}));
      setMsg('Uploaded — pending review'); setTimeout(()=>setMsg(''),3000);
    } catch(e) {}
    setSaving('');
  };
  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10 }}>
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>My Documents</span>
      </div>
      <div style={{ padding:'14px 14px 90px' }}>
        {msg&&<div style={{ background:'#f0fff4', border:'1px solid #86efac', borderRadius:10, padding:'10px', fontSize:13, color:'#1a9e5a', marginBottom:12 }}>{msg}</div>}
        {docTypes.map(({key,label,icon})=>{
          const d=docs[key], status=d?.status||'missing';
          const colors={approved:'#1a9e5a',pending:'#b45309',rejected:'#dc2626',missing:'#888'};
          const labels={approved:'Approved',pending:'Pending Review',rejected:'Needs Update',missing:'Not Uploaded'};
          return (<div key={key} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <span style={{ fontSize:24 }}>{icon}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{label}</div>
                <div style={{ fontSize:11, color:colors[status], fontWeight:600 }}>{labels[status]}</div>
              </div>
            </div>
            <label style={{ display:'block', padding:'9px', background:status==='approved'?'#f9f5ff':'#6b21a8', color:status==='approved'?'#6b21a8':'#fff', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer', textAlign:'center' }}>
              {saving===key?'Uploading...':status==='approved'?'Replace':'Upload Document'}
              <input type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={e=>handleUpload(key,e.target.files[0])} disabled={saving===key}/>
            </label>
          </div>);
        })}
      </div>
    </div>
  );
}

function DriverNotifications({ go, user }) {
  const [notifs, setNotifs] = useState([
    {id:'1',type:'account',title:'Welcome to VilleCabs!',message:'Complete your profile to start receiving ride requests.',time:'Today',read:false},
    {id:'2',type:'account',title:'Application Received',message:'Your application is being reviewed by our team.',time:'Today',read:true},
  ]);
  const [filter, setFilter] = useState('all');
  const icons={ride:'🚕',account:'👤',safety:'🛡️',payment:'💰',system:'⚙️'};
  const filtered=filter==='all'?notifs:filter==='unread'?notifs.filter(n=>!n.read):notifs.filter(n=>n.type===filter);
  const unread=notifs.filter(n=>!n.read).length;
  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10 }}>
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>Notifications</span>
        {unread>0&&<div style={{ background:'#6b21a8', color:'#fff', borderRadius:10, fontSize:10, fontWeight:700, padding:'2px 7px' }}>{unread}</div>}
        <button onClick={()=>setNotifs(p=>p.map(n=>({...n,read:true})))} style={{ marginLeft:'auto', background:'none', border:'none', fontSize:11, color:'#6b21a8', cursor:'pointer', fontWeight:600 }}>Mark all read</button>
      </div>
      <div style={{ display:'flex', gap:6, padding:'10px 14px', background:'#fff', borderBottom:'1px solid #f0f0f0', overflowX:'auto' }}>
        {[['all','All'],['unread','Unread'],['ride','Rides'],['account','Account']].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:'none', background:filter===k?'#6b21a8':'#f3f4f6', color:filter===k?'#fff':'#555', fontSize:11, fontWeight:600, cursor:'pointer' }}>{l}</button>
        ))}
      </div>
      <div style={{ padding:'12px 14px 90px' }}>
        {filtered.length===0&&<div style={{ textAlign:'center', padding:40, color:'#888' }}>No notifications</div>}
        {filtered.map((n,i)=>(
          <div key={i} onClick={()=>setNotifs(p=>p.map(x=>x.id===n.id?{...x,read:true}:x))}
            style={{ background:n.read?'#fff':'#f9f5ff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', cursor:'pointer' }}>
            <div style={{ display:'flex', gap:12 }}>
              <span style={{ fontSize:22 }}>{icons[n.type]||'🔔'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:3 }}>{n.title}</div>
                <div style={{ fontSize:12, color:'#555', lineHeight:1.5 }}>{n.message}</div>
                <div style={{ fontSize:10, color:'#aaa', marginTop:4 }}>{n.time}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function App() {
  const [screen,      setScreen]      = useState('splash');
  const [user,        setUser]        = useState(null);
  const [bookingId,   setBookingId]   = useState(null);
  const [pickupData,  setPickupData]  = useState(null);
  const [dropoffData, setDropoffData] = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let done = false;
    // Safety net - always show app within 4 seconds
    const safety = setTimeout(() => {
      if (!done) { done = true; setLoading(false); setScreen('splash'); }
    }, 4000);

    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (done) return;
      if (_manualNavDone) return; // Manual login/signup handled navigation already
      if (!fu) {
        // Not logged in - show landing
        clearTimeout(safety);
        done = true;
        setTimeout(() => setLoading(false), 300);
        return;
      }
      // Logged in - restore session
      try {
        const [cSnap, dSnap] = await Promise.all([
          getDoc(doc(db, 'customers', fu.uid)),
          getDoc(doc(db, 'drivers',   fu.uid)),
        ]);
        if (dSnap.exists()) {
          const d = dSnap.data();
          setUser({ uid:fu.uid, name:d.name||fu.displayName||'Driver', email:fu.email, role:'driver' });
          if      (d.status === 'approved') setScreen('driver-dash');
          else if (d.status === 'pending')  setScreen('driver-pending');
          else                               setScreen('driver-login');
        } else if (cSnap.exists()) {
          const d = cSnap.data();
          setUser({ uid:fu.uid, name:d.name||fu.displayName||'Customer', email:fu.email, role:'customer' });
          if (!fu.emailVerified && fu.providerData?.[0]?.providerId === 'password') {
            setScreen('otp');
          } else if (!d.termsAccepted) {
            setScreen('terms');
          } else if (!d.tipsSeen) {
            setScreen('welcome-tips');
          } else {
            setScreen('customer-dash');
          }
        } else {
          // User in Firebase Auth but no Firestore record
          setScreen('splash');
        }
      } catch(e) {
        console.error('Auth restore error:', e);
        setScreen('splash');
      }
      clearTimeout(safety);
      done = true;
      setLoading(false);
    });

    return () => { unsub(); clearTimeout(safety); };
  }, []);

  // ── 10-minute idle logout ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let idleTimer;
    const resetTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(async () => {
        try { await signOut(auth); } catch(e) {}
        setUser(null);
        setScreen('splash');
      }, 5 * 60 * 1000); // 5 minutes
    };
    const events = ['mousedown','mousemove','keydown','scroll','touchstart','click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive:true }));
    resetTimer();
    return () => {
      clearTimeout(idleTimer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [user]);

  if (loading) return <LoadingScreen/>;

  const props = { go:setScreen, user, setUser, bookingId, setBookingId, pickupData, setPickupData, dropoffData, setDropoffData };

  const screens = {
    splash:           <Splash {...props}/>,
    role:             <RoleSelect {...props}/>,
    'customer-signup':<CustomerSignup {...props}/>,
    'customer-login': <CustomerLogin {...props}/>,
    otp:              <OTPScreen {...props}/>,
    terms:            <TermsScreen {...props}/>,
    'welcome-tips':   <WelcomeTips {...props}/>,
    'about-us':       <AboutUs {...props}/>,
    'contact-us':     <ContactUs {...props}/>,
    help:             <HelpScreen {...props}/>,
    'customer-dash':  <CustomerDash {...props}/>,
    'pin-pickup':     <PinPickup {...props}/>,
    'pin-dropoff':    <PinDropoff {...props}/>,
    'vehicle-select': <VehicleSelect {...props}/>,
    'booking-confirm':<BookingConfirm {...props}/>,
    'live-ride':      <LiveRide {...props}/>,
    'driver-signup':        <DriverSignup {...props}/>,
    'driver-pending':       <DriverPending {...props}/>,
    'driver-login':         <DriverLogin {...props}/>,
    'driver-terms':         <DriverTermsScreen {...props}/>,
    'driver-welcome-tips':  <DriverWelcomeTips {...props}/>,
    'driver-about':         <DriverAboutUs {...props}/>,
    'driver-contact':       <DriverContactUs {...props}/>,
    'driver-help':          <DriverHelp {...props}/>,
    'driver-dash':          <DriverDash {...props}/>,
    'driver-active':  <DriverActive {...props}/>,
    'driver-profile': <DriverProfile {...props}/>,
    'driver-settings':<DriverSettings {...props}/>,
    'chat':           <ChatScreen {...props}/>,
    'customer-profile': <CustomerProfile {...props}/>,
    'customer-settings':<CustomerSettings {...props}/>,
    'business':         <BusinessPage {...props}/>,
    'featured':         <FeaturedPage {...props}/>,
    'payments':         <PaymentsPage {...props}/>,
    'promotions':       <PromotionsPage {...props}/>,
    'safety-centre':         <SafetyCentre {...props}/>,
    'partner-with-us':       <PartnerWithUs {...props}/>,
    'driver-earnings':        <DriverEarnings {...props}/>,
    'driver-documents':       <DriverDocuments {...props}/>,
    'driver-notifications':   <DriverNotifications {...props}/>,
    'login':                  <CustomerLogin {...props}/>,
    'login-choice':           <CustomerLogin {...props}/>,
    admin:                    <AdminDash {...props}/>,
  };

  return (
    <ErrorBoundary>
      <div style={s.screen}>
        <GlobalStyles/>
        <MapBg/>
        {screens[screen]||<Splash {...props}/>}
      </div>
    </ErrorBoundary>
  );
}