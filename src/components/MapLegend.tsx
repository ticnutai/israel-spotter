import { Move, Palette } from "lucide-react";
import type { ParcelColorMode } from "./MapView";

interface MapLegendProps {
  colorMode: ParcelColorMode;
  onColorModeChange: (mode: ParcelColorMode) => void;
}

const COLOR_MODES: { id: ParcelColorMode; label: string }[] = [
  { id: "default", label: "ברירת מחדל" },
  { id: "status", label: "סטטוס רישום" },
  { id: "area", label: "גודל שטח" },
];

export function MapLegend({ colorMode, onColorModeChange }: MapLegendProps) {
  return (
    <div
      dir="rtl"
      style={{ position: "absolute", bottom: 32, right: 12, zIndex: 800 }}
      className="bg-card/95 backdrop-blur border rounded-lg shadow-lg px-3 py-2 select-none min-w-[140px]"
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

      <div className="flex flex-col gap-1 text-xs">
        {/* Base legend items */}
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#2563eb", backgroundColor: "rgba(59,130,246,0.04)" }} />
          גוש (גבול בלוק)
        </div>

        {colorMode === "default" && (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-3 rounded-sm border-[1.5px]" style={{ borderColor: "#dc2626", backgroundColor: "rgba(239,68,68,0.06)" }} />
              חלקות
            </div>
          </>
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
