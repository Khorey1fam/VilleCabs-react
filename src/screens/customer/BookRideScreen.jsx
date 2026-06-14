// BookRideScreen — customer selects pickup/drop-off & vehicle
import React, { useState } from 'react';
import { useFare } from '../../hooks/useFare';
import { haversineKm, MANCHESTER_CENTER } from '../../utils/fareCalculator';
import { createBooking } from '../../services/firestoreService';

export default function BookRideScreen({ currentUser, onBookingCreated }) {
  const [pickup, setPickup]           = useState(MANCHESTER_CENTER);
  const [dropoff, setDropoff]         = useState(null);
  const [pickupAddress, setPickupAddress]   = useState('Manchester, Jamaica');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('VILLE_RIDE');
  const [booking, setBooking]         = useState(false);

  const { allFares, formatJMD } = useFare();
  const distance = dropoff ? haversineKm(pickup, dropoff) : 0;
  const fares    = allFares(distance);

  // Map click handler — pass lat/lng from Google Maps onClick event
  const handleMapClick = (e) => {
    const latLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    if (!dropoff) setPickup(latLng);
    else setDropoff(latLng);
  };

  const handleBook = async () => {
    if (!dropoff) return;
    setBooking(true);
    const fare = fares.find(f => f.type === selectedVehicle);
    const id = await createBooking({
      customerId: currentUser.uid,
      customerName: currentUser.displayName || currentUser.email,
      pickup:  { coords: pickup,  address: pickupAddress },
      dropoff: { coords: dropoff, address: dropoffAddress },
      vehicleType: selectedVehicle,
      fare: fare.totalFare,
      distanceKm: distance,
    });
    setBooking(false);
    onBookingCreated(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Drop GoogleMap component here — pass handleMapClick to onClick prop */}
      <div style={{ height: '45%', background: '#1a2744', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8b400' }}>
        [GoogleMap — Mandeville, Manchester, JA]
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)}
          placeholder="Pickup — Manchester, Jamaica" style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 8, border: '1px solid #ccc' }} />
        <input value={dropoffAddress} onChange={e => setDropoffAddress(e.target.value)}
          placeholder="Where are you going?" style={{ width: '100%', padding: 10, marginBottom: 16, borderRadius: 8, border: '1px solid #ccc' }} />

        {fares.map(({ type, totalFare, vehicleName }) => (
          <div key={type} onClick={() => setSelectedVehicle(type)}
            style={{ border: `2px solid ${selectedVehicle === type ? '#e8b400' : '#eee'}`, borderRadius: 12, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span>{vehicleName}</span>
            <strong>{formatJMD(totalFare)}</strong>
          </div>
        ))}

        <button onClick={handleBook} disabled={!dropoff || booking}
          style={{ width: '100%', padding: 14, background: '#e8b400', color: '#1a1a2e', border: 'none', borderRadius: 12, fontWeight: 500, fontSize: 15, cursor: 'pointer', marginTop: 8 }}>
          {booking ? 'Booking…' : `Book — ${formatJMD(fares.find(f => f.type === selectedVehicle)?.totalFare || 0)}`}
        </button>
      </div>
    </div>
  );
}
