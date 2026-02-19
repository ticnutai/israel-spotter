/**
 * LayerManager.tsx – Advanced layer management panel
 *
 * Features:
 *  • Drag-and-drop reordering (dnd-kit)
 *  • Per-layer: visibility toggle, color picker, opacity slider, stroke weight
 *  • Layer actions: rename, duplicate, lock, delete
 *  • Painted parcels: color specific parcels by gush/helka
 *  • Collapse/expand layer details
 *  • Batch operations (show all / hide all / clear all)
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { fetchTabaOutlinesGeoJSON } from "@/lib/taba-outlines";
import { getLandUseByName } from "@/lib/land-use-colors";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
  Copy,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
  Plus,
  Layers,
  Paintbrush,
  RotateCcw,
  Type,
  Map,
  Loader2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useLayerStore,
  LAYER_COLORS,
  PARCEL_PAINT_COLORS,
  DEFAULT_LABEL_SETTINGS,
  type MapLayer,
  type PaintedParcel,
} from "@/hooks/use-layer-store";

// ─── Sortable Layer Item ─────────────────────────────────────────────────────

interface SortableLayerItemProps {
  layer: MapLayer;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: () => void;
  onSetColor: (color: string) => void;
  onSetFillColor: (color: string) => void;
  onSetOpacity: (opacity: number) => void;
  onSetFillOpacity: (opacity: number) => void;
  onSetWeight: (weight: number) => void;
  onSetDashArray: (dash: string) => void;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function SortableLayerItem({
  layer,
  expanded,
  onToggleExpand,
  onToggleVisibility,
  onSetColor,
  onSetFillColor,
  onSetOpacity,
  onSetFillOpacity,
  onSetWeight,
  onSetDashArray,
  onToggleLock,
  onDuplicate,
  onRename,
  onDelete,
}: SortableLayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : undefined,
  };

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const [showStrokeColors, setShowStrokeColors] = useState(false);
  const [showFillColors, setShowFillColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const kindIcon = (() => {
    switch (layer.kind) {
      case "geojson": return "📐";
      case "tile": return "🗺️";
      case "wms": return "🌐";
      case "boundary": return "🔲";
      case "highlight": return "✨";
      case "painted": return "🎨";
      default: return "📄";
    }
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      dir="rtl"
      className={cn(
        "border rounded-lg mb-1.5 bg-card transition-shadow",
        isDragging && "shadow-lg ring-2 ring-primary/30",
        !layer.visible && "opacity-60",
      )}
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-1 px-2 py-1.5 min-h-[36px]">
        {/* Drag handle */}
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Visibility toggle */}
        <button
          onClick={onToggleVisibility}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={layer.visible ? "הסתר שכבה" : "הצג שכבה"}
        >
          {layer.visible ? (
            <Eye className="h-3.5 w-3.5 text-green-600" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Color swatch */}
        <button
          onClick={() => { setShowStrokeColors(!showStrokeColors); setShowFillColors(false); }}
          className="shrink-0 w-4 h-4 rounded-sm border border-border/60 shadow-sm"
          style={{ backgroundColor: layer.color }}
          title="צבע קו"
        />

        {/* Kind icon + Name */}
        <div className="flex-1 min-w-0 flex items-center gap-1 mr-0.5">
          <span className="text-xs shrink-0">{kindIcon}</span>
          {editing ? (
            <div className="flex items-center gap-0.5 flex-1">
              <input
                ref={inputRef}
                className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded border border-input text-right"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename(editName);
                    setEditing(false);
                  } else if (e.key === "Escape") {
                    setEditName(layer.name);
                    setEditing(false);
                  }
                }}
              />
              <button
                onClick={() => { onRename(editName); setEditing(false); }}
                className="text-green-600 hover:text-green-700"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                onClick={() => { setEditName(layer.name); setEditing(false); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <span
              className="text-xs font-medium truncate cursor-pointer hover:underline"
              onDoubleClick={() => {
                if (!layer.locked) {
                  setEditName(layer.name);
                  setEditing(true);
                }
              }}
            >
              {layer.name}
            </span>
          )}
        </div>

        {/* Feature count badge */}
        {layer.featureCount != null && (
          <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 shrink-0">
            {layer.featureCount}
          </span>
        )}

        {/* Lock */}
        <button
          onClick={onToggleLock}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={layer.locked ? "בטל נעילה" : "נעל שכבה"}
        >
          {layer.locked ? (
            <Lock className="h-3 w-3 text-amber-600" />
          ) : (
            <Unlock className="h-3 w-3" />
          )}
        </button>

        {/* Expand/collapse */}
        <button
          onClick={onToggleExpand}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Stroke color picker ── */}
      {showStrokeColors && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground mb-1">צבע קו:</p>
          <div className="flex flex-wrap gap-1">
            {LAYER_COLORS.map((c) => (
              <button
                key={c}
                className={cn(
                  "w-5 h-5 rounded-sm border-2 transition-transform hover:scale-110",
                  layer.color === c ? "border-foreground scale-110" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                onClick={() => { onSetColor(c); setShowStrokeColors(false); }}
              />
            ))}
            {/* Custom color input */}
            <label className="w-5 h-5 rounded-sm border-2 border-dashed border-muted-foreground cursor-pointer flex items-center justify-center hover:border-foreground">
              <Plus className="h-3 w-3 text-muted-foreground" />
              <input
                type="color"
                className="sr-only"
                value={layer.color}
                onChange={(e) => onSetColor(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}

      {/* ── Expanded details panel ── */}
      {expanded && (
        <div className="px-3 pb-2.5 space-y-2 border-t border-border/50 pt-2" dir="rtl">
          {/* Fill color */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">צבע מילוי</span>
              <div className="flex-1" />
              <button
                onClick={() => { setShowFillColors(!showFillColors); setShowStrokeColors(false); }}
                className="w-4 h-4 rounded-sm border border-border/60"
                style={{ backgroundColor: layer.fillColor }}
              />
            </div>
            {showFillColors && (
              <div className="flex flex-wrap gap-1 mt-1">
                {LAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "w-4 h-4 rounded-sm border-2 transition-transform hover:scale-110",
                      layer.fillColor === c ? "border-foreground scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => { onSetFillColor(c); setShowFillColors(false); }}
                  />
                ))}
                <label className="w-4 h-4 rounded-sm border-2 border-dashed border-muted-foreground cursor-pointer flex items-center justify-center">
                  <Plus className="h-2.5 w-2.5 text-muted-foreground" />
                  <input
                    type="color"
                    className="sr-only"
                    value={layer.fillColor}
                    onChange={(e) => onSetFillColor(e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Opacity slider */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">שקיפות קו</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(layer.opacity * 100)}
                onChange={(e) => onSetOpacity(Number(e.target.value) / 100)}
                className="flex-1 h-1 accent-primary cursor-pointer"
                disabled={layer.locked}
              />
              <span className="text-[10px] font-mono text-muted-foreground w-8 text-left">
                {Math.round(layer.opacity * 100)}%
              </span>
            </div>
          </div>

          {/* Fill opacity slider */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">שקיפות מילוי</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(layer.fillOpacity * 100)}
                onChange={(e) => onSetFillOpacity(Number(e.target.value) / 100)}
                className="flex-1 h-1 accent-primary cursor-pointer"
                disabled={layer.locked}
              />
              <span className="text-[10px] font-mono text-muted-foreground w-8 text-left">
                {Math.round(layer.fillOpacity * 100)}%
              </span>
            </div>
          </div>

          {/* Stroke weight */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">עובי קו</span>
              <input
                type="range"
                min="5"
                max="100"
                value={Math.round(layer.weight * 10)}
                onChange={(e) => onSetWeight(Number(e.target.value) / 10)}
                className="flex-1 h-1 accent-primary cursor-pointer"
                disabled={layer.locked}
              />
              <span className="text-[10px] font-mono text-muted-foreground w-10 text-left">
                {layer.weight.toFixed(1)}px
              </span>
            </div>
          </div>

          {/* Dash pattern */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">דפוס קו</span>
              {[
                { label: "רציף", value: "" },
                { label: "מקווקו", value: "8 4" },
                { label: "נקודות", value: "2 4" },
                { label: "מקו-נק", value: "12 4 2 4" },
              ].map((d) => (
                <button
                  key={d.value}
                  onClick={() => onSetDashArray(d.value)}
                  className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded border",
                    (layer.dashArray ?? "") === d.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground",
                  )}
                  disabled={layer.locked}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Geometry info */}
          {(layer.geometryTypes?.length ?? 0) > 0 && (
            <div className="text-[10px] text-muted-foreground">
              סוגי גיאומטריה: {layer.geometryTypes?.join(", ")}
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-1 pt-1 border-t border-border/30">
            <button
              onClick={() => {
                if (!layer.locked) {
                  setEditName(layer.name);
                  setEditing(true);
                  onToggleExpand();
                }
              }}
              className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted"
              disabled={layer.locked}
            >
              <Pencil className="h-3 w-3" /> שנה שם
            </button>
            <button
              onClick={onDuplicate}
              className="text-[10px] flex items-center gap-0.5 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted"
            >
              <Copy className="h-3 w-3" /> שכפל
            </button>
            <div className="flex-1" />
            <button
              onClick={() => { if (!layer.locked) onDelete(); }}
              className="text-[10px] flex items-center gap-0.5 text-destructive hover:text-destructive/80 px-1.5 py-0.5 rounded hover:bg-destructive/10"
              disabled={layer.locked}
            >
              <Trash2 className="h-3 w-3" /> מחק
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Painted Parcel List Item ────────────────────────────────────────────────

interface PaintedParcelItemProps {
  parcel: PaintedParcel;
  onUpdateColor: (color: string) => void;
  onUpdateFillOpacity: (opacity: number) => void;
  onUpdateLabel: (label: string) => void;
  onRemove: () => void;
}

function PaintedParcelItem({ parcel, onUpdateColor, onUpdateFillOpacity, onUpdateLabel, onRemove }: PaintedParcelItemProps) {
  const [showColors, setShowColors] = useState(false);
  const [editLabel, setEditLabel] = useState(false);
  const [label, setLabel] = useState(parcel.label ?? "");

  return (
    <div className="border rounded-md px-2 py-1.5 mb-1 bg-card">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowColors(!showColors)}
          className="w-4 h-4 rounded-sm border border-border/60 shrink-0"
          style={{ backgroundColor: parcel.color }}
        />
        <span className="text-xs font-medium flex-1">
          {parcel.gush}/{parcel.helka}
        </span>
        {parcel.label && !editLabel && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
            {parcel.label}
          </span>
        )}
        <button
          onClick={() => { setEditLabel(!editLabel); setLabel(parcel.label ?? ""); }}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="תווית"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="הסר צבע"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {editLabel && (
        <div className="flex items-center gap-1 mt-1.5">
          <input
            className="flex-1 text-xs bg-muted px-1.5 py-0.5 rounded border border-input text-right"
            value={label}
            placeholder="תווית..."
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { onUpdateLabel(label); setEditLabel(false); }
              if (e.key === "Escape") setEditLabel(false);
            }}
          />
          <button onClick={() => { onUpdateLabel(label); setEditLabel(false); }} className="text-green-600">
            <Check className="h-3 w-3" />
          </button>
        </div>
      )}

      {showColors && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {PARCEL_PAINT_COLORS.map((c) => (
              <button
                key={c}
                className={cn(
                  "w-4 h-4 rounded-sm border-2 transition-transform hover:scale-110",
                  parcel.color === c ? "border-foreground scale-110" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                onClick={() => { onUpdateColor(c); setShowColors(false); }}
              />
            ))}
            <label className="w-4 h-4 rounded-sm border-2 border-dashed border-muted-foreground cursor-pointer flex items-center justify-center">
              <input
                type="color"
                className="sr-only"
                value={parcel.color}
                onChange={(e) => onUpdateColor(e.target.value)}
              />
              <Plus className="h-2.5 w-2.5 text-muted-foreground" />
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">שקיפות</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {Math.round(parcel.fillOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(parcel.fillOpacity * 100)}
              onChange={(e) => onUpdateFillOpacity(Number(e.target.value) / 100)}
              className="w-full h-1.5 accent-primary cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main LayerManager Component ─────────────────────────────────────────────

export function LayerManager() {
  const store = useLayerStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<"layers" | "paint" | "labels">("layers");

  // Paint parcel form
  const [paintGush, setPaintGush] = useState("");
  const [paintHelka, setPaintHelka] = useState("");
  const [paintColor, setPaintColor] = useState(PARCEL_PAINT_COLORS[0]);
  const [loadingTaba, setLoadingTaba] = useState(false);

  // Check if TABA layer already exists
  const tabaLayerExists = store.layers.some((l) => l.id.startsWith("taba-outlines"));

  const handleLoadTaba = useCallback(async () => {
    if (tabaLayerExists || loadingTaba) return;
    setLoadingTaba(true);
    try {
      const geojson = await fetchTabaOutlinesGeoJSON();
      if (!geojson.features.length) {
        setLoadingTaba(false);
        return;
      }

      // Group features by land_use and create a layer per category
      const groups: Record<string, GeoJSON.Feature[]> = {};
      for (const f of geojson.features) {
        const lu = (f.properties as any)?.land_use || "לא מוגדר";
        if (!groups[lu]) groups[lu] = [];
        groups[lu].push(f);
      }

      // Add each land use category as a separate layer
      for (const [landUse, features] of Object.entries(groups)) {
        const luDesignation = getLandUseByName(landUse);
        const color = luDesignation?.border ?? "#9ca3af";
        const fillColor = luDesignation?.fill ?? "#d1d5db";

        store.addLayer({
          name: `תב"ע - ${landUse}`,
          kind: "geojson",
          visible: true,
          opacity: 1,
          color,
          fillColor,
          fillOpacity: 0.35,
          weight: 2,
          locked: false,
          data: { type: "FeatureCollection", features },
          featureCount: features.length,
          geometryTypes: [...new Set(features.map((f) => f.geometry.type))] as string[],
        });
      }
    } catch (err) {
      console.warn("Failed to load TABA outlines:", err);
    } finally {
      setLoadingTaba(false);
    }
  }, [tabaLayerExists, loadingTaba, store]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = store.layers.findIndex((l) => l.id === active.id);
      const newIndex = store.layers.findIndex((l) => l.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        store.reorderLayers(oldIndex, newIndex);
      }
    },
    [store],
  );

  const handlePaintSubmit = useCallback(() => {
    const g = Number(paintGush);
    const h = Number(paintHelka);
    if (g > 0 && h > 0) {
      store.paintParcel(g, h, paintColor, paintColor, 0.35);
      setPaintGush("");
      setPaintHelka("");
    }
  }, [paintGush, paintHelka, paintColor, store]);

  return (
    <div className="h-full flex flex-col" dir="rtl">
      {/* ── Section tabs ── */}
      <div className="flex border-b shrink-0">
        <button
          onClick={() => setActiveSection("layers")}
          className={cn(
            "flex-1 text-xs py-2 flex items-center justify-center gap-1 transition-colors",
            activeSection === "layers"
              ? "text-primary border-b-2 border-primary font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          שכבות ({store.layers.length})
        </button>
        <button
          onClick={() => setActiveSection("paint")}
          className={cn(
            "flex-1 text-xs py-2 flex items-center justify-center gap-1 transition-colors",
            activeSection === "paint"
              ? "text-primary border-b-2 border-primary font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Paintbrush className="h-3.5 w-3.5" />
          צביעת מגרשים ({store.paintedParcels.length})
        </button>
        <button
          onClick={() => setActiveSection("labels")}
          className={cn(
            "flex-1 text-xs py-2 flex items-center justify-center gap-1 transition-colors",
            activeSection === "labels"
              ? "text-primary border-b-2 border-primary font-semibold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Type className="h-3.5 w-3.5" />
          תוויות
        </button>
      </div>

      {/* ═══ Layers Section ═══ */}
      {activeSection === "layers" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Batch actions */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 border-b bg-muted/30 shrink-0 flex-wrap">
            {!tabaLayerExists && (
              <button
                onClick={handleLoadTaba}
                disabled={loadingTaba}
                className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-primary/10 font-medium"
                title="טען שכבות תב״ע"
              >
                {loadingTaba ? <Loader2 className="h-3 w-3 animate-spin" /> : <Map className="h-3 w-3" />}
                {loadingTaba ? "טוען..." : "טען תב״ע"}
              </button>
            )}
            <button
              onClick={() => store.layers.forEach((l) => { if (!l.visible) store.toggleVisibility(l.id); })}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-muted"
              title="הצג הכל"
            >
              <Eye className="h-3 w-3" /> הצג הכל
            </button>
            <button
              onClick={() => store.layers.forEach((l) => { if (l.visible) store.toggleVisibility(l.id); })}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-muted"
              title="הסתר הכל"
            >
              <EyeOff className="h-3 w-3" /> הסתר הכל
            </button>
            <div className="flex-1" />
            {store.layers.length > 0 && (
              <button
                onClick={() => {
                  if (confirm("למחוק את כל השכבות?")) store.clearAllLayers();
                }}
                className="text-[10px] text-destructive hover:text-destructive/80 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-destructive/10"
              >
                <Trash2 className="h-3 w-3" /> נקה הכל
              </button>
            )}
          </div>

          {/* Layer list */}
          <ScrollArea className="flex-1">
            <div className="px-2.5 py-2">
              {store.layers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">אין שכבות פעילות</p>
                  <p className="text-[10px] mt-1 mb-3">
                    העלה קבצי GIS בלשונית "העלאת קבצים"
                  </p>
                  {!tabaLayerExists && (
                    <button
                      onClick={handleLoadTaba}
                      disabled={loadingTaba}
                      className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mx-auto px-3 py-1.5 rounded-md border border-primary/30 hover:bg-primary/5"
                    >
                      {loadingTaba ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Map className="h-3.5 w-3.5" />}
                      {loadingTaba ? "טוען שכבות תב״ע..." : "טען שכבות תב״ע מהדאטאבייס"}
                    </button>
                  )}
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={store.layers.map((l) => l.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {store.layers.map((layer) => (
                      <SortableLayerItem
                        key={layer.id}
                        layer={layer}
                        expanded={expandedIds.has(layer.id)}
                        onToggleExpand={() => toggleExpanded(layer.id)}
                        onToggleVisibility={() => store.toggleVisibility(layer.id)}
                        onSetColor={(c) => store.setColor(layer.id, c)}
                        onSetFillColor={(c) => store.updateLayer(layer.id, { fillColor: c })}
                        onSetOpacity={(o) => store.setOpacity(layer.id, o)}
                        onSetFillOpacity={(o) => store.setFillOpacity(layer.id, o)}
                        onSetWeight={(w) => store.setWeight(layer.id, w)}
                        onSetDashArray={(d) => store.updateLayer(layer.id, { dashArray: d })}
                        onToggleLock={() => store.toggleLock(layer.id)}
                        onDuplicate={() => store.duplicateLayer(layer.id)}
                        onRename={(n) => store.renameLayer(layer.id, n)}
                        onDelete={() => store.removeLayer(layer.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ═══ Paint Parcels Section ═══ */}
      {activeSection === "paint" && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Add parcel form */}
          <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              צבע מגרשים ספציפיים – הזן גוש/חלקה ובחר צבע
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="גוש"
                value={paintGush}
                onChange={(e) => setPaintGush(e.target.value)}
                className="w-20 text-xs px-2 py-1 rounded border border-input bg-background text-right"
                onKeyDown={(e) => { if (e.key === "Enter") handlePaintSubmit(); }}
              />
              <input
                type="number"
                placeholder="חלקה"
                value={paintHelka}
                onChange={(e) => setPaintHelka(e.target.value)}
                className="w-16 text-xs px-2 py-1 rounded border border-input bg-background text-right"
                onKeyDown={(e) => { if (e.key === "Enter") handlePaintSubmit(); }}
              />
              <button
                onClick={() => {
                  const el = document.getElementById("parcel-paint-color-input");
                  if (el) (el as HTMLInputElement).click();
                }}
                className="w-6 h-6 rounded border border-border/60 shrink-0"
                style={{ backgroundColor: paintColor }}
              />
              <input
                id="parcel-paint-color-input"
                type="color"
                className="sr-only"
                value={paintColor}
                onChange={(e) => setPaintColor(e.target.value)}
              />
              <Button
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={handlePaintSubmit}
                disabled={!paintGush || !paintHelka}
              >
                <Plus className="h-3 w-3 ml-0.5" />
                הוסף
              </Button>
            </div>
            {/* Quick color palette */}
            <div className="flex flex-wrap gap-1">
              {PARCEL_PAINT_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "w-4 h-4 rounded-sm border-2 transition-transform hover:scale-110",
                    paintColor === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setPaintColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Painted parcels list */}
          <ScrollArea className="flex-1">
            <div className="px-2.5 py-2">
              {store.paintedParcels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Paintbrush className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">אין מגרשים צבועים</p>
                  <p className="text-[10px] mt-1">
                    הזן גוש וחלקה למעלה כדי לצבוע מגרש
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted-foreground">
                      {store.paintedParcels.length} מגרשים צבועים
                    </span>
                    <button
                      onClick={() => {
                        if (confirm("למחוק את כל הצביעות?")) store.clearPaintedParcels();
                      }}
                      className="text-[10px] text-destructive hover:text-destructive/80 flex items-center gap-0.5"
                    >
                      <RotateCcw className="h-3 w-3" /> נקה הכל
                    </button>
                  </div>
                  {store.paintedParcels.map((p) => (
                    <PaintedParcelItem
                      key={`${p.gush}-${p.helka}`}
                      parcel={p}
                      onUpdateColor={(c) => store.updatePaintedParcel(p.gush, p.helka, { color: c, fillColor: c })}
                      onUpdateFillOpacity={(o) => store.updatePaintedParcel(p.gush, p.helka, { fillOpacity: o })}
                      onUpdateLabel={(l) => store.updatePaintedParcel(p.gush, p.helka, { label: l })}
                      onRemove={() => store.unpaintParcel(p.gush, p.helka)}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ═══ Labels Section ═══ */}
      {activeSection === "labels" && (
        <div className="flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="px-3 py-3 space-y-4" dir="rtl">
              <p className="text-[11px] text-muted-foreground">
                הגדרות תוויות מספרי חלקות על המפה
              </p>

              {/* Visibility toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">הצג מספרי חלקות</span>
                <button
                  onClick={() => store.updateLabelSettings({ visible: !store.labelSettings.visible })}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors relative",
                    store.labelSettings.visible ? "bg-primary" : "bg-muted",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-all",
                      store.labelSettings.visible ? "right-0.5" : "right-[22px]",
                    )}
                  />
                </button>
              </div>

              {/* Font size */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground">גודל טקסט</span>
                  <span className="text-[11px] font-mono text-muted-foreground">{store.labelSettings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="24"
                  value={store.labelSettings.fontSize}
                  onChange={(e) => store.updateLabelSettings({ fontSize: Number(e.target.value) })}
                  className="w-full h-1.5 accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                  <span>8px</span>
                  <span>24px</span>
                </div>
              </div>

              {/* Opacity */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground">שקיפות</span>
                  <span className="text-[11px] font-mono text-muted-foreground">{Math.round(store.labelSettings.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={Math.round(store.labelSettings.opacity * 100)}
                  onChange={(e) => store.updateLabelSettings({ opacity: Number(e.target.value) / 100 })}
                  className="w-full h-1.5 accent-primary cursor-pointer"
                />
              </div>

              {/* Background toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">רקע לתוויות</span>
                <button
                  onClick={() => store.updateLabelSettings({ bgEnabled: !store.labelSettings.bgEnabled })}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors relative",
                    store.labelSettings.bgEnabled ? "bg-primary" : "bg-muted",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-all",
                      store.labelSettings.bgEnabled ? "right-0.5" : "right-[22px]",
                    )}
                  />
                </button>
              </div>

              {/* Background color */}
              {store.labelSettings.bgEnabled && (
                <div>
                  <span className="text-[11px] text-muted-foreground mb-1 block">צבע רקע</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: "לבן", value: "rgba(255,255,255,0.85)" },
                      { label: "שחור", value: "rgba(0,0,0,0.7)" },
                      { label: "צהוב", value: "rgba(254,249,195,0.9)" },
                      { label: "כחול", value: "rgba(219,234,254,0.9)" },
                      { label: "ירוק", value: "rgba(220,252,231,0.9)" },
                    ].map((c) => (
                      <button
                        key={c.value}
                        onClick={() => store.updateLabelSettings({
                          bgColor: c.value,
                          textColor: c.value.includes("0,0,0") ? "#ffffff" : "#991b1b",
                        })}
                        className={cn(
                          "text-[10px] px-2 py-1 rounded border transition-colors",
                          store.labelSettings.bgColor === c.value
                            ? "border-primary bg-primary/10 font-semibold"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text color */}
              <div>
                <span className="text-[11px] text-muted-foreground mb-1 block">צבע טקסט</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "אדום כהה", value: "#991b1b" },
                    { label: "שחור", value: "#000000" },
                    { label: "כחול", value: "#1e40af" },
                    { label: "לבן", value: "#ffffff" },
                    { label: "ירוק", value: "#166534" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      onClick={() => store.updateLabelSettings({ textColor: c.value })}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded border transition-colors",
                        store.labelSettings.textColor === c.value
                          ? "border-primary bg-primary/10 font-semibold"
                          : "border-border hover:border-primary/50",
                      )}
                      style={{ color: c.value === "#ffffff" ? "#000" : c.value }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Border color */}
              <div>
                <span className="text-[11px] text-muted-foreground mb-1 block">צבע מסגרת</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={store.labelSettings.borderColor}
                    onChange={(e) => store.updateLabelSettings({ borderColor: e.target.value })}
                    className="w-8 h-6 rounded border border-border cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground">{store.labelSettings.borderColor}</span>
                </div>
              </div>

              {/* Preview */}
              <div className="border rounded-lg p-3 bg-muted/30">
                <span className="text-[10px] text-muted-foreground block mb-2">תצוגה מקדימה:</span>
                <div className="flex justify-center">
                  <span
                    className="rounded px-2 py-0.5 font-bold"
                    style={{
                      fontSize: store.labelSettings.fontSize,
                      color: store.labelSettings.textColor,
                      backgroundColor: store.labelSettings.bgEnabled ? store.labelSettings.bgColor : "transparent",
                      border: store.labelSettings.bgEnabled ? `1px solid ${store.labelSettings.borderColor}` : "none",
                      opacity: store.labelSettings.opacity,
                    }}
                  >
                    47
                  </span>
                </div>
              </div>

              {/* Reset */}
              <button
                onClick={() => store.updateLabelSettings({ ...DEFAULT_LABEL_SETTINGS })}
                className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted w-full justify-center"
              >
                <RotateCcw className="h-3 w-3" /> איפוס לברירת מחדל
              </button>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
