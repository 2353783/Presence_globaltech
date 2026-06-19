/**
 * Calculates the distance between two points on Earth using the Haversine formula.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lon1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lon2 Longitude of point 2
 * @returns {number} Distance in meters
 */
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const OFFICE_COORDS = {
  lat: -4.353806739355228,
  lon: 15.331295448423079
};

export const ALLOWED_RADIUS_METERS = 100;

export const ALLOWED_LOCATIONS = [
  {
    name: "BUREAU GLOBAL TECH",
    lat: -4.353806739355228,
    lon: 15.331295448423079,
    radius: 100
  },
  {
    name: "Financial Managing Support (FMS)",
    lat: -4.3137123,
    lon: 15.2919295,
    radius: 100
  },
  {
    name: "East Castler Infracture",
    lat: -4.3190625,
    lon: 15.2810625,
    radius: 100
  }
];

export function getMatchingLocation(lat, lon) {
  for (const loc of ALLOWED_LOCATIONS) {
    const dist = getDistance(lat, lon, loc.lat, loc.lon);
    if (dist <= loc.radius) {
      return loc;
    }
  }
  return null;
}

