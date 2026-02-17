import { useState, useRef, useCallback } from "react";
import { Move } from "lucide-react";

export function MapLegend() {
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPosition({ x: ev.clientX - offset.current.x, y: ev.clientY - offset.current.y });
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [position]);

  return (
    <div
      dir="rtl"
      onMouseDown={onMouseDown}
      style={{ position: "fixed", left: position.x, top: position.y, zIndex: 1000 }}
      className="bg-card/95 backdrop-blur border rounded-lg shadow-lg px-4 py-3 cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground font-medium">
        <Move className="h-3 w-3" />
        מקרא
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#dc2626", backgroundColor: "rgba(239,68,68,0.2)" }} />
          חלקה
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded-sm border-2" style={{ borderColor: "#2563eb", backgroundColor: "rgba(59,130,246,0.1)" }} />
          גוש
        </div>
      </div>
    </div>
  );
}
