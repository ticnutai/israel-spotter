/**
 * Fetch taba_outlines from DB and convert geometries to WGS84 GeoJSON FeatureCollection.
 */

import { supabase } from "@/integrations/supabase/client";
import { convertGeometryToWgs84 } from "./itm-to-wgs84";

export interface TabaFeatureProperties {
  id: number;
  pl_number: string | null;
  pl_name: string | null;
  land_use: string | null;
  status: string | null;
  area_dunam: number | null;
}

export async function fetchTabaOutlinesGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  const { data, error } = await supabase
    .from("taba_outlines")
    .select("id, pl_number, pl_name, land_use, status, area_dunam, geometry_json")
    .not("geometry_json", "is", null);

  if (error || !data) {
    console.warn("Failed to fetch taba outlines:", error);
    return { type: "FeatureCollection", features: [] };
  }

  const features: GeoJSON.Feature[] = [];

  for (const row of data) {
    try {
      const itmGeometry = JSON.parse(row.geometry_json!);
      const wgs84Geometry = convertGeometryToWgs84(itmGeometry);
      if (!wgs84Geometry) continue;

      features.push({
        type: "Feature",
        geometry: wgs84Geometry,
        properties: {
          id: row.id,
          pl_number: row.pl_number,
          pl_name: row.pl_name,
          land_use: row.land_use,
          status: row.status,
          area_dunam: row.area_dunam,
        },
      });
    } catch {
      // Skip rows with invalid geometry
    }
  }

  return { type: "FeatureCollection", features };
}
