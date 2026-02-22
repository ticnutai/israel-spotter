/**
 * MapToolbar – Floating toolbar with map annotation & utility tools.
 *
 * Tools:
 *  • Place marker / pin with label
 *  • Drop coordinate tag (shows coords at click point)
 *  • Draw polyline
 *  • Draw polygon (area measurement)
 *  • Add text annotation
 *  • Navigate to coordinates
 *  • Screenshot / export current view
 *  • Zoom to Kfar Chabad extent
 *  • Clear all annotations
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import L from "leaflet";
import {
  MapPin, Tag, Pencil, Pentagon, Type, Navigation, Camera,
  Home, Trash2, X, Check, ChevronDown, ChevronUp, Move, LocateFixed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { wgs84ToItm, itmToWgs84 } from "@/lib/itm-to-wgs84";

// ── Types ────────────────────────────────────────────────────────────────────

type ToolMode =
  | "none"
  | "marker"
  | "coord-tag"
  | "polyline"
  | "polygon"
  | "text"
  | "goto"
  | "locate";

interface Annotation {
  id: string;
  type: "marker" | "coord-tag" | "polyline" | "polygon" | "text";
  leafletLayers: L.Layer[];
  label?: string;
}

interface MapToolbarProps {
  map: L.Map | null;
}

// ── Colors ───────────────────────────────────────────────────────────────────
const PIN_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#9333ea", "#ec4899", "#06b6d4", "#000000"];

// ── Marker icons ─────────────────────────────────────────────────────────────
function coloredIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40],
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.26 0 0 6.26 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.26 21.74 0 14 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="14" cy="14" r="5" fill="#fff" opacity="0.9"/>
    </svg>`,
  });
}

// ── Main Component ───────────────────────────────────────────────────────────

export function MapToolbar({ map }: MapToolbarProps) {
  const [activeTool, setActiveTool] = useState<ToolMode>("none");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [pinColor, setPinColor] = useState(PIN_COLORS[0]);
  const [markerLabel, setMarkerLabel] = useState("");
  const [textInput, setTextInput] = useState("");
  const [gotoInput, setGotoInput] = useState("");
  const [polyPoints, setPolyPoints] = useState<L.LatLng[]>([]);
  const [showPanel, setShowPanel] = useState<"marker" | "text" | "goto" | "color" | "list" | null>(null);

  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tempLayerRef = useRef<L.LayerGroup | null>(null);
  const activeToolRef = useRef<ToolMode>("none");
  const polyPointsRef = useRef<L.LatLng[]>([]);
  const annotationsRef = useRef<Annotation[]>([]);

  // Keep refs in sync
  activeToolRef.current = activeTool;
  polyPointsRef.current = polyPoints;
  annotationsRef.current = annotations;

  // Initialize layer groups
  useEffect(() => {
    if (!map) return;
    const lg = L.layerGroup().addTo(map);
    const tl = L.layerGroup().addTo(map);
    layerGroupRef.current = lg;
    tempLayerRef.current = tl;
    return () => {
      lg.remove();
      tl.remove();
    };
  }, [map]);

  // ── Deactivate tool ──
  const deactivate = useCallback(() => {
    setActiveTool("none");
    setShowPanel(null);
    setPolyPoints([]);
    if (tempLayerRef.current) tempLayerRef.current.clearLayers();
    if (map) map.getContainer().style.cursor = "";
  }, [map]);

  // ── Add annotation to state ──
  const addAnnotation = useCallback((ann: Annotation) => {
    setAnnotations((prev) => [...prev, ann]);
    ann.leafletLayers.forEach((l) => layerGroupRef.current?.addLayer(l));
  }, []);

  // ── Remove annotation ──
  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => {
      const ann = prev.find((a) => a.id === id);
      if (ann) ann.leafletLayers.forEach((l) => layerGroupRef.current?.removeLayer(l));
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // ── Clear all ──
  const clearAll = useCallback(() => {
    annotations.forEach((a) => a.leafletLayers.forEach((l) => layerGroupRef.current?.removeLayer(l)));
    setAnnotations([]);
    deactivate();
    toast.success("כל הסימונים נמחקו");
  }, [annotations, deactivate]);

  // ── Place marker ──
  const placeMarker = useCallback((latlng: L.LatLng, label: string, color: string) => {
    if (!map) return;
    const marker = L.marker(latlng, { icon: coloredIcon(color), draggable: true });
    const popupContent = `<div dir="rtl" style="text-align:right;font-size:13px">
      <b>${label || "סימון"}</b><br/>
      <span style="font-size:11px;color:#666">${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</span>
    </div>`;
    marker.bindPopup(popupContent);
    if (label) {
      marker.bindTooltip(label, { permanent: true, direction: "top", offset: [0, -40], className: "annotation-tooltip" });
    }

    addAnnotation({
      id: crypto.randomUUID(),
      type: "marker",
      leafletLayers: [marker],
      label: label || "סימון",
    });
  }, [map, addAnnotation]);

  // ── Place coordinate tag ──
  const placeCoordTag = useCallback((latlng: L.LatLng) => {
    if (!map) return;
    const [e, n] = wgs84ToItm(latlng.lat, latlng.lng);
    const itmText = `E ${e.toFixed(1)}  N ${n.toFixed(1)}`;
    const wgsText = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;

    const icon = L.divIcon({
      className: "",
      iconSize: [0, 0],
      iconAnchor: [0, 20],
      html: `<div style="background:#1e293b;color:#fff;font-size:11px;padding:3px 8px;border-radius:6px;white-space:nowrap;border:2px solid #f59e0b;font-family:monospace;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:auto;cursor:move">
        <div style="font-weight:600;color:#fbbf24;margin-bottom:1px">📍 ITM</div>
        <div>${itmText}</div>
        <div style="color:#94a3b8;font-size:10px">${wgsText}</div>
      </div>`,
    });

    const marker = L.marker(latlng, { icon, draggable: true });

    addAnnotation({
      id: crypto.randomUUID(),
      type: "coord-tag",
      leafletLayers: [marker],
      label: itmText,
    });

    toast.success("תג קואורדינטות נוסף");
  }, [map, addAnnotation]);

  // ── Place text annotation ──
  const placeText = useCallback((latlng: L.LatLng, text: string) => {
    if (!map || !text.trim()) return;

    const icon = L.divIcon({
      className: "",
      iconSize: [0, 0],
      html: `<div style="background:hsl(48 96% 53% / 0.9);color:#1a1a1a;font-size:13px;font-weight:600;padding:4px 10px;border-radius:6px;white-space:nowrap;border:1px solid #b8860b;box-shadow:0 2px 6px rgba(0,0,0,.2);cursor:move;direction:rtl">${text}</div>`,
    });

    const marker = L.marker(latlng, { icon, draggable: true });

    addAnnotation({
      id: crypto.randomUUID(),
      type: "text",
      leafletLayers: [marker],
      label: text,
    });

    setTextInput("");
    toast.success("הערה נוספה");
  }, [map, addAnnotation]);

  // ── Finish polyline ──
  const finishPolyline = useCallback(() => {
    const pts = polyPointsRef.current;
    if (pts.length < 2) { deactivate(); return; }

    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += pts[i - 1].distanceTo(pts[i]);
    const label = dist < 1000 ? `${Math.round(dist)} מ'` : `${(dist / 1000).toFixed(2)} ק"מ`;

    const polyline = L.polyline(pts, { color: pinColor, weight: 3, dashArray: "6,4" });
    const mid = pts[Math.floor(pts.length / 2)];
    const tooltip = L.marker(mid, {
      icon: L.divIcon({
        className: "",
        iconSize: [0, 0],
        html: `<span style="background:#fff;color:#333;padding:2px 6px;border-radius:4px;font-size:11px;border:1px solid #ccc;box-shadow:0 1px 3px rgba(0,0,0,.15);white-space:nowrap">${label}</span>`,
      }),
      interactive: false,
    });

    addAnnotation({
      id: crypto.randomUUID(),
      type: "polyline",
      leafletLayers: [polyline, tooltip],
      label,
    });

    deactivate();
    toast.success(`קו נמדד: ${label}`);
  }, [pinColor, addAnnotation, deactivate]);

  // ── Finish polygon ──
  const finishPolygon = useCallback(() => {
    const pts = polyPointsRef.current;
    if (pts.length < 3) { deactivate(); return; }

    const polygon = L.polygon(pts, { color: pinColor, weight: 2, fillColor: pinColor, fillOpacity: 0.15 });

    // Calculate area using spherical polygon formula
    const latLngs = polygon.getLatLngs()[0] as L.LatLng[];

    // Spherical polygon area
    const earthRadius = 6371000;
    let sphericalArea = 0;
    for (let i = 0; i < latLngs.length; i++) {
      const j = (i + 1) % latLngs.length;
      const lat1 = (latLngs[i].lat * Math.PI) / 180;
      const lat2 = (latLngs[j].lat * Math.PI) / 180;
      const dLng = ((latLngs[j].lng - latLngs[i].lng) * Math.PI) / 180;
      sphericalArea += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    sphericalArea = Math.abs((sphericalArea * earthRadius * earthRadius) / 2);

    const areaLabel = sphericalArea > 10000
      ? `${(sphericalArea / 10000).toFixed(2)} דונם`
      : `${Math.round(sphericalArea)} מ"ר`;

    const center = polygon.getBounds().getCenter();
    const areaMarker = L.marker(center, {
      icon: L.divIcon({
        className: "",
        iconSize: [0, 0],
        html: `<div style="background:rgba(255,255,255,0.95);color:#333;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid ${pinColor};box-shadow:0 2px 6px rgba(0,0,0,.2);white-space:nowrap;text-align:center;direction:rtl">
          <div>שטח</div>
          <div style="color:${pinColor}">${areaLabel}</div>
        </div>`,
      }),
      interactive: false,
    });

    addAnnotation({
      id: crypto.randomUUID(),
      type: "polygon",
      leafletLayers: [polygon, areaMarker],
      label: `פוליגון – ${areaLabel}`,
    });

    deactivate();
    toast.success(`פוליגון – ${areaLabel}`);
  }, [pinColor, addAnnotation, deactivate]);

  // ── Map click handler ──
  useEffect(() => {
    if (!map) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      const tool = activeToolRef.current;
      if (tool === "none") return;

      // Mark event as consumed so MapView's click handler won't also fire reverse geocode
      (e as any)._handledByToolbar = true;

      if (tool === "marker") {
        placeMarker(e.latlng, markerLabel, pinColor);
        return;
      }

      if (tool === "coord-tag") {
        placeCoordTag(e.latlng);
        return;
      }

      if (tool === "text") {
        placeText(e.latlng, textInput);
        return;
      }

      if (tool === "locate") {
        // Single click to show coordinates popup
        const [easting, northing] = wgs84ToItm(e.latlng.lat, e.latlng.lng);
        const popup = L.popup()
          .setLatLng(e.latlng)
          .setContent(`<div dir="rtl" style="text-align:right;font-family:monospace;font-size:12px">
            <b>WGS84:</b> ${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}<br/>
            <b>ITM:</b> E ${easting.toFixed(1)}, N ${northing.toFixed(1)}
          </div>`)
          .openOn(map);
        return;
      }

      if (tool === "polyline" || tool === "polygon") {
        const pts = [...polyPointsRef.current, e.latlng];
        setPolyPoints(pts);

        // Draw temp preview
        if (tempLayerRef.current) {
          tempLayerRef.current.clearLayers();
          if (pts.length >= 2) {
            const line = L.polyline(pts, {
              color: pinColor,
              weight: 2,
              dashArray: tool === "polygon" ? undefined : "6,4",
              opacity: 0.7,
            });
            tempLayerRef.current.addLayer(line);
          }
          // Dots
          pts.forEach((p, i) => {
            const dot = L.circleMarker(p, {
              radius: i === 0 ? 6 : 4,
              color: pinColor,
              fillColor: i === 0 ? pinColor : "#fff",
              fillOpacity: 1,
              weight: 2,
            });
            tempLayerRef.current!.addLayer(dot);
          });
        }
        return;
      }
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      const tool = activeToolRef.current;
      if (tool === "polyline") {
        L.DomEvent.stopPropagation(e as any);
        finishPolyline();
      } else if (tool === "polygon") {
        L.DomEvent.stopPropagation(e as any);
        finishPolygon();
      }
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
    };
  }, [map, markerLabel, pinColor, textInput, placeMarker, placeCoordTag, placeText, finishPolyline, finishPolygon]);

  // ── Activate tool ──
  const selectTool = useCallback((tool: ToolMode) => {
    if (activeTool === tool) {
      deactivate();
      return;
    }
    setActiveTool(tool);
    setPolyPoints([]);
    if (tempLayerRef.current) tempLayerRef.current.clearLayers();
    if (map) {
      map.getContainer().style.cursor = tool === "none" ? "" : "crosshair";
    }

    // Show sub-panel if needed
    if (tool === "marker") setShowPanel("marker");
    else if (tool === "text") setShowPanel("text");
    else if (tool === "goto") setShowPanel("goto");
    else setShowPanel(null);
  }, [activeTool, deactivate, map]);

  // ── Go to coordinates ──
  const handleGoto = useCallback(() => {
    if (!map || !gotoInput.trim()) return;
    const parts = gotoInput.trim().split(/[,\s]+/).map(Number).filter(isFinite);
    if (parts.length < 2) {
      toast.error("פורמט לא תקין. הזן lat, lng או E, N (ITM)");
      return;
    }

    let lat: number, lng: number;
    const [a, b] = parts;

    // Auto-detect: if values look like ITM (large numbers), convert
    if (a > 50000 && b > 300000) {
      // ITM: a=easting, b=northing
      const [la, ln] = itmToWgs84(a, b);
      lat = la; lng = ln;
    } else if (b > 50000 && a > 300000) {
      const [la, ln] = itmToWgs84(b, a);
      lat = la; lng = ln;
    } else {
      lat = a;
      lng = b;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("קואורדינטות מחוץ לטווח");
      return;
    }

    map.setView([lat, lng], 17);
    L.popup()
      .setLatLng([lat, lng])
      .setContent(`<div dir="rtl" style="font-size:12px;font-family:monospace">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>`)
      .openOn(map);

    setGotoInput("");
    deactivate();
    toast.success("מפה ממוקדת");
  }, [map, gotoInput, deactivate]);

  // ── Screenshot ──
  const handleScreenshot = useCallback(async () => {
    if (!map) return;
    try {
      const { toPng } = await import("html-to-image");
      const container = map.getContainer();
      const dataUrl = await toPng(container, { quality: 0.95 });
      const link = document.createElement("a");
      link.download = `map-screenshot-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("צילום מסך נשמר");
    } catch (err) {
      console.error("Screenshot failed:", err);
      toast.error("שגיאה בצילום מסך");
    }
  }, [map]);

  // ── Zoom to Kfar Chabad ──
  const zoomHome = useCallback(() => {
    if (!map) return;
    map.setView([31.9604, 34.8536], 14);
  }, [map]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") deactivate();
      if (activeTool === "polyline" && e.key === "Enter") finishPolyline();
      if (activeTool === "polygon" && e.key === "Enter") finishPolygon();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTool, deactivate, finishPolyline, finishPolygon]);

  if (!map) return null;

  // ── Tool button helper ──
  const ToolBtn = ({ tool, icon, title }: { tool: ToolMode; icon: ReactNode; title: string }) => (
    <Button
      size="icon"
      variant={activeTool === tool ? "default" : "outline"}
      onClick={() => selectTool(tool)}
      className={cn("h-9 w-9 shadow-sm", activeTool === tool && "ring-2 ring-primary/50")}
      title={title}
    >
      {icon}
    </Button>
  );

  return (
    <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5" dir="rtl">
      {/* Toggle button */}
      <Button
        size="icon"
        variant="outline"
        onClick={() => setExpanded(!expanded)}
        className="h-9 w-9 shadow-md bg-card/95 backdrop-blur"
        title={expanded ? "הסתר כלים" : "הצג כלים"}
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {expanded && (
        <div className="flex flex-col gap-1.5 bg-card/95 backdrop-blur border rounded-lg shadow-lg p-1.5">
          {/* Row 1: Markers & tags */}
          <div className="flex gap-1">
            <ToolBtn tool="marker" icon={<MapPin className="h-4 w-4" />} title="הנח סמן" />
            <ToolBtn tool="coord-tag" icon={<Tag className="h-4 w-4" />} title="תג קואורדינטות" />
            <ToolBtn tool="text" icon={<Type className="h-4 w-4" />} title="הוסף הערת טקסט" />
          </div>

          {/* Row 2: Drawing */}
          <div className="flex gap-1">
            <ToolBtn tool="polyline" icon={<Pencil className="h-4 w-4" />} title="צייר קו (מדידה)" />
            <ToolBtn tool="polygon" icon={<Pentagon className="h-4 w-4" />} title="צייר פוליגון (שטח)" />
            <ToolBtn tool="locate" icon={<LocateFixed className="h-4 w-4" />} title="הצג קואורדינטות בלחיצה" />
          </div>

          {/* Row 3: Navigation & utils */}
          <div className="flex gap-1">
            <ToolBtn tool="goto" icon={<Navigation className="h-4 w-4" />} title="נווט לקואורדינטות" />
            <Button size="icon" variant="outline" onClick={handleScreenshot} className="h-9 w-9 shadow-sm" title="צילום מסך">
              <Camera className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={zoomHome} className="h-9 w-9 shadow-sm" title="זום לכפר חב״ד">
              <Home className="h-4 w-4" />
            </Button>
          </div>

          {/* Row 4: Color picker & list & clear */}
          <div className="flex gap-1 items-center">
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowPanel(showPanel === "color" ? null : "color")}
              className="h-9 w-9 shadow-sm"
              title="בחר צבע"
            >
              <div className="w-4 h-4 rounded-full border-2 border-white shadow-sm" style={{ background: pinColor }} />
            </Button>
            <Button
              size="icon"
              variant={showPanel === "list" ? "default" : "outline"}
              onClick={() => setShowPanel(showPanel === "list" ? null : "list")}
              className="h-9 w-9 shadow-sm"
              title="רשימת סימונים"
            >
              <Move className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={clearAll}
              className="h-9 w-9 shadow-sm text-destructive hover:text-destructive"
              title="נקה הכל"
              disabled={annotations.length === 0}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Active tool indicator */}
          {activeTool !== "none" && (
            <div className="flex items-center justify-between px-2 py-1 bg-primary/10 rounded text-xs">
              <span className="text-primary font-medium">
                {activeTool === "marker" && "לחץ על המפה להנחת סמן"}
                {activeTool === "coord-tag" && "לחץ להנחת תג קואורדינטות"}
                {activeTool === "polyline" && `לחץ להוספת נקודות (${polyPoints.length}) • Enter/דאבל-קליק לסיום`}
                {activeTool === "polygon" && `לחץ להוספת קודקודים (${polyPoints.length}) • Enter/דאבל-קליק לסיום`}
                {activeTool === "text" && "לחץ על המפה להנחת הערה"}
                {activeTool === "goto" && "הזן קואורדינטות למטה"}
                {activeTool === "locate" && "לחץ על המפה לראות קואורדינטות"}
              </span>
              <button onClick={deactivate} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-panels ── */}
      {showPanel === "marker" && expanded && (
        <div className="bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3 min-w-[200px]">
          <div className="text-xs font-medium text-muted-foreground mb-2">תווית סמן</div>
          <Input
            value={markerLabel}
            onChange={(e) => setMarkerLabel(e.target.value)}
            placeholder="שם / תיאור (אופציונלי)"
            className="h-8 text-sm mb-2"
            dir="rtl"
          />
          <div className="flex gap-1 flex-wrap">
            {PIN_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setPinColor(c)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-all",
                  pinColor === c ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground/50"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {showPanel === "text" && expanded && (
        <div className="bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3 min-w-[200px]">
          <div className="text-xs font-medium text-muted-foreground mb-2">טקסט הערה</div>
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="הזן טקסט..."
            className="h-8 text-sm"
            dir="rtl"
            onKeyDown={(e) => { if (e.key === "Enter") toast.info("עכשיו לחץ על המפה"); }}
          />
        </div>
      )}

      {showPanel === "goto" && expanded && (
        <div className="bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3 min-w-[220px]">
          <div className="text-xs font-medium text-muted-foreground mb-2">נווט לקואורדינטות</div>
          <div className="flex gap-1">
            <Input
              value={gotoInput}
              onChange={(e) => setGotoInput(e.target.value)}
              placeholder="lat, lng או E, N"
              className="h-8 text-sm flex-1"
              dir="ltr"
              onKeyDown={(e) => { if (e.key === "Enter") handleGoto(); }}
            />
            <Button size="sm" onClick={handleGoto} className="h-8 px-3">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            ITM (למשל 187000, 655000) או WGS84 (31.96, 34.85)
          </div>
        </div>
      )}

      {showPanel === "color" && expanded && (
        <div className="bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">צבע ציור</div>
          <div className="flex gap-1.5 flex-wrap">
            {PIN_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { setPinColor(c); setShowPanel(null); }}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all",
                  pinColor === c ? "border-foreground scale-110 ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/50"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {showPanel === "list" && expanded && (
        <div className="bg-card/95 backdrop-blur border rounded-lg shadow-lg p-3 min-w-[200px] max-h-[300px] overflow-auto">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            סימונים ({annotations.length})
          </div>
          {annotations.length === 0 && (
            <div className="text-xs text-muted-foreground py-2 text-center">אין סימונים</div>
          )}
          {annotations.map((ann) => (
            <div key={ann.id} className="flex items-center justify-between py-1.5 border-b last:border-0 gap-2">
              <div className="flex items-center gap-1.5 text-xs min-w-0">
                {ann.type === "marker" && <MapPin className="h-3 w-3 shrink-0 text-red-500" />}
                {ann.type === "coord-tag" && <Tag className="h-3 w-3 shrink-0 text-amber-500" />}
                {ann.type === "polyline" && <Pencil className="h-3 w-3 shrink-0 text-blue-500" />}
                {ann.type === "polygon" && <Pentagon className="h-3 w-3 shrink-0 text-green-500" />}
                {ann.type === "text" && <Type className="h-3 w-3 shrink-0 text-purple-500" />}
                <span className="truncate">{ann.label || ann.type}</span>
              </div>
              <button onClick={() => removeAnnotation(ann.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
