-- ============================================================
-- Migration 002: Enrich existing tables + create missing tables
-- Matches local SQLite schema from import_all_data.py
-- Uses ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+)
-- ============================================================

-- ─── PARCELS: Add enriched cadastral columns ────────────────
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS legal_area_sqm DOUBLE PRECISION;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS shape_area_sqm DOUBLE PRECISION;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS status_text TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS locality_code INTEGER;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS municipality_code INTEGER;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS municipality TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS county_code INTEGER;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS county TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS region_code INTEGER;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS gush_suffix TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS centroid_lat DOUBLE PRECISION;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS centroid_lng DOUBLE PRECISION;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS update_date TEXT;

-- ─── PLANS: Add enriched iplan metadata columns ─────────────
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS entity_subtype TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS authority TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS main_status TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS status_date TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS area_dunam DOUBLE PRECISION;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS goals TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS location_desc TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS plan_area TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS jurisdiction TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS city_county TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS street TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS house_number TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS mp_id DOUBLE PRECISION;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS plan_id DOUBLE PRECISION;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS has_plan_data INTEGER DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS data_json_path TEXT;

-- ─── DOCUMENTS: Add missing columns ─────────────────────────
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS is_takanon INTEGER DEFAULT 0;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS doc_date TEXT;

-- ─── PLAN_BLOCKS: Plan ↔ Block linkage ──────────────────────
CREATE TABLE IF NOT EXISTS public.plan_blocks (
  id SERIAL PRIMARY KEY,
  plan_number TEXT NOT NULL,
  gush INTEGER NOT NULL,
  helka INTEGER,
  block_type TEXT,
  is_partial INTEGER DEFAULT 0,
  UNIQUE(plan_number, gush, helka)
);

ALTER TABLE public.plan_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_blocks_read" ON public.plan_blocks;
DROP POLICY IF EXISTS "plan_blocks_insert" ON public.plan_blocks;
DROP POLICY IF EXISTS "plan_blocks_update" ON public.plan_blocks;
DROP POLICY IF EXISTS "plan_blocks_delete" ON public.plan_blocks;
CREATE POLICY "plan_blocks_read" ON public.plan_blocks FOR SELECT USING (true);
CREATE POLICY "plan_blocks_insert" ON public.plan_blocks FOR INSERT WITH CHECK (true);
CREATE POLICY "plan_blocks_update" ON public.plan_blocks FOR UPDATE USING (true);
CREATE POLICY "plan_blocks_delete" ON public.plan_blocks FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_plan_blocks_gush ON public.plan_blocks(gush);
CREATE INDEX IF NOT EXISTS idx_plan_blocks_plan ON public.plan_blocks(plan_number);
CREATE INDEX IF NOT EXISTS idx_plan_blocks_gush_helka ON public.plan_blocks(gush, helka);

-- ─── PERMITS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permits (
  id SERIAL PRIMARY KEY,
  gush INTEGER NOT NULL,
  helka INTEGER NOT NULL,
  permit_id TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  UNIQUE(gush, helka, permit_id)
);

ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permits_read" ON public.permits;
DROP POLICY IF EXISTS "permits_insert" ON public.permits;
DROP POLICY IF EXISTS "permits_update" ON public.permits;
DROP POLICY IF EXISTS "permits_delete" ON public.permits;
CREATE POLICY "permits_read" ON public.permits FOR SELECT USING (true);
CREATE POLICY "permits_insert" ON public.permits FOR INSERT WITH CHECK (true);
CREATE POLICY "permits_update" ON public.permits FOR UPDATE USING (true);
CREATE POLICY "permits_delete" ON public.permits FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_permits_gush_helka ON public.permits(gush, helka);

-- ─── PERMIT_DOCUMENTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permit_documents (
  id SERIAL PRIMARY KEY,
  permit_id INTEGER NOT NULL REFERENCES public.permits(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_size INTEGER DEFAULT 0,
  file_type TEXT
);

ALTER TABLE public.permit_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permit_documents_read" ON public.permit_documents;
DROP POLICY IF EXISTS "permit_documents_insert" ON public.permit_documents;
DROP POLICY IF EXISTS "permit_documents_update" ON public.permit_documents;
DROP POLICY IF EXISTS "permit_documents_delete" ON public.permit_documents;
CREATE POLICY "permit_documents_read" ON public.permit_documents FOR SELECT USING (true);
CREATE POLICY "permit_documents_insert" ON public.permit_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "permit_documents_update" ON public.permit_documents FOR UPDATE USING (true);
CREATE POLICY "permit_documents_delete" ON public.permit_documents FOR DELETE USING (true);

-- ─── TABA_OUTLINES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.taba_outlines (
  id SERIAL PRIMARY KEY,
  pl_number TEXT,
  pl_name TEXT,
  entity_subtype TEXT,
  status TEXT,
  area_dunam DOUBLE PRECISION,
  land_use TEXT,
  district TEXT,
  jurisdiction TEXT,
  plan_county TEXT,
  mp_id DOUBLE PRECISION,
  objectid INTEGER,
  pl_url TEXT,
  depositing_date TEXT,
  last_update TEXT,
  geometry_json TEXT,
  properties_json TEXT
);

ALTER TABLE public.taba_outlines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "taba_outlines_read" ON public.taba_outlines;
DROP POLICY IF EXISTS "taba_outlines_insert" ON public.taba_outlines;
DROP POLICY IF EXISTS "taba_outlines_update" ON public.taba_outlines;
DROP POLICY IF EXISTS "taba_outlines_delete" ON public.taba_outlines;
CREATE POLICY "taba_outlines_read" ON public.taba_outlines FOR SELECT USING (true);
CREATE POLICY "taba_outlines_insert" ON public.taba_outlines FOR INSERT WITH CHECK (true);
CREATE POLICY "taba_outlines_update" ON public.taba_outlines FOR UPDATE USING (true);
CREATE POLICY "taba_outlines_delete" ON public.taba_outlines FOR DELETE USING (true);

-- ─── Indexes on enriched columns ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_parcels_municipality ON public.parcels(municipality);
CREATE INDEX IF NOT EXISTS idx_plans_main_status ON public.plans(main_status);
CREATE INDEX IF NOT EXISTS idx_plans_entity_subtype ON public.plans(entity_subtype);
CREATE INDEX IF NOT EXISTS idx_taba_pl_number ON public.taba_outlines(pl_number);

-- ─── Reload PostgREST schema cache ──────────────────────────
NOTIFY pgrst, 'reload schema';
