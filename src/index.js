import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App';
import AdminPanel from './AdminPanel';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/admin" element={<AdminPanel/>}/>
      <Route path="/*"     element={<App/>}/>
    </Routes>
    <SpeedInsights />
  </BrowserRouter>
);