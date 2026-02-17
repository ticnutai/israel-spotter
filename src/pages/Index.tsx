import { useState } from "react";
import { MapView } from "@/components/MapView";
import { MapLegend } from "@/components/MapLegend";
import { AppSidebar } from "@/components/AppSidebar";
import { useGISLayers } from "@/hooks/use-gis-layers";
import type { GeoResult } from "@/lib/geocode";
import type { BoundaryResult } from "@/lib/boundaries";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [result, setResult] = useState<GeoResult | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryResult | null>(null);
  const gis = useGISLayers();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar
          onResult={setResult}
          onBoundaries={setBoundaries}
          gis={gis}
        />
        <div className="flex-1 relative">
          {/* Floating sidebar trigger */}
          <div className="absolute top-4 right-4 z-[1000]">
            <SidebarTrigger className="bg-background/95 backdrop-blur gold-border gold-glow shadow-lg h-10 w-10" />
          </div>
          <MapView result={result} boundaries={boundaries} gisLayers={gis.layers} />
          {boundaries && <MapLegend />}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
