import React, { useState } from 'react';

const YELLOW = '#e8b400';
const DARK = '#1a1a2e';
const GREEN = '#1a9e5a';
const WHITE = '#ffffff';

const styles = {
  screen: { minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", background: DARK, color: WHITE },
  mapBg: {
    position: 'fixed', inset: 0, zIndex: 0,
    background: DARK,
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1,
    background: 'rgba(15,25,50,0.72)',
    backdropFilter: 'blur(4px)',
  },
  content: { position: 'relative', zIndex: 2, minHeight: '100vh' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '0 24px' },
  card: { background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 380 },
  btnYellow: { width: '100%', padding: '14px 20px', background: YELLOW, color: DARK, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 },
  btnOutline: { width: '100%', padding: '14px 20px', background: 'transparent', color: WHITE, border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', marginBottom: 10 },
  btnDark: { width: '100%', padding: '14px 20px', background: DARK, color: WHITE, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  btnGreen: { width: '100%', padding: '14px 20px', background: GREEN, color: WHITE, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 10 },
  input: { width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 10, color: WHITE, fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 4, display: 'block', fontWeight: 500 },
  topBar: { background: 'rgba(26,26,46,0.95)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '0.5px solid rgba(255,255,255,0.1)' },
  backBtn: { background: 'none', border: 'none', color: YELLOW, fontSize: 22, cursor: 'pointer', padding: '2px 6px' },
  topTitle: { color: WHITE, fontSize: 16, fontWeight: 500 },
  link: { color: YELLOW, fontSize: 13, cursor: 'pointer', textAlign: 'center', marginTop: 8, background: 'none', border: 'none' },
  divider: { display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px', color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  sectionTitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  uploadBox: { border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: 'rgba(255,255,255,0.04)' },
  uploadBoxDone: { border: '1.5px dashed #1a9e5a', borderRadius: 10, padding: 14, textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: 'rgba(26,158,90,0.1)' },
  badge: { display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500 },
  pendingCard: { background: 'rgba(232,180,0,0.1)', border: '1.5px solid rgba(232,180,0,0.4)', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 20 },
};

function MapBackground() {
  return (
    <>
      <div style={styles.mapBg}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
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
          <line x1="0" y1="200" x2="800" y2="350" stroke={WHITE} strokeWidth="1.5" opacity="0.1"/>
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
      <div style={styles.overlay}/>
    </>
  );
}

function Logo({ size = 72 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: size * 0.5 }}>
      🚕
    </div>
  );
}

function TopBar({ title, onBack }) {
  return (
    <div style={styles.topBar}>
      {onBack && <button style={styles.backBtn} onClick={onBack}>←</button>}
      <span style={styles.topTitle}>{title}</span>
    </div>
  );
}

function Divider({ text = 'or' }) {
  return (
    <div style={styles.divider}>
      <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.15)' }}/>
      <span>{text}</span>
      <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.15)' }}/>
    </div>
  );
}

// ── SPLASH ────────────────────────────────────────────────────────────────────
function SplashScreen({ go }) {
  return (
    <div style={styles.content}>
      <div style={styles.center}>
        <Logo size={80}/>
        <h1 style={{ fontSize: 42, fontWeight: 700, letterSpacing: 3, margin: '0 0 8px', color: WHITE }}>VilleCabs</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, margin: '0 0 48px' }}>Manchester, Jamaica's ride service</p>
        <div style={{ width: '100%', maxWidth: 320 }}>
          <button style={styles.btnYellow} onClick={() => go('role')}>Get Started</button>
          <button style={styles.btnOutline} onClick={() => go('driver-login')}>Driver Login</button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 40 }}>Mandeville · Christiana · Spaldings · Porus</p>
      </div>
    </div>
  );
}

// ── ROLE SELECT ───────────────────────────────────────────────────────────────
function RoleSelect({ go }) {
  return (
    <div style={styles.content}>
      <TopBar title="Join VilleCabs" onBack={() => go('splash')}/>
      <div style={{ ...styles.center, paddingTop: 40 }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24, fontSize: 14 }}>How would you like to use VilleCabs?</p>
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div onClick={() => go('customer-signup')} style={{ ...styles.card, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>👤</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Book a Ride</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Request rides around Manchester</div>
          </div>
          <div onClick={() => go('driver-signup')} style={{ ...styles.card, cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🚗</div>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>Become a Driver</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Earn money driving in Manchester</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER SIGNUP ───────────────────────────────────────────────────────────
function CustomerSignup({ go }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div style={styles.content}>
      <TopBar title="Create Account" onBack={() => go('role')}/>
      <div style={{ padding: '24px 20px', maxWidth: 420, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Welcome to VilleCabs</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>Create your rider account</p>

        <button style={{ ...styles.btnOutline, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={() => go('otp')}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <Divider text="or sign up with email"/>
        <label style={styles.label}>Full Name</label>
        <input style={styles.input} placeholder="e.g. Kezia Brown" value={form.name} onChange={e => set('name', e.target.value)}/>
        <label style={styles.label}>Phone Number</label>
        <input style={styles.input} placeholder="+1 (876) 555-0100" value={form.phone} onChange={e => set('phone', e.target.value)}/>
        <label style={styles.label}>Email Address</label>
        <input style={styles.input} type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)}/>
        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" placeholder="Create a password" value={form.password} onChange={e => set('password', e.target.value)}/>
        <button style={styles.btnYellow} onClick={() => go('otp')}>Send Confirmation Code</button>
        <button style={styles.link} onClick={() => go('customer-login')}>Already have an account? Log in</button>
      </div>
    </div>
  );
}

// ── OTP ───────────────────────────────────────────────────────────────────────
function OTPScreen({ go }) {
  const [code, setCode] = useState(['', '', '', '']);
  const update = (i, v) => {
    const c = [...code]; c[i] = v; setCode(c);
    if (v && i < 3) document.getElementById(`otp${i + 1}`)?.focus();
  };
  return (
    <div style={styles.content}>
      <TopBar title="Verify Email" onBack={() => go('customer-signup')}/>
      <div style={{ ...styles.center, paddingTop: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📧</div>
        <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 6 }}>Check your inbox</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 28, textAlign: 'center' }}>We sent a 4-digit code to your email address</p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {code.map((v, i) => (
            <input key={i} id={`otp${i}`} maxLength={1} value={v}
              onChange={e => update(i, e.target.value)}
              style={{ width: 56, height: 60, textAlign: 'center', fontSize: 24, fontWeight: 500, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 12, color: WHITE, outline: 'none' }}/>
          ))}
        </div>
        <div style={{ width: '100%', maxWidth: 300 }}>
          <button style={styles.btnYellow} onClick={() => go('customer-dash')}>Verify & Continue</button>
          <button style={styles.link}>Resend code</button>
        </div>
      </div>
    </div>
  );
}

// ── CUSTOMER LOGIN ────────────────────────────────────────────────────────────
function CustomerLogin({ go }) {
  return (
    <div style={styles.content}>
      <TopBar title="Log In" onBack={() => go('customer-signup')}/>
      <div style={{ padding: '32px 20px', maxWidth: 420, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Welcome back</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>Log in to book a VilleCabs ride</p>
        <button style={{ ...styles.btnOutline, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={() => go('customer-dash')}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <Divider/>
        <label style={styles.label}>Email</label>
        <input style={styles.input} type="email" placeholder="you@email.com"/>
        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" placeholder="Your password"/>
        <button style={styles.btnYellow} onClick={() => go('customer-dash')}>Log In</button>
        <button style={styles.link} onClick={() => go('customer-signup')}>Create an account</button>
      </div>
    </div>
  );
}

// ── CUSTOMER DASHBOARD ────────────────────────────────────────────────────────
function CustomerDash({ go }) {
  return (
    <div style={{ ...styles.content, background: '#0f1923', minHeight: '100vh' }}>
      <div style={{ background: DARK, padding: '16px 20px' }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Good morning,</div>
        <div style={{ color: WHITE, fontSize: 20, fontWeight: 500 }}>Kezia 👋</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Balance:</span>
          <span style={{ background: YELLOW, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: DARK }}>J$1,200</span>
        </div>
      </div>

      {/* Map placeholder */}
      <div style={{ height: 200, background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
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
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,26,46,0.85)', borderRadius: 20, padding: '3px 12px', fontSize: 11, color: YELLOW, fontWeight: 500 }}>
          📍 Manchester, Jamaica
        </div>
        <button onClick={() => go('pin-pickup')} style={{ position: 'absolute', right: 10, bottom: 10, background: YELLOW, border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 500, color: DARK, cursor: 'pointer' }}>
          📌 Pin location
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <div onClick={() => go('pin-pickup')} style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN, flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: WHITE }}>Pickup location</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Manchester, Jamaica (tap to pin exact spot)</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>›</span>
        </div>
        <div onClick={() => go('pin-dropoff')} style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: YELLOW, flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: WHITE }}>Drop-off location</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Where are you going?</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>›</span>
        </div>
        <button style={styles.btnYellow} onClick={() => go('vehicle-select')}>Find a Ride</button>
      </div>
    </div>
  );
}

// ── PIN PICKUP ────────────────────────────────────────────────────────────────
function PinPickup({ go }) {
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <TopBar title="Pin Pickup Location" onBack={() => go('customer-dash')}/>
      <div style={{ height: 280, background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="280" fill="#1a2744"/>
          <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="0" y1="160" x2="400" y2="160" stroke="rgba(255,255,255,0.12)" strokeWidth="3"/>
          <line x1="0" y1="220" x2="400" y2="220" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
          <line x1="100" y1="0" x2="100" y2="280" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="220" y1="0" x2="220" y2="280" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="320" y1="0" x2="320" y2="280" stroke="rgba(255,255,255,0.08)" strokeWidth="2"/>
          <text x="60" y="75" fill="rgba(255,255,255,0.3)" fontSize="10">Caledonia Rd</text>
          <text x="230" y="145" fill="rgba(255,255,255,0.3)" fontSize="10">Ward Ave</text>
          <text x="110" y="155" fill="rgba(255,255,255,0.3)" fontSize="10">Mandeville</text>
        </svg>
        {/* Centre pin */}
        <div style={{ position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%, -100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ transform: 'rotate(45deg)', fontSize: 16 }}>📍</span>
          </div>
          <div style={{ width: 2, height: 14, background: 'rgba(0,0,0,0.4)' }}/>
        </div>
        <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,26,46,0.85)', borderRadius: 20, padding: '3px 12px', fontSize: 10, color: YELLOW }}>
          📍 Manchester, Jamaica
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: WHITE, fontSize: 11, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          Drag map to move pin
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <label style={styles.label}>Pinned address</label>
        <input style={styles.input} defaultValue="Caledonia Rd, Mandeville, Manchester"/>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>ℹ️ You can also type an address to search</p>
        <button style={styles.btnYellow} onClick={() => go('pin-dropoff')}>Confirm Pickup</button>
      </div>
    </div>
  );
}

// ── PIN DROPOFF ───────────────────────────────────────────────────────────────
function PinDropoff({ go }) {
  const suggestions = ['Manchester Market, Mandeville', 'Spaldings, Manchester', 'Christiana, Manchester', 'Porus, Manchester'];
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <TopBar title="Pin Drop-off Location" onBack={() => go('customer-dash')}/>
      <div style={{ height: 220, background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="220" fill="#1a2744"/>
          <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="0" y1="150" x2="400" y2="150" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="130" y1="0" x2="130" y2="220" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <line x1="260" y1="0" x2="260" y2="220" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
        </svg>
        <div style={{ position: 'absolute', left: '62%', top: '40%', transform: 'translate(-50%,-100%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: YELLOW, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ transform: 'rotate(45deg)', fontSize: 16 }}>🏁</span>
          </div>
          <div style={{ width: 2, height: 14, background: 'rgba(0,0,0,0.3)' }}/>
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: WHITE, fontSize: 11, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          Drag map to set drop-off
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <input style={{ ...styles.input, paddingLeft: 36 }} placeholder="Search drop-off address..."/>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          {suggestions.map((s, i) => (
            <div key={i} onClick={() => go('vehicle-select')} style={{ padding: '11px 14px', fontSize: 13, color: 'rgba(255,255,255,0.8)', borderBottom: i < suggestions.length - 1 ? '0.5px solid rgba(255,255,255,0.08)' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              📍 {s}
            </div>
          ))}
        </div>
        <button style={styles.btnYellow} onClick={() => go('vehicle-select')}>Confirm Drop-off</button>
      </div>
    </div>
  );
}

// ── VEHICLE SELECT ────────────────────────────────────────────────────────────
function VehicleSelect({ go }) {
  const [selected, setSelected] = useState(0);
  const vehicles = [
    { name: 'VilleRide', eta: '4 min away', price: 750, base: 300, rate: 55, icon: '🚗' },
    { name: 'VilleXL', eta: '7 min · up to 6', price: 1200, base: 400, rate: 98, icon: '🚙' },
    { name: 'VilleMoto', eta: '2 min away', price: 500, base: 200, rate: 37, icon: '🏍️' },
  ];
  const v = vehicles[selected];
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <TopBar title="Choose Ride" onBack={() => go('customer-dash')}/>
      <div style={{ height: 140, background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="140" fill="#1a2744"/>
          <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="140" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <circle cx="110" cy="50" r="7" fill={GREEN} opacity="0.9"/>
          <circle cx="290" cy="90" r="7" fill={YELLOW} opacity="0.9"/>
          <line x1="117" y1="53" x2="283" y2="87" stroke={YELLOW} strokeWidth="2" opacity="0.4" strokeDasharray="6,4"/>
        </svg>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
          <span>Pickup → Christiana</span><span>~8.2 km</span>
        </div>
        {vehicles.map((veh, i) => (
          <div key={i} onClick={() => setSelected(i)} style={{ border: `${i === selected ? '2px solid ' + YELLOW : '0.5px solid rgba(255,255,255,0.12)'}`, borderRadius: 12, padding: '11px 13px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: i === selected ? 'rgba(232,180,0,0.08)' : 'rgba(255,255,255,0.04)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{veh.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: WHITE }}>{veh.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{veh.eta}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: WHITE }}>J${veh.price.toLocaleString()}</div>
          </div>
        ))}
        <div style={{ background: DARK, borderRadius: 12, padding: 14, margin: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}><span>Base fare</span><span>J${v.base}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}><span>Distance (8.2 km × J${v.rate})</span><span>J${Math.round(8.2 * v.rate)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}><span>Service fee</span><span>J$0</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 500, color: YELLOW, borderTop: '0.5px solid rgba(255,255,255,0.12)', paddingTop: 8, marginTop: 4 }}><span>Total</span><span>J${v.price.toLocaleString()}</span></div>
        </div>
        <button style={styles.btnYellow} onClick={() => go('booking-confirm')}>Book Ride — J${v.price.toLocaleString()}</button>
      </div>
    </div>
  );
}

// ── BOOKING CONFIRM ───────────────────────────────────────────────────────────
function BookingConfirm({ go }) {
  const [payment, setPayment] = useState('cash');
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <TopBar title="Confirm Booking" onBack={() => go('vehicle-select')}/>
      <div style={{ padding: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚗</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: WHITE }}>VilleRide</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Toyota Corolla · PP1234</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: GREEN }}>J$750</div>
          </div>
          <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: GREEN, marginTop: 3, flexShrink: 0 }}/>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Caledonia Rd, Mandeville</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: YELLOW, marginTop: 3, flexShrink: 0 }}/>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Christiana, Manchester</div>
            </div>
          </div>
        </div>
        <div style={styles.sectionTitle}>Payment method</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['cash', 'card'].map(p => (
            <div key={p} onClick={() => setPayment(p)} style={{ flex: 1, border: payment === p ? `1.5px solid ${YELLOW}` : '0.5px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', cursor: 'pointer', background: payment === p ? 'rgba(232,180,0,0.1)' : 'transparent', color: payment === p ? YELLOW : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: payment === p ? 500 : 400, textTransform: 'capitalize' }}>
              {p === 'cash' ? '💵' : '💳'} {p}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 20 }}>Driver will arrive in ~4 minutes</p>
        <button style={styles.btnYellow} onClick={() => go('live-ride')}>Confirm Booking</button>
        <button style={styles.btnOutline} onClick={() => go('customer-dash')}>Cancel</button>
      </div>
    </div>
  );
}

// ── LIVE RIDE ─────────────────────────────────────────────────────────────────
function LiveRide({ go }) {
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <div style={{ height: 220, background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="220" fill="#1a2744"/>
          <line x1="0" y1="110" x2="400" y2="110" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="220" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <circle cx="110" cy="70" r="8" fill={GREEN} opacity="0.9"/>
          <circle cx="110" cy="70" r="4" fill={WHITE}/>
          <circle cx="280" cy="130" r="8" fill={YELLOW} opacity="0.9"/>
          <circle cx="280" cy="130" r="4" fill={DARK}/>
          <circle cx="160" cy="95" r="7" fill={DARK} stroke={YELLOW} strokeWidth="2"/>
          <text x="175" y="88" fill={YELLOW} fontSize="9">PP1234 · 3 min</text>
        </svg>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: WHITE }}>Desmond Reid</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Toyota Corolla · <strong>PP1234</strong></div>
            <div style={{ fontSize: 11, color: YELLOW }}>★ 4.8</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}>📞</div>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: DARK, border: `1px solid ${YELLOW}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16 }}>💬</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Arriving in</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: WHITE }}>3 min</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Fare</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: GREEN }}>J$750</div>
          </div>
        </div>
        <button style={styles.btnOutline} onClick={() => go('customer-dash')}>Cancel Ride</button>
      </div>
    </div>
  );
}

// ── DRIVER SIGNUP ─────────────────────────────────────────────────────────────
function DriverSignup({ go }) {
  const [docs, setDocs] = useState({ license: false, fitness: false, registration: false });
  const toggleDoc = k => setDocs(p => ({ ...p, [k]: !p[k] }));
  return (
    <div style={styles.content}>
      <TopBar title="Driver Registration" onBack={() => go('role')}/>
      <div style={{ padding: '20px 20px', maxWidth: 420, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Drive with VilleCabs</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 }}>Fill in your details to apply</p>
        {[['Full Legal Name', 'As on your ID'], ['TRN (Tax Registration Number)', '000-000-000'], ['Date of Birth', 'DD/MM/YYYY'], ['Phone Number', '+1 (876) 555-0100'], ['Email Address', 'you@email.com']].map(([lbl, ph]) => (
          <div key={lbl}><label style={styles.label}>{lbl}</label><input style={styles.input} placeholder={ph}/></div>
        ))}
        <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)', margin: '4px 0 16px' }}/>
        {[['Make of Vehicle', 'e.g. Toyota'], ['Model', 'e.g. Corolla'], ['License Plate Number', 'e.g. PP1234']].map(([lbl, ph]) => (
          <div key={lbl}><label style={styles.label}>{lbl}</label><input style={styles.input} placeholder={ph}/></div>
        ))}
        <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)', margin: '4px 0 16px' }}/>
        {[['license', "Driver's License"], ['fitness', 'Vehicle Fitness Certificate'], ['registration', 'Vehicle Registration']].map(([k, lbl]) => (
          <div key={k} onClick={() => toggleDoc(k)} style={docs[k] ? styles.uploadBoxDone : styles.uploadBox}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{docs[k] ? '✅' : '📄'}</div>
            <div style={{ fontSize: 12, color: docs[k] ? GREEN : 'rgba(255,255,255,0.4)' }}>{docs[k] ? `${lbl} uploaded ✓` : `Tap to upload ${lbl}`}</div>
          </div>
        ))}
        <button style={{ ...styles.btnYellow, marginTop: 8 }} onClick={() => go('driver-pending')}>Submit Application</button>
      </div>
    </div>
  );
}

// ── DRIVER PENDING ────────────────────────────────────────────────────────────
function DriverPending({ go }) {
  return (
    <div style={styles.content}>
      <TopBar title="Application Submitted"/>
      <div style={{ ...styles.center, paddingTop: 20 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={styles.pendingCard}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>Pending Admin Approval</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>Our team in Manchester will review your documents and activate your account within 24–48 hours. You'll receive an SMS and email notification.</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>What happens next?</div>
            {['Admin reviews your documents', 'Background check completed', 'Account activated via SMS', 'Start accepting rides in Manchester'].map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, display: 'flex', gap: 8 }}>
                <span style={{ color: YELLOW }}>0{i + 1}</span> {s}
              </div>
            ))}
          </div>
          <button style={styles.btnOutline} onClick={() => go('splash')}>Back to Home</button>
        </div>
      </div>
    </div>
  );
}

// ── DRIVER LOGIN ──────────────────────────────────────────────────────────────
function DriverLogin({ go }) {
  return (
    <div style={styles.content}>
      <TopBar title="Driver Login" onBack={() => go('splash')}/>
      <div style={{ padding: '32px 20px', maxWidth: 420, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Welcome back</h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>Sign in to your VilleCabs driver account</p>
        <label style={styles.label}>Email or Phone</label>
        <input style={styles.input} placeholder="Your email or phone number"/>
        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" placeholder="Your password"/>
        <button style={styles.btnYellow} onClick={() => go('driver-dash')}>Login</button>
        <button style={styles.link} onClick={() => go('driver-signup')}>New driver? Apply here</button>
      </div>
    </div>
  );
}

// ── DRIVER DASHBOARD ──────────────────────────────────────────────────────────
function DriverDash({ go }) {
  const rides = [
    { name: 'Kezia B.', from: 'Caledonia Rd', to: 'Christiana', km: '8.2', price: 750, eta: '4 min' },
    { name: 'Marcus T.', from: 'Ward Ave', to: 'Market', km: '4.1', price: 500, eta: '7 min' },
    { name: 'Paula G.', from: 'Spaldings', to: 'Mandeville', km: '12.4', price: 1100, eta: '9 min' },
  ];
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <div style={{ background: DARK, padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Online as driver</div>
            <div style={{ color: WHITE, fontSize: 18, fontWeight: 500 }}>Desmond Reid</div>
          </div>
          <div style={{ background: GREEN, borderRadius: 20, padding: '5px 14px', fontSize: 12, color: WHITE, fontWeight: 500 }}>● Online</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Today's earnings:</span>
          <span style={{ background: YELLOW, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 500, color: DARK }}>J$3,450</span>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{rides.length} ride requests near you in Manchester</div>
        {rides.map((r, i) => (
          <div key={i} style={{ border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, marginBottom: 10, background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: WHITE }}>👤 {r.name}</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: GREEN }}>J${r.price.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>📍 {r.from} → {r.to} · {r.km} km</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>Pickup in ~{r.eta} · Cash</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => go('driver-active')} style={{ flex: 1, background: GREEN, color: WHITE, border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>✓ Accept</button>
              <button style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 10, fontSize: 13, cursor: 'pointer' }}>Decline</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DRIVER ACTIVE RIDE ────────────────────────────────────────────────────────
function DriverActive({ go }) {
  return (
    <div style={{ ...styles.content, background: '#0f1923' }}>
      <TopBar title="Active Ride" onBack={() => go('driver-dash')}/>
      <div style={{ height: 180, background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="180" fill="#1a2744"/>
          <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.12)" strokeWidth="4"/>
          <line x1="200" y1="0" x2="200" y2="180" stroke="rgba(255,255,255,0.1)" strokeWidth="3"/>
          <circle cx="130" cy="60" r="8" fill={GREEN} opacity="0.9"/>
          <circle cx="280" cy="110" r="8" fill={YELLOW} opacity="0.9"/>
          <circle cx="160" cy="75" r="7" fill={DARK} stroke={YELLOW} strokeWidth="2"/>
        </svg>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ background: 'rgba(232,180,0,0.1)', border: `1.5px solid rgba(232,180,0,0.4)`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: YELLOW, marginBottom: 8 }}>Pick up passenger</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: GREEN }}/>
            <div style={{ fontSize: 13, color: WHITE }}>Caledonia Rd, Mandeville</div>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: WHITE, marginBottom: 8 }}>Passenger</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: WHITE }}>Kezia B.</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>★ 4.9 rider</div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15 }}>📞</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: YELLOW }}/>
          <div style={{ fontSize: 13, color: WHITE, flex: 1 }}>Christiana, Manchester · 8.2 km</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: GREEN }}>J$750</div>
        </div>
        <button style={styles.btnGreen} onClick={() => go('driver-dash')}>Complete Ride</button>
      </div>
    </div>
  );
}

// ── APP ROUTER ────────────────────────────────────────────────────────────────
const SCREENS = {
  splash: SplashScreen,
  role: RoleSelect,
  'customer-signup': CustomerSignup,
  'customer-login': CustomerLogin,
  otp: OTPScreen,
  'customer-dash': CustomerDash,
  'pin-pickup': PinPickup,
  'pin-dropoff': PinDropoff,
  'vehicle-select': VehicleSelect,
  'booking-confirm': BookingConfirm,
  'live-ride': LiveRide,
  'driver-signup': DriverSignup,
  'driver-pending': DriverPending,
  'driver-login': DriverLogin,
  'driver-dash': DriverDash,
  'driver-active': DriverActive,
};

export default function App() {
  const [screen, setScreen] = useState('splash');
  const Screen = SCREENS[screen] || SplashScreen;
  const needsMapBg = ['splash', 'role', 'customer-signup', 'customer-login', 'otp', 'driver-signup', 'driver-pending', 'driver-login'].includes(screen);
  return (
    <div style={styles.screen}>
      {needsMapBg && <MapBackground/>}
      <Screen go={setScreen}/>
    </div>
  );
}