-- ============================================================
-- Migration 003: New data tables from gushim_halakot_project
-- Tables: migrash_data, mmg_layers, building_rights, plan_instructions
-- Matches actual SQLite schema exactly
-- ============================================================

-- ─── MIGRASH_DATA: Parcel-level land rights info from XPA/Complot ───────────
CREATE TABLE IF NOT EXISTS public.migrash_data (
  id SERIAL PRIMARY KEY,
  gush INTEGER NOT NULL,
  helka INTEGER NOT NULL,
  migrash TEXT,
  migrash_plan TEXT,
  yeud TEXT,
  yeud_plan TEXT,
  shetach TEXT,
  address TEXT,
  plans_list TEXT,
  source TEXT,
  raw_json TEXT
);

ALTER TABLE public.migrash_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migrash_data_read" ON public.migrash_data FOR SELECT USING (true);
CREATE POLICY "migrash_data_insert" ON public.migrash_data FOR INSERT WITH CHECK (true);
CREATE POLICY "migrash_data_update" ON public.migrash_data FOR UPDATE USING (true);
CREATE POLICY "migrash_data_delete" ON public.migrash_data FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_migrash_data_gush ON public.migrash_data(gush);
CREATE INDEX IF NOT EXISTS idx_migrash_data_gush_helka ON public.migrash_data(gush, helka);

-- ─── MMG_LAYERS: MMG GeoJSON layer metadata ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mmg_layers (
  id SERIAL PRIMARY KEY,
  plan_number TEXT,
  layer_name TEXT NOT NULL,
  display_name TEXT,
  feature_count INTEGER DEFAULT 0,
  file_path TEXT NOT NULL,
  file_size INTEGER DEFAULT 0
);

ALTER TABLE public.mmg_layers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mmg_layers_read" ON public.mmg_layers FOR SELECT USING (true);
CREATE POLICY "mmg_layers_insert" ON public.mmg_layers FOR INSERT WITH CHECK (true);
CREATE POLICY "mmg_layers_update" ON public.mmg_layers FOR UPDATE USING (true);
CREATE POLICY "mmg_layers_delete" ON public.mmg_layers FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_mmg_layers_plan ON public.mmg_layers(plan_number);

-- ─── BUILDING_RIGHTS: זכויות בנייה from plans ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.building_rights (
  id SERIAL PRIMARY KEY,
  plan_number TEXT,
  description TEXT,
  quantity_json TEXT,
  raw_json TEXT
);

ALTER TABLE public.building_rights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "building_rights_read" ON public.building_rights FOR SELECT USING (true);
CREATE POLICY "building_rights_insert" ON public.building_rights FOR INSERT WITH CHECK (true);
CREATE POLICY "building_rights_update" ON public.building_rights FOR UPDATE USING (true);
CREATE POLICY "building_rights_delete" ON public.building_rights FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_building_rights_plan ON public.building_rights(plan_number);

-- ─── PLAN_INSTRUCTIONS: הוראות תכנית ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_instructions (
  id SERIAL PRIMARY KEY,
  plan_number TEXT,
  instruction_text TEXT
);

ALTER TABLE public.plan_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_instructions_read" ON public.plan_instructions FOR SELECT USING (true);
CREATE POLICY "plan_instructions_insert" ON public.plan_instructions FOR INSERT WITH CHECK (true);
CREATE POLICY "plan_instructions_update" ON public.plan_instructions FOR UPDATE USING (true);
CREATE POLICY "plan_instructions_delete" ON public.plan_instructions FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_plan_instructions_plan ON public.plan_instructions(plan_number);
