// Customer activity: active-delivery cards and the unified My Orders screen.
import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { dashDb, STATUS_LABEL, ORDER_LABEL, FINAL, ORDER_FINAL, formatJMD } from './dashApi';
import { Shell, PageHead, Icon, Chip, SkeletonRows, EmptyState, ErrorState, useLive, docsOf, fmtWhen, shortId, ORDERS_FILTER_KEY } from './kit';
import { EmptyRouteArt } from './art';

const ACTIVE_DELIVERY = ['awaiting_payment', 'requested', 'assigned', 'to_pickup', 'at_pickup', 'collected', 'to_dropoff', 'at_dropoff'];

export function deliveryTone(s) {
  if (s === 'delivered') return 'ok';
  if (s === 'cancelled') return 'off';
  if (s === 'failed') return 'bad';
  if (s === 'requested' || s === 'awaiting_payment') return 'warn';
  return 'brand';
}
export function orderTone(s) {
  if (s === 'delivered') return 'ok';
  if (['rejected', 'failed'].includes(s)) return 'bad';
  if (s === 'cancelled') return 'off';
  if (s === 'awaiting_merchant' || s === 'awaiting_payment') return 'warn';
  return 'brand';
}

// Everything in progress for this customer: parcel deliveries and store orders.
export function useActivity(uid) {
  const del = useLive(() => (uid ? query(collection(dashDb(), 'dash_deliveries'), where('customerId', '==', uid), where('status', 'in', ACTIVE_DELIVERY)) : null),
    [uid], (s) => docsOf(s).filter((d) => d.type !== 'market'));
  const ord = useLive(() => (uid ? query(collection(dashDb(), 'dash_orders'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(15)) : null),
    [uid], (s) => docsOf(s).filter((o) => !ORDER_FINAL.includes(o.status)));
  const active = [
    ...(ord.data || []).map((o) => ({ kind: 'order', id: o.id, v: o, t: o.createdAt?.toMillis?.() || Date.now() })),
    ...(del.data || []).map((d) => ({ kind: 'delivery', id: d.id, v: d, t: d.createdAt?.toMillis?.() || Date.now() })),
  ].sort((a, b) => b.t - a.t);
  return {
    active, loading: !uid ? false : del.loading || ord.loading, error: del.error || ord.error,
    retry: () => { del.retry(); ord.retry(); },
  };
}

export function ActiveDeliveries({ activity, openDelivery, openOrder, max = 2, onMore }) {
  const extra = activity.active.length - max;
  return (
    <section aria-label="In progress">
      {activity.active.slice(0, max).map(({ kind, id, v }) => (kind === 'order' ? (
        <button key={id} className="vd-track" onClick={() => openOrder(id)}>
          <span className="vd-track__icon"><Icon name="bag" /></span>
          <span>
            <span className="vd-track__kind">Store order from {v.merchantName}</span>
            <span className="vd-track__status" style={{ display: 'block' }}>{ORDER_LABEL[v.status] || v.status}</span>
            <span className="vd-track__meta" style={{ display: 'block' }}>Order {shortId(id)}{v.prepMinutes && ['accepted', 'preparing'].includes(v.status) ? `. Store estimate about ${v.prepMinutes} min to prepare` : ''}</span>
          </span>
          <span className="vd-track__go">Track order <Icon name="chevR" size={18} /></span>
        </button>
      ) : (
        <button key={id} className="vd-track" onClick={() => openDelivery(id)}>
          <span className="vd-track__icon"><Icon name="box" /></span>
          <span>
            <span className="vd-track__kind">Package to {v.dropoff?.recipientName || 'recipient'}</span>
            <span className="vd-track__status" style={{ display: 'block' }}>{STATUS_LABEL[v.status] || v.status}</span>
            <span className="vd-track__meta" style={{ display: 'block' }}>Delivery {shortId(id)}{v.riderName ? `. Rider ${v.riderName}${v.riderPlate ? `, ${v.riderPlate}` : ''}` : ''}</span>
          </span>
          <span className="vd-track__go">Track delivery <Icon name="chevR" size={18} /></span>
        </button>
      )))}
      {extra > 0 && onMore && (
        <button className="vd-link" style={{ marginTop: 8 }} onClick={onMore}>{extra} more in progress. See them in My Orders</button>
      )}
    </section>
  );
}

export function DeliveryItem({ d, onOpen }) {
  return (
    <button className="vd-item" onClick={() => onOpen(d.id)}>
      <span className="vd-item__icon"><Icon name="box" /></span>
      <span style={{ minWidth: 0 }}>
        <span className="vd-item__title" style={{ display: 'block' }}>Package to {d.dropoff?.recipientName || 'recipient'}</span>
        <span className="vd-item__sub" style={{ display: 'block' }}>{(d.pickup?.address || '').split(',')[0]} to {(d.dropoff?.address || '').split(',')[0]}</span>
        <span className="vd-item__sub" style={{ display: 'block' }}>{fmtWhen(d.createdAt)}</span>
      </span>
      <span className="vd-item__right">
        <Chip tone={deliveryTone(d.status)}>{STATUS_LABEL[d.status] || d.status}</Chip>
        <span>{formatJMD(d.cashToCollectCents ?? d.quote?.totalCents)}</span>
      </span>
    </button>
  );
}
export function OrderItem({ o, onOpen }) {
  const n = (o.items || []).reduce((s, i) => s + i.qty, 0);
  return (
    <button className="vd-item" onClick={() => onOpen(o.id)}>
      <span className="vd-item__icon"><Icon name="bag" /></span>
      <span style={{ minWidth: 0 }}>
        <span className="vd-item__title" style={{ display: 'block' }}>{o.merchantName}</span>
        <span className="vd-item__sub" style={{ display: 'block' }}>{n} item{n === 1 ? '' : 's'}</span>
        <span className="vd-item__sub" style={{ display: 'block' }}>{fmtWhen(o.createdAt)}</span>
      </span>
      <span className="vd-item__right">
        <Chip tone={orderTone(o.status)}>{ORDER_LABEL[o.status] || o.status}</Chip>
        <span>{formatJMD(o.totalCents)}</span>
      </span>
    </button>
  );
}

const bucketOf = (x) => {
  if (x.kind === 'order') return x.v.status === 'delivered' ? 'done' : ['rejected', 'cancelled', 'failed'].includes(x.v.status) ? 'cancelled' : 'active';
  return x.v.status === 'delivered' ? 'done' : ['cancelled', 'failed'].includes(x.v.status) ? 'cancelled' : 'active';
};

// ── My Orders ───────────────────────────────────────────────────────────────
export function MyOrders({ go, user, openDelivery, openOrder, domains }) {
  const [type, setType] = useState('all');
  const [status, setStatus] = useState(() => {
    try { const v = sessionStorage.getItem(ORDERS_FILTER_KEY); sessionStorage.removeItem(ORDERS_FILTER_KEY); return v === 'active' ? 'active' : 'all'; } catch (e) { return 'all'; }
  });
  const [max, setMax] = useState(20);
  const uid = user?.uid;
  const del = useLive(() => (uid ? query(collection(dashDb(), 'dash_deliveries'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(max)) : null),
    [uid, max], (s) => ({ list: docsOf(s).filter((d) => d.type !== 'market'), full: s.docs.length >= max }));
  const ord = useLive(() => (uid ? query(collection(dashDb(), 'dash_orders'), where('customerId', '==', uid), orderBy('createdAt', 'desc'), limit(max)) : null),
    [uid, max], (s) => ({ list: docsOf(s), full: s.docs.length >= max }));
  useEffect(() => { window.scrollTo?.(0, 0); }, []);

  const all = useMemo(() => [
    ...((ord.data?.list) || []).map((o) => ({ kind: 'order', id: o.id, v: o, t: o.createdAt?.toMillis?.() || Date.now() })),
    ...((del.data?.list) || []).map((d) => ({ kind: 'delivery', id: d.id, v: d, t: d.createdAt?.toMillis?.() || Date.now() })),
  ].sort((a, b) => b.t - a.t), [ord.data, del.data]);
  const shown = all.filter((x) => (type === 'all' || (type === 'parcels' ? x.kind === 'delivery' : x.kind === 'order')) && (status === 'all' || bucketOf(x) === status));
  const loading = (del.loading || ord.loading) && !all.length;
  const error = del.error || ord.error;
  const more = del.data?.full || ord.data?.full;

  return (
    <Shell go={go} active={status === 'active' ? 'track' : 'orders'} domains={domains}>
      <div className="vd-wrap vd-narrow" style={{ maxWidth: 760 }}>
        <PageHead title="My Orders" sub="Packages you’ve sent and orders from stores." />
        <div className="vd-tabs" role="tablist" aria-label="Order type" style={{ marginTop: 8 }}>
          {[['all', 'All'], ['parcels', 'Packages'], ['stores', 'Store orders']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={type === k} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>
        <div className="vd-filters" style={{ marginTop: 10 }}>
          {[['all', 'Everything'], ['active', 'In progress'], ['done', 'Completed'], ['cancelled', 'Cancelled']].map(([k, l]) => (
            <button key={k} className="vd-filter" aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <div style={{ marginTop: 10, paddingBottom: 30 }}>
          {error && !all.length ? <ErrorState onRetry={() => { del.retry(); ord.retry(); }} />
            : loading ? <SkeletonRows n={4} />
              : shown.length === 0 ? (
                all.length === 0
                  ? <EmptyState art={<EmptyRouteArt />} title="No orders yet" body="When you send a package or order from a store, it shows up here."
                    action="Send a Package" onAction={() => go('dash-send')} secondary="Explore Stores" onSecondary={() => go('dash-stores')} />
                  : <EmptyState title="Nothing here" body="No orders match these filters." action="Show everything" onAction={() => { setType('all'); setStatus('all'); }} />
              ) : (
                <div className="vd-list">
                  {shown.map((x) => (x.kind === 'order' ? <OrderItem key={x.id} o={x.v} onOpen={openOrder} /> : <DeliveryItem key={x.id} d={x.v} onOpen={openDelivery} />))}
                </div>
              )}
          {more && !loading && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="vd-btn vd-btn--secondary" onClick={() => setMax((m) => m + 20)}>Show older orders</button>
            </div>
          )}
          {all.some((x) => bucketOf(x) === 'active') && status !== 'active' && (
            <p className="vd-note" style={{ marginTop: 14 }}>Open anything in progress to track it live. Open a finished order for its receipt or to report a problem.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}

export { FINAL };
