// useFare — React hook for live fare calculation
import { useState, useCallback } from 'react';
import { calculateFare, VEHICLE_TYPES, formatJMD } from '../utils/fareCalculator';

export function useFare() {
  const [vehicleType, setVehicleType]       = useState('VILLE_RIDE');
  const [distanceKm, setDistanceKm]         = useState(0);
  const [surgeMultiplier, setSurgeMultiplier] = useState(1.0);

  const fare = calculateFare({ vehicleType, distanceKm, surgeMultiplier });

  const allFares = useCallback((km, surge = 1.0) =>
    Object.keys(VEHICLE_TYPES).map(type => ({
      type, ...calculateFare({ vehicleType: type, distanceKm: km, surgeMultiplier: surge }),
    })), []);

  return { vehicleType, setVehicleType, distanceKm, setDistanceKm, surgeMultiplier, setSurgeMultiplier, fare, allFares, formatJMD };
}
