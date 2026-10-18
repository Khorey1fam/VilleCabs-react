import React from 'react';
export const useJsApiLoader = () => ({ isLoaded: false, loadError: null });
export const GoogleMap = ({ children }) => <div data-mock="gmap">{children}</div>;
export const Marker = () => null;
export const DirectionsRenderer = () => null;
