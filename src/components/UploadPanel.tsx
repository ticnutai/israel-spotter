/**
 * UploadPanel.tsx Γאף File upload component for maps, aerial photos, documents
 */

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  uploadDocument,
  getUploads,
  deleteUpload,
  documentFileUrl,
  type DocumentRecord,
  type UploadResult,
} from "@/lib/kfar-chabad-api";

export function UploadPanel() {
  const [gush, setGush] = useState("");
  const [helka, setHelka] = useState("");
  const [category, setCategory] = useState("plans");
  const [planNumber, setPlanNumber] = useState("");
  const [title, setTitle] = useState("");
  const [isTashrit, setIsTashrit] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);

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

  // Load recent on first render
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

  const handleUpload = async () => {
    if (!gush || files.length === 0) return;
    setUploading(true);
    setResults([]);

    const newResults: typeof results = [];
    for (const file of files) {
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
          error: err instanceof Error ? err.message : "╫⌐╫ע╫ש╫נ╫פ",
        });
      }
    }

    setResults(newResults);
    setFiles([]);
    setUploading(false);
    loadRecent();
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteUpload(id);
      setRecentUploads((prev) => prev.filter((u) => u.id !== id));
    } catch { /* ignore */ }
  };

  function fileIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["jpg", "jpeg", "png", "tif", "tiff", "bmp"].includes(ext))
      return <Image className="h-4 w-4 text-blue-500" />;
    if (ext === "pdf") return <FileText className="h-4 w-4 text-red-500" />;
    return <File className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-4">
          {/* Drop zone */}
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
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.dwfx,.bmp"
            />
            <FileUp className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              ╫ע╫¿╫ץ╫¿ ╫º╫ס╫ª╫ש╫¥ ╫£╫¢╫נ╫ƒ ╫נ╫ץ ╫£╫ק╫Ñ ╫£╫ס╫ק╫ש╫¿╫פ
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              PDF, ╫¬╫₧╫ץ╫á╫ץ╫¬, DWF ╫ץ╫ó╫ץ╫ף
            </p>
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">{files.length} ╫º╫ס╫ª╫ש╫¥ ╫á╫ס╫ק╫¿╫ץ:</p>
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1"
                >
                  {fileIcon(f.name)}
                  <span className="flex-1 truncate">{f.name}</span>
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

          {/* Metadata form */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">╫₧╫í╫ñ╫¿ ╫ע╫ץ╫⌐ *</Label>
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
                <Label className="text-xs">╫₧╫í╫ñ╫¿ ╫ק╫£╫º╫פ</Label>
                <Input
                  type="number"
                  placeholder="0 = ╫£╫£╫נ"
                  value={helka}
                  onChange={(e) => setHelka(e.target.value)}
                  className="h-8 text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">╫º╫ר╫ע╫ץ╫¿╫ש╫פ</Label>
                <select
                  className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="plans">╫¬╫ץ╫¢╫á╫ש╫¬</option>
                  <option value="permits">╫פ╫ש╫¬╫¿</option>
                  <option value="aerial">╫ª╫ש╫£╫ץ╫¥ ╫נ╫ץ╫ץ╫ש╫¿</option>
                  <option value="other">╫נ╫ק╫¿</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">╫₧╫í╫ñ╫¿ ╫¬╫ץ╫¢╫á╫ש╫¬</Label>
                <Input
                  placeholder="╫נ╫ץ╫ñ╫ª╫ש╫ץ╫á╫£╫ש"
                  value={planNumber}
                  onChange={(e) => setPlanNumber(e.target.value)}
                  className="h-8 text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">╫¢╫ץ╫¬╫¿╫¬ (╫נ╫ץ╫ñ╫ª╫ש╫ץ╫á╫£╫ש)</Label>
              <Input
                placeholder="╫⌐╫¥ ╫¬╫ש╫נ╫ץ╫¿╫ש ╫£╫º╫ץ╫ס╫Ñ"
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
              ╫í╫₧╫ƒ ╫¢╫¬╫⌐╫¿╫ש╫ר (╫á╫ש╫¬╫ƒ ╫£╫פ╫ª╫ש╫ע ╫ó╫£ ╫פ╫₧╫ñ╫פ)
            </label>

            <Button
              className="w-full"
              disabled={uploading || !gush || files.length === 0}
              onClick={handleUpload}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : (
                <Upload className="h-4 w-4 ml-2" />
              )}
              ╫פ╫ó╫£╫פ {files.length > 0 ? `${files.length} ╫º╫ס╫ª╫ש╫¥` : ""}
            </Button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">╫¬╫ץ╫ª╫נ╫ץ╫¬ ╫פ╫ó╫£╫נ╫פ:</p>
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

          {/* Recent uploads */}
          {recentUploads.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs font-medium mb-2">╫פ╫ó╫£╫נ╫ץ╫¬ ╫נ╫ק╫¿╫ץ╫á╫ץ╫¬:</p>
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
                        ╫ע╫ץ╫⌐ {u.gush}
                        {u.helka > 0 && ` ┬╖ ╫ק╫£╫º╫פ ${u.helka}`}
                        {u.plan_number && ` ┬╖ ${u.plan_number}`}
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
