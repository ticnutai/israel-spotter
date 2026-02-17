import { useState } from "react";
import { SearchPanel } from "@/components/SearchPanel";
import { MapView } from "@/components/MapView";
import { MapLegend } from "@/components/MapLegend";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";

const Index = () => {
  const [result, setResult] = useState<GeoResult | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryResult | null>(null);

  return (
    <div className="flex flex-col h-screen bg-background">
      <SearchPanel onResult={setResult} onBoundaries={setBoundaries} />
      <MapView result={result} boundaries={boundaries} />
      {boundaries && <MapLegend />}
    </div>
  );
};

export default Index;
