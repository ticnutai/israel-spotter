/**
 * MiniMap – Lightweight overview map control (bottom-right corner).
 * Shows a reduced-scale view of the main map with a viewport rectangle.
 * Pure Leaflet implementation – no external dependencies.
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { ChevronDown, ChevronUp } from "lucide-react";

interface MiniMapProps {
  map: L.Map | null;
}

const MINIMAP_TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ZOOM_OFFSET = -5;

export function MiniMap({ map }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<L.Map | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!map || !containerRef.current) return;

    const miniMap = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    });

    L.tileLayer(MINIMAP_TILE, { maxZoom: 18 }).addTo(miniMap);

    const rect = L.rectangle(map.getBounds(), {
      color: "#3b82f6",
      weight: 2,
      fillOpacity: 0.15,
      interactive: false,
    }).addTo(miniMap);

    // Sync on main map move
    const sync = () => {
      const center = map.getCenter();
      const zoom = Math.max(map.getZoom() + ZOOM_OFFSET, 1);
      miniMap.setView(center, zoom, { animate: false });
      rect.setBounds(map.getBounds());
    };

    sync();
    map.on("moveend zoomend", sync);
    miniMapRef.current = miniMap;
    rectRef.current = rect;

    return () => {
      map.off("moveend zoomend", sync);
      miniMap.remove();
      miniMapRef.current = null;
      rectRef.current = null;
    };
  }, [map]);

  // Resize when collapsed state changes
  useEffect(() => {
    if (miniMapRef.current) {
      setTimeout(() => miniMapRef.current?.invalidateSize(), 100);
    }
  }, [collapsed]);

  if (!map) return null;

  return (
    <div
      className="absolute z-[800] flex flex-col"
      style={{ bottom: 32, right: 8 }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="self-end mb-0.5 bg-card/90 backdrop-blur border rounded-t px-1.5 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
        title={collapsed ? "הצג מפת מיני" : "הסתר מפת מיני"}
        style={{ fontSize: 10 }}
      >
        {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      <div
        ref={containerRef}
        className="rounded border-2 border-card/80 shadow-lg transition-all overflow-hidden"
        style={{
          width: collapsed ? 0 : 150,
          height: collapsed ? 0 : 120,
          opacity: collapsed ? 0 : 1,
        }}
      />
    </div>
  );
}
