"""
Final retry for layers that don't support pagination at all.
Queries without resultOffset/resultRecordCount, relying on the spatial filter
to keep result count under the server's maxRecordCount.
"""

import json, os, ssl, time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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

EXTENT = {"xmin": 183536, "ymin": 652679, "xmax": 188828, "ymax": 658106, "spatialReference": {"wkid": 2039}}
WIDE_EXTENT = {"xmin": 180536, "ymin": 649679, "xmax": 191828, "ymax": 661106, "spatialReference": {"wkid": 2039}}
OUTPUT_DIR = "data/gis_layers"


def esri_to_geojson_geom(geom):
    if not geom:
        return None
    if "rings" in geom:
        rings = geom["rings"]
        return {"type": "Polygon", "coordinates": rings} if len(rings) == 1 else {"type": "MultiPolygon", "coordinates": [rings]}
    if "paths" in geom:
        paths = geom["paths"]
        return {"type": "LineString", "coordinates": paths[0]} if len(paths) == 1 else {"type": "MultiLineString", "coordinates": paths}
    if "x" in geom and "y" in geom:
        return {"type": "Point", "coordinates": [geom["x"], geom["y"]]}
    return None


def query_no_pagination(url, where="1=1", extent=None, out_sr=2039):
    """Query without any pagination parameters."""
    query_url = f"{url}/query"
    params = {
        "where": where,
        "outFields": "*",
        "outSR": out_sr,
        "returnGeometry": "true",
        "f": "json",
    }
    if extent:
        params["geometry"] = json.dumps(extent)
        params["geometryType"] = "esriGeometryEnvelope"
        params["spatialRel"] = "esriSpatialRelIntersects"
        params["inSR"] = 2039

    r = SESSION.get(query_url, params=params, timeout=120)
    r.raise_for_status()
    data = r.json()

    if data.get("error"):
        print(f"    API error: {data['error'].get('message','')}")
        return []

    features = []
    for feat in data.get("features", []):
        features.append({
            "type": "Feature",
            "properties": feat.get("attributes", {}),
            "geometry": esri_to_geojson_geom(feat.get("geometry")),
        })

    exceeded = data.get("exceededTransferLimit", False)
    if exceeded:
        print(f"    WARNING: Transfer limit exceeded! Got {len(features)} but there are more.")
    return features


def save_geojson(features, path, name, description=""):
    geojson = {
        "type": "FeatureCollection",
        "name": name,
        "description": description,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::2039"}},
        "features": features,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    return os.path.getsize(path) / 1024


LAYERS = [
    {"name": "tmm321_land_use", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/28", "extent": EXTENT, "desc": "תמ\"מ 3/21 – יעודי קרקע"},
    {"name": "tmm321_roads", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/10", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – כבישים"},
    {"name": "tmm321_rail", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/12", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – מסילת ברזל"},
    {"name": "tmm321_interchanges", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/9", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – מחלפים"},
    {"name": "tmm321_noise_natbag", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/5", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – מגבלות רעש נתב\"ג"},
    {"name": "tmm321_birds_natbag", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/6", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – מגבלת ציפורים נתב\"ג"},
    {"name": "tmm321_height_limit", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/7", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – מגבלת גובה"},
    {"name": "tmm321_electricity", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/4", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – קווי חשמל"},
    {"name": "tmm321_gas", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/19", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – קו גז"},
    {"name": "tmm321_water", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/20", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – קו מים"},
    {"name": "tmm321_streams", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/21", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – נחלים"},
    {"name": "tmm321_sewage", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/22", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – אתר טיהור שפכים"},
    {"name": "tmm321_heritage", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/23", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – אתר הנצחה"},
    {"name": "tmm321_municipal_border", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/26", "extent": EXTENT, "desc": "תמ\"מ 3/21 – גבול מוניציפלי"},
    {"name": "tmm321_plan_border", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/27", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – גבול תכנית"},
    {"name": "tmm321_transport_center", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/16", "extent": WIDE_EXTENT, "desc": "תמ\"מ 3/21 – מרכז תחבורה"},
    {"name": "gvulot_municipal", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/1", "extent": EXTENT, "desc": "גבולות – שיפוט"},
    {"name": "gvulot_local_councils", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/2", "extent": EXTENT, "desc": "גבולות – ועדים מקומיים"},
    {"name": "gvulot_planning_areas", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/3", "extent": EXTENT, "desc": "גבולות – מרחבי תכנון"},
    {"name": "gvulot_sub_districts", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/4", "extent": EXTENT, "desc": "גבולות – נפות"},
    {"name": "ttl_blue_lines", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/ttl_all_blue_lines/MapServer/0", "extent": WIDE_EXTENT, "desc": "קווים כחולים – כל התת\"לים"},
    {"name": "raw_materials", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/mirbatzei_chomrei_gelem/MapServer/0", "extent": WIDE_EXTENT, "desc": "מרבצי חומרי גלם"},
    {"name": "tama35_env_noise", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/10", "extent": WIDE_EXTENT, "desc": "תמ\"א 35 – רעש מטוסים"},
    {"name": "tama35_env_electricity", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/11", "extent": WIDE_EXTENT, "desc": "תמ\"א 35 – חשמל ראשי"},
    {"name": "tama35_env_water_protect", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/12", "extent": WIDE_EXTENT, "desc": "תמ\"א 35 – שימור מים"},
    {"name": "tama35_env_landscape", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/13", "extent": WIDE_EXTENT, "desc": "תמ\"א 35 – רגישות נופית"},
    {"name": "gvulot_district", "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/0", "extent": EXTENT, "desc": "גבולות – מחוז"},
]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []

    print(f"Final retry: {len(LAYERS)} layers (no pagination)...")
    print("=" * 60)

    for idx, layer in enumerate(LAYERS):
        name = layer["name"]
        out_path = os.path.join(OUTPUT_DIR, f"{name}.geojson")

        # Skip if already has data
        if os.path.exists(out_path):
            try:
                with open(out_path, "r", encoding="utf-8") as f:
                    existing = json.load(f)
                if len(existing.get("features", [])) > 0:
                    print(f"[{idx+1}/{len(LAYERS)}] SKIP {name} ({len(existing['features'])} features)")
                    results.append({"name": name, "status": "skip"})
                    continue
            except:
                pass

        print(f"[{idx+1}/{len(LAYERS)}] {layer['desc']}")
        try:
            features = query_no_pagination(layer["url"], extent=layer.get("extent"))
            if features:
                size_kb = save_geojson(features, out_path, name, layer["desc"])
                print(f"    OK: {len(features)} features ({size_kb:.0f} KB)")
                results.append({"name": name, "status": "ok", "features": len(features)})
            else:
                print(f"    Empty")
                results.append({"name": name, "status": "empty"})
        except Exception as e:
            print(f"    ERROR: {e}")
            results.append({"name": name, "status": "error", "error": str(e)})

        time.sleep(1)

    ok = sum(1 for r in results if r["status"] == "ok")
    skip = sum(1 for r in results if r["status"] == "skip")
    print(f"\n{'='*60}")
    print(f"Results: {ok} downloaded, {skip} skipped, {len(LAYERS)-ok-skip} empty/error")


if __name__ == "__main__":
    main()
