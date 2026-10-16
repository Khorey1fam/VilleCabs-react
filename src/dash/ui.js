// VilleDash shared look: white backgrounds, VILLE purple accents.
import React from 'react';

export const C = {
  purple: '#6b21a8', purpleDark: '#4c1d95', purpleSoft: '#f5f0ff', purpleLine: '#e9d5ff',
  ink: '#1a1a2e', quiet: '#6b7280', line: '#e5e7eb', bg: '#f7f5fb', white: '#ffffff',
  green: '#1a9e5a', red: '#dc2626', amber: '#b45309',
};

export const st = {
  page: { minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "'Segoe UI', system-ui, sans-serif", paddingBottom: 40 },
  wrap: { maxWidth: 560, margin: '0 auto', padding: '16px 16px 0' },
  card: { background: C.white, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 6px rgba(76,29,149,0.05)' },
  h1: { fontSize: 22, fontWeight: 800, margin: '4px 0 4px', color: C.ink },
  h2: { fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: C.ink },
  sub: { fontSize: 13, color: C.quiet, lineHeight: 1.5 },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#8a83a0', textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 4px' },
  input: { width: '100%', padding: '11px 12px', border: '1px solid #d8d3e6', borderRadius: 10, fontSize: 14, color: C.ink, background: C.white, boxSizing: 'border-box', outline: 'none' },
  btn: { boxSizing: 'border-box', width: '100%', padding: '14px', background: `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})`, color: C.white, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { boxSizing: 'border-box', width: '100%', padding: '12px', background: C.white, color: C.purple, border: `1px solid ${C.purpleLine}`, borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnDanger: { boxSizing: 'border-box', width: '100%', padding: '12px', background: '#fff5f5', color: C.red, border: '1px solid #fecaca', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  err: { background: '#fff0f0', border: '1px solid #fca5a5', color: C.red, borderRadius: 10, padding: '10px 12px', fontSize: 13, margin: '10px 0' },
  note: { background: C.purpleSoft, border: `1px solid ${C.purpleLine}`, color: C.purpleDark, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5, margin: '10px 0' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13.5, padding: '5px 0' },
};

export function Header({ title, onBack, right }) {
  return (
    <div style={{ background: C.white, borderBottom: `1px solid ${C.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <button onClick={onBack} aria-label="Back"
            style={{ background: C.purpleSoft, border: 'none', borderRadius: 10, width: 36, height: 36, fontSize: 18, color: C.purple, cursor: 'pointer' }}>‹</button>
        )}
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, flex: 1 }}>{title}</div>
        {right}
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'purple' }) {
  const tones = {
    purple: [C.purpleSoft, C.purple], green: ['#e8f7ef', C.green], red: ['#fdecec', C.red],
    amber: ['#fff7e6', C.amber], grey: ['#f3f4f6', C.quiet],
  };
  const [bg, fg] = tones[tone] || tones.purple;
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, background: bg, color: fg }}>{children}</span>;
}

export function statusTone(s) {
  if (s === 'delivered') return 'green';
  if (s === 'cancelled') return 'grey';
  if (s === 'failed') return 'red';
  if (s === 'requested') return 'amber';
  return 'purple';
}

export function Spinner({ label = 'Loading…' }) {
  return <div style={{ padding: 30, textAlign: 'center', color: C.quiet, fontSize: 13 }}>{label}</div>;
}
