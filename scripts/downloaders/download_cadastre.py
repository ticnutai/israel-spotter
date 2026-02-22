"""
Download cadastral data (חלקות וגושים) for כפר חב"ד blocks.

Uses ArcGIS FeatureServer query API from services8.arcgis.com.
Downloads parcels and blocks filtered to כפר חב"ד block numbers.

Block numbers: 6256, 6258, 6260, 6261, 6262, 6269, 6272, 6280, 7187, 7188, 7196, 7311
(+ additional blocks discovered from plan data)
"""

import json, os, time
import requests

# Read additional blocks from extracted metadata
KNOWN_BLOCKS = ['6256', '6258', '6260', '6261', '6262', '6269', '6272', '6280',
                '7187', '7188', '7196', '7311']

# Try to load additional blocks from metadata
try:
    with open("data/blocks_parcels_by_plan.json", "r", encoding="utf-8") as f:
        blocks_map = json.load(f)
    all_blocks = sorted(set(KNOWN_BLOCKS + list(blocks_map.keys())))
except:
    all_blocks = KNOWN_BLOCKS

OUTPUT_DIR = "data/cadastre"
os.makedirs(OUTPUT_DIR, exist_ok=True)
PAGE_SIZE = 2000


def query_features(base_url, where, out_sr=2039):
    """Query features with pagination from ArcGIS FeatureServer."""
    query_url = f"{base_url}/query"
    all_features = []
    offset = 0

    while True:
        params = {
            "where": where,
            "outFields": "*",
            "outSR": out_sr,
            "returnGeometry": "true",
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            "f": "geojson",
        }

        try:
            r = requests.get(query_url, params=params, timeout=120)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"    Error at offset {offset}: {e}")
            break

        features = data.get("features", [])
        if not features:
            break

        all_features.extend(features)
        print(f"    Got {len(features)} (total: {len(all_features)})")

        exceeded = data.get("exceededTransferLimit", False)
        if not exceeded and len(features) < PAGE_SIZE:
            break

        offset += len(features)
        time.sleep(0.5)

    return all_features


def save_geojson(features, path, name):
    geojson = {
        "type": "FeatureCollection",
        "name": name,
        "features": features,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(path) / 1024
    return size_kb


def main():
    print(f"Blocks to download: {len(all_blocks)}")
    print(f"  Known (from plans): {KNOWN_BLOCKS}")
    extra = [b for b in all_blocks if b not in KNOWN_BLOCKS]
    if extra:
        print(f"  Additional (from metadata): {extra[:20]}{'...' if len(extra) > 20 else ''}")

    # Build WHERE clause for blocks
    # For parcels: GUSH_NUM IN (...)
    # For blocks: GUSH_NUM IN (...)
    block_list = ", ".join(all_blocks)

    # 1. Download parcels
    print(f"\n{'='*60}")
    print("Downloading חלקות (parcels)")
    print(f"{'='*60}")
    parcels_url = "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/חלקות/FeatureServer/0"

    # First check field names
    try:
        r = requests.get(f"{parcels_url}?f=json", timeout=30)
        fields = [f["name"] for f in r.json().get("fields", [])]
        print(f"  Fields: {fields[:15]}")

        # Figure out the block number field
        block_field = None
        for candidate in ["GUSH_NUM", "GUSH", "BLOCK", "BLOCK_NUM", "SUB_GUSH_NUM"]:
            if candidate in fields:
                block_field = candidate
                break
        if not block_field:
            # Try partial match
            for f in fields:
                if "GUSH" in f.upper() or "BLOCK" in f.upper():
                    block_field = f
                    break

        if block_field:
            print(f"  Using block field: {block_field}")
            where = f"{block_field} IN ({block_list})"
        else:
            print(f"  WARNING: Could not find block field! Using REGION_ID = 4")
            where = "REGION_ID = 4"
    except Exception as e:
        print(f"  Field check error: {e}")
        where = f"GUSH_NUM IN ({block_list})"

    parcels = query_features(parcels_url, where)
    if parcels:
        size = save_geojson(parcels, os.path.join(OUTPUT_DIR, "parcels_kfar_chabad.geojson"), "parcels_kfar_chabad")
        print(f"  Saved {len(parcels)} parcels ({size:.0f} KB)")
    else:
        print("  No parcels found")

    time.sleep(2)

    # 2. Download blocks
    print(f"\n{'='*60}")
    print("Downloading גושים (blocks)")
    print(f"{'='*60}")
    blocks_url = "https://services8.arcgis.com/JcXY3lLZni6BK4El/arcgis/rest/services/שכבת_גושים/FeatureServer/0"

    try:
        r = requests.get(f"{blocks_url}?f=json", timeout=30)
        fields = [f["name"] for f in r.json().get("fields", [])]
        print(f"  Fields: {fields[:15]}")

        block_field = None
        for candidate in ["GUSH_NUM", "GUSH", "BLOCK", "BLOCK_NUM", "SUB_GUSH_NUM"]:
            if candidate in fields:
                block_field = candidate
                break
        if not block_field:
            for f in fields:
                if "GUSH" in f.upper() or "BLOCK" in f.upper():
                    block_field = f
                    break

        if block_field:
            print(f"  Using block field: {block_field}")
            where = f"{block_field} IN ({block_list})"
        else:
            print(f"  WARNING: Could not find block field!")
            where = "1=1"
    except Exception as e:
        print(f"  Field check error: {e}")
        where = f"GUSH_NUM IN ({block_list})"

    blocks = query_features(blocks_url, where)
    if blocks:
        size = save_geojson(blocks, os.path.join(OUTPUT_DIR, "blocks_kfar_chabad.geojson"), "blocks_kfar_chabad")
        print(f"  Saved {len(blocks)} blocks ({size:.0f} KB)")
    else:
        print("  No blocks found")

    print(f"\n{'='*60}")
    print("Done!")


if __name__ == "__main__":
    main()
