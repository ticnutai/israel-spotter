/**
 * Convert Israeli Transverse Mercator (ITM / EPSG:2039) coordinates to WGS84 (EPSG:4326).
 * Uses a simplified Transverse Mercator inverse projection with GRS80 ellipsoid.
 */

const a = 6378137.0; // GRS80 semi-major axis
const f = 1 / 298.257222101;
const b = a * (1 - f);
const e2 = (a * a - b * b) / (a * a);
const e_prime2 = (a * a - b * b) / (b * b);

// ITM projection parameters
const k0 = 1.0000067;
const lon0 = (31 + 44 / 60 + 3.8171 / 3600) * (Math.PI / 180); // 31°44'03.8171" E → radians
const lat0 = (31 + 44 / 60 + 3.8171 / 3600) * (Math.PI / 180);
const FE = 219529.584; // false easting
const FN = 626907.39; // false northing

// Meridional arc distance
function M(lat: number): number {
  return a * (
    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * lat -
    (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * lat) +
    (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * lat) -
    (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * lat)
  );
}

const M0 = M(lat0);

// Central meridian for ITM is 35°12'16.261" E
const centralMeridianRad = (35 + 12 / 60 + 16.261 / 3600) * (Math.PI / 180);

export function itmToWgs84(easting: number, northing: number): [number, number] {
  // Remove false easting/northing
  const x = easting - FE;
  const y = northing - FN;

  const M1 = M0 + y / k0;

  // Iterative footpoint latitude
  const mu = M1 / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 = mu +
    (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) +
    (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) +
    (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu) +
    (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = e_prime2 * cosPhi1 * cosPhi1;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const lat = phi1 -
    (N1 * tanPhi1 / R1) * (
      D * D / 2 -
      (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e_prime2) * D * D * D * D / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e_prime2 - 3 * C1 * C1) * D * D * D * D * D * D / 720
    );

  const lon = centralMeridianRad +
    (1 / cosPhi1) * (
      D -
      (1 + 2 * T1 + C1) * D * D * D / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e_prime2 + 24 * T1 * T1) * D * D * D * D * D / 120
    );

  return [lat * (180 / Math.PI), lon * (180 / Math.PI)];
}

/**
 * Convert an ITM GeoJSON geometry to WGS84.
 */
export function convertGeometryToWgs84(geometry: any): any {
  if (!geometry) return null;

  function convertCoord(coord: number[]): number[] {
    const [easting, northing] = coord;
    const [lat, lng] = itmToWgs84(easting, northing);
    return [lng, lat]; // GeoJSON is [lng, lat]
  }

  function convertRing(ring: number[][]): number[][] {
    return ring.map(convertCoord);
  }

  switch (geometry.type) {
    case "Point":
      return { type: "Point", coordinates: convertCoord(geometry.coordinates) };
    case "MultiPoint":
      return { type: "MultiPoint", coordinates: geometry.coordinates.map(convertCoord) };
    case "LineString":
      return { type: "LineString", coordinates: convertRing(geometry.coordinates) };
    case "MultiLineString":
      return { type: "MultiLineString", coordinates: geometry.coordinates.map(convertRing) };
    case "Polygon":
      return { type: "Polygon", coordinates: geometry.coordinates.map(convertRing) };
    case "MultiPolygon":
      return { type: "MultiPolygon", coordinates: geometry.coordinates.map((poly: number[][][]) => poly.map(convertRing)) };
    default:
      return geometry;
  }
}
