import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { Ruler, X, Undo2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapMeasureProps {
  map: L.Map | null;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} מ'`;
  return `${(meters / 1000).toFixed(2)} ק"מ`;
}

export function MapMeasure({ map }: MapMeasureProps) {
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState<L.LatLng[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const activeRef = useRef(false);

  // Keep ref in sync
  activeRef.current = active;

  const clearMeasure = useCallback(() => {
    if (layerRef.current) {
      layerRef.current.clearLayers();
    }
    setPoints([]);
    setTotalDistance(0);
  }, []);

  const undoLast = useCallback(() => {
    setPoints((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const toggleActive = useCallback(() => {
    setActive((prev) => {
      if (prev) {
        // Deactivating
        clearMeasure();
        if (map) {
          map.getContainer().style.cursor = "";
        }
        return false;
      }
      // Activating
      if (map) {
        map.getContainer().style.cursor = "crosshair";
      }
      return true;
    });
  }, [map, clearMeasure]);

  // Initialize layer group
  useEffect(() => {
    if (!map) return;
    const lg = L.layerGroup().addTo(map);
    layerRef.current = lg;
    return () => {
      lg.remove();
      layerRef.current = null;
    };
  }, [map]);

  // Map click handler
  useEffect(() => {
    if (!map) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      if (!activeRef.current) return;
      setPoints((prev) => [...prev, e.latlng]);
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  // Redraw on points change
  useEffect(() => {
    if (!layerRef.current || !map) return;
    layerRef.current.clearLayers();

    if (points.length === 0) {
      setTotalDistance(0);
      return;
    }

    // Draw markers
    points.forEach((pt, i) => {
      const isFirst = i === 0;
      const marker = L.circleMarker(pt, {
        radius: isFirst ? 6 : 5,
        color: "#2563eb",
        fillColor: isFirst ? "#2563eb" : "#fff",
        fillOpacity: 1,
        weight: 2,
      });
      layerRef.current!.addLayer(marker);
    });

    // Draw lines and calculate distance
    let dist = 0;
    if (points.length > 1) {
      const polyline = L.polyline(points, {
        color: "#2563eb",
        weight: 3,
        dashArray: "8, 6",
      });
      layerRef.current!.addLayer(polyline);

      for (let i = 1; i < points.length; i++) {
        dist += points[i - 1].distanceTo(points[i]);

        // Segment label
        const segDist = points[i - 1].distanceTo(points[i]);
        const mid = L.latLng(
          (points[i - 1].lat + points[i].lat) / 2,
          (points[i - 1].lng + points[i].lng) / 2
        );
        const label = L.marker(mid, {
          icon: L.divIcon({
            className: "measure-label",
            html: `<span style="background:hsl(var(--background));color:hsl(var(--foreground));padding:1px 6px;border-radius:4px;font-size:11px;border:1px solid hsl(var(--border));white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.15)">${formatDistance(segDist)}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          }),
          interactive: false,
        });
        layerRef.current!.addLayer(label);
      }
    }
    setTotalDistance(dist);
  }, [points, map]);

  // Cleanup cursor on unmount
  useEffect(() => {
    return () => {
      if (map) map.getContainer().style.cursor = "";
    };
  }, [map]);

  return (
    <div className="absolute top-14 left-3 z-[1000] flex flex-col gap-2" dir="rtl">
      <Button
        size="icon"
        variant={active ? "default" : "outline"}
        onClick={toggleActive}
        className="h-9 w-9 shadow-md gold-border gold-glow"
        title="מדידת מרחק"
      >
        <Ruler className="h-4 w-4" />
      </Button>

      {active && (
        <div className="bg-card border rounded-lg shadow-lg p-3 min-w-[160px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">מדידת מרחק</span>
            <button onClick={toggleActive} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="text-lg font-bold text-foreground mb-2">
            {formatDistance(totalDistance)}
          </div>

          <div className="text-xs text-muted-foreground mb-2">
            {points.length === 0 ? "לחץ על המפה להתחלה" : `${points.length} נקודות`}
          </div>

          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={undoLast} disabled={points.length === 0} className="h-7 text-xs flex-1 gap-1">
              <Undo2 className="h-3 w-3" />
              בטל
            </Button>
            <Button size="sm" variant="outline" onClick={clearMeasure} disabled={points.length === 0} className="h-7 text-xs flex-1 gap-1">
              <Trash2 className="h-3 w-3" />
              נקה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
