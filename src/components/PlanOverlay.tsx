/**
 * PlanOverlay.tsx – Display georeferenced plan images on the map
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { planImageUrl } from "@/lib/kfar-chabad-api";
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

// ITM → WGS84 (same as AerialOverlay)
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
  const R1 = (a * (1 - e * e)) / Math.pow(1 - e * e * Math.sin(phi1) * Math.sin(phi1), 1.5);
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
