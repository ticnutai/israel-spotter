/**
 * gis-parser.ts – Parse GIS files (DXF, GeoJSON, KML, KMZ) into GeoJSON
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import DxfParser from "dxf-parser";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedGisLayer {
  name: string;
  geojson: GeoJSON.FeatureCollection;
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  featureCount: number;
  geometryTypes: string[];
}

export type SupportedGisExt = "dxf" | "geojson" | "json" | "kml" | "kmz";

const GIS_EXTENSIONS: SupportedGisExt[] = ["dxf", "geojson", "json", "kml", "kmz"];

export function isGisFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return GIS_EXTENSIONS.includes(ext as SupportedGisExt);
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

function computeBbox(fc: GeoJSON.FeatureCollection): [number, number, number, number] | null {
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

/** Check if coordinates look like ITM (Israel Transverse Mercator – EPSG:2039) */
export function looksLikeItm(fc: GeoJSON.FeatureCollection): boolean {
  for (const f of fc.features) {
    if (f.geometry && "coordinates" in f.geometry) {
      const c = flatCoords(f.geometry);
      if (c.length > 0) {
        const [x, y] = c[0];
        // ITM range: x~100,000–300,000, y~350,000–800,000
        if (x > 50000 && x < 400000 && y > 300000 && y < 900000) return true;
        return false;
      }
    }
  }
  return false;
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

// ── ITM → WGS84 conversion (same as AerialOverlay.tsx) ───────────────────────

function itmToWgs84(x: number, y: number): [number, number] {
  const a = 6378137.0;
  const e = 0.0818191908426;
  const lam0 = (35.2045169444 * Math.PI) / 180;
  const k0 = 1.0000067;
  const E0 = 219529.584;
  const N0 = 626907.39;

  const dE = x - E0;
  const dN = y - N0;

  const M = N0 + dN;
  const mu = M / (a * k0 * (1 - (e * e) / 4 - (3 * e * e * e * e) / 64));

  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - e * e * Math.sin(phi1) * Math.sin(phi1));
  const T1 = Math.tan(phi1) * Math.tan(phi1);
  const C1 = (e * e * Math.cos(phi1) * Math.cos(phi1)) / (1 - e * e);
  const R1 =
    (a * (1 - e * e)) /
    Math.pow(1 - e * e * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const D = dE / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1) * Math.pow(D, 6)) / 720);

  const lng =
    lam0 +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e * e / (1 - e * e)) + 24 * T1 * T1) *
        Math.pow(D, 5)) /
        120) /
      Math.cos(phi1);

  return [(lat * 180) / Math.PI, (lng * 180) / Math.PI];
}
