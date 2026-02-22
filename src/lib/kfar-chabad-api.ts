/**
 * kfar-chabad-api.ts – Client for the local FastAPI backend v2
 * Falls back to Supabase REST API when backend is unavailable (e.g. on Lovable)
 * Uses IndexedDB cache for instant data on repeat visits
 */

import { withCache, clearCache as clearLocalCache } from "./local-cache";
import { supabase } from "@/integrations/supabase/client";

const API_BASE = "/api";

// Re-export cache utilities
export { clearLocalCache };

// Supabase fallback config
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://txltujmbkhsszpvsgujs.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0.K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw";

let _backendAvailable: boolean | null = null; // null = not tested yet

async function supabaseGet<T>(table: string, params?: string): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params ? "?" + params : ""}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  return res.json();
}

async function supabaseCount(table: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) throw new Error(`Supabase count error ${res.status}`);
  const range = res.headers.get("content-range") || "";
  return parseInt(range.split("/").pop() || "0", 10);
}

/** Count rows with optional PostgREST filters (e.g. "&category=eq.plans&gush=eq.7188") */
async function supabaseFilteredCount(table: string, filters: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1${filters}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) throw new Error(`Supabase count error ${res.status}`);
  const range = res.headers.get("content-range") || "";
  return parseInt(range.split("/").pop() || "0", 10);
}

// --------------- Types ---------------

export interface GushInfo {
  gush: number;
  name: string;
  area_type: string;
  plan_count: number;
  permit_count: number;
  parcel_count: number;
  notes: string | null;
}

export interface ParcelInfo {
  id: number;
  gush: number;
  helka: number;
  plan_count: number;
  permit_count: number;
  doc_count: number;
  has_tashrit: number;
  notes: string | null;
}

export interface PlanSummary {
  id: number;
  plan_number: string;
  plan_name: string | null;
  status: string | null;
  plan_type: string | null;
  doc_count: number;
  gush_list: string | null;
  notes: string | null;
}

export interface DocumentRecord {
  id: number;
  gush: number;
  helka: number;
  plan_number: string | null;
  title: string;
  file_path: string;
  file_name: string;
  file_size: number;
  file_type: string;
  category: string;
  is_tashrit: number;
  is_georef: number;
  downloaded_at: string | null;
}

export interface AerialYearInfo {
  year: string;
  levels: {
    level: number;
    tile_count: number;
    stitched: string | null;
    stitched_size: number;
    georef: {
      pixel_size_x: number;
      pixel_size_y: number;
      origin_x: number;
      origin_y: number;
    } | null;
  }[];
}

export interface GeorefEntry {
  id: number;
  document_id: number | null;
  image_path: string;
  pixel_size_x: number;
  pixel_size_y: number;
  origin_x: number;
  origin_y: number;
  bbox_min_x: number;
  bbox_min_y: number;
  bbox_max_x: number;
  bbox_max_y: number;
  crs: string;
  method: string;
  file_name: string | null;
  plan_number: string | null;
  gush: number | null;
  helka: number | null;
}

export interface DocumentStats {
  total: number;
  by_category: Record<string, number>;
  by_gush: { gush: number; plan_count: number; permit_count: number; parcel_count: number }[];
  by_file_type: Record<string, number>;
  tashrit_count: number;
  georef_count: number;
}

export interface KfarChabadConfig {
  center: { x: number; y: number; crs: string };
  center_wgs84: { lat: number; lng: number };
  gushim: number[];
  crs: string;
  data_available: { aerial: boolean; plans: boolean; database: boolean };
  db_summary: Record<string, number>;
}

// --------------- Fetch helper ---------------

async function fetchJSON<T>(url: string): Promise<T> {
  // If we already know backend is down, skip trying
  if (_backendAvailable === false) {
    throw new Error("Backend unavailable");
  }
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      _backendAvailable = false;
      throw new Error("Backend returned non-JSON (HTML)");
    }
    if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
    _backendAvailable = true;
    return res.json();
  } catch (err) {
    _backendAvailable = false;
    throw err;
  }
}

/** Try local backend first, fall back to Supabase */
async function withFallback<T>(localFn: () => Promise<T>, cloudFn: () => Promise<T>): Promise<T> {
  try {
    return await localFn();
  } catch {
    return cloudFn();
  }
}

// --------------- Config ---------------

export async function getConfig(): Promise<KfarChabadConfig> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/config`),
    () => withCache("config", async () => {
      // Build config from Supabase data
      const gushim = await supabaseGet<{ gush: number }>("gushim", "select=gush");
      const gushIds = gushim.map(g => g.gush);
      const [gushCount, parcelCount, planCount, docCount, georefCount] = await Promise.all([
        supabaseCount("gushim"),
        supabaseCount("parcels"),
        supabaseCount("plans"),
        supabaseCount("documents"),
        supabaseCount("plan_georef"),
      ]);
      return {
        center: { x: 187353, y: 655659, crs: "EPSG:2039" },
        center_wgs84: { lat: 31.9604, lng: 34.8536 },
        gushim: gushIds,
        crs: "EPSG:2039",
        data_available: { aerial: false, plans: planCount > 0, database: true },
        db_summary: {
          gushim: gushCount,
          parcels: parcelCount,
          plans: planCount,
          documents: docCount,
          aerial_images: 0,
          plan_georef: georefCount,
        },
      };
    })
  );
}

// --------------- Gushim ---------------

export async function getGushim(): Promise<GushInfo[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ gushim: GushInfo[] }>(`${API_BASE}/gushim`);
      return data.gushim;
    },
    () => withCache("gushim", async () => {
      const rows = await supabaseGet<GushInfo>("gushim", "select=*&order=gush");
      return rows;
    })
  );
}

export async function getGush(gush: number): Promise<{ gush: GushInfo; parcels: ParcelInfo[] }> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/gushim/${gush}`),
    () => withCache(`gush:${gush}`, async () => {
      const gushRows = await supabaseGet<GushInfo>("gushim", `select=*&gush=eq.${gush}`);
      const parcelRows = await supabaseGet<ParcelInfo>("parcels", `select=*&gush=eq.${gush}&order=helka`);
      const g = gushRows[0] || { gush, name: "", area_type: "", plan_count: 0, permit_count: 0, parcel_count: 0, notes: null };
      return {
        gush: g,
        parcels: parcelRows,
      };
    })
  );
}

export async function getGushParcels(gush: number): Promise<ParcelInfo[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ parcels: ParcelInfo[] }>(`${API_BASE}/gushim/${gush}/parcels`);
      return data.parcels;
    },
    () => withCache(`parcels:${gush}`, async () => {
      const rows = await supabaseGet<ParcelInfo>("parcels", `select=*&gush=eq.${gush}&order=helka`);
      return rows;
    })
  );
}

export async function getParcelDocuments(gush: number, helka: number): Promise<{
  gush: number;
  helka: number;
  total: number;
  by_plan: { plan_number: string | null; documents: DocumentRecord[] }[];
  documents: DocumentRecord[];
}> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/gushim/${gush}/${helka}/documents`),
    () => withCache(`docs:${gush}:${helka}`, async () => {
      const docs = await supabaseGet<DocumentRecord>("documents", `select=*&gush=eq.${gush}&helka=eq.${helka}`);
      // Group documents by plan_number
      const planMap = new Map<string | null, DocumentRecord[]>();
      docs.forEach(d => {
        const key = d.plan_number || null;
        if (!planMap.has(key)) planMap.set(key, []);
        planMap.get(key)!.push(d);
      });
      const by_plan = Array.from(planMap.entries()).map(([plan_number, documents]) => ({
        plan_number,
        documents,
      }));
      return { gush, helka, total: docs.length, by_plan, documents: docs };
    })
  );
}

// --------------- Plans ---------------

export async function getPlans(gush?: number): Promise<PlanSummary[]> {
  return withFallback(
    async () => {
      const sp = gush ? `?gush=${gush}` : "";
      const data = await fetchJSON<{ plans: PlanSummary[] }>(`${API_BASE}/plans${sp}`);
      return data.plans;
    },
    () => withCache(`plans:${gush || 'all'}`, async () => {
      const filter = gush ? `&gush_list=ilike.*${gush}*` : "";
      const rows = await supabaseGet<PlanSummary>("plans", `select=*${filter}&order=plan_number`);
      return rows;
    })
  );
}

export async function getPlanDetail(planNumber: string): Promise<{
  plan: PlanSummary;
  documents: DocumentRecord[];
  georef: GeorefEntry[];
}> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/plans/${encodeURIComponent(planNumber)}`),
    () => withCache(`plan:${planNumber}`, async () => {
      const [plans, docs] = await Promise.all([
        supabaseGet<PlanSummary>("plans", `select=*&plan_number=eq.${encodeURIComponent(planNumber)}`),
        supabaseGet<DocumentRecord>("documents", `select=*&plan_number=eq.${encodeURIComponent(planNumber)}`),
      ]);
      const plan = plans[0] || { id: 0, plan_number: planNumber, plan_name: null, status: null, plan_type: null, doc_count: docs.length, gush_list: null, notes: null };
      const docIds = docs.map(d => d.id);
      let georefs: GeorefEntry[] = [];
      if (docIds.length > 0) {
        const georefRows = await supabaseGet<any>("plan_georef", `select=*&document_id=in.(${docIds.join(",")})`);
        georefs = georefRows.map(mapGeoref);
      }
      return { plan, documents: docs, georef: georefs };
    })
  );
}

// --------------- Documents ---------------

export async function getDocuments(params?: {
  category?: string;
  gush?: number;
  helka?: number;
  plan_number?: string;
  file_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ documents: DocumentRecord[]; total: number }> {
  return withFallback(
    async () => {
      const sp = new URLSearchParams();
      if (params?.category) sp.set("category", params.category);
      if (params?.gush) sp.set("gush", String(params.gush));
      if (params?.helka !== undefined) sp.set("helka", String(params.helka));
      if (params?.plan_number) sp.set("plan_number", params.plan_number);
      if (params?.file_type) sp.set("file_type", params.file_type);
      if (params?.search) sp.set("search", params.search);
      if (params?.limit) sp.set("limit", String(params.limit));
      if (params?.offset) sp.set("offset", String(params.offset));
      return fetchJSON(`${API_BASE}/documents?${sp}`);
    },
    async () => {
      let filter = "select=*";
      let countFilter = "";
      if (params?.category) { filter += `&category=eq.${encodeURIComponent(params.category)}`; countFilter += `&category=eq.${encodeURIComponent(params.category)}`; }
      if (params?.gush) { filter += `&gush=eq.${params.gush}`; countFilter += `&gush=eq.${params.gush}`; }
      if (params?.helka !== undefined) { filter += `&helka=eq.${params.helka}`; countFilter += `&helka=eq.${params.helka}`; }
      if (params?.plan_number) { filter += `&plan_number=eq.${encodeURIComponent(params.plan_number)}`; countFilter += `&plan_number=eq.${encodeURIComponent(params.plan_number)}`; }
      if (params?.file_type) { filter += `&file_type=eq.${encodeURIComponent(params.file_type)}`; countFilter += `&file_type=eq.${encodeURIComponent(params.file_type)}`; }
      if (params?.search) { filter += `&file_name=ilike.*${encodeURIComponent(params.search)}*`; countFilter += `&file_name=ilike.*${encodeURIComponent(params.search)}*`; }
      const limit = params?.limit || 50;
      const offset = params?.offset || 0;
      filter += `&limit=${limit}&offset=${offset}&order=id`;
      const rows = await supabaseGet<DocumentRecord>("documents", filter);
      // Count with same filters so pagination works correctly
      const total = await supabaseFilteredCount("documents", countFilter);
      return { documents: rows, total };
    }
  );
}

export async function getDocumentStats(): Promise<DocumentStats> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/documents/stats`),
    () => withCache("doc-stats", async () => {
      const total = await supabaseCount("documents");
      // Use a high limit to avoid PostgREST's default row cap (typically 1000)
      const [docs, gushim] = await Promise.all([
        supabaseGet<any>("documents", "select=category,file_size,file_type,is_tashrit,is_georef&limit=100000"),
        supabaseGet<any>("gushim", "select=gush,plan_count,permit_count,parcel_count&limit=100000"),
      ]);
      const by_category: Record<string, number> = {};
      const by_file_type: Record<string, number> = {};
      let tashrit_count = 0;
      let georef_count = 0;
      docs.forEach((d: any) => {
        const cat = d.category || "unknown";
        by_category[cat] = (by_category[cat] || 0) + 1;
        const ft = d.file_type || "unknown";
        by_file_type[ft] = (by_file_type[ft] || 0) + 1;
        if (d.is_tashrit) tashrit_count++;
        if (d.is_georef) georef_count++;
      });
      return {
        total,
        by_category,
        by_gush: gushim.map((g: any) => ({ gush: g.gush, plan_count: g.plan_count || 0, permit_count: g.permit_count || 0, parcel_count: g.parcel_count || 0 })),
        by_file_type,
        tashrit_count,
        georef_count,
      };
    })
  );
}

// --------------- Aerial ---------------

export async function getAerialYears(): Promise<AerialYearInfo[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ years: AerialYearInfo[] }>(`${API_BASE}/aerial/years`);
      return data.years;
    },
    async () => [] // no aerial data in cloud
  );
}

// --------------- Georef ---------------
// NOTE: getGeorefEntries removed — was exported but never imported by any component.
// Georef data is accessed via getPlanDetail() which returns georef entries per plan.

// --------------- URL builders ---------------

const STORAGE_BUCKET = "kfar-chabad-data";

export function aerialStitchedUrl(year: string, level: number = 7): string {
  return `${API_BASE}/aerial/${year}/stitched?level=${level}`;
}

export function aerialWorldfileUrl(year: string, level: number = 7): string {
  return `${API_BASE}/aerial/${year}/worldfile?level=${level}`;
}

export function planImageUrl(path: string): string {
  if (_backendAvailable === false) {
    // Supabase Storage fallback – plans are stored under plans/ prefix
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/plans/${path}`;
  }
  return `${API_BASE}/plans/image/${path}`;
}

export function documentFileUrl(docId: number): string {
  return `${API_BASE}/documents/file/${docId}`;
}

/**
 * Whether the local backend is currently reachable.
 * Components can use this to decide between documentFileUrl (backend)
 * and documentStorageUrl (Supabase Storage) when they hold a full DocumentRecord.
 */
export function isBackendAvailable(): boolean {
  return _backendAvailable !== false;
}

/**
 * Build a Supabase Storage public URL for a document by its file_path.
 * Use this when you have the file_path from a DocumentRecord and the backend is down.
 */
export function documentStorageUrl(filePath: string): string {
  // Strip leading ./kfar_chabad_data/ prefix if present
  const cleaned = filePath.replace(/^\.?\/?(kfar_chabad_data\/)/, "");
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${cleaned}`;
}

// --------------- Upload ---------------

export interface UploadResult {
  ok: boolean;
  document_id: number;
  file_name: string;
  file_size: number;
  file_type: string;
  path: string;
}

export async function uploadDocument(params: {
  file: File;
  gush: number;
  helka?: number;
  category?: string;
  plan_number?: string;
  title?: string;
  is_tashrit?: boolean;
}): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", params.file);
  fd.append("gush", String(params.gush));
  fd.append("helka", String(params.helka ?? 0));
  fd.append("category", params.category ?? "plans");
  if (params.plan_number) fd.append("plan_number", params.plan_number);
  if (params.title) fd.append("title", params.title);
  fd.append("is_tashrit", params.is_tashrit ? "1" : "0");

  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function getUploads(limit = 50, offset = 0): Promise<{ uploads: DocumentRecord[]; total: number }> {
  return withFallback(
    async () => fetchJSON(`${API_BASE}/uploads?limit=${limit}&offset=${offset}`),
    async () => {
      // Supabase fallback: query documents with upload paths
      const uploadFilter = "&file_path=like.*%2Fuploads%2F*";
      const rows = await supabaseGet<any>(
        "documents",
        `select=*${uploadFilter}&order=downloaded_at.desc&limit=${limit}&offset=${offset}`
      );
      const total = await supabaseFilteredCount("documents", uploadFilter);
      return { uploads: rows.map(mapDocument), total };
    }
  );
}

export async function deleteUpload(docId: number): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/uploads/${docId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
  } catch {
    // Supabase fallback
    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) throw new Error(error.message);
  }
}

// --------------- Plans list (for timeline) ---------------
// NOTE: getPlansForTimeline was identical to getPlans() and is removed.
// PlanTimeline uses getPlans() directly.

// --------------- GIS Layers ---------------

export interface GisLayerInfo {
  id?: number;
  layer_name: string;
  display_name?: string;
  category?: string;
  source?: string;
  file_path?: string;
  file_size?: number;
  feature_count?: number;
  geometry_type?: string;
}

export async function getGisLayers(params?: {
  category?: string;
  source?: string;
  search?: string;
}): Promise<GisLayerInfo[]> {
  return withFallback(
    async () => {
      const sp = new URLSearchParams();
      if (params?.category) sp.set("category", params.category);
      if (params?.source) sp.set("source", params.source);
      if (params?.search) sp.set("search", params.search);
      const qs = sp.toString();
      const data = await fetchJSON<{ layers: GisLayerInfo[]; total: number }>(
        `${API_BASE}/gis-layers${qs ? "?" + qs : ""}`
      );
      return data.layers;
    },
    () => withCache("gis-layers", async () => {
      const rows = await supabaseGet<GisLayerInfo>("gis_layers", "select=*&order=category,layer_name");
      return rows;
    })
  );
}

export function gisLayerGeoJsonUrl(layerName: string): string {
  return `${API_BASE}/gis-layers/${encodeURIComponent(layerName)}/geojson`;
}

// --------------- Migrash (lot data from Complot) ---------------

export interface MigrashRecord {
  id?: number;
  gush: number;
  helka: number;
  migrash?: string | number;
  migrash_number?: string;
  plan_number?: string;
  area_sqm?: number;
  land_use?: string;
  notes?: string;
  [key: string]: any;
}

export async function getMigrashData(gush: number, helka?: number): Promise<MigrashRecord[]> {
  return withFallback(
    async () => {
      const sp = new URLSearchParams({ gush: String(gush) });
      if (helka !== undefined) sp.set("helka", String(helka));
      const data = await fetchJSON<{ migrash: MigrashRecord[]; total: number }>(
        `${API_BASE}/migrash?${sp}`
      );
      return data.migrash;
    },
    () => withCache(`migrash:${gush}:${helka ?? "all"}`, async () => {
      let filter = `select=*&gush=eq.${gush}`;
      if (helka !== undefined) filter += `&helka=eq.${helka}`;
      return supabaseGet<MigrashRecord>("migrash_data", filter);
    })
  );
}

// --------------- MMG Layers ---------------

export interface MmgPlan {
  plan_number: string;
  layers: string[];
  layer_count: number;
}

export async function getMmgPlans(): Promise<MmgPlan[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ plans: MmgPlan[]; total: number }>(`${API_BASE}/mmg`);
      return data.plans;
    },
    () => withCache("mmg-plans", async () => {
      const rows = await supabaseGet<any>("mmg_layers", "select=plan_number,layer_name");
      const grouped: Record<string, string[]> = {};
      for (const r of rows) {
        if (!grouped[r.plan_number]) grouped[r.plan_number] = [];
        grouped[r.plan_number].push(r.layer_name);
      }
      return Object.entries(grouped).map(([plan_number, layers]) => ({
        plan_number,
        layers,
        layer_count: layers.length,
      }));
    })
  );
}

export function mmgLayerGeoJsonUrl(planNumber: string, layerName: string): string {
  return `${API_BASE}/mmg/${encodeURIComponent(planNumber)}/${encodeURIComponent(layerName)}.geojson`;
}

// --------------- Building Rights ---------------

export interface BuildingRight {
  id?: number;
  plan_number: string;
  zone?: string;
  land_use?: string;
  building_percentage?: number;
  max_floors?: number;
  max_height?: number;
  max_units?: number;
  notes?: string;
  data?: any;
  [key: string]: any;
}

export async function getBuildingRights(planNumber?: string): Promise<BuildingRight[]> {
  return withFallback(
    async () => {
      const sp = planNumber ? `?plan_number=${encodeURIComponent(planNumber)}` : "";
      const data = await fetchJSON<{ rights: BuildingRight[]; total: number }>(
        `${API_BASE}/building-rights${sp}`
      );
      return data.rights;
    },
    () => withCache(`building-rights:${planNumber ?? "all"}`, async () => {
      let filter = "select=*";
      if (planNumber) filter += `&plan_number=eq.${encodeURIComponent(planNumber)}`;
      return supabaseGet<BuildingRight>("building_rights", filter);
    })
  );
}

// --------------- Plan Instructions ---------------

export interface PlanInstruction {
  id?: number;
  plan_number: string;
  section?: string;
  content?: string;
  text?: string;
  [key: string]: any;
}

export async function getPlanInstructions(planNumber?: string): Promise<PlanInstruction[]> {
  return withFallback(
    async () => {
      const sp = planNumber ? `?plan_number=${encodeURIComponent(planNumber)}` : "";
      const data = await fetchJSON<{ instructions: PlanInstruction[]; total: number }>(
        `${API_BASE}/plan-instructions${sp}`
      );
      return data.instructions;
    },
    () => withCache(`plan-instructions:${planNumber ?? "all"}`, async () => {
      let filter = "select=*";
      if (planNumber) filter += `&plan_number=eq.${encodeURIComponent(planNumber)}`;
      return supabaseGet<PlanInstruction>("plan_instructions", filter);
    })
  );
}

// --------------- Supabase row mappers ---------------

function mapDocument(r: any): DocumentRecord {
  return {
    id: r.id,
    gush: r.gush ?? 0,
    helka: r.helka ?? 0,
    plan_number: r.plan_number ?? null,
    title: r.title || r.file_name || "",
    file_path: r.file_path ?? "",
    file_name: r.file_name ?? "",
    file_size: r.file_size ?? 0,
    file_type: r.file_type ?? "",
    category: r.category ?? "",
    is_tashrit: r.is_tashrit ?? 0,
    is_georef: r.is_georef ?? 0,
    downloaded_at: r.downloaded_at ?? null,
  };
}

function mapGeoref(r: any): GeorefEntry {
  return {
    id: r.id ?? 0,
    document_id: r.document_id ?? null,
    image_path: r.image_path ?? "",
    pixel_size_x: r.pixel_size_x ?? 0,
    pixel_size_y: r.pixel_size_y ?? 0,
    origin_x: r.origin_x ?? 0,
    origin_y: r.origin_y ?? 0,
    bbox_min_x: r.bbox_min_x ?? 0,
    bbox_min_y: r.bbox_min_y ?? 0,
    bbox_max_x: r.bbox_max_x ?? 0,
    bbox_max_y: r.bbox_max_y ?? 0,
    crs: r.crs ?? "EPSG:2039",
    method: r.method ?? "",
    file_name: r.file_name ?? null,
    plan_number: r.plan_number ?? null,
    gush: r.gush ?? null,
    helka: r.helka ?? null,
  };
}

// ─── Local Plans & Permits (DB-powered) ─────────────────────────────────────

export interface LocalPlanFile {
  name: string;
  size: number;
  type: string;
  path: string;
  title?: string;
}

export interface LocalPlan {
  plan_name: string;
  plan_display_name: string | null;
  entity_subtype: string | null;
  main_status: string | null;
  status_date: string | null;
  area_dunam: number | null;
  authority: string | null;
  goals: string | null;
  city_county: string | null;
  file_count: number;
  files: LocalPlanFile[];
  has_tashrit: boolean;
  has_takanon: boolean;
  has_pdf: boolean;
  has_image: boolean;
}

export interface LocalPermit {
  permit_id: string;
  file_count: number;
  files: LocalPlanFile[];
}

export interface TabaOutline {
  pl_number: string | null;
  pl_name: string | null;
  entity_subtype: string | null;
  status: string | null;
  area_dunam: number | null;
  land_use: string | null;
  plan_county: string | null;
  pl_url: string | null;
  main_status: string | null;
}

export interface LocalParcelDetail {
  gush: number;
  helka: number;
  legal_area_sqm: number | null;
  shape_area_sqm: number | null;
  status_text: string | null;
  municipality: string | null;
  county: string | null;
  region: string | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
  update_date: string | null;
  plan_count: number;
  permit_count: number;
  doc_count: number;
}

export interface LocalPlansResponse {
  gush: number;
  helka: number;
  plans: LocalPlan[];
  permits: LocalPermit[];
  taba_outlines: TabaOutline[];
  parcel_detail: LocalParcelDetail | null;
  plan_count: number;
  permit_count: number;
  taba_count: number;
}

export async function getLocalPlans(gush: number, helka: number): Promise<LocalPlansResponse> {
  return withFallback(
    async () => {
      const res = await fetch(`${API_BASE}/local-plans/${gush}/${helka}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        _backendAvailable = false;
        throw new Error("Backend returned non-JSON");
      }
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      _backendAvailable = true;
      return res.json();
    },
    () => withCache(`local-plans:${gush}:${helka}`, async () => {
      // Supabase cloud fallback – reconstruct LocalPlansResponse from cloud tables
      // 1. Get parcel detail
      const parcelRows = await supabaseGet<any>(
        "parcels",
        `select=*&gush=eq.${gush}&helka=eq.${helka}&limit=1`
      );
      const parcel = parcelRows[0] || null;
      const parcelDetail: LocalParcelDetail | null = parcel
        ? {
            gush: parcel.gush,
            helka: parcel.helka,
            legal_area_sqm: parcel.legal_area_sqm ?? null,
            shape_area_sqm: parcel.shape_area_sqm ?? null,
            status_text: parcel.status_text ?? null,
            municipality: parcel.municipality ?? null,
            county: parcel.county ?? null,
            region: parcel.region ?? null,
            centroid_lat: parcel.centroid_lat ?? null,
            centroid_lng: parcel.centroid_lng ?? null,
            update_date: parcel.update_date ?? null,
            plan_count: parcel.plan_count ?? 0,
            permit_count: parcel.permit_count ?? 0,
            doc_count: parcel.doc_count ?? 0,
          }
        : null;

      // 2. Get plan_blocks for this gush/helka → plan_numbers
      const planBlocks = await supabaseGet<{ plan_number: string }>(
        "plan_blocks",
        `select=plan_number&gush=eq.${gush}&helka=eq.${helka}`
      );
      const planNumbers = [...new Set(planBlocks.map((pb) => pb.plan_number))];

      // 3. Get plans + documents for those plan_numbers
      const plans: LocalPlan[] = [];
      for (const pn of planNumbers) {
        const [planRows, docRows] = await Promise.all([
          supabaseGet<any>("plans", `select=*&plan_number=eq.${encodeURIComponent(pn)}&limit=1`),
          supabaseGet<any>("documents", `select=*&plan_number=eq.${encodeURIComponent(pn)}`),
        ]);
        const plan = planRows[0];
        if (!plan) continue;
        const files: LocalPlanFile[] = docRows.map((d: any) => ({
          name: d.file_name || d.title || "",
          size: d.file_size || 0,
          type: d.file_type || "",
          path: d.file_path || "",
          title: d.title || undefined,
        }));
        plans.push({
          plan_name: pn,
          plan_display_name: plan.plan_name || null,
          entity_subtype: plan.entity_subtype || null,
          main_status: plan.main_status || plan.status || null,
          status_date: plan.status_date || null,
          area_dunam: plan.area_dunam || null,
          authority: plan.authority || null,
          goals: plan.goals || null,
          city_county: plan.city_county || null,
          file_count: files.length,
          files,
          has_tashrit: files.some((f) => docRows.find((d: any) => d.file_name === f.name)?.is_tashrit),
          has_takanon: files.some((f) => docRows.find((d: any) => d.file_name === f.name)?.is_takanon),
          has_pdf: files.some((f) => f.type === "pdf"),
          has_image: files.some((f) => ["jpg", "jpeg", "png", "tif", "tiff"].includes(f.type)),
        });
      }

      // 4. Get permits for this gush/helka
      const permitRows = await supabaseGet<any>(
        "permits",
        `select=*&gush=eq.${gush}&helka=eq.${helka}`
      );
      const permits: LocalPermit[] = [];
      for (const pr of permitRows) {
        const pdRows = await supabaseGet<any>(
          "permit_documents",
          `select=*&permit_id=eq.${pr.id}`
        );
        permits.push({
          permit_id: pr.permit_id,
          file_count: pdRows.length,
          files: pdRows.map((d: any) => ({
            name: d.file_name || "",
            size: d.file_size || 0,
            type: d.file_type || "",
            path: d.file_path || "",
          })),
        });
      }

      // 5. Get TABA outlines filtered by plan_blocks for this gush
      const tabaBlockRows = await supabaseGet<{ plan_number: string }>(
        "plan_blocks",
        `select=plan_number&gush=eq.${gush}`
      );
      const tabaPlanNumbers = [...new Set(tabaBlockRows.map((b) => b.plan_number))];
      let tabaOutlines: TabaOutline[] = [];
      if (tabaPlanNumbers.length > 0) {
        // Supabase `in` filter: pl_number=in.(val1,val2,...)
        const inList = tabaPlanNumbers.map((pn) => `"${pn}"`).join(",");
        const tabaRows = await supabaseGet<any>(
          "taba_outlines",
          `select=pl_number,pl_name,entity_subtype,status,area_dunam,land_use,plan_county,pl_url&pl_number=in.(${inList})`
        );
        tabaOutlines = tabaRows.map((t: any) => ({
          pl_number: t.pl_number ?? null,
          pl_name: t.pl_name ?? null,
          entity_subtype: t.entity_subtype ?? null,
          status: t.status ?? null,
          area_dunam: t.area_dunam ?? null,
          land_use: t.land_use ?? null,
          plan_county: t.plan_county ?? null,
          pl_url: t.pl_url ?? null,
          main_status: null,
        }));
      }

      return {
        gush,
        helka,
        plans,
        permits,
        taba_outlines: tabaOutlines,
        parcel_detail: parcelDetail,
        plan_count: plans.length,
        permit_count: permits.length,
        taba_count: tabaOutlines.length,
      };
    })
  );
}

export function getLocalFileUrl(path: string): string {
  return `${API_BASE}/local-file/${path}`;
}
