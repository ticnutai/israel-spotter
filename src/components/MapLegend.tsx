import { Move } from "lucide-react";

export function MapLegend() {

  return (
    <div
      dir="rtl"
      style={{ position: "absolute", bottom: 32, right: 12, zIndex: 800 }}
      className="bg-card/95 backdrop-blur border rounded-lg shadow-lg px-3 py-2 select-none"
    >
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-muted-foreground font-semibold">
        <Move className="h-3 w-3" />
        מקרא
      </div>
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#2563eb", backgroundColor: "rgba(59,130,246,0.04)" }} />
          גוש (גבול בלוק)
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-[1.5px]" style={{ borderColor: "#dc2626", backgroundColor: "rgba(239,68,68,0.06)" }} />
          חלקות (חלוקה למגרשים)
        </div>
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
