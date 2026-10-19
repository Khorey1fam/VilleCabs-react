import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import App, { LiveTrackShare } from './App';
import AdminPanel from './AdminPanel';
import RiderPortal from './dash/RiderPortal';
import MerchantPortal from './dash/MerchantPortal';
import CreatorStats from './creators/CreatorStats';
import './index.css';

// Private creator stats page — /creator/:token
function CreatorRoute() {
  const { token } = useParams();
  return <CreatorStats token={token} />;
}

// Public live-tracking page — pulls the ride id from the URL (/track/:id)
function TrackRoute() {
  const { id } = useParams();
  return <LiveTrackShare trackId={id} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/admin"      element={<AdminPanel/>}/>
      <Route path="/track/:id"  element={<TrackRoute/>}/>
      <Route path="/creator/:token" element={<CreatorRoute/>}/>
      <Route path="/rider/*"    element={<RiderPortal/>}/>
      <Route path="/merchant/*" element={<MerchantPortal/>}/>
      <Route path="/*"          element={<App/>}/>
    </Routes>
  </BrowserRouter>
);
