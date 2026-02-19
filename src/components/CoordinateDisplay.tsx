/**
 * CoordinateDisplay – Shows cursor position in ITM and WGS84 on the map.
 * Click to copy coordinates. Toggle between coordinate systems.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import L from "leaflet";
import { Crosshair, Copy, Check } from "lucide-react";
import { wgs84ToItm } from "@/lib/itm-to-wgs84";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CoordinateDisplayProps {
  map: L.Map | null;
}

type CoordSystem = "itm" | "wgs84";

export function CoordinateDisplay({ map }: CoordinateDisplayProps) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [system, setSystem] = useState<CoordSystem>("itm");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      setPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    const outHandler = () => setPos(null);
    map.on("mousemove", handler);
    map.getContainer().addEventListener("mouseleave", outHandler);
    return () => {
      map.off("mousemove", handler);
      map.getContainer().removeEventListener("mouseleave", outHandler);
    };
  }, [map]);

  const display = useMemo(() => {
    if (!pos) return null;
    if (system === "itm") {
      const [e, n] = wgs84ToItm(pos.lat, pos.lng);
      return { label: "ITM", line1: `E ${e.toFixed(1)}`, line2: `N ${n.toFixed(1)}`, copyText: `${e.toFixed(1)}, ${n.toFixed(1)}` };
    }
    return { label: "WGS84", line1: `${pos.lat.toFixed(6)}°`, line2: `${pos.lng.toFixed(6)}°`, copyText: `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` };
  }, [pos, system]);

  const handleCopy = useCallback(() => {
    if (!display) return;
    navigator.clipboard.writeText(display.copyText);
    setCopied(true);
    toast.success("הקואורדינטות הועתקו");
    setTimeout(() => setCopied(false), 1500);
  }, [display]);

  const toggleSystem = useCallback(() => {
    setSystem((s) => (s === "itm" ? "wgs84" : "itm"));
  }, []);

  if (!display) return null;

  return (
    <div
      className="absolute bottom-6 right-4 z-[1000] select-none"
      dir="rtl"
    >
      <div
        className={cn(
          "flex items-center gap-1.5 bg-card/95 backdrop-blur",
          "border rounded-lg shadow-lg px-2.5 py-1.5",
          "text-xs font-mono",
        )}
      >
        <Crosshair className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

        <button
          onClick={toggleSystem}
          className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold text-[10px] hover:bg-primary/20 transition-colors min-w-[42px] text-center"
          title="החלף מערכת קואורדינטות"
        >
          {display.label}
        </button>

        <span className="text-foreground whitespace-nowrap">{display.line1}</span>
        <span className="text-muted-foreground">|</span>
        <span className="text-foreground whitespace-nowrap">{display.line2}</span>

        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="העתק קואורדינטות"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
