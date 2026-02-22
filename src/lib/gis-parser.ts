/**
 * gis-parser.ts – Parse GIS files (DXF, GeoJSON, KML, KMZ, ZIP/Shapefile) into GeoJSON
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import DxfParser from "dxf-parser";
import shp from "shpjs";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedGisLayer {
  name: string;
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  featureCount: number;
  geometryTypes: string[];
}

export type SupportedGisExt = "dxf" | "geojson" | "json" | "kml" | "kmz" | "zip" | "gpx" | "shp";

const GIS_EXTENSIONS: SupportedGisExt[] = ["dxf", "geojson", "json", "kml", "kmz", "zip", "gpx", "shp"];

/** Shapefile companion extensions */
const SHP_COMPANIONS = ["shp", "dbf", "prj", "shx"];

export function isGisFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return GIS_EXTENSIONS.includes(ext as SupportedGisExt);
}

/** Check if a file is a shapefile companion that should be bundled */
export function isShapefileComponent(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return SHP_COMPANIONS.includes(ext);
}

export function getFileExt(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

// ── Main parser entry ────────────────────────────────────────────────────────

export async function parseGisFile(file: File): Promise<ParsedGisLayer> {
  const ext = getFileExt(file.name) as SupportedGisExt;

  switch (ext) {
    case "dxf":
      return parseDxfFile(file);
    case "geojson":
    case "json":
      return parseGeoJsonFile(file);
    case "kml":
      return parseKmlFile(file);
    case "kmz":
      return parseKmzFile(file);
    case "zip":
      return parseZipFile(file);
    case "gpx":
      return parseGpxFile(file);
    case "shp":
      throw new Error("קובץ .shp לבד לא מספיק – יש לבחור גם את קבצי .dbf, .prj, .shx או להעלות כ-ZIP");
    default:
      throw new Error(`סוג קובץ לא נתמך: .${ext}`);
  }
}

// ── DXF Parser ───────────────────────────────────────────────────────────────

async function parseDxfFile(file: File): Promise<ParsedGisLayer> {
  const text = await file.text();
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);

  if (!dxf || !dxf.entities || dxf.entities.length === 0) {
    throw new Error("לא נמצאו אלמנטים בקובץ DXF");
  }

  const features: GeoJSON.Feature[] = [];

  for (const entity of dxf.entities) {
    const feature = dxfEntityToFeature(entity);
    if (feature) features.push(feature);
  }

  if (features.length === 0) {
    throw new Error("לא ניתן להמיר אלמנטים לגיאומטריה");
  }

  const fc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  return {
    name: file.name,
    geojson: fc,
    bbox: computeBbox(fc),
    featureCount: features.length,
    geometryTypes: [...new Set(features.map((f) => f.geometry.type))],
  };
}

function dxfEntityToFeature(entity: any): GeoJSON.Feature | null {
  const props: Record<string, any> = {
    layer: entity.layer ?? "0",
    type: entity.type,
    color: entity.color,
  };

  try {
    switch (entity.type) {
      case "POINT": {
        if (!entity.position) return null;
        return {
          type: "Feature",
          properties: props,
          geometry: {
            type: "Point",
            coordinates: [entity.position.x, entity.position.y],
          },
        };
      }

      case "LINE": {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        return {
          type: "Feature",
          properties: props,
          geometry: {
            type: "LineString",
            coordinates: entity.vertices.map((v: any) => [v.x, v.y]),
          },
        };
      }

      case "LWPOLYLINE":
      case "POLYLINE": {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        const coords = entity.vertices.map((v: any) => [v.x, v.y]);

        // Closed polyline → Polygon
        if (entity.shape) {
          const ring = [...coords];
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([...first]);
          }
          return {
            type: "Feature",
            properties: props,
            geometry: { type: "Polygon", coordinates: [ring] },
          };
        }

        return {
          type: "Feature",
          properties: props,
          geometry: { type: "LineString", coordinates: coords },
        };
      }

      case "CIRCLE": {
        if (!entity.center || !entity.radius) return null;
        // Approximate circle as 36-point polygon
        const cx = entity.center.x;
        const cy = entity.center.y;
        const r = entity.radius;
        const pts: number[][] = [];
        for (let i = 0; i <= 36; i++) {
          const angle = (i * 2 * Math.PI) / 36;
          pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
        }
        return {
          type: "Feature",
          properties: { ...props, radius: r },
          geometry: { type: "Polygon", coordinates: [pts] },
        };
      }

      case "ARC": {
        if (!entity.center || !entity.radius) return null;
        const acx = entity.center.x;
        const acy = entity.center.y;
        const ar = entity.radius;
        const startAngle = ((entity.startAngle ?? 0) * Math.PI) / 180;
        const endAngle = ((entity.endAngle ?? 360) * Math.PI) / 180;
        const aPts: number[][] = [];
        const segments = 36;
        let sweep = endAngle - startAngle;
        if (sweep <= 0) sweep += 2 * Math.PI;
        for (let i = 0; i <= segments; i++) {
          const angle = startAngle + (i * sweep) / segments;
          aPts.push([acx + ar * Math.cos(angle), acy + ar * Math.sin(angle)]);
        }
        return {
          type: "Feature",
          properties: props,
          geometry: { type: "LineString", coordinates: aPts },
        };
      }

      case "ELLIPSE": {
        if (!entity.center || !entity.majorAxisEndPoint) return null;
        const ecx = entity.center.x;
        const ecy = entity.center.y;
        const mx = entity.majorAxisEndPoint.x;
        const my = entity.majorAxisEndPoint.y;
        const majorLen = Math.sqrt(mx * mx + my * my);
        const minorRatio = entity.axisRatio ?? 1;
        const minorLen = majorLen * minorRatio;
        const rotation = Math.atan2(my, mx);
        const ePts: number[][] = [];
        for (let i = 0; i <= 36; i++) {
          const angle = (i * 2 * Math.PI) / 36;
          const x = majorLen * Math.cos(angle);
          const y = minorLen * Math.sin(angle);
          const rx = x * Math.cos(rotation) - y * Math.sin(rotation);
          const ry = x * Math.sin(rotation) + y * Math.cos(rotation);
          ePts.push([ecx + rx, ecy + ry]);
        }
        return {
          type: "Feature",
          properties: props,
          geometry: { type: "Polygon", coordinates: [ePts] },
        };
      }

      case "SPLINE": {
        if (!entity.controlPoints || entity.controlPoints.length < 2) return null;
        const sPts = entity.controlPoints.map((p: any) => [p.x, p.y]);
        return {
          type: "Feature",
          properties: props,
          geometry: { type: "LineString", coordinates: sPts },
        };
      }

      case "INSERT":
      case "SOLID":
      case "3DFACE":
      case "MTEXT":
      case "TEXT":
      case "DIMENSION":
        // Skip non-geometry entities
        return null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── GeoJSON Parser ───────────────────────────────────────────────────────────

async function parseGeoJsonFile(file: File): Promise<ParsedGisLayer> {
  const text = await file.text();
  const data = JSON.parse(text);

  let fc: GeoJSON.FeatureCollection;

  if (data.type === "FeatureCollection") {
    fc = data;
  } else if (data.type === "Feature") {
    fc = { type: "FeatureCollection", features: [data] };
  } else if (data.type && data.coordinates) {
    // Raw geometry
    fc = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: data }],
    };
  } else {
    throw new Error("פורמט GeoJSON לא תקין");
  }

  if (!fc.features || fc.features.length === 0) {
    throw new Error("לא נמצאו אלמנטים בקובץ GeoJSON");
  }

  return {
    name: file.name,
    geojson: fc,
    bbox: computeBbox(fc),
    featureCount: fc.features.length,
    geometryTypes: [...new Set(fc.features.map((f) => f.geometry?.type).filter(Boolean) as string[])],
  };
}

// ── KML Parser ───────────────────────────────────────────────────────────────

async function parseKmlFile(file: File): Promise<ParsedGisLayer> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");
  const features = kmlToFeatures(doc);

  if (features.length === 0) {
    throw new Error("לא נמצאו אלמנטים בקובץ KML");
  }

  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

  return {
    name: file.name,
    geojson: fc,
    bbox: computeBbox(fc),
    featureCount: features.length,
    geometryTypes: [...new Set(features.map((f) => f.geometry.type))],
  };
}

async function parseKmzFile(file: File): Promise<ParsedGisLayer> {
  // KMZ is a ZIP containing doc.kml
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  return new Promise((resolve, reject) => {
    try {
      // fflate's unzipSync for synchronous decompression
      import("fflate").then(({ unzipSync }) => {
        const files = unzipSync(uint8);
        // Find the KML file
        const kmlKey = Object.keys(files).find(
          (k) => k.toLowerCase().endsWith(".kml")
        );
        if (!kmlKey) {
          reject(new Error("לא נמצא קובץ KML בתוך ה-KMZ"));
          return;
        }
        const kmlText = new TextDecoder().decode(files[kmlKey]);
        const parser = new DOMParser();
        const doc = parser.parseFromString(kmlText, "text/xml");
        const features = kmlToFeatures(doc);
        if (features.length === 0) {
          reject(new Error("לא נמצאו אלמנטים בקובץ KML"));
          return;
        }
        const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
        resolve({
          name: file.name,
          geojson: fc,
          bbox: computeBbox(fc),
          featureCount: features.length,
          geometryTypes: [...new Set(features.map((f) => f.geometry.type))],
        });
      }).catch(() => reject(new Error("לא ניתן לפרוס קובץ KMZ")));
    } catch {
      reject(new Error("לא ניתן לפרוס קובץ KMZ"));
    }
  });
}

// ── ZIP Parser (Shapefile ZIP or ZIP with GIS files) ─────────────────────────

async function parseZipFile(file: File): Promise<ParsedGisLayer> {
  const buffer = await file.arrayBuffer();

  // First try shpjs – it handles shapefile ZIPs natively
  try {
    const result = await shp(buffer);

    // shpjs returns a single FeatureCollection or an array of them
    let fc: GeoJSON.FeatureCollection;
    if (Array.isArray(result)) {
      const allFeatures = result.flatMap((r: any) =>
        r.type === "FeatureCollection" ? r.features : [r]
      );
      fc = { type: "FeatureCollection", features: allFeatures };
    } else if (result.type === "FeatureCollection") {
      fc = result as GeoJSON.FeatureCollection;
    } else {
      fc = { type: "FeatureCollection", features: [result as GeoJSON.Feature] };
    }

    if (fc.features.length > 0) {
      return {
        name: file.name.replace(/\.zip$/i, ""),
        geojson: fc,
        bbox: computeBbox(fc),
        featureCount: fc.features.length,
        geometryTypes: [...new Set(fc.features.map((f) => f.geometry?.type).filter(Boolean) as string[])],
      };
    }
  } catch {
    // Not a shapefile ZIP – fall through to try extracting GIS files
  }

  // Fallback: extract known GIS files from the ZIP using fflate
  const { unzipSync } = await import("fflate");
  const uint8 = new Uint8Array(buffer);
  const zipFiles = unzipSync(uint8);

  const gisKeys = Object.keys(zipFiles).filter((k) => {
    const ext = k.split(".").pop()?.toLowerCase() ?? "";
    return ["geojson", "json", "kml", "kmz", "dxf", "gpx"].includes(ext);
  });

  if (gisKeys.length === 0) {
    throw new Error("לא נמצאו קבצי GIS (Shapefile/GeoJSON/KML/DXF) בתוך ה-ZIP");
  }

  // Parse the first GIS file found
  const key = gisKeys[0];
  const content = new TextDecoder().decode(zipFiles[key]);
  const virtualFile = new File([content], key, { type: "text/plain" });

  const allLayers: ParsedGisLayer[] = [];

  for (const key of gisKeys) {
    try {
      const content = new TextDecoder().decode(zipFiles[key]);
      const virtualFile = new File([content], key, { type: "text/plain" });
      const layer = await parseGisFile(virtualFile);
      layer.name = key;
      allLayers.push(layer);
    } catch {
      // Skip files that fail to parse
    }
  }

  if (allLayers.length === 0) {
    throw new Error("לא ניתן לפרוס קבצי GIS מתוך ה-ZIP");
  }

  // Merge all layers into one
  if (allLayers.length === 1) return allLayers[0];

  const mergedFeatures = allLayers.flatMap((l) => l.geojson.features);
  const mergedFc: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: mergedFeatures,
  };
  return {
    name: file.name.replace(/\.zip$/i, ""),
    geojson: mergedFc,
    bbox: computeBbox(mergedFc),
    featureCount: mergedFeatures.length,
    geometryTypes: [...new Set(mergedFeatures.map((f) => f.geometry?.type).filter(Boolean) as string[])],
  };
}

// ── Bundle shapefile components (.shp + .dbf + .prj + .shx) into a ZIP for shpjs ──

export async function bundleShapefileComponents(files: File[]): Promise<ParsedGisLayer> {
  const { zipSync } = await import("fflate");
  
  const zipData: Record<string, Uint8Array> = {};
  for (const f of files) {
    const buf = await f.arrayBuffer();
    zipData[f.name] = new Uint8Array(buf);
  }

  const zipped = zipSync(zipData);
  const baseName = files[0].name.replace(/\.\w+$/, "");
  const virtualZip = new File([zipped.buffer as ArrayBuffer], `${baseName}.zip`, { type: "application/zip" });
  return parseZipFile(virtualZip);
}

// ── GPX Parser ───────────────────────────────────────────────────────────────

async function parseGpxFile(file: File): Promise<ParsedGisLayer> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/xml");
  const features: GeoJSON.Feature[] = [];

  // Waypoints
  const wpts = doc.getElementsByTagName("wpt");
  for (let i = 0; i < wpts.length; i++) {
    const wpt = wpts[i];
    const lat = parseFloat(wpt.getAttribute("lat") ?? "");
    const lon = parseFloat(wpt.getAttribute("lon") ?? "");
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const name = wpt.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const desc = wpt.getElementsByTagName("desc")[0]?.textContent?.trim() ?? "";
    const ele = parseFloat(wpt.getElementsByTagName("ele")[0]?.textContent ?? "");
    features.push({
      type: "Feature",
      properties: { name, description: desc, elevation: isFinite(ele) ? ele : undefined },
      geometry: { type: "Point", coordinates: isFinite(ele) ? [lon, lat, ele] : [lon, lat] },
    });
  }

  // Tracks
  const trks = doc.getElementsByTagName("trk");
  for (let i = 0; i < trks.length; i++) {
    const trk = trks[i];
    const name = trk.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const trksegs = trk.getElementsByTagName("trkseg");
    for (let j = 0; j < trksegs.length; j++) {
      const coords = gpxSegmentCoords(trksegs[j]);
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          properties: { name, type: "track" },
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }
  }

  // Routes
  const rtes = doc.getElementsByTagName("rte");
  for (let i = 0; i < rtes.length; i++) {
    const rte = rtes[i];
    const name = rte.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const rtepts = rte.getElementsByTagName("rtept");
    const coords: number[][] = [];
    for (let j = 0; j < rtepts.length; j++) {
      const lat = parseFloat(rtepts[j].getAttribute("lat") ?? "");
      const lon = parseFloat(rtepts[j].getAttribute("lon") ?? "");
      if (isFinite(lat) && isFinite(lon)) {
        const ele = parseFloat(rtepts[j].getElementsByTagName("ele")[0]?.textContent ?? "");
        coords.push(isFinite(ele) ? [lon, lat, ele] : [lon, lat]);
      }
    }
    if (coords.length >= 2) {
      features.push({
        type: "Feature",
        properties: { name, type: "route" },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }

  if (features.length === 0) {
    throw new Error("לא נמצאו אלמנטים בקובץ GPX");
  }

  const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  return {
    name: file.name,
    geojson: fc,
    bbox: computeBbox(fc),
    featureCount: features.length,
    geometryTypes: [...new Set(features.map((f) => f.geometry.type))],
  };
}

function gpxSegmentCoords(seg: Element): number[][] {
  const trkpts = seg.getElementsByTagName("trkpt");
  const coords: number[][] = [];
  for (let i = 0; i < trkpts.length; i++) {
    const lat = parseFloat(trkpts[i].getAttribute("lat") ?? "");
    const lon = parseFloat(trkpts[i].getAttribute("lon") ?? "");
    if (isFinite(lat) && isFinite(lon)) {
      const ele = parseFloat(trkpts[i].getElementsByTagName("ele")[0]?.textContent ?? "");
      coords.push(isFinite(ele) ? [lon, lat, ele] : [lon, lat]);
    }
  }
  return coords;
}

function kmlToFeatures(doc: Document): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const placemarks = doc.getElementsByTagName("Placemark");

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const name = pm.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const desc = pm.getElementsByTagName("description")[0]?.textContent?.trim() ?? "";
    const props: Record<string, any> = { name, description: desc };

    // Extended data
    const simpleData = pm.getElementsByTagName("SimpleData");
    for (let j = 0; j < simpleData.length; j++) {
      const sd = simpleData[j];
      const attrName = sd.getAttribute("name");
      if (attrName) props[attrName] = sd.textContent?.trim() ?? "";
    }

    // Point
    const point = pm.getElementsByTagName("Point")[0];
    if (point) {
      const coordStr = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
      if (coordStr) {
        const [lng, lat] = coordStr.split(",").map(Number);
        if (isFinite(lng) && isFinite(lat)) {
          features.push({
            type: "Feature",
            properties: props,
            geometry: { type: "Point", coordinates: [lng, lat] },
          });
        }
      }
      continue;
    }

    // LineString
    const linestring = pm.getElementsByTagName("LineString")[0];
    if (linestring) {
      const coords = parseKmlCoords(linestring);
      if (coords.length >= 2) {
        features.push({
          type: "Feature",
          properties: props,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
      continue;
    }

    // Polygon
    const polygon = pm.getElementsByTagName("Polygon")[0];
    if (polygon) {
      const outerEl = polygon.getElementsByTagName("outerBoundaryIs")[0];
      if (outerEl) {
        const outer = parseKmlCoords(outerEl);
        if (outer.length >= 4) {
          const rings: number[][][] = [outer];
          const innerEls = polygon.getElementsByTagName("innerBoundaryIs");
          for (let j = 0; j < innerEls.length; j++) {
            const inner = parseKmlCoords(innerEls[j]);
            if (inner.length >= 4) rings.push(inner);
          }
          features.push({
            type: "Feature",
            properties: props,
            geometry: { type: "Polygon", coordinates: rings },
          });
        }
      }
      continue;
    }

    // MultiGeometry (flatten)
    const multi = pm.getElementsByTagName("MultiGeometry")[0];
    if (multi) {
      const subPoints = multi.getElementsByTagName("Point");
      for (let j = 0; j < subPoints.length; j++) {
        const coordStr = subPoints[j].getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordStr) {
          const [lng, lat] = coordStr.split(",").map(Number);
          if (isFinite(lng) && isFinite(lat)) {
            features.push({
              type: "Feature",
              properties: props,
              geometry: { type: "Point", coordinates: [lng, lat] },
            });
          }
        }
      }
      const subLines = multi.getElementsByTagName("LineString");
      for (let j = 0; j < subLines.length; j++) {
        const coords = parseKmlCoords(subLines[j]);
        if (coords.length >= 2) {
          features.push({
            type: "Feature",
            properties: props,
            geometry: { type: "LineString", coordinates: coords },
          });
        }
      }
      const subPolys = multi.getElementsByTagName("Polygon");
      for (let j = 0; j < subPolys.length; j++) {
        const outerEl = subPolys[j].getElementsByTagName("outerBoundaryIs")[0];
        if (outerEl) {
          const outer = parseKmlCoords(outerEl);
          if (outer.length >= 4) {
            features.push({
              type: "Feature",
              properties: props,
              geometry: { type: "Polygon", coordinates: [outer] },
            });
          }
        }
      }
    }
  }

  return features;
}

function parseKmlCoords(el: Element): number[][] {
  const coordsText = el.getElementsByTagName("coordinates")[0]?.textContent?.trim();
  if (!coordsText) return [];
  return coordsText
    .split(/\s+/)
    .map((s) => s.split(",").map(Number))
    .filter((c) => c.length >= 2 && isFinite(c[0]) && isFinite(c[1]))
    .map((c) => [c[0], c[1]]);
}

// ── Bbox helper ──────────────────────────────────────────────────────────────

export function computeBbox(fc: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let found = false;

  function visit(coords: any) {
    if (typeof coords[0] === "number") {
      // [lng, lat]
      const [lng, lat] = coords;
      if (isFinite(lng) && isFinite(lat)) {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
        found = true;
      }
      return;
    }
    for (const c of coords) visit(c);
  }

  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) {
      visit(f.geometry.coordinates);
    }
  }

  return found ? [minLng, minLat, maxLng, maxLat] : null;
}

// ── Coordinate system detection ──────────────────────────────────────────────

/** Detected coordinate reference system */
export type DetectedCrs = "itm" | "ics" | "wgs84";

/** Check if coordinates look like ITM (Israel Transverse Mercator – EPSG:2039) */
export function looksLikeItm(fc: GeoJSON.FeatureCollection): boolean {
  return detectCrs(fc) === "itm";
}

/** Check if coordinates look like Old Israeli Grid / ICS (Cassini-Soldner – EPSG:28193) */
export function looksLikeIcs(fc: GeoJSON.FeatureCollection): boolean {
  return detectCrs(fc) === "ics";
}

/**
 * Detect coordinate system by sampling up to 10 coordinate pairs.
 * - ITM:  E ~100,000–300,000  N ~350,000–800,000
 * - ICS:  E ~50,000–270,000   N ~350,000–800,000  (but typically E < 300,000 and N < 350,000 different range)
 *   Actually ICS: E ~100,000–270,000, N ~0–350,000 (Palestine Belt / old grid)
 * - WGS84: lng ~34–36, lat ~29–34
 */
export function detectCrs(fc: GeoJSON.FeatureCollection): DetectedCrs {
  const samples: number[][] = [];
  
  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) {
      const c = flatCoords(f.geometry);
      for (const pt of c) {
        samples.push(pt);
        if (samples.length >= 10) break;
      }
      if (samples.length >= 10) break;
    }
  }

  if (samples.length === 0) return "wgs84";

  let itmVotes = 0;
  const icsVotes = 0;
  let wgsVotes = 0;

  for (const [x, y] of samples) {
    // ITM range: E 100,000–300,000, N 350,000–800,000
    if (x > 100000 && x < 300000 && y > 350000 && y < 800000) {
      itmVotes++;
    }
    // ICS (Old Israeli Grid): E 50,000–300,000, N 350,000–900,000
    // Actually ICS northings are typically ~50,000–350,000 and eastings ~100,000–270,000
    // But the range overlaps with ITM, so ITM has priority (more common)
    else if (x > 50000 && x < 400000 && y > 300000 && y < 900000) {
      // Could be ITM with slightly out-of-range values, or ICS
      itmVotes++;
    }
    // WGS84 Israel range: lng ~34–36, lat ~29–34  
    else if (x > 30 && x < 40 && y > 25 && y < 38) {
      wgsVotes++;
    }
    // Large coordinates that are clearly projected (not WGS84)
    else if (Math.abs(x) > 1000 || Math.abs(y) > 1000) {
      itmVotes++; // Assume ITM for any large projected coords in Israel context
    }
  }

  if (itmVotes > wgsVotes) return "itm";
  return "wgs84";
}

function flatCoords(geom: any): number[][] {
  if (!geom.coordinates) return [];
  const result: number[][] = [];
  function visit(c: any) {
    if (typeof c[0] === "number") {
      result.push(c);
      return;
    }
    for (const child of c) visit(child);
  }
  visit(geom.coordinates);
  return result;
}

/** Convert ITM (EPSG:2039) coords to WGS84 in-place */
export function convertItmToWgs84(fc: GeoJSON.FeatureCollection): void {
  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) {
      transformCoords(f.geometry.coordinates);
    }
  }
}

function transformCoords(coords: any): void {
  if (typeof coords[0] === "number") {
    // This is a coordinate pair [x, y]
    const [lat, lng] = itmToWgs84(coords[0], coords[1]);
    coords[0] = lng;
    coords[1] = lat;
    return;
  }
  for (const c of coords) transformCoords(c);
}

// ── ITM → WGS84 conversion — uses the correct central module ─────────────────
// (The previous local copy had a critical bug: it skipped the meridional arc
//  calculation (M0), causing coordinates to land in Africa instead of Israel.)
import { itmToWgs84 } from "@/lib/itm-to-wgs84";
