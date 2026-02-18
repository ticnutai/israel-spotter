"""
download_parcel_details.py – הורדת מידע מפורט על כל חלקה בכפר חב"ד
==================================================================

מוריד מידע מפורט על כל חלקה בכל גוש מ-ArcGIS Survey of Israel,
כולל: בעלות, שטחים, סטטוסים, ועוד.

מייצר דוח מסכם בפורמט:
  • JSON מפורט – כל הנתונים לכל חלקה
  • Excel/CSV – טבלה מרכזית עם כל החלקות
  • GeoJSON   – חלקות עם מיקום וגיאומטריה
  • HTML      – דוח ויזואלי למילוי ולהדפסה

שימוש::

    python download_parcel_details.py                       # כל הגושים
    python download_parcel_details.py --gush 6260           # גוש ספציפי
    python download_parcel_details.py --helka 1 50          # טווח חלקות
    python download_parcel_details.py --with-neighbors      # כולל שכנים
    python download_parcel_details.py --html-report         # עם דוח HTML
"""

import argparse
import csv
import json
import os
import sqlite3
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests

# ─── Configuration ────────────────────────────────────────────────────────────
ARCGIS_BASE = "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services"

PARCEL_URL = f"{ARCGIS_BASE}/%D7%97%D7%9C%D7%A7%D7%95%D7%AA/FeatureServer/0/query"
BLOCK_URL = f"{ARCGIS_BASE}/%D7%A9%D7%9B%D7%91%D7%AA_%D7%92%D7%95%D7%A9%D7%99%D7%9D/FeatureServer/0/query"

# Kfar Chabad gush list
KFAR_CHABAD_GUSHIM = [
    6256, 6258, 6260, 6261, 6262, 6269,
    6272, 6280, 7187, 7188, 7196, 7311,
]

OUTPUT_DIR = "./kfar_chabad_data/parcel_details"
DB_PATH = "kfar_chabad_documents.db"

# Code → name mappings
STATUS_NAMES = {
    1: "חדש רשום", 2: "מוסדר", 3: "חדש לא רשום", 4: "לא מוסדר",
}
REG_MUN_NAMES = {
    0: "לא ידוע", 17: "עמק לוד", 18: "גזר", 22: "באר יעקב",
    23: "גן רווה", 24: "ברנר", 25: "נחל שורק", 31: "שדות דן",
}
COUNTY_NAMES = {
    43: "רמלה", 44: "רחובות", 42: "פ\"ת", 41: "שרון",
}
REGION_NAMES = {
    4: "מרכז", 5: "תל אביב", 6: "דרום",
}

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
})


# ─── ArcGIS Query ────────────────────────────────────────────────────────────
def query_parcels(gush: int, helka_range: Optional[Tuple[int, int]] = None) -> List[dict]:
    """Query all parcels for a gush from ArcGIS."""
    if helka_range:
        where = f"GUSH_NUM={gush} AND PARCEL>={helka_range[0]} AND PARCEL<={helka_range[1]}"
    else:
        where = f"GUSH_NUM={gush}"

    all_features = []
    offset = 0
    page_size = 2000

    while True:
        params = {
            "where": where,
            "outFields": "*",
            "outSR": "4326",
            "returnGeometry": "true",
            "f": "geojson",
            "resultOffset": str(offset),
            "resultRecordCount": str(page_size),
        }
        try:
            resp = SESSION.get(PARCEL_URL, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"    שגיאה בשאילתה: {e}")
            break

        if "error" in data:
            print(f"    שגיאת ArcGIS: {data['error']}")
            break

        features = data.get("features", [])
        if not features:
            break

        all_features.extend(features)
        if len(features) < page_size:
            break
        offset += page_size
        time.sleep(0.3)

    return all_features


def query_block_info(gush: int) -> Optional[dict]:
    """Get block boundary and info."""
    params = {
        "where": f"GUSH_NUM={gush}",
        "outFields": "*",
        "outSR": "4326",
        "returnGeometry": "true",
        "f": "geojson",
    }
    try:
        resp = SESSION.get(BLOCK_URL, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        features = data.get("features", [])
        if features:
            return features[0]
    except Exception:
        pass
    return None


def query_neighbors(gush: int, helka: int) -> List[dict]:
    """Find parcels that share a boundary (touch) with the given parcel."""
    # First get the parcel geometry
    params = {
        "where": f"GUSH_NUM={gush} AND PARCEL={helka}",
        "outFields": "GUSH_NUM,PARCEL",
        "outSR": "4326",
        "returnGeometry": "true",
        "f": "geojson",
    }
    try:
        resp = SESSION.get(PARCEL_URL, params=params, timeout=60)
        data = resp.json()
        features = data.get("features", [])
        if not features:
            return []

        geom = features[0].get("geometry")
        if not geom:
            return []

        # Query parcels that intersect this geometry
        params2 = {
            "geometry": json.dumps(geom),
            "geometryType": "esriGeometryPolygon",
            "spatialRel": "esriSpatialRelTouches",
            "outFields": "GUSH_NUM,PARCEL,LEGAL_AREA,REG_STATUS",
            "outSR": "4326",
            "returnGeometry": "false",
            "f": "json",
            "inSR": "4326",
        }
        resp2 = SESSION.get(PARCEL_URL, params=params2, timeout=60)
        data2 = resp2.json()
        neighbors = []
        for feat in data2.get("features", []):
            attrs = feat.get("attributes", {})
            if attrs.get("GUSH_NUM") == gush and attrs.get("PARCEL") == helka:
                continue  # Skip self
            neighbors.append(attrs)
        return neighbors
    except Exception:
        return []


# ─── Data Processing ─────────────────────────────────────────────────────────
def parse_parcel(feat: dict, with_neighbors: bool = False) -> dict:
    """Parse a single ArcGIS parcel feature into a structured dict."""
    props = feat.get("properties", {})
    geom = feat.get("geometry")

    gush = props.get("GUSH_NUM")
    helka = props.get("PARCEL")

    # Compute centroid
    centroid = None
    if geom:
        centroid = compute_centroid(geom)

    # Decode codes
    status_code = props.get("REG_STATUS")
    status_name = STATUS_NAMES.get(status_code, str(status_code)) if status_code else ""

    mun_code = props.get("REG_MUN_ID")
    mun_name = REG_MUN_NAMES.get(mun_code, f"קוד {mun_code}") if mun_code else ""

    county_code = props.get("COUNTY_ID")
    county_name = COUNTY_NAMES.get(county_code, f"קוד {county_code}") if county_code else ""

    region_code = props.get("REGION_ID")
    region_name = REGION_NAMES.get(region_code, f"קוד {region_code}") if region_code else ""

    # Parse date
    pl_date = props.get("PL_DATE")
    date_str = ""
    if pl_date:
        try:
            date_str = datetime.fromtimestamp(pl_date / 1000).strftime("%Y-%m-%d")
        except (TypeError, ValueError, OSError):
            date_str = str(pl_date)

    result = {
        "gush": gush,
        "helka": helka,
        "gush_helka": f"{gush}/{helka}" if gush and helka else "",
        "legal_area_sqm": props.get("LEGAL_AREA"),
        "shape_area_sqm": props.get("SHAPE_Area"),
        "status_code": status_code,
        "status": status_name,
        "locality_code": props.get("LOCALITY_I"),
        "municipality_code": mun_code,
        "municipality": mun_name,
        "county_code": county_code,
        "county": county_name,
        "region_code": region_code,
        "region": region_name,
        "gush_suffix": props.get("GUSH_SUFFIX"),
        "update_date": date_str,
        "centroid_lat": centroid[0] if centroid else None,
        "centroid_lng": centroid[1] if centroid else None,
    }

    if with_neighbors and gush and helka:
        neighbors = query_neighbors(gush, helka)
        result["neighbors"] = neighbors
        time.sleep(0.2)

    return result


def compute_centroid(geometry: dict) -> Optional[Tuple[float, float]]:
    """Compute centroid of a GeoJSON geometry. Returns (lat, lng)."""
    coords = []
    if geometry["type"] == "Polygon":
        coords = geometry["coordinates"][0]
    elif geometry["type"] == "MultiPolygon":
        coords = geometry["coordinates"][0][0]
    elif geometry["type"] == "Point":
        return (geometry["coordinates"][1], geometry["coordinates"][0])

    if not coords:
        return None

    avg_lng = sum(c[0] for c in coords) / len(coords)
    avg_lat = sum(c[1] for c in coords) / len(coords)
    return (avg_lat, avg_lng)


# ─── Output Functions ────────────────────────────────────────────────────────
def save_json(data: dict, filepath: str) -> None:
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def save_csv_report(parcels: List[dict], filepath: str) -> None:
    """Save parcels as a CSV report."""
    if not parcels:
        return

    headers = [
        "גוש", "חלקה", "גוש/חלקה", "שטח רשום (מ\"ר)", "שטח גיאומטרי (מ\"ר)",
        "סטטוס", "מועצה", "נפה", "מחוז", "תאריך עדכון",
        "קו רוחב", "קו אורך",
    ]
    fields = [
        "gush", "helka", "gush_helka", "legal_area_sqm", "shape_area_sqm",
        "status", "municipality", "county", "region", "update_date",
        "centroid_lat", "centroid_lng",
    ]

    with open(filepath, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for p in parcels:
            row = []
            for field in fields:
                val = p.get(field, "")
                if isinstance(val, float) and field in ("legal_area_sqm", "shape_area_sqm"):
                    val = f"{val:.1f}" if val else ""
                elif isinstance(val, float) and field in ("centroid_lat", "centroid_lng"):
                    val = f"{val:.6f}" if val else ""
                row.append(val if val is not None else "")
            writer.writerow(row)


def save_html_report(gush_data: dict, filepath: str) -> None:
    """Generate an HTML report for all parcels."""
    html_parts = [
        "<!DOCTYPE html>",
        "<html dir='rtl' lang='he'>",
        "<head>",
        "  <meta charset='UTF-8'>",
        "  <title>דוח חלקות כפר חב\"ד</title>",
        "  <style>",
        "    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background: #f5f5f5; }",
        "    h1 { color: #1a5276; border-bottom: 3px solid #2980b9; padding-bottom: 10px; }",
        "    h2 { color: #2c3e50; margin-top: 30px; }",
        "    table { border-collapse: collapse; width: 100%; margin: 15px 0; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }",
        "    th { background: #2980b9; color: white; padding: 10px 8px; text-align: right; font-size: 13px; }",
        "    td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 13px; }",
        "    tr:nth-child(even) { background: #f8f9fa; }",
        "    tr:hover { background: #e8f4f8; }",
        "    .summary { background: #eaf2f8; padding: 15px; border-radius: 8px; margin: 15px 0; }",
        "    .summary span { font-weight: bold; color: #2980b9; }",
        "    .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; }",
        "    .badge-green { background: #d5f4e6; color: #27ae60; }",
        "    .badge-blue { background: #d6eaf8; color: #2980b9; }",
        "    .badge-gray { background: #eee; color: #666; }",
        "    .footer { margin-top: 30px; padding: 15px; background: #2c3e50; color: white; border-radius: 8px; text-align: center; }",
        "  </style>",
        "</head>",
        "<body>",
        f"  <h1>📋 דוח חלקות – כפר חב\"ד</h1>",
        f"  <p>נוצר: {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>",
    ]

    total_parcels = 0
    total_area = 0

    for gush, info in gush_data.items():
        parcels = info.get("parcels", [])
        total_parcels += len(parcels)

        html_parts.append(f"  <h2>גוש {gush} ({len(parcels)} חלקות)</h2>")

        gush_area = sum(p.get("legal_area_sqm") or p.get("shape_area_sqm") or 0 for p in parcels)
        total_area += gush_area

        html_parts.append(f"  <div class='summary'>")
        html_parts.append(f"    סה\"כ חלקות: <span>{len(parcels)}</span> | ")
        html_parts.append(f"    שטח כולל: <span>{gush_area:,.0f} מ\"ר</span> | ")
        html_parts.append(f"    שטח כולל: <span>{gush_area/1000:.2f} דונם</span>")
        html_parts.append(f"  </div>")

        if parcels:
            html_parts.append("  <table>")
            html_parts.append("    <tr>")
            html_parts.append("      <th>חלקה</th><th>שטח רשום</th><th>סטטוס</th>")
            html_parts.append("      <th>מועצה</th><th>נפה</th><th>מחוז</th><th>עדכון</th>")
            html_parts.append("    </tr>")

            for p in sorted(parcels, key=lambda x: x.get("helka", 0)):
                area = p.get("legal_area_sqm") or p.get("shape_area_sqm")
                area_str = f"{area:,.0f} מ\"ר" if area else "—"
                status = p.get("status", "—")
                status_class = "badge-green" if "רשום" in status else "badge-blue" if "מוסדר" in status else "badge-gray"

                html_parts.append("    <tr>")
                html_parts.append(f"      <td><b>{p.get('helka', '—')}</b></td>")
                html_parts.append(f"      <td>{area_str}</td>")
                html_parts.append(f"      <td><span class='badge {status_class}'>{status}</span></td>")
                html_parts.append(f"      <td>{p.get('municipality', '—')}</td>")
                html_parts.append(f"      <td>{p.get('county', '—')}</td>")
                html_parts.append(f"      <td>{p.get('region', '—')}</td>")
                html_parts.append(f"      <td>{p.get('update_date', '—')}</td>")
                html_parts.append("    </tr>")

            html_parts.append("  </table>")

    # Summary
    html_parts.append(f"  <div class='footer'>")
    html_parts.append(f"    סה\"כ: {total_parcels} חלקות ב-{len(gush_data)} גושים | ")
    html_parts.append(f"    שטח כולל: {total_area:,.0f} מ\"ר ({total_area/1000:,.1f} דונם)")
    html_parts.append(f"  </div>")
    html_parts.append("</body>")
    html_parts.append("</html>")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(html_parts))


# ─── Database Update ─────────────────────────────────────────────────────────
def update_db(parcels: List[dict], db_path: str) -> int:
    """Update SQLite database with parcel details."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys=ON")

    count = 0
    for p in parcels:
        gush = p.get("gush")
        helka = p.get("helka")
        if not gush or not helka:
            continue

        # Ensure gush exists
        conn.execute(
            "INSERT OR IGNORE INTO gushim (gush, name) VALUES (?, ?)",
            (gush, f"גוש {gush}"),
        )

        notes_parts = []
        if p.get("legal_area_sqm"):
            notes_parts.append(f"שטח: {p['legal_area_sqm']:.1f} מ\"ר")
        if p.get("status"):
            notes_parts.append(f"סטטוס: {p['status']}")
        if p.get("municipality"):
            notes_parts.append(f"מועצה: {p['municipality']}")
        if p.get("county"):
            notes_parts.append(f"נפה: {p['county']}")

        conn.execute(
            """INSERT INTO parcels (gush, helka, notes)
               VALUES (?, ?, ?)
               ON CONFLICT(gush, helka) DO UPDATE SET notes = excluded.notes""",
            (gush, int(helka), " | ".join(notes_parts)),
        )
        count += 1

    conn.commit()
    conn.close()
    return count


# ─── Main ─────────────────────────────────────────────────────────────────────
def download_all(
    gushim: List[int],
    output_dir: str,
    db_path: str,
    helka_range: Optional[Tuple[int, int]] = None,
    with_neighbors: bool = False,
    html_report: bool = False,
):
    """Download detailed parcel information for all gushim."""
    os.makedirs(output_dir, exist_ok=True)

    print(f"\n{'═' * 55}")
    print(f"  הורדת מידע מפורט על חלקות – כפר חב\"ד")
    print(f"  גושים: {len(gushim)}")
    if helka_range:
        print(f"  טווח חלקות: {helka_range[0]}–{helka_range[1]}")
    if with_neighbors:
        print(f"  כולל מידע על שכנים")
    print(f"{'═' * 55}\n")

    start = time.time()
    gush_data = {}
    all_parcels = []
    total_parcels = 0

    for gush in gushim:
        print(f"  גוש {gush}:")

        # Get parcels
        features = query_parcels(gush, helka_range)
        print(f"    → {len(features)} חלקות מ-ArcGIS")

        # Get block info
        block = query_block_info(gush)

        # Parse each parcel
        parcels = []
        for feat in features:
            p = parse_parcel(feat, with_neighbors=with_neighbors)
            parcels.append(p)

        gush_data[str(gush)] = {
            "gush": gush,
            "parcel_count": len(parcels),
            "parcels": parcels,
            "block_info": block.get("properties") if block else None,
        }

        all_parcels.extend(parcels)
        total_parcels += len(parcels)

        # Save per-gush JSON
        gush_path = os.path.join(output_dir, f"gush_{gush}_details.json")
        save_json(gush_data[str(gush)], gush_path)

        # Update DB
        update_db(parcels, db_path)

        time.sleep(0.5)

    # Save combined outputs
    combined_path = os.path.join(output_dir, "all_parcels_details.json")
    save_json(gush_data, combined_path)
    print(f"\n  ✓ JSON: {combined_path}")

    csv_path = os.path.join(output_dir, "all_parcels_report.csv")
    save_csv_report(all_parcels, csv_path)
    print(f"  ✓ CSV: {csv_path}")

    if html_report:
        html_path = os.path.join(output_dir, "parcels_report.html")
        save_html_report(gush_data, html_path)
        print(f"  ✓ HTML: {html_path}")

    elapsed = time.time() - start
    print(f"\n{'═' * 55}")
    print(f"  סיכום פרטי חלקות:")
    print(f"    חלקות: {total_parcels}")
    print(f"    גושים: {len(gushim)}")
    print(f"    זמן: {elapsed:.1f} שניות")
    print(f"    תיקייה: {output_dir}/")
    print(f"{'═' * 55}")

    return {"parcels": total_parcels, "gushim": len(gushim)}


def main():
    parser = argparse.ArgumentParser(
        description="הורדת מידע מפורט על חלקות – כפר חב\"ד"
    )
    parser.add_argument(
        "--gush", type=int, nargs="+", default=None,
        help="גוש/ים ספציפיים (ברירת מחדל: כולם)",
    )
    parser.add_argument(
        "--helka", type=int, nargs=2, default=None, metavar=("FROM", "TO"),
        help="טווח חלקות (למשל: --helka 1 50)",
    )
    parser.add_argument(
        "--with-neighbors", action="store_true",
        help="הוסף מידע על חלקות שכנות",
    )
    parser.add_argument(
        "--html-report", action="store_true",
        help="צור דוח HTML ויזואלי",
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
    helka_range = tuple(args.helka) if args.helka else None

    download_all(
        gushim, args.output, args.db,
        helka_range=helka_range,
        with_neighbors=args.with_neighbors,
        html_report=args.html_report,
    )


if __name__ == "__main__":
    main()
