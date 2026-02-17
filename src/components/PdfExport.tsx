/**
 * PdfExport.tsx – Export current map view as PDF
 * Uses html-to-image + jsPDF
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Printer,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PageSize = "a4" | "a3" | "letter";
type Orientation = "landscape" | "portrait";

const PAGE_SIZES: Record<PageSize, { label: string; mm: [number, number] }> = {
  a4: { label: "A4", mm: [210, 297] },
  a3: { label: "A3", mm: [297, 420] },
  letter: { label: "Letter", mm: [216, 279] },
};

export function PdfExport() {
  const [title, setTitle] = useState("כפר חב\"ד – מפה");
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [includeDate, setIncludeDate] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const exportPdf = useCallback(async () => {
    setExporting(true);
    setStatus("idle");
    setErrorMsg("");

    try {
      // Dynamic imports to avoid bundling when not used
      const { toPng } = await import("html-to-image");
      const { default: jsPDF } = await import("jspdf");

      // Find the Leaflet map container
      const mapEl = document.querySelector(".leaflet-container") as HTMLElement | null;
      if (!mapEl) throw new Error("לא נמצא מיכל מפה");

      // Capture map as PNG
      const dataUrl = await toPng(mapEl, {
        cacheBust: true,
        pixelRatio: 2,
        filter: (node: HTMLElement) => {
          // Skip export UI elements and the sidebar
          if (node?.classList?.contains?.("smart-sidebar")) return false;
          if (node?.classList?.contains?.("pdf-export-btn")) return false;
          return true;
        },
      });

      // Create PDF
      const [w, h] = PAGE_SIZES[pageSize].mm;
      const pdfW = orientation === "landscape" ? Math.max(w, h) : Math.min(w, h);
      const pdfH = orientation === "landscape" ? Math.min(w, h) : Math.max(w, h);

      const pdf = new jsPDF({
        orientation,
        unit: "mm",
        format: [pdfW, pdfH],
      });

      const margin = 10;
      const headerH = title ? 12 : 0;
      const footerH = includeDate ? 8 : 0;

      // Title
      if (title) {
        pdf.setFontSize(14);
        // For Hebrew text centering, approximate
        const titleWidth = pdf.getTextWidth(title);
        pdf.text(title, pdfW - margin - titleWidth, margin + 8);
      }

      // Map image
      const imgY = margin + headerH;
      const imgW = pdfW - 2 * margin;
      const imgH = pdfH - imgY - footerH - margin;

      // Calculate aspect ratio
      const mapAspect = mapEl.offsetWidth / mapEl.offsetHeight;
      const pdfAspect = imgW / imgH;

      let drawW = imgW;
      let drawH = imgH;
      let drawX = margin;
      let drawY = imgY;

      if (mapAspect > pdfAspect) {
        // Map is wider → fit to width
        drawH = imgW / mapAspect;
        drawY = imgY + (imgH - drawH) / 2;
      } else {
        // Map is taller → fit to height
        drawW = imgH * mapAspect;
        drawX = margin + (imgW - drawW) / 2;
      }

      pdf.addImage(dataUrl, "PNG", drawX, drawY, drawW, drawH);

      // Border around map
      pdf.setDrawColor(180);
      pdf.setLineWidth(0.3);
      pdf.rect(drawX, drawY, drawW, drawH);

      // Footer
      if (includeDate) {
        pdf.setFontSize(8);
        pdf.setTextColor(120);
        const dateStr = new Date().toLocaleDateString("he-IL");
        const timeStr = new Date().toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        });
        pdf.text(
          `נוצר: ${dateStr} ${timeStr}`,
          pdfW - margin,
          pdfH - margin,
          { align: "right" },
        );
        pdf.text("מידע – מערכת מידע דיגיטלית אורבנית", margin, pdfH - margin);
      }

      // Legend summary
      if (includeLegend) {
        pdf.setFontSize(7);
        pdf.setTextColor(100);
        const legendY = drawY + drawH + 3;
        pdf.text("מקור: מערכת מידע כפר חב\"ד | SDAN / GovMap", margin, legendY);
      }

      // Download
      const fileName = `kfar_chabad_map_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      console.error("PDF export failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "שגיאה בייצוא");
      setStatus("error");
    } finally {
      setExporting(false);
    }
  }, [title, pageSize, orientation, includeDate, includeLegend]);

  const exportImage = useCallback(async () => {
    setExporting(true);
    setStatus("idle");
    try {
      const { toPng } = await import("html-to-image");
      const mapEl = document.querySelector(".leaflet-container") as HTMLElement | null;
      if (!mapEl) throw new Error("לא נמצא מיכל מפה");

      const dataUrl = await toPng(mapEl, {
        cacheBust: true,
        pixelRatio: 2,
        filter: (node: HTMLElement) => {
          if (node?.classList?.contains?.("smart-sidebar")) return false;
          return true;
        },
      });

      const link = document.createElement("a");
      link.download = `kfar_chabad_map_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();

      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "שגיאה");
      setStatus("error");
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div className="px-3 py-3 space-y-4">
      <div>
        <Label className="text-xs">כותרת המפה</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">גודל דף</Label>
          <select
            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSize)}
          >
            {Object.entries(PAGE_SIZES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">כיוון</Label>
          <select
            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation)}
          >
            <option value="landscape">לרוחב</option>
            <option value="portrait">לאורך</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={includeDate}
            onChange={(e) => setIncludeDate(e.target.checked)}
            className="rounded border-input"
          />
          הוסף תאריך ושעה
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={includeLegend}
            onChange={(e) => setIncludeLegend(e.target.checked)}
            className="rounded border-input"
          />
          הוסף שורת מקור/מקרא
        </label>
      </div>

      {/* Export buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="w-full"
          disabled={exporting}
          onClick={exportPdf}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <Printer className="h-4 w-4 ml-2" />
          )}
          ייצוא PDF
        </Button>

        <Button
          variant="outline"
          className="w-full"
          disabled={exporting}
          onClick={exportImage}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <ImageIcon className="h-4 w-4 ml-2" />
          )}
          ייצוא PNG
        </Button>
      </div>

      {/* Status */}
      {status === "success" && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-3 py-2">
          <CheckCircle2 className="h-4 w-4" />
          הקובץ הורד בהצלחה!
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded px-3 py-2">
          <AlertCircle className="h-4 w-4" />
          {errorMsg}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        הייצוא מצלם את תצוגת המפה הנוכחית כולל שכבות פעילות.
        לתוצאה הטובה ביותר, כוון את המפה לפני הייצוא.
      </p>
    </div>
  );
}
