import { useEffect, useState, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReverseParcelResult } from "@/lib/geocode";
import { queryPlansAtPoint, type GovMapPlan } from "@/lib/geocode";
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

/** The dialog receives the full ArcGIS result directly */
export type ParcelDialogData = ReverseParcelResult;

interface Props {
  data: ParcelDialogData | null;
  onClose: () => void;
  onShowPlan?: (path: string) => void;
}

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

export function ParcelInfoDialog({ data, onClose, onShowPlan }: Props) {
  const [loadingDb, setLoadingDb] = useState(false);
  const [gushInfo, setGushInfo] = useState<GushInfo | null>(null);
  const [parcelInfo, setParcelInfo] = useState<ParcelInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [govmapPlans, setGovmapPlans] = useState<GovMapPlan[]>([]);
  const [loadingGovmap, setLoadingGovmap] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
      // Fetch GovMap plans spatially
      setLoadingGovmap(true);
      setGovmapPlans([]);
      queryPlansAtPoint(data.lat, data.lng)
        .then(setGovmapPlans)
        .catch(() => {})
        .finally(() => setLoadingGovmap(false));
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
        "fixed inset-y-0 right-0 z-50 w-[420px] sm:w-[460px] bg-background border-l shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full pointer-events-none"
      )}
      dir="rtl"
    >
      {/* ═══ Header ═══ */}
      <div className="px-5 pt-5 pb-3 border-b bg-gradient-to-l from-blue-50 to-white dark:from-blue-950 dark:to-background flex flex-col relative">
        <button
          onClick={onClose}
          className="absolute left-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-600 text-white p-2.5 mt-0.5 shrink-0">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-right text-lg font-bold leading-snug">
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
              <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                {data.lat.toFixed(5)}, {data.lng.toFixed(5)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Body ═══ */}
      <ScrollArea className="flex-1">
        <div className="px-5 py-4 space-y-5">

          {/* ─── ArcGIS Parcel Details (always available) ─── */}
          {data && <ParcelDetails data={data} />}

          <Separator />

          {/* ─── GovMap Plans (live spatial query) ─── */}
          {loadingGovmap ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-sm font-semibold">תוכניות החלות על החלקה</span>
              </div>
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : govmapPlans.length > 0 ? (
            <GovMapPlansSection plans={govmapPlans} />
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-center text-muted-foreground">
              <Layers className="h-5 w-5 mx-auto mb-1 opacity-50" />
              <p className="text-sm">לא נמצאו תוכניות חלות על חלקה זו</p>
            </div>
          )}

          <Separator />

          {/* ─── DB Planning Data ─── */}
          {loadingDb ? (
            <LoadingSkeleton />
          ) : (
              <>
                {/* Quick stats from DB */}
                {(plans.length > 0 || documents.length > 0) && (
                  <QuickStats
                    parcelInfo={parcelInfo}
                    docCount={documents.length}
                    planCount={plans.length}
                  />
                )}

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

                {/* No DB data state */}
                {!loadingDb && documents.length === 0 && plans.length === 0 && (
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

// ── GovMap Plans Section ─────────────────────────────────────────────────────

function govmapStatusColor(statusGroup: string) {
  if (statusGroup === "מאושרת") return "bg-green-100 text-green-800";
  if (statusGroup === "פעילה") return "bg-blue-100 text-blue-800";
  if (statusGroup === "בהפקדה") return "bg-yellow-100 text-yellow-800";
  return "bg-gray-100 text-gray-700";
}

function GovMapPlansSection({ plans }: { plans: GovMapPlan[] }) {
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  // Group by status
  const grouped = plans.reduce<Record<string, GovMapPlan[]>>((acc, p) => {
    const g = p.statusGroup;
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  const groupOrder = ["מאושרת", "פעילה", "בהפקדה"];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold">תוכניות החלות על החלקה</h3>
        <Badge variant="outline" className="text-xs">{plans.length}</Badge>
      </div>

      <div className="space-y-3">
        {groupOrder.map((group) => {
          const items = grouped[group];
          if (!items?.length) return null;
          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge className={`text-[11px] px-2 py-0.5 ${govmapStatusColor(group)}`}>
                  {group} ({items.length})
                </Badge>
              </div>
              <div className="space-y-1.5">
                {items.map((plan) => (
                  <div
                    key={plan.planNumber}
                    className="rounded-lg border bg-card overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setExpandedPlan(
                          expandedPlan === plan.planNumber ? null : plan.planNumber
                        )
                      }
                      className="w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{plan.planNumber}</p>
                        {plan.planName && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {plan.planName}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {plan.status && (
                          <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(plan.status)}`}>
                            {plan.status}
                          </Badge>
                        )}
                        {expandedPlan === plan.planNumber ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {expandedPlan === plan.planNumber && (
                      <div className="border-t px-3 py-2 bg-muted/30 space-y-1 text-xs">
                        {plan.landUse && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">ייעוד קרקע</span>
                            <span className="font-medium text-left max-w-[60%] truncate">{plan.landUse}</span>
                          </div>
                        )}
                        {plan.areaDunam != null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">שטח (דונם)</span>
                            <span className="font-medium">{plan.areaDunam.toLocaleString("he-IL")}</span>
                          </div>
                        )}
                        {plan.authority && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">מוסד תכנון</span>
                            <span className="font-medium">{plan.authority}</span>
                          </div>
                        )}
                        {plan.date && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">תאריך</span>
                            <span className="font-medium">{plan.date}</span>
                          </div>
                        )}
                        <a
                          href={`https://mavat.iplan.gov.il/SV4/1/${plan.planNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-1"
                        >
                          <Globe className="h-3 w-3" />
                          צפייה במאבת
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
