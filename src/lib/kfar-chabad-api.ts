/**
 * kfar-chabad-api.ts – Client for the local FastAPI backend v2
 * Falls back to Supabase REST API when backend is unavailable (e.g. on Lovable)
 */

const API_BASE = "/api";

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
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&head=true`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "count=exact",
    },
  });
  return parseInt(res.headers.get("content-range")?.split("/")[1] || "0", 10);
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
    async () => {
      // Build config from Supabase data
      const gushim = await supabaseGet<{ gush_id: number }>("gushim", "select=gush_id");
      const gushIds = gushim.map(g => g.gush_id);
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
    }
  );
}

// --------------- Gushim ---------------

export async function getGushim(): Promise<GushInfo[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ gushim: GushInfo[] }>(`${API_BASE}/gushim`);
      return data.gushim;
    },
    async () => {
      const rows = await supabaseGet<any>("gushim", "select=*&order=gush_id");
      return rows.map(r => ({
        gush: r.gush_id,
        name: r.gush_name || "",
        area_type: r.region || "",
        plan_count: 0,
        permit_count: 0,
        parcel_count: 0,
        notes: null,
      }));
    }
  );
}

export async function getGush(gush: number): Promise<{ gush: GushInfo; parcels: ParcelInfo[] }> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/gushim/${gush}`),
    async () => {
      const gushRows = await supabaseGet<any>("gushim", `select=*&gush_id=eq.${gush}`);
      const parcelRows = await supabaseGet<any>("parcels", `select=*&gush_id=eq.${gush}&order=parcel_num`);
      const g = gushRows[0] || { gush_id: gush, gush_name: "", region: "" };
      return {
        gush: { gush: g.gush_id, name: g.gush_name || "", area_type: g.region || "", plan_count: 0, permit_count: 0, parcel_count: parcelRows.length, notes: null },
        parcels: parcelRows.map((r: any) => ({ id: r.id, gush: r.gush_id, helka: parseInt(r.parcel_num) || 0, plan_count: 0, permit_count: 0, doc_count: 0, has_tashrit: 0, notes: null })),
      };
    }
  );
}

export async function getGushParcels(gush: number): Promise<ParcelInfo[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ parcels: ParcelInfo[] }>(`${API_BASE}/gushim/${gush}/parcels`);
      return data.parcels;
    },
    async () => {
      const rows = await supabaseGet<any>("parcels", `select=*&gush_id=eq.${gush}&order=parcel_num`);
      return rows.map((r: any) => ({ id: r.id, gush: r.gush_id, helka: parseInt(r.parcel_num) || 0, plan_count: 0, permit_count: 0, doc_count: 0, has_tashrit: 0, notes: null }));
    }
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
    async () => {
      const docs = await supabaseGet<any>("documents", `select=*&plan_id=not.is.null`);
      // Filter by plan_id that matches gush (simplified - return all docs for now)
      return { gush, helka, total: docs.length, by_plan: [], documents: docs.map(mapDocument) };
    }
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
    async () => {
      const filter = gush ? `&gush_id=eq.${gush}` : "";
      const rows = await supabaseGet<any>("plans", `select=*${filter}&order=plan_id`);
      return rows.map(mapPlan);
    }
  );
}

export async function getPlanDetail(planNumber: string): Promise<{
  plan: PlanSummary;
  documents: DocumentRecord[];
  georef: GeorefEntry[];
}> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/plans/${encodeURIComponent(planNumber)}`),
    async () => {
      const [plans, docs, georefs] = await Promise.all([
        supabaseGet<any>("plans", `select=*&plan_id=eq.${encodeURIComponent(planNumber)}`),
        supabaseGet<any>("documents", `select=*&plan_id=eq.${encodeURIComponent(planNumber)}`),
        supabaseGet<any>("plan_georef", `select=*&plan_id=eq.${encodeURIComponent(planNumber)}`),
      ]);
      return {
        plan: plans[0] ? mapPlan(plans[0]) : { id: 0, plan_number: planNumber, plan_name: "", plan_type: "", status: "", doc_count: docs.length, gush_list: null, notes: null },
        documents: docs.map(mapDocument),
        georef: georefs.map(mapGeoref),
      };
    }
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
      if (params?.plan_number) filter += `&plan_id=eq.${encodeURIComponent(params.plan_number)}`;
      if (params?.search) filter += `&file_name=ilike.*${encodeURIComponent(params.search)}*`;
      const limit = params?.limit || 50;
      const offset = params?.offset || 0;
      filter += `&limit=${limit}&offset=${offset}&order=id`;
      const rows = await supabaseGet<any>("documents", filter);
      const total = await supabaseCount("documents");
      return { documents: rows.map(mapDocument), total };
    }
  );
}

export async function getDocumentStats(): Promise<DocumentStats> {
  return withFallback(
    () => fetchJSON(`${API_BASE}/documents/stats`),
    async () => {
      const total = await supabaseCount("documents");
      const docs = await supabaseGet<any>("documents", "select=doc_type,file_size_kb");
      const by_type: Record<string, number> = {};
      let total_size = 0;
      docs.forEach((d: any) => {
        const t = d.doc_type || "unknown";
        by_type[t] = (by_type[t] || 0) + 1;
        total_size += d.file_size_kb || 0;
      });
      return { total, by_category: by_type, by_gush: [], by_file_type: by_type, tashrit_count: 0, georef_count: 0 };
    }
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

export async function getGeorefEntries(): Promise<GeorefEntry[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ georef: GeorefEntry[] }>(`${API_BASE}/georef`);
      return data.georef;
    },
    async () => {
      const rows = await supabaseGet<any>("plan_georef", "select=*");
      return rows.map(mapGeoref);
    }
  );
}

// --------------- URL builders ---------------

export function aerialStitchedUrl(year: string, level: number = 7): string {
  return `${API_BASE}/aerial/${year}/stitched?level=${level}`;
}

export function aerialWorldfileUrl(year: string, level: number = 7): string {
  return `${API_BASE}/aerial/${year}/worldfile?level=${level}`;
}

export function planImageUrl(path: string): string {
  return `${API_BASE}/plans/image/${path}`;
}

export function documentFileUrl(docId: number): string {
  return `${API_BASE}/documents/file/${docId}`;
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
  return fetchJSON(`${API_BASE}/uploads?limit=${limit}&offset=${offset}`);
}

export async function deleteUpload(docId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/uploads/${docId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

// --------------- Plans list (for timeline) ---------------

export async function getPlansForTimeline(): Promise<PlanSummary[]> {
  return withFallback(
    async () => {
      const data = await fetchJSON<{ plans: PlanSummary[] }>(`${API_BASE}/plans`);
      return data.plans;
    },
    async () => {
      const rows = await supabaseGet<any>("plans", "select=*&order=plan_id");
      return rows.map(mapPlan);
    }
  );
}

// --------------- Supabase row mappers ---------------

function mapPlan(r: any): PlanSummary {
  return {
    id: r.id || 0,
    plan_number: r.plan_id || r.plan_number || "",
    plan_name: r.plan_name || "",
    plan_type: r.plan_type || "",
    status: r.status || "",
    doc_count: 0,
    gush_list: r.gush_list || null,
    notes: r.notes || null,
  };
}

function mapDocument(r: any): DocumentRecord {
  return {
    id: r.id,
    gush: r.gush || 0,
    helka: r.helka || 0,
    plan_number: r.plan_id || r.plan_number || null,
    category: r.doc_type || r.category || "",
    title: r.title || r.file_name || "",
    file_name: r.file_name || "",
    file_type: r.file_type || (r.file_name || "").split(".").pop() || "",
    file_path: r.file_path || "",
    file_size: r.file_size || r.file_size_kb || 0,
    is_tashrit: r.is_tashrit || 0,
    is_georef: r.is_georef || 0,
    downloaded_at: r.downloaded_at || null,
  };
}

function mapGeoref(r: any): GeorefEntry {
  return {
    id: r.id || 0,
    document_id: r.document_id || null,
    image_path: r.image_path || "",
    pixel_size_x: r.pixel_size_x || 0,
    pixel_size_y: r.pixel_size_y || 0,
    origin_x: r.origin_x || 0,
    origin_y: r.origin_y || 0,
    bbox_min_x: r.bbox_min_x || 0,
    bbox_min_y: r.bbox_min_y || 0,
    bbox_max_x: r.bbox_max_x || 0,
    bbox_max_y: r.bbox_max_y || 0,
    crs: r.crs || "EPSG:2039",
    method: r.method || "",
    file_name: r.file_name || null,
    plan_number: r.plan_id || r.plan_number || null,
    gush: r.gush || null,
    helka: r.helka || null,
  };
}
