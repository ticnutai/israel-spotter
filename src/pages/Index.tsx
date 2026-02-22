import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchPanel } from "@/components/SearchPanel";
import { MapView, type ParcelColorMode } from "@/components/MapView";
import { MapLegend } from "@/components/MapLegend";
import { SmartSidebar } from "@/components/SmartSidebar";
import { ParcelInfoDialog, type ParcelDialogData } from "@/components/ParcelInfoDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";
import { searchByGushHelka, reverseGeocodeParcel } from "@/lib/geocode";
import { fetchBoundaries } from "@/lib/boundaries";
import type { ParsedGisLayer } from "@/lib/gis-parser";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<GeoResult | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryResult | null>(null);
  const [aerialYear, setAerialYear] = useState<string | null>(null);
  const [planPath, setPlanPath] = useState<string | null>(null);
  const [parcelDialog, setParcelDialog] = useState<ParcelDialogData | null>(null);
  const [highlightGeometry, setHighlightGeometry] = useState<GeoJSON.Geometry | null>(null);
  const [gisOverlay, setGisOverlay] = useState<GeoJSON.FeatureCollection | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(false);
  const [parcelColorMode, setParcelColorMode] = useState<ParcelColorMode>("default");
  const [georefActive, setGeorefActive] = useState(false);

  // ── URL deep-link: open parcel from ?gush=X&helka=Y ──
  useEffect(() => {
    const g = searchParams.get("gush");
    const h = searchParams.get("helka");
    if (g && h) {
      const gush = Number(g);
      const helka = Number(h);
      if (gush > 0 && helka > 0) {
        // Simulate a click on that parcel
        (async () => {
          try {
            const res = await searchByGushHelka(gush, helka);
            setResult(res);
            const parcel = await reverseGeocodeParcel(res.lat, res.lng);
            if (parcel) setParcelDialog(parcel);
            // Highlight parcel boundary
            const b = await fetchBoundaries(gush, helka);
            if (b.parcelGeometry) setHighlightGeometry(b.parcelGeometry);
          } catch { /* ignore */ }
        })();
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectGush = useCallback(async (gush: number) => {
    try {
      // Search for block only (no specific helka)
      const res = await searchByGushHelka(gush);
      setResult(res);
      const bounds = await fetchBoundaries(gush);
      setBoundaries(bounds);
    } catch {
      // If not found, still try to get at least block boundaries
      try {
        const bounds = await fetchBoundaries(gush);
        setBoundaries(bounds);
      } catch { /* ignore */ }
    }
  }, []);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    try {
      const parcel = await reverseGeocodeParcel(lat, lng);
      if (!parcel) {
        toast({
          title: "לא נמצאה חלקה",
          description: "הנקודה שנבחרה אינה בתוך חלקה רשומה",
          variant: "destructive",
        });
        return;
      }
      setParcelDialog(parcel);
      // Update URL for sharing
      setSearchParams({ gush: String(parcel.gush), helka: String(parcel.helka) }, { replace: true });
      // Fetch & highlight parcel boundary + show all parcels in gush
      try {
        const b = await fetchBoundaries(parcel.gush, parcel.helka);
        setBoundaries(b);
        if (b.parcelGeometry) setHighlightGeometry(b.parcelGeometry);
      } catch { /* ignore */ }
    } catch {
      toast({
        title: "שגיאה",
        description: "לא ניתן לזהות חלקה בנקודה זו",
        variant: "destructive",
      });
    }
  }, [toast, setSearchParams]);

  // Stable callbacks to prevent child re-renders
  const handleClearPlan = useCallback(() => setPlanPath(null), []);
  const handleShowGisLayer = useCallback((layer: ParsedGisLayer | null) => setGisOverlay(layer ? layer.geojson : null), []);
  const handleActivateGeoref = useCallback(() => setGeorefActive(true), []);
  const handleDeactivateGeoref = useCallback(() => setGeorefActive(false), []);
  const handleCloseParcelDialog = useCallback(() => {
    setParcelDialog(null);
    setHighlightGeometry(null);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);
  const handleShowPlan = useCallback((path: string) => setPlanPath(path), []);

  if (isMobile) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background overflow-x-hidden overflow-y-auto" dir="rtl">
        {/* Top bar with search + sidebar toggle */}
        <div className="border-b shrink-0 flex items-center gap-1 px-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent text-muted-foreground"
            aria-label="תפריט"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="flex-1 min-w-0">
            <SearchPanel onResult={setResult} onBoundaries={setBoundaries} />
          </div>
        </div>

        {/* Sidebar overlay for mobile */}
        {showSidebar && (
          <div className="fixed inset-0 z-50 flex" dir="rtl">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowSidebar(false)} />
            <div
              className="relative z-10 w-[85vw] max-w-[380px] h-full overflow-y-auto shadow-xl"
              style={{
                backgroundColor: 'hsl(0 0% 100%)',
                border: '1px solid hsl(222.2 47.4% 11.2%)',
              }}
            >
              <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'hsl(222.2 47.4% 11.2%)' }}>
                <span className="font-semibold text-sm" style={{ color: 'hsl(43 56% 52%)' }}>תפריט</span>
                <button onClick={() => setShowSidebar(false)} className="text-muted-foreground hover:text-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <SmartSidebar
                onSelectGush={(g) => { handleSelectGush(g); setShowSidebar(false); }}
                onSelectAerialYear={(y) => { setAerialYear(y); setShowSidebar(false); }}
                onSelectPlanImage={(p) => { setPlanPath(p); setShowSidebar(false); }}
                onShowGisLayer={(layer) => { setGisOverlay(layer ? layer.geojson : null); setShowSidebar(false); }}
                onActivateGeoref={() => { handleActivateGeoref(); setShowSidebar(false); }}
                defaultPinned={false}
              />
            </div>
          </div>
        )}

        {/* Map – takes remaining space */}
        <div className="flex-1 relative min-h-[300px]">
          <MapView
            result={result}
            boundaries={boundaries}
            aerialYear={aerialYear}
            planPath={planPath}
            onClearPlan={handleClearPlan}
            onMapClick={handleMapClick}
            highlightGeometry={highlightGeometry}
            gisOverlay={gisOverlay}
            parcelColorMode={parcelColorMode}
            georefActive={georefActive}
            onGeorefClose={handleDeactivateGeoref}
            onClearAerial={() => setAerialYear(null)}
          />
          {boundaries && <MapLegend colorMode={parcelColorMode} onColorModeChange={setParcelColorMode} />}
          <ParcelInfoDialog
            data={parcelDialog}
            onClose={handleCloseParcelDialog}
            onShowPlan={handleShowPlan}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row h-screen bg-background overflow-x-hidden" dir="rtl">
      {/* Smart Sidebar – right side with auto-hide + pin */}
      <SmartSidebar
        onSelectGush={handleSelectGush}
        onSelectAerialYear={setAerialYear}
        onSelectPlanImage={setPlanPath}
        onShowGisLayer={handleShowGisLayer}
        onActivateGeoref={handleActivateGeoref}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar with search */}
        <div className="border-b">
          <SearchPanel onResult={setResult} onBoundaries={setBoundaries} />
        </div>

        {/* Map */}
        <div className="flex-1 relative min-h-0">
          <MapView
            result={result}
            boundaries={boundaries}
            aerialYear={aerialYear}
            planPath={planPath}
            onClearPlan={handleClearPlan}
            onClearAerial={() => setAerialYear(null)}
            onMapClick={handleMapClick}
            highlightGeometry={highlightGeometry}
            gisOverlay={gisOverlay}
            parcelColorMode={parcelColorMode}
            georefActive={georefActive}
            onGeorefClose={handleDeactivateGeoref}
          />
          {boundaries && <MapLegend colorMode={parcelColorMode} onColorModeChange={setParcelColorMode} />}
          
          {/* Floating settings button */}
          <div className="absolute bottom-4 right-4 z-[1000]">
            <SettingsDialog />
          </div>

          <ParcelInfoDialog
            data={parcelDialog}
            onClose={handleCloseParcelDialog}
            onShowPlan={handleShowPlan}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
