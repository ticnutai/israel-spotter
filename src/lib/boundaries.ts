// Fetch parcel and block boundary geometries from Survey of Israel ArcGIS REST services

const PARCEL_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%97%D7%9C%D7%A7%D7%95%D7%AA/FeatureServer/0/query";
const BLOCK_SERVICE_URL =
  "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query";

export interface BoundaryResult {
  parcelGeometry: GeoJSON.Geometry | null;
  blockGeometry: GeoJSON.Geometry | null;
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

/**
 * Fetch boundaries for a gush (block) and optionally a helka (parcel).
 * If helka is omitted or 0, only the block geometry is returned.
 */
export async function fetchBoundaries(gush: number, helka?: number): Promise<BoundaryResult> {
  const hasHelka = helka !== undefined && helka > 0;

  const [parcelGeometry, blockGeometry] = await Promise.all([
    hasHelka
      ? queryArcGIS(PARCEL_SERVICE_URL, `GUSH_NUM=${gush} AND PARCEL=${helka}`)
      : Promise.resolve(null),
    queryArcGIS(BLOCK_SERVICE_URL, `GUSH_NUM=${gush}`),
  ]);

  return { parcelGeometry, blockGeometry };
}
