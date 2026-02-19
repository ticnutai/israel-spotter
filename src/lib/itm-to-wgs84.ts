/**
 * Convert Israeli Transverse Mercator (ITM / EPSG:2039) coordinates to WGS84 (EPSG:4326).
 * 
 * Uses the official ITM parameters from the Survey of Israel:
 *   • Ellipsoid: GRS80 (a=6378137, 1/f=298.257222101)
 *   • Central meridian: 35°12'16.261" E
 *   • Latitude of origin: 31°44'03.817" N
 *   • Scale factor: 1.0000067
 *   • False Easting: 219529.584 m
 *   • False Northing: 626907.390 m
 *
 * Includes Molodensky datum transformation from Israel 1993 (GRS80) to WGS84:
 *   dX = -24.0024, dY = -17.1032, dZ = -17.8444
 */

// ── GRS80 Ellipsoid (Israel 1993 datum) ──
const a_grs80 = 6378137.0;
const f_grs80 = 1 / 298.257222101;
const b_grs80 = a_grs80 * (1 - f_grs80);
const e2_grs80 = (a_grs80 * a_grs80 - b_grs80 * b_grs80) / (a_grs80 * a_grs80);
const e_prime2_grs80 = (a_grs80 * a_grs80 - b_grs80 * b_grs80) / (b_grs80 * b_grs80);

// ── ITM Projection Parameters ──
const k0 = 1.0000067; // scale factor at central meridian
const centralMeridianDeg = 35 + 12 / 60 + 16.261 / 3600; // 35°12'16.261" E
const latOriginDeg = 31 + 44 / 60 + 3.817 / 3600;        // 31°44'03.817" N
const centralMeridianRad = centralMeridianDeg * (Math.PI / 180);
const latOriginRad = latOriginDeg * (Math.PI / 180);
const FE = 219529.584;  // false easting (meters)
const FN = 626907.390;  // false northing (meters)

// ── Datum shift parameters (Israel 1993 → WGS84, Molodensky) ──
const dX = -24.0024;
const dY = -17.1032;
const dZ = -17.8444;

// WGS84 ellipsoid
const a_wgs84 = 6378137.0;
const f_wgs84 = 1 / 298.257223563;
const b_wgs84 = a_wgs84 * (1 - f_wgs84);
const e2_wgs84 = (a_wgs84 * a_wgs84 - b_wgs84 * b_wgs84) / (a_wgs84 * a_wgs84);

// ── Meridional arc distance ──
function meridionalArc(lat: number): number {
  const e2 = e2_grs80;
  return a_grs80 * (
    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * lat -
    (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * lat) +
    (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * lat) -
    (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * lat)
  );
}

const M0 = meridionalArc(latOriginRad);

/**
 * Molodensky datum transformation: geodetic coords on GRS80 → WGS84
 */
function molodenskyToWgs84(
  latRad: number, lonRad: number,
): { lat: number; lon: number } {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const da = a_wgs84 - a_grs80;             // ~0 (both are 6378137)
  const df = f_wgs84 - f_grs80;             // very small difference

  const e2 = e2_grs80;
  const Rn = a_grs80 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const Rm = a_grs80 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);

  const dLat = (
    -dX * sinLat * cosLon
    - dY * sinLat * sinLon
    + dZ * cosLat
    + da * (Rn * e2 * sinLat * cosLat) / a_grs80
    + df * (Rm / (1 - f_grs80) + Rn * (1 - f_grs80)) * sinLat * cosLat
  ) / (Rm + 0); // h=0 approximation

  const dLon = (
    -dX * sinLon + dY * cosLon
  ) / ((Rn + 0) * cosLat);

  return {
    lat: latRad + dLat,
    lon: lonRad + dLon,
  };
}

/**
 * Convert ITM (EPSG:2039) easting/northing to WGS84 lat/lon.
 * Returns [latitude, longitude] in degrees.
 */
export function itmToWgs84(easting: number, northing: number): [number, number] {
  const e2 = e2_grs80;

  // Remove false easting/northing
  const x = easting - FE;
  const y = northing - FN;

  const M1 = M0 + y / k0;

  // Footpoint latitude (iterative via series expansion)
  const mu = M1 / (a_grs80 * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 = mu +
    (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) +
    (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) +
    (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu) +
    (1097 * e1 * e1 * e1 * e1 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const N1 = a_grs80 / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = e_prime2_grs80 * cosPhi1 * cosPhi1;
  const R1 = a_grs80 * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  // Latitude on GRS80
  const latGrs80 = phi1 -
    (N1 * tanPhi1 / R1) * (
      D * D / 2 -
      (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e_prime2_grs80) * D * D * D * D / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e_prime2_grs80 - 3 * C1 * C1) * D * D * D * D * D * D / 720
    );

  // Longitude on GRS80
  const lonGrs80 = centralMeridianRad +
    (1 / cosPhi1) * (
      D -
      (1 + 2 * T1 + C1) * D * D * D / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e_prime2_grs80 + 24 * T1 * T1) * D * D * D * D * D / 120
    );

  // Apply Molodensky datum shift to WGS84
  const wgs84 = molodenskyToWgs84(latGrs80, lonGrs80);

  return [wgs84.lat * (180 / Math.PI), wgs84.lon * (180 / Math.PI)];
}

/**
 * Molodensky datum transformation: WGS84 → GRS80 (Israel 1993)
 */
function molodenskyFromWgs84(
  latRad: number, lonRad: number,
): { lat: number; lon: number } {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  const da = a_grs80 - a_wgs84;
  const dfVal = f_grs80 - f_wgs84;

  const e2 = e2_wgs84;
  const Rn = a_wgs84 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const Rm = a_wgs84 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);

  const dLat = (
    dX * sinLat * cosLon
    + dY * sinLat * sinLon
    - dZ * cosLat
    + da * (Rn * e2 * sinLat * cosLat) / a_wgs84
    + dfVal * (Rm / (1 - f_wgs84) + Rn * (1 - f_wgs84)) * sinLat * cosLat
  ) / Rm;

  const dLon = (
    dX * sinLon - dY * cosLon
  ) / (Rn * cosLat);

  return {
    lat: latRad + dLat,
    lon: lonRad + dLon,
  };
}

/**
 * Convert WGS84 lat/lon (degrees) to ITM (EPSG:2039) easting/northing.
 * Returns [easting, northing].
 */
export function wgs84ToItm(lat: number, lon: number): [number, number] {
  const latRad_wgs = lat * (Math.PI / 180);
  const lonRad_wgs = lon * (Math.PI / 180);

  // Shift from WGS84 to GRS80/Israel1993
  const grs = molodenskyFromWgs84(latRad_wgs, lonRad_wgs);
  const phi = grs.lat;
  const lambda = grs.lon;

  const e2 = e2_grs80;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const N = a_grs80 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = e_prime2_grs80 * cosPhi * cosPhi;
  const A = cosPhi * (lambda - centralMeridianRad);
  const M = meridionalArc(phi);

  const easting = FE + k0 * N * (
    A +
    (1 - T + C) * A * A * A / 6 +
    (5 - 18 * T + T * T + 72 * C - 58 * e_prime2_grs80) * A * A * A * A * A / 120
  );

  const northing = FN + k0 * (
    M - M0 +
    N * tanPhi * (
      A * A / 2 +
      (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24 +
      (61 - 58 * T + T * T + 600 * C - 330 * e_prime2_grs80) * A * A * A * A * A * A / 720
    )
  );

  return [Math.round(easting * 100) / 100, Math.round(northing * 100) / 100];
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
