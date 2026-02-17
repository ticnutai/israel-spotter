import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Search, MapPin, Loader2, AlertCircle, History, Trash2 } from "lucide-react";
import { searchByGushHelka, searchByAddress, type GeoResult } from "@/lib/geocode";
import { fetchBoundaries, type BoundaryResult } from "@/lib/boundaries";
import { useSearchHistory, type SearchHistoryItem } from "@/hooks/use-search-history";
import { SettingsDialog } from "./SettingsDialog";

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
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { history, addEntry, clearHistory } = useSearchHistory();

  const handleGushHelkaSearch = async (g?: number, h?: number) => {
    const gushNum = g ?? Number(gush);
    const helkaNum = h ?? Number(helka);
    if (!gushNum || !helkaNum) {
      setError("יש להזין מספר גוש ומספר חלקה");
      return;
    }
    setLoading(true);
    setError("");
    setWarning("");
    onBoundaries(null);
    try {
      const result = await searchByGushHelka(gushNum, helkaNum);
      onResult(result);
      addEntry({ type: "gush", label: `גוש ${gushNum}, חלקה ${helkaNum}`, gush: gushNum, helka: helkaNum });

      if (showBoundaries) {
        const boundaries = await fetchBoundaries(gushNum, helkaNum);
        if (!boundaries.parcelGeometry && !boundaries.blockGeometry) {
          setWarning("לא נמצאו גבולות גרפיים עבור גוש/חלקה זה");
        }
        onBoundaries(boundaries);
      }
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

  const handleToggleBoundaries = (checked: boolean) => {
    setShowBoundaries(checked);
    if (!checked) {
      onBoundaries(null);
    }
  };

  const handleHistoryClick = (item: SearchHistoryItem) => {
    setShowHistory(false);
    if (item.type === "gush" && item.gush && item.helka) {
      setGush(String(item.gush));
      setHelka(String(item.helka));
      handleGushHelkaSearch(item.gush, item.helka);
    } else if (item.type === "address" && item.address) {
      setAddress(item.address);
      handleAddressSearch(item.address);
    }
  };

  return (
    <div className="w-full bg-card border-b p-4" dir="rtl">
      <div className="flex items-center justify-between max-w-2xl mx-auto mb-2">
        <h1 className="text-lg font-bold">Israel Spotter</h1>
        <SettingsDialog />
      </div>
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
              <Label htmlFor="helka-input">מספר חלקה</Label>
              <Input
                id="helka-input"
                type="number"
                placeholder="לדוגמה: 25"
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
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Switch
              id="show-boundaries"
              checked={showBoundaries}
              onCheckedChange={handleToggleBoundaries}
            />
            <Label htmlFor="show-boundaries" className="cursor-pointer">
              הצג גבולות חלקה/גוש
            </Label>
          </div>
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

      {/* History toggle */}
      {history.length > 0 && (
        <div className="max-w-2xl mx-auto mt-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            חיפושים אחרונים ({history.length})
          </button>
          {showHistory && (
            <div className="mt-2 border rounded-lg bg-card overflow-hidden">
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
          )}
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
