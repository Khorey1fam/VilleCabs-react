// AdminDashboard — approve/reject drivers, monitor rides
import React, { useEffect, useState } from 'react';
import { getPendingDrivers, approveDriver, rejectDriver } from '../../services/firestoreService';

export default function AdminDashboard() {
  const [drivers, setDrivers] = useState([]);
  const [tab, setTab]         = useState('pending');

  useEffect(() => { getPendingDrivers().then(setDrivers); }, []);

  const handleApprove = async (uid) => {
    await approveDriver(uid);
    setDrivers(prev => prev.filter(d => d.id !== uid));
  };

  const handleReject = async (uid) => {
    const reason = prompt('Rejection reason (optional):') || '';
    await rejectDriver(uid, reason);
    setDrivers(prev => prev.filter(d => d.id !== uid));
  };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 16 }}>Pending applications ({drivers.length})</h2>
      {drivers.map(d => (
        <div key={d.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>{d.name}</strong>
            <span style={{ fontSize: 12, color: '#888' }}>{d.vehicleMake} {d.vehicleModel} · {d.licensePlate}</span>
          </div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>TRN: {d.trn} · DOB: {d.dob} · {d.phone}</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['license','fitness','registration'].map(doc => (
              d.docs?.[doc]
                ? <a key={doc} href={d.docs[doc]} target="_blank" rel="noreferrer" style={{ fontSize: 11, padding: '3px 8px', background: '#eaf3de', borderRadius: 20, color: '#27500a' }}>{doc} ✓</a>
                : <span key={doc} style={{ fontSize: 11, padding: '3px 8px', background: '#fcebeb', borderRadius: 20, color: '#791f1f' }}>{doc} missing</span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleApprove(d.id)} style={{ flex: 1, padding: 10, background: '#1a9e5a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Approve</button>
            <button onClick={() => handleReject(d.id)}  style={{ flex: 1, padding: 10, background: '#fcebeb', color: '#791f1f', border: '1px solid #f09595', borderRadius: 8, cursor: 'pointer' }}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
