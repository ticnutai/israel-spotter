/**
 * geocode.ts – Geo-search for Gush/Helka and Address
 *
 * Uses Survey of Israel ArcGIS REST services for parcel/block lookup
 * and Photon (Komoot) for address geocoding.
 */

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

// ── ArcGIS boundary services (Survey of Israel) ─────────────────────────────
const PARCEL_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%97%D7%9C%D7%A7%D7%95%D7%AA/FeatureServer/0/query";
const BLOCK_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query";

// ── Centroid helper ──────────────────────────────────────────────────────────
function computeCentroid(geometry: GeoJSON.Geometry): { lat: number; lng: number } | null {
  let coords: number[][] = [];

  if (geometry.type === "Point") {
    return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
  }
  if (geometry.type === "Polygon") {
    coords = (geometry as GeoJSON.Polygon).coordinates[0];
  } else if (geometry.type === "MultiPolygon") {
    coords = (geometry as GeoJSON.MultiPolygon).coordinates[0][0];
  }
  if (coords.length === 0) return null;

  const sumLng = coords.reduce((s, c) => s + c[0], 0);
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

// ── ArcGIS query helper ──────────────────────────────────────────────────────
async function queryArcGISFeature(
  url: string,
  where: string,
): Promise<GeoJSON.Feature | null> {
  const params = new URLSearchParams({
    where,
    outSR: "4326",
    returnGeometry: "true",
    outFields: "*",
    f: "geojson",
  });

  const response = await fetch(`${url}?${params}`);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.features || data.features.length === 0) return null;
  return data.features[0];
}

// ── Search by Gush + optional Helka (Survey of Israel ArcGIS) ────────────────
export async function searchByGushHelka(
  gush: number,
  helka?: number,
): Promise<GeoResult> {
  try {
    // If helka specified - try parcel first
    if (helka && helka > 0) {
      const feature = await queryArcGISFeature(
        PARCEL_SERVICE_URL,
        `GUSH_NUM=${gush} AND PARCEL=${helka}`,
      );
      if (feature?.geometry) {
        const centroid = computeCentroid(feature.geometry);
        if (centroid) {
          return { ...centroid, label: `גוש ${gush}, חלקה ${helka}` };
        }
      }
    }

    // Gush-only OR parcel not found: search for block boundary
    const feature = await queryArcGISFeature(
      BLOCK_SERVICE_URL,
      `GUSH_NUM=${gush}`,
    );
    if (feature?.geometry) {
      const centroid = computeCentroid(feature.geometry);
      if (centroid) {
        const label =
          helka && helka > 0 ? `גוש ${gush}, חלקה ${helka}` : `גוש ${gush}`;
        return { ...centroid, label };
      }
    }

    throw new Error("NOT_FOUND");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      throw new Error(
        helka && helka > 0
          ? "לא נמצאו תוצאות עבור גוש/חלקה זה"
          : "לא נמצאו תוצאות עבור גוש זה",
      );
    }
    throw new Error("שגיאה בחיפוש גוש/חלקה. נסה שנית.");
  }
}

// ── Reverse geocode: point → Rich parcel info from Survey of Israel ──────────
export interface ReverseParcelResult {
  gush: number;
  helka: number;
  lat: number;
  lng: number;
  /** Registered legal area in square meters */
  legalArea: number | null;
  /** Computed shape area in square meters */
  shapeArea: number | null;
  /** Registration status text, e.g. "מוסדר" */
  status: string | null;
  /** Locality / settlement name */
  locality: string | null;
  /** Regional municipality name, e.g. "עמק לוד" */
  regionalMunicipality: string | null;
  /** County / district name, e.g. "רמלה" */
  county: string | null;
  /** Main region name, e.g. "המרכז" */
  region: string | null;
  /** Gush/Helka string from ArcGIS, e.g. "4227/34" */
  gushHelka: string | null;
  /** Last update date */
  updateDate: string | null;
}

/** Regional municipality code → name mapping (from ArcGIS domain) */
const REG_MUN_NAMES: Record<number, string> = {
  1: "הגליל העליון", 2: "מרום הגליל", 3: "הגליל התחתון", 4: "מטה אשר",
  6: "עמק הירדן", 7: "עמק המעיינות", 8: "הגלבוע", 9: "עמק יזרעאל",
  12: "זבולון", 13: "מגידו", 14: "מנשה", 15: "חוף הכרמל",
  16: "עמק חפר", 18: "לב השרון", 19: "חוף השרון", 20: "דרום השרון",
  24: "אפעל", 25: "חבל מודיעין", 26: "מטה יהודה", 27: "גן רווה",
  28: "ברנר", 29: "חבל יבנה", 30: "גזר", 31: "נחל שורק",
  32: "גדרות", 33: "באר-טוביה", 34: "שפיר", 35: "יואב",
  36: "חוף אשקלון", 37: "שער הנגב", 38: "אשכול", 39: "שדות נגב",
  40: "עמק לוד", 41: "בני שמעון", 42: "מרחבים", 45: "אלונה",
  48: "רמת הנגב", 50: "לכיש", 51: "תמר", 52: "מעלה יוסף",
  53: "חבל אילות", 54: "הערבה התיכונה", 55: "מבואות החרמון",
  56: "משגב", 63: "נוף הגליל", 67: "אבו בסמה", 71: "גולן",
  73: "מטה בנימין", 0: "",
};

/** County code → name mapping */
const COUNTY_NAMES: Record<number, string> = {
  11: "ירושלים", 21: "צפת", 22: "כנרת", 23: "יזרעאל - עפולה",
  24: "עכו", 25: "יזרעאל - נצרת", 29: "גולן", 31: "חיפה",
  32: "חדרה", 41: "השרון", 42: "פתח תקוה", 43: "רמלה",
  44: "רחובות", 51: "תל אביב", 52: "רמת גן", 53: "חולון",
  61: "אשקלון", 62: "באר שבע", 0: "",
};

/** Region code → name mapping */
const REGION_NAMES: Record<number, string> = {
  1: "ירושלים", 2: "הצפון", 3: "חיפה", 4: "המרכז",
  5: "תל-אביב", 6: "הדרום", 7: "יהודה ושומרון", 0: "",
};

export async function reverseGeocodeParcel(lat: number, lng: number): Promise<ReverseParcelResult | null> {
  // Query parcel layer with a point geometry – get ALL fields
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outSR: "4326",
    returnGeometry: "false",
    outFields: "*",
    f: "json",
  });

  try {
    const response = await fetch(`${PARCEL_SERVICE_URL}?${params}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.features || data.features.length === 0) return null;

    const a = data.features[0].attributes;
    const gush = a.GUSH_NUM;
    const helka = a.PARCEL;
    if (!gush || !helka) return null;

    return {
      gush,
      helka,
      lat,
      lng,
      legalArea: a.LEGAL_AREA ?? null,
      shapeArea: a.Shape__Area ?? null,
      status: a.STATUS_TEX?.trim() || null,
      locality: a.LOCALITY_N?.trim() || null,
      regionalMunicipality: REG_MUN_NAMES[a.REG_MUN_ID] ?? null,
      county: COUNTY_NAMES[a.COUNTY_ID] ?? null,
      region: REGION_NAMES[a.REGION_ID] ?? null,
      gushHelka: a.GushHelka ?? null,
      updateDate: a.SYS_DATE ?? null,
    };
  } catch {
    return null;
  }
}

export async function searchByAddress(address: string): Promise<GeoResult> {
  // Try Photon first
  const query = encodeURIComponent(address + ", ישראל");
  const response = await fetch(
    `https://photon.komoot.io/api/?q=${query}&lang=he&limit=5`,
  );

  if (!response.ok) {
    throw new Error("שגיאה בשירות החיפוש");
  }

  const data = await response.json();

  if (!data?.features || data.features.length === 0) {
    // Fallback: try Nominatim
    const nomQuery = encodeURIComponent(address + ", Israel");
    const nomResp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${nomQuery}&limit=1&countrycodes=il`,
    );
    if (nomResp.ok) {
      const nomData = await nomResp.json();
      if (nomData.length > 0) {
        return {
          lat: parseFloat(nomData[0].lat),
          lng: parseFloat(nomData[0].lon),
          label: nomData[0].display_name || address,
        };
      }
    }
    throw new Error("לא נמצאה כתובת תואמת");
  }

  const feature = data.features[0];
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const name = props.name || props.street || address;

  return { lat, lng, label: name };
}
