// Fetch parcel and block boundary geometries from Survey of Israel ArcGIS REST services

const PARCEL_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%97%D7%9C%D7%A7%D7%95%D7%AA/FeatureServer/0/query";
const BLOCK_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query";

export interface ParcelFeature {
  gush: number;
  helka: number;
  geometry: GeoJSON.Geometry;
  legalArea?: number;
  status?: string;
}

export interface BoundaryResult {
  parcelGeometry: GeoJSON.Geometry | null;
  blockGeometry: GeoJSON.Geometry | null;
  /** All parcels within the gush block */
  allParcels: ParcelFeature[];
}

async function queryArcGIS(url: string, where: string): Promise<GeoJSON.Geometry | null> {
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

  return data.features[0].geometry;
}

async function queryAllParcelsInGush(gush: number): Promise<ParcelFeature[]> {
  const params = new URLSearchParams({
    where: `GUSH_NUM=${gush}`,
    outSR: "4326",
    returnGeometry: "true",
    outFields: "GUSH_NUM,PARCEL,LEGAL_AREA,STATUS_TEX",
    f: "geojson",
    resultRecordCount: "500",
  });

  try {
    const response = await fetch(`${PARCEL_SERVICE_URL}?${params}`);
    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.features || data.features.length === 0) return [];

    return data.features.map((f: any) => ({
      gush: f.properties?.GUSH_NUM ?? gush,
      helka: f.properties?.PARCEL ?? 0,
      geometry: f.geometry,
      legalArea: f.properties?.LEGAL_AREA,
      status: f.properties?.STATUS_TEX,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch boundaries for a gush (block) and optionally a helka (parcel).
 * Always fetches all parcels within the gush for subdivision display.
 */
export async function fetchBoundaries(gush: number, helka?: number): Promise<BoundaryResult> {
  const hasHelka = helka !== undefined && helka > 0;

  const [parcelGeometry, blockGeometry, allParcels] = await Promise.all([
    hasHelka
      ? queryArcGIS(PARCEL_SERVICE_URL, `GUSH_NUM=${gush} AND PARCEL=${helka}`)
      : Promise.resolve(null),
    queryArcGIS(BLOCK_SERVICE_URL, `GUSH_NUM=${gush}`),
    queryAllParcelsInGush(gush),
  ]);

  return { parcelGeometry, blockGeometry, allParcels };
}
