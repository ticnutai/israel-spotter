"""
backend/api.py – FastAPI server for Kfar Chabad GIS data
=========================================================

Serves:
  • Gush → Helka → Plan hierarchical navigation
  • Local aerial tile imagery (georeferenced)
  • Plan map images + georeferencing metadata
  • Document listings from normalized SQLite DB
  • Permit/plan metadata queries

Run:
  cd backend
  uvicorn api:app --reload --port 3001
"""

import json
import logging
import os
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger("api")

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "kfar_chabad_data"
GIS_DIR = BASE_DIR / "gis_downloads"
AERIAL_DIR = GIS_DIR / "aerial"
PLANS_DIR = DATA_DIR / "plans"
PERMITS_DIR = DATA_DIR / "permits"
PARCEL_DETAILS_DIR = DATA_DIR / "parcel_details"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_PATH = BASE_DIR / "kfar_chabad_documents.db"

# ─── Kfar Chabad Constants ───────────────────────────────────────────────────
KFAR_CHABAD_CENTER = {"x": 187353, "y": 655659, "crs": "EPSG:2039"}
KFAR_CHABAD_CENTER_WGS84 = {"lat": 31.9604, "lng": 34.8536}
KFAR_CHABAD_GUSHIM = [6256, 6258, 6260, 6261, 6262, 6269, 6272, 6280, 7187, 7188, 7196, 7311]

# ─── Supabase Cloud Fallback ─────────────────────────────────────────────────
SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://txltujmbkhsszpvsgujs.supabase.co"
)
SUPABASE_KEY = os.environ.get(
    "SUPABASE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0."
    "K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw",
)

_supabase_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def _has_local_db() -> bool:
    """Check if local SQLite exists."""
    return DB_PATH.exists()


def supabase_get(table: str, params: str = "") -> list[dict]:
    """Query Supabase REST API. Returns list of dicts."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}" if params else f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        resp = httpx.get(url, headers=_supabase_headers, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning(f"Supabase query failed for {table}: {e}")
        return []


def supabase_count(table: str) -> int:
    """Get row count from Supabase."""
    try:
        resp = httpx.head(
            f"{SUPABASE_URL}/rest/v1/{table}?select=count",
            headers={**_supabase_headers, "Prefer": "count=exact"},
            timeout=10,
        )
        return int(resp.headers.get("content-range", "0/0").split("/")[-1])
    except Exception:
        return 0


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Kfar Chabad GIS API",
    description="מערכת GIS לכפר חב\"ד – מסמכי תכנון, צילומי אוויר, גיאורפרנס",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Database helper ─────────────────────────────────────────────────────────
def get_db():
    """Get local SQLite connection. Returns None if DB doesn't exist."""
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ─── Root ─────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "name": "Kfar Chabad GIS API",
        "version": "2.0.0",
        "endpoints": {
            "config": "/api/config",
            "gushim": "/api/gushim",
            "parcels": "/api/gushim/{gush}/parcels",
            "parcel_docs": "/api/gushim/{gush}/{helka}/documents",
            "plans": "/api/plans",
            "plan_detail": "/api/plans/{plan_number}",
            "documents": "/api/documents",
            "documents_stats": "/api/documents/stats",
            "aerial_years": "/api/aerial/years",
            "georef": "/api/georef",
        },
    }


# ─── Configuration ───────────────────────────────────────────────────────────
@app.get("/api/config")
async def get_config():
    """Return project configuration and DB summary."""
    conn = get_db()
    source = "local"
    if conn:
        try:
            summary = {}
            for t in ["gushim", "parcels", "plans", "documents", "aerial_images",
                      "plan_georef", "permits", "permit_documents", "taba_outlines", "plan_blocks"]:
                try:
                    summary[t] = conn.execute(f"SELECT COUNT(*) c FROM {t}").fetchone()["c"]
                except Exception:
                    summary[t] = 0
        finally:
            conn.close()
    else:
        source = "cloud"
        summary = {}
        for t in ["gushim", "parcels", "plans", "documents", "plan_georef"]:
            summary[t] = supabase_count(t)
        summary["aerial_images"] = 0

    return {
        "center": KFAR_CHABAD_CENTER,
        "center_wgs84": KFAR_CHABAD_CENTER_WGS84,
        "gushim": KFAR_CHABAD_GUSHIM,
        "crs": "EPSG:2039",
        "data_source": source,
        "data_available": {
            "aerial": AERIAL_DIR.exists(),
            "plans": PLANS_DIR.exists(),
            "database": _has_local_db(),
            "cloud": True,
        },
        "db_summary": summary,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GUSHIM  (blocks)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/gushim")
async def list_gushim():
    """List all gushim with counts."""
    conn = get_db()
    if conn:
        try:
            rows = conn.execute("SELECT * FROM gushim ORDER BY gush").fetchall()
            return {"gushim": [dict(r) for r in rows], "source": "local"}
        finally:
            conn.close()
    # Fallback: Supabase
    rows = supabase_get("gushim", "order=gush.asc")
    return {"gushim": rows, "source": "cloud"}


@app.get("/api/gushim/{gush}")
async def get_gush(gush: int):
    """Get details for a specific gush, including its parcels."""
    conn = get_db()
    if conn:
        try:
            g = conn.execute("SELECT * FROM gushim WHERE gush = ?", (gush,)).fetchone()
            if not g:
                raise HTTPException(404, f"Gush {gush} not found")
            parcels = conn.execute(
                "SELECT * FROM parcels WHERE gush = ? ORDER BY helka", (gush,)
            ).fetchall()
            return {"gush": dict(g), "parcels": [dict(p) for p in parcels], "source": "local"}
        finally:
            conn.close()
    # Fallback: Supabase
    gushim = supabase_get("gushim", f"gush=eq.{gush}")
    if not gushim:
        raise HTTPException(404, f"Gush {gush} not found")
    parcels = supabase_get("parcels", f"gush=eq.{gush}&order=helka.asc")
    return {"gush": gushim[0], "parcels": parcels, "source": "cloud"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PARCELS  (gush + helka combos)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/gushim/{gush}/parcels")
async def list_parcels(gush: int):
    """List all parcels (helkot) for a gush."""
    conn = get_db()
    if conn:
        try:
            rows = conn.execute(
                "SELECT * FROM parcels WHERE gush = ? ORDER BY helka", (gush,)
            ).fetchall()
            return {"gush": gush, "parcels": [dict(r) for r in rows], "source": "local"}
        finally:
            conn.close()
    # Fallback: Supabase
    rows = supabase_get("parcels", f"gush=eq.{gush}&order=helka.asc")
    return {"gush": gush, "parcels": rows, "source": "cloud"}


@app.get("/api/gushim/{gush}/{helka}/documents")
async def list_parcel_documents(gush: int, helka: int):
    """List all documents for a specific gush/helka parcel."""
    conn = get_db()

    def _group_by_plan(docs):
        by_plan: dict = {}
        for d in docs:
            pn = d.get("plan_number") or "__no_plan__"
            if pn not in by_plan:
                by_plan[pn] = {"plan_number": pn if pn != "__no_plan__" else None, "documents": []}
            by_plan[pn]["documents"].append(d)
        return list(by_plan.values())

    if conn:
        try:
            rows = conn.execute(
                "SELECT * FROM documents WHERE gush = ? AND helka = ? ORDER BY category, plan_number, file_name",
                (gush, helka),
            ).fetchall()
            docs = [dict(d) for d in rows]
            return {
                "gush": gush, "helka": helka, "total": len(docs),
                "by_plan": _group_by_plan(docs), "documents": docs, "source": "local",
            }
        finally:
            conn.close()
    # Fallback: Supabase
    docs = supabase_get("documents", f"gush=eq.{gush}&helka=eq.{helka}&order=category.asc,plan_number.asc,file_name.asc")
    return {
        "gush": gush, "helka": helka, "total": len(docs),
        "by_plan": _group_by_plan(docs), "documents": docs, "source": "cloud",
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PLANS  (unique plan numbers)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/plans")
async def list_plans(
    gush: Optional[int] = None,
):
    """List all unique plans. Optionally filter by gush."""
    conn = get_db()
    if conn:
        try:
            if gush:
                rows = conn.execute(
                    "SELECT * FROM plans WHERE gush_list LIKE ? ORDER BY plan_number",
                    (f"%{gush}%",),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM plans ORDER BY plan_number"
                ).fetchall()
            return {"plans": [dict(r) for r in rows], "source": "local"}
        finally:
            conn.close()
    # Fallback: Supabase
    params = "order=plan_number.asc"
    if gush:
        params += f"&gush_list=like.*{gush}*"
    rows = supabase_get("plans", params)
    return {"plans": rows, "source": "cloud"}


@app.get("/api/plans/{plan_number:path}")
async def get_plan_detail(plan_number: str):
    """Get all documents associated with a plan number."""
    conn = get_db()
    if conn:
        try:
            plan = conn.execute(
                "SELECT * FROM plans WHERE plan_number = ?", (plan_number,)
            ).fetchone()
            if not plan:
                raise HTTPException(404, f"Plan '{plan_number}' not found")
            docs = conn.execute(
                "SELECT * FROM documents WHERE plan_number = ? ORDER BY gush, helka, file_name",
                (plan_number,),
            ).fetchall()
            georef = conn.execute(
                "SELECT pg.* FROM plan_georef pg "
                "JOIN documents d ON pg.document_id = d.id "
                "WHERE d.plan_number = ?",
                (plan_number,),
            ).fetchall()
            return {
                "plan": dict(plan), "documents": [dict(d) for d in docs],
                "georef": [dict(g) for g in georef], "source": "local",
            }
        finally:
            conn.close()
    # Fallback: Supabase
    import urllib.parse
    encoded = urllib.parse.quote(plan_number)
    plans = supabase_get("plans", f"plan_number=eq.{encoded}")
    if not plans:
        raise HTTPException(404, f"Plan '{plan_number}' not found")
    docs = supabase_get("documents", f"plan_number=eq.{encoded}&order=gush.asc,helka.asc,file_name.asc")
    return {"plan": plans[0], "documents": docs, "georef": [], "source": "cloud"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PARCEL INFO  (DB-powered – replaces filesystem scanning for speed)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/local-plans/{gush}/{helka}")
async def get_local_plans_for_parcel(gush: int, helka: int):
    """Fast DB query: plans, permits, parcel detail, and TABA outlines for a parcel."""
    conn = get_db()
    if not conn:
        raise HTTPException(503, "Requires local database – run: python backend/import_all_data.py")

    try:
        # ── Parcel detail ──
        parcel_row = conn.execute(
            "SELECT * FROM parcels WHERE gush = ? AND helka = ?", (gush, helka)
        ).fetchone()
        parcel_detail = dict(parcel_row) if parcel_row else None

        # ── Plans covering this parcel (via plan_blocks linkage) ──
        plan_rows = conn.execute("""
            SELECT DISTINCT p.*
            FROM plans p
            JOIN plan_blocks pb ON pb.plan_number = p.plan_number
            WHERE pb.gush = ? AND (pb.helka = ? OR pb.helka IS NULL)
            ORDER BY p.plan_number
        """, (gush, helka)).fetchall()
        plans_list = []
        for pr in plan_rows:
            p = dict(pr)
            # Get documents for this plan
            doc_rows = conn.execute(
                "SELECT file_name, file_size, file_type, file_path, title, "
                "is_tashrit, is_takanon, subcategory FROM documents "
                "WHERE plan_number = ? ORDER BY file_name",
                (p["plan_number"],)
            ).fetchall()
            files = [{
                "name": d["file_name"],
                "size": d["file_size"],
                "type": d["file_type"],
                "path": d["file_path"],
                "title": d["title"],
            } for d in doc_rows]
            plans_list.append({
                "plan_name": p["plan_number"],
                "plan_display_name": p["plan_name"],
                "entity_subtype": p.get("entity_subtype"),
                "main_status": p.get("main_status") or p.get("status"),
                "status_date": p.get("status_date"),
                "area_dunam": p.get("area_dunam"),
                "authority": p.get("authority"),
                "goals": p.get("goals"),
                "city_county": p.get("city_county"),
                "file_count": len(files),
                "files": files,
                "has_tashrit": any(d["is_tashrit"] for d in doc_rows),
                "has_takanon": any(d["is_takanon"] for d in doc_rows),
                "has_pdf": any(d["file_type"] == "pdf" for d in doc_rows),
                "has_image": any(d["file_type"] in ("jpg", "jpeg", "png", "tif", "tiff", "image") for d in doc_rows),
            })

        # ── Also add plans from documents table (local_scan plans) ──
        local_doc_rows = conn.execute(
            "SELECT DISTINCT plan_number FROM documents "
            "WHERE gush = ? AND helka = ? AND subcategory = 'local_scan' "
            "AND plan_number IS NOT NULL",
            (gush, helka)
        ).fetchall()
        existing_plan_numbers = {p["plan_name"] for p in plans_list}
        for ldr in local_doc_rows:
            pn = ldr["plan_number"]
            if pn in existing_plan_numbers:
                continue
            doc_rows = conn.execute(
                "SELECT file_name, file_size, file_type, file_path, title, "
                "is_tashrit, is_takanon, subcategory FROM documents "
                "WHERE gush = ? AND helka = ? AND plan_number = ? ORDER BY file_name",
                (gush, helka, pn)
            ).fetchall()
            files = [{
                "name": d["file_name"],
                "size": d["file_size"],
                "type": d["file_type"],
                "path": d["file_path"],
                "title": d["title"],
            } for d in doc_rows]
            plans_list.append({
                "plan_name": pn,
                "plan_display_name": None,
                "entity_subtype": None,
                "main_status": None,
                "status_date": None,
                "area_dunam": None,
                "authority": None,
                "goals": None,
                "city_county": None,
                "file_count": len(files),
                "files": files,
                "has_tashrit": any(d["is_tashrit"] for d in doc_rows),
                "has_takanon": any(d["is_takanon"] for d in doc_rows),
                "has_pdf": any(d["file_type"] == "pdf" for d in doc_rows),
                "has_image": any(d["file_type"] in ("jpg", "jpeg", "png", "tif", "tiff", "image") for d in doc_rows),
            })

        # ── Permits ──
        permit_rows = conn.execute(
            "SELECT p.*, pd.file_name, pd.file_path, pd.file_size, pd.file_type "
            "FROM permits p "
            "LEFT JOIN permit_documents pd ON pd.permit_id = p.id "
            "WHERE p.gush = ? AND p.helka = ? "
            "ORDER BY p.permit_id, pd.file_name",
            (gush, helka)
        ).fetchall()
        permits_map: dict[str, dict] = {}
        for pr in permit_rows:
            pid = pr["permit_id"]
            if pid not in permits_map:
                permits_map[pid] = {"permit_id": pid, "file_count": 0, "files": []}
            if pr["file_name"]:
                permits_map[pid]["files"].append({
                    "name": pr["file_name"],
                    "size": pr["file_size"],
                    "type": pr["file_type"] or "",
                    "path": pr["file_path"],
                })
                permits_map[pid]["file_count"] = len(permits_map[pid]["files"])
        permits_list = list(permits_map.values())

        # ── TABA outlines covering this gush ──
        taba_rows = conn.execute(
            "SELECT pl_number, pl_name, entity_subtype, status, area_dunam, "
            "land_use, plan_county, pl_url, main_status "
            "FROM taba_outlines WHERE pl_number IN "
            "(SELECT plan_number FROM plan_blocks WHERE gush = ? AND (helka = ? OR helka IS NULL)) "
            "ORDER BY pl_number",
            (gush, helka)
        ).fetchall()
        # If none found via plan_blocks, get all TABA for this area
        if not taba_rows:
            taba_rows = conn.execute(
                "SELECT pl_number, pl_name, entity_subtype, status, area_dunam, "
                "land_use, plan_county, pl_url, depositing_date as main_status "
                "FROM taba_outlines ORDER BY pl_number"
            ).fetchall()
        taba_list = [dict(t) for t in taba_rows]

        return {
            "gush": gush,
            "helka": helka,
            "plans": plans_list,
            "permits": permits_list,
            "taba_outlines": taba_list,
            "parcel_detail": parcel_detail,
            "plan_count": len(plans_list),
            "permit_count": len(permits_list),
            "taba_count": len(taba_list),
        }
    finally:
        conn.close()


@app.get("/api/local-plans/{gush}")
async def get_local_plans_for_gush(gush: int):
    """Fast DB query: all plans/permits across all helkot for a gush."""
    conn = get_db()
    if not conn:
        raise HTTPException(503, "Requires local database")
    try:
        # Plans covering this gush
        plan_rows = conn.execute("""
            SELECT DISTINCT p.plan_number, p.plan_name, p.main_status,
                   p.entity_subtype, p.area_dunam, p.doc_count
            FROM plans p
            JOIN plan_blocks pb ON pb.plan_number = p.plan_number
            WHERE pb.gush = ?
            ORDER BY p.plan_number
        """, (gush,)).fetchall()

        # Permits in this gush
        permit_rows = conn.execute(
            "SELECT permit_id, helka, file_count FROM permits WHERE gush = ? ORDER BY helka, permit_id",
            (gush,)
        ).fetchall()

        return {
            "gush": gush,
            "plans": [dict(r) for r in plan_rows],
            "permits": [dict(r) for r in permit_rows],
            "total_plans": len(plan_rows),
            "total_permits": len(permit_rows),
        }
    finally:
        conn.close()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  TABA  (Planning outlines)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/taba")
async def list_taba():
    """List all TABA planning outlines (without geometry)."""
    conn = get_db()
    if not conn:
        return {"outlines": [], "total": 0}
    try:
        rows = conn.execute(
            "SELECT id, pl_number, pl_name, entity_subtype, status, area_dunam, "
            "land_use, district, jurisdiction, plan_county, pl_url, "
            "depositing_date, last_update "
            "FROM taba_outlines ORDER BY pl_number"
        ).fetchall()
        return {"outlines": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@app.get("/api/taba/geojson")
async def taba_geojson():
    """Return TABA outlines as GeoJSON FeatureCollection for map display."""
    conn = get_db()
    if not conn:
        # Fall back to file
        taba_file = DATA_DIR / "taba_kfar_chabad.geojson"
        if taba_file.exists():
            with open(taba_file, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"type": "FeatureCollection", "features": []}
    try:
        rows = conn.execute(
            "SELECT geometry_json, properties_json FROM taba_outlines"
        ).fetchall()
        features = []
        for r in rows:
            geom = json.loads(r["geometry_json"]) if r["geometry_json"] else None
            props = json.loads(r["properties_json"]) if r["properties_json"] else {}
            if geom:
                features.append({"type": "Feature", "geometry": geom, "properties": props})
        return {"type": "FeatureCollection", "features": features}
    finally:
        conn.close()


@app.get("/api/local-file/{file_path:path}")
async def serve_local_file(file_path: str):
    """Serve a file from kfar_chabad_data or docs (plans, permits, etc)."""
    full = BASE_DIR / file_path
    # Security: must be under DATA_DIR or GIS_DIR
    try:
        resolved = full.resolve()
        if not (resolved.is_relative_to(DATA_DIR.resolve()) or
                resolved.is_relative_to(GIS_DIR.resolve())):
            raise ValueError
    except (ValueError, AttributeError):
        raise HTTPException(403, "Access denied")
    if not full.is_file():
        raise HTTPException(404, "File not found")
    ext = full.suffix.lower()
    media_map = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".tif": "image/tiff",
        ".dwg": "application/octet-stream",
        ".dwfx": "application/octet-stream",
        ".kml": "application/vnd.google-earth.kml+xml",
        ".zip": "application/zip",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
    }
    return FileResponse(full, media_type=media_map.get(ext, "application/octet-stream"), filename=full.name)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DOCUMENTS  (general query)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/documents")
async def list_documents(
    category: Optional[str] = None,
    gush: Optional[int] = None,
    helka: Optional[int] = None,
    plan_number: Optional[str] = None,
    file_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=1000),
    offset: int = 0,
):
    """Query downloaded documents with rich filtering."""
    conn = get_db()
    if conn:
        try:
            where_parts = []
            params: list = []
            if category:
                where_parts.append("category = ?")
                params.append(category)
            if gush:
                where_parts.append("gush = ?")
                params.append(gush)
            if helka is not None:
                where_parts.append("helka = ?")
                params.append(helka)
            if plan_number:
                where_parts.append("plan_number LIKE ?")
                params.append(f"%{plan_number}%")
            if file_type:
                where_parts.append("file_type = ?")
                params.append(file_type)
            if search:
                where_parts.append("(title LIKE ? OR file_name LIKE ? OR plan_number LIKE ?)")
                params.extend([f"%{search}%"] * 3)

            where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
            total = conn.execute(f"SELECT COUNT(*) FROM documents {where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM documents {where} ORDER BY gush, helka, plan_number, file_name LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()

            return {
                "documents": [dict(r) for r in rows], "total": total,
                "limit": limit, "offset": offset, "source": "local",
            }
        finally:
            conn.close()

    # Fallback: Supabase
    filters = []
    if category:
        filters.append(f"category=eq.{category}")
    if gush:
        filters.append(f"gush=eq.{gush}")
    if helka is not None:
        filters.append(f"helka=eq.{helka}")
    if file_type:
        filters.append(f"file_type=eq.{file_type}")
    if plan_number:
        filters.append(f"plan_number=like.*{plan_number}*")
    if search:
        filters.append(f"or=(title.ilike.*{search}*,file_name.ilike.*{search}*,plan_number.ilike.*{search}*)")
    filters.append("order=gush.asc,helka.asc,plan_number.asc,file_name.asc")
    filters.append(f"limit={limit}&offset={offset}")
    rows = supabase_get("documents", "&".join(filters))
    return {
        "documents": rows, "total": len(rows),
        "limit": limit, "offset": offset, "source": "cloud",
    }


@app.get("/api/documents/stats")
async def document_stats():
    """Get comprehensive statistics."""
    conn = get_db()
    if conn:
        try:
            by_category = {}
            for row in conn.execute("SELECT category, COUNT(*) c FROM documents GROUP BY category"):
                by_category[row["category"]] = row["c"]

            by_gush = conn.execute(
                "SELECT gush, plan_count, permit_count, parcel_count FROM gushim "
                "WHERE plan_count > 0 OR permit_count > 0 ORDER BY gush"
            ).fetchall()

            by_type = {}
            for row in conn.execute("SELECT file_type, COUNT(*) c FROM documents GROUP BY file_type"):
                by_type[row["file_type"]] = row["c"]

            tashrit_count = conn.execute("SELECT COUNT(*) c FROM documents WHERE is_tashrit = 1").fetchone()["c"]
            georef_count = conn.execute("SELECT COUNT(*) c FROM documents WHERE is_georef = 1").fetchone()["c"]

            return {
                "total": sum(by_category.values()), "by_category": by_category,
                "by_gush": [dict(r) for r in by_gush], "by_file_type": by_type,
                "tashrit_count": tashrit_count, "georef_count": georef_count,
                "source": "local",
            }
        finally:
            conn.close()

    # Fallback: Supabase (simplified stats)
    docs = supabase_get("documents", "select=category,file_type,is_tashrit,is_georef,gush")
    by_category: dict = {}
    by_type: dict = {}
    tashrit = 0
    georef = 0
    for d in docs:
        cat = d.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0) + 1
        ft = d.get("file_type", "unknown")
        by_type[ft] = by_type.get(ft, 0) + 1
        if d.get("is_tashrit"):
            tashrit += 1
        if d.get("is_georef"):
            georef += 1
    gushim = supabase_get("gushim", "plan_count=gt.0&order=gush.asc&select=gush,plan_count,permit_count,parcel_count")
    return {
        "total": len(docs), "by_category": by_category,
        "by_gush": gushim, "by_file_type": by_type,
        "tashrit_count": tashrit, "georef_count": georef,
        "source": "cloud",
    }


@app.get("/api/documents/file/{doc_id}")
async def get_document_file(doc_id: int):
    """Serve a specific document file by its DB id."""
    conn = get_db()
    if not conn:
        raise HTTPException(503, "File serving requires local database")
    try:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Document not found")
        fpath = Path(row["file_path"])
        if not fpath.is_absolute():
            fpath = BASE_DIR / str(row["file_path"]).lstrip("./")
        if not fpath.exists():
            raise HTTPException(404, f"File not found on disk: {row['file_path']}")
        ext = fpath.suffix.lower()
        media_map = {
            ".pdf": "application/pdf",
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".tif": "image/tiff",
            ".dwfx": "application/octet-stream",
        }
        return FileResponse(fpath, media_type=media_map.get(ext, "application/octet-stream"))
    finally:
        conn.close()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  AERIAL PHOTOS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/aerial/years")
async def list_aerial_years():
    """List available aerial photo years from DB."""
    conn = get_db()
    if not conn:
        return {"years": [], "note": "Aerial data requires local database"}
    try:
        rows = conn.execute(
            "SELECT year, level, tile_count, stitched_path, stitched_size, "
            "pixel_size_x, pixel_size_y, origin_x, origin_y "
            "FROM aerial_images ORDER BY year, level"
        ).fetchall()

        # Group by year
        years_map: dict = {}
        for r in rows:
            r = dict(r)
            yr = r["year"]
            if yr not in years_map:
                years_map[yr] = {"year": yr, "levels": []}
            years_map[yr]["levels"].append({
                "level": r["level"],
                "tile_count": r["tile_count"],
                "stitched": r["stitched_path"],
                "stitched_size": r["stitched_size"],
                "georef": {
                    "pixel_size_x": r["pixel_size_x"],
                    "pixel_size_y": r["pixel_size_y"],
                    "origin_x": r["origin_x"],
                    "origin_y": r["origin_y"],
                } if r["pixel_size_x"] else None,
            })

        return {"years": list(years_map.values())}
    finally:
        conn.close()


@app.get("/api/aerial/{year}/tiles")
async def list_aerial_tiles(year: str, level: int = 7):
    """List available tiles for a specific year and level."""
    level_dir = AERIAL_DIR / year / f"level_{level}"
    if not level_dir.exists():
        raise HTTPException(404, f"No tiles for year={year} level={level}")

    tiles = []
    for f in sorted(level_dir.glob("tile_*")):
        parts = f.stem.split("_")
        if len(parts) == 4:
            tiles.append({
                "filename": f.name,
                "level": int(parts[1]),
                "row": int(parts[2]),
                "col": int(parts[3]),
            })
    return {"year": year, "level": level, "tiles": tiles, "count": len(tiles)}


@app.get("/api/aerial/{year}/level_{level}/{filename}")
async def get_aerial_tile(year: str, level: int, filename: str):
    """Serve an individual aerial tile image."""
    fpath = AERIAL_DIR / year / f"level_{level}" / filename
    if not fpath.exists():
        raise HTTPException(404, "Tile not found")
    media = "image/jpeg" if fpath.suffix == ".jpg" else "image/png"
    return FileResponse(fpath, media_type=media)


@app.get("/api/aerial/{year}/stitched")
async def get_aerial_stitched(year: str, level: int = 7):
    """Serve the stitched aerial image for a year/level."""
    for ext in [".jpg", ".png"]:
        fpath = AERIAL_DIR / year / f"aerial_level_{level}{ext}"
        if fpath.exists():
            media = "image/jpeg" if ext == ".jpg" else "image/png"
            return FileResponse(fpath, media_type=media)
    raise HTTPException(404, f"No stitched image for year={year} level={level}")


@app.get("/api/aerial/{year}/worldfile")
async def get_aerial_worldfile(year: str, level: int = 7):
    """Return world file parameters for a year/level as JSON."""
    for wfext in [".jgw", ".pgw"]:
        wf = AERIAL_DIR / year / f"aerial_level_{level}{wfext}"
        if wf.exists():
            lines = wf.read_text().strip().split("\n")
            if len(lines) >= 6:
                return {
                    "pixel_size_x": float(lines[0]),
                    "rotation_y": float(lines[1]),
                    "rotation_x": float(lines[2]),
                    "pixel_size_y": float(lines[3]),
                    "origin_x": float(lines[4]),
                    "origin_y": float(lines[5]),
                    "crs": "EPSG:2039",
                }
    raise HTTPException(404, "No world file found")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GEOREF
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/georef")
async def list_georef():
    """List all georeferenced plan images."""
    conn = get_db()
    if conn:
        try:
            rows = conn.execute(
                "SELECT pg.*, d.file_name, d.plan_number, d.gush, d.helka "
                "FROM plan_georef pg "
                "LEFT JOIN documents d ON pg.document_id = d.id "
                "ORDER BY pg.id"
            ).fetchall()
            return {"georef": [dict(r) for r in rows], "source": "local"}
        finally:
            conn.close()
    # Fallback: Supabase
    rows = supabase_get("plan_georef", "order=id.asc")
    return {"georef": rows, "source": "cloud"}


@app.get("/api/georef/config")
async def get_georef_config():
    """Return the raw georef_config.json."""
    config_path = PLANS_DIR / "georef_config.json"
    if not config_path.exists():
        raise HTTPException(404, "No georef config file")
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ─── Plan image serving ──────────────────────────────────────────────────────
@app.get("/api/plans/image/{path:path}")
async def get_plan_image(path: str):
    """Serve a plan map image."""
    fpath = PLANS_DIR / path
    if not fpath.exists():
        raise HTTPException(404, "Plan image not found")
    ext = fpath.suffix.lower()
    media_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".tif": "image/tiff"}
    return FileResponse(fpath, media_type=media_map.get(ext, "application/octet-stream"))


# ─── WMTS Tile Proxy ─────────────────────────────────────────────────────────
WMTS_ORIGIN_X = 177118.8637
WMTS_ORIGIN_Y = 664444.0
WMTS_TILE_SIZE = 256
WMTS_SCALES = {
    0: 256000.0, 1: 128000.0, 2: 64000.0, 3: 32000.0,
    4: 16000.0, 5: 8000.0, 6: 4000.0, 7: 2000.0,
    8: 1000.0, 9: 500.0, 10: 250.0,
}


@app.get("/api/wmts/info")
async def wmts_info():
    """Return WMTS tile matrix parameters."""
    return {
        "origin": {"x": WMTS_ORIGIN_X, "y": WMTS_ORIGIN_Y},
        "tile_size": WMTS_TILE_SIZE,
        "crs": "EPSG:2039",
        "scales": WMTS_SCALES,
        "pixel_sizes": {k: v * 0.00028 for k, v in WMTS_SCALES.items()},
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  FILE UPLOAD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _file_type(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"):
        return "image"
    if ext == ".pdf":
        return "pdf"
    return "other"


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    gush: int = Form(...),
    helka: int = Form(0),
    category: str = Form("plans"),
    plan_number: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    is_tashrit: int = Form(0),
):
    """Upload a document/map/aerial image and register it in the DB."""
    if not file.filename:
        raise HTTPException(400, "No filename")

    # Sanitise filename
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', file.filename)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Build directory: uploads/{gush}_{helka}/
    sub_dir = UPLOADS_DIR / f"{gush}_{helka}"
    sub_dir.mkdir(parents=True, exist_ok=True)
    dest = sub_dir / f"{ts}_{safe_name}"

    # Save file
    contents = await file.read()
    dest.write_bytes(contents)
    file_size = len(contents)

    # Determine file type
    ft = _file_type(safe_name)
    doc_title = title or safe_name

    # Insert into DB
    conn = get_db()
    if not conn:
        raise HTTPException(503, "Upload requires local database")
    try:
        # Ensure gush row exists
        conn.execute(
            "INSERT OR IGNORE INTO gushim (gush, name, area_type) VALUES (?, '', '')",
            (gush,),
        )
        # Ensure parcel row exists
        if helka > 0:
            conn.execute(
                "INSERT OR IGNORE INTO parcels (gush, helka) VALUES (?, ?)",
                (gush, helka),
            )

        rel_path = f"./kfar_chabad_data/uploads/{gush}_{helka}/{ts}_{safe_name}"
        cur = conn.execute(
            "INSERT INTO documents "
            "(gush, helka, plan_number, title, file_path, file_name, file_size, "
            " file_type, category, is_tashrit, is_georef, downloaded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
            (
                gush, helka, plan_number, doc_title, rel_path,
                safe_name, file_size, ft, category, is_tashrit,
                datetime.now().isoformat(),
            ),
        )
        doc_id = cur.lastrowid

        # Update aggregate counts
        _refresh_aggregates(conn, gush, helka)
        conn.commit()

        return {
            "ok": True,
            "document_id": doc_id,
            "file_name": safe_name,
            "file_size": file_size,
            "file_type": ft,
            "path": rel_path,
        }
    finally:
        conn.close()


@app.get("/api/uploads")
async def list_uploads(
    limit: int = Query(default=50, le=500),
    offset: int = 0,
):
    """List uploaded files (newest first)."""
    conn = get_db()
    if not conn:
        return {"uploads": [], "total": 0, "note": "Requires local database"}
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE file_path LIKE '%/uploads/%'"
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM documents WHERE file_path LIKE '%/uploads/%' "
            "ORDER BY downloaded_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return {"uploads": [dict(r) for r in rows], "total": total}
    finally:
        conn.close()


@app.delete("/api/uploads/{doc_id}")
async def delete_upload(doc_id: int):
    """Delete an uploaded document from DB and disk."""
    conn = get_db()
    if not conn:
        raise HTTPException(503, "Delete requires local database")
    try:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Document not found")
        if "/uploads/" not in row["file_path"]:
            raise HTTPException(403, "Can only delete uploaded files")

        # Delete from disk
        fpath = BASE_DIR / str(row["file_path"]).lstrip("./")
        if fpath.exists():
            fpath.unlink()

        gush_val = row["gush"]
        helka_val = row["helka"]
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        _refresh_aggregates(conn, gush_val, helka_val)
        conn.commit()
        return {"ok": True, "deleted_id": doc_id}
    finally:
        conn.close()


def _refresh_aggregates(conn, gush: int, helka: int):
    """Recalculate gushim / parcels aggregate counts."""
    plan_c = conn.execute(
        "SELECT COUNT(DISTINCT plan_number) FROM documents WHERE gush = ? AND category = 'plans' AND plan_number IS NOT NULL",
        (gush,),
    ).fetchone()[0]
    permit_c = conn.execute(
        "SELECT COUNT(*) FROM documents WHERE gush = ? AND category = 'permits'",
        (gush,),
    ).fetchone()[0]
    parcel_c = conn.execute(
        "SELECT COUNT(DISTINCT helka) FROM documents WHERE gush = ? AND helka > 0",
        (gush,),
    ).fetchone()[0]
    conn.execute(
        "UPDATE gushim SET plan_count = ?, permit_count = ?, parcel_count = ? WHERE gush = ?",
        (plan_c, permit_c, parcel_c, gush),
    )
    if helka > 0:
        doc_c = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE gush = ? AND helka = ?",
            (gush, helka),
        ).fetchone()[0]
        has_t = conn.execute(
            "SELECT MAX(is_tashrit) FROM documents WHERE gush = ? AND helka = ?",
            (gush, helka),
        ).fetchone()[0] or 0
        p_plan = conn.execute(
            "SELECT COUNT(DISTINCT plan_number) FROM documents WHERE gush = ? AND helka = ? AND category = 'plans' AND plan_number IS NOT NULL",
            (gush, helka),
        ).fetchone()[0]
        p_permit = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE gush = ? AND helka = ? AND category = 'permits'",
            (gush, helka),
        ).fetchone()[0]
        conn.execute(
            "UPDATE parcels SET doc_count = ?, has_tashrit = ?, plan_count = ?, permit_count = ? WHERE gush = ? AND helka = ?",
            (doc_c, has_t, p_plan, p_permit, gush, helka),
        )


# ═══ New endpoints from gushim_halakot integration ═══════════════════════════

GIS_LAYERS_DIR = DATA_DIR / "gis_layers"
MMG_DIR = DATA_DIR / "mmg"
COMPLOT_DIR = DATA_DIR / "complot_kfar_chabad"
CADASTRE_DIR = DATA_DIR / "cadastre"


@app.get("/api/gis-layers")
async def list_gis_layers(
    category: Optional[str] = None,
    source: Optional[str] = None,
    search: Optional[str] = None,
):
    """List available GIS layers (iPlan, TAMA, TMM, GovMap, cadastre)."""
    conn = get_db()
    if not conn:
        # Fallback: scan directory
        if not GIS_LAYERS_DIR.exists():
            return {"layers": [], "total": 0}
        layers = []
        for f in sorted(GIS_LAYERS_DIR.iterdir()):
            if f.suffix.lower() == ".geojson" and not f.name.startswith("_"):
                layers.append({
                    "layer_name": f.stem,
                    "file_path": str(f.relative_to(BASE_DIR)).replace("\\", "/"),
                    "file_size": f.stat().st_size,
                })
        return {"layers": layers, "total": len(layers)}

    try:
        where_parts = ["1=1"]
        params = []
        if category:
            where_parts.append("category = ?")
            params.append(category)
        if source:
            where_parts.append("source = ?")
            params.append(source)
        if search:
            where_parts.append("(layer_name LIKE ? OR display_name LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])

        where = " AND ".join(where_parts)
        rows = conn.execute(
            f"SELECT * FROM gis_layers WHERE {where} ORDER BY category, layer_name",
            params,
        ).fetchall()
        return {"layers": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@app.get("/api/gis-layers/{layer_name}/geojson")
async def get_gis_layer_geojson(layer_name: str):
    """Serve a GIS layer as GeoJSON."""
    # Try gis_layers directory
    for base_dir in [GIS_LAYERS_DIR, CADASTRE_DIR]:
        if not base_dir.exists():
            continue
        fpath = base_dir / f"{layer_name}.geojson"
        if fpath.exists():
            return FileResponse(str(fpath), media_type="application/geo+json")

    raise HTTPException(404, f"GIS layer '{layer_name}' not found")


@app.get("/api/migrash")
async def get_migrash(
    gush: Optional[int] = None,
    helka: Optional[int] = None,
):
    """Query migrash (lot) data from Complot."""
    conn = get_db()
    if not conn:
        # Fallback: read from JSON
        mapping_file = DATA_DIR / "migrash_helka_mapping.json"
        if not mapping_file.exists():
            return {"migrash": [], "total": 0}
        with open(mapping_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if gush and helka:
            info = data.get(str(gush), {}).get(str(helka))
            return {"migrash": [info] if info else [], "total": 1 if info else 0}
        if gush:
            gush_data = data.get(str(gush), {})
            items = [{"helka": int(k), **v} if isinstance(v, dict) else {"helka": int(k), "migrash": v}
                     for k, v in gush_data.items()]
            return {"migrash": items, "total": len(items)}
        return {"migrash": [], "total": 0, "note": "Specify gush and/or helka"}

    try:
        if gush and helka:
            rows = conn.execute(
                "SELECT * FROM migrash_data WHERE gush = ? AND helka = ?",
                (gush, helka),
            ).fetchall()
        elif gush:
            rows = conn.execute(
                "SELECT * FROM migrash_data WHERE gush = ? ORDER BY helka",
                (gush,),
            ).fetchall()
        else:
            return {"migrash": [], "total": 0, "note": "Specify gush and/or helka"}
        return {"migrash": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@app.get("/api/mmg")
async def list_mmg_plans():
    """List plans with extracted MMG (SHP) layers."""
    conn = get_db()
    if not conn:
        # Fallback: scan directory
        if not MMG_DIR.exists():
            return {"plans": [], "total": 0}
        plans = []
        for plan_dir in sorted(MMG_DIR.iterdir()):
            if plan_dir.is_dir():
                layers = [f.stem for f in plan_dir.iterdir() if f.suffix == ".geojson"]
                plans.append({"plan_number": plan_dir.name, "layers": layers,
                              "layer_count": len(layers)})
        return {"plans": plans, "total": len(plans)}

    try:
        rows = conn.execute("""
            SELECT plan_number, COUNT(*) as layer_count,
                   GROUP_CONCAT(layer_name) as layers
            FROM mmg_layers GROUP BY plan_number ORDER BY plan_number
        """).fetchall()
        plans = [{"plan_number": r["plan_number"], "layer_count": r["layer_count"],
                  "layers": r["layers"].split(",") if r["layers"] else []}
                 for r in rows]
        return {"plans": plans, "total": len(plans)}
    finally:
        conn.close()


@app.get("/api/mmg/{plan_number}/{layer_name}.geojson")
async def get_mmg_layer(plan_number: str, layer_name: str):
    """Serve an MMG layer GeoJSON for a specific plan."""
    fpath = MMG_DIR / plan_number / f"{layer_name}.geojson"
    if not fpath.exists():
        raise HTTPException(404, f"MMG layer {layer_name} not found for plan {plan_number}")
    return FileResponse(str(fpath), media_type="application/geo+json")


@app.get("/api/building-rights")
async def list_building_rights(
    plan_number: Optional[str] = None,
):
    """Get building rights for a plan or list all."""
    conn = get_db()
    if not conn:
        # Fallback: read JSON
        br_file = DATA_DIR / "building_rights_summary.json"
        if not br_file.exists():
            return {"rights": [], "total": 0}
        with open(br_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if plan_number:
            info = data.get(plan_number)
            return {"rights": [{"plan_number": plan_number, "data": info}] if info else [],
                    "total": 1 if info else 0}
        items = [{"plan_number": k, "data": v} for k, v in data.items()]
        return {"rights": items, "total": len(items)}

    try:
        if plan_number:
            rows = conn.execute(
                "SELECT * FROM building_rights WHERE plan_number = ?",
                (plan_number,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM building_rights").fetchall()
        return {"rights": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@app.get("/api/plan-instructions")
async def list_plan_instructions(
    plan_number: Optional[str] = None,
):
    """Get plan instructions for a specific plan or list all."""
    conn = get_db()
    if not conn:
        pi_file = DATA_DIR / "plan_instructions_summary.json"
        if not pi_file.exists():
            return {"instructions": [], "total": 0}
        with open(pi_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if plan_number:
            text = data.get(plan_number)
            return {"instructions": [{"plan_number": plan_number, "text": text}] if text else [],
                    "total": 1 if text else 0}
        items = [{"plan_number": k, "text": v} for k, v in data.items()]
        return {"instructions": items, "total": len(items)}

    try:
        if plan_number:
            rows = conn.execute(
                "SELECT * FROM plan_instructions WHERE plan_number = ?",
                (plan_number,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM plan_instructions").fetchall()
        return {"instructions": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@app.get("/api/complot")
async def get_complot_data():
    """Return Complot parsed data (migrashim, SOAP responses)."""
    complot_file = COMPLOT_DIR / "complot_parsed.json"
    if not complot_file.exists():
        # Try all_migrashim_by_gush.json
        alt = COMPLOT_DIR / "all_migrashim_by_gush.json"
        if alt.exists():
            with open(alt, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"error": "No Complot data found"}
    with open(complot_file, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/cadastre/{filename}")
async def get_cadastre_file(filename: str):
    """Serve cadastre GeoJSON files."""
    if not filename.endswith(".geojson"):
        filename += ".geojson"
    fpath = CADASTRE_DIR / filename
    if not fpath.exists():
        raise HTTPException(404, f"Cadastre file '{filename}' not found")
    return FileResponse(str(fpath), media_type="application/geo+json")


@app.get("/api/document-index")
async def get_document_index():
    """Return comprehensive document index from all_documents_index.json."""
    index_file = DATA_DIR / "all_documents_index.json"
    if not index_file.exists():
        return {"error": "Document index not available", "total": 0}
    with open(index_file, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/metadata/blocks-parcels")
async def get_blocks_parcels_by_plan():
    """Return block→plan mapping from blocks_parcels_by_plan.json."""
    bp_file = DATA_DIR / "blocks_parcels_by_plan.json"
    if not bp_file.exists():
        return {"error": "Block-parcel mapping not available"}
    with open(bp_file, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/metadata/extracted")
async def get_mavat_extracted_metadata():
    """Return full MAVAT extracted metadata."""
    meta_file = DATA_DIR / "mavat_extracted_metadata.json"
    if not meta_file.exists():
        return {"error": "MAVAT metadata not available"}
    with open(meta_file, "r", encoding="utf-8") as f:
        return json.load(f)


# ─── Static file serving ─────────────────────────────────────────────────
if AERIAL_DIR.exists():
    app.mount("/static/aerial", StaticFiles(directory=str(AERIAL_DIR)), name="aerial")
if PLANS_DIR.exists():
    app.mount("/static/plans", StaticFiles(directory=str(PLANS_DIR)), name="plans")
if UPLOADS_DIR.exists():
    app.mount("/static/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
if GIS_LAYERS_DIR.exists():
    app.mount("/static/gis_layers", StaticFiles(directory=str(GIS_LAYERS_DIR)), name="gis_layers")
if MMG_DIR.exists():
    app.mount("/static/mmg", StaticFiles(directory=str(MMG_DIR)), name="mmg")
if CADASTRE_DIR.exists():
    app.mount("/static/cadastre", StaticFiles(directory=str(CADASTRE_DIR)), name="cadastre")
