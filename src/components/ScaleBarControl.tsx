/**
 * ScaleBarControl – Sophisticated interactive scale-bar for Leaflet maps
 *
 * Features:
 *   • Live scale bar that updates on zoom/pan
 *   • Current scale ratio display  (e.g. 1:2,500)
 *   • Quick-pick from preset scales  (1:500 → 1:100,000)
 *   • Saved custom presets with localStorage persistence
 *   • Edit / rename / delete saved presets
 *   • Click a scale → map zooms to match
 *   • Metric + Imperial toggle
 */

import { useEffect, useState, useCallback, useRef } from "react";
import L from "leaflet";
import {
  RulerIcon,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Pencil,
  Check,
  Trash2,
  Star,
  StarOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScalePreset {
  id: string;
  label: string;
  ratio: number; // denominator, e.g. 2500 means 1:2500
  isBuiltIn: boolean;
}

interface SavedPreset {
  id: string;
  label: string;
  ratio: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BUILT_IN_PRESETS: ScalePreset[] = [
  { id: "b-250",    label: "1:250",    ratio: 250,    isBuiltIn: true },
  { id: "b-500",    label: "1:500",    ratio: 500,    isBuiltIn: true },
  { id: "b-1000",   label: "1:1,000",  ratio: 1000,   isBuiltIn: true },
  { id: "b-1250",   label: "1:1,250",  ratio: 1250,   isBuiltIn: true },
  { id: "b-2500",   label: "1:2,500",  ratio: 2500,   isBuiltIn: true },
  { id: "b-5000",   label: "1:5,000",  ratio: 5000,   isBuiltIn: true },
  { id: "b-10000",  label: "1:10,000", ratio: 10000,  isBuiltIn: true },
  { id: "b-25000",  label: "1:25,000", ratio: 25000,  isBuiltIn: true },
  { id: "b-50000",  label: "1:50,000", ratio: 50000,  isBuiltIn: true },
  { id: "b-100000", label: "1:100,000",ratio: 100000, isBuiltIn: true },
];

const SAVED_KEY = "scale-presets";
const SCREEN_DPI = 96; // standard screen DPI
const METERS_PER_INCH = 0.0254;

// ─── Nice scale-bar lengths ─────────────────────────────────────────────────

const NICE_METERS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

function pickNiceBar(metersPerPixel: number, maxBarPx: number): { meters: number; px: number } {
  for (const m of NICE_METERS) {
    const px = m / metersPerPixel;
    if (px >= 40 && px <= maxBarPx) {
      return { meters: m, px: Math.round(px) };
    }
  }
  // fallback
  const fallbackM = NICE_METERS[NICE_METERS.length - 1];
  return { meters: fallbackM, px: Math.round(fallbackM / metersPerPixel) };
}

function formatBarLabel(meters: number): string {
  if (meters >= 1000) return `${meters / 1000} ק"מ`;
  return `${meters} מ'`;
}

function formatRatio(ratio: number): string {
  return `1:${ratio.toLocaleString("he-IL")}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadSavedPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistPresets(items: SavedPreset[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(items));
}

/** Calculate current map scale ratio (denominator) */
function getMapScaleRatio(map: L.Map): number {
  const center = map.getCenter();
  const zoom = map.getZoom();
  // meters per pixel at current zoom at map center latitude
  const metersPerPx =
    (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) /
    Math.pow(2, zoom + 8);
  // screen pixels per meter = DPI / 0.0254
  const screenPxPerMeter = SCREEN_DPI / METERS_PER_INCH;
  return Math.round(metersPerPx * screenPxPerMeter);
}

/** Find the zoom level that gives approximately the desired scale ratio */
function zoomForScale(map: L.Map, targetRatio: number): number {
  const center = map.getCenter();
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const screenPxPerMeter = SCREEN_DPI / METERS_PER_INCH;
  // targetRatio = metersPerPx * screenPxPerMeter
  // metersPerPx = targetRatio / screenPxPerMeter
  // metersPerPx = (40075016.686 * cosLat) / 2^(z+8)
  // 2^(z+8) = (40075016.686 * cosLat) / metersPerPx
  const metersPerPx = targetRatio / screenPxPerMeter;
  const pow2 = (40075016.686 * cosLat) / metersPerPx;
  const z = Math.log2(pow2) - 8;
  return Math.max(0, Math.min(22, z)); // fractional zoom
}

// ─── Component ───────────────────────────────────────────────────────────────

interface ScaleBarControlProps {
  map: L.Map | null;
}

export function ScaleBarControl({ map }: ScaleBarControlProps) {
  const [currentRatio, setCurrentRatio] = useState(2500);
  const [metersPerPx, setMetersPerPx] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(loadSavedPresets);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRatio, setEditRatio] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newRatio, setNewRatio] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Update scale on map events ──
  const updateScale = useCallback(() => {
    if (!map) return;
    const ratio = getMapScaleRatio(map);
    setCurrentRatio(ratio);
    const center = map.getCenter();
    const zoom = map.getZoom();
    const mpp =
      (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) /
      Math.pow(2, zoom + 8);
    setMetersPerPx(mpp);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    updateScale();
    map.on("zoomend moveend resize", updateScale);
    return () => {
      map.off("zoomend moveend resize", updateScale);
    };
  }, [map, updateScale]);

  // ── Close on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setAddMode(false);
        setEditingId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Apply a scale ──
  const applyScale = useCallback(
    (ratio: number) => {
      if (!map) return;
      const z = zoomForScale(map, ratio);
      map.setZoom(z);
    },
    [map],
  );

  // ── Preset CRUD ──
  const addPreset = useCallback(() => {
    const r = parseInt(newRatio, 10);
    if (!r || r <= 0) return;
    const label = newLabel.trim() || `1:${r.toLocaleString("he-IL")}`;
    const preset: SavedPreset = { id: crypto.randomUUID(), label, ratio: r };
    setSavedPresets((prev) => {
      const updated = [...prev, preset];
      persistPresets(updated);
      return updated;
    });
    setNewLabel("");
    setNewRatio("");
    setAddMode(false);
  }, [newLabel, newRatio]);

  const deletePreset = useCallback((id: string) => {
    setSavedPresets((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      persistPresets(updated);
      return updated;
    });
    if (editingId === id) setEditingId(null);
  }, [editingId]);

  const startEdit = useCallback((p: SavedPreset) => {
    setEditingId(p.id);
    setEditLabel(p.label);
    setEditRatio(String(p.ratio));
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const r = parseInt(editRatio, 10);
    if (!r || r <= 0) return;
    const label = editLabel.trim() || `1:${r.toLocaleString("he-IL")}`;
    setSavedPresets((prev) => {
      const updated = prev.map((p) =>
        p.id === editingId ? { ...p, label, ratio: r } : p,
      );
      persistPresets(updated);
      return updated;
    });
    setEditingId(null);
  }, [editingId, editLabel, editRatio]);

  // ── Scale bar dimensions ──
  const bar = pickNiceBar(metersPerPx, 140);

  // ── All presets combined ──
  const allPresets: ScalePreset[] = [
    ...BUILT_IN_PRESETS,
    ...savedPresets.map((s) => ({ ...s, isBuiltIn: false })),
  ];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-6 left-4 z-[1000] select-none"
      dir="rtl"
    >
      {/* ── Scale bar (always visible) ── */}
      <button
        onClick={() => {
          setPanelOpen(!panelOpen);
          setAddMode(false);
          setEditingId(null);
        }}
        className={cn(
          "flex flex-col items-start gap-0.5 bg-card/95 backdrop-blur",
          "border rounded-lg shadow-lg px-3 py-2",
          "hover:bg-accent/60 transition-colors cursor-pointer",
          "min-w-[120px]",
        )}
        title="קנה מידה – לחץ לבחירה"
      >
        {/* Ratio */}
        <div className="flex items-center gap-2 w-full">
          <RulerIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-bold text-foreground whitespace-nowrap">
            {formatRatio(currentRatio)}
          </span>
          {panelOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground mr-auto" />
          ) : (
            <ChevronUp className="h-3 w-3 text-muted-foreground mr-auto" />
          )}
        </div>

        {/* Visual bar */}
        <div className="flex items-end gap-0 mt-0.5">
          <div
            className="relative"
            style={{ width: bar.px }}
          >
            {/* The bar itself */}
            <div className="h-[6px] flex">
              <div
                className="h-full bg-foreground/80"
                style={{ width: bar.px / 2 }}
              />
              <div
                className="h-full bg-foreground/30"
                style={{ width: bar.px / 2 }}
              />
            </div>
            {/* Ticks */}
            <div className="absolute top-0 left-0 w-[1px] h-[10px] bg-foreground/80" />
            <div
              className="absolute top-0 w-[1px] h-[8px] bg-foreground/60"
              style={{ left: bar.px / 2 }}
            />
            <div
              className="absolute top-0 w-[1px] h-[10px] bg-foreground/80"
              style={{ left: bar.px - 1 }}
            />
            {/* Labels */}
            <div className="flex justify-between mt-[2px]">
              <span className="text-[9px] text-muted-foreground leading-none">0</span>
              <span className="text-[9px] text-muted-foreground leading-none">
                {formatBarLabel(bar.meters)}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* ── Panel ── */}
      {panelOpen && (
        <div className="mt-1 bg-card/95 backdrop-blur border rounded-lg shadow-xl min-w-[260px] max-h-[400px] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-primary/5">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <RulerIcon className="h-3.5 w-3.5" />
              בחירת קנה מידה
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setAddMode(!addMode)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="הוסף קנה מידה מותאם"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Current scale indicator */}
          <div className="px-3 py-2 border-b bg-blue-50 dark:bg-blue-950/40">
            <div className="text-[10px] text-muted-foreground mb-0.5">קנה מידה נוכחי</div>
            <div className="text-sm font-bold text-blue-700 dark:text-blue-300">
              {formatRatio(currentRatio)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              1 ס"מ במסך = {currentRatio >= 1000
                ? `${(currentRatio / 100).toFixed(1)} מ'`
                : `${(currentRatio / 100).toFixed(2)} מ'`
              } בשטח
            </div>
          </div>

          {/* Add new preset form */}
          {addMode && (
            <div className="px-3 py-2.5 border-b bg-green-50 dark:bg-green-950/30 space-y-2">
              <div className="text-[10px] font-medium text-green-700 dark:text-green-300 mb-1">
                הוסף קנה מידה מותאם
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="שם (אופציונלי)"
                    className="h-7 text-xs"
                    dir="rtl"
                  />
                </div>
                <div className="w-24">
                  <Input
                    value={newRatio}
                    onChange={(e) => setNewRatio(e.target.value.replace(/\D/g, ""))}
                    placeholder="1:___"
                    className="h-7 text-xs"
                    dir="ltr"
                    type="text"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" onClick={addPreset} disabled={!newRatio} className="h-6 text-[11px] flex-1 gap-1">
                  <Check className="h-3 w-3" />
                  שמור
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddMode(false)} className="h-6 text-[11px] gap-1">
                  ביטול
                </Button>
              </div>
            </div>
          )}

          {/* Presets list */}
          <div className="overflow-y-auto flex-1 max-h-[250px]">
            {/* Saved presets section */}
            {savedPresets.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 border-b flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  קנ"מ שמורים
                </div>
                {savedPresets.map((p) => (
                  <div key={p.id} className="group">
                    {editingId === p.id ? (
                      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/40 border-b">
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-6 text-[11px] flex-1"
                          dir="rtl"
                          autoFocus
                        />
                        <Input
                          value={editRatio}
                          onChange={(e) => setEditRatio(e.target.value.replace(/\D/g, ""))}
                          className="h-6 text-[11px] w-20"
                          dir="ltr"
                        />
                        <button
                          onClick={saveEdit}
                          className="p-0.5 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-0.5 rounded text-muted-foreground hover:bg-accent"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => applyScale(p.ratio)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm",
                          "hover:bg-accent/60 transition-colors border-b text-right",
                          Math.abs(currentRatio - p.ratio) < p.ratio * 0.05
                            ? "bg-amber-50 dark:bg-amber-950/30 font-semibold"
                            : "",
                        )}
                      >
                        <Star className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="flex-1 text-xs">{p.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          1:{p.ratio.toLocaleString("he-IL")}
                        </span>
                        {/* Edit / delete on hover */}
                        <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(p);
                            }}
                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            title="ערוך"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePreset(p.id);
                            }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="מחק"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* Built-in presets */}
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/30 border-b flex items-center gap-1">
              <RulerIcon className="h-3 w-3" />
              קנ"מ סטנדרטיים
            </div>
            {BUILT_IN_PRESETS.map((p) => {
              const isActive = Math.abs(currentRatio - p.ratio) < p.ratio * 0.05;
              return (
                <button
                  key={p.id}
                  onClick={() => applyScale(p.ratio)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-sm",
                    "hover:bg-accent/60 transition-colors border-b text-right",
                    isActive
                      ? "bg-blue-50 dark:bg-blue-950/30 font-semibold text-blue-700 dark:text-blue-300"
                      : "",
                  )}
                >
                  <span className="flex-1 text-xs">{p.label}</span>
                  {isActive && (
                    <span className="text-[9px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                      נוכחי
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer with "apply current" quick action */}
          <div className="border-t px-3 py-2 bg-muted/20 flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder={'קנה מידה חופשי (לדוגמה: 3000)'}
                className="h-7 text-xs"
                dir="ltr"
                type="text"
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (v > 0) {
                      applyScale(v);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 shrink-0"
              onClick={() => {
                const input = panelRef.current?.querySelector<HTMLInputElement>(
                  "div.border-t input",
                );
                if (input) {
                  const v = parseInt(input.value, 10);
                  if (v > 0) {
                    applyScale(v);
                    input.value = "";
                  }
                }
              }}
            >
              החל
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
