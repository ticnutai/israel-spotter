"""
download_parcels_arcgis.py – הורדת מידע קדסטרי מ-ArcGIS (מפות ישראל)
====================================================================

מוריד את כל המידע הקדסטרי על גושים וחלקות בכפר חב"ד
מהשירות של Survey of Israel (מפות ישראל) ב-ArcGIS.

מקורות מידע:
  • חלקות (Parcels) – גבולות חלקות, שטחים, סטטוס
  • גושים (Blocks)  – גבולות גושים
  • נקודות ביקורת    – נקודות גאודזיות

נתונים שנשמרים:
  • GeoJSON – גיאומטריות לכל גוש/חלקה
  • CSV     – טבלת מאפיינים (שטח, סטטוס, יישוב, נפה, מחוז)
  • SQLite  – מעדכן את מסד הנתונים המרכזי

שימוש::

    python download_parcels_arcgis.py                    # כל הגושים
    python download_parcels_arcgis.py --gush 6260 6262   # גושים ספציפיים
    python download_parcels_arcgis.py --format geojson   # רק GeoJSON
    python download_parcels_arcgis.py --all-helkot       # כל החלקות (לא רק קדסטר)
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests

# ─── Configuration ────────────────────────────────────────────────────────────
ARCGIS_BASE = "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services"

# Available layers from Survey of Israel
SERVICES = {
    "parcels": {
        "url": f"{ARCGIS_BASE}/%D7%97%D7%9C%D7%A7%D7%95%D7%AA/FeatureServer/0/query",
        "name": "חלקות",
        "id_field": "PARCEL",
        "gush_field": "GUSH_NUM",
    },
    "blocks": {
        "url": f"{ARCGIS_BASE}/%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query",
        "name": "גושים",
        "id_field": "GUSH_NUM",
        "gush_field": "GUSH_NUM",
    },
}

# Fields to export
PARCEL_FIELDS = [
    "GUSH_NUM", "PARCEL", "GUSH_SUFFIX",
    "LEGAL_AREA", "SHAPE_Area", "REG_STATUS",
    "LOCALITY_I", "REG_MUN_ID", "COUNTY_ID", "REGION_ID",
    "GUSH_HELKA", "PL_DATE",
]

# Hebrew names for fields
FIELD_LABELS = {
    "GUSH_NUM": "גוש",
    "PARCEL": "חלקה",
    "GUSH_SUFFIX": "סיומת גוש",
    "LEGAL_AREA": "שטח רשום (מ\"ר)",
    "SHAPE_Area": "שטח גיאומטרי (מ\"ר)",
    "REG_STATUS": "סטטוס רישום",
    "LOCALITY_I": "קוד ישוב",
    "REG_MUN_ID": "קוד מועצה אזורית",
    "COUNTY_ID": "קוד נפה",
    "REGION_ID": "קוד מחוז",
    "GUSH_HELKA": "גוש/חלקה",
    "PL_DATE": "תאריך עדכון",
}

# Status codes
STATUS_NAMES = {
    1: "חדש רשום",
    2: "מוסדר",
    3: "חדש לא רשום",
    4: "לא מוסדר",
}

# Regional municipality names (code → name)
REG_MUN_NAMES = {
    0: "לא ידוע", 1: "ירושלים", 2: "תל אביב-יפו", 3: "חיפה",
    17: "עמק לוד", 18: "גזר", 19: "חבל מודיעין", 20: "מטה יהודה",
    22: "באר יעקב", 23: "גן רווה", 24: "ברנר", 25: "נחל שורק",
    31: "שדות דן",
}

# County (נפה) names
COUNTY_NAMES = {
    11: "ירושלים", 21: "צפת", 22: "כנרת", 23: "יזרעאל",
    24: "עכו", 29: "גולן", 31: "חיפה", 32: "חדרה",
    41: "שרון", 42: "פ\"ת", 43: "רמלה", 44: "רחובות",
    51: "אשקלון", 61: "באר שבע", 62: "דרום",
    71: "תל אביב", 77: "ר\"ג/בני ברק",
}

# Region (מחוז) names
REGION_NAMES = {
    1: "ירושלים", 2: "צפון", 3: "חיפה",
    4: "מרכז", 5: "תל אביב", 6: "דרום", 7: "יו\"ש",
}

# Kfar Chabad gush list
KFAR_CHABAD_GUSHIM = [
    6256, 6258, 6260, 6261, 6262, 6269,
    6272, 6280, 7187, 7188, 7196, 7311,
]

OUTPUT_DIR = "./kfar_chabad_data/arcgis_cadastral"
DB_PATH = "kfar_chabad_documents.db"

# ─── ArcGIS query helper ─────────────────────────────────────────────────────
def query_arcgis(
    url: str,
    where: str,
    out_fields: str = "*",
    out_sr: str = "4326",
    return_geometry: bool = True,
    result_offset: int = 0,
    result_record_count: int = 2000,
) -> dict:
    """Query ArcGIS REST service and return GeoJSON response."""
    params = {
        "where": where,
        "outFields": out_fields,
        "outSR": out_sr,
        "returnGeometry": str(return_geometry).lower(),
        "f": "geojson",
        "resultOffset": str(result_offset),
        "resultRecordCount": str(result_record_count),
    }
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"ArcGIS error: {data['error']}")
    return data


def query_all_features(url: str, where: str, out_fields: str = "*") -> List[dict]:
    """Paginated query to get ALL features (ArcGIS limits to 2000 per request)."""
    all_features = []
    offset = 0
    page_size = 2000

    while True:
        data = query_arcgis(url, where, out_fields, result_offset=offset, result_record_count=page_size)
        features = data.get("features", [])
        if not features:
            break
        all_features.extend(features)
        if len(features) < page_size:
            break
        offset += page_size
        time.sleep(0.3)  # Rate limiting

    return all_features


# ─── Download parcels for one gush ───────────────────────────────────────────
def download_gush_parcels(gush: int) -> List[dict]:
    """Download all parcels for a single gush from ArcGIS."""
    url = SERVICES["parcels"]["url"]
    where = f"GUSH_NUM={gush}"
    features = query_all_features(url, where)
    print(f"  גוש {gush}: {len(features)} חלקות")
    return features


def download_gush_boundary(gush: int) -> Optional[dict]:
    """Download the gush (block) boundary polygon from ArcGIS."""
    url = SERVICES["blocks"]["url"]
    where = f"GUSH_NUM={gush}"
    features = query_all_features(url, where)
    if features:
        return features[0]
    return None


# ─── Save helpers ─────────────────────────────────────────────────────────────
def save_geojson(features: List[dict], filepath: str, name: str = "") -> None:
    """Save features as a GeoJSON FeatureCollection."""
    fc = {
        "type": "FeatureCollection",
        "name": name,
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, indent=2)


def save_csv(features: List[dict], filepath: str, fields: List[str]) -> None:
    """Save parcel attributes as CSV."""
    with open(filepath, "w", encoding="utf-8-sig", newline="") as f:
        # Use Hebrew headers
        headers = [FIELD_LABELS.get(fld, fld) for fld in fields]
        writer = csv.writer(f)
        writer.writerow(headers)

        for feat in features:
            props = feat.get("properties", {})
            row = []
            for fld in fields:
                val = props.get(fld, "")
                # Decode known codes
                if fld == "REG_STATUS" and val:
                    val = STATUS_NAMES.get(int(val), val) if val else ""
                elif fld == "REG_MUN_ID" and val:
                    val = REG_MUN_NAMES.get(int(val), f"קוד {val}") if val else ""
                elif fld == "COUNTY_ID" and val:
                    val = COUNTY_NAMES.get(int(val), f"קוד {val}") if val else ""
                elif fld == "REGION_ID" and val:
                    val = REGION_NAMES.get(int(val), f"קוד {val}") if val else ""
                elif fld == "PL_DATE" and val:
                    try:
                        val = datetime.fromtimestamp(val / 1000).strftime("%Y-%m-%d")
                    except (TypeError, ValueError, OSError):
                        pass
                elif fld in ("LEGAL_AREA", "SHAPE_Area") and val:
                    try:
                        val = f"{float(val):.1f}"
                    except (TypeError, ValueError):
                        pass
                row.append(val)
            writer.writerow(row)


def update_database(features: List[dict], gush: int, db_path: str) -> int:
    """Insert/update parcel info in the SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")

    # Ensure gush exists
    conn.execute(
        "INSERT OR IGNORE INTO gushim (gush, name) VALUES (?, ?)",
        (gush, f"גוש {gush}"),
    )

    count = 0
    for feat in features:
        props = feat.get("properties", {})
        helka = props.get("PARCEL")
        if not helka:
            continue

        # Calculate area
        legal_area = props.get("LEGAL_AREA")
        shape_area = props.get("SHAPE_Area")
        area_str = ""
        if legal_area:
            area_str = f"{float(legal_area):.1f} מ\"ר"
        elif shape_area:
            area_str = f"{float(shape_area):.1f} מ\"ר (גיאומטרי)"

        status = props.get("REG_STATUS")
        status_name = STATUS_NAMES.get(int(status), str(status)) if status else ""

        notes_parts = []
        if area_str:
            notes_parts.append(f"שטח: {area_str}")
        if status_name:
            notes_parts.append(f"סטטוס: {status_name}")

        locality = props.get("LOCALITY_I", "")
        mun = props.get("REG_MUN_ID", "")
        if mun:
            mun_name = REG_MUN_NAMES.get(int(mun), f"קוד {mun}")
            notes_parts.append(f"מועצה: {mun_name}")

        notes = " | ".join(notes_parts)

        conn.execute(
            """INSERT INTO parcels (gush, helka, notes)
               VALUES (?, ?, ?)
               ON CONFLICT(gush, helka) DO UPDATE SET notes = excluded.notes""",
            (gush, int(helka), notes),
        )
        count += 1

    # Update parcel count in gushim table
    conn.execute(
        "UPDATE gushim SET parcel_count = ? WHERE gush = ?",
        (count, gush),
    )

    conn.commit()
    conn.close()
    return count


# ─── Main ─────────────────────────────────────────────────────────────────────
def download_all(gushim: List[int], output_dir: str, db_path: str, fmt: str = "all"):
    """Download all cadastral data for the given gushim."""
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "geojson"), exist_ok=True)

    all_parcels = []
    all_blocks = []
    total_count = 0

    print(f"\n{'═' * 55}")
    print(f"  הורדת מידע קדסטרי מ-ArcGIS (מפות ישראל)")
    print(f"  גושים: {len(gushim)}")
    print(f"{'═' * 55}\n")

    start = time.time()

    for gush in gushim:
        try:
            # Download parcels
            parcels = download_gush_parcels(gush)
            all_parcels.extend(parcels)

            # Download block boundary
            block = download_gush_boundary(gush)
            if block:
                all_blocks.append(block)

            # Save per-gush GeoJSON
            if fmt in ("all", "geojson") and parcels:
                gush_path = os.path.join(output_dir, "geojson", f"gush_{gush}_parcels.geojson")
                save_geojson(parcels, gush_path, f"חלקות גוש {gush}")

            if block and fmt in ("all", "geojson"):
                block_path = os.path.join(output_dir, "geojson", f"gush_{gush}_boundary.geojson")
                save_geojson([block], block_path, f"גבול גוש {gush}")

            # Update database
            db_count = update_database(parcels, gush, db_path)
            total_count += db_count

            time.sleep(0.5)  # Rate limiting

        except Exception as e:
            print(f"  ✗ שגיאה בגוש {gush}: {e}")

    # Save combined files
    if fmt in ("all", "geojson") and all_parcels:
        combined_path = os.path.join(output_dir, "all_parcels.geojson")
        save_geojson(all_parcels, combined_path, "כל חלקות כפר חב\"ד")
        print(f"\n  ✓ GeoJSON משולב: {combined_path} ({len(all_parcels)} חלקות)")

    if fmt in ("all", "geojson") and all_blocks:
        blocks_path = os.path.join(output_dir, "all_blocks.geojson")
        save_geojson(all_blocks, blocks_path, "כל גושי כפר חב\"ד")
        print(f"  ✓ GeoJSON גושים: {blocks_path} ({len(all_blocks)} גושים)")

    if fmt in ("all", "csv") and all_parcels:
        csv_path = os.path.join(output_dir, "parcels_data.csv")
        save_csv(all_parcels, csv_path, PARCEL_FIELDS)
        print(f"  ✓ CSV: {csv_path}")

    elapsed = time.time() - start
    print(f"\n{'═' * 55}")
    print(f"  סיכום קדסטר:")
    print(f"    חלקות: {len(all_parcels)}")
    print(f"    גושים: {len(all_blocks)}")
    print(f"    עודכנו ב-DB: {total_count}")
    print(f"    זמן: {elapsed:.1f} שניות")
    print(f"    תיקייה: {output_dir}/")
    print(f"{'═' * 55}")

    return {"parcels": len(all_parcels), "blocks": len(all_blocks), "db_updated": total_count}


def main():
    parser = argparse.ArgumentParser(
        description="הורדת מידע קדסטרי מ-ArcGIS (מפות ישראל) – כפר חב\"ד"
    )
    parser.add_argument(
        "--gush", type=int, nargs="+", default=None,
        help="גוש/ים ספציפיים (ברירת מחדל: כולם)",
    )
    parser.add_argument(
        "--format", choices=["all", "geojson", "csv"], default="all",
        help="פורמט פלט (ברירת מחדל: all)",
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
    download_all(gushim, args.output, args.db, args.format)


if __name__ == "__main__":
    main()
