/**
 * PlanTimeline.tsx – Visual timeline of plans by gush
 * Uses recharts for horizontal timeline visualization
 */

import { useState, useEffect, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPlans, getPlanDetail, documentFileUrl, documentStorageUrl, isBackendAvailable, type PlanSummary, type DocumentRecord } from "@/lib/kfar-chabad-api";

/* ------------------------------------------------------------------ */
/*  Plan Timeline Component                                           */
/* ------------------------------------------------------------------ */

interface PlanTimelineProps {
  onSelectGush?: (gush: number) => void;
}

export function PlanTimeline({ onSelectGush }: PlanTimelineProps) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterGush, setFilterGush] = useState<number | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [planDocs, setPlanDocs] = useState<Record<string, DocumentRecord[]>>({});
  const [loadingDocs, setLoadingDocs] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    setError("");
    try {
      const data = await getPlans();
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת תוכניות");
    } finally {
      setLoading(false);
    }
  }

  // Extract unique gush numbers from plans
  const gushNumbers = useMemo(() => {
    const gushSet = new Set<number>();
    plans.forEach((p) => {
      if (p.gush_list) {
        p.gush_list.split(",").forEach((g) => {
          const num = parseInt(g.trim());
          if (!isNaN(num)) gushSet.add(num);
        });
      }
    });
    return Array.from(gushSet).sort();
  }, [plans]);

  // Filter plans
  const filteredPlans = useMemo(() => {
    if (!filterGush) return plans;
    return plans.filter((p) => {
      if (!p.gush_list) return false;
      return p.gush_list.split(",").some((g) => parseInt(g.trim()) === filterGush);
    });
  }, [plans, filterGush]);

  // Group by plan type
  const grouped = useMemo(() => {
    const groups: Record<string, PlanSummary[]> = {};
    filteredPlans.forEach((p) => {
      const type = p.plan_type || "לא מסווג";
      if (!groups[type]) groups[type] = [];
      groups[type].push(p);
    });
    return groups;
  }, [filteredPlans]);

  async function toggleExpand(planNumber: string) {
    if (expandedPlan === planNumber) {
      setExpandedPlan(null);
      return;
    }
    setExpandedPlan(planNumber);
    if (!planDocs[planNumber]) {
      setLoadingDocs(planNumber);
      try {
        const detail = await getPlanDetail(planNumber);
        setPlanDocs((prev) => ({ ...prev, [planNumber]: detail.documents }));
      } catch { /* ignore */ }
      setLoadingDocs(null);
    }
  }

  // Status color
  function statusColor(status: string | null) {
    if (!status) return "bg-gray-100 text-gray-600";
    const s = status.toLowerCase();
    if (s.includes("אושר") || s.includes("approved") || s.includes("תקף"))
      return "bg-green-100 text-green-700";
    if (s.includes("הפקד") || s.includes("deposit"))
      return "bg-blue-100 text-blue-700";
    if (s.includes("בתהליך") || s.includes("process"))
      return "bg-yellow-100 text-yellow-700";
    if (s.includes("ביטול") || s.includes("cancel"))
      return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  }

  // Plan type icon color
  function typeColor(type: string) {
    if (type.includes("מתאר") || type.includes("outline")) return "border-blue-400";
    if (type.includes("מפורט") || type.includes("detail")) return "border-green-400";
    if (type.includes("נקוד") || type.includes("point")) return "border-orange-400";
    return "border-gray-300";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={loadPlans}>
          נסה שוב
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filter bar */}
      <div className="px-3 py-2 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            className="flex-1 h-7 rounded-md border bg-background px-2 text-xs"
            value={filterGush ?? ""}
            onChange={(e) => setFilterGush(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">כל הגושים ({plans.length} תוכניות)</option>
            {gushNumbers.map((g) => (
              <option key={g} value={g}>
                גוש {g}
              </option>
            ))}
          </select>
        </div>

        {/* Summary stats */}
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span>{filteredPlans.length} תוכניות</span>
          <span>•</span>
          <span>{Object.keys(grouped).length} סוגים</span>
          <span>•</span>
          <span>
            {filteredPlans.reduce((s, p) => s + (p.doc_count || 0), 0)} מסמכים
          </span>
        </div>
      </div>

      {/* Timeline content */}
      <ScrollArea className="flex-1">
        <div className="px-3 py-2 space-y-4">
          {Object.entries(grouped).map(([type, typePlans]) => (
            <div key={type}>
              {/* Type header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-3 h-3 rounded-full border-2", typeColor(type))} />
                <span className="text-xs font-medium">{type}</span>
                <span className="text-[10px] text-muted-foreground">
                  ({typePlans.length})
                </span>
              </div>

              {/* Plans in type */}
              <div className="relative mr-1.5 border-r-2 border-muted pr-3 space-y-2">
                {typePlans.map((plan, idx) => (
                  <div key={plan.plan_number} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute -right-[19px] top-2 w-2.5 h-2.5 rounded-full bg-background border-2 border-primary" />

                    {/* Plan card */}
                    <div
                      className={cn(
                        "rounded-lg border bg-card p-2.5 cursor-pointer transition-colors",
                        "hover:border-primary/50 hover:bg-accent/30",
                        expandedPlan === plan.plan_number && "border-primary bg-accent/20",
                      )}
                      onClick={() => toggleExpand(plan.plan_number)}
                    >
                      {/* Plan header */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" dir="ltr">
                            {plan.plan_number}
                          </p>
                          {plan.plan_name && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {plan.plan_name}
                            </p>
                          )}
                        </div>
                        {expandedPlan === plan.plan_number ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {plan.status && (
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full",
                              statusColor(plan.status),
                            )}
                          >
                            {plan.status}
                          </span>
                        )}
                        {plan.doc_count > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {plan.doc_count} מסמכים
                          </span>
                        )}
                        {plan.gush_list && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            גושים: {plan.gush_list}
                          </span>
                        )}
                      </div>

                      {/* Navigate to gush buttons */}
                      {onSelectGush && plan.gush_list && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {plan.gush_list.split(",").map((g) => {
                            const gNum = parseInt(g.trim());
                            if (isNaN(gNum)) return null;
                            return (
                              <Button
                                key={gNum}
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1.5 text-[10px] text-primary hover:text-primary/80"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectGush(gNum);
                                }}
                              >
                                <MapPin className="h-2.5 w-2.5 ml-0.5" />
                                גוש {gNum}
                              </Button>
                            );
                          })}
                        </div>
                      )}

                      {/* Expanded: documents */}
                      {expandedPlan === plan.plan_number && (
                        <div className="mt-2 pt-2 border-t space-y-1">
                          {loadingDocs === plan.plan_number ? (
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              טוען מסמכים...
                            </div>
                          ) : planDocs[plan.plan_number]?.length ? (
                            planDocs[plan.plan_number].map((doc) => (
                              <a
                                key={doc.id}
                                href={isBackendAvailable() ? documentFileUrl(doc.id) : documentStorageUrl(doc.file_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-primary py-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate">{doc.title || doc.file_name}</span>
                                <ExternalLink className="h-3 w-3 shrink-0 mr-auto" />
                              </a>
                            ))
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              אין מסמכים פרטניים
                            </p>
                          )}

                          {plan.notes && (
                            <p className="text-[10px] text-muted-foreground italic mt-1">
                              {plan.notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {filteredPlans.length === 0 && (
            <div className="text-center py-8">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">
                לא נמצאו תוכניות
                {filterGush ? ` לגוש ${filterGush}` : ""}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
