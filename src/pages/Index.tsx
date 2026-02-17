import { useState } from "react";
import { SearchPanel } from "@/components/SearchPanel";
import { MapView } from "@/components/MapView";
import { MapLegend } from "@/components/MapLegend";
import { GISUploader } from "@/components/GISUploader";
import { useGISLayers } from "@/hooks/use-gis-layers";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";

const Index = () => {
  const [result, setResult] = useState<GeoResult | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryResult | null>(null);
  const gis = useGISLayers();

  return (
    <div className="flex flex-col h-screen bg-background">
      <SearchPanel onResult={setResult} onBoundaries={setBoundaries} />
      <div className="flex-1 relative">
        <MapView result={result} boundaries={boundaries} gisLayers={gis.layers} />
        <GISUploader
          layers={gis.layers}
          loading={gis.loading}
          uploading={gis.uploading}
          uploadProgress={gis.uploadProgress}
          onUpload={gis.uploadFile}
          onDelete={gis.deleteLayer}
          onToggle={gis.toggleVisibility}
        />
      </div>
      {boundaries && <MapLegend />}
    </div>
  );
};

export default Index;
