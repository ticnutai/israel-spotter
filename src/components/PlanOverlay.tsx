/**
 * PlanOverlay.tsx – Display georeferenced plan images on the map
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { planImageUrl } from "@/lib/kfar-chabad-api";
import { itmToWgs84 } from "@/lib/itm-to-wgs84";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface PlanOverlayProps {
  map: L.Map | null;
  planPath: string | null;
  /** World-file georeferencing. If null, the overlay is centered on Kfar Chabad */
  georef?: {
    pixel_size_x: number;
    pixel_size_y: number;
    origin_x: number;
    origin_y: number;
  } | null;
  onClose: () => void;
}

export function PlanOverlay({ map, planPath, georef, onClose }: PlanOverlayProps) {
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const [opacity, setOpacity] = useState(0.6);

  useEffect(() => {
    if (!map || !planPath) {
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
      return;
    }

    const imgUrl = planImageUrl(planPath);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;

    let cancelled = false;

    img.onload = () => {
      if (cancelled) return;

      let bounds: L.LatLngBounds;

      if (georef) {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const minX = georef.origin_x;
        const maxY = georef.origin_y;
        const maxX = minX + w * georef.pixel_size_x;
        const minY = maxY + h * georef.pixel_size_y;

        const [swLat, swLng] = itmToWgs84(minX, minY);
        const [neLat, neLng] = itmToWgs84(maxX, maxY);
        bounds = L.latLngBounds([swLat, swLng], [neLat, neLng]);
      } else {
        // Default: center on Kfar Chabad with ~500m extent
        const center = { lat: 31.9604, lng: 34.8536 };
        const delta = 0.003;
        bounds = L.latLngBounds(
          [center.lat - delta, center.lng - delta],
          [center.lat + delta, center.lng + delta]
        );
      }

      if (overlayRef.current) overlayRef.current.remove();

      overlayRef.current = L.imageOverlay(imgUrl, bounds, {
        opacity,
        zIndex: 500,
      }).addTo(map);

      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
    };

    return () => {
      cancelled = true;
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
    };
  }, [map, planPath, georef]);

  useEffect(() => {
    if (overlayRef.current) overlayRef.current.setOpacity(opacity);
  }, [opacity]);

  if (!planPath) return null;

  return (
    <div
      className="absolute bottom-4 left-4 z-[1000] bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3 min-w-[220px]"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium truncate max-w-[170px]">
          שכבת תשריט
        </span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">שקיפות</span>
        <Slider
          value={[opacity * 100]}
          max={100}
          step={5}
          className="flex-1"
          onValueChange={(v) => setOpacity(v[0] / 100)}
        />
        <span className="text-xs w-8 text-left">{Math.round(opacity * 100)}%</span>
      </div>
    </div>
  );
}
