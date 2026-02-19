// Fetch parcel and block boundary geometries from Survey of Israel ArcGIS REST services

import { supabase } from "@/integrations/supabase/client";

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
  landUse?: string;
  lotNumber?: number;
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
 * Fetch land use data for all parcels in a gush from plan_blocks + taba_outlines.
 * Returns a map of helka → { landUse, lotNumber }.
 */
export async function fetchParcelLandUse(gush: number): Promise<Map<number, { landUse: string; lotNumber?: number }>> {
  const result = new Map<number, { landUse: string; lotNumber?: number }>();

  try {
    // Get plan_blocks for this gush
    const { data: planBlocks } = await supabase
      .from("plan_blocks")
      .select("helka, plan_number")
      .eq("gush", gush);

    if (!planBlocks || planBlocks.length === 0) return result;

    // Get unique plan numbers
    const planNumbers = [...new Set(planBlocks.map((pb) => pb.plan_number))];

    // Fetch taba_outlines for these plans
    const { data: tabaData } = await supabase
      .from("taba_outlines")
      .select("pl_number, land_use, pl_name")
      .in("pl_number", planNumbers);

    if (!tabaData) return result;

    // Build plan_number → { land_use, pl_name } map
    const planLandUse = new Map<string, { landUse: string; plName: string }>();
    for (const t of tabaData) {
      if (t.land_use) {
        planLandUse.set(t.pl_number!, { landUse: t.land_use, plName: t.pl_name || "" });
      }
    }

    // Map helka → land use (use first matching plan)
    for (const pb of planBlocks) {
      if (pb.helka == null || pb.helka <= 0) continue;
      const info = planLandUse.get(pb.plan_number);
      if (!info) continue;

      // Try to extract lot number from plan name (e.g., "מגרש 124")
      const lotMatch = info.plName.match(/מגרש\s*(\d+)/);
      const lotNumber = lotMatch ? parseInt(lotMatch[1], 10) : undefined;

      // Take the first (primary) land use if comma-separated
      const primaryLandUse = info.landUse.split(",")[0].trim();

      if (!result.has(pb.helka)) {
        result.set(pb.helka, { landUse: primaryLandUse, lotNumber });
      }
    }
  } catch (err) {
    console.warn("Failed to fetch parcel land use:", err);
  }

  return result;
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
