"""
Download additional data from multiple sources for כפר חב"ד.

Phase 1 (LOW priority):
  - TMM 3/21 additional layers
  - compilation_tmm_merkaz additional layers
  - CBS statistics
  - Complot SOAP API
  - services8.arcgis.com discovery

Phase 2 (MEDIUM priority):
  - data.gov.il search
  - GovMap layers

Phase 3 (HIGH priority):
  - Retry failed downloads
"""

import json, os, time, ssl, re
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

# === iPlan SSL adapter ===
class _IplanSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)

def iplan_session():
    s = requests.Session()
    s.mount("https://", _IplanSSLAdapter())
    s.verify = False
    return s

# Kfar Chabad area extents (EPSG 2039)
EXTENT = {"xmin": 183536, "ymin": 652679, "xmax": 188828, "ymax": 658106}
WIDE_EXTENT = {"xmin": 180536, "ymin": 649679, "xmax": 191828, "ymax": 661106}
OUTPUT_DIR = "data/gis_layers"


def query_layer(session, base_url, layer_id, name, extent=None, where="1=1"):
    """Query a single layer from iPlan."""
    query_url = f"{base_url}/{layer_id}/query"
    geom = extent or EXTENT
    params = {
        "where": where,
        "geometry": json.dumps(geom),
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "outSR": 2039,
        "returnGeometry": "true",
        "f": "geojson",
    }
    try:
        r = session.get(query_url, params=params, timeout=60)
        data = r.json()
        features = data.get("features", [])
        return features
    except Exception as e:
        print(f"    Error: {e}")
        return []


def save_geojson(features, path, name):
    geojson = {"type": "FeatureCollection", "name": name, "features": features}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    return os.path.getsize(path) / 1024


def discover_layers(session, service_url):
    """Get all layers from an ArcGIS MapServer service."""
    try:
        r = session.get(f"{service_url}?f=json", timeout=30)
        data = r.json()
        layers = data.get("layers", [])
        return [(l["id"], l["name"]) for l in layers]
    except Exception as e:
        print(f"  Discovery error: {e}")
        return []


# ============================================================
# PHASE 1: TMM 3/21 additional layers
# ============================================================
def download_tmm321_extra(session):
    print("\n" + "="*60)
    print("TMM 3/21 – discovering all layers")
    print("="*60)

    base = "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer"
    layers = discover_layers(session, base)
    print(f"  Total layers: {len(layers)}")

    # Find which are already downloaded
    existing = set()
    for f in os.listdir(OUTPUT_DIR):
        if f.startswith("tmm321_"):
            existing.add(f)

    downloaded = 0
    for lid, lname in layers:
        safe_name = re.sub(r'[^\w]', '_', lname).strip('_').lower()
        fname = f"tmm321_layer{lid}_{safe_name}.geojson"
        # Skip if we already have something for this layer
        already = any(f"tmm321_" in e for e in existing)

        print(f"  [{lid}] {lname}")
        features = query_layer(session, base, lid, lname)
        if features:
            path = os.path.join(OUTPUT_DIR, fname)
            if os.path.exists(path):
                print(f"    Skip (exists): {fname}")
                continue
            size = save_geojson(features, path, f"tmm321_{safe_name}")
            print(f"    OK: {len(features)} features ({size:.0f} KB)")
            downloaded += 1
        else:
            print(f"    Empty")
        time.sleep(0.3)

    print(f"\n  TMM 3/21 extra: {downloaded} new layers")
    return downloaded


# ============================================================
# PHASE 1: compilation_tmm_merkaz additional layers
# ============================================================
def download_compilation_tmm_extra(session):
    print("\n" + "="*60)
    print("compilation_tmm_merkaz – discovering all layers")
    print("="*60)

    base = "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/compilation_tmm_merkaz/MapServer"
    layers = discover_layers(session, base)
    print(f"  Total layers: {len(layers)}")

    downloaded = 0
    for lid, lname in layers:
        safe_name = re.sub(r'[^\w]', '_', lname).strip('_').lower()
        fname = f"tmm_merkaz_layer{lid}_{safe_name}.geojson"
        path = os.path.join(OUTPUT_DIR, fname)

        if os.path.exists(path):
            print(f"  [{lid}] {lname} – skip (exists)")
            continue

        print(f"  [{lid}] {lname}")
        features = query_layer(session, base, lid, lname, extent=EXTENT)
        if features:
            size = save_geojson(features, path, f"tmm_merkaz_{safe_name}")
            print(f"    OK: {len(features)} features ({size:.0f} KB)")
            downloaded += 1
        else:
            print(f"    Empty")
        time.sleep(0.3)

    print(f"\n  compilation_tmm_merkaz extra: {downloaded} new layers")
    return downloaded


# ============================================================
# PHASE 1: Discover services8.arcgis.com available services
# ============================================================
def discover_arcgis_services():
    print("\n" + "="*60)
    print("services8.arcgis.com – discovering all services")
    print("="*60)

    org_url = "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services"
    try:
        r = requests.get(f"{org_url}?f=json", timeout=30)
        data = r.json()
        services = data.get("services", [])
        print(f"  Found {len(services)} services:")
        for svc in services:
            print(f"    {svc['name']} ({svc['type']})")
        return services
    except Exception as e:
        print(f"  Error: {e}")
        return []


def download_arcgis_extra_services():
    print("\n" + "="*60)
    print("services8.arcgis.com – downloading additional services")
    print("="*60)

    # Known block numbers for spatial filtering
    try:
        with open("data/blocks_parcels_by_plan.json", "r", encoding="utf-8") as f:
            blocks_map = json.load(f)
        block_list = ", ".join(sorted(blocks_map.keys()))
    except:
        block_list = "6256, 6258, 6260, 6261, 6262, 6269, 6272, 6280, 7187, 7188, 7196, 7311"

    org_base = "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services"

    # First discover what's available
    try:
        r = requests.get(f"{org_base}?f=json", timeout=30)
        services = r.json().get("services", [])
    except Exception as e:
        print(f"  Error discovering: {e}")
        return 0

    # Skip already downloaded ones
    skip_names = {"חלקות", "שכבת_גושים"}
    downloaded = 0

    for svc in services:
        svc_name = svc["name"]
        svc_type = svc["type"]

        if svc_name in skip_names:
            print(f"  Skip (already have): {svc_name}")
            continue

        if svc_type != "FeatureServer":
            print(f"  Skip ({svc_type}): {svc_name}")
            continue

        print(f"\n  Service: {svc_name}")
        safe_name = re.sub(r'[^\w]', '_', svc_name).strip('_').lower()
        svc_url = f"{org_base}/{svc_name}/FeatureServer/0"

        # Check metadata
        try:
            r = requests.get(f"{svc_url}?f=json", timeout=30)
            meta = r.json()
            fields = [f["name"] for f in meta.get("fields", [])]
            geom_type = meta.get("geometryType", "unknown")
            sr = meta.get("extent", {}).get("spatialReference", {})
            print(f"    Geometry: {geom_type}, Fields: {fields[:10]}")

            # Try spatial query with Kfar Chabad extent
            # Need to project if service is in WGS84
            wkid = sr.get("wkid", sr.get("latestWkid", 2039))
            if wkid in (4326, 4269):  # WGS84
                geom = {"xmin": 34.84, "ymin": 31.94, "xmax": 34.90, "ymax": 32.00}
            else:
                geom = EXTENT

            query_url = f"{svc_url}/query"
            params = {
                "where": "1=1",
                "geometry": json.dumps(geom),
                "geometryType": "esriGeometryEnvelope",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": "*",
                "returnGeometry": "true",
                "resultRecordCount": 5000,
                "f": "geojson",
            }
            r = requests.get(query_url, params=params, timeout=60)
            data = r.json()
            features = data.get("features", [])

            if features:
                fname = f"arcgis_{safe_name}.geojson"
                path = os.path.join(OUTPUT_DIR, fname)
                size = save_geojson(features, path, safe_name)
                print(f"    OK: {len(features)} features ({size:.0f} KB)")
                downloaded += 1
            else:
                print(f"    Empty (no features in extent)")

        except Exception as e:
            print(f"    Error: {e}")

        time.sleep(1)

    print(f"\n  Extra ArcGIS services: {downloaded} new layers")
    return downloaded


# ============================================================
# PHASE 1: CBS Statistics
# ============================================================
def download_cbs_data():
    print("\n" + "="*60)
    print("CBS (למ\"ס) – downloading settlement profile")
    print("="*60)

    output_dir = "data/cbs"
    os.makedirs(output_dir, exist_ok=True)

    # Settlement code for כפר חב"ד is 376
    settlement_code = 376

    # Try CBS localities API
    urls = [
        f"https://www.cbs.gov.il/he/settlements/Pages/default.aspx?mode=Yeshuv&code={settlement_code}",
    ]

    # Try the CBS API for statistical data
    api_urls = [
        "https://apis.cbs.gov.il/series/data/list?id=S_L_{}_1&format=json".format(settlement_code),
    ]

    # Download settlement profile page
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"}
        r = requests.get(urls[0], headers=headers, timeout=30)
        if r.status_code == 200:
            path = os.path.join(output_dir, "kfar_chabad_profile.html")
            with open(path, "w", encoding="utf-8") as f:
                f.write(r.text)
            size_kb = os.path.getsize(path) / 1024
            print(f"  Settlement profile: {size_kb:.0f} KB")
        else:
            print(f"  Profile page: HTTP {r.status_code}")
    except Exception as e:
        print(f"  Profile error: {e}")

    # Try to get population data from data.gov.il
    try:
        api_url = "https://data.gov.il/api/3/action/datastore_search"
        params = {
            "resource_id": "64edd0ee-3d5d-43ce-8562-c336c24dbc1f",  # Localities table
            "q": "כפר חבד",
            "limit": 20,
        }
        r = requests.get(api_url, params=params, timeout=30)
        if r.status_code == 200:
            data = r.json()
            records = data.get("result", {}).get("records", [])
            if records:
                path = os.path.join(output_dir, "kfar_chabad_localities.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=2)
                print(f"  Localities data: {len(records)} records")
            else:
                print(f"  No locality records found")
        else:
            print(f"  Localities API: HTTP {r.status_code}")
    except Exception as e:
        print(f"  Localities error: {e}")

    return True


# ============================================================
# PHASE 1: Complot SOAP API
# ============================================================
def try_complot_soap():
    print("\n" + "="*60)
    print("Complot SOAP API – attempting direct access")
    print("="*60)

    ws_url = "https://handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx"
    output_dir = "data/complot_kfar_chabad"
    os.makedirs(output_dir, exist_ok=True)

    # Try WSDL discovery
    try:
        r = requests.get(f"{ws_url}?WSDL", timeout=30,
                         headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
            path = os.path.join(output_dir, "complot_wsdl.xml")
            with open(path, "w", encoding="utf-8") as f:
                f.write(r.text)
            print(f"  WSDL downloaded ({len(r.text)} chars)")

            # Try to call GetTahotBySettlement or similar
            # First check available operations from WSDL
            if "GetTahotBySettlement" in r.text or "GetTahot" in r.text:
                print("  Found GetTahot* operations")
            operations = re.findall(r'<wsdl:operation name="(\w+)"', r.text)
            if not operations:
                operations = re.findall(r'<operation name="(\w+)"', r.text)
            print(f"  Available operations: {operations[:15]}")

            # Try each operation that seems relevant
            for op in operations:
                if any(kw in op.lower() for kw in ["taba", "tahot", "plan", "tochni", "settle"]):
                    print(f"  Trying operation: {op}")
                    # SOAP envelope
                    soap_body = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:web="https://complot.co.il/wsComplotPublicData">
  <soap:Body>
    <web:{op}>
      <web:SiteId>31</web:SiteId>
    </web:{op}>
  </soap:Body>
</soap:Envelope>"""
                    try:
                        r2 = requests.post(ws_url, data=soap_body.encode("utf-8"),
                                           headers={
                                               "Content-Type": "text/xml; charset=utf-8",
                                               "SOAPAction": f"https://complot.co.il/wsComplotPublicData/{op}",
                                               "User-Agent": "Mozilla/5.0",
                                           }, timeout=30)
                        if r2.status_code == 200 and len(r2.text) > 200:
                            path = os.path.join(output_dir, f"soap_{op}.xml")
                            with open(path, "w", encoding="utf-8") as f:
                                f.write(r2.text)
                            print(f"    OK: {len(r2.text)} chars")
                        else:
                            print(f"    HTTP {r2.status_code}, {len(r2.text)} chars")
                    except Exception as e:
                        print(f"    Error: {e}")
        else:
            print(f"  WSDL unavailable: HTTP {r.status_code}")
    except Exception as e:
        print(f"  WSDL error: {e}")

    return True


# ============================================================
# PHASE 2: data.gov.il search
# ============================================================
def search_data_gov_il():
    print("\n" + "="*60)
    print("data.gov.il – searching planning datasets")
    print("="*60)

    output_dir = "data/data_gov_il"
    os.makedirs(output_dir, exist_ok=True)

    search_terms = [
        "תכנון ובניה",
        "כפר חבד",
        "היתרי בניה",
        "יעוד קרקע",
        "גושים חלקות",
    ]

    all_datasets = []
    seen_ids = set()

    for term in search_terms:
        print(f"\n  Searching: {term}")
        try:
            url = "https://data.gov.il/api/3/action/package_search"
            params = {"q": term, "rows": 20}
            r = requests.get(url, params=params, timeout=30)
            if r.status_code == 200:
                data = r.json()
                results = data.get("result", {}).get("results", [])
                count = data.get("result", {}).get("count", 0)
                print(f"    Found {count} total, showing {len(results)}")
                for ds in results:
                    ds_id = ds["id"]
                    if ds_id in seen_ids:
                        continue
                    seen_ids.add(ds_id)
                    title = ds.get("title", "")
                    notes = (ds.get("notes", "") or "")[:200]
                    resources = ds.get("resources", [])
                    resource_info = [{"name": r.get("name", ""), "format": r.get("format", ""),
                                      "url": r.get("url", "")} for r in resources[:5]]
                    all_datasets.append({
                        "id": ds_id,
                        "title": title,
                        "notes": notes,
                        "organization": ds.get("organization", {}).get("title", ""),
                        "resources_count": len(resources),
                        "resources": resource_info,
                    })
                    print(f"    - {title}")
            else:
                print(f"    HTTP {r.status_code}")
        except Exception as e:
            print(f"    Error: {e}")
        time.sleep(1)

    # Save catalog
    path = os.path.join(output_dir, "relevant_datasets.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(all_datasets, f, ensure_ascii=False, indent=2)
    print(f"\n  Saved {len(all_datasets)} unique datasets → {path}")

    # Try to download small datasets directly
    downloaded = 0
    for ds in all_datasets:
        for res in ds.get("resources", []):
            fmt = (res.get("format") or "").lower()
            url = res.get("url", "")
            if fmt in ("csv", "json", "geojson") and url:
                safe_title = re.sub(r'[^\w]', '_', ds["title"])[:80]
                fname = f"{safe_title}.{fmt}"
                out_path = os.path.join(output_dir, fname)
                if os.path.exists(out_path):
                    continue
                try:
                    r = requests.get(url, timeout=60,
                                     headers={"User-Agent": "Mozilla/5.0"})
                    if r.status_code == 200 and len(r.content) > 100:
                        with open(out_path, "wb") as f:
                            f.write(r.content)
                        size_kb = len(r.content) / 1024
                        print(f"    Downloaded: {fname} ({size_kb:.0f} KB)")
                        downloaded += 1
                        if downloaded >= 15:  # Limit
                            break
                except Exception as e:
                    pass
                time.sleep(0.5)
        if downloaded >= 15:
            break

    return downloaded


# ============================================================
# PHASE 2: GovMap layers
# ============================================================
def download_govmap_layers(session):
    print("\n" + "="*60)
    print("GovMap – discovering and downloading layers")
    print("="*60)

    output_dir = "data/govmap"
    os.makedirs(output_dir, exist_ok=True)

    # GovMap API base
    govmap_base = "https://ags.govmap.gov.il/arcgis/rest/services"

    # Try to list services
    try:
        r = requests.get(f"{govmap_base}?f=json", timeout=30,
                         headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
            data = r.json()
            services = data.get("services", [])
            folders = data.get("folders", [])
            print(f"  Services: {len(services)}, Folders: {len(folders)}")
            for svc in services[:20]:
                print(f"    {svc['name']} ({svc['type']})")
            for folder in folders[:20]:
                print(f"    [folder] {folder}")

            # Save service catalog
            path = os.path.join(output_dir, "govmap_services.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"services": services, "folders": folders}, f, ensure_ascii=False, indent=2)
            print(f"  Service catalog saved")

            # Try to query relevant services
            planning_services = []
            for svc in services:
                name = svc["name"].lower()
                if any(kw in name for kw in ["plan", "taba", "binyan", "cadastr",
                                             "build", "land", "karka", "zone"]):
                    planning_services.append(svc)

            # Also check folders
            for folder in folders:
                try:
                    r2 = requests.get(f"{govmap_base}/{folder}?f=json", timeout=30,
                                      headers={"User-Agent": "Mozilla/5.0"})
                    if r2.status_code == 200:
                        folder_data = r2.json()
                        for svc in folder_data.get("services", []):
                            name = svc["name"].lower()
                            if any(kw in name for kw in ["plan", "taba", "binyan",
                                                         "build", "land", "zone",
                                                         "cadastr", "karka"]):
                                planning_services.append(svc)
                except:
                    pass
                time.sleep(0.3)

            print(f"\n  Planning-related services: {len(planning_services)}")
            for svc in planning_services[:15]:
                print(f"    {svc['name']} ({svc['type']})")

            # Try to download from each planning service
            downloaded = 0
            for svc in planning_services[:10]:
                svc_name = svc["name"]
                svc_type = svc["type"]
                print(f"\n  Trying: {svc_name}")

                svc_url = f"{govmap_base}/{svc_name}/{svc_type}"
                try:
                    # Discover layers
                    r3 = requests.get(f"{svc_url}?f=json", timeout=30,
                                      headers={"User-Agent": "Mozilla/5.0"})
                    if r3.status_code == 200:
                        svc_meta = r3.json()
                        layers = svc_meta.get("layers", [])
                        print(f"    Layers: {len(layers)}")

                        for layer in layers[:5]:  # Limit per service
                            lid = layer["id"]
                            lname = layer["name"]
                            print(f"    [{lid}] {lname}")

                            query_url = f"{svc_url}/{lid}/query"
                            params = {
                                "where": "1=1",
                                "geometry": json.dumps(EXTENT),
                                "geometryType": "esriGeometryEnvelope",
                                "spatialRel": "esriSpatialRelIntersects",
                                "outFields": "*",
                                "outSR": 2039,
                                "returnGeometry": "true",
                                "f": "geojson",
                            }
                            r4 = requests.get(query_url, params=params, timeout=60,
                                              headers={"User-Agent": "Mozilla/5.0"})
                            if r4.status_code == 200:
                                fdata = r4.json()
                                features = fdata.get("features", [])
                                if features:
                                    safe = re.sub(r'[^\w]', '_', f"{svc_name}_{lname}")[:100].lower()
                                    fname = f"govmap_{safe}.geojson"
                                    path = os.path.join(output_dir, fname)
                                    size = save_geojson(features, path, safe)
                                    print(f"      OK: {len(features)} features ({size:.0f} KB)")
                                    downloaded += 1
                                else:
                                    print(f"      Empty")
                            else:
                                print(f"      HTTP {r4.status_code}")
                            time.sleep(0.5)
                except Exception as e:
                    print(f"    Error: {e}")
                time.sleep(1)

            return downloaded
        else:
            print(f"  HTTP {r.status_code}")
            return 0
    except Exception as e:
        print(f"  Error: {e}")
        return 0


# ============================================================
# MAIN
# ============================================================
def main():
    import urllib3
    urllib3.disable_warnings()

    session = iplan_session()

    print("=" * 60)
    print("  Additional Data Download for כפר חב\"ד")
    print("=" * 60)

    results = {}

    # PHASE 1 – LOW PRIORITY
    print("\n\n" + "#"*60)
    print("# PHASE 1 – LOW PRIORITY")
    print("#"*60)

    results["tmm321_extra"] = download_tmm321_extra(session)
    results["compilation_tmm_extra"] = download_compilation_tmm_extra(session)
    results["arcgis_services"] = download_arcgis_extra_services()
    download_cbs_data()
    try_complot_soap()

    # PHASE 2 – MEDIUM PRIORITY
    print("\n\n" + "#"*60)
    print("# PHASE 2 – MEDIUM PRIORITY")
    print("#"*60)

    results["data_gov_il"] = search_data_gov_il()
    results["govmap"] = download_govmap_layers(session)

    # Summary
    print("\n\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for k, v in results.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
