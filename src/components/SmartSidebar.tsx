/**
 * SmartSidebar.tsx – Smart sidebar with auto-hide, pin, and tabbed content
 *
 * Features:
 *   • Pin mode: sidebar stays open permanently
 *   • Auto-hide mode: sidebar opens on hover near right edge, closes when mouse leaves
 *   • Vertical icon rail always visible when unpinned (collapsed)
 *   • Tabs: נתונים | צילום אוויר | חיפוש מסמכים | כלים | הגדרות
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Database,
  Plane,
  Search,
  Wrench,
  Settings,
  Pin,
  PinOff,
  ChevronRight,
  Upload,
  Layers,
  Info,
  Globe,
  Ruler,
  Clock,
  BarChart3,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { UploadPanel } from "./UploadPanel";
import { DocumentViewer } from "./DocumentViewer";
import type { ParsedGisLayer } from "@/lib/gis-parser";
import { PdfExport } from "./PdfExport";
import { PlanTimeline } from "./PlanTimeline";
import { StatsCharts } from "./StatsCharts";
import { SettingsDialog } from "./SettingsDialog";
import { LayerManager } from "./LayerManager";

// ─── Tab definitions ─────────────────────────────────────────────────────────

export interface SidebarTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const SIDEBAR_TABS: SidebarTab[] = [
  { id: "data", label: "נתונים", icon: <Database className="h-5 w-5" /> },
  { id: "aerial", label: "צילום אוויר", icon: <Plane className="h-5 w-5" /> },
  { id: "search", label: "חיפוש מסמכים", icon: <Search className="h-5 w-5" /> },
  { id: "upload", label: "העלאת קבצים", icon: <Upload className="h-5 w-5" /> },
  { id: "layers", label: "ניהול שכבות", icon: <Layers className="h-5 w-5" /> },
  { id: "timeline", label: "ציר זמן", icon: <Clock className="h-5 w-5" /> },
  { id: "stats", label: "סטטיסטיקה", icon: <BarChart3 className="h-5 w-5" /> },
  { id: "tools", label: "כלים", icon: <Wrench className="h-5 w-5" /> },
  { id: "settings", label: "הגדרות", icon: <Settings className="h-5 w-5" /> },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface SmartSidebarProps {
  onSelectGush: (gush: number) => void;
  onSelectAerialYear: (year: string) => void;
  onSelectPlanImage: (path: string) => void;
  onShowGisLayer?: (layer: ParsedGisLayer | null) => void;
  defaultPinned?: boolean;
}

// ─── Sidebar width constants ─────────────────────────────────────────────────

const RAIL_WIDTH = 48;
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 340;

// ═════════════════════════════════════════════════════════════════════════════
//  SmartSidebar Component
// ═════════════════════════════════════════════════════════════════════════════

export function SmartSidebar({
  onSelectGush,
  onSelectAerialYear,
  onSelectPlanImage,
  onShowGisLayer,
  defaultPinned = true,
}: SmartSidebarProps) {
  const [pinned, setPinned] = useState(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    return saved !== null ? saved === "true" : defaultPinned;
  });
  const [hovered, setHovered] = useState(false);
  const [activeTab, setActiveTab] = useState("data");
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("sidebar-panel-width");
    return saved ? Number(saved) : DEFAULT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist panel width
  useEffect(() => {
    localStorage.setItem("sidebar-panel-width", String(panelWidth));
  }, [panelWidth]);

  // Persist pin state
  useEffect(() => {
    localStorage.setItem("sidebar-pinned", String(pinned));
  }, [pinned]);

  // Determine if the panel content should be visible
  const isOpen = pinned || hovered;

  // ── Mouse handlers for auto-hide ──
  const handleMouseEnter = useCallback(() => {
    if (pinned) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHovered(true), 80);
  }, [pinned]);

  const handleMouseLeave = useCallback(() => {
    if (pinned) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHovered(false), 300);
  }, [pinned]);

  // ── Edge detection – invisible trigger zone when collapsed ──
  useEffect(() => {
    if (pinned) return;

    const handleEdgeMove = (e: MouseEvent) => {
      const fromRight = window.innerWidth - e.clientX;
      if (fromRight < 8 && !hovered) {
        setHovered(true);
      }
    };

    window.addEventListener("mousemove", handleEdgeMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleEdgeMove);
  }, [pinned, hovered]);

  // Color constants
  const goldColor = "hsl(43 56% 52%)";
  const navyColor = "hsl(222.2 47.4% 11.2%)";
  const navyBorder = `1.5px solid ${navyColor}`;

  // ── Resize handler ──
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startWidth + delta)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  // ── Render ──
  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={sidebarRef}
        className={cn(
          "h-full flex flex-row shrink-0 z-40",
          "transition-all ease-in-out",
          !isResizing && "duration-300",
        )}
        style={{
          width: isOpen ? RAIL_WIDTH + panelWidth + 12 : 0,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        dir="rtl"
      >
        {/* ── Resize Handle ── */}
        {isOpen && (
          <div
            className="w-3 h-full flex items-center justify-center cursor-col-resize shrink-0 z-20 group"
            onMouseDown={handleResizeStart}
          >
            <div
              className="w-1 h-10 rounded-full opacity-30 group-hover:opacity-80 transition-opacity"
              style={{ backgroundColor: navyColor }}
            />
          </div>
        )}

        {/* ── Unified sidebar container (rail + panel) ── */}
        <div
          className={cn(
            "h-full flex flex-row overflow-hidden rounded-2xl",
            "transition-all ease-in-out",
            !isResizing && "duration-300",
          )}
          style={{
            border: navyBorder,
            backgroundColor: "hsl(0 0% 100%)",
            opacity: isOpen ? 1 : 0,
          }}
        >
          {/* ── Icon Rail ── */}
          <div
            className="flex flex-col items-center py-2 shrink-0"
            style={{ width: RAIL_WIDTH }}
          >
            {/* Tab icons */}
            <div className="flex-1 flex flex-col items-center gap-1 mt-1">
              {SIDEBAR_TABS.map((tab) => (
                <Tooltip key={tab.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (!pinned) setHovered(true);
                      }}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        "transition-colors relative",
                      )}
                      style={{
                        color: activeTab === tab.id ? "hsl(0 0% 100%)" : goldColor,
                        backgroundColor: activeTab === tab.id ? goldColor : "transparent",
                      }}
                    >
                      {tab.icon}
                      {tab.badge && tab.badge > 0 && (
                        <span className="absolute -top-0.5 -left-0.5 bg-destructive text-destructive-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {tab.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Pin / Unpin button at bottom */}
            <div className="flex flex-col items-center gap-1 mb-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setPinned(!pinned);
                      if (!pinned) setHovered(false);
                    }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                    style={{ color: goldColor }}
                  >
                    {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {pinned ? "בטל נעיצה (אוטו-הסתר)" : "נעץ סיידבר"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* ── Panel Content ── */}
          <div
            className={cn(
              "h-full overflow-hidden flex flex-col",
              "transition-all ease-in-out",
              !isResizing && "duration-300",
            )}
            style={{
              width: panelWidth,
            }}
          >
          {/* Panel header */}
          <div
            className="shrink-0 px-3 py-2 flex items-center justify-between"
            style={{
              borderBottom: navyBorder,
              color: goldColor,
            }}
          >
            <div className="flex items-center gap-2">
              {SIDEBAR_TABS.find((t) => t.id === activeTab)?.icon}
              <span className="font-semibold text-sm">
                {SIDEBAR_TABS.find((t) => t.id === activeTab)?.label}
              </span>
            </div>
            {!pinned && (
              <button
                onClick={() => setHovered(false)}
                className="transition-colors"
                style={{ color: goldColor }}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden sidebar-gold-content" dir="rtl">
            {activeTab === "data" && (
              <DataTab
                onSelectGush={onSelectGush}
                onSelectAerialYear={onSelectAerialYear}
                onSelectPlanImage={onSelectPlanImage}
              />
            )}
            {activeTab === "aerial" && (
              <AerialTab onSelectAerialYear={onSelectAerialYear} />
            )}
            {activeTab === "search" && (
              <SearchTab onSelectPlanImage={onSelectPlanImage} />
            )}
            {activeTab === "upload" && <UploadPanel onShowGisLayer={onShowGisLayer} />}
            {activeTab === "layers" && <LayerManager />}
            {activeTab === "timeline" && <PlanTimeline />}
            {activeTab === "stats" && <StatsCharts />}
            {activeTab === "tools" && <ToolsTab />}
            {activeTab === "settings" && <SettingsTab />}
          </div>
        </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: Data (reuses existing KfarChabadPanel inline)
// ═════════════════════════════════════════════════════════════════════════════

import {
  getAerialYears,
  getGushim,
  getGushParcels,
  getParcelDocuments,
  getDocuments,
  getDocumentStats,
  getConfig,
  documentFileUrl,
  type AerialYearInfo,
  type GushInfo,
  type ParcelInfo,
  type DocumentRecord,
  type DocumentStats,
  type KfarChabadConfig,
} from "@/lib/kfar-chabad-api";

import {
  ChevronDown,
  Download,
  Image,
  FileText,
  File,
  FolderOpen,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── file helpers (reuse) ──
function fileIcon(ft: string) {
  if (ft === "image") return <Image className="h-3.5 w-3.5 text-blue-500" />;
  if (ft === "pdf") return <FileText className="h-3.5 w-3.5 text-red-500" />;
  return <File className="h-3.5 w-3.5 text-muted-foreground" />;
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocRow({ doc, onShowImage, onViewDoc }: { doc: DocumentRecord; onShowImage: (p: string) => void; onViewDoc: (doc: DocumentRecord) => void }) {
  const isImage = doc.file_type === "image";
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-accent group text-right cursor-pointer"
      dir="rtl"
      onClick={() => onViewDoc(doc)}
    >
      {fileIcon(doc.file_type)}
      <span className="flex-1 truncate">{doc.title}</span>
      {doc.is_tashrit === 1 && (
        <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">תשריט</span>
      )}
      {doc.is_georef === 1 && (
        <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">GEO</span>
      )}
      <span className="text-[10px] text-muted-foreground">{formatSize(doc.file_size)}</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {isImage && doc.is_tashrit === 1 && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="הצג על המפה"
            onClick={(e) => {
              e.stopPropagation();
              const rel = doc.file_path.replace(/^\.\/kfar_chabad_data[\\/]plans[\\/]/, "");
              onShowImage(rel);
            }}>
            <MapPin className="h-3 w-3" />
          </Button>
        )}
        <a href={documentFileUrl(doc.id)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="הורד">
            <Download className="h-3 w-3" />
          </Button>
        </a>
      </div>
    </div>
  );
}

// ── Data Tab ──
function DataTab({
  onSelectGush,
  onSelectAerialYear,
  onSelectPlanImage,
}: {
  onSelectGush: (g: number) => void;
  onSelectAerialYear: (y: string) => void;
  onSelectPlanImage: (p: string) => void;
}) {
  const [gushim, setGushim] = useState<GushInfo[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewingDoc, setViewingDoc] = useState<DocumentRecord | null>(null);

  const [expandedGush, setExpandedGush] = useState<number | null>(null);
  const [parcels, setParcels] = useState<ParcelInfo[]>([]);
  const [expandedParcel, setExpandedParcel] = useState<string | null>(null);
  const [parcelDocs, setParcelDocs] = useState<{
    by_plan: { plan_number: string | null; documents: DocumentRecord[] }[];
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [gList, docStats] = await Promise.all([getGushim(), getDocumentStats()]);
      setGushim(gList);
      setStats(docStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }

  const toggleGush = useCallback(
    async (gush: number) => {
      if (expandedGush === gush) {
        setExpandedGush(null);
        setParcels([]);
        setExpandedParcel(null);
        setParcelDocs(null);
        return;
      }
      setExpandedGush(gush);
      setExpandedParcel(null);
      setParcelDocs(null);
      try {
        const p = await getGushParcels(gush);
        setParcels(p);
      } catch {
        setParcels([]);
      }
    },
    [expandedGush],
  );

  const toggleParcel = useCallback(
    async (gush: number, helka: number) => {
      const key = `${gush}_${helka}`;
      if (expandedParcel === key) {
        setExpandedParcel(null);
        setParcelDocs(null);
        return;
      }
      setExpandedParcel(key);
      try {
        const data = await getParcelDocuments(gush, helka);
        setParcelDocs({ by_plan: data.by_plan });
      } catch {
        setParcelDocs(null);
      }
    },
    [expandedParcel],
  );

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        טוען נתונים...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <p className="text-destructive text-sm mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={loadData}>
          נסה שוב
        </Button>
      </div>
    );
  }

  const activeGushim = gushim.filter((g) => g.plan_count > 0 || g.permit_count > 0);
  const emptyGushim = gushim.filter((g) => g.plan_count === 0 && g.permit_count === 0);

  return (
    <>
    <ScrollArea className="h-full" dir="rtl">
      <div className="px-2 py-2 space-y-2 text-right" dir="rtl">
        {/* Stats bar */}
        {stats && (
          <div className="flex gap-2 flex-wrap text-[11px] text-muted-foreground px-1 justify-end" dir="rtl">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {stats.total} מסמכים
            </span>
            <span className="bg-muted px-2 py-0.5 rounded-full">
              {activeGushim.length} גושים פעילים
            </span>
            <span className="bg-muted px-2 py-0.5 rounded-full">
              {stats.tashrit_count} תשריטים
            </span>
          </div>
        )}

        {/* Active gushim */}
        {activeGushim.map((g) => (
          <div key={g.gush} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGush(g.gush)}
              className="w-full flex items-center px-3 py-2 hover:bg-accent text-sm text-right"
              dir="rtl"
            >
              <span className="flex items-center gap-2 shrink-0">
                {expandedGush === g.gush ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="font-medium">גוש {g.gush}</span>
              </span>
              <span className="flex gap-2 text-[11px] text-muted-foreground mr-auto">
                <span>{g.plan_count} תוכניות</span>
                <span>{g.permit_count} היתרים</span>
                <span>{g.parcel_count} חלקות</span>
              </span>
            </button>

            {expandedGush === g.gush && (
              <div className="border-t">
                {parcels.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">אין חלקות</p>
                )}
                {parcels.map((p) => {
                  const pKey = `${p.gush}_${p.helka}`;
                  const isExpanded = expandedParcel === pKey;
                  return (
                    <div key={pKey}>
                      <button
                        onClick={() => toggleParcel(p.gush, p.helka)}
                        className="w-full flex items-center px-4 py-1.5 hover:bg-accent/50 text-xs border-b text-right"
                        dir="rtl"
                      >
                        <span className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <FolderOpen className="h-3.5 w-3.5 text-amber-600" />
                          חלקה {p.helka}
                        </span>
                        <span className="flex gap-2 text-[10px] text-muted-foreground mr-auto">
                          {p.doc_count} מסמכים
                          {p.has_tashrit === 1 && (
                            <span className="bg-blue-100 text-blue-700 px-1 rounded">
                              תשריט
                            </span>
                          )}
                        </span>
                      </button>
                      {isExpanded && parcelDocs && (
                        <div className="bg-muted/20">
                          {parcelDocs.by_plan.length > 0 ? (
                            parcelDocs.by_plan.map((bp, idx) => (
                              <div key={idx} className="border-b last:border-b-0">
                                {bp.plan_number && (
                                  <div className="px-5 py-1 text-[11px] font-medium bg-muted/40 flex items-center gap-1 text-right" dir="rtl">
                                    <FileText className="h-3 w-3 text-primary" />
                                    תוכנית: {bp.plan_number}
                                  </div>
                                )}
                                <div className="divide-y">
                                  {bp.documents.map((doc) => (
                                    <DocRow
                                      key={doc.id}
                                      doc={doc}
                                      onShowImage={onSelectPlanImage}
                                      onViewDoc={setViewingDoc}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-muted-foreground p-3">אין מסמכים זמינים לחלקה זו</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="px-3 py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={() => onSelectGush(g.gush)}
                  >
                    <ArrowRight className="h-3 w-3 ml-1" />
                    הצג גוש {g.gush} במפה
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Empty gushim */}
        {emptyGushim.length > 0 && (
          <div className="border rounded-lg p-2">
            <p className="text-xs text-muted-foreground mb-1">
              גושים ללא מסמכים ({emptyGushim.length}):
            </p>
            <div className="flex flex-wrap gap-1">
              {emptyGushim.map((g) => (
                <Button
                  key={g.gush}
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-6 px-2"
                  onClick={() => onSelectGush(g.gush)}
                >
                  {g.gush}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Detailed stats */}
        {stats && (
          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              סיכום נתונים
            </h3>
            <div className="space-y-1 text-xs">
              {Object.entries(stats.by_category).map(([cat, cnt]) => (
                <div key={cat} className="flex justify-between">
                  <span>{cat === "plans" ? "תוכניות" : "היתרים"}</span>
                  <span className="text-muted-foreground">{cnt}</span>
                </div>
              ))}
              <div className="flex justify-between text-muted-foreground">
                <span>תשריטים</span><span>{stats.tashrit_count}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>עם גיאורפרנס</span><span>{stats.georef_count}</span>
              </div>
              {stats.by_file_type && Object.entries(stats.by_file_type).map(([ft, cnt]) => (
                <div key={ft} className="flex justify-between text-muted-foreground">
                  <span>{ft.toUpperCase()}</span><span>{cnt}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium border-t pt-1 mt-1">
                <span>סה&quot;כ</span><span>{stats.total}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>

    {viewingDoc && (
      <DocumentViewer
        url={documentFileUrl(viewingDoc.id)}
        title={viewingDoc.title}
        fileType={viewingDoc.file_type as "pdf" | "image" | "other"}
        onClose={() => setViewingDoc(null)}
      />
    )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: Aerial
// ═════════════════════════════════════════════════════════════════════════════

function AerialTab({ onSelectAerialYear }: { onSelectAerialYear: (y: string) => void }) {
  const [years, setYears] = useState<AerialYearInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAerialYears().then(setYears).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-center text-muted-foreground text-sm">טוען...</div>;

  return (
    <ScrollArea className="h-full" dir="rtl">
      <div className="px-2 py-2 space-y-2 text-right" dir="rtl">
        {years.length === 0 && (
          <div className="text-center py-8">
            <Plane className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">לא נמצאו צילומי אוויר מקומיים</p>
            <p className="text-xs text-muted-foreground mt-1">
              הורד צילומי אוויר דרך סקריפט ההורדה
            </p>
          </div>
        )}
        {years.map((y) => (
          <div key={y.year} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === y.year ? null : y.year)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-accent text-sm"
            >
              <span className="flex items-center gap-2">
                <Image className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{y.year}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {y.levels.length} רמות
                {expanded === y.year ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </span>
            </button>
            {expanded === y.year && (
              <div className="border-t px-3 py-2 space-y-2">
                {y.levels.map((lv) => (
                  <div key={lv.level} className="flex items-center justify-between text-xs">
                    <span>
                      רמה {lv.level} · {lv.tile_count} אריחים
                      {lv.stitched && " · תמונה מאוחדת"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onSelectAerialYear(y.year)}
                    >
                      <Layers className="h-3 w-3 ml-1" />
                      הצג
                    </Button>
                  </div>
                ))}
                {y.levels[0]?.georef && (
                  <p className="text-[11px] text-muted-foreground">
                    EPSG:2039 · {Math.abs(y.levels[0].georef.pixel_size_x).toFixed(2)} מ&apos;/פיקסל
                  </p>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Upload CTA */}
        <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4 text-center">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">
            בקרוב: העלאת צילומי אוויר ומפות ישירות למערכת
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: Search (documents)
// ═════════════════════════════════════════════════════════════════════════════

function SearchTab({ onSelectPlanImage }: { onSelectPlanImage: (p: string) => void }) {
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState<string>("");
  const [fileType, setFileType] = useState<string>("");
  const [results, setResults] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocumentRecord | null>(null);

  const doSearch = useCallback(async () => {
    if (!searchText.trim() && !category && !fileType) return;
    setSearching(true);
    try {
      const res = await getDocuments({
        search: searchText.trim() || undefined,
        category: category || undefined,
        file_type: fileType || undefined,
        limit: 50,
      });
      setResults(res.documents);
      setTotal(res.total);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setSearching(false);
    }
  }, [searchText, category, fileType]);

  return (
    <div className="h-full flex flex-col text-right" dir="rtl">
      <div className="shrink-0 px-2 pt-2 space-y-2" dir="rtl">
        <div className="flex gap-1">
          <Input
            placeholder="חפש לפי שם, תוכנית, קובץ..."
            className="text-xs h-8"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <Button size="sm" className="h-8 px-3" onClick={doSearch} disabled={searching}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex gap-1">
          <select
            className="flex-1 h-7 rounded-md border bg-background px-2 text-xs"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">כל הקטגוריות</option>
            <option value="plans">תוכניות</option>
            <option value="permits">היתרים</option>
          </select>
          <select
            className="flex-1 h-7 rounded-md border bg-background px-2 text-xs"
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
          >
            <option value="">כל הסוגים</option>
            <option value="pdf">PDF</option>
            <option value="image">תמונה</option>
            <option value="other">אחר</option>
          </select>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2 mt-1">
        {total > 0 && (
          <p className="text-[11px] text-muted-foreground px-1 mb-1">
            {total} תוצאות
          </p>
        )}
        <div className="divide-y border rounded-lg overflow-hidden">
          {results.map((doc) => (
            <div key={doc.id} className="text-xs">
              <div className="px-2 py-0.5 text-[10px] text-muted-foreground bg-muted/30">
                גוש {doc.gush} · חלקה {doc.helka}
                {doc.plan_number && ` · ${doc.plan_number}`}
              </div>
              <DocRow doc={doc} onShowImage={onSelectPlanImage} onViewDoc={setViewingDoc} />
            </div>
          ))}
        </div>
        {results.length === 0 && (searchText || category || fileType) && !searching && (
          <div className="text-center py-6">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">לא נמצאו תוצאות</p>
          </div>
        )}
        {results.length === 0 && !searchText && !category && !fileType && (
          <div className="text-center py-6">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">הזן מילות חיפוש או בחר פילטר</p>
          </div>
        )}
      </ScrollArea>

      {viewingDoc && (
        <DocumentViewer
          url={documentFileUrl(viewingDoc.id)}
          title={viewingDoc.title}
          fileType={viewingDoc.file_type as "pdf" | "image" | "other"}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: Tools
// ═════════════════════════════════════════════════════════════════════════════

function ToolsTab() {
  return (
    <ScrollArea className="h-full" dir="rtl">
      <div className="px-3 py-3 space-y-3 text-right" dir="rtl">
        <p className="text-xs text-muted-foreground">כלים זמינים במפה:</p>

        <ToolCard
          icon={<Ruler className="h-5 w-5 text-blue-500" />}
          title="מדידת מרחקים"
          description="מדוד מרחק וזווית על המפה"
          status="זמין"
          statusColor="text-green-600 bg-green-100"
        />
        <ToolCard
          icon={<Globe className="h-5 w-5 text-green-500" />}
          title="גיאורפרנס"
          description="הצג תשריטים מגיאורפרנס על המפה"
          status="זמין"
          statusColor="text-green-600 bg-green-100"
        />
        <ToolCard
          icon={<Layers className="h-5 w-5 text-purple-500" />}
          title="שכבות מפה"
          description="החלף בין מפת OSM, לוויין, ו-Hybrid"
          status="זמין"
          statusColor="text-green-600 bg-green-100"
        />

        {/* PDF Export – inline */}
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">ייצוא מפה:</p>
        </div>
        <PdfExport />
      </div>
    </ScrollArea>
  );
}

function ToolCard({
  icon,
  title,
  description,
  status,
  statusColor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
  statusColor: string;
}) {
  return (
    <div className="border rounded-lg p-3 hover:bg-accent/30 transition-colors cursor-default">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", statusColor)}>
              {status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  TAB: Settings
// ═════════════════════════════════════════════════════════════════════════════

function SettingsTab() {
  const [config, setConfig] = useState<KfarChabadConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConfig().then(setConfig).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-center text-muted-foreground text-sm">טוען...</div>;

  return (
    <ScrollArea className="h-full" dir="rtl">
      <div className="px-3 py-3 space-y-4 text-right" dir="rtl">
        {/* System info */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-primary" />
            מידע מערכת
          </h3>
          <div className="space-y-1.5 text-xs">
            <InfoRow label="פרויקט" value='כפר חב"ד – מערכת GIS' />
            <InfoRow label="CRS" value="EPSG:2039 (Israel TM Grid)" />
            {config && (
              <>
                <InfoRow
                  label="מרכז (WGS84)"
                  value={`${config.center_wgs84.lat.toFixed(4)}, ${config.center_wgs84.lng.toFixed(4)}`}
                />
                <InfoRow
                  label="מרכז (ITM)"
                  value={`${config.center.x.toLocaleString()}, ${config.center.y.toLocaleString()}`}
                />
                <InfoRow label="גושים" value={String(config.gushim.length)} />
              </>
            )}
          </div>
        </div>

        {/* DB Summary */}
        {config?.db_summary && (
          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-primary" />
              סיכום DB
            </h3>
            <div className="space-y-1 text-xs">
              {Object.entries(config.db_summary).map(([key, val]) => (
                <InfoRow
                  key={key}
                  label={
                    key === "gushim" ? "גושים"
                    : key === "parcels" ? "חלקות"
                    : key === "plans" ? "תוכניות ייחודיות"
                    : key === "documents" ? "מסמכים"
                    : key === "aerial_images" ? "צילומי אוויר"
                    : key === "plan_georef" ? "גיאורפרנס"
                    : key
                  }
                  value={String(val)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Data status */}
        {config?.data_available && (
          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-medium mb-2">סטטוס נתונים</h3>
            <div className="space-y-1 text-xs">
              <StatusRow label="מסד נתונים" ok={config.data_available.database} />
              <StatusRow label="תוכניות" ok={config.data_available.plans} />
              <StatusRow label="צילומי אוויר" ok={config.data_available.aerial} />
            </div>
          </div>
        )}

        {/* Development Tools */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Wrench className="h-4 w-4 text-primary" />
            כלי פיתוח
          </h3>
          <SettingsDialog />
        </div>

        {/* Version */}
        <p className="text-[11px] text-muted-foreground text-center">
          גרסה 2.0.0 · FastAPI + React + Leaflet
        </p>
      </div>
    </ScrollArea>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium" dir="ltr">{value}</span>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
        {ok ? "זמין" : "חסר"}
      </span>
    </div>
  );
}
