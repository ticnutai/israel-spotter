/**
 * use-layer-store.ts – Global state for map layers
 *
 * Manages:
 *  • Ordered list of overlay layers (GIS uploads, WMS, tile, GeoJSON)
 *  • Per-layer: visible, color, opacity, z-order, locked
 *  • Painted parcels (gush/helka → color)
 *  • Persistence to localStorage
 */

import { useCallback, useSyncExternalStore } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LayerKind = "geojson" | "tile" | "wms" | "boundary" | "highlight" | "painted" | "labels";

export interface MapLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;         // 0–1
  color: string;           // primary stroke/fill color
  fillColor: string;       // fill color (can differ)
  fillOpacity: number;     // 0–1
  weight: number;          // stroke width
  dashArray?: string;      // e.g. "8 4"
  locked: boolean;         // prevent accidental changes
  order: number;           // z-order (higher = on top)
  data?: GeoJSON.FeatureCollection; // for geojson layers
  url?: string;            // for tile/wms
  featureCount?: number;
  geometryTypes?: string[];
}

export interface ParcelLabelSettings {
  visible: boolean;
  fontSize: number;       // px
  bgEnabled: boolean;     // show background
  bgColor: string;        // background color
  textColor: string;      // text color
  opacity: number;        // 0–1
  borderColor: string;    // border color
}

export interface ParcelBorderSettings {
  color: string;          // border line color
  weight: number;         // border line width
  fillOpacity: number;    // fill opacity
  highlightColor: string; // selected parcel border color
  highlightWeight: number; // selected parcel border width
  highlightFillOpacity: number; // selected parcel fill opacity
  highlightVisible: boolean; // show/hide selected parcel highlight
}

export const DEFAULT_LABEL_SETTINGS: ParcelLabelSettings = {
  visible: true,
  fontSize: 11,
  bgEnabled: true,
  bgColor: "rgba(255,255,255,0.85)",
  textColor: "#991b1b",
  opacity: 1,
  borderColor: "#dc2626",
};

export const DEFAULT_BORDER_SETTINGS: ParcelBorderSettings = {
  color: "#dc2626",
  weight: 1.5,
  fillOpacity: 0.06,
  highlightColor: "#dc2626",
  highlightWeight: 4,
  highlightFillOpacity: 0.2,
  highlightVisible: true,
};

export interface PaintedParcel {
  gush: number;
  helka: number;
  color: string;
  fillColor: string;
  fillOpacity: number;
  label?: string;
}

export interface LayerStoreState {
  layers: MapLayer[];
  paintedParcels: PaintedParcel[];
  labelSettings: ParcelLabelSettings;
  borderSettings: ParcelBorderSettings;
}

// ─── Default colors palette ─────────────────────────────────────────────────

export const LAYER_COLORS = [
  "#e11d48", "#2563eb", "#16a34a", "#9333ea", "#ea580c",
  "#0891b2", "#d946ef", "#ca8a04", "#6366f1", "#059669",
  "#dc2626", "#0284c7", "#65a30d", "#7c3aed", "#c2410c",
  "#0d9488", "#a21caf", "#a16207", "#4f46e5", "#047857",
];

export const PARCEL_PAINT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#06b6d4", "#14b8a6", "#f43f5e",
  "#84cc16", "#6366f1", "#d946ef", "#0ea5e9", "#10b981",
];

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "layer-store-v1";
const PAINTED_KEY = "painted-parcels-v1";
const LABELS_KEY = "parcel-labels-v1";
const BORDER_KEY = "parcel-border-v1";

// ─── External store for cross-component reactivity ───────────────────────────

type Listener = () => void;

let _state: LayerStoreState = { layers: [], paintedParcels: [], labelSettings: { ...DEFAULT_LABEL_SETTINGS }, borderSettings: { ...DEFAULT_BORDER_SETTINGS } };
const _listeners = new Set<Listener>();

function getSnapshot(): LayerStoreState {
  return _state;
}

function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function emit() {
  _listeners.forEach((l) => l());
}

function setState(updater: (prev: LayerStoreState) => LayerStoreState) {
  _state = updater(_state);
  emit();
  // Persist (debounced)
  scheduleSave();
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      // Save layers (without data to avoid bloating storage)
      const stripped = _state.layers.map(({ data, ...rest }) => rest);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
      localStorage.setItem(PAINTED_KEY, JSON.stringify(_state.paintedParcels));
      localStorage.setItem(LABELS_KEY, JSON.stringify(_state.labelSettings));
      localStorage.setItem(BORDER_KEY, JSON.stringify(_state.borderSettings));
    } catch { /* storage full – ignore */ }
  }, 500);
}

// ─── Hydrate from localStorage on load ───────────────────────────────────────

function hydrate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const layers = JSON.parse(raw) as MapLayer[];
      _state = { ..._state, layers };
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(PAINTED_KEY);
    if (raw) {
      const painted = JSON.parse(raw) as PaintedParcel[];
      _state = { ..._state, paintedParcels: painted };
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(LABELS_KEY);
    if (raw) {
      const labelSettings = JSON.parse(raw) as ParcelLabelSettings;
      _state = { ..._state, labelSettings: { ...DEFAULT_LABEL_SETTINGS, ...labelSettings } };
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(BORDER_KEY);
    if (raw) {
      const borderSettings = JSON.parse(raw) as ParcelBorderSettings;
      _state = { ..._state, borderSettings: { ...DEFAULT_BORDER_SETTINGS, ...borderSettings } };
    }
  } catch { /* ignore */ }
}

hydrate();

// ─── Hook ────────────────────────────────────────────────────────────────────

let _nextId = 1;

export function useLayerStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot);

  // ── Layer CRUD ──

  const addLayer = useCallback((layer: Omit<MapLayer, "id" | "order">) => {
    const id = `layer-${Date.now()}-${_nextId++}`;
    setState((prev) => ({
      ...prev,
      layers: [
        ...prev.layers,
        { ...layer, id, order: prev.layers.length },
      ],
    }));
    return id;
  }, []);

  const removeLayer = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers
        .filter((l) => l.id !== id)
        .map((l, i) => ({ ...l, order: i })),
    }));
  }, []);

  const updateLayer = useCallback((id: string, updates: Partial<MapLayer>) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }));
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    }));
  }, []);

  const setOpacity = useCallback((id: string, opacity: number) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
      ),
    }));
  }, []);

  const setColor = useCallback((id: string, color: string) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, color, fillColor: color } : l
      ),
    }));
  }, []);

  const setFillOpacity = useCallback((id: string, fillOpacity: number) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, fillOpacity: Math.max(0, Math.min(1, fillOpacity)) } : l
      ),
    }));
  }, []);

  const setWeight = useCallback((id: string, weight: number) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, weight: Math.max(0.5, Math.min(10, weight)) } : l
      ),
    }));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, locked: !l.locked } : l
      ),
    }));
  }, []);

  const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const layers = [...prev.layers];
      const [moved] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, moved);
      return {
        ...prev,
        layers: layers.map((l, i) => ({ ...l, order: i })),
      };
    });
  }, []);

  const duplicateLayer = useCallback((id: string) => {
    setState((prev) => {
      const source = prev.layers.find((l) => l.id === id);
      if (!source) return prev;
      const newId = `layer-${Date.now()}-${_nextId++}`;
      const copy: MapLayer = {
        ...source,
        id: newId,
        name: source.name + " (עותק)",
        order: prev.layers.length,
        locked: false,
      };
      return { ...prev, layers: [...prev.layers, copy] };
    });
  }, []);

  const renameLayer = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === id ? { ...l, name } : l
      ),
    }));
  }, []);

  const clearAllLayers = useCallback(() => {
    setState((prev) => ({ ...prev, layers: [] }));
  }, []);

  // ── Painted parcels ──

  const paintParcel = useCallback(
    (gush: number, helka: number, color: string, fillColor?: string, fillOpacity?: number, label?: string) => {
      setState((prev) => {
        const existing = prev.paintedParcels.findIndex(
          (p) => p.gush === gush && p.helka === helka
        );
        const entry: PaintedParcel = {
          gush,
          helka,
          color,
          fillColor: fillColor ?? color,
          fillOpacity: fillOpacity ?? 0.35,
          label,
        };
        const parcels = [...prev.paintedParcels];
        if (existing >= 0) {
          parcels[existing] = entry;
        } else {
          parcels.push(entry);
        }
        return { ...prev, paintedParcels: parcels };
      });
    },
    []
  );

  const unpaintParcel = useCallback((gush: number, helka: number) => {
    setState((prev) => ({
      ...prev,
      paintedParcels: prev.paintedParcels.filter(
        (p) => !(p.gush === gush && p.helka === helka)
      ),
    }));
  }, []);

  const clearPaintedParcels = useCallback(() => {
    setState((prev) => ({ ...prev, paintedParcels: [] }));
  }, []);

  const updatePaintedParcel = useCallback(
    (gush: number, helka: number, updates: Partial<PaintedParcel>) => {
      setState((prev) => ({
        ...prev,
        paintedParcels: prev.paintedParcels.map((p) =>
          p.gush === gush && p.helka === helka ? { ...p, ...updates } : p
        ),
      }));
    },
    []
  );

  const updateLabelSettings = useCallback(
    (updates: Partial<ParcelLabelSettings>) => {
      setState((prev) => ({
        ...prev,
        labelSettings: { ...prev.labelSettings, ...updates },
      }));
    },
    []
  );

  const updateBorderSettings = useCallback(
    (updates: Partial<ParcelBorderSettings>) => {
      setState((prev) => ({
        ...prev,
        borderSettings: { ...prev.borderSettings, ...updates },
      }));
    },
    []
  );

  return {
    layers: state.layers,
    paintedParcels: state.paintedParcels,
    labelSettings: state.labelSettings,
    borderSettings: state.borderSettings,
    addLayer,
    removeLayer,
    updateLayer,
    toggleVisibility,
    setOpacity,
    setColor,
    setFillOpacity,
    setWeight,
    toggleLock,
    reorderLayers,
    duplicateLayer,
    renameLayer,
    clearAllLayers,
    paintParcel,
    unpaintParcel,
    clearPaintedParcels,
    updatePaintedParcel,
    updateLabelSettings,
    updateBorderSettings,
  };
}
