import { useState, useRef, useEffect } from "react";
import { Layers } from "lucide-react";

export interface MapLayerOption {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
}

export const MAP_LAYERS: MapLayerOption[] = [
  {
    id: "osm",
    label: "מפה רגילה",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    id: "govmap",
    label: "GovMap קדסטר",
    url: "https://tiles.govmap.gov.il/KADASTR/{z}/{x}/{y}.png",
    attribution: '&copy; מפות ממשלתיות - מרכז המיפוי הישראלי',
    maxZoom: 20,
  },
  {
    id: "govmap-streets",
    label: "GovMap רחובות",
    url: "https://tiles.govmap.gov.il/israelhybrid/{z}/{x}/{y}.png",
    attribution: '&copy; מפות ממשלתיות - מרכז המיפוי הישראלי',
    maxZoom: 20,
  },
  {
    id: "esri-satellite",
    label: "צילום אוויר",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  {
    id: "esri-hybrid",
    label: "צילום + כיתוב",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  {
    id: "esri-streets",
    label: "רחובות מפורטים",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri',
    maxZoom: 19,
  },
  {
    id: "topo",
    label: "טופוגרפית",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenTopoMap',
    maxZoom: 17,
  },
];

// Labels overlay for hybrid mode
export const LABELS_LAYER_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

interface MapLayerSwitcherProps {
  activeLayerId: string;
  onLayerChange: (layer: MapLayerOption) => void;
}

export function MapLayerSwitcher({ activeLayerId, onLayerChange }: MapLayerSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="absolute top-3 right-3 z-[1000]" dir="rtl">
      <button
        onClick={() => setOpen(!open)}
        className="bg-card/95 backdrop-blur border rounded-lg shadow-lg p-2.5 hover:bg-accent transition-colors"
        title="שכבות מפה"
      >
        <Layers className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-card/95 backdrop-blur border rounded-lg shadow-lg overflow-hidden min-w-[160px]">
          {MAP_LAYERS.map((layer) => (
            <button
              key={layer.id}
              onClick={() => {
                onLayerChange(layer);
                setOpen(false);
              }}
              className={`w-full text-right px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                activeLayerId === layer.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-accent"
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
