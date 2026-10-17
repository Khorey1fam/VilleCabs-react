// About VilleDash and the delivery terms summary. Plain content pages.
import React from 'react';
import { PROHIBITED_SUMMARY } from './dashApi';
import { Shell, PageHead } from './kit';

export function DashAbout({ go, domains, publicMode }) {
  return (
    <Shell go={go} domains={domains} footer publicMode={publicMode} onSignIn={() => go('customer-login')}>
      <div className="vd-wrap">
        <PageHead title="About VilleDash" />
        <div className="vd-prose" style={{ paddingBottom: 20 }}>
          <p>VilleDash is the delivery service of VILLE, the Mandeville company behind VilleCabs and VilleEvents. Motorcycle riders pick up and deliver packages, and bring orders from local restaurants, grocers and shops, across Mandeville and nearby areas of Manchester.</p>
          <h2>Two ways to use it</h2>
          <ul>
            <li><b>Send a Package.</b> Documents, gifts and parcels from one address to another. You see the price before you book.</li>
            <li><b>Order from Stores.</b> Browse approved local businesses, order, and pay the rider in cash when it arrives.</li>
          </ul>
          <h2>How deliveries stay safe</h2>
          <p>Riders are checked and approved by VILLE before they can take jobs. Every delivery has a 4-digit PIN that the recipient gives the rider only after receiving it, and you can follow the rider live while the job is active.</p>
          <h2>One account</h2>
          <p>Your VILLE account works for VilleCabs, VilleDash and VilleEvents.</p>
        </div>
      </div>
    </Shell>
  );
}

export function DashTerms({ go, domains, publicMode }) {
  return (
    <Shell go={go} domains={domains} footer publicMode={publicMode} onSignIn={() => go('customer-login')}>
      <div className="vd-wrap">
        <PageHead title="Delivery terms" sub="A summary of how VilleDash deliveries work." />
        <div className="vd-prose" style={{ paddingBottom: 20 }}>
          <h2>Service area</h2>
          <p>VilleDash delivers within its service area around Mandeville. The app checks every pickup and drop-off address and tells you if it’s outside the area.</p>
          <h2>Prices and payment</h2>
          <p>The price is worked out from distance, package size and any fragile handling, and shown before you book. Payment is in cash to the rider: for packages, by the sender at pickup or the recipient on delivery, as chosen when booking; for store orders, on delivery.</p>
          <h2>Items we don’t carry</h2>
          <ul>{PROHIBITED_SUMMARY.map((p) => <li key={p}>{p}</li>)}</ul>
          <p>Riders may refuse any item that looks unsafe or doesn’t match its description.</p>
          <h2>Cancelling</h2>
          <p>You can cancel a package delivery free of charge until the rider collects it. You can cancel a store order until the store has started preparing it.</p>
          <h2>Proof of delivery</h2>
          <p>A delivery is complete when the recipient gives the rider the 4-digit PIN. Riders may also take a photo at pickup and drop-off.</p>
          <h2>Problems</h2>
          <p>Use “Report a problem” on any delivery in My Orders, or contact support. Each report gets a case number.</p>
        </div>
      </div>
    </Shell>
  );
}
