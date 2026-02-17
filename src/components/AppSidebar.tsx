import { useState, useRef } from "react";
import { Search, MapPin, Loader2, AlertCircle, History, Trash2, Layers, Upload, Eye, EyeOff, LogOut, Shield, User, Settings, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { searchByGushHelka, searchByAddress, type GeoResult } from "@/lib/geocode";
import { fetchBoundaries, type BoundaryResult } from "@/lib/boundaries";
import { useSearchHistory, type SearchHistoryItem } from "@/hooks/use-search-history";
import { useAuth } from "@/hooks/use-auth";
import { SettingsDialog } from "@/components/SettingsDialog";
import type { GISLayer } from "@/hooks/use-gis-layers";

const ACCEPTED = ".geojson,.json,.kml,.gpx";

interface AppSidebarProps {
  onResult: (result: GeoResult) => void;
  onBoundaries: (boundaries: BoundaryResult | null) => void;
  gis: {
    layers: GISLayer[];
    loading: boolean;
    uploading: boolean;
    uploadProgress: number;
    uploadFile: (file: File) => void;
    deleteLayer: (layer: GISLayer) => void;
    toggleVisibility: (layerId: string) => void;
  };
}

export function AppSidebar({ onResult, onBoundaries, gis }: AppSidebarProps) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [searchMode, setSearchMode] = useState<"gush" | "address">("gush");
  const [gush, setGush] = useState("");
  const [helka, setHelka] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [showBoundaries, setShowBoundaries] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { history, addEntry, clearHistory } = useSearchHistory();
  const gisInputRef = useRef<HTMLInputElement>(null);

  const handleGushHelkaSearch = async (g?: number, h?: number) => {
    const gushNum = g ?? Number(gush);
    const helkaNum = h ?? Number(helka);
    if (!gushNum || !helkaNum) { setError("יש להזין מספר גוש ומספר חלקה"); return; }
    setLoading(true); setError(""); setWarning(""); onBoundaries(null);
    try {
      const result = await searchByGushHelka(gushNum, helkaNum);
      onResult(result);
      addEntry({ type: "gush", label: `גוש ${gushNum}, חלקה ${helkaNum}`, gush: gushNum, helka: helkaNum });
      if (showBoundaries) {
        const boundaries = await fetchBoundaries(gushNum, helkaNum);
        if (!boundaries.parcelGeometry && !boundaries.blockGeometry) setWarning("לא נמצאו גבולות גרפיים");
        onBoundaries(boundaries);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בחיפוש"); }
    finally { setLoading(false); }
  };

  const handleAddressSearch = async (addr?: string) => {
    const searchAddr = addr ?? address;
    if (!searchAddr.trim()) { setError("יש להזין כתובת"); return; }
    setLoading(true); setError(""); setWarning(""); onBoundaries(null);
    try {
      const result = await searchByAddress(searchAddr);
      onResult(result);
      addEntry({ type: "address", label: searchAddr, address: searchAddr });
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בחיפוש"); }
    finally { setLoading(false); }
  };

  const handleHistoryClick = (item: SearchHistoryItem) => {
    setShowHistory(false);
    if (item.type === "gush" && item.gush && item.helka) {
      setGush(String(item.gush)); setHelka(String(item.helka));
      handleGushHelkaSearch(item.gush, item.helka);
    } else if (item.type === "address" && item.address) {
      setAddress(item.address); handleAddressSearch(item.address);
    }
  };

  const handleGisFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { gis.uploadFile(file); e.target.value = ""; }
  };

  return (
    <Sidebar side="right" className="border-l border-border bg-sidebar" dir="rtl">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-sidebar-primary" />
            <h1 className="text-xl font-bold text-sidebar-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              Israel Spotter
            </h1>
          </div>
          <SettingsDialog />
        </div>
        {user && (
          <div className="mt-3 flex items-center gap-2 text-sm text-sidebar-foreground/70">
            <User className="h-4 w-4" />
            <span className="truncate">{profile?.display_name || user.email}</span>
            {isAdmin && <Shield className="h-3.5 w-3.5 text-sidebar-primary" />}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="p-0">
        {/* Search Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 px-4">חיפוש</SidebarGroupLabel>
          <SidebarGroupContent className="px-4 space-y-3">
            <div className="flex gap-1">
              <Button
                variant={searchMode === "gush" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSearchMode("gush")}
                className={searchMode === "gush" ? "bg-sidebar-primary text-sidebar-primary-foreground flex-1" : "text-sidebar-foreground/70 flex-1"}
              >
                <MapPin className="h-3.5 w-3.5 ml-1" />
                גוש/חלקה
              </Button>
              <Button
                variant={searchMode === "address" ? "default" : "ghost"}
                size="sm"
                onClick={() => setSearchMode("address")}
                className={searchMode === "address" ? "bg-sidebar-primary text-sidebar-primary-foreground flex-1" : "text-sidebar-foreground/70 flex-1"}
              >
                <Search className="h-3.5 w-3.5 ml-1" />
                כתובת
              </Button>
            </div>

            {searchMode === "gush" ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-sidebar-foreground/70 text-xs">מספר גוש</Label>
                  <Input type="number" placeholder="6158" value={gush} onChange={e => setGush(e.target.value)} onKeyDown={e => e.key === "Enter" && handleGushHelkaSearch()} dir="ltr" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-9" />
                </div>
                <div>
                  <Label className="text-sidebar-foreground/70 text-xs">מספר חלקה</Label>
                  <Input type="number" placeholder="25" value={helka} onChange={e => setHelka(e.target.value)} onKeyDown={e => e.key === "Enter" && handleGushHelkaSearch()} dir="ltr" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-9" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="boundaries" checked={showBoundaries} onCheckedChange={(c) => { setShowBoundaries(c); if (!c) onBoundaries(null); }} />
                  <Label htmlFor="boundaries" className="text-sidebar-foreground/70 text-xs cursor-pointer">הצג גבולות</Label>
                </div>
                <Button onClick={() => handleGushHelkaSearch()} disabled={loading} className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 h-9">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Search className="h-4 w-4 ml-1" />}
                  חפש
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-sidebar-foreground/70 text-xs">כתובת</Label>
                  <Input placeholder="רוטשילד 1, תל אביב" value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddressSearch()} className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground h-9" />
                </div>
                <Button onClick={() => handleAddressSearch()} disabled={loading} className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 h-9">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Search className="h-4 w-4 ml-1" />}
                  חפש
                </Button>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
            {warning && !error && (
              <Alert className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">{warning}</AlertDescription>
              </Alert>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="bg-sidebar-border" />

        {/* History */}
        {history.length > 0 && (
          <SidebarGroup>
            <Collapsible open={showHistory} onOpenChange={setShowHistory}>
              <CollapsibleTrigger className="w-full">
                <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 cursor-pointer flex items-center justify-between w-full">
                  <span className="flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    היסטוריה ({history.length})
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent className="px-2">
                  <div className="flex justify-end px-2 mb-1">
                    <button onClick={clearHistory} className="text-xs text-sidebar-foreground/50 hover:text-destructive flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> נקה
                    </button>
                  </div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {history.map((item) => (
                      <button key={item.id} onClick={() => handleHistoryClick(item)} className="w-full text-right px-3 py-1.5 text-xs rounded hover:bg-sidebar-accent text-sidebar-foreground/80 flex items-center gap-2">
                        {item.type === "gush" ? <MapPin className="h-3 w-3 shrink-0" /> : <Search className="h-3 w-3 shrink-0" />}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        <Separator className="bg-sidebar-border" />

        {/* GIS Layers */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 px-4 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            שכבות GIS
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-4 space-y-2">
            <input ref={gisInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleGisFileChange} />
            <Button size="sm" className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" onClick={() => gisInputRef.current?.click()} disabled={gis.uploading}>
              {gis.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Upload className="h-3.5 w-3.5 ml-1" />}
              {gis.uploading ? "מעלה..." : "העלאת קובץ"}
            </Button>
            {gis.uploading && <Progress value={gis.uploadProgress} className="h-1.5" />}
            {gis.loading ? (
              <p className="text-xs text-sidebar-foreground/50 text-center py-2">טוען...</p>
            ) : gis.layers.length === 0 ? (
              <p className="text-xs text-sidebar-foreground/50 text-center py-2">אין שכבות</p>
            ) : (
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {gis.layers.map((layer) => (
                  <div key={layer.id} className="flex items-center gap-1.5 text-xs p-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground/80">
                    <button onClick={() => gis.toggleVisibility(layer.id)} title={layer.visible ? "הסתר" : "הצג"}>
                      {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 opacity-50" />}
                    </button>
                    <span className="flex-1 truncate">{layer.name}</span>
                    <span className="text-sidebar-foreground/40 uppercase text-[10px]">{layer.file_type}</span>
                    <button onClick={() => gis.deleteLayer(layer)} className="hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <Button variant="ghost" onClick={signOut} className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent gap-2">
          <LogOut className="h-4 w-4" />
          התנתק
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
