import { useEffect, useRef, useState, useCallback, useMemo, memo, Component, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoResult } from "@/lib/geocode";
import { fetchBoundaries, fetchParcelLandUse, type BoundaryResult } from "@/lib/boundaries";
import { MapLayerSwitcher, MAP_LAYERS, LABELS_LAYER_URL, type MapLayerOption } from "./MapLayerSwitcher";
import { MapMeasure } from "./MapMeasure";
import { ScaleBarControl } from "./ScaleBarControl";
import { CoordinateDisplay } from "./CoordinateDisplay";
import { AerialOverlay } from "./AerialOverlay";
import { PlanOverlay } from "./PlanOverlay";
import { GeorefTool } from "./GeorefTool";
import { MapToolbar } from "./MapToolbar";
import { useStoreLayers, useStorePaintedParcels, useStoreLabelSettings, useStoreBorderSettings } from "@/hooks/use-layer-store";
import { getLandUseByName } from "@/lib/land-use-colors";


// Fix default marker icons for Leaflet + bundler
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Error boundary to catch Leaflet tile errors ──────────────────────────────
class MapErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, error: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-muted/30">
          <div className="text-center p-6">
            <p className="text-sm text-destructive mb-2">שגיאה בטעינת המפה</p>
            <p className="text-xs text-muted-foreground mb-3">{this.state.error}</p>
            <button
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md"
              onClick={() => {
                this.setState({ hasError: false, error: "" });
                window.location.reload();
              }}
            >
              טען מחדש
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Helper: validate coordinates are finite numbers ──────────────────────────
function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export type ParcelColorMode = "default" | "status" | "area" | "landuse";

interface MapViewProps {
  result: GeoResult | null;
  boundaries: BoundaryResult | null;
  aerialYear?: string | null;
  planPath?: string | null;
  onClearPlan?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  highlightGeometry?: GeoJSON.Geometry | null;
  gisOverlay?: GeoJSON.FeatureCollection | null;
  parcelColorMode?: ParcelColorMode;
  georefActive?: boolean;
  onGeorefClose?: () => void;
}

// ── Parcel color helpers ──
const STATUS_COLORS: Record<string, { border: string; fill: string }> = {
  "מוסדר": { border: "#16a34a", fill: "#22c55e" },
  "הסדר ראשוני": { border: "#2563eb", fill: "#3b82f6" },
  "בהסדר": { border: "#f59e0b", fill: "#fbbf24" },
  "לא מוסדר": { border: "#dc2626", fill: "#ef4444" },
};
const DEFAULT_STATUS_COLOR = { border: "#8b5cf6", fill: "#a78bfa" };

function getAreaColor(area?: number): { border: string; fill: string } {
  if (!area || area <= 0) return { border: "#9ca3af", fill: "#d1d5db" };
  if (area < 100) return { border: "#06b6d4", fill: "#22d3ee" };
  if (area < 500) return { border: "#16a34a", fill: "#4ade80" };
  if (area < 1000) return { border: "#f59e0b", fill: "#fbbf24" };
  if (area < 5000) return { border: "#f97316", fill: "#fb923c" };
  return { border: "#dc2626", fill: "#ef4444" };
}

function getParcelStyle(
  parcel: import("@/lib/boundaries").ParcelFeature,
  mode: ParcelColorMode,
  borderColor?: string,
  borderWeight?: number,
  borderFillOpacity?: number
) {
  if (mode === "landuse") {
    // Use landUse from DB data (enriched parcel)
    const landUseName = (parcel as any).landUse || parcel.status || "";
    const lu = getLandUseByName(landUseName);
    if (lu) {
      return { color: lu.border, weight: borderWeight ?? 2, fillColor: lu.fill, fillOpacity: 0.3 };
    }
    // Fallback for unknown land use
    return { color: borderColor ?? "#9ca3af", weight: borderWeight ?? 1.5, fillColor: "#d1d5db", fillOpacity: 0.1 };
  }
  if (mode === "status") {
    const c = STATUS_COLORS[parcel.status || ""] || DEFAULT_STATUS_COLOR;
    return { color: c.border, weight: borderWeight ?? 2, fillColor: c.fill, fillOpacity: 0.25 };
  }
  if (mode === "area") {
    const c = getAreaColor(parcel.legalArea);
    return { color: c.border, weight: borderWeight ?? 2, fillColor: c.fill, fillOpacity: 0.25 };
  }
  return {
    color: borderColor ?? "#dc2626",
    weight: borderWeight ?? 1.5,
    fillColor: borderColor ?? "#ef4444",
    fillOpacity: borderFillOpacity ?? 0.06,
  };
}

const MapViewInner = memo(function MapViewInner({ result, boundaries, aerialYear, planPath, onClearPlan, onMapClick, highlightGeometry, gisOverlay, parcelColorMode = "default", georefActive = false, onGeorefClose }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const highlightLayerRef = useRef<L.GeoJSON | null>(null);
  const gisOverlayRef = useRef<L.GeoJSON | null>(null);
  const storeLayersRef = useRef<Map<string, L.Layer>>(new Map());
  const paintedLayersRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeLayerId, setActiveLayerId] = useState("osm");
  const [mapReady, setMapReady] = useState(false);
  const [landUseMap, setLandUseMap] = useState<Map<number, { landUse: string; lotNumber?: number }>>(new Map());

  // Layer store – granular subscriptions to avoid unnecessary re-renders
  const storeLayers = useStoreLayers();
  const paintedParcels = useStorePaintedParcels();
  const labelSettings = useStoreLabelSettings();
  const borderSettings = useStoreBorderSettings();

  // Initialize map – wait until container has non-zero dimensions
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const el = containerRef.current;

    function tryInit() {
      if (!el || mapRef.current) return;
      // Guard: Leaflet crashes with "infinite tiles" if container has zero size
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        requestAnimationFrame(tryInit);
        return;
      }

      try {
      const map = L.map(el, {
          zoomControl: false,
          zoomSnap: 0.25,
          zoomDelta: 0.5,
          wheelPxPerZoomLevel: 80,
          zoomAnimation: true,
          fadeAnimation: true,
          markerZoomAnimation: true,
          preferCanvas: true, // Canvas renderer – much faster with many features
        });

        // Safe initial view – Kfar Chabad center
        map.setView([31.9604, 34.8536], 14);

        L.control.zoom({ position: "topleft" }).addTo(map);

        const defaultLayer = MAP_LAYERS[0];
        const tile = L.tileLayer(defaultLayer.url, {
          attribution: defaultLayer.attribution,
          maxZoom: defaultLayer.maxZoom ?? 19,
        }).addTo(map);

        tileLayerRef.current = tile;
        mapRef.current = map;

        setTimeout(() => {
          map.invalidateSize();
          setMapReady(true);
        }, 200);

        // Handle container resize (e.g. sidebar toggle)
        const ro = new ResizeObserver(() => {
          map.invalidateSize();
        });
        ro.observe(el);

        // Store cleanup ref
        (el as any).__ro = ro;
      } catch (err) {
        console.error("Map init failed:", err);
      }
    }

    // Kick off init (may defer via rAF if container size is 0)
    requestAnimationFrame(tryInit);

    return () => {
      const ro = (el as any).__ro as ResizeObserver | undefined;
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleLayerChange = useCallback((layer: MapLayerOption) => {
    if (!mapRef.current) return;
    setActiveLayerId(layer.id);

    if (tileLayerRef.current) tileLayerRef.current.remove();
    if (labelsLayerRef.current) {
      labelsLayerRef.current.remove();
      labelsLayerRef.current = null;
    }

    tileLayerRef.current = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: layer.maxZoom,
    }).addTo(mapRef.current);

    // Add labels overlay for hybrid mode
    if (layer.id === "esri-hybrid") {
      labelsLayerRef.current = L.tileLayer(LABELS_LAYER_URL, {
        maxZoom: 19,
        pane: "overlayPane",
      }).addTo(mapRef.current);
    }
  }, []);

  // Map click → reverse-geocode parcel
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    };

    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [mapReady]);

  // Update marker on result change
  useEffect(() => {
    if (!mapRef.current || !result) return;
    if (!isValidLatLng(result.lat, result.lng)) {
      console.warn("Invalid result coordinates:", result);
      return;
    }

    if (markerRef.current) {
      markerRef.current.remove();
    }

    try {
      const marker = L.marker([result.lat, result.lng])
        .addTo(mapRef.current)
        .bindPopup(`<div dir="rtl" style="text-align:right;font-size:14px;">${result.label}</div>`)
        .openPopup();

      markerRef.current = marker;
      mapRef.current.setView([result.lat, result.lng], 16);
    } catch (err) {
      console.error("Failed to set marker/view:", err);
    }
  }, [result]);

  // Fetch land use data when boundaries change
  useEffect(() => {
    if (!boundaries || !boundaries.allParcels.length) {
      setLandUseMap(new Map());
      return;
    }
    const gush = boundaries.allParcels[0]?.gush;
    if (!gush) return;

    fetchParcelLandUse(gush).then(setLandUseMap).catch(() => setLandUseMap(new Map()));
  }, [boundaries]);

  // Update boundary layers – show block outline + all parcel subdivisions
  useEffect(() => {
    if (!mapRef.current) return;

    if (boundaryLayerRef.current) {
      // Clean up zoom event handler from previous render
      (boundaryLayerRef.current as any).__cleanupZoom?.();
      boundaryLayerRef.current.clearLayers();
      boundaryLayerRef.current.remove();
      boundaryLayerRef.current = null;
    }

    if (!boundaries) return;

    const layerGroup = L.layerGroup().addTo(mapRef.current);

    // Always show block outline (blue)
    if (boundaries.blockGeometry) {
      L.geoJSON(boundaries.blockGeometry as any, {
        style: {
          color: "#2563eb",
          weight: 2.5,
          fillColor: "#3b82f6",
          fillOpacity: 0.04,
        },
      }).addTo(layerGroup);
    }

    // Show all parcels within the gush — single batched L.geoJSON for performance
    if (boundaries.allParcels && boundaries.allParcels.length > 0) {
      // Build a single FeatureCollection with enriched properties
      const features: GeoJSON.Feature[] = boundaries.allParcels.map((parcel) => {
        const luInfo = landUseMap.get(parcel.helka);
        return {
          type: "Feature" as const,
          properties: {
            helka: parcel.helka,
            gush: parcel.gush,
            legalArea: parcel.legalArea,
            status: parcel.status,
            landUse: luInfo?.landUse ?? parcel.landUse,
            lotNumber: luInfo?.lotNumber ?? parcel.lotNumber,
          },
          geometry: parcel.geometry,
        };
      });

      const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

      const parcelsLayer = L.geoJSON(fc, {
        style: (feature) => {
          if (!feature) return {};
          const p = feature.properties as any;
          return getParcelStyle(p, parcelColorMode, borderSettings.color, borderSettings.weight, borderSettings.fillOpacity);
        },
        onEachFeature: (feature, featureLayer) => {
          const p = feature.properties as any;
          // Popup with parcel info
          featureLayer.bindPopup(
            `<div dir="rtl" style="text-align:right;font-size:13px;">` +
            `<b>חלקה ${p.helka}</b><br/>` +
            `גוש ${p.gush}<br/>` +
            (p.lotNumber ? `<b>מגרש ${p.lotNumber}</b><br/>` : "") +
            (p.landUse ? `יעוד: ${p.landUse}<br/>` : "") +
            (p.legalArea ? `שטח רשום: ${Number(p.legalArea).toLocaleString()} מ"ר<br/>` : "") +
            (p.status ? `סטטוס: ${p.status}` : "") +
            `</div>`
          );
        },
      }).addTo(layerGroup);

      // ── Zoom-gated labels: only show above zoom 15 to avoid DOM overload ──
      const LABEL_ZOOM_THRESHOLD = 15;
      let tooltipsBound = false;

      const syncTooltips = () => {
        const map = mapRef.current;
        if (!map) return;
        const zoom = map.getZoom();
        const shouldShow = labelSettings.visible && zoom >= LABEL_ZOOM_THRESHOLD;

        if (shouldShow && !tooltipsBound) {
          parcelsLayer.eachLayer((layer: any) => {
            const f = layer.feature;
            if (!f || f.properties.helka <= 0) return;
            let text = String(f.properties.helka);
            if (labelSettings.showLotNumbers && f.properties.lotNumber) {
              text += `\nמגרש ${f.properties.lotNumber}`;
            }
            layer.bindTooltip(text, {
              permanent: true,
              direction: "center",
              className: "parcel-number-label",
            });
          });
          tooltipsBound = true;
        } else if (!shouldShow && tooltipsBound) {
          parcelsLayer.eachLayer((layer: any) => {
            layer.unbindTooltip();
          });
          tooltipsBound = false;
        }
      };

      syncTooltips(); // initial check
      mapRef.current.on("zoomend", syncTooltips);

      // Store cleanup handler on the layerGroup so it's removed on re-render
      (layerGroup as any).__cleanupZoom = () => {
        mapRef.current?.off("zoomend", syncTooltips);
      };
    }

    // Highlighted specific parcel (thicker) if searching for specific helka
    if (boundaries.parcelGeometry && borderSettings.highlightVisible) {
      L.geoJSON(boundaries.parcelGeometry as any, {
        style: {
          color: borderSettings.highlightColor,
          weight: borderSettings.highlightWeight,
          fillColor: borderSettings.highlightColor,
          fillOpacity: borderSettings.highlightFillOpacity,
        },
      }).addTo(layerGroup);

      try {
        const pl = L.geoJSON(boundaries.parcelGeometry as any);
        const bounds = pl.getBounds();
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch { /* ignore */ }
    } else if (boundaries.blockGeometry) {
      try {
        const blockLayer = L.geoJSON(boundaries.blockGeometry as any);
        const bounds = blockLayer.getBounds();
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch { /* ignore */ }
    }

    boundaryLayerRef.current = layerGroup;
  }, [boundaries, parcelColorMode, labelSettings.visible, labelSettings.showLotNumbers, borderSettings, landUseMap]);

  // ── Dynamic CSS for parcel label styling ──
  useEffect(() => {
    const styleId = "parcel-label-dynamic-style";
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = `
      .parcel-number-label {
        font-size: ${labelSettings.fontSize}px !important;
        color: ${labelSettings.textColor} !important;
        background: ${labelSettings.bgEnabled ? labelSettings.bgColor : "transparent"} !important;
        border: ${labelSettings.bgEnabled ? `1px solid ${labelSettings.borderColor}` : "none"} !important;
        opacity: ${labelSettings.opacity} !important;
        box-shadow: ${labelSettings.bgEnabled ? "0 1px 3px rgba(0,0,0,0.15)" : "none"} !important;
        padding: ${labelSettings.bgEnabled ? "1px 4px" : "0"} !important;
      }
    `;
    return () => { /* keep style element for reuse */ };
  }, [labelSettings]);

  // ── Highlight parcel polygon (from map click or URL deep-link) ──
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove previous highlight
    if (highlightLayerRef.current) {
      highlightLayerRef.current.remove();
      highlightLayerRef.current = null;
    }

    if (!highlightGeometry) return;

    const layer = L.geoJSON(highlightGeometry as any, {
      style: {
        color: "#f59e0b",
        weight: 4,
        fillColor: "#fbbf24",
        fillOpacity: 0.25,
        dashArray: "8 4",
      },
    }).addTo(mapRef.current);

    // Fit map to highlighted parcel
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
      }
    } catch { /* ignore invalid bounds */ }

    highlightLayerRef.current = layer;
  }, [highlightGeometry]);

  // ── GIS overlay from uploaded files (DXF, GeoJSON, KML) ──
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove previous overlay
    if (gisOverlayRef.current) {
      gisOverlayRef.current.remove();
      gisOverlayRef.current = null;
    }

    if (!gisOverlay || !gisOverlay.features?.length) return;

    const colors = ["#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

    const layer = L.geoJSON(gisOverlay as any, {
      style: (feature) => {
        const layerName = String(feature?.properties?.layer ?? "0");
        const hash = Array.from(layerName).reduce((s: number, c: string) => s + c.charCodeAt(0), 0);
        const color = colors[hash % colors.length];
        return {
          color,
          weight: 2.5,
          fillColor: color,
          fillOpacity: 0.15,
        };
      },
      pointToLayer: (_feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: "#e11d48",
          color: "#fff",
          weight: 1.5,
          fillOpacity: 0.8,
        });
      },
      onEachFeature: (feature, featureLayer) => {
        if (feature.properties) {
          const entries = Object.entries(feature.properties)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => `<b>${k}</b>: ${v}`)
            .join("<br>");
          if (entries) {
            featureLayer.bindPopup(`<div dir="rtl" style="text-align:right;font-size:12px">${entries}</div>`);
          }
        }
      },
    }).addTo(mapRef.current);

    // Fit map to overlay bounds
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      }
    } catch { /* ignore */ }

    gisOverlayRef.current = layer;
  }, [gisOverlay]);

  // TABA outlines are now managed through the layer store (LayerManager)
  // No separate rendering needed here

  // ── Render store-managed layers ──
  // We need to serialize key style properties to detect changes reliably
  const storeLayersStyleKey = storeLayers.map(l => `${l.id}:${l.visible}:${l.color}:${l.fillColor}:${l.opacity}:${l.fillOpacity}:${l.weight}:${l.dashArray ?? ""}`).join("|");

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const currentMap = storeLayersRef.current;

    // Set of current store layer IDs
    const storeIds = new Set(storeLayers.map((l) => l.id));

    // Remove layers no longer in store
    for (const [id, leafletLayer] of currentMap.entries()) {
      if (!storeIds.has(id)) {
        map.removeLayer(leafletLayer);
        currentMap.delete(id);
      }
    }

    // Add or update layers
    for (const sl of storeLayers) {
      const existing = currentMap.get(sl.id);

      if (existing) {
        // Update visibility
        if (!sl.visible && map.hasLayer(existing)) {
          map.removeLayer(existing);
        } else if (sl.visible && !map.hasLayer(existing)) {
          map.addLayer(existing);
        }

        // Update style for GeoJSON layers
        if (sl.kind === "geojson" && existing instanceof L.GeoJSON) {
          existing.setStyle({
            color: sl.color,
            weight: sl.weight,
            opacity: sl.opacity,
            fillColor: sl.fillColor,
            fillOpacity: sl.fillOpacity,
            dashArray: sl.dashArray || undefined,
          });
        }
      } else if (sl.data && sl.kind === "geojson") {
        // Create new GeoJSON layer
        const geojsonLayer = L.geoJSON(sl.data as any, {
          style: {
            color: sl.color,
            weight: sl.weight,
            opacity: sl.opacity,
            fillColor: sl.fillColor,
            fillOpacity: sl.fillOpacity,
            dashArray: sl.dashArray || undefined,
          },
          pointToLayer: (_feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 5,
              fillColor: sl.fillColor,
              color: sl.color,
              weight: sl.weight,
              fillOpacity: sl.fillOpacity,
              opacity: sl.opacity,
            });
          },
          onEachFeature: (feature, featureLayer) => {
            if (feature.properties) {
              const entries = Object.entries(feature.properties)
                .filter(([, v]) => v != null && v !== "")
                .map(([k, v]) => `<b>${k}</b>: ${v}`)
                .join("<br>");
              if (entries) {
                featureLayer.bindPopup(
                  `<div dir="rtl" style="text-align:right;font-size:12px">${entries}</div>`
                );
              }
            }
          },
        });

        if (sl.visible) geojsonLayer.addTo(map);
        currentMap.set(sl.id, geojsonLayer);
      }
    }
  }, [storeLayers, storeLayersStyleKey]);

  // ── Render painted parcels ──
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove previous painted layer group
    if (paintedLayersRef.current) {
      paintedLayersRef.current.clearLayers();
      paintedLayersRef.current.remove();
      paintedLayersRef.current = null;
    }

    if (paintedParcels.length === 0) return;

    const group = L.layerGroup().addTo(map);
    paintedLayersRef.current = group;

    // Fetch boundaries for each painted parcel and render
    for (const pp of paintedParcels) {
      fetchBoundaries(pp.gush, pp.helka)
        .then((b) => {
          if (!b.parcelGeometry || !paintedLayersRef.current) return;
          const fc: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: { gush: pp.gush, helka: pp.helka }, geometry: b.parcelGeometry }],
          };
          const layer = L.geoJSON(fc, {
            style: {
              color: pp.color,
              weight: 3,
              fillColor: pp.fillColor,
              fillOpacity: pp.fillOpacity,
            },
          });
          if (pp.label) {
            layer.bindTooltip(pp.label, {
              permanent: true,
              direction: "center",
              className: "painted-parcel-label",
            });
          }
          layer.addTo(group);
        })
        .catch(() => { /* ignore missing parcels */ });
    }
  }, [paintedParcels]);

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      <MapLayerSwitcher activeLayerId={activeLayerId} onLayerChange={handleLayerChange} />
      {mapReady && <MapToolbar map={mapRef.current} />}
      {mapReady && <MapMeasure map={mapRef.current} />}
      {mapReady && <ScaleBarControl map={mapRef.current} />}
      {mapReady && <CoordinateDisplay map={mapRef.current} />}
      {mapReady && <AerialOverlay map={mapRef.current} year={aerialYear ?? null} />}
      {mapReady && (
        <PlanOverlay
          map={mapRef.current}
          planPath={planPath ?? null}
          onClose={onClearPlan ?? (() => {})}
        />
      )}
      {mapReady && (
        <GeorefTool
          map={mapRef.current}
          active={georefActive}
          onClose={onGeorefClose ?? (() => {})}
        />
      )}
    </div>
  );
});

// Wrap with error boundary so Leaflet crashes don't kill the entire app
export function MapView(props: MapViewProps) {
  return (
    <MapErrorBoundary>
      <MapViewInner {...props} />
    </MapErrorBoundary>
  );
}