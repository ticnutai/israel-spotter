/**
 * GeorefTool.tsx – Interactive georeferencing tool
 * 
 * Allows uploading an image and manually positioning it on the map
 * with drag, resize handles, rotation, and opacity controls.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { X, Upload, RotateCw, Move, Save, Maximize2 } from "lucide-react";

interface GeorefToolProps {
  map: L.Map | null;
  active: boolean;
  onClose: () => void;
}

// Custom draggable corner icon
function cornerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:nwse-resize;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function centerIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:20px;height:20px;background:hsl(222.2 47.4% 11.2%);border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:move;display:flex;align-items:center;justify-content:center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function rotateIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;background:hsl(43 56% 52%);border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);cursor:grab;display:flex;align-items:center;justify-content:center;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8"/></svg></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function GeorefTool({ map, active, onClose }: GeorefToolProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.7);
  const [rotation, setRotation] = useState(0);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  const overlayRef = useRef<L.ImageOverlay | null>(null);
  const cornersRef = useRef<L.Marker[]>([]);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const rotateMarkerRef = useRef<L.Marker | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up everything
  const cleanup = useCallback(() => {
    cornersRef.current.forEach((m) => m.remove());
    cornersRef.current = [];
    centerMarkerRef.current?.remove();
    centerMarkerRef.current = null;
    rotateMarkerRef.current?.remove();
    rotateMarkerRef.current = null;
    overlayRef.current?.remove();
    overlayRef.current = null;
    boundsRef.current = null;
  }, []);

  // Remove overlay when tool is deactivated
  useEffect(() => {
    if (!active) {
      cleanup();
      setImageUrl(null);
      setRotation(0);
      setOpacity(0.7);
      setImageDims(null);
    }
  }, [active, cleanup]);

  // Update overlay opacity
  useEffect(() => {
    if (overlayRef.current) overlayRef.current.setOpacity(opacity);
  }, [opacity]);

  // Update rotation via CSS on the overlay element
  useEffect(() => {
    if (overlayRef.current) {
      const el = overlayRef.current.getElement();
      if (el) {
        el.style.transformOrigin = "center center";
        el.style.transform = `rotate(${rotation}deg)`;
      }
    }
  }, [rotation]);

  // Update overlay bounds and handle markers
  const updateOverlay = useCallback(() => {
    if (!map || !boundsRef.current || !overlayRef.current) return;
    overlayRef.current.setBounds(boundsRef.current);

    // Apply rotation CSS
    const el = overlayRef.current.getElement();
    if (el) {
      el.style.transformOrigin = "center center";
      el.style.transform = `rotate(${rotation}deg)`;
    }

    // Update corner markers
    const sw = boundsRef.current.getSouthWest();
    const ne = boundsRef.current.getNorthEast();
    const nw = L.latLng(ne.lat, sw.lng);
    const se = L.latLng(sw.lat, ne.lng);
    const positions = [sw, nw, ne, se];
    cornersRef.current.forEach((m, i) => {
      if (positions[i]) m.setLatLng(positions[i]);
    });

    // Update center marker
    const center = boundsRef.current.getCenter();
    centerMarkerRef.current?.setLatLng(center);

    // Update rotate marker (above the top center)
    const topCenter = L.latLng(ne.lat + (ne.lat - sw.lat) * 0.15, (sw.lng + ne.lng) / 2);
    rotateMarkerRef.current?.setLatLng(topCenter);
  }, [map, rotation]);

  // Create the interactive overlay once image is loaded
  const createOverlay = useCallback(
    (url: string, imgW: number, imgH: number) => {
      if (!map) return;
      cleanup();

      // Place image centered on current view, proportional to image aspect ratio
      const center = map.getCenter();
      const mapBounds = map.getBounds();
      const spanLat = (mapBounds.getNorth() - mapBounds.getSouth()) * 0.4;
      const spanLng = spanLat * (imgW / imgH);

      const sw = L.latLng(center.lat - spanLat / 2, center.lng - spanLng / 2);
      const ne = L.latLng(center.lat + spanLat / 2, center.lng + spanLng / 2);
      const bounds = L.latLngBounds(sw, ne);
      boundsRef.current = bounds;

      // Create overlay
      const overlay = L.imageOverlay(url, bounds, {
        opacity,
        interactive: false,
        zIndex: 600,
      }).addTo(map);
      overlayRef.current = overlay;

      // Apply initial rotation
      const el = overlay.getElement();
      if (el) {
        el.style.transformOrigin = "center center";
        el.style.transform = `rotate(${rotation}deg)`;
        el.style.pointerEvents = "none";
      }

      // Create corner markers (SW, NW, NE, SE)
      const nw = L.latLng(ne.lat, sw.lng);
      const se = L.latLng(sw.lat, ne.lng);
      const cornerPositions = [sw, nw, ne, se];
      const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];

      cornerPositions.forEach((pos, i) => {
        const marker = L.marker(pos, {
          draggable: true,
          icon: cornerIcon(colors[i]),
          zIndexOffset: 10000,
        }).addTo(map);

        marker.on("drag", () => {
          const latlng = marker.getLatLng();
          const b = boundsRef.current!;
          const swP = b.getSouthWest();
          const neP = b.getNorthEast();

          // Update bounds based on which corner is being dragged
          if (i === 0) { // SW
            boundsRef.current = L.latLngBounds(latlng, neP);
          } else if (i === 1) { // NW
            boundsRef.current = L.latLngBounds(
              L.latLng(swP.lat, latlng.lng),
              L.latLng(latlng.lat, neP.lng)
            );
          } else if (i === 2) { // NE
            boundsRef.current = L.latLngBounds(swP, latlng);
          } else { // SE
            boundsRef.current = L.latLngBounds(
              L.latLng(latlng.lat, swP.lng),
              L.latLng(neP.lat, latlng.lng)
            );
          }
          updateOverlay();
        });

        cornersRef.current.push(marker);
      });

      // Center drag marker
      const centerMarker = L.marker(bounds.getCenter(), {
        draggable: true,
        icon: centerIcon(),
        zIndexOffset: 10001,
      }).addTo(map);

      let dragStart: L.LatLng | null = null;
      let boundsStart: L.LatLngBounds | null = null;

      centerMarker.on("dragstart", () => {
        dragStart = centerMarker.getLatLng();
        boundsStart = boundsRef.current ? L.latLngBounds(
          boundsRef.current.getSouthWest(),
          boundsRef.current.getNorthEast()
        ) : null;
      });

      centerMarker.on("drag", () => {
        if (!dragStart || !boundsStart) return;
        const current = centerMarker.getLatLng();
        const dlat = current.lat - dragStart.lat;
        const dlng = current.lng - dragStart.lng;

        const newSw = L.latLng(
          boundsStart.getSouthWest().lat + dlat,
          boundsStart.getSouthWest().lng + dlng
        );
        const newNe = L.latLng(
          boundsStart.getNorthEast().lat + dlat,
          boundsStart.getNorthEast().lng + dlng
        );
        boundsRef.current = L.latLngBounds(newSw, newNe);
        updateOverlay();
      });

      centerMarkerRef.current = centerMarker;

      // Rotate marker (above top-center)
      const topCenter = L.latLng(ne.lat + spanLat * 0.15, (sw.lng + ne.lng) / 2);
      const rotMarker = L.marker(topCenter, {
        draggable: true,
        icon: rotateIcon(),
        zIndexOffset: 10002,
      }).addTo(map);

      rotMarker.on("drag", () => {
        if (!boundsRef.current) return;
        const center = boundsRef.current.getCenter();
        const rotPos = rotMarker.getLatLng();
        const angle = Math.atan2(
          rotPos.lng - center.lng,
          rotPos.lat - center.lat
        ) * (180 / Math.PI);
        // Normalize: 0° = up, clockwise positive
        const normalized = 90 - angle;
        setRotation(Math.round(normalized));
      });

      rotateMarkerRef.current = rotMarker;
    },
    [map, opacity, rotation, cleanup, updateOverlay]
  );

  // Handle file upload
  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImageUrl(url);
        setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        createOverlay(url, img.naturalWidth, img.naturalHeight);
      };
      img.src = url;
    },
    [createOverlay]
  );

  if (!active) return null;

  return (
    <div
      className="absolute top-4 left-4 z-[1001] bg-background/95 backdrop-blur-sm border-2 rounded-xl shadow-xl p-4 w-72"
      style={{ borderColor: "hsl(43 56% 52%)" }}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ color: "hsl(222.2 47.4% 11.2%)" }}>
          <Move className="h-4 w-4" />
          כלי גיאורפרנס
        </h3>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Upload area */}
      {!imageUrl && (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/30 transition-colors"
          style={{ borderColor: "hsl(43 56% 52% / 0.5)" }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <Upload className="h-8 w-8 mx-auto mb-2" style={{ color: "hsl(43 56% 52%)" }} />
          <p className="text-xs font-medium" style={{ color: "hsl(222.2 47.4% 11.2%)" }}>
            גרור תמונה לכאן
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            או לחץ לבחירת קובץ
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Controls - shown after image upload */}
      {imageUrl && (
        <div className="space-y-3">
          {/* Image info */}
          <div className="flex items-center gap-2 text-xs">
            <div className="w-8 h-8 rounded border overflow-hidden shrink-0">
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate" style={{ color: "hsl(222.2 47.4% 11.2%)" }}>
                תמונה נטענה
              </p>
              {imageDims && (
                <p className="text-[10px] text-muted-foreground">
                  {imageDims.w}×{imageDims.h} px
                </p>
              )}
            </div>
          </div>

          {/* Opacity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: "hsl(222.2 47.4% 11.2%)" }}>שקיפות</span>
              <span className="text-xs text-muted-foreground">{Math.round(opacity * 100)}%</span>
            </div>
            <Slider
              value={[opacity * 100]}
              max={100}
              step={5}
              onValueChange={(v) => setOpacity(v[0] / 100)}
            />
          </div>

          {/* Rotation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1" style={{ color: "hsl(222.2 47.4% 11.2%)" }}>
                <RotateCw className="h-3 w-3" />
                סיבוב
              </span>
              <span className="text-xs text-muted-foreground">{rotation}°</span>
            </div>
            <Slider
              value={[rotation]}
              min={-180}
              max={180}
              step={1}
              onValueChange={(v) => setRotation(v[0])}
            />
          </div>

          {/* Quick rotation buttons */}
          <div className="flex gap-1">
            {[0, 90, 180, 270].map((deg) => (
              <Button
                key={deg}
                variant={rotation === deg ? "default" : "outline"}
                size="sm"
                className="flex-1 h-7 text-[10px]"
                onClick={() => setRotation(deg)}
              >
                {deg}°
              </Button>
            ))}
          </div>

          {/* Instructions */}
          <div className="text-[10px] text-muted-foreground space-y-0.5 border-t pt-2" style={{ borderColor: "hsl(43 56% 52% / 0.3)" }}>
            <p className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "hsl(222.2 47.4% 11.2%)" }} />
              גרור את הנקודה המרכזית להזזה
            </p>
            <p className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500" />
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-blue-500" />
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-green-500" />
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-500" />
              גרור פינות לשינוי גודל
            </p>
            <p className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "hsl(43 56% 52%)" }} />
              גרור עיגול זהב לסיבוב
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                cleanup();
                setImageUrl(null);
                setRotation(0);
                setImageDims(null);
              }}
            >
              נקה
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                if (boundsRef.current && map) {
                  map.fitBounds(boundsRef.current, { padding: [40, 40] });
                }
              }}
            >
              <Maximize2 className="h-3 w-3 ml-1" />
              מרכז
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
