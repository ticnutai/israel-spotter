import { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, MapPin, Loader2, AlertCircle, History, Trash2, Bookmark, BookmarkPlus, X, FileText } from "lucide-react";
import { searchByGushHelka, searchByAddress, type GeoResult } from "@/lib/geocode";
import { fetchBoundaries, type BoundaryResult } from "@/lib/boundaries";
import { useSearchHistory, type SearchHistoryItem } from "@/hooks/use-search-history";
import { useSavedSearches, type SavedSearch } from "@/hooks/use-saved-searches";
import { supabase } from "@/integrations/supabase/client";

interface SearchPanelProps {
  onResult: (result: GeoResult) => void;
  onBoundaries: (boundaries: BoundaryResult | null) => void;
}

export function SearchPanel({ onResult, onBoundaries }: SearchPanelProps) {
  const [gush, setGush] = useState("");
  const [helka, setHelka] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const { history, addEntry, clearHistory } = useSearchHistory();
  const { saved, addSaved, removeSaved, clearSaved } = useSavedSearches();

  // Plan/lot search
  const [planQuery, setPlanQuery] = useState("");
  const [lotQuery, setLotQuery] = useState("");
  const [planResults, setPlanResults] = useState<{ pl_number: string; pl_name: string; land_use: string }[]>([]);
  const [planLoading, setPlanLoading] = useState(false);

  // Autocomplete for gush
  const [gushSuggestions, setGushSuggestions] = useState<{ gush: number; name: string | null }[]>([]);
  const [showGushSuggestions, setShowGushSuggestions] = useState(false);
  const gushInputRef = useRef<HTMLInputElement>(null);

  const fetchGushSuggestions = useCallback(async (query: string) => {
    if (!query || query.length < 2) { setGushSuggestions([]); return; }
    try {
      const { data } = await supabase
        .from("gushim")
        .select("gush, name")
        .or(`gush.eq.${Number(query) || 0},name.ilike.%${query}%`)
        .limit(8);
      setGushSuggestions(data ?? []);
      setShowGushSuggestions((data?.length ?? 0) > 0);
    } catch { setGushSuggestions([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchGushSuggestions(gush), 250);
    return () => clearTimeout(timer);
  }, [gush, fetchGushSuggestions]);

  const handleGushHelkaSearch = async (g?: number, h?: number) => {
    const gushNum = g ?? Number(gush);
    const helkaNum = h ?? (helka ? Number(helka) : undefined);
    if (!gushNum) {
      setError("יש להזין מספר גוש");
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    onBoundaries(null);
    try {
      const result = await searchByGushHelka(gushNum, helkaNum);
      onResult(result);

      const label = helkaNum ? `גוש ${gushNum}, חלקה ${helkaNum}` : `גוש ${gushNum}`;
      addEntry({ type: "gush", label, gush: gushNum, helka: helkaNum });

      // Always fetch and show boundaries (parcel polygon)
      const boundaries = await fetchBoundaries(gushNum, helkaNum);
      if (!boundaries.parcelGeometry && !boundaries.blockGeometry) {
        setWarning("לא נמצאו גבולות גרפיים");
      }
      onBoundaries(boundaries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSearch = async (addr?: string) => {
    const searchAddr = addr ?? address;
    if (!searchAddr.trim()) {
      setError("יש להזין כתובת");
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    onBoundaries(null);
    try {
      const result = await searchByAddress(searchAddr);
      onResult(result);
      addEntry({ type: "address", label: searchAddr, address: searchAddr });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setLoading(false);
    }
  };

  // Search by plan number or lot number
  const handlePlanSearch = async () => {
    if (!planQuery.trim() && !lotQuery.trim()) {
      setError("יש להזין מספר תב״ע או מספר מגרש");
      return;
    }
    setPlanLoading(true);
    setError("");
    setWarning("");
    setPlanResults([]);
    try {
      let query = supabase
        .from("taba_outlines")
        .select("pl_number, pl_name, land_use");

      if (planQuery.trim()) {
        query = query.ilike("pl_number", `%${planQuery.trim()}%`);
      }
      if (lotQuery.trim()) {
        query = query.ilike("pl_name", `%מגרש ${lotQuery.trim()}%`);
      }

      const { data, error: err } = await query.limit(20);
      if (err) throw err;

      if (!data || data.length === 0) {
        setWarning("לא נמצאו תוכניות תואמות");
      } else {
        setPlanResults(data.map(d => ({
          pl_number: d.pl_number || "",
          pl_name: d.pl_name || "",
          land_use: d.land_use || "",
        })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setPlanLoading(false);
    }
  };

  // When clicking a plan result, find the gush/helka and navigate
  const handlePlanResultClick = async (plNumber: string) => {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const { data: blocks } = await supabase
        .from("plan_blocks")
        .select("gush, helka")
        .eq("plan_number", plNumber)
        .limit(1);

      if (!blocks || blocks.length === 0) {
        setWarning("לא נמצאו חלקות עבור תוכנית זו");
        setLoading(false);
        return;
      }

      const { gush: g, helka: h } = blocks[0];
      const result = await searchByGushHelka(g, h ?? undefined);
      onResult(result);

      const boundaries = await fetchBoundaries(g, h ?? undefined);
      onBoundaries(boundaries);

      addEntry({ type: "gush", label: `תב"ע ${plNumber} (גוש ${g})`, gush: g, helka: h ?? undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בחיפוש");
    } finally {
      setLoading(false);
    }
  };

  const handleHistoryClick = (item: SearchHistoryItem) => {
    setShowHistory(false);
    setShowSaved(false);
    if (item.type === "gush" && item.gush) {
      setGush(String(item.gush));
      setHelka(item.helka ? String(item.helka) : "");
      handleGushHelkaSearch(item.gush, item.helka);
    } else if (item.type === "address" && item.address) {
      setAddress(item.address);
      handleAddressSearch(item.address);
    }
  };

  const handleSavedClick = (item: SavedSearch) => {
    setShowSaved(false);
    setShowHistory(false);
    setGush(String(item.gush));
    setHelka(item.helka ? String(item.helka) : "");
    handleGushHelkaSearch(item.gush, item.helka);
  };

  const handleSaveCurrentSearch = () => {
    const gushNum = Number(gush);
    if (!gushNum) return;
    const helkaNum = helka ? Number(helka) : undefined;
    const label = helkaNum ? `גוש ${gushNum}, חלקה ${helkaNum}` : `גוש ${gushNum}`;
    addSaved({ label, gush: gushNum, helka: helkaNum });
  };

  return (
    <div className="w-full bg-card border-b p-4" dir="rtl">
      <Tabs defaultValue="gush" className="w-full max-w-2xl mx-auto">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="gush" className="gap-2">
            <MapPin className="h-4 w-4" />
            גוש / חלקה
          </TabsTrigger>
          <TabsTrigger value="plan" className="gap-2">
            <FileText className="h-4 w-4" />
            תב״ע / מגרש
          </TabsTrigger>
          <TabsTrigger value="address" className="gap-2">
            <Search className="h-4 w-4" />
            כתובת
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gush">
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <div className="flex-1 w-full relative">
              <Label htmlFor="gush-input">מספר גוש</Label>
              <Input
                ref={gushInputRef}
                id="gush-input"
                type="number"
                placeholder="לדוגמה: 6158"
                value={gush}
                onChange={(e) => setGush(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setShowGushSuggestions(false); handleGushHelkaSearch(); }
                }}
                onFocus={() => gushSuggestions.length > 0 && setShowGushSuggestions(true)}
                onBlur={() => setTimeout(() => setShowGushSuggestions(false), 200)}
                dir="ltr"
              />
              {showGushSuggestions && gushSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {gushSuggestions.map((s) => (
                    <button
                      key={s.gush}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setGush(String(s.gush));
                        setShowGushSuggestions(false);
                      }}
                    >
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{s.gush}</span>
                      {s.name && <span className="text-muted-foreground text-xs">– {s.name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 w-full">
              <Label htmlFor="helka-input">מספר חלקה (אופציונלי)</Label>
              <Input
                id="helka-input"
                type="number"
                placeholder="ריק = כל הגוש"
                value={helka}
                onChange={(e) => setHelka(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGushHelkaSearch()}
                dir="ltr"
              />
            </div>
            <Button onClick={() => handleGushHelkaSearch()} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              חיפוש
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              title="שמור חיפוש"
              onClick={handleSaveCurrentSearch}
              disabled={!gush}
            >
              <BookmarkPlus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            גבולות הגוש/חלקה יוצגו אוטומטית על המפה
          </p>
        </TabsContent>

        {/* Plan / Lot search tab */}
        <TabsContent value="plan">
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <div className="flex-1 w-full">
              <Label htmlFor="plan-input">מספר תב״ע</Label>
              <Input
                id="plan-input"
                placeholder="לדוגמה: 425-0486316"
                value={planQuery}
                onChange={(e) => setPlanQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePlanSearch()}
                dir="ltr"
              />
            </div>
            <div className="flex-1 w-full">
              <Label htmlFor="lot-input">מספר מגרש (אופציונלי)</Label>
              <Input
                id="lot-input"
                type="number"
                placeholder="לדוגמה: 124"
                value={lotQuery}
                onChange={(e) => setLotQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePlanSearch()}
                dir="ltr"
              />
            </div>
            <Button onClick={handlePlanSearch} disabled={planLoading} className="w-full sm:w-auto">
              {planLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              חיפוש
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            חפש לפי מספר תוכנית או מספר מגרש – לחץ על תוצאה לניווט למפה
          </p>

          {/* Plan search results */}
          {planResults.length > 0 && (
            <div className="mt-3 border rounded-lg bg-card overflow-hidden max-h-60 overflow-y-auto">
              <div className="px-3 py-1.5 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                {planResults.length} תוצאות
              </div>
              {planResults.map((p) => (
                <button
                  key={p.pl_number}
                  onClick={() => handlePlanResultClick(p.pl_number)}
                  disabled={loading}
                  className="w-full text-right px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0 flex flex-col gap-0.5"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium text-xs">{p.pl_number}</span>
                    {p.land_use && (
                      <span className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                        {p.land_use}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground truncate pr-5">{p.pl_name}</span>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="address">
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <div className="flex-1 w-full">
              <Label htmlFor="address-input">כתובת</Label>
              <Input
                id="address-input"
                placeholder="לדוגמה: רוטשילד 1, תל אביב"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
              />
            </div>
            <Button onClick={() => handleAddressSearch()} disabled={loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              חיפוש
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* History & Saved toggles */}
      {(history.length > 0 || saved.length > 0) && (
        <div className="max-w-2xl mx-auto mt-3 flex items-center gap-4">
          {history.length > 0 && (
            <button
              onClick={() => { setShowHistory(!showHistory); setShowSaved(false); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              חיפושים אחרונים ({history.length})
            </button>
          )}
          {saved.length > 0 && (
            <button
              onClick={() => { setShowSaved(!showSaved); setShowHistory(false); }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bookmark className="h-3.5 w-3.5" />
              שמורים ({saved.length})
            </button>
          )}
        </div>
      )}

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <div className="max-w-2xl mx-auto mt-2">
          <div className="border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                <span className="text-xs font-medium text-muted-foreground">היסטוריה</span>
                <button onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                  <Trash2 className="h-3 w-3" />
                  נקה
                </button>
              </div>
              <ul className="divide-y max-h-48 overflow-y-auto">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => handleHistoryClick(item)}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                    >
                      {item.type === "gush" ? <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

      {/* Saved searches panel */}
      {showSaved && saved.length > 0 && (
        <div className="max-w-2xl mx-auto mt-2">
          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground">חיפושים שמורים</span>
              <button onClick={clearSaved} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                <Trash2 className="h-3 w-3" />
                נקה הכל
              </button>
            </div>
            <ul className="divide-y max-h-48 overflow-y-auto">
              {saved.map((item) => (
                <li key={item.id} className="flex items-center">
                  <button
                    onClick={() => handleSavedClick(item)}
                    className="flex-1 text-right px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    <Bookmark className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    {item.label}
                  </button>
                  <button
                    onClick={() => removeSaved(item.id)}
                    className="px-2 py-2 text-muted-foreground hover:text-destructive transition-colors"
                    title="הסר"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-3 max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warning && !error && (
        <Alert className="mt-3 max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
