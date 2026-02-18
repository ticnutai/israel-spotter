import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, MapPin, Loader2, AlertCircle, History, Trash2, Bookmark, BookmarkPlus, X } from "lucide-react";
import { searchByGushHelka, searchByAddress, type GeoResult } from "@/lib/geocode";
import { fetchBoundaries, type BoundaryResult } from "@/lib/boundaries";
import { useSearchHistory, type SearchHistoryItem } from "@/hooks/use-search-history";
import { useSavedSearches, type SavedSearch } from "@/hooks/use-saved-searches";

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
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="gush" className="gap-2">
            <MapPin className="h-4 w-4" />
            גוש / חלקה
          </TabsTrigger>
          <TabsTrigger value="address" className="gap-2">
            <Search className="h-4 w-4" />
            כתובת
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gush">
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <div className="flex-1 w-full">
              <Label htmlFor="gush-input">מספר גוש</Label>
              <Input
                id="gush-input"
                type="number"
                placeholder="לדוגמה: 6158"
                value={gush}
                onChange={(e) => setGush(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGushHelkaSearch()}
                dir="ltr"
              />
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
