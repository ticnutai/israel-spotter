import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchPanel } from "@/components/SearchPanel";
import { MapView } from "@/components/MapView";
import { MapLegend } from "@/components/MapLegend";
import { SmartSidebar } from "@/components/SmartSidebar";
import { ParcelInfoDialog, type ParcelDialogData } from "@/components/ParcelInfoDialog";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";
import { searchByGushHelka, reverseGeocodeParcel } from "@/lib/geocode";
import { fetchBoundaries } from "@/lib/boundaries";
import type { ParsedGisLayer } from "@/lib/gis-parser";
import { useToast } from "@/hooks/use-toast";

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
      // Fetch & highlight parcel boundary
      try {
        const b = await fetchBoundaries(parcel.gush, parcel.helka);
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

  return (
    <div className="flex flex-row h-screen bg-background" dir="rtl">
      {/* Smart Sidebar – right side with auto-hide + pin */}
      <SmartSidebar
        onSelectGush={handleSelectGush}
        onSelectAerialYear={setAerialYear}
        onSelectPlanImage={setPlanPath}
        onShowGisLayer={(layer) => setGisOverlay(layer ? layer.geojson : null)}
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
            onClearPlan={() => setPlanPath(null)}
            onMapClick={handleMapClick}
            highlightGeometry={highlightGeometry}
            gisOverlay={gisOverlay}
          />
          {boundaries && <MapLegend />}
          <ParcelInfoDialog
            data={parcelDialog}
            onClose={() => {
              setParcelDialog(null);
              setHighlightGeometry(null);
              setSearchParams({}, { replace: true });
            }}
            onShowPlan={(path) => setPlanPath(path)}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
