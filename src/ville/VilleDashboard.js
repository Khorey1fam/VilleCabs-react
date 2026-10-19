// VILLE signed-in home: the customer's personal dashboard across VilleCabs,
// VilleDash and VilleEvents. Reads the same bookings, deliveries, orders and
// notifications the rest of the app uses; it only changes how they're shown.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { dashDb, STATUS_LABEL as DELIVERY_LABEL, ORDER_LABEL, ORDER_FINAL, formatJMD } from '../dash/dashApi';
import { useMyDeliveries } from '../dash/CustomerScreens';
import { useMyOrders } from '../dash/Marketplace';
import { Icon, logoVille, SERVICES, ServiceMedia, StatusChip, useServiceStatus, openService } from './VilleUI';
import VillePublic from './VillePublic';
import { useEvents, useMySaves, useInbox, markRead } from '../events/eventsData';
import { phase, countdown, whenLine } from '../events/eventTime';

const ACTIVE_RIDE = ['awaiting_payment', 'searching', 'active', 'arrived', 'enroute', 'scheduled'];
const RIDE_LABEL = {
  awaiting_payment: 'Waiting for card payment', searching: 'Finding your driver', active: 'Driver on the way',
  arrived: 'Driver has arrived', enroute: 'On the way to drop-off', scheduled: 'Scheduled',
  completed: 'Completed', cancelled: 'Cancelled', expired: 'No driver found',
};
const ACTIVE_DELIVERY = ['awaiting_payment', 'requested', 'assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'];
const ms = (t) => (Number.isFinite(t) ? t : t && t.toMillis ? t.toMillis() : t && t.seconds ? t.seconds * 1000 : 0);
const when = (t) => {
  const m = ms(t);
  if (!m) return 'Just now';
  const d = new Date(m);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const time = d.toLocaleTimeString('en-JM', { hour: 'numeric', minute: '2-digit' });
  if (m >= today.getTime()) return `Today, ${time}`;
  if (m >= today.getTime() - 86400000) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-JM', { day: 'numeric', month: 'short' });
};
const short = (a) => String(a || '').split(',')[0] || '—';

function useCustomerRides(uid) {
  const [rides, setRides] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(dashDb(), 'bookings'), where('customerId', '==', uid)),
      (s) => { setError(false); setRides(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt))); },
      () => { setError(true); setRides([]); });
  }, [uid]);
  return { rides, error };
}
function useCustomerNotifications(uid) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(query(collection(dashDb(), 'notifications'), where('customerId', '==', uid)),
      (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 5)),
      () => setList([]));
  }, [uid]);
  return list;
}
function useCustomerDoc(uid) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(dashDb(), 'customers', uid), (s) => setD(s.exists() ? s.data() : {}), () => setD({}));
  }, [uid]);
  return d;
}

function Skeleton() {
  return <div style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>{[0, 1].map((i) => <div key={i} className="vl-skel" style={{ height: 44 }} />)}</div>;
}

export default function VilleDashboard({ go, user, setUser, setBookingId, openDelivery, openOrder, domains, onSignOut, setDropoffData }) {
  const uid = user && user.uid;
  const status = useServiceStatus(uid);
  const dashOpen = status.dash !== 'soon';
  const { rides, error: ridesError } = useCustomerRides(uid);
  const deliveries = useMyDeliveries(dashOpen ? uid : null, { max: 10 });
  const orders = useMyOrders(dashOpen ? uid : null, 10);
  const rideNotes = useCustomerNotifications(uid);
  const inbox = useInbox(uid);
  const { events } = useEvents();
  const { saves } = useMySaves(uid);
  const notes = useMemo(() => {
    if (rideNotes === null || inbox === null) return null;
    return [
      ...rideNotes.map((n) => ({ id: `r${n.id}`, text: n.message || 'Update from VilleCabs', t: ms(n.createdAt), read: true })),
      ...inbox.map((n) => ({ id: n.id, text: n.title, sub: n.body, t: ms(n.createdAt), read: !!n.read, eventId: n.eventId, raw: n })),
    ].sort((a, b) => b.t - a.t).slice(0, 5);
  }, [rideNotes, inbox]);
  const upcomingEvents = useMemo(() => {
    if (!events || !saves) return null;
    const byId = new Map(events.map((e) => [e.id, e]));
    return saves.map((sv) => ({ sv, ev: byId.get(sv.eventId) })).filter((x) => x.ev && ['upcoming', 'live', 'tba'].includes(phase(x.ev)))
      .sort((a, b) => (a.ev.startMs || 9e15) - (b.ev.startMs || 9e15)).slice(0, 3);
  }, [events, saves]);
  const openEventPage = (id, tab) => { try { if (id) sessionStorage.setItem('ve_open', id); if (tab) sessionStorage.setItem('ve_tab', tab); } catch (e) { /* ignore */ } go('ville-events'); };
  const rideToEvent = (ev) => {
    if (typeof setDropoffData === 'function') setDropoffData({ address: [ev.venueName, ev.address].filter(Boolean).join(', ') || ev.title, coords: ev.lat != null && ev.lng != null ? { lat: ev.lat, lng: ev.lng } : null, eventId: ev.id, eventTitle: ev.title });
    go('pin-pickup');
  };
  const me = useCustomerDoc(uid);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);
  useEffect(() => { window.scrollTo && window.scrollTo(0, 0); }, []);

  const name = (me && me.name) || (user && user.name) || '';
  const first = name.split(' ')[0];
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;

  const activeRides = (rides || []).filter((r) => ACTIVE_RIDE.includes(r.status));
  const activeDeliveries = (deliveries || []).filter((d) => ACTIVE_DELIVERY.includes(d.status));
  const activeOrders = (orders || []).filter((o) => !ORDER_FINAL.includes(o.status));
  const recent = useMemo(() => [
    ...(rides || []).filter((r) => !ACTIVE_RIDE.includes(r.status)).slice(0, 6).map((r) => ({ kind: 'ride', id: r.id, t: ms(r.completedAt) || ms(r.createdAt), v: r })),
    ...(deliveries || []).filter((d) => !ACTIVE_DELIVERY.includes(d.status)).slice(0, 4).map((d) => ({ kind: 'delivery', id: d.id, t: ms(d.createdAt), v: d })),
    ...(orders || []).filter((o) => ORDER_FINAL.includes(o.status)).slice(0, 4).map((o) => ({ kind: 'order', id: o.id, t: ms(o.createdAt), v: o })),
  ].sort((a, b) => b.t - a.t).slice(0, 6), [rides, deliveries, orders]);

  if (!user) return <VillePublic go={go} user={null} domains={domains} />;

  const openRide = (r) => {
    setBookingId(r.id);
    go(r.status === 'scheduled' ? 'customer-dash' : r.status === 'awaiting_payment' ? 'booking-confirm' : 'live-ride');
  };
  const rideHistory = () => { try { sessionStorage.setItem('vc_dash_tab', 'history'); } catch (e) { /* ignore */ } go('customer-dash'); };
  const signOut = async () => { setMenu(false); if (onSignOut) await onSignOut(); };
  const tabs = [
    ['home', 'Home', () => window.scrollTo && window.scrollTo({ top: 0, behavior: 'smooth' })],
    ['car', 'Ride', () => go('customer-dash')],
    ...(dashOpen ? [['box', 'Orders', () => go('dash-history')]] : []),
    ['ticket', 'Events', () => go('ville-events')],
    ['user', 'Account', () => go('customer-profile')],
  ];
  const nothingActive = rides && activeRides.length === 0 && activeDeliveries.length === 0 && activeOrders.length === 0;

  return (
    <div className="vl vl-app-shell">
      <header className="vl-top">
        <div className="vl-top__in" ref={menuRef} style={{ position: 'relative' }}>
          <button type="button" className="vl-logo" onClick={() => window.scrollTo && window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="VILLE home"><img src={logoVille} alt="VILLE" /></button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="vl-iconbtn" aria-label="Notifications" onClick={() => { const el = document.getElementById('vl-notes'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon name="bell" /></button>
            <button type="button" className="vl-avatar" aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{(first || 'V').charAt(0).toUpperCase()}</button>
          </div>
          {menu && (
            <div className="vl-menu" role="menu">
              <div className="vl-menu__who"><b>{name || 'Your account'}</b><span>{user.email || ''}</span></div>
              <hr />
              <button type="button" role="menuitem" onClick={() => go('customer-profile')}><Icon name="user" size={20} />Profile</button>
              <button type="button" role="menuitem" onClick={rideHistory}><Icon name="history" size={20} />Ride history</button>
              {dashOpen && <button type="button" role="menuitem" onClick={() => go('dash-history')}><Icon name="box" size={20} />My orders</button>}
              <button type="button" role="menuitem" onClick={() => go('customer-settings')}><Icon name="settings" size={20} />Settings</button>
              <button type="button" role="menuitem" onClick={() => go('help')}><Icon name="help" size={20} />Help</button>
              <hr />
              <button type="button" role="menuitem" onClick={signOut} style={{ color: 'var(--vl-red)' }}><Icon name="logout" size={20} />Sign out</button>
            </div>
          )}
        </div>
      </header>

      <main className="vl-home">
        <div className="vl-greet">
          <h1>{hello}</h1>
          <p>What would you like to do today?</p>
        </div>

        <div className="vl-home__cols">
          <div className="vl-col">
            <button type="button" className="vl-where" onClick={() => go('customer-dash')}>
              <span className="vl-where__icon"><Icon name="search" size={20} /></span><span className="vl-where__label">Where to?</span><Icon name="chevron" size={20} />
            </button>

            {/* Active now */}
            {activeRides.map((r) => (
              <button type="button" key={r.id} className="vl-active" onClick={() => openRide(r)}>
                <span className="vl-active__icon"><Icon name="car" size={24} /></span>
                <span className="vl-active__text">
                  <b>{RIDE_LABEL[r.status] || 'Ride in progress'}</b>
                  <span>{r.status === 'scheduled' && r.scheduledFor ? `Pickup ${new Date(r.scheduledFor).toLocaleString('en-JM', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · ` : ''}To {short(r.dropoff && r.dropoff.address)}{r.driverName ? ` · ${r.driverName}` : ''}</span>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
            {(activeDeliveries.length > 0 || activeOrders.length > 0) && (
              <section className="vl-card" aria-label="Deliveries in progress">
                <div className="vl-card__head"><h2>Deliveries in progress</h2></div>
                <div className="vl-rows">
                  {activeOrders.map((o) => (
                    <button type="button" key={o.id} className="vl-row" onClick={() => openOrder(o.id)}>
                      <span className="vl-row__icon"><Icon name="bag" size={20} /></span>
                      <span className="vl-row__main"><span className="vl-row__title">{o.merchantName || 'Store order'}</span><span className="vl-row__sub">{ORDER_LABEL[o.status] || o.status}</span></span>
                      <Icon name="chevron" size={20} />
                    </button>
                  ))}
                  {activeDeliveries.map((d) => (
                    <button type="button" key={d.id} className="vl-row" onClick={() => openDelivery(d.id)}>
                      <span className="vl-row__icon"><Icon name="box" size={20} /></span>
                      <span className="vl-row__main"><span className="vl-row__title">Package to {(d.dropoff && d.dropoff.recipientName) || 'recipient'}</span><span className="vl-row__sub">{DELIVERY_LABEL[d.status] || d.status}</span></span>
                      <Icon name="chevron" size={20} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Services */}
            <section aria-label="Services">
              <div className="vl-mini-svcs">
                {SERVICES.map((s) => (
                  <button type="button" key={s.key} className="vl-mini" onClick={() => openService(s.key, { go, user, status })}>
                    <div className="vl-mini__media"><ServiceMedia s={s} /></div>
                    {status[s.key] !== 'live' && <StatusChip status={status[s.key]} />}
                    <div className="vl-mini__body"><b>{s.brand}</b><small>{s.title}</small></div>
                  </button>
                ))}
              </div>
            </section>

            {/* Your upcoming events */}
            <section className="vl-card" aria-labelledby="vl-events-h">
              <div className="vl-card__head"><h2 id="vl-events-h">Your upcoming events</h2><button type="button" className="vl-link" onClick={() => openEventPage(null, 'mine')}>My Events</button></div>
              {upcomingEvents === null ? <Skeleton /> : upcomingEvents.length === 0 ? (
                <div className="vl-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span>Discover what&rsquo;s happening around Mandeville.</span>
                  <button type="button" className="vl-btn vl-btn--secondary vl-btn--sm" onClick={() => openEventPage(null, 'discover')}>Discover Events</button>
                </div>
              ) : (
                <div className="vl-rows">
                  {upcomingEvents.map(({ sv, ev }) => {
                    const on = sv.remindersOn !== false && (sv.reminders || []).length > 0;
                    return (
                      <div key={ev.id} className="vl-row" style={{ cursor: 'default' }}>
                        <button type="button" onClick={() => openEventPage(ev.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                          <span className="vl-row__icon" style={{ overflow: 'hidden' }}>{ev.posters[0] ? <img src={ev.posters[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name="ticket" size={20} />}</span>
                          <span className="vl-row__main">
                            <span className="vl-row__title">{ev.title}</span>
                            <span className="vl-row__sub">{whenLine(ev)} · {countdown(ev)} · {on ? 'Reminders on' : 'No reminders'}</span>
                          </span>
                        </button>
                        <button type="button" className="vl-btn vl-btn--ghost vl-btn--sm" onClick={() => rideToEvent(ev)} aria-label={`Book a ride to ${ev.title}`}><Icon name="car" size={18} />Ride</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent activity */}
            <section className="vl-card" aria-labelledby="vl-recent-h">
              <div className="vl-card__head"><h2 id="vl-recent-h">Recent activity</h2><button type="button" className="vl-link" onClick={rideHistory}>Ride history</button></div>
              {rides === null ? <Skeleton /> : ridesError ? (
                <div className="vl-empty">We couldn&rsquo;t load your activity right now. Check your connection and try again.</div>
              ) : recent.length === 0 ? (
                <div className="vl-empty">{nothingActive ? 'No trips or deliveries yet. Book your first ride to get started.' : 'Your finished trips and deliveries will show here.'}</div>
              ) : (
                <div className="vl-rows">
                  {recent.map((x) => {
                    if (x.kind === 'ride') {
                      const r = x.v;
                      return (
                        <button type="button" key={`r${x.id}`} className="vl-row" onClick={rideHistory}>
                          <span className="vl-row__icon"><Icon name="car" size={20} /></span>
                          <span className="vl-row__main"><span className="vl-row__title">To {short(r.dropoff && r.dropoff.address)}</span><span className="vl-row__sub">{when(r.completedAt || r.createdAt)} · {RIDE_LABEL[r.status] || r.status}</span></span>
                          {r.fare ? <span className="vl-row__end">J${Number(r.fare).toLocaleString()}</span> : null}
                        </button>
                      );
                    }
                    if (x.kind === 'order') {
                      const o = x.v;
                      return (
                        <button type="button" key={`o${x.id}`} className="vl-row" onClick={() => openOrder(o.id)}>
                          <span className="vl-row__icon"><Icon name="bag" size={20} /></span>
                          <span className="vl-row__main"><span className="vl-row__title">{o.merchantName || 'Store order'}</span><span className="vl-row__sub">{when(o.createdAt)} · {ORDER_LABEL[o.status] || o.status}</span></span>
                          <span className="vl-row__end">{formatJMD(o.totalCents)}</span>
                        </button>
                      );
                    }
                    const d = x.v;
                    return (
                      <button type="button" key={`d${x.id}`} className="vl-row" onClick={() => openDelivery(d.id)}>
                        <span className="vl-row__icon"><Icon name="box" size={20} /></span>
                        <span className="vl-row__main"><span className="vl-row__title">Package to {(d.dropoff && d.dropoff.recipientName) || 'recipient'}</span><span className="vl-row__sub">{when(d.createdAt)} · {DELIVERY_LABEL[d.status] || d.status}</span></span>
                        <span className="vl-row__end">{formatJMD(d.cashToCollectCents != null ? d.cashToCollectCents : d.quote && d.quote.totalCents)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="vl-col">
            <section className="vl-card" id="vl-notes" aria-labelledby="vl-notes-h">
              <div className="vl-card__head"><h2 id="vl-notes-h">Notifications</h2></div>
              {notes === null ? <Skeleton /> : notes.length === 0 ? (
                <div className="vl-empty">You&rsquo;re all caught up. Ride updates and event reminders will appear here.</div>
              ) : (
                <div className="vl-rows">
                  {notes.map((n) => (
                    <button type="button" key={n.id} className="vl-row" style={{ cursor: n.eventId ? 'pointer' : 'default' }}
                      onClick={() => { if (n.raw && !n.read) markRead(n.id); if (n.eventId) openEventPage(n.eventId); }}>
                      <span className="vl-row__icon"><Icon name={n.eventId ? 'ticket' : 'bell'} size={20} /></span>
                      <span className="vl-row__main"><span className="vl-row__title" style={{ whiteSpace: 'normal' }}>{n.text}</span><span className="vl-row__sub">{n.sub ? `${n.sub} · ` : ''}{when(n.t)}</span></span>
                      {!n.read && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--vl-purple)', flexShrink: 0 }} aria-label="Unread" />}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="vl-card" aria-labelledby="vl-acct-h">
              <div className="vl-card__head"><h2 id="vl-acct-h">Account</h2></div>
              <div className="vl-acct">
                <span className="vl-avatar" aria-hidden="true" style={{ width: 46, height: 46, fontSize: 18, cursor: 'default' }}>{(first || 'V').charAt(0).toUpperCase()}</span>
                <span className="vl-acct__text"><b>{name || 'VILLE customer'}</b><span>{user.email || ''}{me && me.phone ? ` · ${me.phone}` : ''}</span></span>
              </div>
              <div className="vl-rows">
                <button type="button" className="vl-row" onClick={() => go('customer-profile')}><span className="vl-row__icon"><Icon name="user" size={20} /></span><span className="vl-row__main"><span className="vl-row__title">Profile</span></span><Icon name="chevron" size={20} /></button>
                <button type="button" className="vl-row" onClick={() => go('customer-settings')}><span className="vl-row__icon"><Icon name="settings" size={20} /></span><span className="vl-row__main"><span className="vl-row__title">Settings</span></span><Icon name="chevron" size={20} /></button>
                <button type="button" className="vl-row" onClick={signOut}><span className="vl-row__icon" style={{ color: 'var(--vl-red)', background: 'var(--vl-red-l)' }}><Icon name="logout" size={20} /></span><span className="vl-row__main"><span className="vl-row__title" style={{ color: 'var(--vl-red)' }}>Sign out</span></span></button>
              </div>
            </section>
          </div>
        </div>
      </main>

      <nav className="vl-tabbar" aria-label="VILLE">
        <div className="vl-tabbar__in" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(([icon, label, fn], i) => (
            <button type="button" key={label} aria-current={i === 0 ? 'page' : undefined} onClick={fn}><Icon name={icon} size={23} />{label}</button>
          ))}
        </div>
      </nav>
    </div>
  );
}
