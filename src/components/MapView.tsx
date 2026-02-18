import { useEffect, useRef, useState, useCallback, Component, type ReactNode } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";
import { MapLayerSwitcher, MAP_LAYERS, LABELS_LAYER_URL, type MapLayerOption } from "./MapLayerSwitcher";
import { MapMeasure } from "./MapMeasure";
import { ScaleBarControl } from "./ScaleBarControl";
import { AerialOverlay } from "./AerialOverlay";
import { PlanOverlay } from "./PlanOverlay";
import { useLayerStore } from "@/hooks/use-layer-store";
import { fetchBoundaries } from "@/lib/boundaries";

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

interface MapViewProps {
  result: GeoResult | null;
  boundaries: BoundaryResult | null;
  aerialYear?: string | null;
  planPath?: string | null;
  onClearPlan?: () => void;
  onMapClick?: (lat: number, lng: number) => void;
  highlightGeometry?: GeoJSON.Geometry | null;
  gisOverlay?: GeoJSON.FeatureCollection | null;
}

function MapViewInner({ result, boundaries, aerialYear, planPath, onClearPlan, onMapClick, highlightGeometry, gisOverlay }: MapViewProps) {
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

  // Layer store
  const { layers: storeLayers, paintedParcels } = useLayerStore();

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

  // Update boundary layers
  useEffect(() => {
    if (!mapRef.current) return;

    if (boundaryLayerRef.current) {
      boundaryLayerRef.current.clearLayers();
      boundaryLayerRef.current.remove();
      boundaryLayerRef.current = null;
    }

    if (!boundaries) return;

    const layerGroup = L.layerGroup().addTo(mapRef.current);

    if (boundaries.blockGeometry) {
      L.geoJSON(boundaries.blockGeometry as any, {
        style: {
          color: "#2563eb",
          weight: 2,
          fillColor: "#3b82f6",
          fillOpacity: 0.1,
        },
      }).addTo(layerGroup);
    }

    if (boundaries.parcelGeometry) {
      const parcelLayer = L.geoJSON(boundaries.parcelGeometry as any, {
        style: {
          color: "#dc2626",
          weight: 3,
          fillColor: "#ef4444",
          fillOpacity: 0.2,
        },
      }).addTo(layerGroup);

      try {
        const bounds = parcelLayer.getBounds();
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch { /* ignore invalid bounds */ }
    } else if (boundaries.blockGeometry) {
      // If only block geometry, fit to that
      try {
        const blockLayer = L.geoJSON(boundaries.blockGeometry as any);
        const bounds = blockLayer.getBounds();
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch { /* ignore */ }
    }

    boundaryLayerRef.current = layerGroup;
  }, [boundaries]);

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
        const layerName = feature?.properties?.layer ?? "0";
        const hash = Array.from(layerName).reduce((s, c) => s + c.charCodeAt(0), 0);
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

  // ── Render store-managed layers ──
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
  }, [storeLayers]);

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
      {mapReady && <MapMeasure map={mapRef.current} />}
      {mapReady && <ScaleBarControl map={mapRef.current} />}
      {mapReady && <AerialOverlay map={mapRef.current} year={aerialYear ?? null} />}
      {mapReady && (
        <PlanOverlay
          map={mapRef.current}
          planPath={planPath ?? null}
          onClose={onClearPlan ?? (() => {})}
        />
      )}
    </div>
  );
}

// Wrap with error boundary so Leaflet crashes don't kill the entire app
export function MapView(props: MapViewProps) {
  return (
    <MapErrorBoundary>
      <MapViewInner {...props} />
    </MapErrorBoundary>
  );
}