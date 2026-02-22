/**
 * DocumentViewer – Internal file viewer for PDFs and images
 * Opens as a full-screen overlay with luxury gold/navy styling
 */

import { useState, useEffect } from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocumentViewerProps {
  url: string;
  title: string;
  /** Accepts canonical "pdf"/"image"/"other" OR raw extensions like "jpg","png","tif" */
  fileType: string;
  onClose: () => void;
}

const IMAGE_EXTENSIONS = new Set(["image", "jpg", "jpeg", "png", "gif", "bmp", "webp", "tif", "tiff", "svg"]);

/** Normalize raw DB file_type (e.g. "jpg") into viewer category */
function resolveFileType(raw: string): "pdf" | "image" | "other" {
  const lower = raw.toLowerCase();
  if (lower === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(lower)) return "image";
  return "other";
}

const goldColor = "hsl(43 56% 52%)";
const navyColor = "hsl(222.2 47.4% 11.2%)";

export function DocumentViewer({ url, title, fileType: rawFileType, onClose }: DocumentViewerProps) {
  const fileType = resolveFileType(rawFileType);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ backgroundColor: "hsl(0 0% 0% / 0.85)" }}
      dir="rtl"
    >
      {/* ── Header ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-2.5"
        style={{
          backgroundColor: navyColor,
          borderBottom: `2px solid ${goldColor}`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: goldColor }}
          >
            <X className="h-5 w-5" />
          </button>
          <h2
            className="text-sm font-semibold truncate max-w-[50vw]"
            style={{ color: goldColor }}
          >
            {title}
          </h2>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1">
          {fileType === "image" && (
            <>
              <ToolbarButton icon={<ZoomOut className="h-4 w-4" />} onClick={handleZoomOut} tooltip="הקטן" />
              <span className="text-xs text-white/60 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <ToolbarButton icon={<ZoomIn className="h-4 w-4" />} onClick={handleZoomIn} tooltip="הגדל" />
              <ToolbarButton icon={<RotateCw className="h-4 w-4" />} onClick={handleRotate} tooltip="סובב" />
              <div className="w-px h-6 bg-white/20 mx-1" />
            </>
          )}
          <ToolbarButton
            icon={isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            onClick={() => setIsFullscreen(!isFullscreen)}
            tooltip={isFullscreen ? "צמצם" : "מסך מלא"}
          />
          <a href={url} target="_blank" rel="noopener noreferrer" download>
            <ToolbarButton icon={<Download className="h-4 w-4" />} onClick={() => {}} tooltip="הורד" />
          </a>
        </div>
      </div>

      {/* ── Content Area ── */}
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${goldColor} transparent ${goldColor} ${goldColor}` }}
            />
          </div>
        )}

        {fileType === "pdf" ? (
          <iframe
            src={url}
            className={cn(
              "bg-white rounded-xl shadow-2xl transition-all duration-300",
              isFullscreen ? "w-full h-full" : "w-[90%] h-full max-w-4xl",
            )}
            style={{
              border: `1.5px solid ${navyColor}`,
              opacity: loading ? 0 : 1,
            }}
            onLoad={() => setLoading(false)}
            title={title}
          />
        ) : fileType === "image" ? (
          <div
            className="flex items-center justify-center overflow-auto w-full h-full"
          >
            <img
              src={url}
              alt={title}
              className="max-w-none transition-all duration-200 rounded-xl shadow-2xl"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                border: `1.5px solid ${navyColor}`,
                opacity: loading ? 0 : 1,
              }}
              onLoad={() => setLoading(false)}
              draggable={false}
            />
          </div>
        ) : (
          <div
            className="text-center p-8 rounded-2xl"
            style={{
              backgroundColor: "hsl(0 0% 100%)",
              border: `1.5px solid ${navyColor}`,
            }}
          >
            <p className="text-sm mb-4" style={{ color: navyColor }}>
              לא ניתן לצפות בקובץ מסוג זה בדפדפן
            </p>
            <a href={url} target="_blank" rel="noopener noreferrer" download>
              <Button
                className="rounded-xl"
                style={{ backgroundColor: goldColor, color: "white" }}
              >
                <Download className="h-4 w-4 ml-2" />
                הורד קובץ
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon,
  onClick,
  tooltip,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
      style={{ color: goldColor }}
    >
      {icon}
    </button>
  );
}
