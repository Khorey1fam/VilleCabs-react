import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import App, { LiveTrackShare } from './App';
import AdminPanel from './AdminPanel';
import './index.css';

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
      <Route path="/*"          element={<App/>}/>
    </Routes>
  </BrowserRouter>
);
