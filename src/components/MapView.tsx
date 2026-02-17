import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";
import { MapLayerSwitcher, MAP_LAYERS, LABELS_LAYER_URL, type MapLayerOption } from "./MapLayerSwitcher";
import { MapMeasure } from "./MapMeasure";

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

interface MapViewProps {
  result: GeoResult | null;
  boundaries: BoundaryResult | null;
}

export function MapView({ result, boundaries }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const labelsLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeLayerId, setActiveLayerId] = useState("osm");
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([31.5, 34.8], 8);
    const defaultLayer = MAP_LAYERS[0];
    const tile = L.tileLayer(defaultLayer.url, {
      attribution: defaultLayer.attribution,
      maxZoom: defaultLayer.maxZoom,
    }).addTo(map);

    tileLayerRef.current = tile;
    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
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

  // Update marker on result change
  useEffect(() => {
    if (!mapRef.current || !result) return;

    if (markerRef.current) {
      markerRef.current.remove();
    }

    const marker = L.marker([result.lat, result.lng])
      .addTo(mapRef.current)
      .bindPopup(`<div dir="rtl" style="text-align:right;font-size:14px;">${result.label}</div>`)
      .openPopup();

    markerRef.current = marker;
    mapRef.current.setView([result.lat, result.lng], 16);
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

      mapRef.current.fitBounds(parcelLayer.getBounds(), { padding: [50, 50] });
    }

    boundaryLayerRef.current = layerGroup;
  }, [boundaries]);

  return (
    <div className="flex-1 w-full relative">
      <div ref={containerRef} className="absolute inset-0" />
      <MapLayerSwitcher activeLayerId={activeLayerId} onLayerChange={handleLayerChange} />
      {mapReady && <MapMeasure map={mapRef.current} />}
    </div>
  );
}
