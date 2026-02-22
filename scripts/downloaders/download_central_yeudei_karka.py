"""
Download יעודי קרקע (land use designations) from the Central District's
תמ"מ compilation (תוכנית מתאר מחוזית) published by the Israeli Planning
Administration (מינהל התכנון).

Service: PlanningPublic/compilation_tmm_merkaz (MapServer)
Layer 12: יעודי קרקע

Since this is a MapServer (not FeatureServer), createReplica is unavailable.
Instead we paginate through the /query endpoint (maxRecordCount = 1000) and
save all features as a GeoJSON file. The coordinate system is Israel TM Grid
(EPSG 2039).
"""

import json
import os
import ssl
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context


# ── Custom SSL adapter for ags.iplan.gov.il ────────────────────────────────────
# The server requires a specific set of ciphers / TLS settings that Python's
# default SSL context rejects.  We create a permissive adapter.
class _IplanSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # Allow legacy / wider cipher set
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def _session():
    """Return a requests.Session wired with the custom SSL adapter."""
    s = requests.Session()
    s.mount("https://ags.iplan.gov.il", _IplanSSLAdapter())
    s.verify = False
    return s


SESSION = _session()

# Suppress the InsecureRequestWarning we'll get with verify=False
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# ── Configuration ──────────────────────────────────────────────────────────────
BASE_URL = (
    "https://ags.iplan.gov.il/arcgisiplan/rest/services/"
    "PlanningPublic/compilation_tmm_merkaz/MapServer/12"
)
QUERY_URL = f"{BASE_URL}/query"
PAGE_SIZE = 1000          # server maxRecordCount
OUTPUT_DIR = "data"
OUTPUT_GEOJSON = os.path.join(OUTPUT_DIR, "yeudei_karka_merkaz.geojson")
OUTPUT_SHAPEFILE = os.path.join(OUTPUT_DIR, "yeudei_karka_merkaz.shp")


def get_feature_count(where="1=1"):
    """Return total number of features matching the where clause."""
    params = {
        "where": where,
        "returnCountOnly": "true",
        "f": "json",
    }
    r = SESSION.get(QUERY_URL, params=params, timeout=60)
    r.raise_for_status()
    return r.json()["count"]


def query_features(where="1=1", out_fields="*", out_sr=2039):
    """
    Query a batch of features from the MapServer layer.
    Uses JSON format (GeoJSON fails on this server for filtered queries)
    and converts to GeoJSON features locally.

    Parameters
    ----------
    where : str
        SQL WHERE clause (used for OBJECTID-based pagination).
    out_fields : str
        Comma-separated list of fields, or '*' for all.
    out_sr : int
        Output spatial reference WKID.  2039 = Israel TM Grid.

    Returns
    -------
    list[dict]  List of GeoJSON Feature dicts.
    bool        True if there are more features to fetch.
    """
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
    raw_features = data.get("features", [])

    # Convert esri JSON features → GeoJSON features
    geojson_features = []
    for feat in raw_features:
        geom = feat.get("geometry")
        geojson_geom = None
        if geom and "rings" in geom:
            geojson_geom = {
                "type": "Polygon" if len(geom["rings"]) == 1 else "MultiPolygon",
                "coordinates": geom["rings"] if len(geom["rings"]) == 1 else [geom["rings"]],
            }
        geojson_features.append({
            "type": "Feature",
            "properties": feat.get("attributes", {}),
            "geometry": geojson_geom,
        })

    return geojson_features, exceeded


def download_all_features():
    """Download every feature in the layer using OBJECTID-based pagination."""
    total = get_feature_count()
    print(f"Total features: {total}")

    all_features = []
    last_oid = -1  # start before the first OBJECTID

    while True:
        where = f"OBJECTID > {last_oid}"
        print(f"  Fetching features where {where} ...")
        features, exceeded = query_features(where=where)

        if not features:
            break

        all_features.extend(features)
        # Get the max OBJECTID from this batch to continue from there
        last_oid = max(f["properties"]["OBJECTID"] for f in features)
        print(f"    Got {len(features)} features (last OBJECTID = {last_oid})")

        if not exceeded:
            break  # no more data
        time.sleep(1)  # be polite to the server

    print(f"  Fetched {len(all_features)} features in total.")
    return all_features


def save_geojson(features, path):
    """Write a list of GeoJSON features to a .geojson file."""
    geojson = {
        "type": "FeatureCollection",
        "name": "yeudei_karka_merkaz",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:EPSG::2039"},
        },
        "features": features,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)
    print(f"Saved GeoJSON → {path}  ({os.path.getsize(path) / 1024 / 1024:.1f} MB)")


def convert_to_shapefile(geojson_path, shp_path):
    """
    Optionally convert GeoJSON to Shapefile using ogr2ogr (GDAL).
    Requires GDAL / ogr2ogr to be installed and on the PATH.
    If not available, the GeoJSON is still usable in QGIS / ArcGIS / etc.
    """
    import shutil
    import subprocess

    if not shutil.which("ogr2ogr"):
        print("  ogr2ogr not found – skipping Shapefile conversion.")
        print("  You can open the .geojson file directly in QGIS / ArcGIS.")
        return

    cmd = [
        "ogr2ogr",
        "-f", "ESRI Shapefile",
        shp_path,
        geojson_path,
        "-lco", "ENCODING=UTF-8",
    ]
    print(f"  Converting to Shapefile: {shp_path}")
    subprocess.run(cmd, check=True)
    print("  Done.")


# ── Main ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("Downloading יעודי קרקע – קומפילצית תמ\"מ מרכז")
    print("=" * 60)

    features = download_all_features()

    # Save as GeoJSON (always works, no extra dependencies)
    save_geojson(features, OUTPUT_GEOJSON)

    # Try converting to Shapefile if ogr2ogr is available
    convert_to_shapefile(OUTPUT_GEOJSON, OUTPUT_SHAPEFILE)

    print("\nAll done ✓")
