import { useEffect, useState, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  FileText,
  ClipboardList,
  Image,
  Globe,
  Layers,
  ChevronDown,
  ChevronUp,
  Ruler,
  Building2,
  MapPinned,
  Shield,
  Calendar,
  Info,
  X,
  Star,
  Bell,
  BellOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReverseParcelResult } from "@/lib/geocode";
import {
  getParcelDocuments,
  getPlans,
  getGush,
  getLocalPlans,
  getLocalFileUrl,
  type GushInfo,
  type ParcelInfo,
  type PlanSummary,
  type DocumentRecord,
  type LocalPlansResponse,
  type TabaOutline,
} from "@/lib/kfar-chabad-api";
import { useFavorites } from "@/hooks/use-favorites";
import { useWatchParcels } from "@/hooks/use-watch-parcels";

// ── Types ────────────────────────────────────────────────────────────────────

/** The dialog receives the full ArcGIS result directly */
export type ParcelDialogData = ReverseParcelResult;

interface Props {
  data: ParcelDialogData | null;
  onClose: () => void;
  onShowPlan?: (path: string) => void;
}

const MIN_DIALOG_WIDTH = 340;
const MAX_DIALOG_WIDTH = 700;
const DEFAULT_DIALOG_WIDTH = 460;

// ── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string }> = {
  "תשריט": { icon: <Image className="h-4 w-4 text-purple-600" />, label: "תשריטים" },
  "תקנון": { icon: <ClipboardList className="h-4 w-4 text-blue-600" />, label: "תקנונים" },
  "נספח": { icon: <FileText className="h-4 w-4 text-green-600" />, label: "נספחים" },
  "הוראות": { icon: <ClipboardList className="h-4 w-4 text-amber-600" />, label: "הוראות" },
  "החלטה": { icon: <FileText className="h-4 w-4 text-red-600" />, label: "החלטות" },
  "גיאורפרנס": { icon: <Globe className="h-4 w-4 text-teal-600" />, label: "גיאורפרנס" },
  "אחר": { icon: <FileText className="h-4 w-4 text-gray-500" />, label: "אחר" },
};

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? CATEGORY_META["אחר"];
}

function formatArea(sqm: number | null): string {
  if (sqm == null) return "—";
  if (sqm >= 10_000) return `${(sqm / 10_000).toFixed(2)} דונם`;
  return `${Math.round(sqm).toLocaleString("he-IL")} מ"ר`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusColor(status: string | null) {
  if (!status) return "bg-gray-100 text-gray-700";
  const s = status.trim();
  if (s.includes("מאושר") || s.includes("תקפה")) return "bg-green-100 text-green-800";
  if (s.includes("הפקדה") || s.includes("מופקדת")) return "bg-yellow-100 text-yellow-800";
  if (s.includes("בוטל")) return "bg-red-100 text-red-800";
  return "bg-blue-100 text-blue-800";
}

// ── Component ────────────────────────────────────────────────────────────────

export function ParcelInfoDialog({ data, onClose, onShowPlan }: Props) {
  const [loadingDb, setLoadingDb] = useState(false);
  const [gushInfo, setGushInfo] = useState<GushInfo | null>(null);
  const [parcelInfo, setParcelInfo] = useState<ParcelInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [localPlansData, setLocalPlansData] = useState<LocalPlansResponse | null>(null);
  const [loadingLocalPlans, setLoadingLocalPlans] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [dialogWidth, setDialogWidth] = useState(() => {
    const saved = localStorage.getItem("parcel-dialog-width");
    return saved ? Number(saved) : DEFAULT_DIALOG_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const { isFavorite, addFavorite, removeFavorite, favorites, isLoggedIn: favLoggedIn } = useFavorites();
  const { isWatching, addWatch, removeWatch, watches, isLoggedIn: watchLoggedIn } = useWatchParcels();

  // Track mobile breakpoint
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  // Persist dialog width
  useEffect(() => {
    localStorage.setItem("parcel-dialog-width", String(dialogWidth));
  }, [dialogWidth]);

  // Resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = dialogWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setDialogWidth(Math.min(MAX_DIALOG_WIDTH, Math.max(MIN_DIALOG_WIDTH, startWidth + delta)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [dialogWidth]);

  // Fetch supplementary DB data (may return empty – that's OK)
  const fetchDbData = useCallback(async (gush: number, helka: number) => {
    setLoadingDb(true);
    setGushInfo(null);
    setParcelInfo(null);
    setDocuments([]);
    setPlans([]);
    setExpandedPlans(new Set());

    try {
      const [gushData, docsData, plansData] = await Promise.all([
        getGush(gush).catch(() => null),
        getParcelDocuments(gush, helka).catch(() => null),
        getPlans(gush).catch(() => null),
      ]);

      if (gushData) {
        setGushInfo(gushData.gush);
        const parcel = gushData.parcels.find((p) => p.helka === helka) ?? null;
        setParcelInfo(parcel);
      }
      if (docsData) setDocuments(docsData.documents);
      if (plansData) setPlans(plansData);
    } catch {
      // DB data is optional – ArcGIS data is still shown
    } finally {
      setLoadingDb(false);
    }
  }, []);

  useEffect(() => {
    if (data) {
      fetchDbData(data.gush, data.helka);
      // Fetch local plans & permits from disk
      setLoadingLocalPlans(true);
      setLocalPlansData(null);
      getLocalPlans(data.gush, data.helka)
        .then(setLocalPlansData)
        .catch(() => {})
        .finally(() => setLoadingLocalPlans(false));
    }
  }, [data, fetchDbData]);

  const togglePlan = (planNumber: string) => {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planNumber)) next.delete(planNumber);
      else next.add(planNumber);
      return next;
    });
  };

  // Group documents by category
  const docsByCategory = documents.reduce<Record<string, DocumentRecord[]>>((acc, d) => {
    const cat = d.category || "אחר";
    (acc[cat] ??= []).push(d);
    return acc;
  }, {});

  const open = data !== null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "fixed z-50 bg-background shadow-2xl flex",
        // Mobile: full-screen bottom sheet
        isMobile
          ? "inset-x-0 bottom-0 top-0 flex-col rounded-t-2xl"
          : "inset-y-0 right-0 flex-row border-l",
        !isResizing && "transition-transform duration-300 ease-in-out",
        open
          ? "translate-x-0 translate-y-0"
          : isMobile
            ? "translate-y-full pointer-events-none"
            : "translate-x-full pointer-events-none"
      )}
      style={isMobile ? undefined : { width: dialogWidth }}
      dir="rtl"
    >
      {/* ═══ Resize Handle (desktop only) ═══ */}
      {!isMobile && (
        <div
          className="w-3 h-full flex items-center justify-center cursor-col-resize shrink-0 group hover:bg-blue-50/50 transition-colors"
          onMouseDown={handleResizeStart}
        >
          <div className="w-1 h-10 rounded-full bg-muted-foreground/30 group-hover:bg-blue-500/60 transition-colors" />
        </div>
      )}

      {/* ═══ Panel Content ═══ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {/* ═══ Header ═══ */}
      <div className={cn(
        "border-b bg-gradient-to-l from-blue-50 to-white dark:from-blue-950 dark:to-background flex flex-col relative shrink-0",
        isMobile ? "px-4 pt-3 pb-2" : "px-5 pt-5 pb-3"
      )}>
        {/* Mobile drag indicator */}
        {isMobile && (
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        <button
          onClick={onClose}
          className={cn(
            "absolute rounded-full opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            isMobile ? "left-3 top-3 p-1.5 bg-muted/50" : "left-4 top-4"
          )}
          aria-label="סגור"
        >
          <X className={isMobile ? "h-5 w-5" : "h-4 w-4"} />
        </button>
        <div className="flex items-start gap-3">
          <div className={cn(
            "rounded-lg bg-blue-600 text-white shrink-0",
            isMobile ? "p-2 mt-0.5" : "p-2.5 mt-0.5"
          )}>
            <MapPin className={isMobile ? "h-4 w-4" : "h-5 w-5"} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={cn(
              "text-right font-bold leading-snug",
              isMobile ? "text-base" : "text-lg"
            )}>
              {data ? `גוש ${data.gush} · חלקה ${data.helka}` : "מידע תכנוני"}
            </h2>
            {data && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {data.status && (
                  <Badge className="text-[11px] bg-green-100 text-green-800">{data.status}</Badge>
                )}
                {data.regionalMunicipality && (
                  <Badge variant="outline" className="text-[11px]">{data.regionalMunicipality}</Badge>
                )}
                {data.region && (
                  <Badge variant="outline" className="text-[11px]">מחוז {data.region}</Badge>
                )}
              </div>
            )}
            {data && (
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
              </p>
            )}
          </div>
        </div>
        {/* Favorite & Watch buttons */}
        {data && (favLoggedIn || watchLoggedIn) && (
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant={isFavorite(data.gush, data.helka) ? "default" : "outline"}
              size="sm"
              className={cn("text-xs gap-1", isMobile ? "h-8 flex-1" : "h-7")}
              onClick={() => {
                if (isFavorite(data.gush, data.helka)) {
                  const fav = favorites.find(f => f.gush === data.gush && f.helka === data.helka);
                  if (fav) removeFavorite(fav.id);
                } else {
                  addFavorite(data.gush, data.helka);
                }
              }}
            >
              <Star className={cn("h-3.5 w-3.5", isFavorite(data.gush, data.helka) && "fill-current")} />
              {isFavorite(data.gush, data.helka) ? "במועדפים" : "הוסף למועדפים"}
            </Button>
            <Button
              variant={isWatching(data.gush, data.helka) ? "default" : "outline"}
              size="sm"
              className={cn("text-xs gap-1", isMobile ? "h-8 flex-1" : "h-7")}
              onClick={() => {
                if (isWatching(data.gush, data.helka)) {
                  const w = watches.find(w => w.gush === data.gush && w.helka === data.helka);
                  if (w) removeWatch(w.id);
                } else {
                  addWatch(data.gush, data.helka);
                }
              }}
            >
              {isWatching(data.gush, data.helka) ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
              {isWatching(data.gush, data.helka) ? "מנוטר" : "עקוב אחרי שינויים"}
            </Button>
          </div>
        )}
      </div>

      {/* ═══ Body ═══ */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className={cn("py-4 space-y-5", isMobile ? "px-4 pb-8" : "px-5")}>

          {/* ─── ArcGIS Parcel Details (always available) ─── */}
          {data && <ParcelDetails data={data} />}

          <Separator />

          {/* ─── Plans, Permits & Documents (unified) ─── */}
          {(loadingLocalPlans || loadingDb) ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-sm font-semibold">תוכניות והיתרים</span>
              </div>
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : (
            <>
              {/* Local plans (DB-powered, primary source) */}
              {localPlansData && (localPlansData.plan_count > 0 || localPlansData.permit_count > 0 || localPlansData.taba_count > 0) && (
                <LocalPlansSection
                  data={localPlansData}
                  onShowPlan={onShowPlan}
                />
              )}

              {/* Supabase fallback plans (when local backend unavailable) */}
              {(!localPlansData || localPlansData.plan_count === 0) && plans.length > 0 && (
                <Section
                  icon={<Layers className="h-4 w-4" />}
                  title="תוכניות"
                  count={plans.length}
                >
                  <div className="space-y-2">
                    {plans.map((plan) => (
                      <PlanCard
                        key={plan.plan_number}
                        plan={plan}
                        expanded={expandedPlans.has(plan.plan_number)}
                        onToggle={() => togglePlan(plan.plan_number)}
                        documents={documents.filter(
                          (d) => d.plan_number === plan.plan_number
                        )}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Documents by category (Supabase fallback) */}
              {(!localPlansData || localPlansData.plan_count === 0) && Object.keys(docsByCategory).length > 0 && (
                <Section
                  icon={<FileText className="h-4 w-4" />}
                  title="מסמכים לפי קטגוריה"
                  count={documents.length}
                >
                  <div className="space-y-3">
                    {Object.entries(docsByCategory).map(([cat, docs]) => {
                      const meta = categoryMeta(cat);
                      return (
                        <div key={cat}>
                          <div className="flex items-center gap-2 mb-1.5">
                            {meta.icon}
                            <span className="text-sm font-medium">{meta.label}</span>
                            <Badge variant="secondary" className="text-xs">
                              {docs.length}
                            </Badge>
                          </div>
                          <div className="space-y-1 mr-6">
                            {docs.map((doc) => (
                              <DocRow key={doc.id} doc={doc} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* No data at all */}
              {(!localPlansData || (localPlansData.plan_count === 0 && localPlansData.permit_count === 0 && localPlansData.taba_count === 0)) && documents.length === 0 && plans.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                  <Info className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">לא נמצאו תוכניות או מסמכים</p>
                  <p className="text-xs mt-1 opacity-75">
                    ייתכן שגוש {data?.gush} אינו במאגר המידע התכנוני המקומי
                  </p>
                </div>
              )}
            </>
          )}
          </div>
        </ScrollArea>
      </div>
      </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** Rich parcel info from ArcGIS Survey of Israel data */
function ParcelDetails({ data }: { data: ParcelDialogData }) {
  const items: { icon: React.ReactNode; label: string; value: string }[] = [];

  // Area
  if (data.legalArea || data.shapeArea) {
    items.push({
      icon: <Ruler className="h-4 w-4 text-orange-600" />,
      label: "שטח רשום",
      value: formatArea(data.legalArea),
    });
    if (data.shapeArea && data.legalArea && Math.abs(data.shapeArea - data.legalArea) > 10) {
      items.push({
        icon: <Ruler className="h-4 w-4 text-orange-400" />,
        label: "שטח מדוד (GIS)",
        value: formatArea(data.shapeArea),
      });
    }
  }

  // Gush/Helka
  items.push({
    icon: <MapPinned className="h-4 w-4 text-blue-600" />,
    label: "גוש / חלקה",
    value: data.gushHelka ?? `${data.gush}/${data.helka}`,
  });

  // Status
  if (data.status) {
    items.push({
      icon: <Shield className="h-4 w-4 text-green-600" />,
      label: "סטטוס רישום",
      value: data.status,
    });
  }

  // Locality
  if (data.locality) {
    items.push({
      icon: <Building2 className="h-4 w-4 text-indigo-600" />,
      label: "ישוב",
      value: data.locality,
    });
  }

  // Regional municipality
  if (data.regionalMunicipality) {
    items.push({
      icon: <Building2 className="h-4 w-4 text-purple-600" />,
      label: "מועצה אזורית",
      value: data.regionalMunicipality,
    });
  }

  // County
  if (data.county) {
    items.push({
      icon: <MapPinned className="h-4 w-4 text-teal-600" />,
      label: "נפה",
      value: data.county,
    });
  }

  // Region
  if (data.region) {
    items.push({
      icon: <Globe className="h-4 w-4 text-sky-600" />,
      label: "מחוז",
      value: data.region,
    });
  }

  // Update date
  if (data.updateDate) {
    const dateStr = data.updateDate.split(" ")[0];
    items.push({
      icon: <Calendar className="h-4 w-4 text-gray-500" />,
      label: "עדכון אחרון",
      value: dateStr,
    });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        פרטי חלקה (מדידות ישראל)
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="shrink-0 mt-0.5">{item.icon}</span>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-tight">{item.label}</p>
              <p className="text-sm font-medium leading-tight">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-5 w-24" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function QuickStats({
  parcelInfo,
  docCount,
  planCount,
}: {
  parcelInfo: ParcelInfo | null;
  docCount: number;
  planCount: number;
}) {
  const stats = [
    {
      label: "תוכניות",
      value: planCount,
      icon: <Layers className="h-4 w-4 text-blue-600" />,
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "מסמכים",
      value: docCount,
      icon: <FileText className="h-4 w-4 text-green-600" />,
      bg: "bg-green-50 dark:bg-green-950",
    },
    {
      label: "תשריטים",
      value: parcelInfo?.has_tashrit ?? 0,
      icon: <Image className="h-4 w-4 text-purple-600" />,
      bg: "bg-purple-50 dark:bg-purple-950",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded-lg p-3 text-center ${s.bg} border`}
        >
          <div className="flex justify-center mb-1">{s.icon}</div>
          <div className="text-xl font-bold">{s.value}</div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="text-xs">
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function PlanCard({
  plan,
  expanded,
  onToggle,
  documents,
}: {
  plan: PlanSummary;
  expanded: boolean;
  onToggle: () => void;
  documents: DocumentRecord[];
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid hsl(222.2 47.4% 11.2%)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-right hover:bg-accent/50 transition-colors"
      >
        <div className="shrink-0 w-1 h-8 rounded-full" style={{ backgroundColor: 'hsl(43 56% 52%)' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'hsl(222.2 47.4% 11.2%)' }}>{plan.plan_number}</p>
          {plan.plan_name && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {plan.plan_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {plan.status && (
            <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(plan.status)}`}>
              {plan.status}
            </Badge>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4" style={{ color: 'hsl(43 56% 52%)' }} />
          ) : (
            <ChevronDown className="h-4 w-4" style={{ color: 'hsl(43 56% 52%)' }} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 py-2 bg-muted/30 space-y-1" style={{ borderTop: '1px solid hsl(222.2 47.4% 11.2% / 0.2)' }}>
          {plan.plan_type && (
            <p className="text-xs text-muted-foreground">סוג: {plan.plan_type}</p>
          )}
          {documents.length > 0 ? (
            <div className="space-y-1 mt-1">
              {documents.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">אין מסמכים קשורים</p>
          )}
        </div>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: DocumentRecord }) {
  const meta = categoryMeta(doc.category);
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent/40 transition-colors">
      <span className="shrink-0">{meta.icon}</span>
      <span className="flex-1 text-xs truncate">{doc.title || doc.file_name}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">
        {formatFileSize(doc.file_size)}
      </span>
      {doc.is_tashrit === 1 && (
        <Badge className="text-[10px] px-1 py-0 bg-purple-100 text-purple-700">
          תשריט
        </Badge>
      )}
      {doc.is_georef === 1 && (
        <Badge className="text-[10px] px-1 py-0 bg-teal-100 text-teal-700">
          GIS
        </Badge>
      )}
    </div>
  );
}

// ── Local Plans & Permits Section ─────────────────────────────────────────────

function fileTypeIcon(type: string) {
  switch (type) {
    case "pdf": return <FileText className="h-3.5 w-3.5 text-red-500" />;
    case "jpg": case "jpeg": case "png": case "tif": case "tiff":
      return <Image className="h-3.5 w-3.5 text-purple-500" />;
    default: return <FileText className="h-3.5 w-3.5 text-gray-400" />;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LocalPlansSection({
  data,
  onShowPlan,
}: {
  data: LocalPlansResponse;
  onShowPlan?: (path: string) => void;
}) {
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Plans */}
      {data.plans.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold">תוכניות החלות על החלקה</h3>
            <Badge variant="outline" className="text-xs">{data.plans.length}</Badge>
          </div>

          <div className="space-y-1.5">
            {data.plans.map((plan) => {
              const isExpanded = expandedPlan === plan.plan_name;
              return (
                <div
                  key={plan.plan_name}
                  className="rounded-2xl overflow-hidden"
                  style={{ border: '1.5px solid hsl(222.2 47.4% 11.2%)' }}
                >
                  <button
                    onClick={() =>
                      setExpandedPlan(isExpanded ? null : plan.plan_name)
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-accent/50 transition-colors"
                  >
                    <div className="shrink-0 w-1 h-8 rounded-full" style={{ backgroundColor: 'hsl(43 56% 52%)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'hsl(222.2 47.4% 11.2%)' }}>{plan.plan_name}</p>
                      {plan.plan_display_name && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {plan.plan_display_name}
                        </p>
                      )}
                      {!plan.plan_display_name && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {plan.file_count} קבצים
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {plan.main_status && (
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(plan.main_status)}`}>
                          {plan.main_status}
                        </Badge>
                      )}
                      {plan.has_tashrit && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700">
                          תשריט
                        </Badge>
                      )}
                      {plan.has_takanon && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">
                          תקנון
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" style={{ color: 'hsl(43 56% 52%)' }} />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" style={{ color: 'hsl(43 56% 52%)' }} />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 py-2 bg-muted/30 space-y-2" style={{ borderTop: '1px solid hsl(222.2 47.4% 11.2% / 0.2)' }}>
                      {/* Plan metadata */}
                      {(plan.entity_subtype || plan.authority || plan.area_dunam || plan.status_date) && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-2 pb-2 border-b">
                          {plan.entity_subtype && (
                            <>
                              <span className="text-muted-foreground">סוג תוכנית</span>
                              <span className="font-medium">{plan.entity_subtype}</span>
                            </>
                          )}
                          {plan.authority && (
                            <>
                              <span className="text-muted-foreground">סמכות</span>
                              <span className="font-medium">{plan.authority}</span>
                            </>
                          )}
                          {plan.area_dunam != null && (
                            <>
                              <span className="text-muted-foreground">שטח</span>
                              <span className="font-medium">{plan.area_dunam} דונם</span>
                            </>
                          )}
                          {plan.status_date && (
                            <>
                              <span className="text-muted-foreground">תאריך סטטוס</span>
                              <span className="font-medium">{plan.status_date}</span>
                            </>
                          )}
                          {plan.city_county && (
                            <>
                              <span className="text-muted-foreground">ישוב</span>
                              <span className="font-medium">{plan.city_county}</span>
                            </>
                          )}
                        </div>
                      )}
                      {plan.goals && (
                        <p className="text-[11px] text-muted-foreground mb-2 pb-2 border-b leading-relaxed">
                          {plan.goals}
                        </p>
                      )}
                      {/* Files */}
                      {plan.files.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-[11px] text-muted-foreground font-medium">{plan.file_count} קבצים:</p>
                          {plan.files.map((file) => (
                            <div
                              key={file.path}
                              className="flex items-center gap-2 py-0.5"
                            >
                              {fileTypeIcon(file.type)}
                              <a
                                href={getLocalFileUrl(file.path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex-1 min-w-0 truncate"
                              >
                                {file.title || file.name}
                              </a>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {formatBytes(file.size)}
                              </span>
                              {(file.type === "jpg" || file.type === "jpeg" || file.type === "png") && onShowPlan && (
                                <button
                                  onClick={() => onShowPlan(file.path)}
                                  className="text-[10px] text-teal-600 hover:underline shrink-0"
                                >
                                  הצג במפה
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">אין קבצים זמינים</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TABA Outlines */}
      {data.taba_outlines && data.taba_outlines.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="h-4 w-4 text-teal-600" />
            <h3 className="text-sm font-semibold">קווי תב&quot;ע</h3>
            <Badge variant="outline" className="text-xs">{data.taba_outlines.length}</Badge>
          </div>

          <div className="space-y-1.5">
            {data.taba_outlines.map((taba: TabaOutline, i: number) => (
              <div key={taba.pl_number || i} className="rounded-2xl bg-card p-2.5" style={{ border: '1.5px solid hsl(222.2 47.4% 11.2%)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {taba.pl_number || "ללא מספר"}
                    </p>
                    {taba.pl_name && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {taba.pl_name}
                      </p>
                    )}
                  </div>
                  {taba.status && (
                    <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor(taba.status)}`}>
                      {taba.status}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground">
                  {taba.entity_subtype && <span>{taba.entity_subtype}</span>}
                  {taba.area_dunam != null && <span>{taba.area_dunam} דונם</span>}
                  {taba.land_use && <span className="truncate max-w-[200px]">{taba.land_use}</span>}
                </div>
                {taba.pl_url && (
                  <a
                    href={taba.pl_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-600 hover:underline mt-1 inline-block"
                  >
                    צפייה באתר iPlan ←
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permits */}
      {data.permits.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">היתרי בנייה</h3>
            <Badge variant="outline" className="text-xs">{data.permits.length}</Badge>
          </div>

          <div className="space-y-1.5">
            {data.permits.map((permit) => {
              const isExpanded = expandedPlan === `permit-${permit.permit_id}`;
              return (
                <div
                  key={permit.permit_id}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedPlan(
                        isExpanded ? null : `permit-${permit.permit_id}`
                      )
                    }
                    className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">היתר {permit.permit_id}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {permit.file_count} קבצים
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t px-3 py-2 bg-muted/30 space-y-1">
                      {permit.files.map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center gap-2 py-0.5"
                        >
                          {fileTypeIcon(file.type)}
                          <a
                            href={getLocalFileUrl(file.path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex-1 min-w-0 truncate"
                          >
                            {file.name}
                          </a>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatBytes(file.size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Parcel detail from DB */}
      {data.parcel_detail && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold">פרטי חלקה (מאגר מקומי)</h3>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs rounded-lg border p-3 bg-card">
            {data.parcel_detail.legal_area_sqm != null && (
              <>
                <span className="text-muted-foreground">שטח רשום</span>
                <span className="font-medium">{formatArea(data.parcel_detail.legal_area_sqm)}</span>
              </>
            )}
            {data.parcel_detail.status_text && (
              <>
                <span className="text-muted-foreground">סטטוס</span>
                <span className="font-medium">{data.parcel_detail.status_text}</span>
              </>
            )}
            {data.parcel_detail.municipality && (
              <>
                <span className="text-muted-foreground">מועצה</span>
                <span className="font-medium">{data.parcel_detail.municipality}</span>
              </>
            )}
            {data.parcel_detail.county && (
              <>
                <span className="text-muted-foreground">נפה</span>
                <span className="font-medium">{data.parcel_detail.county}</span>
              </>
            )}
            {data.parcel_detail.region && (
              <>
                <span className="text-muted-foreground">מחוז</span>
                <span className="font-medium">{data.parcel_detail.region}</span>
              </>
            )}
            {data.parcel_detail.plan_count > 0 && (
              <>
                <span className="text-muted-foreground">תוכניות</span>
                <span className="font-medium">{data.parcel_detail.plan_count}</span>
              </>
            )}
            {data.parcel_detail.doc_count > 0 && (
              <>
                <span className="text-muted-foreground">מסמכים</span>
                <span className="font-medium">{data.parcel_detail.doc_count}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
