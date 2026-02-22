#!/usr/bin/env python3
"""
Gush Helka Map - Web UI Server
כפר חב"ד - גושים, חלקות ותב"עות

Usage: python serve_ui.py [port]
"""

import http.server
import json
import os
import re
import sys
import urllib.parse
import tempfile
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
BASE = Path(__file__).parent
DATA = BASE / "data"
WEB = BASE / "web"

_summary_cache = None
_parcel_index = {}  # {"gush-helka": {lat, lng, area, status, ...}}
_plan_index = []    # [{number, name, blocks, ...}]
_parcels_by_gush = {}  # gush_str -> [feature, ...]  (raw GeoJSON features)
_migrash_index = {}  # {"gush-helka": {migrash, plan, yeud, shetach_sqm}}
_doc_index = {}      # {doc_key: {path, plan, name, type, source, ...}}


def _sanitize_filename(name):
    """Same sanitization used during download."""
    name = name.strip()
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name)
    return name[:200]


def build_doc_index():
    """Build an index mapping doc entries to local file paths."""
    global _doc_index
    docs_dir = DATA / "docs"
    if not docs_dir.exists():
        return

    # Load the full document index
    idx_file = DATA / "all_documents_index.json"
    if not idx_file.exists():
        return

    with open(idx_file, "r", encoding="utf-8") as f:
        raw = json.load(f)
    docs = raw.get("documents", raw) if isinstance(raw, dict) else raw

    for i, doc in enumerate(docs):
        plan = doc.get("plan", "")
        plan_number = doc.get("plan_number", plan)
        source = doc.get("source", "")
        doc_name = doc.get("DOC_NAME", "")
        ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
        doc_id = doc.get("ID")

        # Build expected filename based on source
        if source == "rsPlanDocsGen":
            fn = f"{plan_number}_gen_{doc_name}" if doc_name else None
        elif source == "rsDes":
            # Try protocol and decision variations
            meeting_date = doc.get("MEETING_DATE", "")
            candidates = []
            for label in ["החלטה", "פרוטוקול"]:
                fn_try = _sanitize_filename(f"{plan_number}_{label}_{meeting_date}")
                fp = docs_dir / plan / f"{fn_try}.{ft}"
                if fp.exists():
                    candidates.append(fp)
            if candidates:
                # Store all candidates
                for ci, fp in enumerate(candidates):
                    key = f"{i}_{ci}"
                    _doc_index[key] = {
                        "path": str(fp),
                        "plan": plan,
                        "name": doc_name or fp.stem,
                        "type": ft,
                        "source": source,
                        "idx": i,
                    }
            continue
        elif source == "rsMeetingsDocs":
            fn = None  # Not downloaded
        else:  # rsPlanDocs, rsPlanDocsAdd, rsPubDocs
            fn = f"{plan_number}_{doc_name}" if doc_name else None

        if fn:
            fn_safe = _sanitize_filename(fn)
            fp = docs_dir / plan / f"{fn_safe}.{ft}"
            if fp.exists():
                _doc_index[str(i)] = {
                    "path": str(fp),
                    "plan": plan,
                    "name": doc_name,
                    "type": ft,
                    "source": source,
                    "idx": i,
                }

    # Also scan for additional files on disk not in index
    for plan_dir in docs_dir.iterdir():
        if not plan_dir.is_dir():
            continue
        for fp in plan_dir.iterdir():
            if fp.name.startswith("_") or not fp.is_file():
                continue
            # Check if already indexed
            already = any(d["path"] == str(fp) for d in _doc_index.values())
            if not already:
                key = f"disk_{fp.stem}"
                _doc_index[key] = {
                    "path": str(fp),
                    "plan": plan_dir.name,
                    "name": fp.stem,
                    "type": fp.suffix.lstrip(".").lower(),
                    "source": "disk",
                    "idx": -1,
                }


def build_parcel_index():
    """Build a gush→helka lookup from the parcels GeoJSON."""
    global _parcels_by_gush
    idx = {}
    parcels_file = DATA / "cadastre" / "parcels_kfar_chabad.geojson"
    if not parcels_file.exists():
        return idx
    try:
        with open(parcels_file, "r", encoding="utf-8") as f:
            pdata = json.load(f)
        for feat in pdata.get("features", []):
            props = feat.get("properties", {})
            gush = props.get("GUSH_NUM")
            helka = props.get("PARCEL")
            if gush is None or helka is None:
                continue
            gush_str = str(int(gush))
            helka_str = str(int(helka))
            # Compute centroid from geometry
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [])
            lat, lng = _centroid(geom)
            cx, cy = _centroid_raw(geom)
            key = f"{gush_str}-{helka_str}"
            idx[key] = {
                "gush": int(gush),
                "helka": int(helka),
                "lat": lat,
                "lng": lng,
                "itm_x": cx,  # raw ITM easting for client-side conversion
                "itm_y": cy,  # raw ITM northing for client-side conversion
                "area": props.get("LEGAL_AREA"),
                "status": props.get("STATUS_TEX", ""),
                "locality": props.get("LOCALITY_N", ""),
                "gush_helka": props.get("GushHelka", ""),
            }
            # Also store in gush-based list for partial search
            gush_key = f"g{gush_str}"
            if gush_key not in idx:
                idx[gush_key] = []
            idx[gush_key].append(int(helka))
            # Store raw features grouped by gush for GeoJSON endpoint
            if gush_str not in _parcels_by_gush:
                _parcels_by_gush[gush_str] = []
            _parcels_by_gush[gush_str].append(feat)
    except Exception as e:
        print(f"  Warning: Could not build parcel index: {e}")
    return idx


def _centroid_raw(geom):
    """Compute true area-weighted centroid of a GeoJSON geometry.
    Returns raw coordinates in the same CRS as input (ITM easting, northing)."""
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    try:
        if gtype == "Polygon":
            ring = coords[0]
        elif gtype == "MultiPolygon":
            ring = coords[0][0]
        else:
            return (0, 0)
        n = len(ring)
        if n < 3:
            return (0, 0)
        # Shoelace formula for true centroid
        A = 0
        cx = 0
        cy = 0
        for i in range(n - 1):
            cross = ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1]
            A += cross
            cx += (ring[i][0] + ring[i+1][0]) * cross
            cy += (ring[i][1] + ring[i+1][1]) * cross
        A /= 2
        if abs(A) < 1e-10:
            cx = sum(c[0] for c in ring) / n
            cy = sum(c[1] for c in ring) / n
        else:
            cx = cx / (6 * A)
            cy = cy / (6 * A)
        return (cx, cy)  # (easting, northing) or (lng, lat)
    except Exception:
        return (0, 0)


def _centroid(geom):
    """Compute centroid and convert to WGS84. Returns (lat, lng)."""
    cx, cy = _centroid_raw(geom)
    if cx > 100000 and cy > 100000:
        lat, lng = _itm_to_wgs84(cx, cy)
        return (lat, lng)
    return (cy, cx)  # Already WGS84 (lng, lat order in GeoJSON)


def _itm_to_wgs84(easting, northing):
    """Convert EPSG:2039 (Israel 1993 / Israeli TM Grid) to WGS84 lat/lng.
    Uses EPSG:1184 7-parameter Helmert transformation (accuracy ~1m).
    Matches the client-side proj4js definition exactly."""
    try:
        from pyproj import Transformer, CRS
        _t = getattr(_itm_to_wgs84, '_transformer', None)
        if _t is None:
            crs_itm = CRS.from_proj4(
                '+proj=tmerc +lat_0=31.73439361111111 +lon_0=35.20451694444445 '
                '+k=1.0000067 +x_0=219529.584 +y_0=626907.39 +ellps=GRS80 '
                '+towgs84=23.772,17.49,17.859,-0.3132,-1.85274,1.67299,-5.4262 '
                '+units=m +no_defs'
            )
            _t = Transformer.from_crs(crs_itm, CRS.from_epsg(4326), always_xy=True)
            _itm_to_wgs84._transformer = _t
        lng, lat = _t.transform(easting, northing)
        return (lat, lng)
    except ImportError:
        pass
    # Fallback: manual computation (no datum shift — ~50m less accurate)
    import math
    a = 6378137.0  # GRS80 semi-major axis
    f = 1 / 298.257222101
    e2 = 2 * f - f * f
    e = math.sqrt(e2)
    e_prime2 = e2 / (1 - e2)

    # ITM projection parameters
    lon0 = math.radians(35.2045169444)  # Central meridian longitude
    lat0 = math.radians(31.7343936111)  # Latitude of origin
    k0 = 1.0000067  # Scale factor
    FE = 219529.584  # False easting
    FN = 626907.39   # False northing

    # Remove false easting/northing
    x = easting - FE
    y = northing - FN

    # Compute M0 (meridian arc to latitude of origin)
    M0 = a * (
        (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat0
        - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * lat0)
        + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * lat0)
        - (35 * e2 ** 3 / 3072) * math.sin(6 * lat0)
    )

    # Footprint latitude
    M = M0 + y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))

    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) \
         + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu) \
         + (151 * e1 ** 3 / 96) * math.sin(6 * mu)

    N1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    T1 = math.tan(phi1) ** 2
    C1 = e_prime2 * math.cos(phi1) ** 2
    R1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    D = x / (N1 * k0)

    lat = phi1 - (N1 * math.tan(phi1) / R1) * (
        D ** 2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e_prime2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e_prime2 - 3 * C1 ** 2) * D ** 6 / 720
    )

    lon = lon0 + (
        D
        - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e_prime2 + 24 * T1 ** 2) * D ** 5 / 120
    ) / math.cos(phi1)

    lat_deg = math.degrees(lat)
    lon_deg = math.degrees(lon)

    # Fallback: approximate 3-parameter datum shift (Israel 1993 → WGS84)
    # Less accurate than pyproj's 7-param Helmert (~10m error). Only used if pyproj missing.
    # towgs84 ≈ -48, 55, 52 (dX, dY, dZ in meters)
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    sin_lon = math.sin(lon)
    cos_lon = math.cos(lon)
    N_val = a / math.sqrt(1 - e2 * sin_lat ** 2)
    dX, dY, dZ = -48.0, 55.0, 52.0
    dlat = (-dX * sin_lat * cos_lon - dY * sin_lat * sin_lon + dZ * cos_lat) / (R1 + 0)
    dlon = (-dX * sin_lon + dY * cos_lon) / ((N_val + 0) * cos_lat)
    lat_deg += math.degrees(dlat)
    lon_deg += math.degrees(dlon)

    return (lat_deg, lon_deg)


def build_plan_index():
    """Build a searchable plan index from taba + docs."""
    plans = []
    # From taba GeoJSON
    taba_file = DATA / "taba_kfar_chabad.geojson"
    if taba_file.exists():
        try:
            with open(taba_file, "r", encoding="utf-8") as f:
                taba = json.load(f)
            for feat in taba.get("features", []):
                p = feat.get("properties", {})
                lat, lng = _centroid(feat.get("geometry", {}))
                plans.append({
                    "number": p.get("pl_number", ""),
                    "name": p.get("pl_name", ""),
                    "status": p.get("station_desc") or p.get("internet_short_status", ""),
                    "entity": p.get("jurstiction_area_name", ""),
                    "area_dunam": p.get("pl_area_dunam"),
                    "landuse": p.get("pl_landuse_string", ""),
                    "lat": lat,
                    "lng": lng,
                    "mp_id": p.get("mp_id"),
                    "source": "taba",
                })
        except Exception as e:
            print(f"  Warning: Could not parse taba for plan index: {e}")

    # From blocks_parcels_by_plan (plan→blocks mapping)
    bp_file = DATA / "blocks_parcels_by_plan.json"
    plan_blocks = {}  # plan_number → [block ids]
    if bp_file.exists():
        with open(bp_file, "r", encoding="utf-8") as f:
            bdata = json.load(f)
        for block_id, block_plans in bdata.items():
            for bp in block_plans:
                pn = bp.get("plan", "")
                if pn not in plan_blocks:
                    plan_blocks[pn] = []
                plan_blocks[pn].append({
                    "block": block_id,
                    "parcels": bp.get("parcels_whole", ""),
                    "parcels_partial": bp.get("parcels_partial", ""),
                })

    for plan in plans:
        plan["blocks"] = plan_blocks.get(plan["number"], [])

    return plans


def build_summary():
    """Pre-compute summary data from all JSON files."""
    result = {
        "blocks": [],
        "plans": [],
        "stats": {},
        "complot": {},
        "layer_categories": {},
    }

    # ── 1. Blocks with plan counts ──
    bp_file = DATA / "blocks_parcels_by_plan.json"
    if bp_file.exists():
        with open(bp_file, "r", encoding="utf-8") as f:
            blocks_map = json.load(f)
        for bid, plans in sorted(
            blocks_map.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0
        ):
            result["blocks"].append(
                {
                    "id": int(bid) if bid.isdigit() else bid,
                    "plans_count": len(plans),
                    "plans": plans,
                }
            )

    # ── 2. Parcel counts per block from cadastre ──
    parcels_per_block = {}
    parcels_file = DATA / "cadastre" / "parcels_kfar_chabad.geojson"
    if parcels_file.exists():
        try:
            with open(parcels_file, "r", encoding="utf-8") as f:
                pdata = json.load(f)
            for feat in pdata.get("features", []):
                gush = feat.get("properties", {}).get("GUSH_NUM")
                if gush is not None:
                    gush_str = str(int(gush))
                    parcels_per_block[gush_str] = (
                        parcels_per_block.get(gush_str, 0) + 1
                    )
        except Exception as e:
            print(f"  Warning: Could not parse parcels file: {e}")
    for block in result["blocks"]:
        block["parcels_count"] = parcels_per_block.get(str(block["id"]), 0)

    # ── 3. Plans from docs/ directory ──
    docs_dir = DATA / "docs"
    if docs_dir.exists():
        for pd_dir in sorted(docs_dir.iterdir()):
            if not pd_dir.is_dir() or pd_dir.name.startswith("_"):
                continue
            files = [
                f
                for f in pd_dir.iterdir()
                if f.is_file() and not f.name.startswith("_")
            ]
            plan = {"name": pd_dir.name, "docs_count": len(files)}

            meta_file = pd_dir / "_plan_data.json"
            if meta_file.exists():
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    det = meta.get("planDetails", {})
                    plan["number"] = det.get("NUMB", pd_dir.name)
                    plan["status"] = det.get("STATUS", "")
                    plan["entity_name"] = det.get("ENTITY_NAME", "")
                    plan["station_desc"] = det.get("STATION_DESC", "")
                    plan["mp_id"] = det.get("MP_ID", "")
                except Exception:
                    pass
            result["plans"].append(plan)

    # ── 4. GIS layers by category ──
    layers_dir = DATA / "gis_layers"
    if layers_dir.exists():
        layers = []
        for f in sorted(layers_dir.iterdir()):
            if f.suffix != ".geojson":
                continue
            name = f.stem
            cat = "אחר"
            if name.startswith("xplan"):
                cat = "Xplan - תכניות באזור"
            elif name.startswith("tmm321"):
                cat = 'תמ"מ 3/21'
            elif name.startswith("tmm_merkaz"):
                cat = 'מכלול תמ"מ מרכז'
            elif name.startswith("tama1"):
                cat = 'תמ"א 1 - תשתיות'
            elif name.startswith("tama35"):
                cat = 'תמ"א 35'
            elif name.startswith("road") or name.startswith("train"):
                cat = "תחבורה"
            elif name.startswith("gas"):
                cat = "גז ודלק"
            elif name.startswith("shimour"):
                cat = "שימור"
            elif name.startswith("gvulot"):
                cat = "גבולות"
            elif name.startswith("ttl") or name.startswith("vatmal"):
                cat = 'תת"ל / ותמ"ל'
            elif name.startswith("arcgis"):
                cat = "שירותי ArcGIS"
            layers.append(
                {
                    "name": name,
                    "file": f.name,
                    "size_kb": round(f.stat().st_size / 1024, 1),
                    "category": cat,
                }
            )
        result["stats"]["total_layers"] = len(layers)

        cats = {}
        for layer in layers:
            c = layer["category"]
            if c not in cats:
                cats[c] = []
            cats[c].append(layer)
        result["layer_categories"] = cats

    # ── 5. Complot ──
    cp_file = DATA / "complot_kfar_chabad" / "complot_parsed.json"
    if cp_file.exists():
        with open(cp_file, "r", encoding="utf-8") as f:
            cp = json.load(f)
        result["complot"] = {k: len(v) for k, v in cp.items() if isinstance(v, list)}

    # ── 6. Stats ──
    docs_idx = DATA / "all_documents_index.json"
    if docs_idx.exists():
        with open(docs_idx, "r", encoding="utf-8") as f:
            docs = json.load(f)
        if isinstance(docs, dict):
            result["stats"]["total_documents"] = docs.get(
                "total_documents_in_metadata", 0
            )
            result["stats"]["source_statistics"] = docs.get("source_statistics", {})
            result["stats"]["file_type_distribution"] = docs.get(
                "file_type_distribution", {}
            )
        elif isinstance(docs, list):
            result["stats"]["total_documents"] = len(docs)

    result["stats"]["total_plans"] = len(result["plans"])
    result["stats"]["total_blocks"] = len(result["blocks"])
    result["stats"]["total_parcels"] = sum(parcels_per_block.values())
    result["stats"]["total_cadastre_blocks"] = len(parcels_per_block)
    result["stats"]["complot_plans"] = result["complot"].get("GetTabaNumbers", 0)

    return result


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = urllib.parse.unquote(self.path.split("?")[0])

        if path in ("/", "/index.html"):
            self._serve_file(WEB / "index.html", "text/html; charset=utf-8")
        elif path == "/api/summary":
            global _summary_cache
            if _summary_cache is None:
                _summary_cache = build_summary()
            self._serve_json(_summary_cache)
        elif path == "/api/documents":
            fp = DATA / "all_documents_index.json"
            if fp.exists():
                with open(fp, "r", encoding="utf-8") as f:
                    doc_data = json.load(f)
                docs_list = (
                    doc_data.get("documents", [])
                    if isinstance(doc_data, dict)
                    else doc_data
                )
                # Enrich each doc with its file availability
                for i, d in enumerate(docs_list):
                    d["_idx"] = i
                    d["_has_file"] = str(i) in _doc_index
                self._serve_json(docs_list)
            else:
                self._serve_json([])
        elif path.startswith("/api/documents/file/"):
            # Serve actual document file: /api/documents/file/{idx}
            idx = path.split("/")[-1]
            doc_entry = _doc_index.get(idx)
            if doc_entry:
                fp = Path(doc_entry["path"])
                if fp.exists():
                    ct = self._content_type(fp.suffix)
                    self.send_response(200)
                    self.send_header("Content-Type", ct)
                    self.send_header("Content-Length", fp.stat().st_size)
                    self.send_header("Content-Disposition",
                                     f'inline; filename="{urllib.parse.quote(fp.name)}"')
                    self.send_header("Cache-Control", "public, max-age=3600")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    with open(fp, "rb") as f:
                        while True:
                            chunk = f.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                else:
                    self.send_error(404, "File not found on disk")
            else:
                self.send_error(404, f"Document index {idx} not found")
        elif path == "/api/documents/index":
            # Return the full doc index for the viewer
            result = []
            for key, entry in _doc_index.items():
                fp = Path(entry["path"])
                result.append({
                    "key": key,
                    "plan": entry["plan"],
                    "name": entry["name"],
                    "type": entry["type"],
                    "source": entry["source"],
                    "size": fp.stat().st_size if fp.exists() else 0,
                    "url": f"/api/documents/file/{key}",
                })
            self._serve_json(result)
        elif path.startswith("/api/documents/plan/"):
            # List documents for a specific plan: /api/documents/plan/{plan_id}
            plan_id = urllib.parse.unquote(path.split("/api/documents/plan/")[1])
            result = []
            for key, entry in _doc_index.items():
                if entry["plan"] == plan_id:
                    fp = Path(entry["path"])
                    result.append({
                        "key": key,
                        "plan": entry["plan"],
                        "name": entry["name"],
                        "type": entry["type"],
                        "source": entry["source"],
                        "size": fp.stat().st_size if fp.exists() else 0,
                        "url": f"/api/documents/file/{key}",
                    })
            self._serve_json(result)
        elif path == "/api/search/parcel":
            global _parcel_index
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            gush = qs.get("gush", [""])[0].strip()
            helka = qs.get("helka", [""])[0].strip()
            if gush and helka:
                key = f"{gush}-{helka}"
                result = _parcel_index.get(key)
                if result:
                    self._serve_json({"found": True, **result})
                else:
                    self._serve_json({"found": False, "message": f"חלקה {helka} בגוש {gush} לא נמצאה"})
            elif gush:
                gush_key = f"g{gush}"
                helkot = _parcel_index.get(gush_key, [])
                if helkot:
                    self._serve_json({"found": True, "gush": int(gush), "helkot": sorted(set(helkot)), "count": len(set(helkot))})
                else:
                    self._serve_json({"found": False, "message": f"גוש {gush} לא נמצא"})
            else:
                self._serve_json({"found": False, "message": "יש להזין מספר גוש"})
        elif path == "/api/parcels/geojson":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            gush = qs.get("gush", [""])[0].strip()
            if gush and gush in _parcels_by_gush:
                geojson = {
                    "type": "FeatureCollection",
                    "features": _parcels_by_gush[gush]
                }
                self._serve_json(geojson)
            else:
                self._serve_json({"type": "FeatureCollection", "features": []})
        elif path == "/api/search/plan":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            q = qs.get("q", [""])[0].strip().lower()
            if not q:
                self._serve_json([])
            else:
                results = []
                for plan in _plan_index:
                    if (q in (plan.get("number") or "").lower()
                        or q in (plan.get("name") or "").lower()
                        or q in (plan.get("landuse") or "").lower()
                        or any(q in b.get("block", "") for b in plan.get("blocks", []))):
                        results.append(plan)
                self._serve_json(results[:50])
        elif path == "/api/migrash":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            gush = qs.get("gush", [""])[0].strip()
            helka = qs.get("helka", [""])[0].strip()
            if gush and helka:
                key = f"{gush}-{helka}"
                result = _migrash_index.get(key)
                if result:
                    self._serve_json({"found": True, **result})
                else:
                    self._serve_json({"found": False})
            else:
                # Return full mapping
                fp = DATA / "migrash_helka_mapping.json"
                if fp.exists():
                    with open(fp, "r", encoding="utf-8") as f:
                        self._serve_json(json.load(f))
                else:
                    self._serve_json({"mapping": []})
        elif path == "/api/complot":
            fp = DATA / "complot_kfar_chabad" / "complot_parsed.json"
            if fp.exists():
                with open(fp, "r", encoding="utf-8") as f:
                    self._serve_json(json.load(f))
            else:
                self._serve_json({})
        elif path == "/api/mmg":
            # Return MMG index (which plans have MMG layers)
            fp = DATA / "mmg" / "mmg_index.json"
            if fp.exists():
                with open(fp, "r", encoding="utf-8") as f:
                    self._serve_json(json.load(f))
            else:
                self._serve_json({})
        elif path.startswith("/api/mmg/"):
            # Serve specific MMG layer: /api/mmg/{plan_number}/{layer_name}.geojson
            parts = path.split("/api/mmg/")[1]
            fp = (DATA / "mmg" / parts).resolve()
            if fp.exists() and fp.is_file() and str(fp).startswith(str((DATA / "mmg").resolve())):
                with open(fp, "r", encoding="utf-8") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data.encode("utf-8"))))
                self.end_headers()
                self.wfile.write(data.encode("utf-8"))
            else:
                self.send_error(404, "MMG layer not found")
        elif path == "/api/uploads/list":
            uploads_dir = DATA / "uploads"
            files = []
            if uploads_dir.exists():
                for f in sorted(uploads_dir.iterdir()):
                    if f.suffix == '.geojson':
                        files.append({"name": f.stem, "path": f"data/uploads/{f.name}", "size": f.stat().st_size})
            self._serve_json(files)
        elif path.startswith("/data/"):
            rel = path[6:]
            fp = (DATA / rel).resolve()
            if fp.exists() and fp.is_file() and str(fp).startswith(str(DATA.resolve())):
                ct = self._content_type(fp.suffix)
                self._serve_file(fp, ct)
            else:
                self.send_error(404)
        elif path.startswith("/web/"):
            rel = path[5:]
            fp = (WEB / rel).resolve()
            if fp.exists() and fp.is_file() and str(fp).startswith(str(WEB.resolve())):
                ct = self._content_type(fp.suffix)
                self._serve_file(fp, ct)
            else:
                self.send_error(404)
        else:
            self.send_error(404)

    def _serve_file(self, path, content_type):
        try:
            data = Path(path).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", len(data))
            self.send_header("Cache-Control", "public, max-age=300")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(500, str(e))

    def _serve_json(self, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(data))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _content_type(self, suffix):
        return {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".geojson": "application/json; charset=utf-8",
            ".csv": "text/csv; charset=utf-8",
            ".xml": "application/xml; charset=utf-8",
            ".kml": "application/vnd.google-earth.kml+xml",
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".zip": "application/zip",
            ".dwg": "application/acad",
            ".dxf": "application/dxf",
            ".msg": "application/vnd.ms-outlook",
        }.get(suffix.lower(), "application/octet-stream")

    def log_message(self, format, *args):
        pass  # Quiet logging

    def do_POST(self):
        path = urllib.parse.unquote(self.path.split("?")[0])
        if path == "/api/dxf/upload":
            self._handle_dxf_upload()
        elif path == "/api/dwg/upload":
            self._handle_dwg_upload()
        elif path == "/api/shp/upload":
            self._handle_shp_upload()
        elif path == "/api/uploads/delete":
            self._handle_upload_delete()
        elif path == "/api/uploads/rename":
            self._handle_upload_rename()
        else:
            self.send_error(404)

    def _handle_upload_delete(self):
        """Delete a saved upload file."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            name = data.get("name", "").strip()
            if not name:
                self._serve_json({"error": "Missing name"})
                return
            safe_name = re.sub(r'[^\w\-.]', '_', name)
            fp = (DATA / "uploads" / f"{safe_name}.geojson").resolve()
            if not str(fp).startswith(str((DATA / "uploads").resolve())):
                self._serve_json({"error": "Invalid path"})
                return
            if fp.exists():
                fp.unlink()
                print(f"  [UPLOAD] Deleted: {fp.name}")
                self._serve_json({"ok": True})
            else:
                self._serve_json({"error": "File not found"})
        except Exception as e:
            self._serve_json({"error": str(e)})

    def _handle_upload_rename(self):
        """Rename a saved upload file."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            old_name = re.sub(r'[^\w\-.]', '_', data.get("old", "").strip())
            new_name = re.sub(r'[^\w\-.]', '_', data.get("new", "").strip())
            if not old_name or not new_name:
                self._serve_json({"error": "Missing names"})
                return
            uploads_dir = (DATA / "uploads").resolve()
            old_fp = (uploads_dir / f"{old_name}.geojson").resolve()
            new_fp = (uploads_dir / f"{new_name}.geojson").resolve()
            if not str(old_fp).startswith(str(uploads_dir)) or not str(new_fp).startswith(str(uploads_dir)):
                self._serve_json({"error": "Invalid path"})
                return
            if not old_fp.exists():
                self._serve_json({"error": "File not found"})
                return
            if new_fp.exists():
                self._serve_json({"error": "Name already taken"})
                return
            old_fp.rename(new_fp)
            self._serve_json({"ok": True, "new_path": f"data/uploads/{new_name}.geojson"})
        except Exception as e:
            self._serve_json({"error": str(e)})

    def _handle_shp_upload(self):
        """Parse uploaded ZIP (shapefile) and return GeoJSON."""
        print("\n  [SHP] === Upload request received ===")
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._serve_json({"error": "No data received"})
                return
            if content_length > 100 * 1024 * 1024:  # 100MB limit
                self._serve_json({"error": "File too large (max 100MB)"})
                return

            body = self.rfile.read(content_length)
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                boundary = content_type.split("boundary=")[1].strip()
                file_data, filename, crs_hint = self._parse_multipart(body, boundary)
            else:
                file_data = body
                filename = "uploaded.zip"
                crs_hint = "ITM"

            if not file_data:
                self._serve_json({"error": "No file data found"})
                return

            # Write to temp file
            suffix = os.path.splitext(filename)[1] or ".zip"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(file_data)
                tmp_path = tmp.name

            try:
                from convert_shp import shp_zip_to_geojson
                source_crs = 'EPSG:2039'  # Default ITM
                if crs_hint.upper() in ('WGS84', 'EPSG:4326', '4326'):
                    source_crs = 'EPSG:4326'
                elif crs_hint.upper() in ('UTM', 'EPSG:32636', '32636'):
                    source_crs = 'EPSG:32636'
                elif crs_hint.upper() in ('WEB', 'WEBMERCATOR', 'EPSG:3857', '3857'):
                    source_crs = 'EPSG:3857'

                # Also save a copy to data/uploads
                safe_name = re.sub(r'[^\w\-.]', '_', os.path.splitext(filename)[0])
                out_path = os.path.join(str(DATA), 'uploads', f'{safe_name}.geojson')

                geojson, layer_name = shp_zip_to_geojson(tmp_path, out_path, source_crs=source_crs)
                geojson['_filename'] = filename
                geojson['_layer_name'] = layer_name
                geojson['_saved_path'] = f'data/uploads/{safe_name}.geojson'
                geojson['_crs'] = 'EPSG:4326'  # Already converted
                geojson['_total_features'] = len(geojson.get('features', []))
                print(f"  [SHP] SUCCESS: {geojson['_total_features']} features from {layer_name}")
                self._serve_json(geojson)
            finally:
                os.unlink(tmp_path)

        except Exception as e:
            import traceback
            print(f"  [SHP] EXCEPTION: {type(e).__name__}: {e}")
            traceback.print_exc()
            self._serve_json({"error": f"Shapefile parse error: {str(e)}"})

    # ── ODA File Converter paths (Windows / Linux / Mac) ───────────────────
    _ODA_SEARCH_PATHS = [
        r"C:\Program Files\ODA\ODAFileConverter\ODAFileConverter.exe",
        r"C:\Program Files (x86)\ODA\ODAFileConverter\ODAFileConverter.exe",
        r"C:\ODA\ODAFileConverter\ODAFileConverter.exe",
        # Linux / Mac
        "/usr/bin/ODAFileConverter",
        "/usr/local/bin/ODAFileConverter",
        "/opt/oda/ODAFileConverter",
    ]

    def _find_oda_converter(self):
        """Return path to ODA File Converter exe, or None."""
        import shutil, glob
        # Static paths
        for p in self._ODA_SEARCH_PATHS:
            if os.path.isfile(p):
                return p
        # Dynamic: per-user AppData install (version-agnostic glob)
        local_programs = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'ODA')
        matches = glob.glob(os.path.join(local_programs, '**', 'ODAFileConverter.exe'), recursive=True)
        if matches:
            return matches[0]
        # System-level glob (e.g. C:\Program Files\ODA\ODAFileConverter 26.x.0\)
        for base in [r'C:\Program Files\ODA', r'C:\Program Files (x86)\ODA']:
            matches = glob.glob(os.path.join(base, '**', 'ODAFileConverter.exe'), recursive=True)
            if matches:
                return matches[0]
        # PATH
        return shutil.which('ODAFileConverter')

    def _handle_dwg_upload(self):
        """Convert uploaded DWG to DXF via ODA File Converter, then parse to GeoJSON."""
        print("\n  [DWG] === Upload request received ===")
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                self._serve_json({"error": "No data received"}); return
            if content_length > 100 * 1024 * 1024:  # 100MB limit for DWG
                self._serve_json({"error": "File too large (max 100MB)"}); return

            body = self.rfile.read(content_length)

            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                boundary = content_type.split("boundary=")[1].strip()
                file_data, filename, crs_hint = self._parse_multipart_dwg(body, boundary)
            else:
                file_data = body
                filename = "uploaded.dwg"
                crs_hint = ""

            if not file_data:
                self._serve_json({"error": "No file data found"}); return

            print(f"  [DWG] File: {filename} ({len(file_data)} bytes)")

            oda_exe = self._find_oda_converter()
            if not oda_exe:
                print("  [DWG] ODA File Converter not found")
                self._serve_json({
                    "error": "לא נמצא ODA File Converter במחשב.",
                    "oda_missing": True,
                    "instructions": (
                        "הורד והתקן את ODA File Converter (חינם) מ:\n"
                        "https://www.opendesign.com/guestfiles/oda_file_converter\n"
                        "לאחר ההתקנה הפעל מחדש את השרת."
                    )
                })
                return

            print(f"  [DWG] ODA found: {oda_exe}")

            # Write DWG to temp dir, convert to DXF in another temp dir
            import tempfile, subprocess, glob
            in_dir  = tempfile.mkdtemp(prefix="dwg_in_")
            out_dir = tempfile.mkdtemp(prefix="dwg_out_")

            dwg_path = os.path.join(in_dir, filename)
            with open(dwg_path, "wb") as f:
                f.write(file_data)

            try:
                # ODAFileConverter <in_dir> <out_dir> <version> <type> [recurse] [audit]
                cmd = [oda_exe, in_dir, out_dir, "ACAD2018", "DXF", "0", "1"]
                print(f"  [DWG] Running: {' '.join(cmd)}")
                result = subprocess.run(cmd, capture_output=True, timeout=120)
                print(f"  [DWG] ODA return code: {result.returncode}")
                if result.stderr:
                    print(f"  [DWG] ODA stderr: {result.stderr.decode(errors='ignore')[:500]}")

                # Find the output DXF
                dxf_files = glob.glob(os.path.join(out_dir, "**", "*.dxf"), recursive=True)
                if not dxf_files:
                    dxf_files = glob.glob(os.path.join(out_dir, "*.dxf"))

                if not dxf_files:
                    self._serve_json({"error": "ההמרה נכשלה — ODA לא ייצר קובץ DXF. ייתכן שהקובץ פגום."})
                    return

                dxf_path = dxf_files[0]
                print(f"  [DWG] Converted DXF: {dxf_path}")

                geojson = self._dxf_to_geojson(dxf_path, crs_hint)
                geojson["_filename"] = os.path.splitext(filename)[0] + ".dwg"
                geojson["_source"] = "DWG"
                print(f"  [DWG] SUCCESS: {geojson.get('_total_features',0)} features")
                self._serve_json(geojson)

            finally:
                import shutil
                shutil.rmtree(in_dir, ignore_errors=True)
                shutil.rmtree(out_dir, ignore_errors=True)

        except Exception as e:
            import traceback
            print(f"  [DWG] EXCEPTION: {type(e).__name__}: {e}")
            traceback.print_exc()
            self._serve_json({"error": f"DWG error: {str(e)}"})

    def _parse_multipart_dwg(self, body, boundary):
        """Multipart parser for DWG uploads (same logic, different field names)."""
        boundary_bytes = boundary.encode("utf-8")
        parts = body.split(b"--" + boundary_bytes)
        file_data = None
        filename = "uploaded.dwg"
        crs_hint = ""
        for part in parts:
            if b"Content-Disposition" not in part:
                continue
            header_end = part.find(b"\r\n\r\n")
            if header_end == -1:
                continue
            header = part[:header_end].decode("utf-8", errors="ignore")
            payload = part[header_end + 4:]
            if payload.endswith(b"\r\n"):
                payload = payload[:-2]
            if 'name="file"' in header or 'name="dwg"' in header:
                file_data = payload
                fn_match = re.search(r'filename="([^"]+)"', header)
                if fn_match:
                    filename = fn_match.group(1)
            elif 'name="crs"' in header:
                crs_hint = payload.decode("utf-8", errors="ignore").strip()
        return file_data, filename, crs_hint

    def _handle_dxf_upload(self):
        """Parse uploaded DXF file and return GeoJSON."""
        print("\n  [DXF] === Upload request received ===")
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            print(f"  [DXF] Content-Length: {content_length}")
            if content_length == 0:
                print("  [DXF] ERROR: No data received")
                self._serve_json({"error": "No data received"})
                return
            if content_length > 50 * 1024 * 1024:  # 50MB limit
                print("  [DXF] ERROR: File too large")
                self._serve_json({"error": "File too large (max 50MB)"})
                return

            body = self.rfile.read(content_length)
            print(f"  [DXF] Body read: {len(body)} bytes")

            # Parse multipart form data manually
            content_type = self.headers.get("Content-Type", "")
            print(f"  [DXF] Content-Type: {content_type[:100]}")
            if "multipart/form-data" in content_type:
                boundary = content_type.split("boundary=")[1].strip()
                print(f"  [DXF] Boundary: {boundary[:50]}")
                file_data, filename, crs_hint = self._parse_multipart(body, boundary)
                print(f"  [DXF] Parsed multipart -> filename={filename}, crs={crs_hint}, data_len={len(file_data) if file_data else 0}")
            else:
                file_data = body
                filename = "uploaded.dxf"
                crs_hint = ""
                print(f"  [DXF] Raw body (not multipart), data_len={len(file_data)}")

            if not file_data:
                print("  [DXF] ERROR: No file data found after parsing")
                self._serve_json({"error": "No file data found"})
                return

            # Write to temp file and parse
            with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
                tmp.write(file_data)
                tmp_path = tmp.name
            print(f"  [DXF] Temp file written: {tmp_path} ({len(file_data)} bytes)")

            try:
                print("  [DXF] Importing ezdxf...")
                import ezdxf as _test_ezdxf
                print(f"  [DXF] ezdxf version: {_test_ezdxf.__version__}")
                print(f"  [DXF] Calling _dxf_to_geojson({tmp_path}, {crs_hint})...")
                geojson = self._dxf_to_geojson(tmp_path, crs_hint)
                geojson["_filename"] = filename
                print(f"  [DXF] SUCCESS: {geojson.get('_total_features',0)} features, {geojson.get('_total_entities',0)} entities")
                print(f"  [DXF] Layers: {geojson.get('_dxf_layers',[])}")
                print(f"  [DXF] Entity counts: {geojson.get('_entity_counts',{})}")
                if geojson.get('_errors'):
                    print(f"  [DXF] Parse warnings: {geojson['_errors'][:5]}")
                self._serve_json(geojson)
            finally:
                os.unlink(tmp_path)

        except Exception as e:
            import traceback
            print(f"  [DXF] EXCEPTION: {type(e).__name__}: {e}")
            traceback.print_exc()
            self._serve_json({"error": f"DXF parse error: {str(e)}"})

    def _parse_multipart(self, body, boundary):
        """Simple multipart parser to extract file data and form fields."""
        boundary_bytes = boundary.encode("utf-8")
        parts = body.split(b"--" + boundary_bytes)
        file_data = None
        filename = "uploaded.dxf"
        crs_hint = ""

        for part in parts:
            if b"Content-Disposition" not in part:
                continue
            header_end = part.find(b"\r\n\r\n")
            if header_end == -1:
                continue
            header = part[:header_end].decode("utf-8", errors="ignore")
            payload = part[header_end + 4:]
            # Remove trailing \r\n--
            if payload.endswith(b"\r\n"):
                payload = payload[:-2]

            if 'name="file"' in header or 'name="dxf"' in header:
                file_data = payload
                fn_match = re.search(r'filename="([^"]+)"', header)
                if fn_match:
                    filename = fn_match.group(1)
            elif 'name="crs"' in header:
                crs_hint = payload.decode("utf-8", errors="ignore").strip()

        return file_data, filename, crs_hint

    def _dxf_to_geojson(self, dxf_path, crs_hint=""):
        """Convert a DXF file to GeoJSON using ezdxf."""
        import ezdxf
        from ezdxf.entities import LWPolyline, Polyline, Line, Circle, Arc, Point, Spline, Hatch, Insert, MText, Text

        doc = ezdxf.readfile(dxf_path)
        msp = doc.modelspace()

        features = []
        errors = []
        entity_counts = {}

        # Determine CRS: default to ITM (EPSG:2039) for Israeli files
        is_itm = crs_hint.upper() in ("ITM", "EPSG:2039", "2039", "")

        for entity in msp:
            etype = entity.dxftype()
            entity_counts[etype] = entity_counts.get(etype, 0) + 1
            layer_name = entity.dxf.layer if hasattr(entity.dxf, 'layer') else ""
            color = entity.dxf.color if hasattr(entity.dxf, 'color') else 7

            props = {
                "layer": layer_name,
                "type": etype,
                "color": color,
            }

            try:
                geom = None

                if etype == "LINE":
                    start = entity.dxf.start
                    end = entity.dxf.end
                    geom = {
                        "type": "LineString",
                        "coordinates": [
                            [start.x, start.y],
                            [end.x, end.y]
                        ]
                    }

                elif etype == "LWPOLYLINE":
                    pts = list(entity.get_points(format="xy"))
                    if len(pts) >= 2:
                        coords = [[p[0], p[1]] for p in pts]
                        if entity.closed:
                            coords.append(coords[0])
                            geom = {"type": "Polygon", "coordinates": [coords]}
                        else:
                            geom = {"type": "LineString", "coordinates": coords}

                elif etype == "POLYLINE":
                    pts = [(v.dxf.location.x, v.dxf.location.y) for v in entity.vertices]
                    if len(pts) >= 2:
                        coords = [[p[0], p[1]] for p in pts]
                        if entity.is_closed:
                            coords.append(coords[0])
                            geom = {"type": "Polygon", "coordinates": [coords]}
                        else:
                            geom = {"type": "LineString", "coordinates": coords}

                elif etype == "CIRCLE":
                    cx, cy = entity.dxf.center.x, entity.dxf.center.y
                    r = entity.dxf.radius
                    # Approximate circle as polygon with 36 segments
                    import math
                    coords = []
                    for i in range(37):
                        angle = 2 * math.pi * i / 36
                        coords.append([cx + r * math.cos(angle), cy + r * math.sin(angle)])
                    geom = {"type": "Polygon", "coordinates": [coords]}
                    props["radius"] = r

                elif etype == "ARC":
                    cx, cy = entity.dxf.center.x, entity.dxf.center.y
                    r = entity.dxf.radius
                    import math
                    sa = math.radians(entity.dxf.start_angle)
                    ea = math.radians(entity.dxf.end_angle)
                    if ea < sa:
                        ea += 2 * math.pi
                    n = max(12, int((ea - sa) / (2 * math.pi) * 36))
                    coords = []
                    for i in range(n + 1):
                        angle = sa + (ea - sa) * i / n
                        coords.append([cx + r * math.cos(angle), cy + r * math.sin(angle)])
                    geom = {"type": "LineString", "coordinates": coords}

                elif etype == "POINT":
                    geom = {
                        "type": "Point",
                        "coordinates": [entity.dxf.location.x, entity.dxf.location.y]
                    }

                elif etype == "SPLINE":
                    pts = list(entity.flattening(0.5))
                    if len(pts) >= 2:
                        coords = [[p.x, p.y] for p in pts]
                        geom = {"type": "LineString", "coordinates": coords}

                elif etype == "ELLIPSE":
                    import math
                    cx, cy = entity.dxf.center.x, entity.dxf.center.y
                    major = entity.dxf.major_axis
                    ratio = entity.dxf.ratio
                    a = math.sqrt(major.x**2 + major.y**2)
                    b = a * ratio
                    rot = math.atan2(major.y, major.x)
                    coords = []
                    for i in range(37):
                        angle = 2 * math.pi * i / 36
                        x = a * math.cos(angle)
                        y = b * math.sin(angle)
                        rx = cx + x * math.cos(rot) - y * math.sin(rot)
                        ry = cy + x * math.sin(rot) + y * math.cos(rot)
                        coords.append([rx, ry])
                    geom = {"type": "Polygon", "coordinates": [coords]}

                elif etype == "HATCH":
                    for bp in entity.paths:
                        pts = []
                        if hasattr(bp, 'vertices'):
                            pts = [(v.x, v.y) for v in bp.vertices]  # PolylinePath
                        elif hasattr(bp, 'edges'):
                            for edge in bp.edges:
                                if hasattr(edge, 'start') and hasattr(edge, 'end'):
                                    pts.append((edge.start.x, edge.start.y))
                        if len(pts) >= 3:
                            coords = [[p[0], p[1]] for p in pts]
                            coords.append(coords[0])
                            geom = {"type": "Polygon", "coordinates": [coords]}
                            features.append({
                                "type": "Feature",
                                "properties": {**props, "sub": "hatch_boundary"},
                                "geometry": geom
                            })
                    continue  # Already added

                elif etype in ("TEXT", "MTEXT"):
                    if hasattr(entity.dxf, 'insert'):
                        loc = entity.dxf.insert
                    elif hasattr(entity.dxf, 'location'):
                        loc = entity.dxf.location
                    else:
                        continue
                    text_val = entity.dxf.text if hasattr(entity.dxf, 'text') else ""
                    if hasattr(entity, 'plain_text'):
                        try:
                            text_val = entity.plain_text()
                        except:
                            pass
                    geom = {"type": "Point", "coordinates": [loc.x, loc.y]}
                    props["text"] = text_val

                if geom:
                    features.append({
                        "type": "Feature",
                        "properties": props,
                        "geometry": geom
                    })

            except Exception as e:
                errors.append(f"{etype} on layer {layer_name}: {str(e)}")

        # Collect DXF layer names
        dxf_layers = [ly.dxf.name for ly in doc.layers]

        return {
            "type": "FeatureCollection",
            "features": features,
            "_crs": "EPSG:2039" if is_itm else "WGS84",
            "_entity_counts": entity_counts,
            "_total_entities": sum(entity_counts.values()),
            "_total_features": len(features),
            "_dxf_layers": dxf_layers,
            "_errors": errors[:20],
        }


if __name__ == "__main__":
    print(f"\n  {'='*44}")
    print(f"  Gush Helka Map - כפר חב\"ד")
    print(f"  {'='*44}")
    print(f"  Server: http://localhost:{PORT}")
    print(f"  Data:   {DATA}")
    print(f"  {'='*44}\n")

    print("  Building summary (parsing cadastre)...")
    _summary_cache = build_summary()
    s = _summary_cache["stats"]
    print(
        f"  Done: {s['total_plans']} plans, {s['total_blocks']} blocks, "
        f"{s.get('total_layers',0)} layers, {s.get('total_documents',0)} docs, "
        f"{s.get('total_parcels',0)} parcels"
    )

    print("  Building parcel index...")
    _parcel_index = build_parcel_index()
    num_parcels = sum(1 for k in _parcel_index if not k.startswith('g'))
    num_gushim = sum(1 for k in _parcel_index if k.startswith('g'))
    print(f"  Indexed: {num_parcels} parcels across {num_gushim} gushim")

    print("  Building plan index...")
    _plan_index = build_plan_index()
    print(f"  Indexed: {len(_plan_index)} plans with geo-coordinates")

    # Load migrash mapping
    _migrash_file = DATA / "migrash_helka_mapping.json"
    if _migrash_file.exists():
        with open(_migrash_file, "r", encoding="utf-8") as f:
            _migrash_data = json.load(f)
        for m in _migrash_data.get("mapping", []):
            key = f"{m['gush']}-{m['helka']}"
            _migrash_index[key] = m
            # Also enrich parcel index
            if key in _parcel_index:
                _parcel_index[key]["migrash"] = m.get("migrash")
                _parcel_index[key]["migrash_plan"] = m.get("plan")
                _parcel_index[key]["yeud"] = m.get("yeud")
                _parcel_index[key]["shetach_sqm"] = m.get("shetach_sqm")
        print(f"  Loaded {len(_migrash_index)} migrash mappings")
    else:
        print("  No migrash mapping file found")

    # Build document file index
    print("  Building document file index...")
    build_doc_index()
    print(f"  Indexed: {len(_doc_index)} document files on disk")

    print(f"\n  Ready! Open http://localhost:{PORT}\n")

    server = http.server.HTTPServer(("", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down...")
        server.shutdown()
