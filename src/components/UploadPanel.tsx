/**
 * UploadPanel.tsx – File upload with GIS file parsing (DXF, GeoJSON, KML)
 *
 * • Accepts DXF, GeoJSON, KML, KMZ + images/PDF for DB storage
 * • GIS files are parsed client-side and displayed on the map
 * • Auto-detects ITM (EPSG:2039) coordinates and converts to WGS84
 * • Non-GIS files are uploaded to backend as before
 */

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  File,
  Image,
  FileText,
  Map as MapIcon,
  Eye,
  EyeOff,
  Layers,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadDocument,
  getUploads,
  deleteUpload,
  documentFileUrl,
  type DocumentRecord,
} from "@/lib/kfar-chabad-api";
import {
  parseGisFile,
  isGisFile,
  type ParsedGisLayer,
  looksLikeItm,
  convertItmToWgs84,
} from "@/lib/gis-parser";

// ── Accepted file extensions ─────────────────────────────────────────────────
const ACCEPT_STRING =
  ".dxf,.geojson,.json,.kml,.kmz,.pdf,.jpg,.jpeg,.png,.tif,.tiff,.dwfx,.bmp,.shp,.dbf,.prj,.shx";

export interface UploadPanelProps {
  onShowGisLayer?: (layer: ParsedGisLayer | null) => void;
}

export function UploadPanel({ onShowGisLayer }: UploadPanelProps) {
  // ── DB upload states ──
  const [gush, setGush] = useState("");
  const [helka, setHelka] = useState("");
  const [category, setCategory] = useState("plans");
  const [planNumber, setPlanNumber] = useState("");
  const [title, setTitle] = useState("");
  const [isTashrit, setIsTashrit] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);

  // ── GIS layer states ──
  const [parsedLayers, setParsedLayers] = useState<ParsedGisLayer[]>([]);
  const [activeLayerIdx, setActiveLayerIdx] = useState<number | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Recent uploads
  const [recentUploads, setRecentUploads] = useState<DocumentRecord[]>([]);
  const [loadedRecent, setLoadedRecent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRecent = useCallback(async () => {
    try {
      const data = await getUploads(20);
      setRecentUploads(data.uploads);
      setLoadedRecent(true);
    } catch { /* ignore */ }
  }, []);

  if (!loadedRecent) loadRecent();

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Parse GIS files locally ──
  const handleParseGis = async () => {
    const gisFiles = files.filter((f) => isGisFile(f.name));
    if (gisFiles.length === 0) return;

    setParsing(true);
    setParseError(null);

    const newLayers: ParsedGisLayer[] = [];
    const errors: string[] = [];

    for (const file of gisFiles) {
      try {
        const layer = await parseGisFile(file);

        // Auto-detect and convert ITM coordinates
        if (looksLikeItm(layer.geojson)) {
          convertItmToWgs84(layer.geojson);
          layer.bbox = null; // will be recomputed by map
        }

        newLayers.push(layer);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "שגיאה"}`);
      }
    }

    const updatedLayers = [...parsedLayers, ...newLayers];
    setParsedLayers(updatedLayers);
    setParsing(false);

    if (errors.length > 0) {
      setParseError(errors.join("\n"));
    }

    // Show first new layer on map
    if (newLayers.length > 0 && onShowGisLayer) {
      const idx = parsedLayers.length;
      setActiveLayerIdx(idx);
      onShowGisLayer(newLayers[0]);
    }

    // Remove parsed GIS files from upload queue
    setFiles((prev) => prev.filter((f) => !isGisFile(f.name)));
  };

  // ── Upload non-GIS files to backend ──
  const handleUpload = async () => {
    const nonGisFiles = files.filter((f) => !isGisFile(f.name));
    if (!gush || nonGisFiles.length === 0) return;

    setUploading(true);
    setResults([]);

    const newResults: typeof results = [];
    for (const file of nonGisFiles) {
      try {
        await uploadDocument({
          file,
          gush: Number(gush),
          helka: helka ? Number(helka) : 0,
          category,
          plan_number: planNumber || undefined,
          title: title || undefined,
          is_tashrit: isTashrit,
        });
        newResults.push({ name: file.name, ok: true });
      } catch (err) {
        newResults.push({
          name: file.name,
          ok: false,
          error: err instanceof Error ? err.message : "שגיאה",
        });
      }
    }

    setResults(newResults);
    setFiles((prev) => prev.filter((f) => isGisFile(f.name)));
    setUploading(false);
    loadRecent();
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUpload(id);
      setRecentUploads((prev) => prev.filter((u) => u.id !== id));
    } catch { /* ignore */ }
  };

  const toggleLayerVisibility = (idx: number) => {
    if (activeLayerIdx === idx) {
      setActiveLayerIdx(null);
      onShowGisLayer?.(null);
    } else {
      setActiveLayerIdx(idx);
      onShowGisLayer?.(parsedLayers[idx]);
    }
  };

  const removeLayer = (idx: number) => {
    if (activeLayerIdx === idx) {
      setActiveLayerIdx(null);
      onShowGisLayer?.(null);
    } else if (activeLayerIdx !== null && activeLayerIdx > idx) {
      setActiveLayerIdx(activeLayerIdx - 1);
    }
    setParsedLayers((prev) => prev.filter((_, i) => i !== idx));
  };

  const hasGisFiles = files.some((f) => isGisFile(f.name));
  const hasNonGisFiles = files.some((f) => !isGisFile(f.name));

  function fileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (isGisFile(name)) return <MapIcon className="h-4 w-4 text-emerald-600" />;
    if (["jpg", "jpeg", "png", "tif", "tiff", "bmp"].includes(ext))
      return <Image className="h-4 w-4 text-blue-500" />;
    if (ext === "pdf") return <FileText className="h-4 w-4 text-red-500" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-4">
          {/* ═══ Drop Zone ═══ */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer",
              "transition-colors hover:border-primary hover:bg-primary/5",
              files.length > 0
                ? "border-primary/50 bg-primary/5"
                : "border-muted-foreground/20",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileChange}
              accept={ACCEPT_STRING}
            />
            <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              גרור קבצים לכאן או לחץ לבחירה
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              DXF, GeoJSON, KML, PDF, תמונות ועוד
            </p>
          </div>

          {/* ═══ Selected Files ═══ */}
          {files.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">{files.length} קבצים נבחרו:</p>
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1"
                >
                  {fileIcon(f.name)}
                  <span className="flex-1 truncate">{f.name}</span>
                  {isGisFile(f.name) && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700">
                      GIS
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ═══ GIS Parse Button ═══ */}
          {hasGisFiles && (
            <Button
              variant="default"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={parsing}
              onClick={handleParseGis}
            >
              {parsing ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <MapIcon className="h-4 w-4 ml-2" />
              )}
              הצג על המפה ({files.filter((f) => isGisFile(f.name)).length} קבצי GIS)
            </Button>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <pre className="whitespace-pre-wrap">{parseError}</pre>
            </div>
          )}

          {/* ═══ Active GIS Layers ═══ */}
          {parsedLayers.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold">שכבות GIS טעונות</span>
              </div>
              {parsedLayers.map((layer, idx) => (
                <div
                  key={`${layer.name}-${idx}`}
                  className={cn(
                    "flex items-center gap-2 text-xs rounded px-2 py-1.5 transition-colors",
                    activeLayerIdx === idx
                      ? "bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300"
                      : "bg-background border"
                  )}
                >
                  <MapIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{layer.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {layer.featureCount} אלמנטים · {layer.geometryTypes.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleLayerVisibility(idx)}
                    className={cn(
                      "p-1 rounded hover:bg-accent",
                      activeLayerIdx === idx ? "text-emerald-600" : "text-muted-foreground"
                    )}
                    title={activeLayerIdx === idx ? "הסתר" : "הצג על המפה"}
                  >
                    {activeLayerIdx === idx ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => removeLayer(idx)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent"
                    title="הסר שכבה"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ═══ DB Upload Section (non-GIS files) ═══ */}
          {(hasNonGisFiles || (!hasGisFiles && files.length === 0)) && (
            <>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">מספר גוש *</Label>
                    <Input
                      type="number"
                      placeholder="6260"
                      value={gush}
                      onChange={(e) => setGush(e.target.value)}
                      className="h-8 text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">מספר חלקה</Label>
                    <Input
                      type="number"
                      placeholder="0 = ללא"
                      value={helka}
                      onChange={(e) => setHelka(e.target.value)}
                      className="h-8 text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">קטגוריה</Label>
                    <select
                      className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="plans">תוכנית</option>
                      <option value="permits">היתר</option>
                      <option value="aerial">צילום אוויר</option>
                      <option value="other">אחר</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">מספר תוכנית</Label>
                    <Input
                      placeholder="אופציונלי"
                      value={planNumber}
                      onChange={(e) => setPlanNumber(e.target.value)}
                      className="h-8 text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">כותרת (אופציונלי)</Label>
                  <Input
                    placeholder="שם תיאורי לקובץ"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTashrit}
                    onChange={(e) => setIsTashrit(e.target.checked)}
                    className="rounded border-input"
                  />
                  סמן כתשריט (ניתן להציג על המפה)
                </label>

                {hasNonGisFiles && (
                  <Button
                    className="w-full"
                    disabled={uploading || !gush}
                    onClick={handleUpload}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Upload className="h-4 w-4 ml-2" />
                    )}
                    העלה {files.filter((f) => !isGisFile(f.name)).length} קבצים למאגר
                  </Button>
                )}
              </div>
            </>
          )}

          {/* ═══ Upload Results ═══ */}
          {results.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">תוצאות העלאה:</p>
              {results.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 text-xs rounded px-2 py-1",
                    r.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700",
                  )}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate">{r.name}</span>
                  {r.error && <span className="text-[10px]">({r.error})</span>}
                </div>
              ))}
            </div>
          )}

          {/* ═══ Recent Uploads ═══ */}
          {recentUploads.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-2">העלאות אחרונות:</p>
              <div className="space-y-1">
                {recentUploads.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5 group"
                  >
                    {fileIcon(u.file_name)}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{u.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        גוש {u.gush}
                        {u.helka > 0 && ` · חלקה ${u.helka}`}
                        {u.plan_number && ` · ${u.plan_number}`}
                      </p>
                    </div>
                    <a
                      href={documentFileUrl(u.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary"
                    >
                      <File className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => handleDelete(u.id)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
