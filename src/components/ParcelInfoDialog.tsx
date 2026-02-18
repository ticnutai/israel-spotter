import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  FileText,
  ClipboardList,
  Image,
  Globe,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
} from "lucide-react";
import {
  getParcelDocuments,
  getPlans,
  getGush,
  type GushInfo,
  type ParcelInfo,
  type PlanSummary,
  type DocumentRecord,
} from "@/lib/kfar-chabad-api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParcelDialogData {
  gush: number;
  helka: number;
  lat: number;
  lng: number;
}

interface Props {
  data: ParcelDialogData | null;
  onClose: () => void;
}

// ── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  "תשריט": { icon: <Image className="h-4 w-4" />, label: "תשריטים", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  "תקנון": { icon: <ClipboardList className="h-4 w-4" />, label: "תקנונים", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  "נספח": { icon: <FileText className="h-4 w-4" />, label: "נספחים", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  "הוראות": { icon: <ClipboardList className="h-4 w-4" />, label: "הוראות", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  "החלטה": { icon: <FileText className="h-4 w-4" />, label: "החלטות", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  "גיאורפרנס": { icon: <Globe className="h-4 w-4" />, label: "גיאורפרנס", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  "אחר": { icon: <FileText className="h-4 w-4" />, label: "אחר", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200" },
};

function categoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? CATEGORY_META["אחר"];
}

function formatFileSize(kb: number) {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
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

export function ParcelInfoDialog({ data, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [gushInfo, setGushInfo] = useState<GushInfo | null>(null);
  const [parcelInfo, setParcelInfo] = useState<ParcelInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async (gush: number, helka: number) => {
    setLoading(true);
    setGushInfo(null);
    setParcelInfo(null);
    setDocuments([]);
    setPlans([]);
    setExpandedPlans(new Set());

    try {
      const [gushData, docsData, plansData] = await Promise.all([
        getGush(gush),
        getParcelDocuments(gush, helka),
        getPlans(gush),
      ]);

      setGushInfo(gushData.gush);
      const parcel = gushData.parcels.find((p) => p.helka === helka) ?? null;
      setParcelInfo(parcel);
      setDocuments(docsData.documents);
      setPlans(plansData);
    } catch (err) {
      console.error("Failed to fetch parcel info:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (data) {
      fetchData(data.gush, data.helka);
    }
  }, [data, fetchData]);

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
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[460px] p-0 flex flex-col"
        dir="rtl"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-l from-blue-50 to-white dark:from-blue-950 dark:to-background">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-600 text-white p-2 mt-0.5 shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-right text-lg font-bold leading-snug">
                {data ? `גוש ${data.gush} · חלקה ${data.helka}` : "מידע תכנוני"}
              </SheetTitle>
              {gushInfo && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {gushInfo.name || "כפר חב״ד"} · {gushInfo.area_type || "מגורים"}
                </p>
              )}
              {data && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            {loading ? (
              <LoadingSkeleton />
            ) : (
              <>
                {/* Quick stats */}
                <QuickStats
                  parcelInfo={parcelInfo}
                  docCount={documents.length}
                  planCount={plans.length}
                />

                {/* Plans section */}
                {plans.length > 0 && (
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

                {/* Documents by category */}
                {Object.keys(docsByCategory).length > 0 && (
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

                {/* Empty state */}
                {!loading && documents.length === 0 && plans.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">לא נמצא מידע תכנוני עבור חלקה זו</p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      {/* Section skeleton */}
      <Skeleton className="h-5 w-24" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-5 w-32" />
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
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
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-right hover:bg-accent/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{plan.plan_number}</p>
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
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 bg-muted/30 space-y-1">
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
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent/40 transition-colors group">
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
