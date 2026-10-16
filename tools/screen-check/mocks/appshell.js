import React from 'react';
export function AddressAutocompleteInput({ value, onChange, placeholder }) {
  return <input data-mock="address" value={value || ''} placeholder={placeholder} onChange={(e) => onChange && onChange(e.target.value)} style={{ width: '100%', padding: 11, border: '1px solid #d8d3e6', borderRadius: 10, boxSizing: 'border-box' }} />;
}
export function VilleMap({ height = 200, markers = [], onClick }) {
  return <div data-mock="map" onClick={() => onClick && onClick({ latLng: { lat: () => 18.03 + Math.random() * 0.01, lng: () => -77.51 } })} style={{ height, background: 'repeating-linear-gradient(45deg,#ece9f3,#ece9f3 10px,#f4f2f8 10px,#f4f2f8 20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a83a0', fontSize: 12 }}>Map · {markers.length} marker(s)</div>;
}
export const geocodeLatLng = async () => 'Pinned address, Mandeville';
export const registerRiderPushToken = async () => {};
