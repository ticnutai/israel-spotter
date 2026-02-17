/**
 * KfarChabadPanel.tsx – Sidebar panel for Kfar Chabad GIS
 *
 * Hierarchical navigation:  גוש → חלקה → תוכנית → מסמכים
 * Tabs: גושים | צילומי אוויר | חיפוש
 */

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Plane,
  FileText,
  MapPin,
  ChevronDown,
  ChevronRight,
  Download,
  Image,
  Database,
  Search,
  ArrowRight,
  File,
  FolderOpen,
} from "lucide-react";
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

interface KfarChabadPanelProps {
  onSelectGush: (gush: number) => void;
  onSelectAerialYear: (year: string) => void;
  onSelectPlanImage: (path: string) => void;
}

// ─── File-type helpers ───────────────────────────────────────────────────────

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

// ─── Document row ────────────────────────────────────────────────────────────

function DocRow({
  doc,
  onShowImage,
}: {
  doc: DocumentRecord;
  onShowImage: (path: string) => void;
}) {
  const isImage = doc.file_type === "image";
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-accent group">
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
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            title="הצג על המפה"
            onClick={() => {
              const rel = doc.file_path
                .replace(/^\.\/kfar_chabad_data[\\/]plans[\\/]/, "");
              onShowImage(rel);
            }}
          >
            <MapPin className="h-3 w-3" />
          </Button>
        )}
        <a href={documentFileUrl(doc.id)} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="הורד">
            <Download className="h-3 w-3" />
          </Button>
        </a>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Main Panel
// ═════════════════════════════════════════════════════════════════════════════

export function KfarChabadPanel({
  onSelectGush,
  onSelectAerialYear,
  onSelectPlanImage,
}: KfarChabadPanelProps) {
  const [config, setConfig] = useState<KfarChabadConfig | null>(null);
  const [aerialYears, setAerialYears] = useState<AerialYearInfo[]>([]);
  const [gushim, setGushim] = useState<GushInfo[]>([]);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Gush drill-down state
  const [expandedGush, setExpandedGush] = useState<number | null>(null);
  const [parcels, setParcels] = useState<ParcelInfo[]>([]);
  const [expandedParcel, setExpandedParcel] = useState<string | null>(null); // "gush_helka"
  const [parcelDocs, setParcelDocs] = useState<{
    by_plan: { plan_number: string | null; documents: DocumentRecord[] }[];
  } | null>(null);

  // Aerial expand
  const [expandedYear, setExpandedYear] = useState<string | null>(null);

  // Search
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentRecord[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);

  // ── Initial load ──
  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [cfg, years, gList, docStats] = await Promise.all([
        getConfig(),
        getAerialYears(),
        getGushim(),
        getDocumentStats(),
      ]);
      setConfig(cfg);
      setAerialYears(years);
      setGushim(gList);
      setStats(docStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת נתונים מהשרת");
    } finally {
      setLoading(false);
    }
  }

  // ── Gush expand ──
  const toggleGush = useCallback(async (gush: number) => {
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
  }, [expandedGush]);

  // ── Parcel expand ──
  const toggleParcel = useCallback(async (gush: number, helka: number) => {
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
  }, [expandedParcel]);

  // ── Search ──
  const doSearch = useCallback(async () => {
    if (!searchText.trim()) return;
    setSearching(true);
    try {
      const res = await getDocuments({ search: searchText.trim(), limit: 50 });
      setSearchResults(res.documents);
      setSearchTotal(res.total);
    } catch {
      setSearchResults([]);
      setSearchTotal(0);
    } finally {
      setSearching(false);
    }
  }, [searchText]);

  // ── Render ──
  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm" dir="rtl">
        טוען נתונים מהשרת...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4" dir="rtl">
        <p className="text-destructive text-sm mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={loadAll}>נסה שוב</Button>
      </div>
    );
  }

  // Only show gushim that have data
  const activeGushim = gushim.filter(g => g.plan_count > 0 || g.permit_count > 0);
  const emptyGushim = gushim.filter(g => g.plan_count === 0 && g.permit_count === 0);

  return (
    <div className="h-full flex flex-col bg-card" dir="rtl">
      {/* Header */}
      <div className="border-b p-3 flex items-center gap-2 bg-primary/5">
        <MapPin className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-semibold text-sm">כפר חב&quot;ד – מערכת GIS</h2>
          {stats && (
            <p className="text-xs text-muted-foreground">
              {stats.total} מסמכים · {activeGushim.length} גושים פעילים ·{" "}
              {aerialYears.length} שנות צילום
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="gushim" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-3 m-2 shrink-0">
          <TabsTrigger value="gushim" className="gap-1 text-xs">
            <Database className="h-3.5 w-3.5" />
            גושים
          </TabsTrigger>
          <TabsTrigger value="aerial" className="gap-1 text-xs">
            <Plane className="h-3.5 w-3.5" />
            צילום אוויר
          </TabsTrigger>
          <TabsTrigger value="search" className="gap-1 text-xs">
            <Search className="h-3.5 w-3.5" />
            חיפוש
          </TabsTrigger>
        </TabsList>

        {/* ━━━ Gushim tab ━━━ */}
        <TabsContent value="gushim" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full px-2 pb-2">
            {/* Active gushim */}
            {activeGushim.map((g) => (
              <div key={g.gush} className="border rounded-lg mb-2 overflow-hidden">
                {/* Gush header */}
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
                    <span className="font-medium">גוש {g.gush}</span>
                  </span>
                  <span className="flex gap-2 text-[11px] text-muted-foreground">
                    <span>{g.plan_count} תוכניות</span>
                    <span>{g.permit_count} היתרים</span>
                    <span>{g.parcel_count} חלקות</span>
                  </span>
                </button>

                {/* Parcels list */}
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
                            className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-accent/50 text-xs border-b"
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
                            <span className="flex gap-2 text-[10px] text-muted-foreground">
                              {p.doc_count} מסמכים
                              {p.has_tashrit === 1 && (
                                <span className="bg-blue-100 text-blue-700 px-1 rounded">תשריט</span>
                              )}
                            </span>
                          </button>

                          {/* Documents grouped by plan */}
                          {isExpanded && parcelDocs && (
                            <div className="bg-muted/20">
                              {parcelDocs.by_plan.map((bp, idx) => (
                                <div key={idx} className="border-b last:border-b-0">
                                  {bp.plan_number && (
                                    <div className="px-5 py-1 text-[11px] font-medium bg-muted/40 flex items-center gap-1">
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
                        הצג גוש {g.gush} במפה
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Empty gushim collapsed */}
            {emptyGushim.length > 0 && (
              <div className="border rounded-lg p-2 mb-2">
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

            {/* Stats summary */}
            {stats && (
              <div className="border rounded-lg p-3 mt-2">
                <h3 className="text-sm font-medium mb-2">סיכום נתונים</h3>
                <div className="space-y-1 text-xs">
                  {Object.entries(stats.by_category).map(([cat, cnt]) => (
                    <div key={cat} className="flex justify-between">
                      <span>{cat === "plans" ? "תוכניות" : "היתרים"}</span>
                      <span className="text-muted-foreground">{cnt}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-muted-foreground">
                    <span>תשריטים</span>
                    <span>{stats.tashrit_count}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>עם גיאורפרנס</span>
                    <span>{stats.georef_count}</span>
                  </div>
                  {stats.by_file_type && Object.entries(stats.by_file_type).map(([ft, cnt]) => (
                    <div key={ft} className="flex justify-between text-muted-foreground">
                      <span>{ft.toUpperCase()}</span>
                      <span>{cnt}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-medium border-t pt-1 mt-1">
                    <span>סה&quot;כ</span>
                    <span>{stats.total}</span>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* ━━━ Aerial tab ━━━ */}
        <TabsContent value="aerial" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full px-2 pb-2">
            {aerialYears.length === 0 && (
              <p className="text-sm text-muted-foreground p-2">
                לא נמצאו צילומי אוויר מקומיים
              </p>
            )}
            {aerialYears.map((y) => (
              <div key={y.year} className="border rounded-lg mb-2 overflow-hidden">
                <button
                  onClick={() =>
                    setExpandedYear(expandedYear === y.year ? null : y.year)
                  }
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{y.year}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {y.levels.length} רמות
                    {expandedYear === y.year ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>
                {expandedYear === y.year && (
                  <div className="border-t px-3 py-2 space-y-2">
                    {y.levels.map((lv) => (
                      <div
                        key={lv.level}
                        className="flex items-center justify-between text-xs"
                      >
                        <span>
                          רמה {lv.level} · {lv.tile_count} אריחים
                          {lv.stitched && " · תמונה מאוחדת"}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onSelectAerialYear(y.year)}
                        >
                          הצג
                        </Button>
                      </div>
                    ))}
                    {y.levels[0]?.georef && (
                      <p className="text-[11px] text-muted-foreground">
                        EPSG:2039 ·{" "}
                        {Math.abs(y.levels[0].georef.pixel_size_x).toFixed(2)} מ&apos;/פיקסל
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </ScrollArea>
        </TabsContent>

        {/* ━━━ Search tab ━━━ */}
        <TabsContent value="search" className="flex-1 m-0 min-h-0">
          <div className="px-2 pt-2 flex gap-1">
            <Input
              placeholder="חפש לפי שם, תוכנית, קובץ..."
              className="text-xs h-8"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button
              size="sm"
              className="h-8 px-3"
              onClick={doSearch}
              disabled={searching}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="flex-1 px-2 pb-2 mt-1">
            {searchResults.length > 0 && (
              <p className="text-[11px] text-muted-foreground px-1 mb-1">
                {searchTotal} תוצאות
              </p>
            )}
            <div className="divide-y border rounded-lg overflow-hidden">
              {searchResults.map((doc) => (
                <div key={doc.id} className="text-xs">
                  <div className="px-2 py-0.5 text-[10px] text-muted-foreground bg-muted/30">
                    גוש {doc.gush} · חלקה {doc.helka}
                    {doc.plan_number && ` · ${doc.plan_number}`}
                  </div>
                  <DocRow doc={doc} onShowImage={onSelectPlanImage} />
                </div>
              ))}
            </div>
            {searchResults.length === 0 && searchText && !searching && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                לא נמצאו תוצאות
              </p>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
