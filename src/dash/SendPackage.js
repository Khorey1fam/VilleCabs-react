// Send a Package — 4 steps: pickup, drop-off, package, review & confirm.
// The price shown comes from the server (dashQuoteDelivery) and is re-checked
// when the booking is created; nothing about the price is decided here.
import React, { useMemo, useRef, useState } from 'react';
import { api, errText, formatJMD, newRequestKey, PACKAGE_CATEGORIES, PACKAGE_SIZES, PROHIBITED_SUMMARY } from './dashApi';
import { C, st, Header } from './ui';

const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };

function LocationStep({ shared, value, onChange, kind }) {
  const { AddressAutocompleteInput, VilleMap, geocodeLatLng } = shared;
  const pos = value.lat != null ? { lat: value.lat, lng: value.lng } : null;
  const setPin = async (lat, lng) => {
    onChange({ ...value, lat, lng });
    try {
      const addr = await geocodeLatLng(lat, lng);
      if (addr) onChange({ ...value, lat, lng, address: addr });
    } catch (e) { /* keep the pin even without an address */ }
  };
  return (
    <>
      <label style={st.label}>{kind === 'pickup' ? 'Pickup address' : 'Delivery address'}</label>
      <AddressAutocompleteInput
        value={value.address || ''}
        onChange={(t) => onChange({ ...value, address: t })}
        onPlaceSelect={(p) => onChange({ ...value, address: p.formattedAddress || p.name, lat: p.lat, lng: p.lng })}
        placeholder={kind === 'pickup' ? 'Where should the rider collect it?' : 'Where is it going?'}
      />
      <div style={{ borderRadius: 12, overflow: 'hidden', marginTop: 10, border: `1px solid ${C.line}` }}>
        <VilleMap height={220} center={pos || MANDEVILLE} zoom={pos ? 16 : 13}
          markers={pos ? [{ position: pos, title: kind === 'pickup' ? 'Pickup' : 'Drop-off' }] : []}
          onClick={(e) => setPin(e.latLng.lat(), e.latLng.lng())} />
      </div>
      <div style={{ fontSize: 12, color: C.quiet, marginTop: 6 }}>
        {pos ? 'Pin set. Tap the map to move it if the address isn’t quite right.' : 'Search an address or tap the map to drop a pin.'}
      </div>
      <label style={st.label}>Building or landmark</label>
      <input style={st.input} value={value.landmark || ''} maxLength={150}
        onChange={(e) => onChange({ ...value, landmark: e.target.value })} placeholder="e.g. Green gate beside the church" />
    </>
  );
}

export default function SendPackage({ go, user, shared, openDelivery }) {
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState({ contactName: user?.name || '', contactPhone: '' });
  const [dropoff, setDropoff] = useState({});
  const [pkg, setPkg] = useState({ category: '', size: 'small', description: '', weightKg: '', fragile: false, handling: '' });
  const [payer, setPayer] = useState('sender');
  const [rulesOk, setRulesOk] = useState(false);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const keyRef = useRef(newRequestKey()); // one key per booking attempt → no double bookings

  const stepOk = useMemo(() => [
    pickup.lat != null && pickup.contactName?.trim() && (pickup.contactPhone || '').replace(/\D/g, '').length >= 7,
    dropoff.lat != null && dropoff.recipientName?.trim() && (dropoff.recipientPhone || '').replace(/\D/g, '').length >= 7,
    pkg.category && pkg.size && pkg.description.trim().length >= 3 && rulesOk,
  ], [pickup, dropoff, pkg, rulesOk]);

  const getQuote = async () => {
    setBusy(true); setErr(''); setQuote(null);
    try {
      const q = await api.quote({
        pickup: { lat: pickup.lat, lng: pickup.lng }, dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        size: pkg.size, fragile: pkg.fragile, weightKg: pkg.weightKg === '' ? null : Number(pkg.weightKg),
      });
      setQuote(q); setStep(3);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      const res = await api.create({
        idempotencyKey: keyRef.current,
        expectedTotalCents: quote.totalCents,
        pickup, dropoff,
        package: { ...pkg, weightKg: pkg.weightKg === '' ? null : Number(pkg.weightKg) },
        payer, acceptedRules: rulesOk,
      });
      openDelivery(res.deliveryId);
    } catch (e) {
      if (e.code === 'functions/aborted' && e.details?.totalCents) {
        setQuote((q) => ({ ...q, totalCents: e.details.totalCents }));
        setErr('The price changed while you were booking. Please check the new total and confirm again.');
        // A changed price is a new attempt — use a fresh key.
        keyRef.current = newRequestKey();
      } else {
        setErr(errText(e));
      }
    }
    setBusy(false);
  };

  const titles = ['Pickup', 'Drop-off', 'Package', 'Review'];
  const back = () => (step === 0 ? go('dash-home') : setStep(step - 1));

  return (
    <div style={st.page}>
      <Header title={`Send a Package · ${titles[step]}`} onBack={back} />
      <div style={st.wrap}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {titles.map((t, i) => <div key={t} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= step ? C.purple : C.purpleLine }} />)}
        </div>

        {step === 0 && (
          <div style={st.card}>
            <LocationStep shared={shared} value={pickup} onChange={setPickup} kind="pickup" />
            <label style={st.label}>Sender name</label>
            <input style={st.input} value={pickup.contactName || ''} maxLength={80} onChange={(e) => setPickup({ ...pickup, contactName: e.target.value })} />
            <label style={st.label}>Sender phone</label>
            <input style={st.input} type="tel" value={pickup.contactPhone || ''} maxLength={20} onChange={(e) => setPickup({ ...pickup, contactPhone: e.target.value })} placeholder="876…" />
            <label style={st.label}>Pickup instructions (optional)</label>
            <textarea style={{ ...st.input, minHeight: 60 }} value={pickup.instructions || ''} maxLength={300} onChange={(e) => setPickup({ ...pickup, instructions: e.target.value })} />
            <button style={{ ...st.btn, marginTop: 14, opacity: stepOk[0] ? 1 : 0.5 }} disabled={!stepOk[0]} onClick={() => setStep(1)}>Next: drop-off</button>
          </div>
        )}

        {step === 1 && (
          <div style={st.card}>
            <LocationStep shared={shared} value={dropoff} onChange={setDropoff} kind="dropoff" />
            <label style={st.label}>Recipient name</label>
            <input style={st.input} value={dropoff.recipientName || ''} maxLength={80} onChange={(e) => setDropoff({ ...dropoff, recipientName: e.target.value })} />
            <label style={st.label}>Recipient phone</label>
            <input style={st.input} type="tel" value={dropoff.recipientPhone || ''} maxLength={20} onChange={(e) => setDropoff({ ...dropoff, recipientPhone: e.target.value })} placeholder="876…" />
            <label style={st.label}>Alternative contact (optional)</label>
            <input style={st.input} type="tel" value={dropoff.altPhone || ''} maxLength={20} onChange={(e) => setDropoff({ ...dropoff, altPhone: e.target.value })} />
            <label style={st.label}>Delivery instructions (optional)</label>
            <textarea style={{ ...st.input, minHeight: 60 }} value={dropoff.instructions || ''} maxLength={300} onChange={(e) => setDropoff({ ...dropoff, instructions: e.target.value })} />
            <button style={{ ...st.btn, marginTop: 14, opacity: stepOk[1] ? 1 : 0.5 }} disabled={!stepOk[1]} onClick={() => setStep(2)}>Next: package</button>
          </div>
        )}

        {step === 2 && (
          <div style={st.card}>
            <label style={st.label}>What are you sending?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PACKAGE_CATEGORIES.map(([k, l]) => (
                <button key={k} onClick={() => setPkg({ ...pkg, category: k })}
                  style={{ padding: '8px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                    border: `1px solid ${pkg.category === k ? C.purple : C.line}`, background: pkg.category === k ? C.purpleSoft : C.white, color: pkg.category === k ? C.purple : C.ink }}>{l}</button>
              ))}
            </div>
            <label style={st.label}>Size</label>
            {PACKAGE_SIZES.map(([k, l, d]) => (
              <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 10px', borderRadius: 10, marginBottom: 6, cursor: 'pointer',
                border: `1px solid ${pkg.size === k ? C.purple : C.line}`, background: pkg.size === k ? C.purpleSoft : C.white }}>
                <input type="radio" name="size" checked={pkg.size === k} onChange={() => setPkg({ ...pkg, size: k })} />
                <span><b style={{ fontSize: 14 }}>{l}</b><br /><span style={{ fontSize: 12, color: C.quiet }}>{d}</span></span>
              </label>
            ))}
            <label style={st.label}>Description</label>
            <input style={st.input} value={pkg.description} maxLength={300} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} placeholder="e.g. Birthday gift in a small box" />
            <label style={st.label}>Approximate weight in kg (optional)</label>
            <input style={st.input} type="number" min="0" step="0.5" value={pkg.weightKg} onChange={(e) => setPkg({ ...pkg, weightKg: e.target.value })} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '12px 0 4px' }}>
              <input type="checkbox" checked={pkg.fragile} onChange={(e) => setPkg({ ...pkg, fragile: e.target.checked })} /> Fragile — handle with care
            </label>
            <label style={st.label}>Special handling (optional)</label>
            <input style={st.input} value={pkg.handling} maxLength={200} onChange={(e) => setPkg({ ...pkg, handling: e.target.value })} placeholder="e.g. Keep upright" />

            <div style={st.note}>
              <b>VilleDash can't carry:</b>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{PROHIBITED_SUMMARY.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, margin: '8px 0' }}>
              <input type="checkbox" checked={rulesOk} onChange={(e) => setRulesOk(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I confirm this package contains none of these items. The rider may refuse anything unsafe.</span>
            </label>
            {err && <div style={st.err}>{err}</div>}
            <button style={{ ...st.btn, marginTop: 8, opacity: stepOk[2] && !busy ? 1 : 0.5 }} disabled={!stepOk[2] || busy} onClick={getQuote}>
              {busy ? 'Getting your price…' : 'See price'}
            </button>
          </div>
        )}

        {step === 3 && quote && (
          <>
            <div style={st.card}>
              <div style={st.h2}>Route</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <div><b>From:</b> {pickup.address}</div>
                <div><b>To:</b> {dropoff.address} ({dropoff.recipientName})</div>
                <div style={{ color: C.quiet, fontSize: 12.5, marginTop: 4 }}>About {quote.distanceKm} km by road (estimate)</div>
              </div>
            </div>
            <div style={st.card}>
              <div style={st.h2}>Price</div>
              {quote.lines.map((l) => (
                <div key={l.key} style={st.row}><span style={{ color: C.quiet }}>{l.label}</span><span>{formatJMD(l.cents)}</span></div>
              ))}
              <div style={{ ...st.row, borderTop: `2px solid ${C.purpleLine}`, marginTop: 8, paddingTop: 10 }}>
                <b style={{ fontSize: 15 }}>Total</b><b style={{ fontSize: 22, color: C.purple }}>{formatJMD(quote.totalCents)}</b>
              </div>
              {quote.pricingPlaceholder && <div style={st.note}>Test pricing — final VilleDash rates have not been published yet.</div>}
              <label style={st.label}>Who pays the rider in cash?</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['sender', 'Me, at pickup'], ['recipient', 'Recipient, on delivery']].map(([k, l]) => (
                  <button key={k} onClick={() => setPayer(k)}
                    style={{ flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${payer === k ? C.purple : C.line}`, background: payer === k ? C.purpleSoft : C.white, color: payer === k ? C.purple : C.ink }}>{l}</button>
                ))}
              </div>
            </div>
            {err && <div style={st.err}>{err}</div>}
            <button style={{ ...st.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={confirm}>
              {busy ? 'Booking…' : `Confirm — ${formatJMD(quote.totalCents)} cash`}
            </button>
            <div style={{ ...st.sub, textAlign: 'center', marginTop: 8, fontSize: 12 }}>You're not charged anything if no rider can take it.</div>
          </>
        )}
      </div>
    </div>
  );
}
