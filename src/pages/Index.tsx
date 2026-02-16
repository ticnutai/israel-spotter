import { useState } from "react";
import { SearchPanel } from "@/components/SearchPanel";
import { MapView } from "@/components/MapView";
import type { GeoResult } from "@/lib/geocode";

const Index = () => {
  const [result, setResult] = useState<GeoResult | null>(null);

  return (
    <div className="flex flex-col h-screen bg-background">
      <SearchPanel onResult={setResult} />
      <MapView result={result} />
    </div>
  );
};

export default Index;
