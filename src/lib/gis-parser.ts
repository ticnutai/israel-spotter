import { kml, gpx } from "@tmcw/togeojson";

export type GeoJSONData = GeoJSON.FeatureCollection;

export function parseGeoJSON(text: string): GeoJSONData {
  const parsed = JSON.parse(text);
  if (parsed.type === "FeatureCollection") return parsed;
  if (parsed.type === "Feature") {
    return { type: "FeatureCollection", features: [parsed] };
  }
  throw new Error("Invalid GeoJSON");
}

export function parseKML(text: string): GeoJSONData {
  const dom = new DOMParser().parseFromString(text, "text/xml");
  const converted = kml(dom);
  if (!converted || !converted.features.length) {
    throw new Error("Could not parse KML file");
  }
  return converted as GeoJSONData;
}

export function parseGPX(text: string): GeoJSONData {
  const dom = new DOMParser().parseFromString(text, "text/xml");
  const converted = gpx(dom);
  if (!converted || !converted.features.length) {
    throw new Error("Could not parse GPX file");
  }
  return converted as GeoJSONData;
}

export async function parseGISFile(file: File): Promise<GeoJSONData> {
  const text = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "geojson":
    case "json":
      return parseGeoJSON(text);
    case "kml":
      return parseKML(text);
    case "gpx":
      return parseGPX(text);
    default:
      throw new Error(`Unsupported file format: .${ext}`);
  }
}
