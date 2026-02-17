/**
 * SmartSidebar.tsx Γאף Smart sidebar with auto-hide, pin, and tabbed content
 *
 * Features:
 *   Γאó Pin mode: sidebar stays open permanently
 *   Γאó Auto-hide mode: sidebar opens on hover near right edge, closes when mouse leaves
 *   Γאó Vertical icon rail always visible when unpinned (collapsed)
 *   Γאó Tabs: ╫á╫¬╫ץ╫á╫ש╫¥ | ╫ª╫ש╫£╫ץ╫¥ ╫נ╫ץ╫ץ╫ש╫¿ | ╫ק╫ש╫ñ╫ץ╫⌐ ╫₧╫í╫₧╫¢╫ש╫¥ | ╫¢╫£╫ש╫¥ | ╫פ╫ע╫ף╫¿╫ץ╫¬
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
  ChevronLeft,
  Upload,
  Layers,
  Map,
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
import { KfarChabadPanel } from "./KfarChabadPanel";
import { UploadPanel } from "./UploadPanel";
import { PdfExport } from "./PdfExport";
import { PlanTimeline } from "./PlanTimeline";
import { StatsCharts } from "./StatsCharts";

// ΓפאΓפאΓפא Tab definitions ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא

export interface SidebarTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

const SIDEBAR_TABS: SidebarTab[] = [
  { id: "data", label: "╫á╫¬╫ץ╫á╫ש╫¥", icon: <Database className="h-5 w-5" /> },
  { id: "aerial", label: "╫ª╫ש╫£╫ץ╫¥ ╫נ╫ץ╫ץ╫ש╫¿", icon: <Plane className="h-5 w-5" /> },
  { id: "search", label: "╫ק╫ש╫ñ╫ץ╫⌐ ╫₧╫í╫₧╫¢╫ש╫¥", icon: <Search className="h-5 w-5" /> },
  { id: "upload", label: "╫פ╫ó╫£╫נ╫¬ ╫º╫ס╫ª╫ש╫¥", icon: <Upload className="h-5 w-5" /> },
  { id: "timeline", label: "╫ª╫ש╫¿ ╫צ╫₧╫ƒ", icon: <Clock className="h-5 w-5" /> },
  { id: "stats", label: "╫í╫ר╫ר╫ש╫í╫ר╫ש╫º╫פ", icon: <BarChart3 className="h-5 w-5" /> },
  { id: "tools", label: "╫¢╫£╫ש╫¥", icon: <Wrench className="h-5 w-5" /> },
  { id: "settings", label: "╫פ╫ע╫ף╫¿╫ץ╫¬", icon: <Settings className="h-5 w-5" /> },
];

// ΓפאΓפאΓפא Props ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא

interface SmartSidebarProps {
  onSelectGush: (gush: number) => void;
  onSelectAerialYear: (year: string) => void;
  onSelectPlanImage: (path: string) => void;
  defaultPinned?: boolean;
}

// ΓפאΓפאΓפא Sidebar width constants ΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפאΓפא

const RAIL_WIDTH = 48; // px Γאף icon rail when collapsed
const PANEL_WIDTH = 340; // px Γאף full panel content width

// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ
//  SmartSidebar Component
// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ

export function SmartSidebar({
  onSelectGush,
  onSelectAerialYear,
  onSelectPlanImage,
  defaultPinned = true,
}: SmartSidebarProps) {
  const [pinned, setPinned] = useState(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    return saved !== null ? saved === "true" : defaultPinned;
  });
  const [hovered, setHovered] = useState(false);
  const [activeTab, setActiveTab] = useState("data");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist pin state
  useEffect(() => {
    localStorage.setItem("sidebar-pinned", String(pinned));
  }, [pinned]);

  // Determine if the panel content should be visible
  const isOpen = pinned || hovered;

  // ΓפאΓפא Mouse handlers for auto-hide ΓפאΓפא
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

  // ΓפאΓפא Edge detection Γאף invisible trigger zone when collapsed ΓפאΓפא
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

  // ΓפאΓפא Render ΓפאΓפא
  return (
    <TooltipProvider delayDuration={200}>
      <div
        ref={sidebarRef}
        className={cn(
          "h-full flex flex-row-reverse shrink-0 z-40",
          "transition-all duration-300 ease-in-out",
        )}
        style={{
          width: isOpen ? RAIL_WIDTH + PANEL_WIDTH : RAIL_WIDTH,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        dir="rtl"
      >
        {/* ΓפאΓפא Icon Rail (always visible) ΓפאΓפא */}
        <div
          className={cn(
            "flex flex-col items-center py-2 border-l bg-card/95 backdrop-blur-sm",
            "shrink-0 z-10",
          )}
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
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      "transition-colors relative",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground",
                    )}
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
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    pinned
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {pinned ? "╫ס╫ר╫£ ╫á╫ó╫ש╫ª╫פ (╫נ╫ץ╫ר╫ץ-╫פ╫í╫¬╫¿)" : "╫á╫ó╫Ñ ╫í╫ש╫ש╫ף╫ס╫¿"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ΓפאΓפא Panel Content (slides in/out) ΓפאΓפא */}
        <div
          className={cn(
            "h-full overflow-hidden flex flex-col bg-card border-l",
            "transition-all duration-300 ease-in-out",
          )}
          style={{
            width: isOpen ? PANEL_WIDTH : 0,
            opacity: isOpen ? 1 : 0,
          }}
        >
          {/* Panel header */}
          <div className="shrink-0 border-b px-3 py-2 flex items-center justify-between bg-primary/5">
            <div className="flex items-center gap-2">
              {SIDEBAR_TABS.find((t) => t.id === activeTab)?.icon}
              <span className="font-semibold text-sm">
                {SIDEBAR_TABS.find((t) => t.id === activeTab)?.label}
              </span>
            </div>
            {!pinned && (
              <button
                onClick={() => setHovered(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">
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
            {activeTab === "upload" && <UploadPanel />}
            {activeTab === "timeline" && <PlanTimeline />}
            {activeTab === "stats" && <StatsCharts />}
            {activeTab === "tools" && <ToolsTab />}
            {activeTab === "settings" && <SettingsTab />}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ
//  TAB: Data (reuses existing KfarChabadPanel inline)
// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ

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
  ChevronRight,
  Download,
  Image,
  FileText,
  File,
  FolderOpen,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ΓפאΓפא file helpers (reuse) ΓפאΓפא
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

function DocRow({ doc, onShowImage }: { doc: DocumentRecord; onShowImage: (p: string) => void }) {
  const isImage = doc.file_type === "image";
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-accent group">
      {fileIcon(doc.file_type)}
      <span className="flex-1 truncate">{doc.title}</span>
      {doc.is_tashrit === 1 && (
        <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">╫¬╫⌐╫¿╫ש╫ר</span>
      )}
      {doc.is_georef === 1 && (
        <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">GEO</span>
      )}
      <span className="text-[10px] text-muted-foreground">{formatSize(doc.file_size)}</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {isImage && doc.is_tashrit === 1 && (
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="╫פ╫ª╫ע ╫ó╫£ ╫פ╫₧╫ñ╫פ"
            onClick={() => {
              const rel = doc.file_path.replace(/^\.\/kfar_chabad_data[\\/]plans[\\/]/, "");
              onShowImage(rel);
            }}>
            <MapPin className="h-3 w-3" />
          </Button>
        )}
        <a href={documentFileUrl(doc.id)} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="╫פ╫ץ╫¿╫ף">
            <Download className="h-3 w-3" />
          </Button>
        </a>
      </div>
    </div>
  );
}

// ΓפאΓפא Data Tab ΓפאΓפא
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
      setError(e instanceof Error ? e.message : "╫⌐╫ע╫ש╫נ╫פ ╫ס╫ר╫ó╫ש╫á╫¬ ╫á╫¬╫ץ╫á╫ש╫¥");
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
        ╫ר╫ץ╫ó╫ƒ ╫á╫¬╫ץ╫á╫ש╫¥...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4">
        <p className="text-destructive text-sm mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={loadData}>
          ╫á╫í╫פ ╫⌐╫ץ╫ס
        </Button>
      </div>
    );
  }

  const activeGushim = gushim.filter((g) => g.plan_count > 0 || g.permit_count > 0);
  const emptyGushim = gushim.filter((g) => g.plan_count === 0 && g.permit_count === 0);

  return (
    <ScrollArea className="h-full">
      <div className="px-2 py-2 space-y-2">
        {/* Stats bar */}
        {stats && (
          <div className="flex gap-2 flex-wrap text-[11px] text-muted-foreground px-1">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              {stats.total} ╫₧╫í╫₧╫¢╫ש╫¥
            </span>
            <span className="bg-muted px-2 py-0.5 rounded-full">
              {activeGushim.length} ╫ע╫ץ╫⌐╫ש╫¥ ╫ñ╫ó╫ש╫£╫ש╫¥
            </span>
            <span className="bg-muted px-2 py-0.5 rounded-full">
              {stats.tashrit_count} ╫¬╫⌐╫¿╫ש╫ר╫ש╫¥
            </span>
          </div>
        )}

        {/* Active gushim */}
        {activeGushim.map((g) => (
          <div key={g.gush} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGush(g.gush)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent text-sm"
            >
              <span className="flex items-center gap-2">
                {expandedGush === g.gush ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="font-medium">╫ע╫ץ╫⌐ {g.gush}</span>
              </span>
              <span className="flex gap-2 text-[11px] text-muted-foreground">
                <span>{g.plan_count} ╫¬╫ץ╫¢╫á╫ש╫ץ╫¬</span>
                <span>{g.permit_count} ╫פ╫ש╫¬╫¿╫ש╫¥</span>
                <span>{g.parcel_count} ╫ק╫£╫º╫ץ╫¬</span>
              </span>
            </button>

            {expandedGush === g.gush && (
              <div className="border-t">
                {parcels.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2">╫נ╫ש╫ƒ ╫ק╫£╫º╫ץ╫¬</p>
                )}
                {parcels.map((p) => {
                  const pKey = `${p.gush}_${p.helka}`;
                  const isExpanded = expandedParcel === pKey;
                  return (
                    <div key={pKey}>
                      <button
                        onClick={() => toggleParcel(p.gush, p.helka)}
                        className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-accent/50 text-xs border-b"
                      >
                        <span className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          <FolderOpen className="h-3.5 w-3.5 text-amber-600" />
                          ╫ק╫£╫º╫פ {p.helka}
                        </span>
                        <span className="flex gap-2 text-[10px] text-muted-foreground">
                          {p.doc_count} ╫₧╫í╫₧╫¢╫ש╫¥
                          {p.has_tashrit === 1 && (
                            <span className="bg-blue-100 text-blue-700 px-1 rounded">
                              ╫¬╫⌐╫¿╫ש╫ר
                            </span>
                          )}
                        </span>
                      </button>
                      {isExpanded && parcelDocs && (
                        <div className="bg-muted/20">
                          {parcelDocs.by_plan.map((bp, idx) => (
                            <div key={idx} className="border-b last:border-b-0">
                              {bp.plan_number && (
                                <div className="px-5 py-1 text-[11px] font-medium bg-muted/40 flex items-center gap-1">
                                  <FileText className="h-3 w-3 text-primary" />
                                  ╫¬╫ץ╫¢╫á╫ש╫¬: {bp.plan_number}
                                </div>
                              )}
                              <div className="divide-y">
                                {bp.documents.map((doc) => (
                                  <DocRow
                                    key={doc.id}
                                    doc={doc}
                                    onShowImage={onSelectPlanImage}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
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
                    ╫פ╫ª╫ע ╫ע╫ץ╫⌐ {g.gush} ╫ס╫₧╫ñ╫פ
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
              ╫ע╫ץ╫⌐╫ש╫¥ ╫£╫£╫נ ╫₧╫í╫₧╫¢╫ש╫¥ ({emptyGushim.length}):
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
              ╫í╫ש╫¢╫ץ╫¥ ╫á╫¬╫ץ╫á╫ש╫¥
            </h3>
            <div className="space-y-1 text-xs">
              {Object.entries(stats.by_category).map(([cat, cnt]) => (
                <div key={cat} className="flex justify-between">
                  <span>{cat === "plans" ? "╫¬╫ץ╫¢╫á╫ש╫ץ╫¬" : "╫פ╫ש╫¬╫¿╫ש╫¥"}</span>
                  <span className="text-muted-foreground">{cnt}</span>
                </div>
              ))}
              <div className="flex justify-between text-muted-foreground">
                <span>╫¬╫⌐╫¿╫ש╫ר╫ש╫¥</span><span>{stats.tashrit_count}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>╫ó╫¥ ╫ע╫ש╫נ╫ץ╫¿╫ñ╫¿╫á╫í</span><span>{stats.georef_count}</span>
              </div>
              {stats.by_file_type && Object.entries(stats.by_file_type).map(([ft, cnt]) => (
                <div key={ft} className="flex justify-between text-muted-foreground">
                  <span>{ft.toUpperCase()}</span><span>{cnt}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium border-t pt-1 mt-1">
                <span>╫í╫פ&quot;╫¢</span><span>{stats.total}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ
//  TAB: Aerial
// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ

function AerialTab({ onSelectAerialYear }: { onSelectAerialYear: (y: string) => void }) {
  const [years, setYears] = useState<AerialYearInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAerialYears().then(setYears).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-center text-muted-foreground text-sm">╫ר╫ץ╫ó╫ƒ...</div>;

  return (
    <ScrollArea className="h-full">
      <div className="px-2 py-2 space-y-2">
        {years.length === 0 && (
          <div className="text-center py-8">
            <Plane className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">╫£╫נ ╫á╫₧╫ª╫נ╫ץ ╫ª╫ש╫£╫ץ╫₧╫ש ╫נ╫ץ╫ץ╫ש╫¿ ╫₧╫º╫ץ╫₧╫ש╫ש╫¥</p>
            <p className="text-xs text-muted-foreground mt-1">
              ╫פ╫ץ╫¿╫ף ╫ª╫ש╫£╫ץ╫₧╫ש ╫נ╫ץ╫ץ╫ש╫¿ ╫ף╫¿╫ת ╫í╫º╫¿╫ש╫ñ╫ר ╫פ╫פ╫ץ╫¿╫ף╫פ
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
                {y.levels.length} ╫¿╫₧╫ץ╫¬
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
                      ╫¿╫₧╫פ {lv.level} ┬╖ {lv.tile_count} ╫נ╫¿╫ש╫ק╫ש╫¥
                      {lv.stitched && " ┬╖ ╫¬╫₧╫ץ╫á╫פ ╫₧╫נ╫ץ╫ק╫ף╫¬"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onSelectAerialYear(y.year)}
                    >
                      <Layers className="h-3 w-3 ml-1" />
                      ╫פ╫ª╫ע
                    </Button>
                  </div>
                ))}
                {y.levels[0]?.georef && (
                  <p className="text-[11px] text-muted-foreground">
                    EPSG:2039 ┬╖ {Math.abs(y.levels[0].georef.pixel_size_x).toFixed(2)} ╫₧&apos;/╫ñ╫ש╫º╫í╫£
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
            ╫ס╫º╫¿╫ץ╫ס: ╫פ╫ó╫£╫נ╫¬ ╫ª╫ש╫£╫ץ╫₧╫ש ╫נ╫ץ╫ץ╫ש╫¿ ╫ץ╫₧╫ñ╫ץ╫¬ ╫ש╫⌐╫ש╫¿╫ץ╫¬ ╫£╫₧╫ó╫¿╫¢╫¬
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ
//  TAB: Search (documents)
// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ

function SearchTab({ onSelectPlanImage }: { onSelectPlanImage: (p: string) => void }) {
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState<string>("");
  const [fileType, setFileType] = useState<string>("");
  const [results, setResults] = useState<DocumentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);

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
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-2 pt-2 space-y-2">
        <div className="flex gap-1">
          <Input
            placeholder="╫ק╫ñ╫⌐ ╫£╫ñ╫ש ╫⌐╫¥, ╫¬╫ץ╫¢╫á╫ש╫¬, ╫º╫ץ╫ס╫Ñ..."
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
            <option value="">╫¢╫£ ╫פ╫º╫ר╫ע╫ץ╫¿╫ש╫ץ╫¬</option>
            <option value="plans">╫¬╫ץ╫¢╫á╫ש╫ץ╫¬</option>
            <option value="permits">╫פ╫ש╫¬╫¿╫ש╫¥</option>
          </select>
          <select
            className="flex-1 h-7 rounded-md border bg-background px-2 text-xs"
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
          >
            <option value="">╫¢╫£ ╫פ╫í╫ץ╫ע╫ש╫¥</option>
            <option value="pdf">PDF</option>
            <option value="image">╫¬╫₧╫ץ╫á╫פ</option>
            <option value="other">╫נ╫ק╫¿</option>
          </select>
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2 mt-1">
        {total > 0 && (
          <p className="text-[11px] text-muted-foreground px-1 mb-1">
            {total} ╫¬╫ץ╫ª╫נ╫ץ╫¬
          </p>
        )}
        <div className="divide-y border rounded-lg overflow-hidden">
          {results.map((doc) => (
            <div key={doc.id} className="text-xs">
              <div className="px-2 py-0.5 text-[10px] text-muted-foreground bg-muted/30">
                ╫ע╫ץ╫⌐ {doc.gush} ┬╖ ╫ק╫£╫º╫פ {doc.helka}
                {doc.plan_number && ` ┬╖ ${doc.plan_number}`}
              </div>
              <DocRow doc={doc} onShowImage={onSelectPlanImage} />
            </div>
          ))}
        </div>
        {results.length === 0 && (searchText || category || fileType) && !searching && (
          <div className="text-center py-6">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">╫£╫נ ╫á╫₧╫ª╫נ╫ץ ╫¬╫ץ╫ª╫נ╫ץ╫¬</p>
          </div>
        )}
        {results.length === 0 && !searchText && !category && !fileType && (
          <div className="text-center py-6">
            <Search className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">╫פ╫צ╫ƒ ╫₧╫ש╫£╫ץ╫¬ ╫ק╫ש╫ñ╫ץ╫⌐ ╫נ╫ץ ╫ס╫ק╫¿ ╫ñ╫ש╫£╫ר╫¿</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ
//  TAB: Tools
// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ

function ToolsTab() {
  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">╫¢╫£╫ש╫¥ ╫צ╫₧╫ש╫á╫ש╫¥ ╫ס╫₧╫ñ╫פ:</p>

        <ToolCard
          icon={<Ruler className="h-5 w-5 text-blue-500" />}
          title="╫₧╫ף╫ש╫ף╫¬ ╫₧╫¿╫ק╫º╫ש╫¥"
          description="╫₧╫ף╫ץ╫ף ╫₧╫¿╫ק╫º ╫ץ╫צ╫ץ╫ץ╫ש╫¬ ╫ó╫£ ╫פ╫₧╫ñ╫פ"
          status="╫צ╫₧╫ש╫ƒ"
          statusColor="text-green-600 bg-green-100"
        />
        <ToolCard
          icon={<Globe className="h-5 w-5 text-green-500" />}
          title="╫ע╫ש╫נ╫ץ╫¿╫ñ╫¿╫á╫í"
          description="╫פ╫ª╫ע ╫¬╫⌐╫¿╫ש╫ר╫ש╫¥ ╫₧╫ע╫ש╫נ╫ץ╫¿╫ñ╫¿╫á╫í ╫ó╫£ ╫פ╫₧╫ñ╫פ"
          status="╫צ╫₧╫ש╫ƒ"
          statusColor="text-green-600 bg-green-100"
        />
        <ToolCard
          icon={<Layers className="h-5 w-5 text-purple-500" />}
          title="╫⌐╫¢╫ס╫ץ╫¬ ╫₧╫ñ╫פ"
          description="╫פ╫ק╫£╫ú ╫ס╫ש╫ƒ ╫₧╫ñ╫¬ OSM, ╫£╫ץ╫ץ╫ש╫ש╫ƒ, ╫ץ-Hybrid"
          status="╫צ╫₧╫ש╫ƒ"
          statusColor="text-green-600 bg-green-100"
        />

        {/* PDF Export Γאף inline */}
        <div className="border-t pt-3 mt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">╫ש╫ש╫ª╫ץ╫נ ╫₧╫ñ╫פ:</p>
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

// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ
//  TAB: Settings
// ΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנΓץנ

function SettingsTab() {
  const [config, setConfig] = useState<KfarChabadConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConfig().then(setConfig).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-center text-muted-foreground text-sm">╫ר╫ץ╫ó╫ƒ...</div>;

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-3 space-y-4">
        {/* System info */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-primary" />
            ╫₧╫ש╫ף╫ó ╫₧╫ó╫¿╫¢╫¬
          </h3>
          <div className="space-y-1.5 text-xs">
            <InfoRow label="╫ñ╫¿╫ץ╫ש╫º╫ר" value='╫¢╫ñ╫¿ ╫ק╫ס"╫ף Γאף ╫₧╫ó╫¿╫¢╫¬ GIS' />
            <InfoRow label="CRS" value="EPSG:2039 (Israel TM Grid)" />
            {config && (
              <>
                <InfoRow
                  label="╫₧╫¿╫¢╫צ (WGS84)"
                  value={`${config.center_wgs84.lat.toFixed(4)}, ${config.center_wgs84.lng.toFixed(4)}`}
                />
                <InfoRow
                  label="╫₧╫¿╫¢╫צ (ITM)"
                  value={`${config.center.x.toLocaleString()}, ${config.center.y.toLocaleString()}`}
                />
                <InfoRow label="╫ע╫ץ╫⌐╫ש╫¥" value={String(config.gushim.length)} />
              </>
            )}
          </div>
        </div>

        {/* DB Summary */}
        {config?.db_summary && (
          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-primary" />
              ╫í╫ש╫¢╫ץ╫¥ DB
            </h3>
            <div className="space-y-1 text-xs">
              {Object.entries(config.db_summary).map(([key, val]) => (
                <InfoRow
                  key={key}
                  label={
                    key === "gushim" ? "╫ע╫ץ╫⌐╫ש╫¥"
                    : key === "parcels" ? "╫ק╫£╫º╫ץ╫¬"
                    : key === "plans" ? "╫¬╫ץ╫¢╫á╫ש╫ץ╫¬ ╫ש╫ש╫ק╫ץ╫ף╫ש╫ץ╫¬"
                    : key === "documents" ? "╫₧╫í╫₧╫¢╫ש╫¥"
                    : key === "aerial_images" ? "╫ª╫ש╫£╫ץ╫₧╫ש ╫נ╫ץ╫ץ╫ש╫¿"
                    : key === "plan_georef" ? "╫ע╫ש╫נ╫ץ╫¿╫ñ╫¿╫á╫í"
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
            <h3 className="text-sm font-medium mb-2">╫í╫ר╫ר╫ץ╫í ╫á╫¬╫ץ╫á╫ש╫¥</h3>
            <div className="space-y-1 text-xs">
              <StatusRow label="╫₧╫í╫ף ╫á╫¬╫ץ╫á╫ש╫¥" ok={config.data_available.database} />
              <StatusRow label="╫¬╫ץ╫¢╫á╫ש╫ץ╫¬" ok={config.data_available.plans} />
              <StatusRow label="╫ª╫ש╫£╫ץ╫₧╫ש ╫נ╫ץ╫ץ╫ש╫¿" ok={config.data_available.aerial} />
            </div>
          </div>
        )}

        {/* Version */}
        <p className="text-[11px] text-muted-foreground text-center">
          ╫ע╫¿╫í╫פ 2.0.0 ┬╖ FastAPI + React + Leaflet
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
        {ok ? "╫צ╫₧╫ש╫ƒ" : "╫ק╫í╫¿"}
      </span>
    </div>
  );
}
