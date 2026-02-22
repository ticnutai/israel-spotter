"""
Download all תב"ע (town building plans) for כפר חב"ד from the Israeli
Planning Administration (מינהל התכנון) iPlan GIS service.

Service : PlanningPublic/Xplan/MapServer
Layer 1 : קווים כחולים – תכניות מקוונות (plan boundaries)
Filter  : plan_county_name LIKE '%חב_ד%'   (matches  כפר חב"ד)

Output  : GeoJSON with all plan polygons + attributes (plan number, name,
          status, land-use, area, URL, dates, etc.)
CRS     : Israel TM Grid  (EPSG 2039)
"""

import json
import os
import ssl
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ── SSL adapter (ags.iplan.gov.il needs relaxed TLS) ──────────────────────────
class _IplanSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


SESSION = requests.Session()
SESSION.mount("https://ags.iplan.gov.il", _IplanSSLAdapter())
SESSION.verify = False


# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL = (
    "https://ags.iplan.gov.il/arcgisiplan/rest/services/"
    "PlanningPublic/Xplan/MapServer/1"
)
QUERY_URL = f"{BASE_URL}/query"
PAGE_SIZE = 1000

# The name in the DB contains a literal double-quote character (כפר חב"ד).
# We use a LIKE with a single-char wildcard (_) instead.
WHERE = "plan_county_name LIKE '%חב_ד%'"

OUTPUT_DIR = "data"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "taba_kfar_chabad.geojson")


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_feature_count(where=WHERE):
    params = {"where": where, "returnCountOnly": "true", "f": "json"}
    r = SESSION.get(QUERY_URL, params=params, timeout=60)
    r.raise_for_status()
    return r.json()["count"]


def query_features(where=WHERE, out_fields="*", out_sr=2039):
    """Query one batch (up to PAGE_SIZE) from the server in Esri JSON and
    convert to GeoJSON features locally."""
    params = {
        "where": where,
        "outFields": out_fields,
        "outSR": out_sr,
        "returnGeometry": "true",
        "resultRecordCount": PAGE_SIZE,
        "f": "json",
    }
    r = SESSION.get(QUERY_URL, params=params, timeout=120)
    r.raise_for_status()
    data = r.json()

    if data.get("error"):
        raise Exception(f"Query error: {json.dumps(data['error'], ensure_ascii=False)}")

    exceeded = data.get("exceededTransferLimit", False)
    raw = data.get("features", [])

    features = []
    for feat in raw:
        geom = feat.get("geometry")
        geojson_geom = None
        if geom and "rings" in geom:
            rings = geom["rings"]
            if len(rings) == 1:
                geojson_geom = {"type": "Polygon", "coordinates": rings}
            else:
                geojson_geom = {"type": "MultiPolygon", "coordinates": [rings]}
        features.append({
            "type": "Feature",
            "properties": feat.get("attributes", {}),
            "geometry": geojson_geom,
        })
    return features, exceeded


def download_all():
    total = get_feature_count()
    print(f"Total plans for כפר חב\"ד: {total}")

    all_features = []
    last_oid = -1

    while True:
        where = f"({WHERE}) AND objectid > {last_oid}"
        print(f"  Fetching where OBJECTID > {last_oid} ...")
        features, exceeded = query_features(where=where)

        if not features:
            break

        all_features.extend(features)
        # objectid is lowercase in this service
        last_oid = max(f["properties"]["objectid"] for f in features)
        print(f"    Got {len(features)} plans (last objectid = {last_oid})")

        if not exceeded:
            break
        time.sleep(1)

    print(f"  Total fetched: {len(all_features)} plans")
    return all_features


def save_geojson(features, path):
    geojson = {
        "type": "FeatureCollection",
        "name": "taba_kfar_chabad",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:EPSG::2039"},
        },
        "features": features,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(path) / 1024
    print(f"Saved → {path}  ({size_kb:.0f} KB)")


def print_summary(features):
    """Print a nice summary table of the downloaded plans."""
    print("\n" + "=" * 80)
    print(f"{'#':<3} {'מספר תכנית':<20} {'סטטוס':<18} {'דונם':>8}  שם תכנית")
    print("-" * 80)
    for i, f in enumerate(features, 1):
        p = f["properties"]
        num = (p.get("pl_number") or "")[:19]
        name = (p.get("pl_name") or "")[:40]
        status = (p.get("station_desc") or "")[:17]
        area = p.get("pl_area_dunam")
        area_s = f"{area:>8.1f}" if area else "       -"
        print(f"{i:<3} {num:<20} {status:<18} {area_s}  {name}")
    print("=" * 80)


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Downloading כל התב\"עות של כפר חב\"ד")
    print("=" * 60)

    features = download_all()
    save_geojson(features, OUTPUT_FILE)
    print_summary(features)
    print("\nDone ✓")
