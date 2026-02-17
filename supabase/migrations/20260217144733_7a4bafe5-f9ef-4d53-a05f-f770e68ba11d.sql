
CREATE TABLE public.gis_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  geojson JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gis_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on gis_layers"
  ON public.gis_layers FOR SELECT
  USING (true);

CREATE POLICY "Allow all insert on gis_layers"
  ON public.gis_layers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all delete on gis_layers"
  ON public.gis_layers FOR DELETE
  USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('gis-files', 'gis-files', true);

CREATE POLICY "Allow all uploads to gis-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gis-files');

CREATE POLICY "Allow all reads from gis-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gis-files');

CREATE POLICY "Allow all deletes from gis-files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'gis-files');
