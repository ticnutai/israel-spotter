/**
 * AerialOverlay.tsx Γאף Shows historical aerial images as Leaflet overlays
 *
 * Uses the worldfile georeferencing info from the backend to place
 * stitched aerial images correctly on the map (EPSG:2039 Γזע WGS84).
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { aerialStitchedUrl, aerialWorldfileUrl } from "@/lib/kfar-chabad-api";
import { Slider } from "@/components/ui/slider";

interface AerialOverlayProps {
  map: L.Map | null;
  year: string | null;
}

// Convert ITM (EPSG:2039) to WGS84 Γאפ same formula as geocode.ts
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

export function AerialOverlay({ map, year }: AerialOverlayProps) {
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
          ╫ª╫ש╫£╫ץ╫¥ ╫נ╫ץ╫ץ╫ש╫¿ {year}
          {loading && <span className="text-muted-foreground mr-1">╫ר╫ץ╫ó╫ƒ...</span>}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">╫⌐╫º╫ש╫ñ╫ץ╫¬</span>
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
