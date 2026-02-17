-- ============================================================
-- Kfar Chabad GIS – Supabase Cloud DB Schema
-- Mirrors local SQLite structure (except aerial_images)
-- ============================================================

-- ─── GUSHIM ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gushim (
  gush INTEGER PRIMARY KEY,
  name TEXT,
  area_type TEXT DEFAULT 'unknown',
  plan_count INTEGER DEFAULT 0,
  permit_count INTEGER DEFAULT 0,
  parcel_count INTEGER DEFAULT 0,
  notes TEXT
);

ALTER TABLE public.gushim ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gushim_read" ON public.gushim FOR SELECT USING (true);
CREATE POLICY "gushim_insert" ON public.gushim FOR INSERT WITH CHECK (true);
CREATE POLICY "gushim_update" ON public.gushim FOR UPDATE USING (true);
CREATE POLICY "gushim_delete" ON public.gushim FOR DELETE USING (true);

-- ─── PARCELS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parcels (
  id SERIAL PRIMARY KEY,
  gush INTEGER NOT NULL REFERENCES public.gushim(gush),
  helka INTEGER NOT NULL,
  plan_count INTEGER DEFAULT 0,
  permit_count INTEGER DEFAULT 0,
  doc_count INTEGER DEFAULT 0,
  has_tashrit INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(gush, helka)
);

ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcels_read" ON public.parcels FOR SELECT USING (true);
CREATE POLICY "parcels_insert" ON public.parcels FOR INSERT WITH CHECK (true);
CREATE POLICY "parcels_update" ON public.parcels FOR UPDATE USING (true);
CREATE POLICY "parcels_delete" ON public.parcels FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_parcels_gush ON public.parcels(gush);

-- ─── PLANS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id SERIAL PRIMARY KEY,
  plan_number TEXT NOT NULL UNIQUE,
  plan_name TEXT,
  status TEXT,
  plan_type TEXT,
  doc_count INTEGER DEFAULT 0,
  gush_list TEXT,
  notes TEXT
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read" ON public.plans FOR SELECT USING (true);
CREATE POLICY "plans_insert" ON public.plans FOR INSERT WITH CHECK (true);
CREATE POLICY "plans_update" ON public.plans FOR UPDATE USING (true);
CREATE POLICY "plans_delete" ON public.plans FOR DELETE USING (true);

-- ─── DOCUMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documents (
  id SERIAL PRIMARY KEY,
  gush INTEGER NOT NULL REFERENCES public.gushim(gush),
  helka INTEGER NOT NULL,
  plan_number TEXT,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT,
  file_size INTEGER DEFAULT 0,
  file_type TEXT,
  category TEXT NOT NULL,
  is_tashrit INTEGER DEFAULT 0,
  is_georef INTEGER DEFAULT 0,
  downloaded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_read" ON public.documents FOR SELECT USING (true);
CREATE POLICY "documents_insert" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "documents_update" ON public.documents FOR UPDATE USING (true);
CREATE POLICY "documents_delete" ON public.documents FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_documents_gush ON public.documents(gush);
CREATE INDEX IF NOT EXISTS idx_documents_gush_helka ON public.documents(gush, helka);
CREATE INDEX IF NOT EXISTS idx_documents_plan ON public.documents(plan_number);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);

-- ─── PLAN_GEOREF ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_georef (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES public.documents(id),
  image_path TEXT NOT NULL,
  pixel_size_x DOUBLE PRECISION,
  pixel_size_y DOUBLE PRECISION,
  origin_x DOUBLE PRECISION,
  origin_y DOUBLE PRECISION,
  bbox_min_x DOUBLE PRECISION,
  bbox_min_y DOUBLE PRECISION,
  bbox_max_x DOUBLE PRECISION,
  bbox_max_y DOUBLE PRECISION,
  crs TEXT DEFAULT 'EPSG:2039',
  method TEXT DEFAULT 'estimated',
  notes TEXT
);

ALTER TABLE public.plan_georef ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_georef_read" ON public.plan_georef FOR SELECT USING (true);
CREATE POLICY "plan_georef_insert" ON public.plan_georef FOR INSERT WITH CHECK (true);
CREATE POLICY "plan_georef_update" ON public.plan_georef FOR UPDATE USING (true);
CREATE POLICY "plan_georef_delete" ON public.plan_georef FOR DELETE USING (true);
