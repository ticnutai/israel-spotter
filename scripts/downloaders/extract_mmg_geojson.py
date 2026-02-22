#!/usr/bin/env python3
"""
Extract MMG (מ"מ"ג) SHP data from plan ZIP files and convert to GeoJSON.
Each plan's SHP ZIP contains layers like MVT_GVUL, MVT_PARCEL, MVT_PLAN, etc.
These are in ITM (EPSG:2039) coordinate system - we convert to WGS84.
Output: data/mmg/<plan_number>/<layer_name>.geojson
"""

import json
import os
import sys
import zipfile
import tempfile
import shutil
from pathlib import Path

import shapefile
from pyproj import Transformer

# ITM to WGS84 transformer
transformer = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)

# Layer descriptions in Hebrew
LAYER_NAMES_HEB = {
    'MVT_ARC': 'קווים',
    'MVT_GUSH': 'גושים',
    'MVT_GUSH_NUM': 'מספרי גושים',
    'MVT_GVUL': 'גבול תכנית',
    'MVT_LABEL': 'תוויות',
    'MVT_PARCEL': 'חלקות',
    'MVT_PARCEL_NUM': 'מספרי חלקות',
    'MVT_PLAN': 'תחום תכנית',
    'MVT_PLAN_NUM': 'מספר תכנית',
    'MVT_PRINT_FRAME': 'מסגרת הדפסה',
    'MVT_ROZETA': 'רוזטה',
    'MVT_SURVEY_LINE': 'קווי מדידה',
    'MVT_SURVEY_PNT': 'נקודות מדידה',
    'MVT_SURVEY_POL': 'פוליגוני מדידה',
    'MVT_SYMBOL': 'סמלים',
    'MVT_YEUD': 'ייעודי קרקע',
    'MVT_BLDG': 'מבנים',
    'MVT_ROAD': 'כבישים',
    'MVT_MIGRASH': 'מגרשים',
}

# Important layers to prioritize (these are the most useful for map display)
IMPORTANT_LAYERS = ['MVT_GVUL', 'MVT_PLAN', 'MVT_PARCEL', 'MVT_MIGRASH', 'MVT_YEUD', 'MVT_BLDG', 'MVT_ROAD', 'MVT_GUSH']


def _zip_shp_layer_names(zip_path: Path):
    """Return a set of layer base-names (stems) for all .shp files inside a ZIP."""
    names = set()
    try:
        with zipfile.ZipFile(zip_path) as z:
            for n in z.namelist():
                if n.lower().endswith('.shp'):
                    names.add(Path(n).stem)
    except Exception:
        return set()
    return names


def _existing_geojson_layer_names(plan_out: Path):
    """Return a set of layer names (stems) for existing .geojson outputs."""
    return {p.stem for p in plan_out.glob('*.geojson')}


def transform_coords(coords, geom_type):
    """Transform coordinates from ITM to WGS84."""
    if geom_type in ('Point', 'MultiPoint'):
        if geom_type == 'Point':
            lng, lat = transformer.transform(coords[0], coords[1])
            return [lng, lat]
        else:
            return [[*transformer.transform(c[0], c[1])] for c in coords]
    elif geom_type in ('LineString', 'MultiLineString'):
        if geom_type == 'LineString':
            return [[*transformer.transform(c[0], c[1])] for c in coords]
        else:
            return [[[*transformer.transform(c[0], c[1])] for c in ring] for ring in coords]
    elif geom_type in ('Polygon', 'MultiPolygon'):
        if geom_type == 'Polygon':
            return [[[*transformer.transform(c[0], c[1])] for c in ring] for ring in coords]
        else:
            return [[[[*transformer.transform(c[0], c[1])] for c in ring] for ring in poly] for poly in coords]
    return coords


def shp_to_geojson(shp_path):
    """Convert a shapefile to GeoJSON dict with ITM→WGS84 projection."""
    sf = None
    try:
        sf = shapefile.Reader(str(shp_path), encoding='cp1255', encodingErrors='replace')
    except:
        try:
            sf = shapefile.Reader(str(shp_path), encoding='utf-8', encodingErrors='replace')
        except Exception as e:
            print(f"    Error reading {shp_path}: {e}")
            return None

    features = []
    fields = [f[0] for f in sf.fields[1:]]  # skip DeletionFlag

    for sr in sf.iterShapeRecords():
        shape = sr.shape
        rec = sr.record

        # Build properties
        props = {}
        for i, field_name in enumerate(fields):
            val = rec[i]
            if isinstance(val, bytes):
                try:
                    val = val.decode('cp1255')
                except:
                    try:
                        val = val.decode('utf-8')
                    except:
                        val = str(val)
            props[field_name] = val

        # Convert shape to GeoJSON geometry
        geom = shape.__geo_interface__
        if geom['type'] == 'Null':
            continue

        # Transform coordinates from ITM to WGS84
        try:
            geom['coordinates'] = transform_coords(geom['coordinates'], geom['type'])
        except Exception as e:
            print(f"    Coord transform error: {e}")
            continue

        features.append({
            'type': 'Feature',
            'properties': props,
            'geometry': geom
        })

    if not features:
        return None

    return {
        'type': 'FeatureCollection',
        'features': features
    }


def extract_plan_mmg(zip_path, out_dir):
    """Extract MMG layers from a plan's SHP ZIP file."""
    layers_extracted = []
    tmp = tempfile.mkdtemp()

    try:
        try:
            with zipfile.ZipFile(zip_path) as z:
                z.extractall(tmp)
        except Exception as e:
            print(f"  Error extracting ZIP: {e}")
            return layers_extracted

        # Find all .shp files
        shp_files = list(Path(tmp).rglob('*.shp'))
        if not shp_files:
            print(f"  No .shp files found")
            return layers_extracted

        os.makedirs(out_dir, exist_ok=True)

        for shp_file in sorted(shp_files):
            layer_name = shp_file.stem
            try:
                geojson = shp_to_geojson(shp_file)
                if geojson and geojson['features']:
                    out_file = os.path.join(out_dir, f"{layer_name}.geojson")
                    with open(out_file, 'w', encoding='utf-8') as f:
                        json.dump(geojson, f, ensure_ascii=False)
                    layers_extracted.append({
                        'name': layer_name,
                        'name_heb': LAYER_NAMES_HEB.get(layer_name, layer_name),
                        'features': len(geojson['features']),
                        'file': f"{layer_name}.geojson"
                    })
                    print(f"  ✓ {layer_name}: {len(geojson['features'])} features")
                else:
                    print(f"  ✗ {layer_name}: empty/error")
            except Exception as e:
                print(f"  ✗ {layer_name}: {e}")
    finally:
        # Best-effort cleanup on Windows
        try:
            import gc; gc.collect()
            shutil.rmtree(tmp, ignore_errors=True)
        except:
            pass

    return layers_extracted


def main():
    # CLI args
    args = sys.argv[1:]
    only_plan = None
    force = False
    if '--plan' in args:
        try:
            only_plan = args[args.index('--plan') + 1]
        except Exception:
            print('Usage: extract_mmg_geojson.py [--plan <PLAN_NUMBER>] [--force]')
            sys.exit(2)
    if '--force' in args:
        force = True

    docs_dir = Path('data/docs')
    mmg_dir = Path('data/mmg')
    mmg_dir.mkdir(exist_ok=True)

    # Find all SHP ZIP files (use _gen_ versions to avoid duplicates)
    plans = {}
    for plan_dir in sorted(docs_dir.iterdir()):
        if not plan_dir.is_dir():
            continue
        plan_num = plan_dir.name
        # Prefer _gen_ version, fall back to regular
        gen_shp = list(plan_dir.glob('*_gen_*SHP*.zip'))
        regular_shp = [f for f in plan_dir.glob('*SHP*.zip') if '_gen_' not in f.name]

        zip_file = gen_shp[0] if gen_shp else (regular_shp[0] if regular_shp else None)
        if zip_file:
            plans[plan_num] = zip_file

    print(f"Found {len(plans)} plans with SHP data")
    print()

    # Track all results
    index_path = mmg_dir / 'mmg_index.json'
    if only_plan and index_path.exists():
        try:
            with open(index_path, 'r', encoding='utf-8') as f:
                index = json.load(f)
        except Exception:
            index = {}
    else:
        index = {}

    total_layers = 0

    for plan_num, zip_file in sorted(plans.items()):
        if only_plan and plan_num != only_plan:
            continue

        plan_out = mmg_dir / plan_num
        if plan_out.exists() and any(plan_out.glob('*.geojson')) and not force:
            # If already extracted, only skip when it looks complete vs ZIP
            existing_names = _existing_geojson_layer_names(plan_out)
            zip_names = _zip_shp_layer_names(zip_file)
            missing_vs_zip = sorted(zip_names - existing_names)
            missing_important = [n for n in IMPORTANT_LAYERS if n in zip_names and n not in existing_names]

            if not missing_vs_zip and not missing_important:
                # Read existing
                existing = list(plan_out.glob('*.geojson'))
                layers = []
                for f in existing:
                    try:
                        with open(f, 'r', encoding='utf-8') as fh:
                            d = json.load(fh)
                        layer_name = f.stem
                        layers.append({
                            'name': layer_name,
                            'name_heb': LAYER_NAMES_HEB.get(layer_name, layer_name),
                            'features': len(d.get('features', [])),
                            'file': f.name
                        })
                    except Exception:
                        pass
                if layers:
                    index[plan_num] = layers
                    total_layers += len(layers)
                    print(f"[skip] {plan_num}: {len(layers)} layers (already extracted)")
                    continue
            else:
                print(f"[re-extract] {plan_num}: missing {len(missing_vs_zip)} layers vs ZIP" + (f" (missing important: {missing_important})" if missing_important else ""))

        print(f"[{plan_num}] Extracting from {zip_file.name}...")
        # Clear old outputs to avoid stale layers/index
        if plan_out.exists():
            for old in plan_out.glob('*.geojson'):
                try:
                    old.unlink()
                except Exception:
                    pass
        layers = extract_plan_mmg(zip_file, plan_out)
        if layers:
            index[plan_num] = layers
            total_layers += len(layers)
        print()

    # Save index
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    if only_plan:
        print(f"Updated plan: {only_plan} ({len(index.get(only_plan, []))} layers)")
        print(f"Index updated at {index_path}")
    else:
        print(f"Total: {len(index)} plans, {total_layers} layers")
        print(f"Index saved to {index_path}")


if __name__ == '__main__':
    main()
