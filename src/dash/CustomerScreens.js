// VILLE home hub, VilleDash home and delivery history (customer side).
import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { dashDb, STATUS_LABEL, FINAL, formatJMD } from './dashApi';
import { C, st, Header, Pill, statusTone, Spinner } from './ui';

const ACTIVE_RIDE = ['searching', 'active', 'arrived', 'enroute', 'scheduled'];
const ACTIVE_DELIVERY = ['requested', 'assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'];

function useActiveRides(uid) {
  const [rides, setRides] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(dashDb(), 'bookings'), where('customerId', '==', uid), where('status', 'in', ACTIVE_RIDE));
    return onSnapshot(q, (s) => setRides(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRides([]));
  }, [uid]);
  return rides;
}
export function useMyDeliveries(uid, { activeOnly = false, max = 30 } = {}) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    const base = collection(dashDb(), 'dash_deliveries');
    const q = activeOnly
      ? query(base, where('customerId', '==', uid), where('status', 'in', ACTIVE_DELIVERY))
      : query(base, where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(max));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([]));
  }, [uid, activeOnly, max]);
  return list;
}

function ServiceCard({ eyebrow, title, desc, onClick, emoji }) {
  return (
    <button onClick={onClick}
      style={{ ...st.card, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center', padding: 18 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: C.purpleSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: C.purple, textTransform: 'uppercase' }}>{eyebrow}</div>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: C.ink, margin: '2px 0 3px' }}>{title}</div>
        <div style={{ fontSize: 13, color: C.quiet, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ color: C.purple, fontSize: 22 }}>›</div>
    </button>
  );
}

function DeliveryRow({ d, onOpen }) {
  return (
    <button onClick={() => onOpen(d.id)}
      style={{ ...st.card, width: '100%', textAlign: 'left', cursor: 'pointer', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>📦 To {d.dropoff?.recipientName || 'recipient'}</div>
        <Pill tone={statusTone(d.status)}>{STATUS_LABEL[d.status] || d.status}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.pickup?.address?.split(',')[0]} → {d.dropoff?.address?.split(',')[0]}
      </div>
      <div style={{ fontSize: 12.5, color: C.quiet, marginTop: 2 }}>
        {d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('en-JM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Just now'}
        {' · '}{formatJMD(d.quote?.totalCents)} cash
      </div>
    </button>
  );
}

// ── VILLE home ───────────────────────────────────────────────────────────────
export function VilleHome({ go, user, setBookingId, openDelivery }) {
  const rides = useActiveRides(user?.uid);
  const deliveries = useMyDeliveries(user?.uid, { activeOnly: true });
  const first = (user?.name || '').split(' ')[0];
  return (
    <div style={st.page}>
      <div style={{ background: `linear-gradient(160deg, ${C.purple}, ${C.purpleDark})`, color: C.white }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '26px 18px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <img src="/logo.png" alt="VILLE" style={{ height: 28, objectFit: 'contain', background: C.white, borderRadius: 8, padding: '3px 6px' }} />
            <button onClick={() => go('customer-profile')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: C.white, borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {first || 'Account'}
            </button>
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 22 }}>Welcome to VILLE</div>
          <div style={{ fontSize: 15, opacity: 0.85, marginTop: 4 }}>Your City. One App.</div>
        </div>
      </div>

      <div style={{ ...st.wrap, marginTop: -16 }}>
        <ServiceCard emoji="🚕" eyebrow="VilleCabs" title="Book a Ride" desc="Reliable local transportation around Mandeville." onClick={() => go('customer-dash')} />
        <ServiceCard emoji="📦" eyebrow="VilleDash" title="Send or Order" desc="Send a package or order from local businesses." onClick={() => go('dash-home')} />
        <ServiceCard emoji="🎉" eyebrow="VilleEvents" title="Discover Events" desc="See what's on and book a ride there." onClick={() => go('ville-events')} />

        <div style={{ ...st.h2, marginTop: 18 }}>Your activity</div>
        {rides.length === 0 && deliveries && deliveries.length === 0 && (
          <div style={{ ...st.card, ...st.sub }}>Nothing in progress. Book a ride or send a package to get started.</div>
        )}
        {rides.map((r) => (
          <button key={r.id} onClick={() => { setBookingId(r.id); go(r.status === 'scheduled' ? 'customer-dash' : 'live-ride'); }}
            style={{ ...st.card, width: '100%', textAlign: 'left', cursor: 'pointer', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>🚕 Ride to {r.dropoff?.address?.split(',')[0] || 'destination'}</div>
              <Pill>{r.status === 'searching' ? 'Finding a driver' : r.status === 'scheduled' ? 'Scheduled' : 'In progress'}</Pill>
            </div>
          </button>
        ))}
        {deliveries === null ? <Spinner /> : deliveries.map((d) => <DeliveryRow key={d.id} d={d} onOpen={openDelivery} />)}
      </div>
    </div>
  );
}

// ── VilleDash home ───────────────────────────────────────────────────────────
export function DashHome({ go, user, openDelivery }) {
  const active = useMyDeliveries(user?.uid, { activeOnly: true });
  return (
    <div style={st.page}>
      <Header title="VilleDash" onBack={() => go('ville-home')} />
      <div style={st.wrap}>
        <div style={{ padding: '6px 2px 14px' }}>
          <div style={st.h1}>Send It. Track It. Delivered.</div>
          <div style={st.sub}>Motorcycle delivery across Mandeville. Pay cash on pickup or delivery.</div>
        </div>
        <ServiceCard emoji="📦" eyebrow="Option A" title="Send a Package" desc="Documents, gifts, parcels — picked up and delivered by a VilleDash rider." onClick={() => go('dash-send')} />
        <ServiceCard emoji="🛍️" eyebrow="Option B" title="Order from Stores" desc="Restaurants, supermarkets and local shops. Opening soon as stores join." onClick={() => go('dash-stores')} />

        <div style={{ ...st.h2, marginTop: 18 }}>Active deliveries</div>
        {active === null ? <Spinner /> : active.length === 0
          ? <div style={{ ...st.card, ...st.sub }}>No deliveries in progress.</div>
          : active.map((d) => <DeliveryRow key={d.id} d={d} onOpen={openDelivery} />)}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <button style={st.btnGhost} onClick={() => go('dash-history')}>Delivery history</button>
          <button style={st.btnGhost} onClick={() => go('contact-us')}>Help & support</button>
        </div>
      </div>
    </div>
  );
}

// ── Stores placeholder (marketplace is the next build phase) ─────────────────
export function DashStores({ go }) {
  return (
    <div style={st.page}>
      <Header title="Order from Stores" onBack={() => go('dash-home')} />
      <div style={st.wrap}>
        <div style={{ ...st.card, textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 40 }}>🛍️</div>
          <div style={{ ...st.h2, marginTop: 8 }}>Stores are joining VilleDash</div>
          <div style={st.sub}>Ordering opens when the first Mandeville businesses are approved. Until then you can send a package.</div>
          <button style={{ ...st.btn, marginTop: 16 }} onClick={() => go('dash-send')}>Send a package</button>
        </div>
      </div>
    </div>
  );
}

// ── History ──────────────────────────────────────────────────────────────────
export function DashHistory({ go, user, openDelivery }) {
  const list = useMyDeliveries(user?.uid, { max: 50 });
  return (
    <div style={st.page}>
      <Header title="Delivery history" onBack={() => go('dash-home')} />
      <div style={st.wrap}>
        {list === null ? <Spinner /> : list.length === 0
          ? <div style={{ ...st.card, ...st.sub }}>You haven't sent anything yet.</div>
          : list.map((d) => <DeliveryRow key={d.id} d={d} onOpen={openDelivery} />)}
        {list && list.some((d) => !FINAL.includes(d.status)) && <div style={st.note}>Tap a delivery in progress to track it live.</div>}
      </div>
    </div>
  );
}
