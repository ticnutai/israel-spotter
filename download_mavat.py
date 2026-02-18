"""
download_mavat.py – הורדת תכניות ממבא"ת (מאגר תכניות ארצי / IPA)
================================================================

מוריד את כל התכניות הקשורות לגושים בכפר חב"ד מהמערכת הארצית לתכנון
ובניה (מבא"ת – mavat.iplan.gov.il).

מה מוריד:
  • רשימת תכניות פעילות/מאושרות/בהפקדה לכל גוש
  • פרטי תכנית: שם, מספר, סטטוס, יעוד, שטח
  • קבצי PDF של הוראות ותשריטים (כשזמינים)
  • מפת גבולות תכנית (GeoJSON)

מקורות API:
  • iplan.gov.il REST API – חיפוש תכניות לפי גוש
  • mavat.iplan.gov.il – פרטי תכנית מלאים

שימוש::

    python download_mavat.py                       # כל הגושים
    python download_mavat.py --gush 6260 6262      # גושים ספציפיים
    python download_mavat.py --status approved     # רק תכניות מאושרות
    python download_mavat.py --download-docs       # הורד גם קבצי PDF
"""

import argparse
import json
import os
import re
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from urllib.parse import quote, urljoin

import requests

# ─── Configuration ────────────────────────────────────────────────────────────
IPLAN_API = "https://ipa.iplan.gov.il/api"
MAVAT_SEARCH = f"{IPLAN_API}/Data/GetDataByQuery"
MAVAT_DETAIL = f"{IPLAN_API}/Data/GetPlanData"
MAVAT_DOCS = f"{IPLAN_API}/Data/GetPlanDocs"
MAVAT_BOUNDARY = f"{IPLAN_API}/Data/GetPlanBoundary"

# Alternative IPA endpoints
IPA_SEARCH_URL = "https://ipa.iplan.gov.il/api/Data/GetDataByQuery"

# Kfar Chabad gush list
KFAR_CHABAD_GUSHIM = [
    6256, 6258, 6260, 6261, 6262, 6269,
    6272, 6280, 7187, 7188, 7196, 7311,
]

OUTPUT_DIR = "./kfar_chabad_data/mavat_plans"
DB_PATH = "kfar_chabad_documents.db"

# HTTP session with retries
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    "Origin": "https://mavat.iplan.gov.il",
    "Referer": "https://mavat.iplan.gov.il/",
})

# Plan status mapping
PLAN_STATUS_HEB = {
    "approved": "אושרה",
    "deposited": "הופקדה",
    "submitted": "הוגשה",
    "in_committee": "בוועדה",
    "objections": "בהתנגדויות",
    "cancelled": "בוטלה",
    "active": "פעילה",
    "valid": "תקפה",
}


# ─── IPA API Functions ───────────────────────────────────────────────────────
def search_plans_by_gush(gush: int, max_results: int = 100) -> List[dict]:
    """Search for plans related to a specific gush number via IPA API."""
    plans = []

    # Method 1: Direct gush search via IPA API
    try:
        payload = {
            "query": str(gush),
            "queryType": "gush",
            "municipalityId": "",
            "countyId": "",
            "regionId": "",
            "statusId": "",
            "pageSize": max_results,
            "pageNumber": 1,
        }
        resp = SESSION.post(IPA_SEARCH_URL, json=payload, timeout=30)
        if resp.ok:
            data = resp.json()
            if isinstance(data, dict) and "data" in data:
                plans.extend(data["data"])
            elif isinstance(data, list):
                plans.extend(data)
    except Exception as e:
        print(f"    IPA API שגיאה: {e}")

    # Method 2: Alternative – query via the older mavat search endpoint
    if not plans:
        try:
            alt_url = f"https://mavat.iplan.gov.il/api/SV/1?gush={gush}"
            resp = SESSION.get(alt_url, timeout=30)
            if resp.ok:
                data = resp.json()
                if isinstance(data, list):
                    plans.extend(data)
                elif isinstance(data, dict) and "result" in data:
                    plans.extend(data["result"])
        except Exception:
            pass

    # Method 3: Fallback - scrape search results via form URL
    if not plans:
        try:
            search_url = (
                f"https://mavat.iplan.gov.il/SV4/1/{gush}"
            )
            resp = SESSION.get(search_url, timeout=30)
            if resp.ok and "application/json" in resp.headers.get("Content-Type", ""):
                data = resp.json()
                if isinstance(data, list):
                    plans.extend(data)
        except Exception:
            pass

    return plans


def search_plans_by_gush_arcgis(gush: int) -> List[dict]:
    """Fallback: search plans via ArcGIS REST for TABA layers."""
    plans = []
    # Try the GovMap TABA service
    taba_urls = [
        # Active plans
        "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/0/query",
        # Approved plans
        "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/1/query",
    ]

    for url in taba_urls:
        try:
            params = {
                "where": f"PL_BLOCK_NM LIKE '%{gush}%' OR PLAN_AREA_DUNAM > 0",
                "geometry": "",
                "geometryType": "esriGeometryEnvelope",
                "outFields": "PLAN_NAME,PL_NUMBER,STATION_DESC,PL_LANDUSE_STRING,"
                             "PL_AREA_DUNAM,PL_BY_AUTH_OF,PL_DATE_8,PL_BLOCK_NM",
                "returnGeometry": "true",
                "outSR": "4326",
                "f": "json",
                "resultRecordCount": "200",
            }
            # Try with SSL verification first, then without
            try:
                resp = SESSION.get(url, params=params, timeout=30)
            except requests.exceptions.SSLError:
                resp = SESSION.get(url, params=params, timeout=30, verify=False)
            if resp.ok:
                data = resp.json()
                features = data.get("features", [])
                # Filter features that actually contain our gush
                for feat in features:
                    attrs = feat.get("attributes", {})
                    block_nm = str(attrs.get("PL_BLOCK_NM", ""))
                    if str(gush) in block_nm:
                        plans.append({
                            "plan_number": attrs.get("PL_NUMBER", ""),
                            "plan_name": attrs.get("PLAN_NAME", ""),
                            "status": attrs.get("STATION_DESC", ""),
                            "land_use": attrs.get("PL_LANDUSE_STRING", ""),
                            "area_dunam": attrs.get("PL_AREA_DUNAM"),
                            "authority": attrs.get("PL_BY_AUTH_OF", ""),
                            "date": attrs.get("PL_DATE_8", ""),
                            "gush_list": block_nm,
                            "geometry": feat.get("geometry"),
                            "source": "arcgis_iplan",
                        })
        except Exception as e:
            print(f"    ArcGIS TABA שגיאה: {e}")

    return plans


def get_plan_details(plan_id: str) -> Optional[dict]:
    """Get detailed plan information from IPA/MAVAT."""
    try:
        resp = SESSION.get(
            f"https://mavat.iplan.gov.il/api/Plan/{plan_id}",
            timeout=30,
        )
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return None


def download_plan_documents(plan_number: str, output_dir: str) -> List[str]:
    """Download plan PDF documents (horaot, tashrit) if available."""
    downloaded = []
    plan_dir = os.path.join(output_dir, "docs", sanitize_filename(plan_number))
    os.makedirs(plan_dir, exist_ok=True)

    # Try IPA docs endpoint
    try:
        resp = SESSION.get(
            f"https://mavat.iplan.gov.il/api/Plan/{plan_number}/Documents",
            timeout=30,
        )
        if resp.ok:
            docs = resp.json()
            if isinstance(docs, list):
                for doc in docs:
                    doc_url = doc.get("url") or doc.get("fileUrl") or doc.get("Url")
                    doc_name = doc.get("name") or doc.get("fileName") or doc.get("Name") or "document"
                    if doc_url:
                        fname = sanitize_filename(doc_name)
                        if not fname.endswith(".pdf"):
                            fname += ".pdf"
                        dest = os.path.join(plan_dir, fname)
                        if not os.path.exists(dest):
                            try:
                                r = SESSION.get(doc_url, timeout=120)
                                r.raise_for_status()
                                with open(dest, "wb") as f:
                                    f.write(r.content)
                                downloaded.append(dest)
                                print(f"      ⬇ {fname}")
                            except Exception as e:
                                print(f"      ✗ {fname}: {e}")
    except Exception:
        pass

    return downloaded


# ─── Helpers ──────────────────────────────────────────────────────────────────
def sanitize_filename(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\n\r]', '_', str(name))
    return name.strip('. ') or "document"


def normalize_plan(raw: dict) -> dict:
    """Normalize plan data from different API formats into a standard dict."""
    # Handle both IPA API format and ArcGIS format
    if "source" in raw and raw["source"] == "arcgis_iplan":
        return raw  # Already normalized

    return {
        "plan_number": (
            raw.get("PL_NUMBER") or raw.get("planNumber") or
            raw.get("plan_number") or raw.get("number") or ""
        ),
        "plan_name": (
            raw.get("PL_NAME") or raw.get("PLAN_NAME") or
            raw.get("planName") or raw.get("name") or ""
        ),
        "status": (
            raw.get("STATION_DESC") or raw.get("status") or
            raw.get("statusDescription") or ""
        ),
        "land_use": (
            raw.get("PL_LANDUSE_STRING") or raw.get("landUse") or
            raw.get("land_use") or ""
        ),
        "area_dunam": (
            raw.get("PL_AREA_DUNAM") or raw.get("area") or
            raw.get("area_dunam")
        ),
        "authority": (
            raw.get("PL_BY_AUTH_OF") or raw.get("authority") or ""
        ),
        "date": raw.get("PL_DATE_8") or raw.get("date") or "",
        "gush_list": raw.get("PL_BLOCK_NM") or raw.get("gush_list") or "",
        "geometry": raw.get("geometry"),
        "source": "ipa_api",
    }


# ─── Database ────────────────────────────────────────────────────────────────
def update_plans_db(plans: List[dict], gush: int, db_path: str) -> int:
    """Insert/update plans in the SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")

    count = 0
    for plan in plans:
        pnum = plan.get("plan_number", "")
        if not pnum:
            continue

        try:
            conn.execute(
                """INSERT INTO plans (plan_number, plan_name, status, plan_type, gush_list, notes)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(plan_number) DO UPDATE SET
                     plan_name = COALESCE(excluded.plan_name, plan_name),
                     status = COALESCE(excluded.status, status),
                     plan_type = COALESCE(excluded.plan_type, plan_type),
                     gush_list = COALESCE(excluded.gush_list, gush_list),
                     notes = COALESCE(excluded.notes, notes)""",
                (
                    pnum,
                    plan.get("plan_name", ""),
                    plan.get("status", ""),
                    plan.get("land_use", ""),
                    plan.get("gush_list", ""),
                    f"מקור: {plan.get('source', 'mavat')} | רשות: {plan.get('authority', '')}",
                ),
            )
            count += 1
        except Exception as e:
            print(f"    DB error for {pnum}: {e}")

    conn.commit()
    conn.close()
    return count


# ─── Main download logic ────────────────────────────────────────────────────
def download_all(
    gushim: List[int],
    output_dir: str,
    db_path: str,
    download_docs: bool = False,
    status_filter: Optional[str] = None,
):
    """Download all plan data from MAVAT/IPA for the given gushim."""
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'═' * 55}")
    print(f"  הורדת תכניות ממבא\"ת (IPA)")
    print(f"  גושים: {len(gushim)}")
    if download_docs:
        print(f"  כולל הורדת מסמכי PDF")
    print(f"{'═' * 55}\n")

    start = time.time()
    all_plans: List[dict] = []
    seen_plan_numbers: Set[str] = set()
    total_docs = 0

    for gush in gushim:
        print(f"  גוש {gush}:")

        # Try IPA API first
        raw_plans = search_plans_by_gush(gush)
        time.sleep(0.5)

        # Fallback to ArcGIS TABA
        if not raw_plans:
            raw_plans = search_plans_by_gush_arcgis(gush)
            time.sleep(0.5)

        # Normalize
        plans = [normalize_plan(p) for p in raw_plans]

        # Filter by status if requested
        if status_filter:
            status_heb = PLAN_STATUS_HEB.get(status_filter, status_filter)
            plans = [p for p in plans if status_heb in p.get("status", "")]

        # Deduplicate
        new_plans = []
        for p in plans:
            pnum = p.get("plan_number", "")
            if pnum and pnum not in seen_plan_numbers:
                seen_plan_numbers.add(pnum)
                new_plans.append(p)

        print(f"    → {len(new_plans)} תכניות חדשות (מתוך {len(plans)} תוצאות)")

        all_plans.extend(new_plans)

        # Download documents if requested
        if download_docs:
            for p in new_plans:
                pnum = p.get("plan_number", "")
                if pnum:
                    docs = download_plan_documents(pnum, output_dir)
                    total_docs += len(docs)

        # Update DB
        if new_plans:
            update_plans_db(new_plans, gush, db_path)

        time.sleep(1)  # Rate limiting between gushim

    # Save combined plans JSON
    if all_plans:
        plans_path = os.path.join(output_dir, "all_plans.json")
        with open(plans_path, "w", encoding="utf-8") as f:
            json.dump(all_plans, f, ensure_ascii=False, indent=2, default=str)
        print(f"\n  ✓ JSON: {plans_path} ({len(all_plans)} תכניות)")

        # Save GeoJSON for plans with geometry
        geo_plans = [p for p in all_plans if p.get("geometry")]
        if geo_plans:
            features = []
            for p in geo_plans:
                geom = p.pop("geometry", None)
                if geom:
                    features.append({
                        "type": "Feature",
                        "properties": p,
                        "geometry": geom,
                    })
            fc = {
                "type": "FeatureCollection",
                "name": "תכניות כפר חב\"ד",
                "features": features,
            }
            geo_path = os.path.join(output_dir, "plans_boundaries.geojson")
            with open(geo_path, "w", encoding="utf-8") as f:
                json.dump(fc, f, ensure_ascii=False, indent=2)
            print(f"  ✓ GeoJSON: {geo_path} ({len(features)} גבולות)")

    elapsed = time.time() - start
    print(f"\n{'═' * 55}")
    print(f"  סיכום מבא\"ת:")
    print(f"    תכניות: {len(all_plans)}")
    if download_docs:
        print(f"    מסמכים שהורדו: {total_docs}")
    print(f"    זמן: {elapsed:.1f} שניות")
    print(f"    תיקייה: {output_dir}/")
    print(f"{'═' * 55}")

    return {"plans": len(all_plans), "docs": total_docs}


def main():
    parser = argparse.ArgumentParser(
        description="הורדת תכניות ממבא\"ת (IPA) – כפר חב\"ד"
    )
    parser.add_argument(
        "--gush", type=int, nargs="+", default=None,
        help="גוש/ים ספציפיים (ברירת מחדל: כולם)",
    )
    parser.add_argument(
        "--status", choices=list(PLAN_STATUS_HEB.keys()), default=None,
        help="סינון לפי סטטוס תכנית",
    )
    parser.add_argument(
        "--download-docs", action="store_true",
        help="הורד גם קבצי PDF של תכניות",
    )
    parser.add_argument(
        "--output", default=OUTPUT_DIR,
        help=f"תיקיית פלט (ברירת מחדל: {OUTPUT_DIR})",
    )
    parser.add_argument(
        "--db", default=DB_PATH,
        help=f"נתיב מסד נתונים (ברירת מחדל: {DB_PATH})",
    )
    args = parser.parse_args()

    gushim = args.gush if args.gush else KFAR_CHABAD_GUSHIM
    download_all(
        gushim, args.output, args.db,
        download_docs=args.download_docs,
        status_filter=args.status,
    )


if __name__ == "__main__":
    main()
