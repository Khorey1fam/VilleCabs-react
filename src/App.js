import React, { useState } from 'react';

function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: 40 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e8b400', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <span style={{ fontSize: 36 }}>🚕</span>
      </div>
      <h1 style={{ color: '#1a1a2e', fontSize: 32, marginBottom: 8 }}>VilleCabs</h1>
      <p style={{ color: '#888', fontSize: 16 }}>Manchester, Jamaica's ride service</p>
      <p style={{ marginTop: 40, color: '#1a9e5a', fontWeight: 500 }}>✓ App is live and running!</p>
    </div>
  );
}

export default App;