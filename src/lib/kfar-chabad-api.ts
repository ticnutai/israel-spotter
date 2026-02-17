/**
 * kfar-chabad-api.ts Γאף Client for the local FastAPI backend v2
 */

const API_BASE = "/api";

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
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

// --------------- Config ---------------

export async function getConfig(): Promise<KfarChabadConfig> {
  return fetchJSON(`${API_BASE}/config`);
}

// --------------- Gushim ---------------

export async function getGushim(): Promise<GushInfo[]> {
  const data = await fetchJSON<{ gushim: GushInfo[] }>(`${API_BASE}/gushim`);
  return data.gushim;
}

export async function getGush(gush: number): Promise<{ gush: GushInfo; parcels: ParcelInfo[] }> {
  return fetchJSON(`${API_BASE}/gushim/${gush}`);
}

export async function getGushParcels(gush: number): Promise<ParcelInfo[]> {
  const data = await fetchJSON<{ parcels: ParcelInfo[] }>(`${API_BASE}/gushim/${gush}/parcels`);
  return data.parcels;
}

export async function getParcelDocuments(gush: number, helka: number): Promise<{
  gush: number;
  helka: number;
  total: number;
  by_plan: { plan_number: string | null; documents: DocumentRecord[] }[];
  documents: DocumentRecord[];
}> {
  return fetchJSON(`${API_BASE}/gushim/${gush}/${helka}/documents`);
}

// --------------- Plans ---------------

export async function getPlans(gush?: number): Promise<PlanSummary[]> {
  const sp = gush ? `?gush=${gush}` : "";
  const data = await fetchJSON<{ plans: PlanSummary[] }>(`${API_BASE}/plans${sp}`);
  return data.plans;
}

export async function getPlanDetail(planNumber: string): Promise<{
  plan: PlanSummary;
  documents: DocumentRecord[];
  georef: GeorefEntry[];
}> {
  return fetchJSON(`${API_BASE}/plans/${encodeURIComponent(planNumber)}`);
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
}

export async function getDocumentStats(): Promise<DocumentStats> {
  return fetchJSON(`${API_BASE}/documents/stats`);
}

// --------------- Aerial ---------------

export async function getAerialYears(): Promise<AerialYearInfo[]> {
  const data = await fetchJSON<{ years: AerialYearInfo[] }>(`${API_BASE}/aerial/years`);
  return data.years;
}

// --------------- Georef ---------------

export async function getGeorefEntries(): Promise<GeorefEntry[]> {
  const data = await fetchJSON<{ georef: GeorefEntry[] }>(`${API_BASE}/georef`);
  return data.georef;
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
  const data = await fetchJSON<{ plans: PlanSummary[] }>(`${API_BASE}/plans`);
  return data.plans;
}
