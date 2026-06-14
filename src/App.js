import React from 'react';

function App() {
  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: 'sans-serif',
    }}>

      {/* Blurred map background */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        background: '#1a2744',
        filter: 'blur(0px)',
      }}>
        <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
          {/* Base land */}
          <rect width="800" height="600" fill="#1e3a5f"/>

          {/* Green areas - parishes/hills */}
          <ellipse cx="200" cy="150" rx="180" ry="120" fill="#1a4a2e" opacity="0.6"/>
          <ellipse cx="600" cy="100" rx="220" ry="140" fill="#1a4a2e" opacity="0.5"/>
          <ellipse cx="400" cy="400" rx="250" ry="150" fill="#1a4a2e" opacity="0.4"/>
          <ellipse cx="100" cy="450" rx="150" ry="100" fill="#1a4a2e" opacity="0.5"/>
          <ellipse cx="700" cy="480" rx="180" ry="120" fill="#1a4a2e" opacity="0.4"/>

          {/* Main roads */}
          <line x1="0" y1="300" x2="800" y2="300" stroke="#e8b400" strokeWidth="4" opacity="0.4"/>
          <line x1="400" y1="0" x2="400" y2="600" stroke="#e8b400" strokeWidth="4" opacity="0.4"/>
          <line x1="0" y1="150" x2="800" y2="450" stroke="#e8b400" strokeWidth="3" opacity="0.25"/>
          <line x1="800" y1="150" x2="0" y2="450" stroke="#e8b400" strokeWidth="3" opacity="0.25"/>

          {/* Secondary roads */}
          <line x1="0" y1="200" x2="800" y2="350" stroke="#fff" strokeWidth="1.5" opacity="0.12"/>
          <line x1="200" y1="0" x2="200" y2="600" stroke="#fff" strokeWidth="1.5" opacity="0.12"/>
          <line x1="600" y1="0" x2="600" y2="600" stroke="#fff" strokeWidth="1.5" opacity="0.12"/>
          <line x1="0" y1="450" x2="800" y2="200" stroke="#fff" strokeWidth="1.5" opacity="0.12"/>
          <line x1="100" y1="0" x2="700" y2="600" stroke="#fff" strokeWidth="1" opacity="0.08"/>
          <line x1="700" y1="0" x2="100" y2="600" stroke="#fff" strokeWidth="1" opacity="0.08"/>
          <line x1="0" y1="100" x2="800" y2="500" stroke="#fff" strokeWidth="1" opacity="0.08"/>

          {/* Mandeville town blocks */}
          <rect x="340" y="240" width="30" height="20" rx="3" fill="#2a5a8a" opacity="0.6"/>
          <rect x="380" y="250" width="25" height="18" rx="3" fill="#2a5a8a" opacity="0.5"/>
          <rect x="350" y="270" width="35" height="22" rx="3" fill="#2a5a8a" opacity="0.55"/>
          <rect x="395" y="265" width="20" height="16" rx="3" fill="#2a5a8a" opacity="0.5"/>
          <rect x="320" y="255" width="18" height="14" rx="3" fill="#2a5a8a" opacity="0.45"/>
          <rect x="415" y="245" width="22" height="18" rx="3" fill="#2a5a8a" opacity="0.5"/>
          <rect x="360" y="295" width="28" height="16" rx="3" fill="#2a5a8a" opacity="0.45"/>

          {/* Christiana blocks */}
          <rect x="560" y="160" width="22" height="14" rx="3" fill="#2a5a8a" opacity="0.4"/>
          <rect x="585" y="155" width="18" height="12" rx="3" fill="#2a5a8a" opacity="0.35"/>
          <rect x="570" y="175" width="25" height="14" rx="3" fill="#2a5a8a" opacity="0.4"/>

          {/* Spaldings blocks */}
          <rect x="180" y="340" width="20" height="13" rx="3" fill="#2a5a8a" opacity="0.4"/>
          <rect x="205" y="335" width="16" height="12" rx="3" fill="#2a5a8a" opacity="0.35"/>

          {/* Location pins */}
          <circle cx="375" cy="285" r="10" fill="#e8b400" opacity="0.9"/>
          <circle cx="375" cy="285" r="5" fill="#1a1a2e"/>
          <circle cx="575" cy="170" r="7" fill="#1a9e5a" opacity="0.8"/>
          <circle cx="575" cy="170" r="3.5" fill="#fff"/>
          <circle cx="195" cy="345" r="7" fill="#1a9e5a" opacity="0.8"/>
          <circle cx="195" cy="345" r="3.5" fill="#fff"/>

          {/* Town labels */}
          <text x="370" y="320" textAnchor="middle" fill="#e8b400" fontSize="11" opacity="0.7" fontWeight="bold">Mandeville</text>
          <text x="580" y="195" textAnchor="middle" fill="#fff" fontSize="9" opacity="0.5">Christiana</text>
          <text x="195" y="368" textAnchor="middle" fill="#fff" fontSize="9" opacity="0.5">Spaldings</text>
          <text x="150" y="165" textAnchor="middle" fill="#fff" fontSize="9" opacity="0.4">Porus</text>
          <text x="660" y="380" textAnchor="middle" fill="#fff" fontSize="9" opacity="0.4">Coleyville</text>
        </svg>

        {/* Blur overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backdropFilter: 'blur(6px)',
          background: 'rgba(15, 25, 50, 0.55)',
        }}/>
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px' }}>
        {/* Logo */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: '#e8b400',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 40,
        }}>
          🚕
        </div>

        <h1 style={{ color: '#fff', fontSize: 42, fontWeight: 700, letterSpacing: 3, margin: '0 0 8px' }}>
          VilleCabs
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, margin: '0 0 48px' }}>
          Manchester, Jamaica's ride service
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320, margin: '0 auto' }}>
          <button style={{
            padding: '15px 20px', background: '#e8b400', color: '#1a1a2e',
            border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700,
            cursor: 'pointer', letterSpacing: 0.5,
          }}>
            Get Started
          </button>
          <button style={{
            padding: '15px 20px', background: 'transparent', color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 14,
            fontSize: 16, fontWeight: 500, cursor: 'pointer',
          }}>
            Driver Login
          </button>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 48 }}>
          Manchester, Jamaica · Mandeville · Christiana · Spaldings
        </p>
      </div>
    </div>
  );
}

export default App;