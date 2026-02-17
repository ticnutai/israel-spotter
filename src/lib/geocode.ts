/**
 * geocode.ts Γאף Geo-search for Gush/Helka and Address
 *
 * Uses Survey of Israel ArcGIS REST services for parcel/block lookup
 * and Photon (Komoot) for address geocoding.
 */

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

// ΓפאΓפא ArcGIS boundary services (Survey of Israel) ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא
const PARCEL_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%97%D7%9C%D7%A7%D7%95%D7%AA/FeatureServer/0/query";
const BLOCK_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query";

// ΓפאΓפא Centroid helper ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא
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

// ΓפאΓפא ArcGIS query helper ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא
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

// ΓפאΓפא Search by Gush + optional Helka (Survey of Israel ArcGIS) ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא
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
          return { ...centroid, label: `╫ע╫ץ╫⌐ ${gush}, ╫ק╫£╫º╫פ ${helka}` };
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
          helka && helka > 0 ? `╫ע╫ץ╫⌐ ${gush}, ╫ק╫£╫º╫פ ${helka}` : `╫ע╫ץ╫⌐ ${gush}`;
        return { ...centroid, label };
      }
    }

    throw new Error("NOT_FOUND");
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      throw new Error(
        helka && helka > 0
          ? "╫£╫נ ╫á╫₧╫ª╫נ╫ץ ╫¬╫ץ╫ª╫נ╫ץ╫¬ ╫ó╫ס╫ץ╫¿ ╫ע╫ץ╫⌐/╫ק╫£╫º╫פ ╫צ╫פ"
          : "╫£╫נ ╫á╫₧╫ª╫נ╫ץ ╫¬╫ץ╫ª╫נ╫ץ╫¬ ╫ó╫ס╫ץ╫¿ ╫ע╫ץ╫⌐ ╫צ╫פ",
      );
    }
    throw new Error("╫⌐╫ע╫ש╫נ╫פ ╫ס╫ק╫ש╫ñ╫ץ╫⌐ ╫ע╫ץ╫⌐/╫ק╫£╫º╫פ. ╫á╫í╫פ ╫⌐╫á╫ש╫¬.");
  }
}

// ΓפאΓפא Search by address (Photon / Komoot) ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא
export async function searchByAddress(address: string): Promise<GeoResult> {
  // Try Photon first
  const query = encodeURIComponent(address + ", ╫ש╫⌐╫¿╫נ╫£");
  const response = await fetch(
    `https://photon.komoot.io/api/?q=${query}&lang=he&limit=5`,
  );

  if (!response.ok) {
    throw new Error("╫⌐╫ע╫ש╫נ╫פ ╫ס╫⌐╫ש╫¿╫ץ╫¬ ╫פ╫ק╫ש╫ñ╫ץ╫⌐");
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
    throw new Error("╫£╫נ ╫á╫₧╫ª╫נ╫פ ╫¢╫¬╫ץ╫ס╫¬ ╫¬╫ץ╫נ╫₧╫¬");
  }

  const feature = data.features[0];
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const name = props.name || props.street || address;

  return { lat, lng, label: name };
}
