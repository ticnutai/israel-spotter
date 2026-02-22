/**
 * AerialOverlay.tsx – Shows historical aerial images as Leaflet overlays
 *
 * Uses the worldfile georeferencing info from the backend to place
 * stitched aerial images correctly on the map (EPSG:2039 → WGS84).
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { aerialStitchedUrl, aerialWorldfileUrl } from "@/lib/kfar-chabad-api";
import { itmToWgs84 } from "@/lib/itm-to-wgs84";
import { Slider } from "@/components/ui/slider";

interface AerialOverlayProps {
  map: L.Map | null;
  year: string | null;
  onClose?: () => void;
}

export function AerialOverlay({ map, year, onClose }: AerialOverlayProps) {
  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const [opacity, setOpacity] = useState(0.7);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!map || !year) {
      // Remove existing overlay
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Fetch world file to get bounds
        const res = await fetch(aerialWorldfileUrl(year, 7));
        if (!res.ok) {
          // Try level 5
          const res5 = await fetch(aerialWorldfileUrl(year, 5));
          if (!res5.ok) throw new Error("No worldfile");
          const wf = await res5.json();
          await addOverlay(wf, year, 5);
          return;
        }
        const wf = await res.json();
        await addOverlay(wf, year, 7);
      } catch {
        setLoading(false);
      }
    })();

    async function addOverlay(
      wf: { pixel_size_x: number; pixel_size_y: number; origin_x: number; origin_y: number },
      yr: string,
      level: number
    ) {
      if (cancelled) return;

      // We need the image dimensions to compute bounds
      // Load the image to get its natural size
      const imgUrl = aerialStitchedUrl(yr, level);
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.src = imgUrl;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      });

      if (cancelled) return;

      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // Calculate bounds in ITM
      const minX = wf.origin_x;
      const maxY = wf.origin_y;
      const maxX = minX + w * wf.pixel_size_x;
      const minY = maxY + h * wf.pixel_size_y; // pixel_size_y is negative

      // Convert corners to WGS84
      const [swLat, swLng] = itmToWgs84(minX, minY);
      const [neLat, neLng] = itmToWgs84(maxX, maxY);

      const bounds = L.latLngBounds([swLat, swLng], [neLat, neLng]);

      // Remove old overlay
      if (overlayRef.current) {
        overlayRef.current.remove();
      }

      const overlay = L.imageOverlay(imgUrl, bounds, {
        opacity,
        zIndex: 400,
      }).addTo(map!);

      overlayRef.current = overlay;
      setLoading(false);

      // Fly to the overlay
      map!.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
    }

    return () => {
      cancelled = true;
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
    };
  }, [map, year]);

  // Update opacity
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  if (!year) return null;

  return (
    <div
      className="absolute bottom-4 right-4 z-[1000] bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3 min-w-[200px]"
      dir="rtl"
    >
      <div className="text-sm font-medium mb-2 flex items-center justify-between">
        <span>
          צילום אוויר {year}
          {loading && <span className="text-muted-foreground mr-1">טוען...</span>}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
            title="סגור שכבת אוויר"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
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
