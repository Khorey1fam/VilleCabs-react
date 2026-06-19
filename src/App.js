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
  screen:    { minHeight:'100vh', fontFamily:"'Segoe UI', sans-serif", background:'#f5f6fa', color:'#1a1a2e', position:'relative' },
  mapBg:     { position:'fixed', inset:0, zIndex:0, background:DARK },
  overlay:   { position:'fixed', inset:0, zIndex:1, background:'rgba(15,25,50,0.72)', backdropFilter:'blur(4px)' },
  content:   { position:'relative', zIndex:2, minHeight:'100vh', background:'#f5f6fa' },
  center:    { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'0 24px', background:'#f5f6fa' },
  card:      { background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:20, padding:'28px 24px', width:'100%', maxWidth:380, boxShadow:'0 4px 24px rgba(0,0,0,0.08)' },
  btnY:      { width:'100%', padding:'14px 20px', background:YELLOW, color:DARK, border:'none', borderRadius:12, fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10 },
  btnO:      { width:'100%', padding:'14px 20px', background:'#ffffff', color:'#1a1a2e', border:'1.5px solid #d0d3e0', borderRadius:12, fontSize:15, fontWeight:500, cursor:'pointer', marginBottom:10 },
  btnG:      { width:'100%', padding:'14px 20px', background:GREEN, color:WHITE, border:'none', borderRadius:12, fontSize:15, fontWeight:600, cursor:'pointer', marginBottom:10 },
  inp:       { width:'100%', padding:'14px', background:'#ffffff', border:'1px solid #d0d3e0', borderRadius:10, color:'#1a1a2e', fontSize:16, marginBottom:12, boxSizing:'border-box', outline:'none' },
  lbl:       { fontSize:11, color:'rgba(255,255,255,0.55)', marginBottom:4, display:'block', fontWeight:500 },
  topBar:    { background:'#0f1a35', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'none', position:'sticky', top:0, zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.2)', minHeight:50 },
  backBtn:   { background:'none', border:'none', color:WHITE, fontSize:22, cursor:'pointer', padding:'0 6px 0 0', lineHeight:1 },
  topTitle:  { color:WHITE, fontSize:16, fontWeight:500 },
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
    document.body.style.height = '100%';
    document.body.style.overscrollBehavior = 'none';
    const style = document.createElement('style');
    style.innerHTML = `
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      html, body { margin:0; padding:0; overflow-x:hidden; font-size:16px; background:#f5f6fa; }
      button:hover:not(:disabled) { filter:brightness(1.15); transform:translateY(-1px); transition:all 0.15s ease; }
      button:active:not(:disabled) { transform:translateY(0) scale(0.98); filter:brightness(0.95); }
      button { transition:all 0.15s ease; -webkit-appearance:none; }
      a:hover { opacity:0.8; transition:opacity 0.15s; }
      input, textarea, select { font-size:16px !important; } /* Prevent iOS zoom on focus */
      input:focus, textarea:focus, select:focus { border-color:rgba(232,180,0,0.6)!important; box-shadow:0 0 0 2px rgba(232,180,0,0.15); transition:all 0.2s; }
      ::-webkit-scrollbar { width:4px; }
      ::-webkit-scrollbar-track { background:rgba(255,255,255,0.03); }
      ::-webkit-scrollbar-thumb { background:rgba(232,180,0,0.3); border-radius:4px; }
      ::-webkit-scrollbar-thumb:hover { background:rgba(232,180,0,0.5); }
      /* Responsive font sizes */
      @media (max-width: 380px) { html { font-size:14px; } }
      @media (min-width: 768px) { html { font-size:17px; } }
      /* Full screen map overlay */
      .map-fullscreen { position:fixed !important; top:0; left:0; right:0; bottom:0; z-index:200; }
      .map-fullscreen > div { height:100% !important; }
    `;
    document.head.appendChild(style);
    return () => { if (style.parentNode) style.parentNode.removeChild(style); };
  }, []);
  return null;
}

function MapBg() {
  return (
    <>
      <div style={{
        position:'fixed', inset:0, zIndex:0,
        backgroundImage:"url('/bg.jpg')",
        backgroundSize:'cover',
        backgroundPosition:'center',
        backgroundRepeat:'no-repeat',
        filter:'blur(6px)',
        transform:'scale(1.05)', // prevent blur edge white borders
      }}/>
      <div style={{ position:'fixed', inset:0, zIndex:1, background:'rgba(10,15,30,0.72)' }}/>
    </>
  );
}

// ── Google Map component ──────────────────────────────────────────────────────
function VilleMap({ height = 260, center = MANCHESTER_CENTER, zoom = 14, onClick, markers = [], directions = null, children, expandable = false }) {
  const [expanded, setExpanded] = useState(false);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

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
        style={{ height:26, width:'auto', objectFit:'contain', cursor:'pointer', flexShrink:0 }}/>
      <span style={{ ...s.topTitle, marginLeft:6 }}>{title}</span>
      <div style={{ display:'flex', gap:5, marginLeft:'auto' }}>
        <button onClick={() => go && go('business')}
          style={{ padding:'3px 9px', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:12, color:'rgba(255,255,255,0.85)', fontSize:10, fontWeight:600, cursor:'pointer' }}>
          Business
        </button>
        <button onClick={() => go && go('featured')}
          style={{ padding:'3px 9px', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:12, color:'rgba(255,255,255,0.85)', fontSize:10, fontWeight:600, cursor:'pointer' }}>
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
            <img src="/villecabs-logo.png" alt="V" style={{ width:36, height:36, borderRadius:'50%', objectFit:'cover' }}/>
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
                style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:10, cursor:'pointer' }}
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
              style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:10, cursor:'pointer' }}
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
            <a href="https://wa.me/18762804292" target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'rgba(255,255,255,0.35)', textDecoration:'none' }}
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
  const [heroSlide, setHeroSlide]       = useState(0);
  const [safetySlide, setSafetySlide]   = useState(0);
  const [driverSlide, setDriverSlide]   = useState(0);
  const [partnerSlide, setPartnerSlide] = useState(0);

  // ── HERO SLIDES ─────────────────────────────────────────────────────────────
  const heroSlides = [
    { icon:'🚕', title:'Safe rides in Mandeville',         sub:'Trusted local drivers · GPS tracked · SOS protected',           cta:'Book Now',         action:() => go('customer-login'),                                                                                  bg:'linear-gradient(135deg, #0f1a35 0%, #1a2744 100%)', accent:'#e8b400' },
    { icon:'🚗', title:'Drive with VilleCabs',             sub:'Use your vehicle, choose your hours, earn locally',             cta:'Become a Driver',  action:() => go('driver-signup'),                                                                                  bg:'linear-gradient(135deg, #0a4a2a 0%, #1a9e5a 100%)', accent:'#ffffff' },
    { icon:'🤝', title:'Partner with VilleCabs',           sub:'Restaurants, clubs, supermarkets and hotels — connect with more customers', cta:'Partner With Us', action:() => window.open('mailto:admin@villecabs.com?subject=VilleCabs Partnership','_blank'),                          bg:'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', accent:'#e8b400' },
    { icon:'✨', title:'Your city. Your ride. Your way.',   sub:'Built for Mandeville & Manchester, Jamaica',                    cta:'Learn More',       action:() => go('about-us'),                                                                                       bg:'linear-gradient(135deg, #1a0a1a 0%, #2d1b4e 100%)', accent:'#e8b400' },
  ];
  useEffect(() => { const t=setInterval(()=>setHeroSlide(s=>(s+1)%heroSlides.length),5000); return ()=>clearInterval(t); }, [heroSlides.length]);

  const safetyTips = [
    { icon:'👀', title:'Verify Your Driver',  desc:'Check licence plate, car colour, make, and driver photo before getting in.' },
    { icon:'📲', title:'Share Your Trip',     desc:'Send your live ride details to a trusted friend or family member.' },
    { icon:'🆘', title:'Use SOS Emergency',   desc:'Hold the SOS button for 5 seconds if you need urgent help.' },
    { icon:'💵', title:'Confirm Your Fare',   desc:'Review your estimated fare before confirming your ride.' },
    { icon:'🎒', title:'Cash Ready',          desc:'Have your cash ready at the end of your trip.' },
  ];
  useEffect(() => { const t=setInterval(()=>setSafetySlide(s=>(s+1)%safetyTips.length),4000); return ()=>clearInterval(t); }, [safetyTips.length]);

  const driverSlides = [
    { icon:'⏰', title:'Flexible Hours',         desc:'Drive when it works for you.' },
    { icon:'💰', title:'Earn Locally',           desc:'Make money serving Mandeville and Manchester.' },
    { icon:'🚙', title:'Use Your Own Vehicle',   desc:'Stay independent while accessing more ride requests.' },
    { icon:'🚀', title:'Join Early',             desc:'Be part of a growing local platform.' },
    { icon:'🤝', title:'Driver Support',         desc:'Get onboarding and support from the VilleCabs team.' },
  ];
  useEffect(() => { const t=setInterval(()=>setDriverSlide(s=>(s+1)%driverSlides.length),4000); return ()=>clearInterval(t); }, [driverSlides.length]);

  const partnerSlides = [
    { icon:'🍽️', title:'Restaurants',           desc:'Help customers get to and from your location easily.' },
    { icon:'🎉', title:'Clubs & Events',         desc:'Support safer late-night transportation.' },
    { icon:'🛒', title:'Supermarkets',           desc:'Make shopping trips easier for customers.' },
    { icon:'🏨', title:'Hotels & Guest Houses',  desc:'Give guests convenient local ride access.' },
    { icon:'🏪', title:'Local Brands',           desc:'Promote your business through VilleCabs.' },
  ];
  useEffect(() => { const t=setInterval(()=>setPartnerSlide(s=>(s+1)%partnerSlides.length),4000); return ()=>clearInterval(t); }, [partnerSlides.length]);

  const featuredPartners = [
    { icon:'🍔', name:'Juici Patties',    cat:'Restaurant',     status:'Coming Soon' },
    { icon:'📚', name:'Bargain Books',    cat:'Bookstore',      status:'Coming Soon' },
    { icon:'🏨', name:'Golf View Hotel',  cat:'Hotel',          status:'Coming Soon' },
    { icon:'🍽️', name:'Restaurants',     cat:'Food & Dining',  status:'Coming Soon' },
    { icon:'🎉', name:'Clubs & Lounges', cat:'Nightlife',      status:'Coming Soon' },
    { icon:'🛒', name:'Supermarkets',    cat:'Grocery',        status:'Coming Soon' },
    { icon:'💊', name:'Pharmacies',      cat:'Health',         status:'Coming Soon' },
    { icon:'🎫', name:'Events',          cat:'Entertainment',  status:'Coming Soon' },
  ];

  const currentHero = heroSlides[heroSlide];

  return (
    <div style={{ ...s.content, background:'#ffffff', minHeight:'100vh' }}>
      {/* ═════════ HERO SLIDESHOW ═════════ */}
      <div style={{ position:'relative', minHeight:'90vh', overflow:'hidden', background: currentHero.bg, transition:'background 0.8s ease' }}>
        <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
          {[...Array(6)].map((_, i) => (
            <div key={'pin'+i} style={{ position:'absolute', fontSize:24, opacity:0.06, top:(15+i*15)+'%', left:((i*17)%80)+'%', animation:'floatUp '+(8+i*2)+'s ease-in-out infinite', animationDelay:(i*0.7)+'s' }}>📍</div>
          ))}
          {[...Array(4)].map((_, i) => (
            <div key={'taxi'+i} style={{ position:'absolute', fontSize:32, opacity:0.08, top:(20+i*20)+'%', left:'-50px', animation:'driveAcross '+(15+i*3)+'s linear infinite', animationDelay:(i*2)+'s' }}>🚕</div>
          ))}
        </div>

        <div style={{ position:'relative', zIndex:2, padding:'24px 20px 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <img src="/villecabs-logo.png" alt="VilleCabs" style={{ width:42, height:42, borderRadius:'50%', objectFit:'cover', border:`2px solid ${currentHero.accent}` }}/>
            <span style={{ fontSize:18, fontWeight:700, color:'#ffffff', letterSpacing:0.3 }}>VilleCabs</span>
          </div>
          <button onClick={() => go('customer-login')} style={{ padding:'8px 18px', background:'rgba(255,255,255,0.95)', color:'#0f1a35', border:'none', borderRadius:20, fontSize:13, fontWeight:600, cursor:'pointer' }}>Log In</button>
        </div>

        <div style={{ position:'relative', zIndex:2, padding:'40px 24px 60px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'70vh' }}>
          <div key={heroSlide} style={{ animation:'fadeSlideIn 0.7s ease', width:'100%', maxWidth:480 }}>
            <div style={{ fontSize:72, marginBottom:16, animation:'gentleBounce 3s ease-in-out infinite' }}>{currentHero.icon}</div>
            <h1 style={{ fontSize:32, fontWeight:800, color:'#ffffff', margin:'0 0 12px', lineHeight:1.2, letterSpacing:-0.5 }}>{currentHero.title}</h1>
            <p style={{ fontSize:15, color:'rgba(255,255,255,0.75)', margin:'0 0 32px', lineHeight:1.6 }}>{currentHero.sub}</p>
            <button onClick={currentHero.action} style={{ padding:'14px 32px', background: currentHero.accent, color: currentHero.accent === '#e8b400' ? '#0f1a35' : '#1a1a2e', border:'none', borderRadius:30, fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', letterSpacing:0.3 }}>{currentHero.cta} →</button>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:40 }}>
            {heroSlides.map((_, i) => (
              <button key={i} onClick={() => setHeroSlide(i)} style={{ width: i===heroSlide?30:8, height:8, borderRadius:4, border:'none', background: i===heroSlide?'#ffffff':'rgba(255,255,255,0.35)', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
            ))}
          </div>
        </div>

        <div style={{ position:'relative', zIndex:2, padding:'0 24px 24px', textAlign:'center' }}>
          <p style={{ fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:1.5, textTransform:'uppercase', margin:0 }}>Mandeville · Christiana · Spaldings · Porus</p>
        </div>
      </div>

      {/* ═════════ QUICK LOG IN / SIGN UP ═════════ */}
      <div style={{ padding:'32px 24px', background:'#ffffff', textAlign:'center' }}>
        <p style={{ fontSize:13, color:'#888aaa', margin:'0 0 16px' }}>Ready to ride?</p>
        <div style={{ display:'flex', gap:12, maxWidth:400, margin:'0 auto' }}>
          <button onClick={() => go('customer-login')} style={{ flex:1, padding:'14px', background:'#111111', color:'#ffffff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer' }}>Log In</button>
          <button onClick={() => go('role')} style={{ flex:1, padding:'14px', background:'#ffffff', color:'#1a1a2e', border:'1.5px solid #d0d3e0', borderRadius:12, fontSize:14, fontWeight:600, cursor:'pointer' }}>Sign Up</button>
        </div>
      </div>

      {/* ═════════ WHY CHOOSE VILLECABS ═════════ */}
      <div style={{ padding:'48px 20px', background:'#f5f6fa' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <p style={{ fontSize:12, color:'#e8b400', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', margin:'0 0 8px' }}>Why Choose Us</p>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#0f1a35', margin:0 }}>Why Choose VilleCabs?</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:600, margin:'0 auto' }}>
          {[
            { icon:'✅', title:'Verified Drivers',     desc:'Background-checked locals' },
            { icon:'📍', title:'GPS Tracked',          desc:'Every ride monitored live' },
            { icon:'🆘', title:'SOS Protected',        desc:'Emergency button always ready' },
            { icon:'🏝️', title:'Local Manchester',     desc:'Built for our community' },
            { icon:'💵', title:'Simple Cash',          desc:'No card needed' },
            { icon:'🌟', title:'Built for Mandeville', desc:'Made right here at home' },
          ].map((item, i) => (
            <div key={i} style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:'18px 14px', textAlign:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>{item.icon}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f1a35', marginBottom:4 }}>{item.title}</div>
              <div style={{ fontSize:11, color:'#666888', lineHeight:1.4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═════════ SAFETY TIPS SLIDESHOW ═════════ */}
      <div style={{ padding:'48px 20px', background:'#0f1a35', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-50, right:-50, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(232,180,0,0.15) 0%, transparent 70%)' }}/>
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <p style={{ fontSize:12, color:'#e8b400', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', margin:'0 0 8px' }}>Stay Safe</p>
            <h2 style={{ fontSize:26, fontWeight:800, color:'#ffffff', margin:0 }}>Safety Tips</h2>
          </div>
          <div style={{ maxWidth:480, margin:'0 auto' }}>
            <div key={safetySlide} style={{ animation:'fadeSlideIn 0.5s ease', background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(232,180,0,0.4)', borderRadius:18, padding:'28px 24px', textAlign:'center' }}>
              <div style={{ fontSize:48, marginBottom:14 }}>{safetyTips[safetySlide].icon}</div>
              <h3 style={{ fontSize:18, fontWeight:700, color:'#e8b400', margin:'0 0 10px' }}>{safetyTips[safetySlide].title}</h3>
              <p style={{ fontSize:14, color:'rgba(255,255,255,0.8)', lineHeight:1.6, margin:0 }}>{safetyTips[safetySlide].desc}</p>
            </div>
            <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:18 }}>
              {safetyTips.map((_, i) => (
                <button key={i} onClick={() => setSafetySlide(i)} style={{ width: i===safetySlide?24:6, height:6, borderRadius:3, border:'none', background: i===safetySlide?'#e8b400':'rgba(255,255,255,0.25)', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═════════ FEATURED PARTNERS AUTO-SCROLL ═════════ */}
      <div style={{ padding:'48px 0', background:'#ffffff' }}>
        <div style={{ textAlign:'center', marginBottom:28, padding:'0 20px' }}>
          <p style={{ fontSize:12, color:'#e8b400', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', margin:'0 0 8px' }}>Coming Soon</p>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#0f1a35', margin:'0 0 8px' }}>Featured Partners</h2>
          <p style={{ fontSize:14, color:'#666888', margin:0 }}>Local businesses connected with VilleCabs.</p>
        </div>
        <div style={{ overflow:'hidden', position:'relative' }}>
          <div style={{ display:'flex', gap:14, animation:'autoScroll 30s linear infinite', width:'fit-content', padding:'0 10px' }}>
            {[...featuredPartners, ...featuredPartners].map((p, i) => (
              <div key={i} style={{ flexShrink:0, width:160, background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:14, padding:'18px 14px', textAlign:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:36, marginBottom:8 }}>{p.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#0f1a35', marginBottom:4 }}>{p.name}</div>
                <div style={{ fontSize:10, color:'#888aaa', marginBottom:8 }}>{p.cat}</div>
                <div style={{ fontSize:9, background:'rgba(232,180,0,0.15)', color:'#b38600', padding:'3px 8px', borderRadius:10, fontWeight:600, display:'inline-block' }}>{p.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═════════ DRIVE WITH VILLECABS ═════════ */}
      <div style={{ padding:'48px 20px', background:'linear-gradient(135deg, #0a4a2a 0%, #0f1a35 100%)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.05 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ position:'absolute', fontSize:60, top:(i*20)+'%', left:((i*23)%80)+'%', animation:'floatUp '+(10+i*2)+'s ease-in-out infinite', animationDelay:i+'s' }}>🚗</div>
          ))}
        </div>
        <div style={{ position:'relative', zIndex:1, textAlign:'center', marginBottom:24 }}>
          <p style={{ fontSize:12, color:'#e8b400', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', margin:'0 0 8px' }}>For Drivers</p>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#ffffff', margin:'0 0 8px' }}>Drive With VilleCabs</h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.7)', margin:0 }}>Turn your vehicle into earning opportunity.</p>
        </div>
        <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto' }}>
          <div key={driverSlide} style={{ animation:'fadeSlideIn 0.5s ease', background:'rgba(255,255,255,0.08)', border:'1.5px solid rgba(232,180,0,0.3)', borderRadius:18, padding:'24px', textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>{driverSlides[driverSlide].icon}</div>
            <h3 style={{ fontSize:18, fontWeight:700, color:'#e8b400', margin:'0 0 8px' }}>{driverSlides[driverSlide].title}</h3>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.85)', lineHeight:1.6, margin:0 }}>{driverSlides[driverSlide].desc}</p>
          </div>
          <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:16, marginBottom:20 }}>
            {driverSlides.map((_, i) => (
              <button key={i} onClick={() => setDriverSlide(i)} style={{ width: i===driverSlide?24:6, height:6, borderRadius:3, border:'none', background: i===driverSlide?'#e8b400':'rgba(255,255,255,0.25)', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
            ))}
          </div>
          <button onClick={() => go('driver-signup')} style={{ display:'block', margin:'0 auto', padding:'14px 36px', background:'#e8b400', color:'#0f1a35', border:'none', borderRadius:30, fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 6px 20px rgba(232,180,0,0.4)' }}>Apply To Drive →</button>
        </div>
      </div>

      {/* ═════════ PARTNER WITH VILLECABS ═════════ */}
      <div style={{ padding:'48px 20px', background:'#f5f6fa' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <p style={{ fontSize:12, color:'#e8b400', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', margin:'0 0 8px' }}>For Businesses</p>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#0f1a35', margin:'0 0 8px' }}>Partner With VilleCabs</h2>
          <p style={{ fontSize:14, color:'#666888', margin:0 }}>Let us help bring more customers to your business.</p>
        </div>
        <div style={{ maxWidth:480, margin:'0 auto' }}>
          <div key={partnerSlide} style={{ animation:'fadeSlideIn 0.5s ease', background:'#ffffff', border:'1.5px solid #e2e4ed', borderRadius:18, padding:'28px 24px', textAlign:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>{partnerSlides[partnerSlide].icon}</div>
            <h3 style={{ fontSize:18, fontWeight:700, color:'#0f1a35', margin:'0 0 8px' }}>{partnerSlides[partnerSlide].title}</h3>
            <p style={{ fontSize:14, color:'#555770', lineHeight:1.6, margin:0 }}>{partnerSlides[partnerSlide].desc}</p>
          </div>
          <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:16, marginBottom:20 }}>
            {partnerSlides.map((_, i) => (
              <button key={i} onClick={() => setPartnerSlide(i)} style={{ width: i===partnerSlide?24:6, height:6, borderRadius:3, border:'none', background: i===partnerSlide?'#e8b400':'#d0d3e0', cursor:'pointer', transition:'all 0.3s', padding:0 }}/>
            ))}
          </div>
          <button onClick={() => window.open('mailto:admin@villecabs.com?subject=VilleCabs Partnership','_blank')} style={{ display:'block', margin:'0 auto', padding:'14px 36px', background:'#0f1a35', color:'#ffffff', border:'none', borderRadius:30, fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 6px 20px rgba(15,26,53,0.3)' }}>Become a Partner →</button>
        </div>
      </div>

      {/* ═════════ FINAL CTA ═════════ */}
      <div style={{ padding:'56px 24px', background:'linear-gradient(135deg, #e8b400 0%, #b38600 100%)', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, opacity:0.1 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ position:'absolute', fontSize:80, top:(i*30)+'%', left:'-100px', animation:'driveAcross '+(12+i*4)+'s linear infinite', animationDelay:(i*3)+'s' }}>🚕</div>
          ))}
        </div>
        <div style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto' }}>
          <h2 style={{ fontSize:28, fontWeight:800, color:'#0f1a35', margin:'0 0 8px', lineHeight:1.2 }}>Your city. Your ride. Your way.</h2>
          <p style={{ fontSize:14, color:'rgba(15,26,53,0.7)', margin:'0 0 24px' }}>Built for Mandeville & Manchester, Jamaica.</p>
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={() => go('customer-login')} style={{ padding:'14px 28px', background:'#0f1a35', color:'#ffffff', border:'none', borderRadius:30, fontSize:14, fontWeight:700, cursor:'pointer' }}>Book a Ride</button>
            <button onClick={() => go('role')} style={{ padding:'14px 28px', background:'#ffffff', color:'#0f1a35', border:'none', borderRadius:30, fontSize:14, fontWeight:700, cursor:'pointer' }}>Sign Up Free</button>
          </div>
        </div>
      </div>

      {/* Driver Login pill */}
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:50 }}>
        <button onClick={() => go('driver-login')} style={{ padding:'10px 18px', background:'#0f1a35', border:'1px solid rgba(232,180,0,0.4)', borderRadius:24, color:'#ffffff', fontSize:12, cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,0.25)', fontWeight:600 }}>🚗 Driver Login</button>
      </div>

      <Footer go={go}/>

      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gentleBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes floatUp { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(5deg); } }
        @keyframes driveAcross { 0% { transform: translateX(0); } 100% { transform: translateX(110vw); } }
        @keyframes autoScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      `}</style>
    </div>
  );
}

// ── LOGIN CHOICE ─────────────────────────────────────────────────────────────
function LoginChoice({ go, user }) {
  return (
    <div style={s.content}>
      <TopBar title="Log In" onBack={() => go('splash')} go={go} user={user}/>
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
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Book rides in Manchester, Jamaica</div>
          </div>

          <div onClick={() => go('driver-login')}
            style={{ background:'rgba(26,158,90,0.08)', border:'1.5px solid rgba(26,158,90,0.25)', borderRadius:16, padding:24, cursor:'pointer', textAlign:'left', transition:'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(26,158,90,0.6)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(26,158,90,0.25)'}>
            <div style={{ fontSize:28, marginBottom:8 }}>🚗</div>
            <div style={{ fontSize:16, fontWeight:600, color:WHITE, marginBottom:4 }}>Driver Login</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>Access your driver dashboard</div>
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
      <TopBar title="Join VilleCabs" onBack={() => go('splash')} go={go} user={user}/>
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
      <TopBar title="Create Account" onBack={() => go('role')} go={go} user={user}/>
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
      <TopBar title="Verify Email" onBack={() => go(user?.role==='driver'?'driver-signup':'customer-signup')} go={go} user={user}/>
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
      <TopBar title="Log In" onBack={() => go('customer-signup')} go={go} user={user}/>
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
    <Footer go={go}/>
    </div>
  );
}

// ── DRIVER LOGIN ──────────────────────────────────────────────────────────────
function DriverLogin({ go, setUser, user }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email||!password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      // Small delay to ensure loading state renders before Firebase call
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db,'drivers',cred.user.uid));
      if (!snap.exists()) { setError('No driver account found. Please apply first.'); setLoading(false); return; }
      const data = snap.data();
      if (data.status==='pending')  { setError('Your application is still pending admin approval.'); setLoading(false); return; }
      if (data.status==='rejected') { setError('Your application was not approved. Contact support.'); setLoading(false); return; }
      try { await updateDoc(doc(db,'drivers',cred.user.uid), { role:'driver' }); } catch(e) {}
      try { await updateDoc(doc(db,'drivers',cred.user.uid), { role:'driver' }); } catch(e) {}
      setUser({ uid:cred.user.uid, name:data.name, email:cred.user.email, role:'driver' });
      _manualNavDone = true;
      if (!data.termsAccepted) go('driver-terms');
      else if (!data.tipsSeen) go('driver-welcome-tips');
      else go('driver-dash');
    } catch(err) { setError('Incorrect email or password.'); }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Login" onBack={() => go('splash')} go={go} user={user}/>
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
function DriverSignup({ go, user }) {
  const [form, setForm]       = useState({ name:'',trn:'',dob:'',phone:'',email:'',password:'',make:'',model:'',plate:'' });
  const [docs, setDocs]       = useState({ license:null, fitness:null, registration:null });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));

  const handleSubmit = async () => {
    setError('');
    if (Object.values(form).some(v => !v)) { setError('Please fill in all fields.'); return; }
    if (!docs.license||!docs.fitness||!docs.registration) { setError('Please upload all 3 documents.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      // Validate file sizes (max 5MB each)
      const maxSize = 5 * 1024 * 1024;
      if (docs.license.size > maxSize || docs.fitness.size > maxSize || docs.registration.size > maxSize) {
        setError('Each document must be under 5MB. Please compress your files and try again.');
        setLoading(false); return;
      }

      setError('Creating your account...');
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);

      // Convert file to base64 and upload with timeout
      const uploadFile = async (file, name, label) => {
        setError(`Uploading ${label} (${Math.round(file.size/1024)}KB)...`);
        const r = storageRef(storage, `driver-docs/${cred.user.uid}/${name}`);
        const snap = await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
        const url = await getDownloadURL(snap.ref);
        return url;
      };

      const licenseUrl      = await uploadFile(docs.license,      'license',       "Driver's Licence");
      const fitnessUrl      = await uploadFile(docs.fitness,      'fitness',       'Fitness Certificate');
      const registrationUrl = await uploadFile(docs.registration, 'registration',  'Vehicle Registration');

      setError('Saving your profile...');
      await setDoc(doc(db,'drivers',cred.user.uid), {
        name:form.name, trn:form.trn, dob:form.dob, phone:form.phone, email:form.email,
        vehicleMake:form.make, vehicleModel:form.model, licensePlate:form.plate,
        status:'pending', role:'driver', createdAt:serverTimestamp(),
        docs:{ license:licenseUrl, fitness:fitnessUrl, registration:registrationUrl },
      });
      setError('');
      go('driver-pending');
    } catch(err) {
      console.error('Signup error:', err);
      if (err.code === 'auth/email-already-in-use') setError('Email already registered.');
      else if (err.code === 'storage/unauthorized') setError('Upload failed: Storage permission denied. Please contact support.');
      else if (err.code === 'storage/canceled') setError('Upload was cancelled. Please try again.');
      else setError(err.message || 'Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div style={s.content}>
      <TopBar title="Driver Registration" onBack={() => go('role')} go={go} user={user}/>
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
          <div key={k}>
            <input type="file" id={`doc-${k}`} accept="image/*,application/pdf" style={{ display:'none' }}
              onChange={e => { if (e.target.files?.[0]) setDocs(p => ({ ...p, [k]: e.target.files[0] })); }}/>
            <div onClick={() => document.getElementById(`doc-${k}`).click()} style={docs[k]?s.uploadOk:s.uploadBox}>
              <div style={{ fontSize:24, marginBottom:6 }}>{docs[k]?'✅':'📄'}</div>
              <div style={{ fontSize:12, color:docs[k]?GREEN:'rgba(255,255,255,0.4)', fontWeight:docs[k]?500:400 }}>
                {docs[k] ? `${lbl} ✓` : `Tap to upload ${lbl}`}
              </div>
              {docs[k] && <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{docs[k].name}</div>}
            </div>
          </div>
        ))}
      {(!docs.license||!docs.fitness||!docs.registration) && (
  <div style={{ background:'rgba(226,75,74,0.1)', border:'0.5px solid rgba(226,75,74,0.3)', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#f09595' }}>
    ⚠️ Please upload all 3 documents to continue
  </div>
)}
{Object.values(form).some(v => !v) && (
  <div style={{ background:'rgba(226,75,74,0.1)', border:'0.5px solid rgba(226,75,74,0.3)', borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, color:'#f09595' }}>
    ⚠️ Please fill in all fields above to continue
  </div>
)}
<button
  style={{ ...s.btnY, marginTop:8, opacity:(loading||Object.values(form).some(v=>!v)||!docs.license||!docs.fitness||!docs.registration)?0.4:1 }}
  onClick={handleSubmit}
  disabled={loading||Object.values(form).some(v=>!v)||!docs.license||!docs.fitness||!docs.registration}>
  {loading?'Submitting...':'Submit Application'}
</button>
      </div>
    </div>
  );
}

// ── DRIVER PENDING ────────────────────────────────────────────────────────────
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
        <img src="/villecabs-logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
        <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs</span>
      </div>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:100 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:WHITE, marginBottom:4 }}>Terms & Agreements</h2>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20 }}>Please read and agree to continue</p>

        {/* Terms Box */}
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:18, marginBottom:16, maxHeight:300, overflowY:'auto' }}>
          <div style={{ fontSize:14, fontWeight:600, color:YELLOW, marginBottom:12 }}>VilleCabs Terms of Service</div>
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
            ['10. Contact', 'For questions or concerns contact us via WhatsApp at 876-280-4292 or email daviskeneile@gmail.com'],
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
          <img src="/villecabs-logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
          <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs</span>
        </div>
        <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>{step+1} of {tips.length}</span>
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
      <TopBar title="About VilleCabs" onBack={() => go('customer-dash')} go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/villecabs-logo.png" alt="VilleCabs" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(232,180,0,0.4)', marginBottom:12 }}/>
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
          <div style={{ fontSize:14, fontWeight:600, color:YELLOW, marginBottom:10 }}>Why Choose VilleCabs?</div>
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
          <div>📞 Call / WhatsApp: <a href="https://wa.me/18762804292" style={{ color:YELLOW, textDecoration:'none' }}>876-280-4292</a></div>
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
      <div style={s.topBar}><button style={s.backBtn} onClick={() => go('customer-dash')}>←</button><span style={s.topTitle}>Contact Support</span></div>
      <div style={{ padding:'14px 16px 0' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
          {[
            ['💬','WhatsApp',  () => window.open('https://wa.me/18762804292','_blank')],
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
            <a href="https://wa.me/18762804292" target="_blank" rel="noopener noreferrer"
              style={{ fontSize:13, color:YELLOW, textDecoration:'none' }}>876-280-4292</a>
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
      <TopBar title="Help & Info" onBack={() => go('customer-dash')} go={go} user={user}/>
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
      <style>{`
        @keyframes driveAcross { 0% { transform: translateX(0); } 100% { transform: translateX(110vw); } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
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
      <style>{`@keyframes autoScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

function CustomerDash({ go, user, setUser }) {
  const [tab,        setTab]        = useState('book');
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [history,    setHistory]    = useState([]);
  const [loadingH,   setLoadingH]   = useState(true);
  const [activeRide, setActiveRide] = useState(null);
  const [rideNotif, setRideNotif] = useState(null);
  const prevStatusRef = useRef(null);
  const handleLogout = async () => { _manualNavDone = false; await signOut(auth); setUser(null); go('splash'); };

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
              icon: '/villecabs-logo.png',
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
              icon: '/villecabs-logo.png',
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
            icon: '/villecabs-logo.png',
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
            icon: '/villecabs-logo.png',
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
      <div style={{ background:'rgba(10,15,35,0.92)', padding:'12px 16px', backdropFilter:'blur(10px)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'0.5px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setMenuOpen(true)} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ width:24, height:2.5, background:WHITE, borderRadius:2 }}/>
          <div style={{ width:18, height:2.5, background:WHITE, borderRadius:2 }}/>
          <div style={{ width:24, height:2.5, background:WHITE, borderRadius:2 }}/>
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src="/logo.png" alt="VilleCabs" onClick={() => setTab('book')} style={{ height:26, width:'auto', objectFit:'contain', cursor:'pointer' }}/>
        </div>
        <div style={{ display:'flex', gap:5, marginLeft:'auto', alignItems:'center' }}>
          <button onClick={() => go('business')} style={{ padding:'3px 8px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'rgba(255,255,255,0.8)', fontSize:10, fontWeight:600, cursor:'pointer' }}>Business</button>
          <button onClick={() => go('featured')} style={{ padding:'3px 8px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:12, color:'rgba(255,255,255,0.8)', fontSize:10, fontWeight:600, cursor:'pointer' }}>Featured</button>
          {activeRide && <div onClick={() => go('live-ride')} style={{ background:GREEN, borderRadius:14, padding:'3px 8px', fontSize:10, color:WHITE, cursor:'pointer', fontWeight:600 }}>🚕 Live</div>}
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
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:10 }}>{user?.email}</div>
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

      <style>{`@keyframes slideInLeft { from { transform:translateX(-100%); opacity:0; } to { transform:translateX(0); opacity:1; } }`}</style>

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
                <button onClick={() => go('live-ride')} style={{ background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:500 }}>Track →</button>
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
                <button onClick={() => go('live-ride')} style={{ background:YELLOW, color:DARK, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:700 }}>View →</button>
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
              <button onClick={() => go('live-ride')} style={{ background:GREEN, color:WHITE, border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', fontWeight:500 }}>Track →</button>
            </div>
          )}
          {activeRide && !rideNotif && (
            <div style={{ background:'rgba(232,180,0,0.1)', border:'0.5px solid rgba(232,180,0,0.3)', margin:'10px 14px 0', borderRadius:12, padding:12, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={() => go('live-ride')}>
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
      <div style={s.topBar}><button style={s.backBtn} onClick={() => go('customer-dash')}>←</button><span style={s.topTitle}>My Profile</span></div>
      <div style={{ background:'linear-gradient(135deg, #0f1a35 0%, #1a2744 100%)', padding:'24px 20px 28px', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(232,180,0,0.2)', border:'2px solid rgba(232,180,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, margin:'0 auto 12px' }}>👤</div>
        <div style={{ fontSize:20, fontWeight:700, color:'#ffffff', marginBottom:2 }}>{user?.name}</div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:10 }}>{user?.email}</div>
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

  const handleLogout = async () => { _manualNavDone = false; await signOut(auth); setUser(null); go('splash'); };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Settings" onBack={() => go('customer-dash')} go={go} user={user}/>
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
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)' }}>You will receive updates when your driver accepts your ride and when the ride is completed.</div>
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
  const [query,       setQuery]       = useState(value||'');
  const [suggestions, setSuggestions] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [showDrop,    setShowDrop]    = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const debounceRef   = useRef(null);
  const svcRef        = useRef(null);
  const detailSvcRef  = useRef(null);
  const tokenRef      = useRef(null);

  // Wait for Google Maps to be available
  useEffect(() => {
    const check = () => {
      if (window.google?.maps?.places) {
        svcRef.current      = new window.google.maps.places.AutocompleteService();
        detailSvcRef.current= new window.google.maps.places.PlacesService(document.createElement('div'));
        tokenRef.current    = new window.google.maps.places.AutocompleteSessionToken();
        setGoogleReady(true);
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  }, []);

  const fetchSuggestions = (input) => {
    if (!input || input.length < 2 || !svcRef.current) { setSuggestions([]); return; }
    setLoading(true);
    svcRef.current.getPlacePredictions({
      input,
      sessionToken: tokenRef.current,
      location: new window.google.maps.LatLng(18.0417, -77.5071),
      radius: 25000,
      componentRestrictions: { country: 'jm' },
    }, (results, status) => {
      setLoading(false);
      if (status === 'OK' && results) {
        setSuggestions(results.slice(0, 6));
        setShowDrop(true);
      } else {
        setSuggestions([]);
      }
    });
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (onChange) onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  const handleSelect = (prediction) => {
    if (!detailSvcRef.current) return;
    setQuery(prediction.description);
    setSuggestions([]);
    setShowDrop(false);
    detailSvcRef.current.getDetails({
      placeId: prediction.place_id,
      sessionToken: tokenRef.current,
      fields: ['name','formatted_address','geometry','place_id'],
    }, (place, status) => {
      if (status === 'OK' && place) {
        const result = {
          name:             place.name,
          formattedAddress: place.formatted_address,
          placeId:          place.place_id,
          lat:              place.geometry.location.lat(),
          lng:              place.geometry.location.lng(),
        };
        setQuery(place.formatted_address || place.name);
        if (onChange) onChange(place.formatted_address || place.name);
        if (onPlaceSelect) onPlaceSelect(result);
        if (window.google?.maps?.places) {
          tokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      }
    });
  };

  return (
    <div style={{ position:'relative', zIndex:20 }}>
      <div style={{ position:'relative' }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, pointerEvents:'none' }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (suggestions.length > 0) setShowDrop(true); }}
          onBlur={() => setTimeout(() => setShowDrop(false), 200)}
          placeholder={!googleReady ? 'Loading search...' : (placeholder || 'Search address, road or landmark')}
          style={{ width:'100%', padding:'12px 12px 12px 38px', background:'#ffffff', border:'1.5px solid #d0d3e0', borderRadius:10, fontSize:14, color:'#1a1a2e', boxSizing:'border-box', outline:'none', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}
        />
        {loading && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#888' }}>…</span>}
      </div>
      {showDrop && suggestions.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', overflow:'hidden', zIndex:30 }}>
          {suggestions.map((p, i) => (
            <div key={i} onMouseDown={() => handleSelect(p)}
              style={{ padding:'11px 14px', cursor:'pointer', borderBottom: i < suggestions.length-1 ? '1px solid #f0f1f5' : 'none', display:'flex', alignItems:'flex-start', gap:10 }}
              onMouseEnter={e => e.currentTarget.style.background='#f5f6fa'}
              onMouseLeave={e => e.currentTarget.style.background='#ffffff'}>
              <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>📍</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{p.structured_formatting?.main_text || p.description.split(',')[0]}</div>
                <div style={{ fontSize:11, color:'#888aaa', marginTop:1 }}>{p.structured_formatting?.secondary_text || p.description}</div>
              </div>
            </div>
          ))}
          <div style={{ padding:'6px 14px', fontSize:10, color:'#bbb', textAlign:'right', borderTop:'1px solid #f0f1f5' }}>Powered by Google</div>
        </div>
      )}
      {showDrop && query.length > 2 && suggestions.length === 0 && !loading && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#888aaa', zIndex:30 }}>
          No results — try a road, landmark, or district name
        </div>
      )}
    </div>
  );
}



function PinPickup({ go, setPickupData, user }) {
  const [pinPos,      setPinPos]      = useState(MANCHESTER_CENTER);
  const [address,     setAddress]     = useState('');
  const [note,        setNote]        = useState('');
  const [loading,     setLoading]     = useState(false);
  const [passengers,  setPassengers]  = useState(1);

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
    setPinPos({ lat: place.lat, lng: place.lng });
    setAddress(place.formattedAddress || place.name);
  };

  const handleConfirm = () => {
    const finalAddress = note.trim() ? `${address} — ${note.trim()}` : address;
    setPickupData({ coords:pinPos, address: finalAddress, passengers });
    go('pin-dropoff');
  };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Pin Pickup Location" onBack={() => go('customer-dash')} go={go} user={user}/>
      {/* Address search autocomplete */}
      <div style={{ padding:'10px 14px', background:'#ffffff', borderBottom:'1px solid #e2e4ed' }}>
        <AddressAutocompleteInput
          value={address}
          onChange={setAddress}
          onPlaceSelect={handlePlaceSelect}
          placeholder="Search pickup address, road or landmark"
        />
      </div>
      <VilleMap height={300} center={pinPos||MANCHESTER_CENTER} zoom={14} onClick={handleMapClick}
        markers={[{ position:pinPos, title:'Pickup' }]} expandable={true}/>
      <div style={{ padding:16 }}>
        <div style={{ background:'rgba(26,158,90,0.1)', border:'0.5px solid rgba(26,158,90,0.3)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#9fe1cb' }}>
          📍 Tap anywhere on the map to pin your exact pickup location
        </div>
        <label style={s.lbl}>Pinned address</label>
        <input style={s.inp} value={loading ? 'Getting address...' : address} onChange={e => setAddress(e.target.value)}/>
        <label style={s.lbl}>District / Road / Landmark <span style={{ color:'rgba(255,255,255,0.3)', fontWeight:400 }}>(optional)</span></label>
        <input style={s.inp} placeholder="e.g. Hatfield district, top of Caledonia Road, near the blue gate..." value={note} onChange={e => setNote(e.target.value)}/>
        {/* Passenger counter */}
        <div style={{ background:'#111111', border:'none', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>👥 Number of Passengers</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:3 }}>Including yourself</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <button
                onClick={() => setPassengers(p => Math.max(1, p - 1))}
                style={{ width:38, height:38, borderRadius:'50%', background:passengers<=1?'rgba(255,255,255,0.05)':'rgba(232,180,0,0.15)', border:`1.5px solid ${passengers<=1?'rgba(255,255,255,0.1)':'rgba(232,180,0,0.4)'}`, color:passengers<=1?'rgba(255,255,255,0.3)':YELLOW, fontSize:20, fontWeight:700, cursor:passengers<=1?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                −
              </button>
              <div style={{ fontSize:24, fontWeight:700, color:WHITE, minWidth:24, textAlign:'center' }}>{passengers}</div>
              <button
                onClick={() => setPassengers(p => Math.min(6, p + 1))}
                style={{ width:38, height:38, borderRadius:'50%', background:passengers>=6?'rgba(255,255,255,0.05)':'rgba(232,180,0,0.15)', border:`1.5px solid ${passengers>=6?'rgba(255,255,255,0.1)':'rgba(232,180,0,0.4)'}`, color:passengers>=6?'rgba(255,255,255,0.3)':YELLOW, fontSize:20, fontWeight:700, cursor:passengers>=6?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                +
              </button>
            </div>
          </div>
          {passengers > 1 && (
            <div style={{ marginTop:10, padding:'8px 10px', background:'rgba(232,180,0,0.08)', borderRadius:8, fontSize:12, color:'rgba(232,180,0,0.9)' }}>
              ⚡ {passengers >= 5 ? 'VilleXL recommended for your group' : `${passengers} passengers — driver will be notified`}
            </div>
          )}
        </div>

        <button style={{ ...s.btnY, background:'#111111', color:'#ffffff' }} onClick={handleConfirm}>Confirm Pickup</button>
      </div>

      {/* ── PICKUP PAGE BANNERS ── */}
      <div style={{ padding:'20px 16px 0', background:'#f5f6fa' }}>

        {/* Tip 1: Accuracy */}
        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>📍</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>Pin Your Exact Location</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Place your pickup pin as close as possible to where you are standing. This helps your driver find you quickly and ensures your fare is calculated accurately based on the real distance.</div>
          </div>
        </div>

        {/* Tip 2: Rural areas */}
        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>🏘️</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>In a Rural Area?</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>If you're on an unnamed road or in a district not on the map, use the <strong style={{color:'#ffffff'}}>"Additional Details"</strong> field below your pickup pin to describe your location — e.g. "Top of Caledonia Road, near the blue gate, Hatfield district."</div>
          </div>
        </div>

        {/* Tip 3: Last trip */}
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>🕐 Quick Tip — Returning Customer?</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>You can view your past trips under <strong>My Rides</strong> in the menu. Favourite locations? Just pin the same spot — the map remembers where you last looked!</div>
        </div>

        {/* Tip 4: Chat */}
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>💬 Chat With Your Driver</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>Once a driver accepts your ride, you can chat directly with them in the app to share extra directions, confirm your spot, or confirm your estimated fare before the ride starts.</div>
        </div>
      </div>
    </div>
  );
}

// ── PIN DROPOFF ───────────────────────────────────────────────────────────────
function PinDropoff({ go, pickupData, setDropoffData, user }) {
  const [pinPos,  setPinPos]  = useState({ lat:18.02, lng:-77.48 });
  const [address, setAddress] = useState('');
  const [note,    setNote]    = useState('');
  const [loading, setLoading] = useState(false);

  const handlePlaceSelect = (place) => {
    setPinPos({ lat: place.lat, lng: place.lng });
    setAddress(place.formattedAddress || place.name);
  };

  const suggestions_legacy = [
    { address:'Manchester Market, Mandeville', coords:{ lat:18.0416, lng:-77.5036 } },
    { address:'Spaldings, Manchester',          coords:{ lat:18.1102, lng:-77.4608 } },
    { address:'Christiana, Manchester',         coords:{ lat:18.1667, lng:-77.5000 } },
    { address:'Porus, Manchester',              coords:{ lat:18.0167, lng:-77.4167 } },
    { address:'Mandeville Hospital',            coords:{ lat:18.0452, lng:-77.5082 } },
    { address:'Caledonia Road, Mandeville',     coords:{ lat:18.0380, lng:-77.5120 } },
  ];

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
    const finalAddress = note.trim() ? `${address} — ${note.trim()}` : address;
    setDropoffData({ coords:pinPos, address: finalAddress });
    go('vehicle-select');
  };

  const markers = [];
  if (pickupData?.coords) markers.push({ position:pickupData.coords, title:'Pickup' });
  if (address) markers.push({ position:pinPos, title:'Drop-off' });

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Pin Drop-off Location" onBack={() => go('pin-pickup')} go={go} user={user}/>
      {/* Address search autocomplete */}
      <div style={{ padding:'10px 14px', background:'#ffffff', borderBottom:'1px solid #e2e4ed' }}>
        <AddressAutocompleteInput
          value={address}
          onChange={setAddress}
          onPlaceSelect={handlePlaceSelect}
          placeholder="Where are you going? Search address or landmark"
        />
      </div>
      <div style={{ background:'#111111', padding:'12px 16px', display:'flex', gap:10, alignItems:'flex-start' }}>
        <span style={{ fontSize:18, flexShrink:0 }}>🛡️</span>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'#e8b400', marginBottom:2 }}>Safety & Accuracy</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', lineHeight:1.5 }}>Pin your drop-off as precisely as possible. Use the "Additional Details" field to add landmarks — e.g. "Blue gate, top of hill." Your driver will appreciate it!</div>
        </div>
      </div>
      <VilleMap height={300} center={MANCHESTER_CENTER} zoom={12} onClick={handleMapClick} markers={markers} expandable={true}/>
      <div style={{ padding:16 }}>
        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'rgba(232,180,0,0.9)' }}>
          🏁 Tap the map or choose a location below
        </div>
        {address && (
          <div style={{ marginBottom:12 }}>
            <label style={s.lbl}>Pinned address</label>
            <input style={s.inp} value={loading ? 'Getting address...' : address} onChange={e => setAddress(e.target.value)}/>
            <label style={s.lbl}>District / Road / Landmark <span style={{ color:'rgba(255,255,255,0.3)', fontWeight:400 }}>(optional)</span></label>
            <input style={s.inp} placeholder="e.g. Hatfield district, top of Caledonia Road, near the blue gate..." value={note} onChange={e => setNote(e.target.value)}/>
          </div>
        )}
        <div style={{ background:'rgba(15,20,40,0.6)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, overflow:'hidden', marginBottom:14 }}>
          {(suggestions_legacy||[]).map((sug,i) => (
            <div key={i} onClick={() => { const fa = note.trim() ? `${sug.address} — ${note.trim()}` : sug.address; setDropoffData({ coords:sug.coords, address:fa }); go('vehicle-select'); }}
              style={{ padding:'11px 14px', fontSize:13, color:'rgba(255,255,255,0.8)', borderBottom:'0.5px solid rgba(255,255,255,0.08)', cursor:'pointer' }}>
              📍 {sug.address}
            </div>
          ))}
        </div>
        <button style={{ ...s.btnY, background:'#111111', color:'#ffffff', opacity:!address?0.5:1 }} onClick={handleConfirm} disabled={!address}>Confirm Drop-off</button>
      </div>

      {/* ── DROPOFF PAGE BANNERS ── */}
      <div style={{ padding:'20px 16px 0', background:'#f5f6fa' }}>

        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>🗺️</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>Pin Your Drop-off Precisely</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Tap exactly where you want to be dropped off. The more accurate your pin, the better your driver can plan the route and the more accurate your fare will be.</div>
          </div>
        </div>

        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>✏️</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>Add Landmark Details</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Use the <strong style={{color:'#ffffff'}}>"Additional Details"</strong> field to describe your drop-off point — e.g. "Opposite Mandeville Regional Hospital, green building on the right." This helps your driver drop you at the right spot.</div>
          </div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>🛡️ Your Safety Matters</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>During your ride, you can use the <strong>SOS button</strong> at any time if you feel unsafe. Hold it for 5 seconds to send an emergency alert with your location to our admin team immediately.</div>
        </div>

        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>💰 Negotiate Your Fare</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>Once a driver accepts, chat with them to agree on the final fare before the ride. The app shows a suggested price based on distance — but you and your driver can confirm before riding.</div>
        </div>
      </div>
    </div>
  );
}

// ── VEHICLE SELECT ────────────────────────────────────────────────────────────
function VehicleSelect({ go, user, pickupData, dropoffData, setBookingId }) {
  const [sel,        setSel]        = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
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

  const handleBook = async () => {
    setLoading(true); setError('');
    try {
      const v = vehicles[sel];
      const price      = calcPrice(v);
      const finalPrice = calcFinalPrice(v);
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
    <div style={{ ...s.content, background:'transparent' }}>
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
        {surcharge && (
          <div style={{ background:'rgba(226,75,74,0.12)', border:'1.5px solid rgba(226,75,74,0.4)', borderRadius:10, padding:'10px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:18 }}>{surcharge.key==='night'?'🌙':surcharge.key==='holiday'?'🎉':'⚡'}</span>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#f09595' }}>{surcharge.label}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Added to your estimated fare</div>
            </div>
          </div>
        )}
        {(() => { const bd = fareBreakdown(v); return (
          <div style={{ background:'#111111', borderRadius:12, padding:14, margin:'10px 0' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
              <span>Base Fare ({dist} km)</span>
              <span style={{ color:WHITE, fontWeight:500 }}>J${bd.baseFare.toLocaleString()}</span>
            </div>
            {bd.surchargeAmt > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
                <span style={{ color:'#f09595' }}>{bd.surchargeLabel}</span>
                <span style={{ color:'#f09595', fontWeight:500 }}>+J${bd.surchargeAmt.toLocaleString()}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:600, color:'#e8b400', borderTop:'0.5px solid rgba(255,255,255,0.15)', paddingTop:8, marginTop:4 }}>
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
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:8, fontWeight:500 }}>🎟️ Promo Code</div>
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
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', textDecoration:'line-through' }}>J${calcPrice(v).toLocaleString()}</div>
              <div style={{ fontSize:15, fontWeight:700, color:GREEN }}>J${calcFinalPrice(v).toLocaleString()} after {promoData.discount}% off</div>
            </div>
            <div style={{ fontSize:22 }}>🎉</div>
          </div>
        )}

        <button style={{ ...s.btnY, background:'#111111', color:'#ffffff', opacity:loading?0.7:1 }} onClick={handleBook} disabled={loading}>
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
    </div>
  );
}

// ── BOOKING CONFIRM ──────────────────────────────────────────────────────────
function BookingConfirm({ go, bookingId, user }) {
  const [booking,   setBooking]   = useState(null);
  const [payment,   setPayment]   = useState('cash');
  const [step,      setStep]      = useState('select'); // 'select' | 'card-form'
  const [processing,setProcessing]= useState(false);
  const [cardError, setCardError] = useState('');
  const [cardPaid,  setCardPaid]  = useState(false);
  const [stripe,    setStripe]    = useState(null);
  const [elements,  setElements]  = useState(null);
  const cardElementRef = useRef(null);
  const stripeKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
  const jmdToUsd  = (jmd) => ((jmd || 0) / 157).toFixed(2);

  useEffect(() => {
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
              icon: '/villecabs-logo.png',
            });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') {
                new Notification('🚗 Driver found!', {
                  body: `${data.driverName||'Your driver'} is on the way!`,
                  icon: '/villecabs-logo.png',
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
              icon: '/villecabs-logo.png',
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

  // Load Stripe Elements when card form is shown
  useEffect(() => {
    if (step !== 'card-form' || !stripeKey || !stripeKey.startsWith('pk_')) return;
    const loadStripeElements = async () => {
      console.log('Stripe not available');
    };
    loadStripeElements();
  }, [step, stripeKey]);

  // ── Payment success ───────────────────────────────────────────────────────
  if (cardPaid) {
    return (
      <div style={{ ...s.content, background:'transparent', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:24 }}>
        <div style={{ fontSize:72, marginBottom:16 }}>✅</div>
        <h2 style={{ fontSize:22, fontWeight:500, color:WHITE, marginBottom:8 }}>Payment successful!</h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.5)', marginBottom:6 }}>J${booking?.fare?.toLocaleString()} (≈ ${jmdToUsd(booking?.fare)} USD) charged to your card</p>
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, marginBottom:28, width:'100%', maxWidth:320 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
            <span style={{ color:'rgba(255,255,255,0.5)' }}>Amount (JMD)</span>
            <span style={{ color:WHITE }}>J${booking?.fare?.toLocaleString()}</span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
            <span style={{ color:'rgba(255,255,255,0.5)' }}>Charged (USD)</span>
            <span style={{ color:GREEN, fontWeight:500 }}>≈ ${jmdToUsd(booking?.fare)} USD</span>
          </div>
        </div>
        <button style={{ ...s.btnY, maxWidth:320 }} onClick={() => go('live-ride')}>Track your ride →</button>
      </div>
    );
  }

  // ── Card form with Stripe Elements ───────────────────────────────────────
  if (step === 'card-form') {
    return (
      <div style={{ ...s.content, background:'transparent' }}>
        <TopBar title="Card Payment" onBack={() => { setStep('select'); setCardError(''); }}/>
        <div style={{ padding:16, maxWidth:420, margin:'0 auto' }}>

          {/* Amount banner */}
          <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:12, padding:14, marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>Amount to charge</span>
              <span style={{ fontSize:20, fontWeight:700, color:YELLOW }}>J${booking?.fare?.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>Charged to your card in USD</span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>≈ ${jmdToUsd(booking?.fare)} USD</span>
            </div>
          </div>

          {/* Mode banner */}
          {(!stripeKey || !stripeKey.startsWith('pk_')) ? (
            <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'rgba(232,180,0,0.8)' }}>
              ⚠️ Demo mode — no real charge. Add REACT_APP_STRIPE_PUBLISHABLE_KEY to Vercel to enable live payments.
            </div>
          ) : (
            <div style={{ background:'rgba(26,158,90,0.08)', border:'0.5px solid rgba(26,158,90,0.2)', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#9fe1cb' }}>
              🔒 Secured by Stripe — your card details are encrypted
            </div>
          )}

          {/* Stripe Elements card input OR demo form */}
          <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:14, padding:16, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:500, color:WHITE }}>Card Details</div>
              <div style={{ display:'flex', gap:6 }}>
                {['VISA','MC','AMEX'].map(b => (
                  <span key={b} style={{ background:'rgba(255,255,255,0.07)', borderRadius:6, padding:'3px 8px', fontSize:10, color:'rgba(255,255,255,0.5)' }}>{b}</span>
                ))}
              </div>
            </div>

            {cardError && <div style={s.errBox}>⚠️ {cardError}</div>}

            {stripeKey && stripeKey.startsWith('pk_') ? (
              // Real Stripe Elements input
              <div>
                <label style={s.lbl}>Card details</label>
                <div ref={cardElementRef} style={{ background:'rgba(255,255,255,0.08)', border:'0.5px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'14px 14px', marginBottom:14, minHeight:44 }}/>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:4, display:'flex', alignItems:'center', gap:4 }}>
                  🔒 256-bit SSL encrypted · Powered by Stripe
                </div>
              </div>
            ) : (
              // Demo mode inputs
              <div>
                <label style={s.lbl}>Card Number (demo)</label>
                <input style={{ ...s.inp, letterSpacing:2 }} placeholder="4242 4242 4242 4242" defaultValue="4242 4242 4242 4242"/>
                <div style={{ display:'flex', gap:12 }}>
                  <div style={{ flex:1 }}><label style={s.lbl}>Expiry</label><input style={s.inp} placeholder="12/28" defaultValue="12/28"/></div>
                  <div style={{ flex:1 }}><label style={s.lbl}>CVV</label><input style={s.inp} placeholder="123" defaultValue="123"/></div>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:4 }}>⚠️ Demo mode — no real charge will be made</div>
              </div>
            )}
          </div>

          {/* Fare summary */}
          <div style={{ background:DARK, borderRadius:12, padding:14, marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
              <span>Ride fare</span><span>J${booking?.fare?.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
              <span>Processing fee</span><span>J$0</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:500, color:'#e8b400', borderTop:'0.5px solid rgba(255,255,255,0.15)', paddingTop:8, marginTop:4 }}>
              <span>Total (JMD)</span><span>J${booking?.fare?.toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:4 }}>
              <span>Charged to card (USD)</span><span>≈ ${jmdToUsd(booking?.fare)} USD</span>
            </div>
          </div>

          <button style={{ ...s.btnY, opacity:processing?0.7:1, fontSize:15 }}
            onClick={handleCardPay} disabled={processing}>
            {processing ? '⏳ Processing payment...' : `Pay J$${booking?.fare?.toLocaleString()} (≈ $${jmdToUsd(booking?.fare)} USD)`}
          </button>
          <button style={s.btnO} onClick={() => { setStep('select'); setCardError(''); }}>
            ← Change payment method
          </button>
        </div>
      </div>
    );
  }

  // ── Payment method selection ──────────────────────────────────────────────
  return (
    <div style={{ ...s.content }}>
      <TopBar title="Confirm Booking" onBack={() => go('vehicle-select')} go={go} user={user}/>
      {/* What to look for */}
      <div style={{ background:'#111111', padding:'12px 16px', display:'flex', gap:10, alignItems:'flex-start' }}>
        <span style={{ fontSize:18, flexShrink:0 }}>👀</span>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'#e8b400', marginBottom:2 }}>What to Look For</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', lineHeight:1.5 }}>When your driver arrives — check the <strong style={{color:'#ffffff'}}>licence plate number</strong>, <strong style={{color:'#ffffff'}}>car colour</strong>, and <strong style={{color:'#ffffff'}}>driver photo</strong> in the app before getting in. Your safety comes first!</div>
        </div>
      </div>
      <div style={{ padding:16 }}>

        {/* Booking summary */}
        {booking && (
          <div style={{ background:'rgba(15,20,40,0.65)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:16, marginBottom:16 }}>
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

        <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:12, color:'#888aaa' }}>Payment method</div>

        {/* Cash - active */}
        <div style={{ border:`2px solid ${YELLOW}`, borderRadius:14, padding:'16px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:14, background:'rgba(232,180,0,0.1)' }}>
          <div style={{ fontSize:32 }}>💵</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#1a1a2e' }}>Cash</div>
            <div style={{ fontSize:12, color:'#555770', marginTop:2 }}>Pay your driver directly on arrival</div>
          </div>
          <div style={{ width:22, height:22, borderRadius:'50%', background:YELLOW, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:DARK, fontWeight:700 }}>✓</div>
        </div>

        {/* Card - coming soon */}
        <div style={{ border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:'16px 14px', marginBottom:20, display:'flex', alignItems:'center', gap:14, background:'rgba(255,255,255,0.03)', opacity:0.55 }}>
          <div style={{ fontSize:32 }}>💳</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'rgba(255,255,255,0.5)' }}>Card Payment</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Coming soon</div>
          </div>
          <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:20, padding:'3px 12px', fontSize:11, color:'#aaa', fontWeight:500 }}>Soon</div>
        </div>

        <div style={{ background:'#f5f6fa', border:'1px solid #e2e4ed', borderRadius:12, padding:14, marginBottom:16, fontSize:13, color:'#444', lineHeight:1.6 }}>
          💵 You will pay <strong style={{ color:'#1a1a2e' }}>J${booking?.fare?.toLocaleString()}</strong> in cash directly to your driver when you arrive at your destination.
        </div>

        <button style={{ ...s.btnY, background:'#111111', color:'#ffffff' }} onClick={handleConfirm}>Confirm — Pay Cash</button>
        <button style={s.btnO} onClick={() => go('customer-dash')}>Cancel</button>
      </div>

      {/* ── CONFIRM BOOKING BANNERS ── */}
      <div style={{ padding:'16px 16px 0', background:'#f5f6fa' }}>
        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>👀</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>Verify Your Driver</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>When your driver arrives check the <strong style={{color:'#ffffff'}}>licence plate number</strong>, <strong style={{color:'#ffffff'}}>car colour and make</strong>, and <strong style={{color:'#ffffff'}}>driver photo</strong> in the app before getting in. Never enter a vehicle if these do not match.</div>
          </div>
        </div>
        <div style={{ background:'#111111', borderRadius:16, padding:'18px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>📲</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e8b400', marginBottom:6 }}>Share Your Trip</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Once your ride starts use the <strong style={{color:'#ffffff'}}>"Share Trip"</strong> button on the tracking screen to send your live ride details to a friend or family member.</div>
          </div>
        </div>
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>💬 Confirm Fare With Your Driver</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>Estimated fares may vary based on route changes, traffic conditions, and additional stops. Use the in-app chat to confirm details with your driver.</div>
        </div>
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>💵 Cash Payment Only</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>Pay your driver directly in cash at the end of your trip. Have the correct amount or small bills ready. Card and online payment coming soon.</div>
        </div>
        <div style={{ background:'#ffffff', border:'1px solid #e2e4ed', borderRadius:16, padding:'18px', marginBottom:20, boxShadow:'0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e', marginBottom:10 }}>⭐ Rate Your Driver After</div>
          <div style={{ fontSize:12, color:'#666888', lineHeight:1.7 }}>After your trip you will be asked to rate your driver. Your feedback helps maintain high standards on VilleCabs.</div>
        </div>
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
      <style>{`
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity:0.6; } 50% { transform: scale(1.15); opacity:1; } }
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}

function LiveRide({ go, bookingId, user }) {
  const [booking,   setBooking]   = useState(null);
  const [rating,    setRating]    = useState(0);
  const [rated,     setRated]     = useState(false);
  const [driverInfo,setDriverInfo]= useState(null);
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
              icon: '/villecabs-logo.png',
            });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission().then(perm => {
              if (perm === 'granted') {
                new Notification('🚗 Driver found!', {
                  body: `${data.driverName||'Your driver'} is on the way!`,
                  icon: '/villecabs-logo.png',
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
              icon: '/villecabs-logo.png',
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
  const [forceUpdate, setForceUpdate] = useState(0);
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
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', margin:0 }}>You have arrived safely</p>
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
        <VilleMap height={typeof window!=='undefined'?Math.max(320,window.innerHeight*0.45):320} center={driverCoords||pickupCoords} zoom={15} expandable={true}>
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
          {booking?.status==='active'
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
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>
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
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>Drivers in Manchester are being notified</div>
            <button onClick={cancelRide} disabled={cancelling}
              style={{ marginTop:14, padding:'9px 24px', background:'rgba(226,75,74,0.15)', border:'1px solid rgba(226,75,74,0.4)', borderRadius:10, color:'#f09595', fontSize:13, cursor:'pointer', opacity:cancelling?0.6:1 }}>
              {cancelling ? 'Cancelling...' : '✕ Cancel Ride'}
            </button>
          </div>
        )}

        {/* Driver arrived in-screen alert */}
        {booking?.driverArrived && !booking?.enrouteToDropoff && booking?.status === 'active' && (
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
        <img src="/villecabs-logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
        <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>VilleCabs — Driver Agreement</span>
      </div>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:100 }}>
        <h2 style={{ fontSize:20, fontWeight:600, color:WHITE, marginBottom:4 }}>Driver Terms & Agreement</h2>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20 }}>Please read carefully before driving with VilleCabs</p>

        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:14, padding:18, marginBottom:16, maxHeight:320, overflowY:'auto' }}>
          <div style={{ fontSize:14, fontWeight:600, color:YELLOW, marginBottom:12 }}>VilleCabs Driver Agreement</div>
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
          <img src="/villecabs-logo.png" alt="V" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover' }}/>
          <span style={{ color:WHITE, fontSize:16, fontWeight:600 }}>Driver Guide</span>
        </div>
        <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>{step+1} of {tips.length}</span>
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
      <TopBar title="About VilleCabs" onBack={() => go('driver-dash')} go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/villecabs-logo.png" alt="VilleCabs" style={{ width:80, height:80, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(232,180,0,0.4)', marginBottom:12 }}/>
          <h2 style={{ fontSize:20, fontWeight:700, color:WHITE, marginBottom:4 }}>Welcome to VilleCabs</h2>
          <p style={{ fontSize:13, color:YELLOW, fontStyle:'italic' }}>Your city. Your ride. Your way.</p>
        </div>
        {[
          'VilleCabs is a modern ride-hailing and taxi platform built for the people of Mandeville, Manchester, Jamaica. Created to bring convenience, reliability, and opportunity to our community.',
          "We are bringing the ease and flexibility of app-based transportation to Mandeville while supporting local drivers and creating new earning opportunities within our parish.",
        ].map((t,i) => <p key={i} style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.8, marginBottom:14 }}>{t}</p>)}
        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.25)', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:600, color:YELLOW, marginBottom:10 }}>Driver Earnings</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.8 }}>
            You keep <strong style={{ color:GREEN }}>85%</strong> of every fare. VilleCabs charges a <strong style={{ color:YELLOW }}>15% monthly platform fee</strong> settled at the end of each month.
          </div>
        </div>
        <div style={{ background:'rgba(15,20,40,0.7)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14, fontSize:13, color:'rgba(255,255,255,0.6)', lineHeight:2 }}>
          <div>📍 Serving Mandeville & Manchester, Jamaica</div>
          <div>🌐 villecabs.com</div>
          <div>📞 Call / WhatsApp: <a href="https://wa.me/18762804292" style={{ color:YELLOW, textDecoration:'none' }}>876-280-4292</a></div>
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
      <TopBar title="Contact Us" onBack={() => go('driver-dash')} go={go} user={user}/>
      <div style={{ padding:'20px 18px', maxWidth:480, margin:'0 auto', paddingBottom:40 }}>
        <div style={{ background:'rgba(232,180,0,0.08)', border:'0.5px solid rgba(232,180,0,0.2)', borderRadius:12, padding:14, marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:28 }}>💬</span>
          <div>
            <div style={{ fontSize:13, color:WHITE, fontWeight:500 }}>WhatsApp us directly</div>
            <a href="https://wa.me/18762804292" target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:YELLOW, textDecoration:'none' }}>876-280-4292</a>
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
      <TopBar title="Help & Info" onBack={() => go('driver-dash')} go={go} user={user}/>
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
  const [rides,       setRides]       = useState([]);
  const [driverTab,   setDriverTab]   = useState('home');
  const [menuOpen,    setMenuOpen]    = useState(false);
  const [isOnline,    setIsOnline]    = useState(false);
  const [notifStatus, setNotifStatus] = useState("idle");
  const [loading,     setLoading]     = useState(true);
  const [earnings,    setEarnings]    = useState({ today:0, week:0, month:0, total:0, todayRides:0, weekRides:0, monthRides:0, totalRides:0, history:[] });
  const handleLogout = async () => { _manualNavDone = false; await signOut(auth); setUser(null); go('splash'); };

  const goOnline = async () => {
    setIsOnline(true);
    setDriverTab('rides');
    try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:true, lastOnline:serverTimestamp() }); } catch(e) {}
    if (notifStatus === 'idle') requestNotifPermission();
  };

  const goOffline = async () => {
    setIsOnline(false);
    setDriverTab('home');
    try { await updateDoc(doc(db,'drivers',user.uid), { isOnline:false }); } catch(e) {}
  };

  useEffect(() => {
    const q = query(collection(db,'bookings'), where('status','==','searching'));
    let prevCount = 0;
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      const filtered = all.filter(r =>
        r.status === 'searching' &&
        !r.declinedBy?.includes(user?.uid) &&
        !r.driverId
      );
      filtered.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      if (filtered.length > prevCount && prevCount > 0) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const playBell = (freq, time) => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq; osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime + time);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.8);
            osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.8);
          };
          playBell(880,0); playBell(1100,0.2); playBell(1320,0.4);
        } catch(e) {}
      }
      prevCount = filtered.length;
      setRides(filtered);
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

  const declineRide = async (rideId) => {
    try {
      // (statically imported)
      await updateDoc(doc(db,'bookings',rideId), { declinedBy: arrayUnion(user.uid) });
    } catch(err) { console.error('Decline error:', err); }
  };

  const acceptRide = async (rideId) => {
    try {
      const rideSnap = await getDoc(doc(db,'bookings',rideId));
      if (!rideSnap.exists() || rideSnap.data().status !== 'searching' || rideSnap.data().driverId) {
        alert('Sorry, this ride was already accepted by another driver.'); return;
      }
      // Fetch driver vehicle info to save on booking for customer safety
      const dSnap = await getDoc(doc(db,'drivers',user.uid));
      const dData = dSnap.exists() ? dSnap.data() : {};
      // Write driverId first to claim the ride atomically
      await updateDoc(doc(db,'bookings',rideId), { driverId: user.uid });
      // Verify we got it (no one else claimed it in the same instant)
      const verifySnap = await getDoc(doc(db,'bookings',rideId));
      if (verifySnap.data()?.driverId !== user.uid) {
        alert('Sorry, this ride was already accepted by another driver.'); return;
      }
      await updateDoc(doc(db,'bookings',rideId), {
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
    <div style={{ ...s.content, background:'transparent', minHeight:'100vh' }}>
      {/* Top header — white */}
      <div style={{ background:'#ffffff', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', boxShadow:'0 1px 6px rgba(0,0,0,0.06)', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => setMenuOpen(true)} style={{ background:'none', border:'none', cursor:'pointer', padding:'3px 5px', display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
          <div style={{ width:22, height:2, background:'#1a1a2e', borderRadius:1 }}/>
          <div style={{ width:16, height:2, background:'#1a1a2e', borderRadius:1 }}/>
          <div style={{ width:22, height:2, background:'#1a1a2e', borderRadius:1 }}/>
        </button>
        <img src="/logo.png" alt="VilleCabs" style={{ height:28, objectFit:'contain', flexShrink:0 }}/>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, background:isOnline?'rgba(26,158,90,0.1)':'rgba(150,150,150,0.1)', border:`1px solid ${isOnline?'rgba(26,158,90,0.4)':'rgba(150,150,150,0.3)'}` }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:isOnline?'#1a9e5a':'#999' }}/>
            <span style={{ fontSize:11, fontWeight:700, color:isOnline?'#1a9e5a':'#888' }}>{isOnline?'Online':'Offline'}</span>
          </div>
        </div>
      </div>
      {/* Spacer removed — using position sticky now */}
      <div style={{ display:'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src="/logo.png" alt="VilleCabs" onClick={() => setTab('book')} style={{ height:26, width:'auto', objectFit:'contain', cursor:'pointer' }}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ background:isOnline?GREEN:'#e8eaf0', borderRadius:20, padding:'5px 12px', fontSize:11, color:isOnline?WHITE:'#555770', fontWeight:500 }}>
            {isOnline ? '● Online' : '○ Offline'}
          </div>
        </div>
      </div>

      {/* Side drawer */}
      {menuOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:100 }}>
          <div onClick={() => setMenuOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)' }}/>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:280, background:'#ffffff', borderRight:'1px solid #e2e4ed', display:'flex', flexDirection:'column', boxShadow:'4px 0 24px rgba(0,0,0,0.12)' }}>
            <div style={{ padding:'24px 18px 16px', borderBottom:'1px solid #e2e4ed' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <img src="/villecabs-logo.png" alt="V" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(232,180,0,0.4)' }}/>
                <button onClick={() => setMenuOpen(false)} style={{ background:'#f0f1f5', border:'1px solid #e2e4ed', color:'#1a1a2e', width:32, height:32, borderRadius:'50%', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
              <div style={{ fontSize:16, fontWeight:600, color:'#1a1a2e' }}>{user?.name}</div>
              <div style={{ fontSize:12, color:'#888aaa', marginTop:2 }}>{user?.email}</div>
              <div style={{ display:'inline-block', marginTop:8, background:'rgba(26,158,90,0.15)', color:GREEN, borderRadius:20, padding:'3px 12px', fontSize:11, fontWeight:500 }}>✓ Approved Driver</div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
              {[
                ['🏠','Home',           () => { setDriverTab('home');     setMenuOpen(false); }],
                ['💰','Earnings',       () => { setDriverTab('earnings'); setMenuOpen(false); }],
                ['👤','My Profile',     () => { go('driver-profile');     setMenuOpen(false); }],
                ['⚙️','Settings',       () => { go('driver-settings');    setMenuOpen(false); }],
                ['ℹ️','About VilleCabs',() => { go('driver-about');       setMenuOpen(false); }],
                ['📬','Contact Us',     () => { go('driver-contact');     setMenuOpen(false); }],
                ['❓','Help & Info',    () => { go('driver-help');        setMenuOpen(false); }],
              ].map(([icon,label,action],i) => (
                <div key={i} onClick={action}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.paddingLeft='22px'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.paddingLeft='18px'; }}
                  style={{ padding:'13px 18px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'all 0.15s ease' }}>
                  <span style={{ fontSize:20, width:28, textAlign:'center' }}>{icon}</span>
                  <span style={{ fontSize:14, color:'#1a1a2e' }}>{label}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:16, borderTop:'1px solid #e2e4ed', display:'flex', flexDirection:'column', gap:8 }}>
              {isOnline
                ? <button onClick={() => { goOffline(); setMenuOpen(false); }} style={{ width:'100%', padding:11, background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:10, color:'rgba(255,255,255,0.6)', fontSize:13, cursor:'pointer' }}>○ Go Offline</button>
                : <button onClick={() => { goOnline(); setMenuOpen(false); }} style={{ width:'100%', padding:11, background:GREEN, border:'none', borderRadius:10, color:WHITE, fontSize:13, fontWeight:600, cursor:'pointer' }}>● Go Online</button>
              }
              <button onClick={handleLogout} style={{ width:'100%', padding:11, background:'rgba(226,75,74,0.12)', border:'0.5px solid rgba(226,75,74,0.3)', borderRadius:10, color:'#f09595', fontSize:13, cursor:'pointer' }}>🚪 Log Out</button>
            </div>
          </div>
        </div>
      )}

      {/* HOME tab — offline/online dashboard */}
      {driverTab === 'home' && (
        <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f6fa' }}>

          {/* Greeting header */}
          <div style={{ background:'#ffffff', padding:'18px 16px 16px', borderBottom:'1px solid #f0f0f0' }}>
            <div style={{ fontSize:13, color:'#888', marginBottom:2 }}>Good day,</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#1a1a2e', marginBottom:14 }}>{user?.name?.split(' ')[0]||'Driver'} 👋</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background:isOnline?'#1a9e5a':'#9ca3af', animation:isOnline?'pulse 2s ease-in-out infinite':'none' }}/>
              <span style={{ fontSize:13, fontWeight:600, color:isOnline?'#1a9e5a':'#9ca3af' }}>{isOnline?'Online — Accepting requests':'Offline'}</span>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ padding:'14px 16px 0' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <div style={{ background:'#fff', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)', borderLeft:'3px solid #6b21a8' }}>
                <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>Today's Earnings</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#6b21a8' }}>J${earnings.today.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{earnings.todayRides} ride{earnings.todayRides!==1?'s':''}</div>
              </div>
              <div style={{ background:'#fff', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)', borderLeft:'3px solid #1a9e5a' }}>
                <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>This Week</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#1a9e5a' }}>J${earnings.week.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{earnings.weekRides} ride{earnings.weekRides!==1?'s':''}</div>
              </div>
              <div style={{ background:'#fff', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>Rating</div>
                <div style={{ fontSize:22, fontWeight:800, color:'#1a1a2e' }}>⭐ {earnings.totalRides>0?'5.0':'—'}</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{earnings.totalRides} total rides</div>
              </div>
              <div style={{ background:'#fff', borderRadius:14, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>All Time</div>
                <div style={{ fontSize:20, fontWeight:800, color:'#1a1a2e' }}>J${earnings.total.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>Net (85%)</div>
              </div>
            </div>

            {/* Peak hours alert */}
            {(()=>{ const h=new Date().getHours(),d=new Date().getDay(); return d>=1&&d<=5&&h>=17&&h<19; })() && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:12, padding:'11px 14px', marginBottom:10, display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:20 }}>⚡</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#b45309' }}>Peak Hours Active</div>
                  <div style={{ fontSize:11, color:'#92400e', marginTop:1 }}>More riders may be requesting trips right now.</div>
                </div>
              </div>
            )}

            {/* Go online/offline */}
            {isOnline ? (
              <div>
                <div style={{ background:'#f0fff4', border:'1px solid #9de', borderRadius:14, padding:'16px', marginBottom:10, textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#1a7a45', marginBottom:4 }}>🟢 You are Online</div>
                  <div style={{ fontSize:12, color:'#555', marginBottom:0 }}>Waiting for ride requests · New bookings appear here instantly</div>
                </div>
                <button onClick={goOffline} style={{ width:'100%', padding:'14px', background:'#fff', border:'1.5px solid #e2e4ed', borderRadius:14, color:'#555', fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:10 }}>
                  ○ Go Offline
                </button>
              </div>
            ) : (
              <button onClick={goOnline} style={{ width:'100%', padding:'16px', background:'#1a9e5a', border:'none', borderRadius:14, color:'#ffffff', fontSize:16, fontWeight:800, cursor:'pointer', marginBottom:10, boxShadow:'0 4px 14px rgba(26,158,90,0.4)' }}>
                ● Go Online
              </button>
            )}
          </div>

          {/* Tips */}
          <div style={{ padding:'0 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.5, marginBottom:10 }}>Driver Tips</div>
            <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:6 }}>
              {[
                { icon:'🔋', tip:'Keep your phone charged while online' },
                { icon:'👋', tip:'Greet passengers by name on arrival' },
                { icon:'📍', tip:'Confirm pickup before starting trip' },
                { icon:'🛡️', tip:'Contact support if something feels unsafe' },
                { icon:'⭐', tip:'Great service earns better ratings' },
              ].map((t,i)=>(
                <div key={i} style={{ flexShrink:0, width:180, background:'#fff', border:'1px solid #e9d5ff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>{t.icon}</div>
                  <div style={{ fontSize:11, color:'#555770', lineHeight:1.5 }}>{t.tip}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {driverTab === 'rides' && (
        <div style={{ flex:1, overflowY:'auto', paddingBottom:90, background:'#f5f6fa' }}>
          <div style={{ padding:'14px 14px 10px' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1a1a2e', marginBottom:12 }}>Ride History</div>
            {rides.filter(r=>r.status==='completed').length === 0 && (
              <div style={{ textAlign:'center', padding:40 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🚕</div>
                <div style={{ fontSize:14, color:'#888' }}>No completed rides yet</div>
                <div style={{ fontSize:12, color:'#aaa', marginTop:4 }}>Go online to start receiving ride requests</div>
              </div>
            )}
            {rides.filter(r=>r.status==='completed').sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map((r,i) => {
              const d   = new Date((r.createdAt?.seconds||0)*1000);
              const net = Math.round((r.fare||0)*0.85);
              return (
                <div key={i} style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>👤 {r.customerName||'Passenger'}</div>
                      <div style={{ fontSize:11, color:'#888', marginTop:1 }}>{d.toLocaleDateString()} · {d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8' }}>J${net.toLocaleString()}</div>
                      <div style={{ fontSize:10, color:'#aaa' }}>Fare: J${(r.fare||0).toLocaleString()}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:11, color:'#555', marginBottom:2 }}>📍 {(r.pickup?.address||'').split(',')[0]}</div>
                  <div style={{ fontSize:11, color:'#555', marginBottom:8 }}>🏁 {(r.dropoff?.address||'').split(',')[0]}</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {r.distanceKm && <span style={{ fontSize:10, background:'#f3f4f6', color:'#555', padding:'2px 8px', borderRadius:8 }}>📏 {r.distanceKm} km</span>}
                    <span style={{ fontSize:10, background:'#f0fff4', color:'#1a9e5a', padding:'2px 8px', borderRadius:8 }}>💵 {r.paymentMethod||'Cash'}</span>
                    <span style={{ fontSize:10, background:'#f9f5ff', color:'#6b21a8', padding:'2px 8px', borderRadius:8 }}>✅ Completed</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
            <div style={{ background:'rgba(15,20,40,0.65)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>This month</div>
              <div style={{ fontSize:22, fontWeight:500, color:'#fff' }}>J${earnings.month.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{earnings.monthRides} ride{earnings.monthRides!==1?'s':''}</div>
            </div>
            <div style={{ background:'rgba(15,20,40,0.65)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:12, padding:14, textAlign:'center' }}>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>All time</div>
              <div style={{ fontSize:22, fontWeight:500, color:'#fff' }}>J${earnings.total.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{earnings.totalRides} ride{earnings.totalRides!==1?'s':''}</div>
            </div>
          </div>

          {/* Platform fee breakdown */}
          <div style={{ background:'rgba(232,180,0,0.08)', border:'1px solid rgba(232,180,0,0.2)', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginBottom:8, fontWeight:600 }}>💰 Earnings Breakdown</div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
              <span style={{ color:'rgba(255,255,255,0.5)' }}>Total Fare Collected</span>
              <span style={{ color:WHITE }}>J${Math.round(earnings.total / 0.85).toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
              <span style={{ color:'#f09595' }}>VilleCabs Fee (15%)</span>
              <span style={{ color:'#f09595' }}>−J${Math.round(earnings.total * 0.15 / 0.85).toLocaleString()}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, borderTop:'0.5px solid rgba(255,255,255,0.1)', paddingTop:6, marginTop:4 }}>
              <span style={{ color:'#1a9e5a' }}>Your Net Earnings (85%)</span>
              <span style={{ color:'#1a9e5a' }}>J${earnings.total.toLocaleString()}</span>
            </div>
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
            <div key={ride.id||i} style={{ background:'rgba(15,20,40,0.6)', border:'0.5px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:10 }}>
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


      {/* ── BOTTOM NAV ── */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#0f1a35', borderTop:'1px solid rgba(255,255,255,0.1)', display:'flex', zIndex:50, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {[
          { icon:'🏠', label:'Home',     tab:'home'     },
          { icon:'🚗', label:'Rides',    tab:'rides'    },
          { icon:'💰', label:'Earnings', tab:'earnings' },
          { icon:'📋', label:'Docs',     tab:'docs'     },
          { icon:'👤', label:'Profile',  tab:'profile'  },
        ].map(({ icon, label, tab }) => (
          <button key={tab} onClick={() => { if(tab==='profile') go('driver-profile'); else if(tab==='earnings') go('driver-earnings'); else if(tab==='docs') go('driver-documents'); else setDriverTab(tab); }}
            style={{ flex:1, padding:'10px 0', background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
            <div style={{ fontSize:20, opacity: driverTab===tab ? 1 : 0.4 }}>{icon}</div>
            <div style={{ fontSize:10, color: driverTab===tab ? '#e8b400' : 'rgba(255,255,255,0.4)', fontWeight: driverTab===tab ? 700 : 400 }}>{label}</div>
            {driverTab===tab && <div style={{ width:4, height:4, borderRadius:'50%', background:'#e8b400', marginTop:1 }}/>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── DRIVER ACTIVE ─────────────────────────────────────────────────────────────
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

  // ── Completed screen ──
  if (completed) {
    const fare = booking?.fare || 0;
    const fee  = Math.round(fare * 0.15);
    const earn = Math.round(fare * 0.85);
    return (
      <div style={{ ...s.content, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, minHeight:'100vh' }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:'rgba(26,158,90,0.15)', border:'2px solid #1a9e5a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:800, color:WHITE, marginBottom:4 }}>Ride Completed!</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:24 }}>Thank you for driving with VilleCabs</div>
        <div style={{ background:'rgba(15,20,40,0.8)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:18, padding:20, width:'100%', maxWidth:380, marginBottom:20 }}>
          {[
            ['Total Fare', `J$${fare.toLocaleString()}`, WHITE],
            ['VilleCabs Fee (15%)', `−J$${fee.toLocaleString()}`, '#f09595'],
            ['Your Earnings (85%)', `J$${earn.toLocaleString()}`, '#1a9e5a'],
            ['Payment', booking?.paymentMethod || 'Cash', YELLOW],
          ].map(([label, val, col], i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom: i<3 ? '0.5px solid rgba(255,255,255,0.07)' : 'none' }}>
              <span style={{ fontSize:13, color:'rgba(255,255,255,0.55)' }}>{label}</span>
              <span style={{ fontSize:14, fontWeight:700, color:col }}>{val}</span>
            </div>
          ))}
        </div>
        <button onClick={() => go('driver-dash')} style={{ width:'100%', maxWidth:380, padding:'15px', background:'#1a9e5a', border:'none', borderRadius:14, color:'#fff', fontSize:15, fontWeight:700, cursor:'pointer', marginBottom:10 }}>🟢 Back Online</button>
        <button onClick={() => { go('driver-dash'); }} style={{ width:'100%', maxWidth:380, padding:'12px', background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:14, color:'rgba(255,255,255,0.5)', fontSize:13, cursor:'pointer' }}>Go Offline</button>
      </div>
    );
  }

  const pickupCoords  = booking?.pickup       ? { lat:booking.pickup.lat,         lng:booking.pickup.lng         } : MANCHESTER_CENTER;
  const dropoffCoords = booking?.dropoff       ? { lat:booking.dropoff.lat,        lng:booking.dropoff.lng        } : null;
  const driverCoords  = booking?.driverLocation? { lat:booking.driverLocation.lat, lng:booking.driverLocation.lng } : null;
  const markers = [{ position:pickupCoords, title:'Pickup' }];
  if (dropoffCoords) markers.push({ position:dropoffCoords, title:'Drop-off' });

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
        <button onClick={() => go('driver-dash')} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
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

  const handleLogout = async () => { _manualNavDone = false; await signOut(auth); setUser(null); go('splash'); };

  return (
    <div style={{ ...s.content, background:'transparent' }}>
      <TopBar title="Settings" onBack={() => go('driver-dash')} go={go} user={user}/>
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
        <button style={s.backBtn} onClick={goBack}>←</button>
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
        <button style={s.backBtn} onClick={() => go('customer-dash')}>←</button>
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
        <button style={s.backBtn} onClick={() => go('customer-dash')}>←</button>
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
        <button style={s.backBtn} onClick={() => go('customer-dash')}>←</button>
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
      <TopBar title="Business" onBack={() => go(user?'customer-dash':'splash')} go={go} user={user}/>
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
        <p style={{ fontSize:12, color:'#888aaa' }}>📧 admin@villecabs.com · 📞 876-280-4292</p>
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
      <TopBar title="Featured" onBack={() => go(user?'customer-dash':'splash')} go={go} user={user}/>
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
const MAP_BG_SCREENS = new Set(['splash','role','customer-signup','customer-login','otp','driver-signup','driver-pending','driver-login','customer-dash','pin-pickup','pin-dropoff','vehicle-select','booking-confirm','live-ride','driver-dash','driver-active','driver-profile','driver-settings','customer-profile','customer-settings','chat']);

// Prevent auth handler from re-navigating after manual login
let _manualNavDone = false;

// Error boundary to catch runtime crashes
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
          <div style={{ fontSize:13, color:'#666', marginBottom:8 }}>{this.state.error?.message||'Unknown error'}</div>
          <button onClick={() => { this.setState({ hasError:false }); window.location.reload(); }}
            style={{ padding:'12px 24px', background:'#0f1a35', color:'#fff', border:'none', borderRadius:10, fontSize:14, cursor:'pointer', marginTop:16 }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── PARTNER WITH VILLECABS PAGE ───────────────────────────────────────────────
function PartnerWithUs({ go, user }) {
  const [form, setForm] = useState({ bizName:'', bizType:'', contact:'', phone:'', email:'', address:'', website:'', message:'' });
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k,v) => setForm(p => ({...p,[k]:v}));
  const submit = async () => {
    if (!form.bizName||!form.email||!form.phone) { setError('Please fill in all required fields.'); return; }
    setSaving(true); setError('');
    try {
      await addDoc(collection(db,'partnerRequests'), {...form, status:'new', createdAt:serverTimestamp()});
      setSent(true);
    } catch(e) { setError('Failed to submit. Please try again.'); }
    setSaving(false);
  };
  return (
    <div style={{ background:'#ffffff', minHeight:'100vh' }}>
      <div style={{ background:'#ffffff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => go(user?'customer-dash':'splash')} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
        <img src="/logo.png" style={{ height:28, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:6 }}>Partner With VilleCabs</span>
      </div>
      <div style={{ background:'linear-gradient(135deg,#6b21a8,#4c1d95)', padding:'32px 20px', textAlign:'center' }}>
        <h1 style={{ fontSize:24, fontWeight:800, color:'#fff', margin:'0 0 8px' }}>Partner With VilleCabs</h1>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.8)', margin:'0 0 20px' }}>Grow your business. We will drive the customers.</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => document.getElementById('pform')?.scrollIntoView({behavior:'smooth'})} style={{ padding:'11px 20px', background:'#fff', color:'#6b21a8', border:'none', borderRadius:22, fontSize:13, fontWeight:700, cursor:'pointer' }}>Become a Partner</button>
          <button onClick={() => go('contact-us')} style={{ padding:'11px 20px', background:'transparent', color:'#fff', border:'2px solid rgba(255,255,255,0.4)', borderRadius:22, fontSize:13, fontWeight:600, cursor:'pointer' }}>Contact Us</button>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'20px 16px' }}>
        {['🏨 Hotels','🍽️ Restaurants','🏡 Guest Houses','🎭 Attractions','🏢 Businesses','🎉 Clubs','🛒 Supermarkets','🎫 Events'].map((c,i) => (
          <div key={i} style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:12, padding:'12px', textAlign:'center', fontSize:13, fontWeight:600, color:'#1a1a2e' }}>{c}</div>
        ))}
      </div>
      <div id="pform" style={{ padding:'16px' }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:'#1a1a2e', margin:'0 0 14px' }}>Submit Partner Request</h2>
        {sent ? (
          <div style={{ textAlign:'center', padding:24 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#1a1a2e', marginBottom:6 }}>Request Received!</div>
            <div style={{ fontSize:13, color:'#555' }}>Thank you. VilleCabs will contact you about partnership opportunities.</div>
          </div>
        ) : (
          <div>
            {error && <div style={{ background:'#fff0f0', border:'1px solid #fcc', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#cc2222', marginBottom:12 }}>{error}</div>}
            {[['Business Name *','bizName','e.g. Golf View Hotel'],['Business Type *','bizType','e.g. Hotel, Restaurant'],['Contact Person','contact','Full name'],['Phone *','phone','876-XXX-XXXX'],['Email *','email','your@email.com'],['Address','address','Mandeville, Manchester'],['Website','website','Optional']].map(([l,k,p]) => (
              <div key={k}>
                <label style={{ fontSize:12, fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>{l}</label>
                <input value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={p} style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #e2e4ed', borderRadius:10, fontSize:14, marginBottom:12, boxSizing:'border-box', outline:'none' }}/>
              </div>
            ))}
            <label style={{ fontSize:12, fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Message</label>
            <textarea value={form.message} onChange={e=>set('message',e.target.value)} rows={3} placeholder="Tell us about your business..." style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #e2e4ed', borderRadius:10, fontSize:14, marginBottom:14, boxSizing:'border-box', outline:'none', resize:'vertical' }}/>
            <button onClick={submit} disabled={saving} style={{ width:'100%', padding:'13px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:12, fontSize:14, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>{saving?'Submitting...':'Submit Partner Request'}</button>
            <p style={{ textAlign:'center', fontSize:12, color:'#888', marginTop:12 }}>📧 admin@villecabs.com · 📞 876-280-4292</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DRIVER EARNINGS PAGE ──────────────────────────────────────────────────────
function DriverEarnings({ go, user }) {
  const [rides,   setRides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [period,  setPeriod]  = useState('week');
  const [detail,  setDetail]  = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    getDocs(query(collection(db,'bookings'), where('driverId','==',user.uid), where('status','==','completed')))
      .then(snap => {
        setRides(snap.docs.map(d => ({id:d.id,...d.data()}))
          .sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart  = new Date(todayStart.getTime() - 6*86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const filtered = rides.filter(r => {
    const d = new Date((r.createdAt?.seconds||0)*1000);
    if (period==='today') return d >= todayStart;
    if (period==='week')  return d >= weekStart;
    return d >= monthStart;
  });

  const totalFare = filtered.reduce((s,r) => s+(r.fare||0), 0);
  const driverNet = Math.round(totalFare * 0.85);
  const vcFee     = Math.round(totalFare * 0.15);
  const avgFare   = filtered.length ? Math.round(totalFare/filtered.length) : 0;

  // Detail modal
  if (detail) {
    const fare = detail.fare||0;
    return (
      <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
        <div style={{ background:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', position:'sticky', top:0, zIndex:10 }}>
          <button onClick={() => setDetail(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
          <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
          <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>Ride Details</span>
        </div>
        <div style={{ padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:18, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#6b21a8', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }}>Fare Breakdown</div>
            {[
              ['Total Fare',          `J$${fare.toLocaleString()}`,                    '#1a1a2e'],
              ['VilleCabs Fee (15%)', `-J$${Math.round(fare*0.15).toLocaleString()}`,  '#dc2626'],
              ['You Earned (85%)',    `J$${Math.round(fare*0.85).toLocaleString()}`,   '#6b21a8'],
            ].map(([l,v,c],i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:i<2?'1px solid #f0f0f0':'none' }}>
                <span style={{ fontSize:13, color:'#555' }}>{l}</span>
                <span style={{ fontSize:14, fontWeight:700, color:c }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ background:'#fff', borderRadius:16, padding:18, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 }}>
            <div style={{ fontSize:11, color:'#6b21a8', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:12 }}>Ride Details</div>
            {[
              ['Passenger',  detail.customerName||'—'],
              ['Pickup',     detail.pickup?.address||'—'],
              ['Drop-off',   detail.dropoff?.address||'—'],
              ['Distance',   detail.distanceKm ? detail.distanceKm+' km' : '—'],
              ['Payment',    detail.paymentMethod||'Cash'],
              ['Status',     'Completed'],
              ['Date',       new Date((detail.createdAt?.seconds||0)*1000).toLocaleString()],
            ].map(([l,v],i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:i<6?'1px solid #f0f0f0':'none', gap:12 }}>
                <span style={{ fontSize:12, color:'#888', flexShrink:0 }}>{l}</span>
                <span style={{ fontSize:12, fontWeight:600, color:'#1a1a2e', textAlign:'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => go('driver-dash')} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>Earnings</span>
      </div>

      {/* Period selector */}
      <div style={{ display:'flex', gap:8, padding:'12px 16px', background:'#fff', borderBottom:'1px solid #f0f0f0' }}>
        {[['today','Today'],['week','This Week'],['month','This Month']].map(([k,l]) => (
          <button key={k} onClick={() => setPeriod(k)}
            style={{ flex:1, padding:'8px', borderRadius:20, border:'none', background:period===k?'#6b21a8':'#f3f4f6', color:period===k?'#fff':'#555', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ padding:'14px 14px 0' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>You Earned</div>
            <div style={{ fontSize:24, fontWeight:800, color:'#6b21a8' }}>J${driverNet.toLocaleString()}</div>
            <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{filtered.length} trips</div>
          </div>
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>Total Fares</div>
            <div style={{ fontSize:24, fontWeight:800, color:'#1a1a2e' }}>J${totalFare.toLocaleString()}</div>
            <div style={{ fontSize:11, color:'#888', marginTop:2 }}>Avg J${avgFare.toLocaleString()}</div>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div style={{ background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:12, padding:'12px' }}>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>VilleCabs Fee</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#dc2626' }}>J${vcFee.toLocaleString()}</div>
          </div>
          <div style={{ background:'#f0fff4', border:'1px solid #86efac', borderRadius:12, padding:'12px' }}>
            <div style={{ fontSize:10, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:4 }}>Completed Trips</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#1a9e5a' }}>{filtered.length}</div>
          </div>
        </div>
        <div style={{ background:'#f9f5ff', border:'1px solid #e9d5ff', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#6b21a8', marginBottom:14 }}>
          💜 Drivers keep <strong>85%</strong> of every completed fare. VilleCabs keeps 15%.
        </div>
      </div>

      {/* Ride list */}
      <div style={{ padding:'0 14px 90px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#888', textTransform:'uppercase', letterSpacing:0.6, marginBottom:10 }}>Completed Rides</div>
        {loading && <div style={{ textAlign:'center', color:'#888', padding:24 }}>Loading...</div>}
        {!loading && filtered.length===0 && <div style={{ textAlign:'center', color:'#888', padding:24 }}>No rides in this period</div>}
        {filtered.map((r,i) => {
          const d   = new Date((r.createdAt?.seconds||0)*1000);
          const net = Math.round((r.fare||0)*0.85);
          return (
            <div key={i} onClick={() => setDetail(r)}
              style={{ background:'#fff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', cursor:'pointer' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>👤 {r.customerName||'Passenger'}</div>
                  <div style={{ fontSize:11, color:'#888', marginTop:2 }}>{d.toLocaleDateString()} · {d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:16, fontWeight:800, color:'#6b21a8' }}>J${net.toLocaleString()}</div>
                  <div style={{ fontSize:10, color:'#888' }}>of J${(r.fare||0).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ fontSize:11, color:'#555', marginBottom:2 }}>📍 {(r.pickup?.address||'').split(',')[0]}</div>
              <div style={{ fontSize:11, color:'#555', marginBottom:8 }}>🏁 {(r.dropoff?.address||'').split(',')[0]}</div>
              <div style={{ display:'flex', gap:6 }}>
                <span style={{ fontSize:10, background:'#f9f5ff', color:'#6b21a8', padding:'2px 8px', borderRadius:8 }}>Fee: J${Math.round((r.fare||0)*0.15).toLocaleString()}</span>
                <span style={{ fontSize:10, background:'#f0fff4', color:'#1a9e5a', padding:'2px 8px', borderRadius:8 }}>💵 {r.paymentMethod||'Cash'}</span>
                <span style={{ fontSize:10, color:'#6b21a8', marginLeft:'auto' }}>View →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DRIVER DOCUMENTS PAGE ─────────────────────────────────────────────────────
function DriverDocuments({ go, user }) {
  const [docs,   setDocs]   = useState({});
  const [saving, setSaving] = useState('');
  const [msg,    setMsg]    = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db,'drivers',user.uid)).then(snap => {
      if (snap.exists()) setDocs(snap.data().documents||{});
    });
  }, [user]);

  const docTypes = [
    { key:'licence',      label:"Driver's Licence",            icon:'🪪', required:true },
    { key:'fitness',      label:'Vehicle Fitness Certificate', icon:'📋', required:true },
    { key:'registration', label:'Vehicle Registration',        icon:'📄', required:true },
    { key:'insurance',    label:'Insurance Certificate',       icon:'🛡️', required:false },
    { key:'vehiclePhoto', label:'Vehicle Photo',               icon:'🚗', required:false },
    { key:'profilePhoto', label:'Driver Profile Photo',        icon:'📸', required:false },
  ];

  const handleUpload = async (key, file) => {
    if (!file || !user?.uid) return;
    setSaving(key); setMsg('');
    try {
      const docData = { status:'pending', name:file.name, uploadedAt:new Date().toISOString() };
      await updateDoc(doc(db,'drivers',user.uid), { [`documents.${key}`]:docData });
      setDocs(prev => ({ ...prev, [key]:docData }));
      setMsg('Document uploaded — pending review');
      setTimeout(() => setMsg(''), 3000);
    } catch(e) { console.error(e); }
    setSaving('');
  };

  const statusConfig = {
    approved:  { label:'✅ Approved',       color:'#1a9e5a', bg:'#f0fff4', border:'#86efac' },
    pending:   { label:'⏳ Pending Review', color:'#b45309', bg:'#fffbeb', border:'#fde047' },
    rejected:  { label:'❌ Needs Update',   color:'#dc2626', bg:'#fff0f0', border:'#fca5a5' },
    missing:   { label:'📤 Not Uploaded',   color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb' },
  };

  const allRequired = docTypes.filter(d => d.required);
  const uploadedRequired = allRequired.filter(d => docs[d.key]?.status && docs[d.key].status !== 'missing');
  const progress = Math.round((uploadedRequired.length / allRequired.length) * 100);

  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => go('driver-dash')} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>My Documents</span>
      </div>

      <div style={{ padding:'14px 14px 0' }}>
        {/* Progress bar */}
        <div style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:12, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>Document Progress</span>
            <span style={{ fontSize:13, fontWeight:700, color:'#6b21a8' }}>{uploadedRequired.length}/{allRequired.length} required</span>
          </div>
          <div style={{ background:'#f3f4f6', borderRadius:10, height:8, overflow:'hidden' }}>
            <div style={{ width:`${progress}%`, height:'100%', background:'#6b21a8', borderRadius:10, transition:'width 0.5s ease' }}/>
          </div>
        </div>

        {msg && <div style={{ background:'#f0fff4', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#1a9e5a', marginBottom:12 }}>{msg}</div>}

        <div style={{ background:'#fefce8', border:'1px solid #fde047', borderRadius:12, padding:'10px 14px', fontSize:12, color:'#854d0e', marginBottom:12 }}>
          🛡️ VilleCabs reviews all documents to help keep riders safe. Approved drivers can receive ride requests.
        </div>
      </div>

      <div style={{ padding:'0 14px 90px' }}>
        {docTypes.map(({ key, label, icon, required }) => {
          const d      = docs[key];
          const status = d?.status || 'missing';
          const cfg    = statusConfig[status] || statusConfig.missing;
          return (
            <div key={key} style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:cfg.bg, border:`1px solid ${cfg.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{label}</span>
                    {required && <span style={{ fontSize:9, background:'#fee2e2', color:'#dc2626', padding:'1px 6px', borderRadius:6, fontWeight:600 }}>Required</span>}
                  </div>
                  <div style={{ fontSize:12, color:cfg.color, fontWeight:600 }}>{cfg.label}</div>
                  {d?.uploadedAt && <div style={{ fontSize:10, color:'#aaa', marginTop:2 }}>Updated: {new Date(d.uploadedAt).toLocaleDateString()}</div>}
                  {d?.name && <div style={{ fontSize:10, color:'#888', marginTop:1 }}>{d.name}</div>}
                </div>
              </div>
              {status==='rejected' && (
                <div style={{ background:'#fff0f0', border:'1px solid #fca5a5', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#dc2626', marginBottom:10 }}>
                  Please upload a clearer or updated document.
                </div>
              )}
              <label style={{ display:'block', padding:'10px', background:status==='approved'?'#f9f5ff':'#6b21a8', color:status==='approved'?'#6b21a8':'#fff', borderRadius:10, fontSize:13, fontWeight:600, cursor:saving===key?'default':'pointer', textAlign:'center', opacity:saving===key?0.7:1 }}>
                {saving===key ? '⏳ Uploading...' : status==='approved' ? '🔄 Replace Document' : '📤 Upload Document'}
                <input type="file" accept="image/*,.pdf" style={{ display:'none' }} onChange={e => handleUpload(key, e.target.files[0])} disabled={saving===key}/>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DRIVER NOTIFICATIONS PAGE ─────────────────────────────────────────────────
function DriverNotifications({ go, user }) {
  const [notifs, setNotifs] = useState([
    { id:'1', type:'account', title:'Welcome to VilleCabs!',       message:'Complete your profile and documents to start receiving ride requests.', time:'Today',     read:false },
    { id:'2', type:'account', title:'Application Received',        message:'Your VilleCabs driver application is being reviewed by our team.',      time:'Today',     read:false },
    { id:'3', type:'safety',  title:'Safety Reminder',             message:'Always confirm passenger name before starting a trip.',                 time:'Yesterday', read:true  },
    { id:'4', type:'system',  title:'Welcome to Manchester!',      message:'VilleCabs is now live in Mandeville. Go online to receive your first ride.', time:'This week', read:true },
  ]);
  const [filter, setFilter] = useState('all');

  const typeIcon  = { ride:'🚕', account:'👤', safety:'🛡️', payment:'💰', system:'⚙️' };
  const typeColor = { ride:'#6b21a8', account:'#1a9e5a', safety:'#dc2626', payment:'#b45309', system:'#374151' };

  const filtered = filter==='all' ? notifs
    : filter==='unread' ? notifs.filter(n=>!n.read)
    : notifs.filter(n=>n.type===filter);

  const unreadCount = notifs.filter(n=>!n.read).length;

  const markAllRead = () => setNotifs(prev => prev.map(n => ({...n, read:true})));
  const markRead    = (id) => setNotifs(prev => prev.map(n => n.id===id ? {...n,read:true} : n));

  return (
    <div style={{ background:'#f5f6fa', minHeight:'100vh' }}>
      <div style={{ background:'#fff', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid #eee', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => go('driver-dash')} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#1a1a2e' }}>←</button>
        <img src="/logo.png" style={{ height:26, objectFit:'contain' }} alt="VilleCabs"/>
        <span style={{ fontSize:14, fontWeight:700, color:'#1a1a2e', marginLeft:4 }}>Notifications</span>
        {unreadCount>0 && <div style={{ background:'#6b21a8', color:'#fff', borderRadius:10, fontSize:10, fontWeight:700, padding:'2px 7px', marginLeft:2 }}>{unreadCount}</div>}
        <button onClick={markAllRead} style={{ marginLeft:'auto', background:'none', border:'none', fontSize:11, color:'#6b21a8', cursor:'pointer', fontWeight:600 }}>Mark all read</button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:6, padding:'10px 14px', background:'#fff', borderBottom:'1px solid #f0f0f0', overflowX:'auto', scrollbarWidth:'none' }}>
        {[['all','All'],['unread','Unread'],['ride','Rides'],['account','Account'],['safety','Safety'],['payment','Payments']].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:'none', background:filter===k?'#6b21a8':'#f3f4f6', color:filter===k?'#fff':'#555', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding:'12px 14px 90px' }}>
        {filtered.length===0 && (
          <div style={{ textAlign:'center', padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
            <div style={{ fontSize:14, color:'#888' }}>No notifications</div>
          </div>
        )}
        {filtered.map((n,i) => (
          <div key={i} onClick={() => markRead(n.id)}
            style={{ background:n.read?'#fff':'#f9f5ff', borderRadius:14, padding:14, marginBottom:10, boxShadow:'0 1px 6px rgba(0,0,0,0.06)', borderLeft:n.read?'3px solid transparent':`3px solid ${typeColor[n.type]||'#6b21a8'}`, cursor:'pointer' }}>
            <div style={{ display:'flex', gap:12 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:`${typeColor[n.type]||'#6b21a8'}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                {typeIcon[n.type]||'🔔'}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:3 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a1a2e' }}>{n.title}</div>
                  {!n.read && <div style={{ width:8, height:8, borderRadius:'50%', background:'#6b21a8', flexShrink:0, marginTop:3 }}/>}
                </div>
                <div style={{ fontSize:12, color:'#555', lineHeight:1.5, marginBottom:4 }}>{n.message}</div>
                <div style={{ fontSize:10, color:'#aaa' }}>{n.time}</div>
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
    const unsub = onAuthStateChanged(auth, async (fu) => {
      if (fu) {
        // Skip if user already manually logged in
        if (_manualNavDone) { setLoading(false); return; }
        // Safety timeout - never stay stuck on loading screen
        const safetyTimer = setTimeout(() => { setLoading(false); setScreen('splash'); }, 8000);
        try {
          const [cSnap, dSnap] = await Promise.all([
            getDoc(doc(db,'customers',fu.uid)),
            getDoc(doc(db,'drivers',fu.uid)),
          ]);
          // ── DRIVER FIRST ──────────────────────────────────────────────────
          if (dSnap.exists()) {
            const d = dSnap.data();
            if (d.status === 'approved') {
              setUser({ uid:fu.uid, name:d.name, email:fu.email, role:'driver' });
              try {
                const activeQ = query(collection(db,'bookings'), where('driverId','==',fu.uid), where('status','==','active'));
                const activeSnap = await getDocs(activeQ);
                if (!activeSnap.empty) {
                  setBookingId(activeSnap.docs[0].id);
                  setScreen('driver-active');
                } else if (!d.termsAccepted) { setScreen('driver-terms'); }
                else if (!d.tipsSeen) { setScreen('driver-welcome-tips'); }
                else { setScreen('driver-dash'); }
              } catch(e) { setScreen('driver-dash'); }
            } else if (d.status === 'pending') { setScreen('driver-pending'); }
            else { setScreen('driver-login'); }
          // ── CUSTOMER ──────────────────────────────────────────────────────
          } else if (cSnap.exists()) {
            const d = cSnap.data();
            if (!fu.emailVerified && fu.providerData[0]?.providerId === 'password') {
              setUser({ uid:fu.uid, name:d.name||fu.displayName, email:fu.email, role:'customer' });
              setScreen('otp');
            } else {
              setUser({ uid:fu.uid, name:d.name||fu.displayName, email:fu.email, role:'customer' });
              try {
                const q1 = query(collection(db,'bookings'), where('customerId','==',fu.uid), where('status','==','searching'));
                const q2 = query(collection(db,'bookings'), where('customerId','==',fu.uid), where('status','==','active'));
                const [s1,s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                const found = [...s1.docs, ...s2.docs];
                const twoHoursAgo = Date.now() / 1000 - 7200;
                const recentBooking = found.find(b => (b.data().createdAt?.seconds||0) > twoHoursAgo);
                if (recentBooking) { setBookingId(recentBooking.id); setScreen('live-ride'); }
                else if (!d.termsAccepted) { setScreen('terms'); }
                else if (!d.tipsSeen) { setScreen('welcome-tips'); }
                else { setScreen('customer-dash'); }
              } catch(e) { setScreen('customer-dash'); }
            }
          }
        } catch(e) { console.error('Auth restore error:', e); }
        finally { clearTimeout(safetyTimer); }
      } else {
        setTimeout(() => setLoading(false), 800);
        return;
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