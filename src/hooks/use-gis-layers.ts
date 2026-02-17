import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseGISFile, type GeoJSONData } from "@/lib/gis-parser";
import { toast } from "@/hooks/use-toast";

export interface GISLayer {
  id: string;
  name: string;
  file_type: string;
  file_path: string;
  geojson: GeoJSONData;
  created_at: string;
  visible: boolean;
}

export function useGISLayers() {
  const [layers, setLayers] = useState<GISLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchLayers = useCallback(async () => {
    const { data, error } = await supabase
      .from("gis_layers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching layers:", error);
      return;
    }

    setLayers(
      (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        file_type: row.file_type,
        file_path: row.file_path,
        geojson: row.geojson as GeoJSONData,
        created_at: row.created_at,
        visible: true,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadProgress(10);

      try {
        // Parse the file to GeoJSON
        const geojson = await parseGISFile(file);
        setUploadProgress(40);

        // Upload file to storage
        const filePath = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("gis-files")
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        setUploadProgress(70);

        // Save metadata to DB
        const ext = file.name.split(".").pop()?.toLowerCase() || "unknown";
        const { error: insertError } = await supabase
          .from("gis_layers")
          .insert({
            name: file.name.replace(/\.[^/.]+$/, ""),
            file_type: ext,
            file_path: filePath,
            geojson: geojson as any,
          });

        if (insertError) throw insertError;
        setUploadProgress(100);

        toast({ title: "שכבה הועלתה בהצלחה", description: file.name });
        await fetchLayers();
      } catch (err: any) {
        console.error("Upload error:", err);
        toast({
          title: "שגיאה בהעלאה",
          description: err.message || "שגיאה לא ידועה",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [fetchLayers]
  );

  const deleteLayer = useCallback(
    async (layer: GISLayer) => {
      // Delete from storage
      await supabase.storage.from("gis-files").remove([layer.file_path]);
      // Delete from DB
      await supabase.from("gis_layers").delete().eq("id", layer.id);
      toast({ title: "שכבה נמחקה", description: layer.name });
      await fetchLayers();
    },
    [fetchLayers]
  );

  const toggleVisibility = useCallback((layerId: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  }, []);

  return {
    layers,
    loading,
    uploading,
    uploadProgress,
    uploadFile,
    deleteLayer,
    toggleVisibility,
  };
}
