import { useState, useCallback } from "react";
import { SearchPanel } from "@/components/SearchPanel";
import { MapView } from "@/components/MapView";
import { MapLegend } from "@/components/MapLegend";
import { SmartSidebar } from "@/components/SmartSidebar";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";
import { searchByGushHelka } from "@/lib/geocode";
import { fetchBoundaries } from "@/lib/boundaries";

const Index = () => {
  const [result, setResult] = useState<GeoResult | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryResult | null>(null);
  const [aerialYear, setAerialYear] = useState<string | null>(null);
  const [planPath, setPlanPath] = useState<string | null>(null);

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

  return (
    <div className="flex flex-row-reverse h-screen bg-background" dir="rtl">
      {/* Smart Sidebar – right side with auto-hide + pin */}
      <SmartSidebar
        onSelectGush={handleSelectGush}
        onSelectAerialYear={setAerialYear}
        onSelectPlanImage={setPlanPath}
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
          />
          {boundaries && <MapLegend />}
        </div>
      </div>
    </div>
  );
};

export default Index;
