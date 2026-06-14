// VilleCabs Fare Calculator — Manchester, Jamaica

export const VEHICLE_TYPES = {
  VILLE_RIDE: { id: 'standard', name: 'VilleRide', baseFare: 300, perKmRate: 55, perMinuteWait: 10, capacity: 4 },
  VILLE_XL:   { id: 'xl',       name: 'VilleXL',   baseFare: 400, perKmRate: 98, perMinuteWait: 15, capacity: 6 },
  VILLE_MOTO: { id: 'moto',     name: 'VilleMoto', baseFare: 200, perKmRate: 37, perMinuteWait: 8,  capacity: 1 },
};

export const PLATFORM_FEE_PERCENT = 15;

export function calculateFare({ vehicleType = 'VILLE_RIDE', distanceKm = 0, waitMinutes = 0, surgeMultiplier = 1.0 }) {
  const v = VEHICLE_TYPES[vehicleType];
  if (!v) throw new Error(`Unknown vehicle type: ${vehicleType}`);
  const baseFare     = v.baseFare;
  const distanceCost = Math.round(distanceKm * v.perKmRate);
  const waitCost     = Math.round(waitMinutes * v.perMinuteWait);
  const subtotal     = baseFare + distanceCost + waitCost;
  const surgeCost    = Math.round(subtotal * (surgeMultiplier - 1));
  const totalFare    = Math.round(subtotal * surgeMultiplier);
  const platformFee  = Math.round(totalFare * (PLATFORM_FEE_PERCENT / 100));
  const driverEarnings = totalFare - platformFee;
  return { vehicleName: v.name, baseFare, distanceCost, waitCost, subtotal, surgeCost, surgeMultiplier, totalFare, platformFee, driverEarnings, distanceKm, waitMinutes };
}

export function formatJMD(amount) {
  return `J$${amount.toLocaleString('en-JM')}`;
}

export function haversineKm(from, to) {
  const R = 6371, dLat = ((to.lat - from.lat) * Math.PI) / 180, dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const MANCHESTER_CENTER = { lat: 18.0416, lng: -77.5036 };
