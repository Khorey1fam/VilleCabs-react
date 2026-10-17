// Send a Package: Route → Package → Review → Done.
// The price comes from the server (dashQuoteDelivery) and is re-checked when the
// booking is created; one idempotency key per attempt stops double bookings.
import React, { useMemo, useRef, useState } from 'react';
import { api, errText, formatJMD, newRequestKey, PACKAGE_CATEGORIES, PACKAGE_SIZES, PROHIBITED_SUMMARY } from './dashApi';
import { Shell, PageHead, Field, Steps, Chip } from './kit';
import { DoneArt } from './art';

const MANDEVILLE = { lat: 18.0416, lng: -77.5036 };
const STEPS = ['Route', 'Package', 'Review', 'Done'];
const digits = (v) => (v || '').replace(/\D/g, '');

function AddressBlock({ shared, value, onChange, kind, error }) {
  const { AddressAutocompleteInput } = shared;
  const pickup = kind === 'pickup';
  return (
    <>
      <Field label={pickup ? 'Pickup address' : 'Delivery address'} error={error}
        hint={value.lat != null ? 'Pin set. Tap the map below to adjust it.' : 'Search an address, or tap the map to drop a pin.'}>
        <div>
          <AddressAutocompleteInput value={value.address || ''} onChange={(t) => onChange({ ...value, address: t })}
            onPlaceSelect={(p) => onChange({ ...value, address: p.formattedAddress || p.name, lat: p.lat, lng: p.lng })}
            placeholder={pickup ? 'Where should the rider collect it?' : 'Where is it going?'} />
        </div>
      </Field>
      <Field label="Building or landmark (optional)">
        <input className="vd-input" value={value.landmark || ''} maxLength={150} onChange={(e) => onChange({ ...value, landmark: e.target.value })}
          placeholder={pickup ? 'e.g. Beside the pharmacy' : 'e.g. Green gate beside the church'} />
      </Field>
    </>
  );
}

function Optional({ label, children, initiallyOpen }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  if (!open) return <button type="button" className="vd-link" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>{label}</button>;
  return children;
}

function Summary({ pickup, dropoff, pkg, quote }) {
  const sizeName = (PACKAGE_SIZES.find(([k]) => k === pkg.size) || [])[1];
  const catName = (PACKAGE_CATEGORIES.find(([k]) => k === pkg.category) || [])[1];
  return (
    <div className="vd-panel">
      <div className="vd-panel__title">Your delivery</div>
      <ol className="vd-timeline">
        <li data-state={pickup.lat != null ? 'done' : 'todo'}><span className="vd-timeline__dot" />
          <div className="vd-timeline__t">{pickup.address || 'Pickup not set'}</div>
          {pickup.contactName && <div className="vd-timeline__s">From {pickup.contactName}</div>}</li>
        <li data-state={dropoff.lat != null ? 'done' : 'todo'}><span className="vd-timeline__dot" />
          <div className="vd-timeline__t">{dropoff.address || 'Drop-off not set'}</div>
          {dropoff.recipientName && <div className="vd-timeline__s">To {dropoff.recipientName}</div>}</li>
      </ol>
      {catName && <div className="vd-row" style={{ marginTop: 12 }}><span>Package</span><span>{[catName, sizeName && `${sizeName.toLowerCase()} size`].filter(Boolean).join(', ')}{pkg.fragile ? ', fragile' : ''}</span></div>}
      {quote && <div className="vd-row"><span>Distance</span><span>About {quote.distanceKm} km</span></div>}
      {quote && <div className="vd-total"><span>Total, cash</span><b>{formatJMD(quote.totalCents)}</b></div>}
    </div>
  );
}

export default function SendPackage({ go, user, shared, openDelivery, domains }) {
  const { VilleMap, geocodeLatLng } = shared;
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState({ contactName: user?.name || '', contactPhone: user?.phone || '' });
  const [dropoff, setDropoff] = useState({});
  const [pkg, setPkg] = useState({ category: '', size: 'small', description: '', weightKg: '', fragile: false, handling: '' });
  const [payer, setPayer] = useState('sender');
  const [rulesOk, setRulesOk] = useState(false);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tried, setTried] = useState({});
  const [pinFor, setPinFor] = useState('pickup');
  const [doneId, setDoneId] = useState(null);
  const keyRef = useRef(newRequestKey());
  const top = () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* ignore */ } };

  const routeErrors = useMemo(() => ({
    pickupAddr: pickup.lat == null ? 'Choose a pickup address or drop a pin.' : '',
    sender: !pickup.contactName?.trim() ? 'Enter the sender’s name.' : '',
    senderPhone: digits(pickup.contactPhone).length < 7 ? 'Enter a phone number the rider can call.' : '',
    dropAddr: dropoff.lat == null ? 'Choose a delivery address or drop a pin.' : '',
    recipient: !dropoff.recipientName?.trim() ? 'Enter the recipient’s name.' : '',
    recipientPhone: digits(dropoff.recipientPhone).length < 7 ? 'Enter the recipient’s phone number.' : '',
  }), [pickup, dropoff]);
  const pkgErrors = useMemo(() => ({
    category: !pkg.category ? 'Choose what you’re sending.' : '',
    description: pkg.description.trim().length < 3 ? 'Describe the package in a few words.' : '',
    weight: pkg.weightKg !== '' && !(Number(pkg.weightKg) > 0 && Number(pkg.weightKg) <= 20) ? 'Enter a weight up to 20 kg.' : '',
    rules: !rulesOk ? 'Confirm the package has none of these items.' : '',
  }), [pkg, rulesOk]);
  const ok = (errs) => Object.values(errs).every((v) => !v);
  const show = (s, errs, k) => (tried[s] ? errs[k] : '');

  const setPinAt = async (lat, lng) => {
    const set = pinFor === 'pickup' ? setPickup : setDropoff;
    set((v) => ({ ...v, lat, lng }));
    try { const a = await geocodeLatLng(lat, lng); if (a) set((v) => ({ ...v, address: a })); } catch (e) { /* keep the pin */ }
  };

  const nextFromRoute = () => { setTried((t) => ({ ...t, 0: true })); if (ok(routeErrors)) { setStep(1); top(); } };
  const getQuote = async () => {
    setTried((t) => ({ ...t, 1: true }));
    if (!ok(pkgErrors)) return;
    setBusy(true); setErr(''); setQuote(null);
    try {
      const q = await api.quote({
        pickup: { lat: pickup.lat, lng: pickup.lng }, dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        size: pkg.size, fragile: pkg.fragile, weightKg: pkg.weightKg === '' ? null : Number(pkg.weightKg),
      });
      setQuote(q); setStep(2); top();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const place = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const res = await api.create({
        idempotencyKey: keyRef.current, expectedTotalCents: quote.totalCents, pickup, dropoff,
        package: { ...pkg, weightKg: pkg.weightKg === '' ? null : Number(pkg.weightKg) }, payer, acceptedRules: rulesOk,
      });
      setDoneId(res.deliveryId); setStep(3); top();
    } catch (e) {
      if (e.code === 'functions/aborted' && e.details?.totalCents) {
        setQuote((q) => ({ ...q, totalCents: e.details.totalCents }));
        setErr('The price changed while you were booking. Check the new total and place the request again.');
        keyRef.current = newRequestKey();
      } else setErr(errText(e));
    }
    setBusy(false);
  };
  const restart = () => {
    keyRef.current = newRequestKey();
    setDropoff({}); setPkg({ category: '', size: 'small', description: '', weightKg: '', fragile: false, handling: '' });
    setRulesOk(false); setQuote(null); setTried({}); setDoneId(null); setErr(''); setStep(0); top();
  };

  const markers = [
    ...(pickup.lat != null ? [{ position: { lat: pickup.lat, lng: pickup.lng }, title: 'Pickup' }] : []),
    ...(dropoff.lat != null ? [{ position: { lat: dropoff.lat, lng: dropoff.lng }, title: 'Drop-off' }] : []),
  ];
  const focusPos = pinFor === 'pickup' ? (pickup.lat != null ? pickup : null) : (dropoff.lat != null ? dropoff : null);

  return (
    <Shell go={go} active="send" domains={domains}>
      <div className="vd-wrap">
        <PageHead title={step === 3 ? 'Request placed' : 'Send a Package'} sub={step === 3 ? null : 'Motorcycle delivery across Mandeville and nearby areas.'} />
        <Steps steps={STEPS} current={step} />

        {step === 3 ? (
          <div className="vd-panel vd-done" style={{ maxWidth: 560, margin: '0 auto 40px' }}>
            <div className="vd-done__art"><DoneArt /></div>
            <h1>We’re finding your rider</h1>
            <p>You’ll get a notification when a rider accepts. You can cancel free of charge until the package is collected.</p>
            <span className="vd-done__id">Delivery ID {String(doneId || '').toUpperCase()}</span>
            <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
              <button className="vd-btn vd-btn--primary vd-btn--block" onClick={() => openDelivery(doneId)}>Track delivery</button>
              <button className="vd-btn vd-btn--secondary vd-btn--block" onClick={restart}>Send another package</button>
            </div>
          </div>
        ) : (
          <div className="vd-split" style={{ paddingBottom: 40 }}>
            <div>
              {step === 0 && (
                <>
                  <div className="vd-panel">
                    <div className="vd-panel__title">Pickup</div>
                    <AddressBlock shared={shared} kind="pickup" value={pickup} onChange={setPickup} error={show(0, routeErrors, 'pickupAddr')} />
                    <div className="vd-choice vd-choice--2 vd-choice--stack" style={{ marginTop: 14 }}>
                      <Field label="Sender name" error={show(0, routeErrors, 'sender')}>
                        <input className="vd-input" value={pickup.contactName || ''} maxLength={80} autoComplete="name" onChange={(e) => setPickup({ ...pickup, contactName: e.target.value })} />
                      </Field>
                      <Field label="Sender phone" error={show(0, routeErrors, 'senderPhone')}>
                        <input className="vd-input" type="tel" inputMode="tel" autoComplete="tel" value={pickup.contactPhone || ''} maxLength={20} placeholder="876…" onChange={(e) => setPickup({ ...pickup, contactPhone: e.target.value })} />
                      </Field>
                    </div>
                    <Optional label="Add pickup instructions" initiallyOpen={!!pickup.instructions}>
                      <Field label="Pickup instructions (optional)">
                        <textarea className="vd-input" value={pickup.instructions || ''} maxLength={300} onChange={(e) => setPickup({ ...pickup, instructions: e.target.value })} placeholder="e.g. Ask for Marcia at the front desk" />
                      </Field>
                    </Optional>
                  </div>

                  <div className="vd-panel">
                    <div className="vd-panel__title">Drop-off</div>
                    <AddressBlock shared={shared} kind="dropoff" value={dropoff} onChange={setDropoff} error={show(0, routeErrors, 'dropAddr')} />
                    <div className="vd-choice vd-choice--2 vd-choice--stack" style={{ marginTop: 14 }}>
                      <Field label="Recipient name" error={show(0, routeErrors, 'recipient')}>
                        <input className="vd-input" value={dropoff.recipientName || ''} maxLength={80} onChange={(e) => setDropoff({ ...dropoff, recipientName: e.target.value })} />
                      </Field>
                      <Field label="Recipient phone" error={show(0, routeErrors, 'recipientPhone')}>
                        <input className="vd-input" type="tel" inputMode="tel" value={dropoff.recipientPhone || ''} maxLength={20} placeholder="876…" onChange={(e) => setDropoff({ ...dropoff, recipientPhone: e.target.value })} />
                      </Field>
                    </div>
                    <Optional label="Add another contact or delivery instructions" initiallyOpen={!!(dropoff.altPhone || dropoff.instructions)}>
                      <Field label="Alternative phone (optional)">
                        <input className="vd-input" type="tel" inputMode="tel" value={dropoff.altPhone || ''} maxLength={20} onChange={(e) => setDropoff({ ...dropoff, altPhone: e.target.value })} />
                      </Field>
                      <Field label="Delivery instructions (optional)">
                        <textarea className="vd-input" value={dropoff.instructions || ''} maxLength={300} onChange={(e) => setDropoff({ ...dropoff, instructions: e.target.value })} />
                      </Field>
                    </Optional>
                  </div>

                  <div className="vd-panel">
                    <div className="vd-panel__title">Check the map</div>
                    <div className="vd-tabs" role="tablist" aria-label="Tap the map to place">
                      {[['pickup', 'Place pickup pin'], ['dropoff', 'Place drop-off pin']].map(([k, l]) => (
                        <button key={k} role="tab" aria-selected={pinFor === k} onClick={() => setPinFor(k)}>{l}</button>
                      ))}
                    </div>
                    <div className="vd-map">
                      <VilleMap height={260} center={focusPos ? { lat: focusPos.lat, lng: focusPos.lng } : MANDEVILLE} zoom={focusPos ? 16 : 13}
                        markers={markers} onClick={(e) => setPinAt(e.latLng.lat(), e.latLng.lng())} />
                    </div>
                    <span className="vd-field__hint">Tap the map to put the {pinFor === 'pickup' ? 'pickup' : 'drop-off'} pin exactly where the rider should go.</span>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <button className="vd-btn vd-btn--primary vd-btn--block" onClick={nextFromRoute}>Continue to package details</button>
                    {tried[0] && !ok(routeErrors) && <div className="vd-errbox">Some details are missing. Check the highlighted fields.</div>}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="vd-panel">
                    <div className="vd-panel__title">What are you sending?</div>
                    <div className="vd-pills" role="radiogroup" aria-label="Package category">
                      {PACKAGE_CATEGORIES.map(([k, l]) => (
                        <button key={k} className="vd-filter" role="radio" aria-checked={pkg.category === k} aria-pressed={pkg.category === k} onClick={() => setPkg({ ...pkg, category: k })}>{l}</button>
                      ))}
                    </div>
                    {show(1, pkgErrors, 'category') && <span className="vd-field__err">{pkgErrors.category}</span>}
                    <Field label="Description" error={show(1, pkgErrors, 'description')}>
                      <input className="vd-input" value={pkg.description} maxLength={300} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} placeholder="e.g. Birthday gift in a small box" />
                    </Field>
                  </div>
                  <div className="vd-panel">
                    <div className="vd-panel__title">Size and weight</div>
                    <div className="vd-choice" role="radiogroup" aria-label="Package size">
                      {PACKAGE_SIZES.map(([k, l, d]) => (
                        <button key={k} className="vd-opt" role="radio" aria-checked={pkg.size === k} onClick={() => setPkg({ ...pkg, size: k })}>
                          <span><b>{l}</b><small>{d}</small></span>
                        </button>
                      ))}
                    </div>
                    <Field label="Approximate weight in kg (optional)" error={show(1, pkgErrors, 'weight')}>
                      <input className="vd-input" type="number" inputMode="decimal" min="0" max="20" step="0.5" value={pkg.weightKg} onChange={(e) => setPkg({ ...pkg, weightKg: e.target.value })} />
                    </Field>
                    <label className="vd-check" style={{ marginTop: 12 }}>
                      <input type="checkbox" checked={pkg.fragile} onChange={(e) => setPkg({ ...pkg, fragile: e.target.checked })} />
                      <span>Fragile, handle with care</span>
                    </label>
                    <Optional label="Add handling instructions" initiallyOpen={!!pkg.handling}>
                      <Field label="Handling instructions (optional)">
                        <input className="vd-input" value={pkg.handling} maxLength={200} onChange={(e) => setPkg({ ...pkg, handling: e.target.value })} placeholder="e.g. Keep upright" />
                      </Field>
                    </Optional>
                  </div>
                  <div className="vd-panel">
                    <div className="vd-panel__title">Items we can’t carry</div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14.5 }}>{PROHIBITED_SUMMARY.map((p) => <li key={p}>{p}</li>)}</ul>
                    <label className="vd-check" style={{ marginTop: 10 }}>
                      <input type="checkbox" checked={rulesOk} onChange={(e) => setRulesOk(e.target.checked)} />
                      <span>This package contains none of these items. I understand the rider may refuse anything unsafe.</span>
                    </label>
                    {show(1, pkgErrors, 'rules') && <span className="vd-field__err">{pkgErrors.rules}</span>}
                  </div>
                  {err && <div className="vd-errbox" role="alert">{err}</div>}
                  <div className="vd-choice vd-choice--2" style={{ marginTop: 16 }}>
                    <button className="vd-btn vd-btn--secondary" onClick={() => { setStep(0); top(); }}>Back</button>
                    <button className="vd-btn vd-btn--primary" disabled={busy} onClick={getQuote}>{busy ? 'Getting your price…' : 'See price'}</button>
                  </div>
                </>
              )}

              {step === 2 && quote && (
                <>
                  <div className="vd-show-mobile" style={{ marginBottom: 14 }}><Summary pickup={pickup} dropoff={dropoff} pkg={pkg} quote={null} /></div>
                  <div className="vd-panel">
                    <div className="vd-panel__title">Price</div>
                    {quote.lines.map((l) => <div key={l.key} className="vd-row"><span>{l.label}</span><span>{formatJMD(l.cents)}</span></div>)}
                    <div className="vd-total"><span>Total</span><b>{formatJMD(quote.totalCents)}</b></div>
                    <p className="vd-field__hint">Distance is about {quote.distanceKm} km by road, estimated.</p>
                    {quote.pricingPlaceholder && <div className="vd-warnbox" style={{ marginTop: 12 }}>Test pricing. Final VilleDash rates haven’t been published yet.</div>}
                  </div>
                  <div className="vd-panel">
                    <div className="vd-panel__title">Payment</div>
                    <p style={{ fontSize: 14.5, marginBottom: 10 }}>Pay the rider in cash. Who pays?</p>
                    <div className="vd-choice vd-choice--2" role="radiogroup" aria-label="Who pays">
                      {[['sender', 'Me, at pickup'], ['recipient', 'Recipient, on delivery']].map(([k, l]) => (
                        <button key={k} className="vd-opt" role="radio" aria-checked={payer === k} onClick={() => setPayer(k)}><span><b>{l}</b></span></button>
                      ))}
                    </div>
                  </div>
                  <div className="vd-panel">
                    <div className="vd-panel__title">Before you place it</div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14.5, display: 'grid', gap: 6 }}>
                      <li>You’re not charged anything if no rider can take it.</li>
                      <li>You can cancel free of charge until the rider collects the package.</li>
                      <li>We give you a 4-digit PIN. Share it with {dropoff.recipientName || 'the recipient'}; they give it to the rider only after receiving the package.</li>
                    </ul>
                  </div>
                  {err && <div className="vd-errbox" role="alert">{err}</div>}
                  <div className="vd-choice vd-choice--2" style={{ marginTop: 16 }}>
                    <button className="vd-btn vd-btn--secondary" disabled={busy} onClick={() => { setStep(1); top(); }}>Back</button>
                    <button className="vd-btn vd-btn--primary" disabled={busy} onClick={place}>{busy ? 'Placing request…' : `Place request, ${formatJMD(quote.totalCents)}`}</button>
                  </div>
                </>
              )}
            </div>
            <aside className="vd-split__aside vd-hide-mobile">
              <Summary pickup={pickup} dropoff={dropoff} pkg={pkg} quote={step === 2 ? quote : null} />
              {step < 2 && <p className="vd-field__hint" style={{ marginTop: 10 }}><Chip tone="brand" plain>Cash</Chip> You’ll see the full price before you book.</p>}
            </aside>
          </div>
        )}
      </div>
    </Shell>
  );
}

