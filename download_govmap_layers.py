"""
download_govmap_layers.py – הורדת שכבות GIS מ-GovMap לכפר חב"ד
==============================================================

מוריד שכבות מידע גיאוגרפי מ-govmap.gov.il / ags.govmap.gov.il
עבור האזור של כפר חב"ד.

שכבות זמינות:
  • תב"ע פעילות (TABA)       – גבולות תכניות פעילות
  • ייעודי קרקע               – שימושי קרקע מאושרים
  • זכויות בנייה              – אחוזי בנייה, קווי בניין
  • תשתיות                    – מים, ביוב, חשמל
  • כבישים ודרכים             – רשת דרכים
  • מבני ציבור                – בתי ספר, מסגדים, כנסיות
  • שטחים פתוחים              – גנים, יערות, שמורות
  • הפקעות                    – שטחים להפקעה

שימוש::

    python download_govmap_layers.py                        # כל השכבות
    python download_govmap_layers.py --layers taba landuse  # שכבות ספציפיות
    python download_govmap_layers.py --bbox custom          # BBox מותאם
"""

import argparse
import json
import os
import time
from typing import Any, Dict, List, Optional

import requests

# ─── Configuration ────────────────────────────────────────────────────────────

# Kfar Chabad bounding box in ITM (EPSG:2039)
# Approximate bounds covering all 12 gushim
KFAR_CHABAD_BBOX_ITM = {
    "xmin": 184500,
    "ymin": 653500,
    "xmax": 188500,
    "ymax": 657500,
}

# Same in WGS84 (EPSG:4326)
KFAR_CHABAD_BBOX_WGS84 = {
    "xmin": 34.835,
    "ymin": 31.945,
    "xmax": 34.880,
    "ymax": 31.980,
}

# GovMap ArcGIS REST services
GOVMAP_AGS_BASE = "https://ags.govmap.gov.il/arcgis/rest/services"

# Available layers to download
LAYERS = {
    "taba_active": {
        "name": "תב\"ע פעילות",
        "url": f"{GOVMAP_AGS_BASE}/PlanningPublic/Xplan/MapServer/1/query",
        "fields": "PL_NUMBER,PLAN_NAME,STATION_DESC,PL_LANDUSE_STRING,PL_AREA_DUNAM,PL_BY_AUTH_OF,PL_DATE_8",
        "description": "תכניות בנין עיר פעילות",
    },
    "taba_approved": {
        "name": "תב\"ע מאושרות",
        "url": f"{GOVMAP_AGS_BASE}/PlanningPublic/Xplan/MapServer/0/query",
        "fields": "PL_NUMBER,PLAN_NAME,STATION_DESC,PL_LANDUSE_STRING,PL_AREA_DUNAM,PL_BY_AUTH_OF,PL_DATE_8",
        "description": "תכניות בנין עיר מאושרות",
    },
    "taba_deposited": {
        "name": "תב\"ע בהפקדה",
        "url": f"{GOVMAP_AGS_BASE}/PlanningPublic/Xplan/MapServer/2/query",
        "fields": "PL_NUMBER,PLAN_NAME,STATION_DESC,PL_LANDUSE_STRING,PL_AREA_DUNAM",
        "description": "תכניות בנין עיר בהפקדה",
    },
    "landuse": {
        "name": "ייעודי קרקע",
        "url": f"{GOVMAP_AGS_BASE}/PlanningPublic/landuse/MapServer/0/query",
        "fields": "*",
        "description": "שימושי קרקע מאושרים",
    },
    "roads": {
        "name": "כבישים ודרכים",
        "url": f"{GOVMAP_AGS_BASE}/transport/roads/MapServer/0/query",
        "fields": "*",
        "description": "רשת כבישים ודרכים",
    },
    "buildings": {
        "name": "מבנים",
        "url": f"{GOVMAP_AGS_BASE}/buildings/MapServer/0/query",
        "fields": "*",
        "description": "שכבת מבנים",
    },
    "addresses": {
        "name": "כתובות",
        "url": f"{GOVMAP_AGS_BASE}/AddrAll/MapServer/0/query",
        "fields": "*",
        "description": "כתובות רשומות",
    },
    "water": {
        "name": "מים וביוב",
        "url": f"{GOVMAP_AGS_BASE}/infrastructure/water/MapServer/0/query",
        "fields": "*",
        "description": "תשתיות מים וביוב",
    },
    "electricity": {
        "name": "חשמל",
        "url": f"{GOVMAP_AGS_BASE}/infrastructure/electricity/MapServer/0/query",
        "fields": "*",
        "description": "תשתיות חשמל",
    },
    "open_spaces": {
        "name": "שטחים פתוחים",
        "url": f"{GOVMAP_AGS_BASE}/nature/open_spaces/MapServer/0/query",
        "fields": "*",
        "description": "שטחים פתוחים ומוגנים",
    },
    "heritage": {
        "name": "אתרי מורשת",
        "url": f"{GOVMAP_AGS_BASE}/heritage_sites/MapServer/0/query",
        "fields": "*",
        "description": "אתרי שימור ומורשת",
    },
}

OUTPUT_DIR = "./kfar_chabad_data/govmap_layers"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Referer": "https://www.govmap.gov.il/",
})
# Some Israeli gov servers have SSL issues – allow fallback
SESSION.verify = True


# ─── Query Functions ─────────────────────────────────────────────────────────
def query_layer(
    url: str,
    bbox: dict,
    out_fields: str = "*",
    out_sr: str = "4326",
    max_features: int = 5000,
) -> List[dict]:
    """Query a GovMap ArcGIS REST layer by bounding box."""
    all_features = []
    offset = 0
    page_size = min(1000, max_features)

    while len(all_features) < max_features:
        params = {
            "geometry": json.dumps({
                "xmin": bbox["xmin"],
                "ymin": bbox["ymin"],
                "xmax": bbox["xmax"],
                "ymax": bbox["ymax"],
                "spatialReference": {"wkid": 2039},
            }),
            "geometryType": "esriGeometryEnvelope",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": out_fields,
            "outSR": out_sr,
            "returnGeometry": "true",
            "f": "geojson",
            "resultOffset": str(offset),
            "resultRecordCount": str(page_size),
        }

        try:
            resp = SESSION.get(url, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.SSLError:
            # Retry without SSL verification for Israeli gov servers
            try:
                resp = SESSION.get(url, params=params, timeout=60, verify=False)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e2:
                print(f"      שגיאת SSL (גם ללא אימות): {e2}")
                break
        except requests.exceptions.RequestException as e:
            print(f"      שגיאה בבקשה: {e}")
            break
        except json.JSONDecodeError:
            # Try JSON format instead of GeoJSON
            params["f"] = "json"
            try:
                resp = SESSION.get(url, params=params, timeout=60)
                data = resp.json()
                # Convert esri JSON to simple features
                features = data.get("features", [])
                for feat in features:
                    attrs = feat.get("attributes", {})
                    all_features.append({
                        "type": "Feature",
                        "properties": attrs,
                        "geometry": convert_esri_geometry(feat.get("geometry")),
                    })
                if len(features) < page_size:
                    break
                offset += page_size
                time.sleep(0.3)
                continue
            except Exception:
                break

        if "error" in data:
            code = data["error"].get("code", "?")
            msg = data["error"].get("message", "")
            print(f"      שגיאת שרת ({code}): {msg}")
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


def convert_esri_geometry(geom: Optional[dict]) -> Optional[dict]:
    """Convert Esri JSON geometry to GeoJSON geometry."""
    if not geom:
        return None

    if "rings" in geom:
        if len(geom["rings"]) == 1:
            return {"type": "Polygon", "coordinates": geom["rings"]}
        return {"type": "MultiPolygon", "coordinates": [[r] for r in geom["rings"]]}
    elif "paths" in geom:
        if len(geom["paths"]) == 1:
            return {"type": "LineString", "coordinates": geom["paths"][0]}
        return {"type": "MultiLineString", "coordinates": geom["paths"]}
    elif "x" in geom and "y" in geom:
        return {"type": "Point", "coordinates": [geom["x"], geom["y"]]}
    elif "points" in geom:
        return {"type": "MultiPoint", "coordinates": geom["points"]}

    return None


# ─── Download functions ──────────────────────────────────────────────────────
def download_layer(
    layer_key: str,
    layer_info: dict,
    bbox: dict,
    output_dir: str,
) -> dict:
    """Download a single GovMap layer."""
    name = layer_info["name"]
    url = layer_info["url"]
    fields = layer_info.get("fields", "*")

    print(f"  {name} ({layer_key})...")

    features = query_layer(url, bbox, out_fields=fields)

    result = {
        "layer": layer_key,
        "name": name,
        "features": len(features),
        "error": None,
    }

    if features:
        # Save as GeoJSON
        fc = {
            "type": "FeatureCollection",
            "name": name,
            "features": features,
        }
        filepath = os.path.join(output_dir, f"{layer_key}.geojson")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(fc, f, ensure_ascii=False, indent=2)
        print(f"    ✓ {len(features)} פיצ'רים → {filepath}")
    else:
        print(f"    ⚠ אין נתונים (ייתכן ששירות לא זמין)")
        result["error"] = "no_data"

    return result


def download_all(
    layer_keys: Optional[List[str]] = None,
    bbox: Optional[dict] = None,
    output_dir: str = OUTPUT_DIR,
):
    """Download all selected GovMap layers."""
    os.makedirs(output_dir, exist_ok=True)

    if bbox is None:
        bbox = KFAR_CHABAD_BBOX_ITM

    if layer_keys is None:
        layer_keys = list(LAYERS.keys())

    print(f"\n{'═' * 55}")
    print(f"  הורדת שכבות GIS מ-GovMap")
    print(f"  שכבות: {len(layer_keys)}")
    print(f"  BBox ITM: [{bbox['xmin']}, {bbox['ymin']}] → [{bbox['xmax']}, {bbox['ymax']}]")
    print(f"{'═' * 55}\n")

    start = time.time()
    results = []

    for key in layer_keys:
        if key not in LAYERS:
            print(f"  ⚠ שכבה לא מוכרת: {key}")
            continue

        result = download_layer(key, LAYERS[key], bbox, output_dir)
        results.append(result)
        time.sleep(1)  # Rate limiting

    elapsed = time.time() - start
    total_features = sum(r["features"] for r in results)
    success = sum(1 for r in results if r["error"] is None and r["features"] > 0)
    failed = sum(1 for r in results if r["error"] is not None)

    print(f"\n{'═' * 55}")
    print(f"  סיכום GovMap:")
    print(f"    שכבות שהורדו: {success}/{len(results)}")
    if failed:
        print(f"    שכבות שנכשלו: {failed}")
    print(f"    סה\"כ פיצ'רים: {total_features}")
    print(f"    זמן: {elapsed:.1f} שניות")
    print(f"    תיקייה: {output_dir}/")
    print(f"{'═' * 55}")

    return results


def main():
    parser = argparse.ArgumentParser(
        description="הורדת שכבות GIS מ-GovMap – כפר חב\"ד"
    )
    parser.add_argument(
        "--layers", nargs="+", default=None,
        choices=list(LAYERS.keys()),
        help=f"שכבות להורדה (ברירת מחדל: כולן). אפשרויות: {', '.join(LAYERS.keys())}",
    )
    parser.add_argument(
        "--output", default=OUTPUT_DIR,
        help=f"תיקיית פלט (ברירת מחדל: {OUTPUT_DIR})",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="הצג רשימת שכבות זמינות ויצא",
    )
    args = parser.parse_args()

    if args.list:
        print("\nשכבות זמינות:")
        print("=" * 50)
        for key, info in LAYERS.items():
            print(f"  {key:<20} {info['name']}")
            print(f"  {'':20} {info['description']}")
        return

    download_all(args.layers, output_dir=args.output)


if __name__ == "__main__":
    main()
