import { useRef } from "react";
import { Upload, Trash2, Eye, EyeOff, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useGISLayers, type GISLayer } from "@/hooks/use-gis-layers";

const ACCEPTED = ".geojson,.json,.kml,.gpx";

interface GISUploaderProps {
  layers: GISLayer[];
  loading: boolean;
  uploading: boolean;
  uploadProgress: number;
  onUpload: (file: File) => void;
  onDelete: (layer: GISLayer) => void;
  onToggle: (layerId: string) => void;
}

export function GISUploader({
  layers,
  loading,
  uploading,
  uploadProgress,
  onUpload,
  onDelete,
  onToggle,
}: GISUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = "";
    }
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-background/95 backdrop-blur rounded-lg shadow-lg border p-3 w-64" dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">שכבות GIS</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        size="sm"
        className="w-full mb-2"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin ml-1" />
        ) : (
          <Upload className="h-4 w-4 ml-1" />
        )}
        {uploading ? "מעלה..." : "העלאת קובץ"}
      </Button>

      {uploading && <Progress value={uploadProgress} className="h-2 mb-2" />}

      {loading ? (
        <div className="text-xs text-muted-foreground text-center py-2">טוען...</div>
      ) : layers.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-2">
          אין שכבות. העלה GeoJSON, KML או GPX
        </div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-1.5 text-xs p-1.5 rounded hover:bg-accent/50"
            >
              <button
                onClick={() => onToggle(layer.id)}
                className="text-muted-foreground hover:text-foreground"
                title={layer.visible ? "הסתר" : "הצג"}
              >
                {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <span className="flex-1 truncate" title={layer.name}>
                {layer.name}
              </span>
              <span className="text-muted-foreground uppercase text-[10px]">
                {layer.file_type}
              </span>
              <button
                onClick={() => onDelete(layer)}
                className="text-muted-foreground hover:text-destructive"
                title="מחק"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
