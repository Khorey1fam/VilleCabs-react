// Admin → VilleDash → Sites & ads: the domains for each VILLE site and the
// house ads that send visitors between them.
import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { dashDb, uploadMerchantImage } from './dashApi';
import { SITE_INFO } from './sites';
import { C, st, Pill, Spinner } from './ui';

const card = { ...st.card, padding: 14 };
const small = { padding: '6px 10px', fontSize: 12, borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const SITES = ['cabs', 'ville', 'dash'];
const DOMAIN_SITES = [...SITES, 'driver'];
const clean = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

function Domains() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(doc(dashDb(), 'config', 'sites'), (s) => setF({ cabs: 'villecabs.com', ville: 'villeapp.org', dash: 'villedash.com', driver: 'driver.villecabs.com', ...(s.exists() ? s.data() : {}) }), () => setF({ cabs: 'villecabs.com', ville: 'villeapp.org', dash: 'villedash.com', driver: 'driver.villecabs.com' })), []);
  if (!f) return <Spinner />;
  const save = async () => {
    setMsg('');
    const store = (u, host) => { const v = String(u || '').trim(); return v.startsWith('https://') && v.includes(host) ? v : ''; };
    if ((f.appAndroidUrl && !store(f.appAndroidUrl, 'play.google.com')) || (f.appIosUrl && !store(f.appIosUrl, 'apps.apple.com'))) { setMsg('Store links must be the real listing addresses (https://play.google.com/… and https://apps.apple.com/…).'); return; }
    const out = { ...Object.fromEntries(DOMAIN_SITES.map((k) => [k, clean(f[k])])), driverLive: f.driverLive === true, appAndroidUrl: store(f.appAndroidUrl, 'play.google.com'), appIosUrl: store(f.appIosUrl, 'apps.apple.com') };
    if (out.ville && out.ville === out.dash) { setMsg('VILLE and VilleDash need different domains.'); return; }
    try { await setDoc(doc(dashDb(), 'config', 'sites'), { ...out, updatedAt: serverTimestamp() }, { merge: true }); setMsg('Saved. Each domain shows its own home page as soon as it points at Vercel.'); } catch (e) { setMsg('Could not save.'); }
  };
  return (
    <div style={card}>
      <div style={st.h2}>Domains</div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 6 }}>All of them run the same app. Add each domain to the Vercel project and to Firebase Auth → Authorized domains first (steps in VILLEDASH.md).</div>
      {DOMAIN_SITES.map((k) => (
        <div key={k}><label style={st.label}>{SITE_INFO[k].name} domain</label>
          <input style={st.input} placeholder={k === 'cabs' ? 'villecabs.com' : 'e.g. your-domain.com'} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
      ))}
      <label style={st.label}>VILLE app on Google Play (leave blank until it is published)</label>
      <input style={st.input} placeholder="https://play.google.com/store/apps/details?id=…" value={f.appAndroidUrl || ''} onChange={(e) => setF({ ...f, appAndroidUrl: e.target.value })} />
      <label style={st.label}>VILLE app on the App Store (leave blank until it is published)</label>
      <input style={st.input} placeholder="https://apps.apple.com/…" value={f.appIosUrl || ''} onChange={(e) => setF({ ...f, appIosUrl: e.target.value })} />
      <div style={{ fontSize: 12, color: C.quiet, marginTop: 4 }}>Until a link is saved, the VILLE homepage shows that store as “Coming soon” with a notify-me form.</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, marginTop: 10 }}>
        <input type="checkbox" checked={f.driverLive === true} onChange={(e) => setF({ ...f, driverLive: e.target.checked })} />
        Driver app is live: show drivers on VilleCabs a link to it
      </label>
      <button onClick={save} style={{ ...st.btn, width: 'auto', padding: '10px 18px', marginTop: 10 }}>Save domains</button>
      {msg && <div style={st.note}>{msg}</div>}
    </div>
  );
}

const EMPTY = { title: '', body: '', ctaLabel: '', target: 'dash', url: '', imageUrl: '', showOn: ['cabs', 'ville'], active: true, order: 0, startDate: '', endDate: '' };
function AdForm({ ad, onDone }) {
  const [f, setF] = useState({ ...EMPTY, ...(ad || {}) });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleSite = (k) => setF({ ...f, showOn: f.showOn.includes(k) ? f.showOn.filter((x) => x !== k) : [...f.showOn, k] });
  const save = async () => {
    setMsg('');
    if (!f.title.trim()) { setMsg('Add a headline.'); return; }
    if (!f.showOn.length) { setMsg('Choose at least one site to show it on.'); return; }
    if (f.target === 'url' && !/^https:\/\//.test(f.url)) { setMsg('Outside links must start with https://'); return; }
    const data = {
      title: f.title.trim().slice(0, 60), body: f.body.trim().slice(0, 160), ctaLabel: f.ctaLabel.trim().slice(0, 30),
      target: f.target, url: f.target === 'url' ? f.url.trim() : null, imageUrl: f.imageUrl || null,
      showOn: f.showOn, active: !!f.active, order: Number(f.order) || 0, startDate: f.startDate || null, endDate: f.endDate || null,
      updatedAt: serverTimestamp(),
    };
    try {
      if (ad) await updateDoc(doc(dashDb(), 'site_ads', ad.id), data);
      else await addDoc(collection(dashDb(), 'site_ads'), { ...data, clicks: 0, createdAt: serverTimestamp() });
      onDone();
    } catch (e) { setMsg('Could not save the ad.'); }
  };
  return (
    <div style={{ ...card, border: `2px solid ${C.purpleLine}` }}>
      <div style={st.h2}>{ad ? 'Edit ad' : 'New ad'}</div>
      <label style={st.label}>Headline</label><input style={st.input} value={f.title} maxLength={60} onChange={set('title')} />
      <label style={st.label}>Text</label><input style={st.input} value={f.body} maxLength={160} onChange={set('body')} />
      <label style={st.label}>Button text</label><input style={st.input} value={f.ctaLabel} maxLength={30} onChange={set('ctaLabel')} placeholder="e.g. Order now" />
      <label style={st.label}>Sends people to</label>
      <select style={st.input} value={f.target} onChange={set('target')}>
        <option value="cabs">VilleCabs</option><option value="dash">VilleDash</option><option value="ville">VILLE hub</option><option value="events">VilleEvents</option><option value="url">An outside link (sponsor)</option>
      </select>
      {f.target === 'url' && <><label style={st.label}>Link</label><input style={st.input} value={f.url} onChange={set('url')} placeholder="https://" /></>}
      <label style={st.label}>Show on</label>
      <div style={{ display: 'flex', gap: 12 }}>
        {SITES.map((k) => <label key={k} style={{ fontSize: 13.5 }}><input type="checkbox" checked={f.showOn.includes(k)} onChange={() => toggleSite(k)} /> {SITE_INFO[k].name}</label>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '0 10px' }}>
        <div><label style={st.label}>Starts (optional)</label><input style={st.input} type="date" value={f.startDate || ''} onChange={set('startDate')} /></div>
        <div><label style={st.label}>Ends (optional)</label><input style={st.input} type="date" value={f.endDate || ''} onChange={set('endDate')} /></div>
        <div><label style={st.label}>Order (lower shows first)</label><input style={st.input} type="number" value={f.order} onChange={set('order')} /></div>
      </div>
      <label style={{ ...st.btnGhost, display: 'block', textAlign: 'center', marginTop: 10 }}>
        {f.imageUrl ? '✓ Image added — replace' : 'Add an image (optional)'}
        <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={async (e) => {
          try { const url = await uploadMerchantImage(null, e.target.files[0], 'ad', 'site_ads'); setF((x) => ({ ...x, imageUrl: url })); } catch (er) { setMsg(er.message || 'Upload failed.'); }
        }} />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '10px 0' }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Live</label>
      {msg && <div style={st.err}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...st.btnGhost, width: 'auto', padding: '9px 16px' }} onClick={onDone}>Cancel</button>
        <button style={{ ...st.btn, width: 'auto', padding: '9px 16px' }} onClick={save}>Save ad</button>
      </div>
    </div>
  );
}

function Ads() {
  const [ads, setAds] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  useEffect(() => onSnapshot(collection(dashDb(), 'site_ads'), (s) => setAds(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0))), () => setAds([])), []);
  if (!ads) return <Spinner />;
  if (editing) return <AdForm ad={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />;
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={st.h2}>House ads</div>
        <button onClick={() => setEditing('new')} style={{ ...small, background: C.purple, color: C.white, border: 'none' }}>+ New ad</button>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginBottom: 8 }}>
        Shown on the landing pages, the VilleCabs dashboard, the VILLE hub and VilleDash home. An ad never shows on the site it points to.
        With no live ads, each site shows built-in promos for its sister services. Links carry utm tags so visits can be traced in analytics.
      </div>
      {ads.length === 0 && <div style={{ fontSize: 13, color: C.quiet }}>No custom ads yet.</div>}
      {ads.map((a) => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <b>{a.title}</b> <span style={{ fontSize: 12, color: C.quiet }}>→ {a.target === 'url' ? a.url : SITE_INFO[a.target]?.name} · on {a.showOn.map((k) => SITE_INFO[k].name).join(', ')}{a.endDate ? ` · until ${a.endDate}` : ''}</span>
            <div style={{ fontSize: 12, color: C.quiet }}>{a.clicks || 0} clicks{a.clicksBySite ? ` (${Object.entries(a.clicksBySite).map(([k, v]) => `${SITE_INFO[k]?.name || k} ${v}`).join(', ')})` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Pill tone={a.active ? 'green' : 'grey'}>{a.active ? 'Live' : 'Off'}</Pill>
            <button onClick={() => updateDoc(doc(dashDb(), 'site_ads', a.id), { active: !a.active }).catch(() => {})} style={{ ...small, background: '#f3f4f6', border: 'none' }}>{a.active ? 'Turn off' : 'Turn on'}</button>
            <button onClick={() => setEditing(a)} style={{ ...small, background: C.purpleSoft, color: C.purple, border: 'none' }}>Edit</button>
            {confirmDel === a.id
              ? <button onClick={() => deleteDoc(doc(dashDb(), 'site_ads', a.id)).then(() => setConfirmDel(null))} style={{ ...small, background: C.red, color: C.white, border: 'none' }}>Delete?</button>
              : <button onClick={() => setConfirmDel(a.id)} style={{ ...small, background: 'none', color: C.red, border: 'none' }}>✕</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SitesTab() {
  return (<><Domains /><Ads /></>);
}
