import { Move, Palette, Paintbrush } from "lucide-react";
import type { ParcelColorMode } from "./MapView";
import { getCategoryColors } from "@/lib/land-use-colors";
import { useLayerStore, DEFAULT_BORDER_SETTINGS } from "@/hooks/use-layer-store";
import { useState } from "react";

interface MapLegendProps {
  colorMode: ParcelColorMode;
  onColorModeChange: (mode: ParcelColorMode) => void;
}

const COLOR_MODES: { id: ParcelColorMode; label: string }[] = [
  { id: "default", label: "ברירת מחדל" },
  { id: "status", label: "סטטוס רישום" },
  { id: "area", label: "גודל שטח" },
  { id: "landuse", label: "יעוד קרקע" },
];

export function MapLegend({ colorMode, onColorModeChange }: MapLegendProps) {
  const { borderSettings, updateBorderSettings } = useLayerStore();
  const [showBorderSettings, setShowBorderSettings] = useState(false);
  const categoryColors = getCategoryColors();

  return (
    <div
      dir="rtl"
      style={{ position: "absolute", bottom: 32, right: 12, zIndex: 800 }}
      className="bg-card/95 backdrop-blur border rounded-lg shadow-lg px-3 py-2 select-none min-w-[140px] max-h-[60vh] overflow-y-auto"
    >
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-muted-foreground font-semibold">
        <Move className="h-3 w-3" />
        מקרא
      </div>

      {/* Color mode selector */}
      <div className="flex items-center gap-1 mb-2">
        <Palette className="h-3 w-3 text-muted-foreground shrink-0" />
        <select
          value={colorMode}
          onChange={(e) => onColorModeChange(e.target.value as ParcelColorMode)}
          className="text-[10px] bg-muted/50 border border-border rounded px-1.5 py-0.5 w-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {COLOR_MODES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Border settings toggle */}
      <button
        onClick={() => setShowBorderSettings(!showBorderSettings)}
        className="flex items-center gap-1 mb-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Paintbrush className="h-3 w-3 shrink-0" />
        <span>הגדרות קווי חלקות</span>
        <span className="mr-auto text-[8px]">{showBorderSettings ? "▲" : "▼"}</span>
      </button>

      {showBorderSettings && (
        <div className="mb-2 p-1.5 bg-muted/30 rounded border border-border space-y-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] text-muted-foreground w-12">צבע קו</label>
            <input
              type="color"
              value={borderSettings.color}
              onChange={(e) => updateBorderSettings({ color: e.target.value })}
              className="w-5 h-5 border border-border rounded cursor-pointer p-0"
            />
            <span className="text-[8px] text-muted-foreground font-mono">{borderSettings.color}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] text-muted-foreground w-12">עובי קו</label>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={borderSettings.weight}
              onChange={(e) => updateBorderSettings({ weight: Number(e.target.value) })}
              className="flex-1 h-3"
            />
            <span className="text-[8px] text-muted-foreground w-4 text-center">{borderSettings.weight}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] text-muted-foreground w-12">מילוי</label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.02"
              value={borderSettings.fillOpacity}
              onChange={(e) => updateBorderSettings({ fillOpacity: Number(e.target.value) })}
              className="flex-1 h-3"
            />
            <span className="text-[8px] text-muted-foreground w-6 text-center">{Math.round(borderSettings.fillOpacity * 100)}%</span>
          </div>
          <button
            onClick={() => updateBorderSettings({ ...DEFAULT_BORDER_SETTINGS })}
            className="text-[9px] text-primary hover:underline"
          >
            איפוס ברירת מחדל
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs">
        {/* Base legend items */}
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#2563eb", backgroundColor: "rgba(59,130,246,0.04)" }} />
          גוש (גבול בלוק)
        </div>

        {colorMode === "default" && (
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-3 rounded-sm" style={{ borderWidth: borderSettings.weight, borderStyle: "solid", borderColor: borderSettings.color, backgroundColor: `${borderSettings.color}1a` }} />
            חלקות
          </div>
        )}

        {colorMode === "status" && (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#16a34a", backgroundColor: "rgba(34,197,94,0.25)" }} />
              מוסדר
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#2563eb", backgroundColor: "rgba(59,130,246,0.25)" }} />
              הסדר ראשוני
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#f59e0b", backgroundColor: "rgba(251,191,36,0.25)" }} />
              בהסדר
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#dc2626", backgroundColor: "rgba(239,68,68,0.25)" }} />
              לא מוסדר
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#8b5cf6", backgroundColor: "rgba(167,139,250,0.25)" }} />
              אחר
            </div>
          </>
        )}

        {colorMode === "area" && (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#06b6d4", backgroundColor: "rgba(34,211,238,0.25)" }} />
              {'< 100 מ"ר'}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#16a34a", backgroundColor: "rgba(74,222,128,0.25)" }} />
              {'100–500 מ"ר'}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#f59e0b", backgroundColor: "rgba(251,191,36,0.25)" }} />
              {'500–1,000 מ"ר'}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#f97316", backgroundColor: "rgba(251,146,60,0.25)" }} />
              {'1,000–5,000 מ"ר'}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#dc2626", backgroundColor: "rgba(239,68,68,0.25)" }} />
              {'> 5,000 מ"ר'}
            </div>
          </>
        )}

        {colorMode === "landuse" && (
          <>
            {categoryColors.map((cat) => (
              <div key={cat.category} className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-3 rounded-sm border-2"
                  style={{ borderColor: cat.border, backgroundColor: cat.fill + "66" }}
                />
                {cat.category}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#9ca3af", backgroundColor: "rgba(209,213,219,0.1)" }} />
              לא ידוע
            </div>
          </>
        )}

        {/* Highlight & number labels */}
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.2)" }} />
          חלקה נבחרת
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-1 text-[9px] font-bold rounded border" style={{ borderColor: "#dc2626", color: "#991b1b", backgroundColor: "rgba(255,255,255,0.85)" }}>47</span>
          מספר חלקה
        </div>
      </div>
    </div>
  );
}
