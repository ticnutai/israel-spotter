"""
download_aerial.py – Download georeferenced aerial orthophotos from GIS-net WMTS
===================================================================

Downloads aerial photo tiles from the GIS-net v5 GeoServer WMTS service
for the Kfar Chabad area, stitches them, and creates georeferenced output
with world files (.jgw/.pgw) and projection (.prj) in EPSG:2039
(Israel TM Grid). If rasterio is installed, also creates GeoTIFF.

Available aerial years (9 historical orthophoto sets):
  1965, 1980, 1999, 2008, 2017, 2019, 2020, 2022, 2025.04

Zoom levels (higher = better quality, more tiles):
  3:  8.96 m/px  (20 tiles)     – overview
  5:  2.24 m/px  (165 tiles)    – medium
  7:  0.56 m/px  (2,337 tiles)  – high quality
  8:  0.28 m/px  (9,153 tiles)  – very high
  9:  0.14 m/px  (~36K tiles)   – ultra high
 10:  0.07 m/px  (~143K tiles)  – maximum

Other layers:
  • hybrid  – Hybrid overlay (streets on aerial)
  • reka    – Base vector map

Usage:
  python download_aerial.py                            # Latest aerial (2025.04)
  python download_aerial.py --year 1965                # Historic 1965 aerial
  python download_aerial.py --year all --level 3       # All years, level 3
  python download_aerial.py --layer hybrid --stitch    # Hybrid layer stitched
  python download_aerial.py --level 7 --stitch         # High quality 0.56 m/px
  python download_aerial.py --level 7 8 --stitch       # Multiple levels

Output files (with --stitch):
  aerial_level_7.jpg   – Stitched image
  aerial_level_7.jgw   – World file (georeference)
  aerial_level_7.prj   – Projection (EPSG:2039)
  aerial_level_7.tif   – GeoTIFF (if rasterio installed)
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.service import Service

# ─── Configuration ────────────────────────────────────────────────────────────
GIS_URL = "https://v5.gis-net.co.il/v5/Sdot_dan"
PROXY_BASE = "https://v5.gis-net.co.il/proxy/proxy.ashx?"
GEOSERVER_WMTS = "http://10.237.72.71:8080/geoserver/gwc/service/wmts"

# Cached chromedriver path (avoids network lookup via webdriver_manager)
CHROMEDRIVER_PATH = None  # Set to a path string to skip auto-detection

# All available aerial orthophoto years (from GIS-net GeoServer config)
# Layer names verified against WMTS GetCapabilities.
# 1980 is split by settlement; we use the Kfar Chabad layer + full mosaic.
# 1999 does not exist as a GeoServer WMTS layer (only in ArcGIS REST).
AERIAL_YEARS = {
    "1965":    {"heb": "1965- 14.08.1965",    "date": "1965-08-14",
                "layer": "Sdot_dan_1965:1965"},
    "1980":    {"heb": "1980 – 9.1980~",      "date": "1980-09-01",
                "layer": "Sdot_dan_1980:sdot_dan_1980"},
    "1980kc":  {"heb": "1980 – כפר חבד",    "date": "1980-09-01",
                "layer": "Sdot_dan_1980:\u05db\u05e4\u05e8 \u05d7\u05d1\u05d3_1"},
    "2008":    {"heb": "2008",                "date": "2008-01-01",
                "layer": "Sdot_dan_2008:2008"},
    "2017":    {"heb": "2017 – 3.2017~",      "date": "2017-03-01",
                "layer": "Sdot_dan_2017:2017"},
    "2019":    {"heb": "2019 – 12.04.2019",   "date": "2019-04-12",
                "layer": "Sdot_dan_2019:2019"},
    "2020":    {"heb": "2020 – 05.02.2020",   "date": "2020-02-05",
                "layer": "Sdot_dan_2020:2020"},
    "2022":    {"heb": "2022 – 15.12.2022",   "date": "2022-12-15",
                "layer": "Sdot_dan_2022:2022"},
    "2025":    {"heb": "2025",                "date": "2025-01-01",
                "layer": "Sdot_dan_2025:2025"},
    "2025.04": {"heb": "2025 – 19.4.2025",    "date": "2025-04-19",
                "layer": "Sdot_dan_2025.04:2025.04"},
}

DEFAULT_YEAR = "2025.04"

def make_aerial_layer(year: str) -> dict:
    """Build a layer dict for a specific aerial year."""
    info = AERIAL_YEARS[year]
    return {
        "name": info["layer"],
        "format": "image/jpeg",
        "ext": ".jpg",
        "description": f"צילום אוויר {info['heb']}",
    }

# Non-aerial layers
BASE_LAYERS = {
    "hybrid": {
        "name": "Sdot_dan_SHP:Sdot_dan_Hybrid",
        "format": "image/png",
        "ext": ".png",
        "description": "שכבת היברידית (שמות רחובות על צילום אוויר)",
    },
    "reka": {
        "name": "Sdot_dan_SHP:Sdot_dan_Reka",
        "format": "image/jpeg",
        "ext": ".jpg",
        "description": "מפת רקע",
    },
}

def get_layer(layer_key: str, year: str = DEFAULT_YEAR) -> dict:
    """Return layer dict by key. For 'aerial', uses the specified year."""
    if layer_key == "aerial":
        return make_aerial_layer(year)
    return BASE_LAYERS[layer_key]

# Tile matrix set name
TILEMATRIX_SET = "Sdot_dan"

# ─── WMTS Tile Matrix Parameters (from GeoServer GetCapabilities) ─────────────
# CRS: EPSG:2039 (Israel TM Grid)
# Origin (TopLeftCorner): X=177118.8637, Y=664444.0
# All tiles: 256×256 pixels
TILE_ORIGIN_X = 177118.8637
TILE_ORIGIN_Y = 664444.0
TILE_SIZE = 256  # pixels

# Scale denominators and pixel sizes per level
# pixel_size = scaleDenominator × 0.00028 (OGC WMTS standard, meters)
TILE_MATRIX_SCALES = {
    0: 256000.0,   # 71.68 m/px, 1x1 grid
    1: 128000.0,   # 35.84 m/px, 2x2
    2:  64000.0,   # 17.92 m/px, 4x4
    3:  32000.0,   #  8.96 m/px, 8x8
    4:  16000.0,   #  4.48 m/px, 16x16
    5:   8000.0,   #  2.24 m/px, 32x32
    6:   4000.0,   #  1.12 m/px, 64x64
    7:   2000.0,   #  0.56 m/px, 128x128
    8:   1000.0,   #  0.28 m/px, 256x256
    9:    500.0,   #  0.14 m/px, 512x512
   10:    250.0,   #  0.07 m/px, 1024x1024
}

def get_pixel_size(level: int) -> float:
    """Return pixel size in meters for a given zoom level."""
    return TILE_MATRIX_SCALES[level] * 0.00028

def get_tile_span(level: int) -> float:
    """Return the ground extent of one tile in meters."""
    return get_pixel_size(level) * TILE_SIZE

def tile_to_coords(level: int, row: int, col: int) -> tuple:
    """Convert tile (row, col) at level to EPSG:2039 coords (xmin, ymin, xmax, ymax)."""
    ts = get_tile_span(level)
    xmin = TILE_ORIGIN_X + col * ts
    ymax = TILE_ORIGIN_Y - row * ts
    xmax = xmin + ts
    ymin = ymax - ts
    return (xmin, ymin, xmax, ymax)

# EPSG:2039 WKT for .prj files (Israel 1993 / Israeli TM Grid)
EPSG_2039_WKT = (
    'PROJCS["Israel 1993 / Israeli TM Grid",'
    'GEOGCS["Israel 1993",'
    'DATUM["Israel_1993",'
    'SPHEROID["GRS 1980",6378137,298.257222101]],'
    'PRIMEM["Greenwich",0],'
    'UNIT["degree",0.0174532925199433]],'
    'PROJECTION["Transverse_Mercator"],'
    'PARAMETER["latitude_of_origin",31.7343936111111],'
    'PARAMETER["central_meridian",35.2045169444444],'
    'PARAMETER["scale_factor",1.0000067],'
    'PARAMETER["false_easting",219529.584],'
    'PARAMETER["false_northing",626907.39],'
    'UNIT["metre",1]]'
)

# Kfar Chabad area tile ranges per zoom level.
# Each level doubles the grid. These ranges cover the Kfar Chabad area.
KFAR_CHABAD_TILES = {
    3: {"row_min": 2, "row_max": 5, "col_min": 2, "col_max": 6},         # 20 tiles,   8.96 m/px
    4: {"row_min": 5, "row_max": 10, "col_min": 4, "col_max": 12},       # 54 tiles,   4.48 m/px
    5: {"row_min": 10, "row_max": 20, "col_min": 8, "col_max": 22},      # 165 tiles,  2.24 m/px
    6: {"row_min": 20, "row_max": 40, "col_min": 16, "col_max": 44},     # 609 tiles,  1.12 m/px
    7: {"row_min": 40, "row_max": 80, "col_min": 32, "col_max": 88},     # 2337 tiles, 0.56 m/px
    8: {"row_min": 80, "row_max": 160, "col_min": 64, "col_max": 176},   # 9153 tiles, 0.28 m/px
    9: {"row_min": 160, "row_max": 320, "col_min": 128, "col_max": 352}, # ~36K tiles, 0.14 m/px
   10: {"row_min": 320, "row_max": 640, "col_min": 256, "col_max": 704}, # ~143K tiles,0.07 m/px
}

DOWNLOAD_ROOT = os.path.join(os.path.dirname(__file__), "gis_downloads")


# ─── Driver factory ──────────────────────────────────────────────────────────
def _find_chromedriver() -> str:
    """Find chromedriver: use explicit path, cached wdm, or webdriver_manager."""
    if CHROMEDRIVER_PATH:
        return CHROMEDRIVER_PATH
    # Try cached webdriver_manager path
    import glob
    wdm_pattern = os.path.expanduser("~/.wdm/drivers/chromedriver/win64/*/chromedriver-win32/chromedriver.exe")
    cached = sorted(glob.glob(wdm_pattern))
    if cached:
        return cached[-1]  # Latest version
    # Fall back to webdriver_manager download
    from webdriver_manager.chrome import ChromeDriverManager
    return ChromeDriverManager().install()


def create_gis_driver() -> webdriver.Chrome:
    """Create Chrome driver with anti-detection for GIS site."""
    opts = webdriver.ChromeOptions()
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(
        service=Service(_find_chromedriver()), options=opts
    )
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    })
    return driver


def establish_session(driver: webdriver.Chrome) -> None:
    """Load GIS page and wait for session cookies to be set."""
    print(f"  Opening GIS page: {GIS_URL}")
    driver.get(GIS_URL)
    time.sleep(10)
    cookies = [c["name"] for c in driver.get_cookies()]
    print(f"  Session cookies: {cookies}")


# ─── Tile download via browser XHR ───────────────────────────────────────────
def build_tile_url(layer_name: str, fmt: str, level: int, row: int, col: int) -> str:
    """Build the WMTS GetTile URL through the proxy."""
    return (
        f"{PROXY_BASE}{GEOSERVER_WMTS}?SERVICE=WMTS&VERSION=1.0.0"
        f"&REQUEST=GetTile&LAYER={layer_name}"
        f"&STYLE=raster&FORMAT={fmt}"
        f"&TILEMATRIXSET={TILEMATRIX_SET}"
        f"&TILEMATRIX={TILEMATRIX_SET}:{level}"
        f"&TILEROW={row}&TILECOL={col}"
    )


def download_tile_via_browser(driver: webdriver.Chrome, url: str) -> bytes | None:
    """Download a tile using the browser's XHR (leveraging session cookies)."""
    result = driver.execute_async_script("""
        var callback = arguments[arguments.length - 1];
        var url = arguments[0];
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = 30000;
        xhr.onload = function() {
            if (xhr.status === 200 && xhr.response.byteLength > 200) {
                var bytes = new Uint8Array(xhr.response);
                var binary = '';
                for (var i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                callback({ok: true, b64: btoa(binary), size: xhr.response.byteLength});
            } else {
                callback({ok: false, status: xhr.status, size: xhr.response ? xhr.response.byteLength : 0});
            }
        };
        xhr.onerror = function() { callback({ok: false, error: 'network'}); };
        xhr.ontimeout = function() { callback({ok: false, error: 'timeout'}); };
        xhr.send();
    """, url)

    if result and result.get("ok"):
        return base64.b64decode(result["b64"])
    return None


def discover_tile_range(driver: webdriver.Chrome, layer_name: str, fmt: str,
                        level: int, initial_range: dict) -> dict:
    """Probe tiles to find the actual valid range at a given level."""
    row_min = initial_range["row_min"]
    row_max = initial_range["row_max"]
    col_min = initial_range["col_min"]
    col_max = initial_range["col_max"]

    # Quick probe: test corner tiles to see if they exist
    def tile_exists(r, c):
        url = build_tile_url(layer_name, fmt, level, r, c)
        result = driver.execute_async_script("""
            var callback = arguments[arguments.length - 1];
            var xhr = new XMLHttpRequest();
            xhr.open('GET', arguments[0], true);
            xhr.responseType = 'arraybuffer';
            xhr.timeout = 10000;
            xhr.onload = function() {
                callback({status: xhr.status, size: xhr.response ? xhr.response.byteLength : 0});
            };
            xhr.onerror = function() { callback({status: 0}); };
            xhr.ontimeout = function() { callback({status: 0}); };
            xhr.send();
        """, url)
        return result and result.get("status") == 200 and result.get("size", 0) > 200

    # Test center tile first to make sure the level works at all
    center_r = (row_min + row_max) // 2
    center_c = (col_min + col_max) // 2
    if not tile_exists(center_r, center_c):
        print(f"    Center tile ({center_r},{center_c}) doesn't exist at level {level}")
        return None

    print(f"    Initial range: rows {row_min}-{row_max}, cols {col_min}-{col_max}")
    return initial_range


def download_tiles_for_level(driver: webdriver.Chrome, layer_key: str,
                              level: int, output_dir: str,
                              year: str = DEFAULT_YEAR) -> list:
    """Download all tiles for a specific zoom level."""
    layer = get_layer(layer_key, year)
    layer_name = layer["name"]
    fmt = layer["format"]
    ext = layer["ext"]

    if level not in KFAR_CHABAD_TILES:
        print(f"  No tile range defined for level {level}")
        return []

    tile_range = KFAR_CHABAD_TILES[level]
    validated = discover_tile_range(driver, layer_name, fmt, level, tile_range)
    if not validated:
        return []

    row_min = validated["row_min"]
    row_max = validated["row_max"]
    col_min = validated["col_min"]
    col_max = validated["col_max"]

    total = (row_max - row_min + 1) * (col_max - col_min + 1)
    print(f"  Downloading level {level}: rows {row_min}-{row_max}, "
          f"cols {col_min}-{col_max} ({total} tiles)")

    level_dir = os.path.join(output_dir, f"level_{level}")
    os.makedirs(level_dir, exist_ok=True)

    downloaded = []
    count = 0
    skipped = 0
    errors = 0

    for row in range(row_min, row_max + 1):
        for col in range(col_min, col_max + 1):
            count += 1
            fname = f"tile_{level}_{row}_{col}{ext}"
            fpath = os.path.join(level_dir, fname)

            if os.path.exists(fpath) and os.path.getsize(fpath) > 200:
                skipped += 1
                downloaded.append((row, col, fpath))
                continue

            url = build_tile_url(layer_name, fmt, level, row, col)
            tile_data = download_tile_via_browser(driver, url)

            if tile_data and len(tile_data) > 200:
                with open(fpath, "wb") as f:
                    f.write(tile_data)
                downloaded.append((row, col, fpath))
                if count % 20 == 0 or count == total:
                    print(f"    [{count}/{total}] Downloaded {fname} ({len(tile_data)} bytes)")
            else:
                errors += 1
                if errors <= 5:
                    print(f"    [{count}/{total}] SKIP {fname} (empty/error)")

    print(f"  Level {level}: {len(downloaded)} downloaded, {skipped} cached, {errors} errors")
    return downloaded


def stitch_tiles(downloaded: list, level: int, output_dir: str, ext: str,
                 georef: bool = True) -> str | None:
    """Stitch downloaded tiles into a single georeferenced image.

    When georef=True (default), also writes:
      • .jgw / .pgw  world file  (pixel-to-coordinate mapping)
      • .prj         projection file (EPSG:2039)
      • .tfw (GeoTIFF) via rasterio if available
    """
    try:
        from PIL import Image
    except ImportError:
        print("  Pillow not installed. Run: pip install Pillow")
        return None

    if not downloaded:
        return None

    # Find grid dimensions
    rows = sorted(set(r for r, c, _ in downloaded))
    cols = sorted(set(c for _, c, _ in downloaded))

    # Load first tile to get dimension
    sample = Image.open(downloaded[0][2])
    tw, th = sample.size
    sample.close()

    total_w = len(cols) * tw
    total_h = len(rows) * th

    pixel_size = get_pixel_size(level)
    print(f"  Stitching {len(rows)}x{len(cols)} tiles ({tw}x{th} each) "
          f"→ {total_w}x{total_h} pixels  ({pixel_size:.4f} m/px)")

    result = Image.new("RGB", (total_w, total_h))

    row_idx = {r: i for i, r in enumerate(rows)}
    col_idx = {c: i for i, c in enumerate(cols)}

    for r, c, fpath in downloaded:
        try:
            tile = Image.open(fpath)
            x = col_idx[c] * tw
            y = row_idx[r] * th
            result.paste(tile, (x, y))
            tile.close()
        except Exception as e:
            print(f"    Warning: could not paste tile {fpath}: {e}")

    out_ext = ".jpg" if ext == ".jpg" else ".png"
    out_path = os.path.join(output_dir, f"aerial_level_{level}{out_ext}")
    if out_ext == ".jpg":
        result.save(out_path, "JPEG", quality=95, subsampling=0)
    else:
        result.save(out_path, "PNG")

    fsize = os.path.getsize(out_path)
    print(f"  Stitched image saved: {out_path} ({fsize:,} bytes)")

    # ── Georeferencing ────────────────────────────────────────────────────
    if georef:
        _write_world_file(out_path, out_ext, level, rows, cols)
        _try_geotiff(result, out_path, level, rows, cols, output_dir)

    result.close()
    return out_path


def _write_world_file(image_path: str, ext: str, level: int,
                       rows: list, cols: list) -> None:
    """Write a world file (.jgw/.pgw) and .prj next to the image."""
    pixel_size = get_pixel_size(level)
    tile_span = get_tile_span(level)

    # Upper-left pixel center in EPSG:2039
    x_ul = TILE_ORIGIN_X + cols[0] * tile_span + pixel_size / 2
    y_ul = TILE_ORIGIN_Y - rows[0] * tile_span - pixel_size / 2

    # World file extension: .jgw for .jpg, .pgw for .png, .tfw for .tif
    wf_ext_map = {".jpg": ".jgw", ".jpeg": ".jgw", ".png": ".pgw", ".tif": ".tfw"}
    wf_ext = wf_ext_map.get(ext, ".wld")
    wf_path = os.path.splitext(image_path)[0] + wf_ext

    # World file format:
    #   pixel_size_x
    #   rotation_y (0)
    #   rotation_x (0)
    #   -pixel_size_y (negative = Y going down)
    #   x_center_of_upper_left_pixel
    #   y_center_of_upper_left_pixel
    with open(wf_path, "w") as f:
        f.write(f"{pixel_size:.10f}\n")
        f.write("0.0000000000\n")
        f.write("0.0000000000\n")
        f.write(f"{-pixel_size:.10f}\n")
        f.write(f"{x_ul:.10f}\n")
        f.write(f"{y_ul:.10f}\n")

    # Write .prj (coordinate system definition)
    prj_path = os.path.splitext(image_path)[0] + ".prj"
    with open(prj_path, "w") as f:
        f.write(EPSG_2039_WKT)

    print(f"  World file: {wf_path}")
    print(f"  Projection: {prj_path}  (EPSG:2039 Israel TM Grid)")

    # Print geographic extent for reference
    tile_span_total_x = len(cols) * tile_span
    tile_span_total_y = len(rows) * tile_span
    xmin = TILE_ORIGIN_X + cols[0] * tile_span
    ymax = TILE_ORIGIN_Y - rows[0] * tile_span
    xmax = xmin + tile_span_total_x
    ymin = ymax - tile_span_total_y
    print(f"  Extent (EPSG:2039): X[{xmin:.2f} – {xmax:.2f}], "
          f"Y[{ymin:.2f} – {ymax:.2f}]")
    print(f"  Coverage: {tile_span_total_x:.0f}m × {tile_span_total_y:.0f}m")


def _try_geotiff(image, image_path: str, level: int,
                 rows: list, cols: list, output_dir: str) -> None:
    """Try to create a GeoTIFF using rasterio (if available)."""
    try:
        import numpy as np
        import rasterio
        from rasterio.transform import from_bounds
    except ImportError:
        return  # rasterio not installed; world file is sufficient

    pixel_size = get_pixel_size(level)
    tile_span = get_tile_span(level)

    xmin = TILE_ORIGIN_X + cols[0] * tile_span
    ymax = TILE_ORIGIN_Y - rows[0] * tile_span
    xmax = xmin + len(cols) * tile_span
    ymin = ymax - len(rows) * tile_span

    arr = np.array(image)  # shape: (H, W, 3)

    tif_path = os.path.join(output_dir, f"aerial_level_{level}.tif")
    transform = from_bounds(xmin, ymin, xmax, ymax, arr.shape[1], arr.shape[0])

    with rasterio.open(
        tif_path, "w", driver="GTiff",
        height=arr.shape[0], width=arr.shape[1], count=3,
        dtype=arr.dtype, crs="EPSG:2039",
        transform=transform,
        compress="jpeg", jpeg_quality=95,
    ) as dst:
        for band in range(3):
            dst.write(arr[:, :, band], band + 1)

    fsize = os.path.getsize(tif_path)
    print(f"  GeoTIFF: {tif_path} ({fsize:,} bytes)")


# ─── WMS GetMap alternative ──────────────────────────────────────────────────
def download_wms_image(driver: webdriver.Chrome, layer_key: str,
                        bbox: tuple, width: int, height: int,
                        output_dir: str, year: str = DEFAULT_YEAR) -> str | None:
    """
    Download a single high-res image via WMS GetMap.
    bbox = (xmin, ymin, xmax, ymax) in EPSG:2039.
    """
    layer = get_layer(layer_key, year)
    layer_name = layer["name"]
    workspace = layer_name.split(":")[0]
    layer_short = layer_name.split(":")[1]
    fmt = layer["format"]
    ext = layer["ext"]

    xmin, ymin, xmax, ymax = bbox
    wms_url = (
        f"{PROXY_BASE}http://10.237.72.71:8080/geoserver/{workspace}/wms"
        f"?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
        f"&LAYERS={layer_short}"
        f"&STYLES=&SRS=EPSG:2039"
        f"&BBOX={xmin},{ymin},{xmax},{ymax}"
        f"&WIDTH={width}&HEIGHT={height}"
        f"&FORMAT={fmt}"
    )

    print(f"  WMS GetMap: {width}x{height} pixels, bbox=({xmin},{ymin},{xmax},{ymax})")

    result = driver.execute_async_script("""
        var callback = arguments[arguments.length - 1];
        var xhr = new XMLHttpRequest();
        xhr.open('GET', arguments[0], true);
        xhr.responseType = 'arraybuffer';
        xhr.timeout = 60000;
        xhr.onload = function() {
            if (xhr.status === 200 && xhr.response.byteLength > 500) {
                var bytes = new Uint8Array(xhr.response);
                var binary = '';
                for (var i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                callback({ok: true, b64: btoa(binary), size: xhr.response.byteLength,
                          type: xhr.getResponseHeader('Content-Type')});
            } else {
                // Try to read error text
                var dec = new TextDecoder();
                var text = xhr.response ? dec.decode(xhr.response).substring(0, 500) : '';
                callback({ok: false, status: xhr.status, size: xhr.response ? xhr.response.byteLength : 0, text: text});
            }
        };
        xhr.onerror = function() { callback({ok: false, error: 'network'}); };
        xhr.ontimeout = function() { callback({ok: false, error: 'timeout'}); };
        xhr.send();
    """, wms_url)

    if result and result.get("ok"):
        img_data = base64.b64decode(result["b64"])
        os.makedirs(output_dir, exist_ok=True)
        out_path = os.path.join(output_dir, f"aerial_wms_{width}x{height}{ext}")
        with open(out_path, "wb") as f:
            f.write(img_data)
        print(f"  WMS image saved: {out_path} ({len(img_data)} bytes)")
        return out_path
    else:
        print(f"  WMS failed: {result}")
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    all_layer_keys = ["aerial", "hybrid", "reka"]
    all_year_choices = list(AERIAL_YEARS.keys()) + ["all", "latest"]

    parser = argparse.ArgumentParser(
        description="Download GIS aerial photos for Kfar Chabad",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Available aerial years:\n"
            + "\n".join(f"  {y}: {info['heb']}" for y, info in AERIAL_YEARS.items())
        ),
    )
    parser.add_argument("--layer", choices=all_layer_keys, default="aerial",
                        help="Layer type to download (default: aerial)")
    parser.add_argument("--year", nargs="+", default=["latest"],
                        help="Aerial year(s): 1965 1980 1999 2008 2017 2019 2020 2022 2025.04 | all | latest")
    parser.add_argument("--level", type=int, nargs="+", default=[5],
                        help="Zoom levels to download (3-10, default: 5)")
    parser.add_argument("--stitch", action="store_true",
                        help="Stitch tiles into a single image")
    parser.add_argument("--no-georef", action="store_true",
                        help="Skip georeferencing (world file + prj)")
    parser.add_argument("--wms", action="store_true",
                        help="Use WMS GetMap instead of WMTS tiles")
    parser.add_argument("--wms-size", type=int, default=4096,
                        help="WMS image size in pixels (default: 4096)")
    parser.add_argument("--output", default=DOWNLOAD_ROOT,
                        help="Output directory")
    parser.add_argument("--list-years", action="store_true",
                        help="List available aerial years and exit")
    args = parser.parse_args()

    if args.list_years:
        print("Available aerial photo years:")
        for y, info in AERIAL_YEARS.items():
            print(f"  {y:>8s}  {info['heb']}")
        return

    # Resolve year list
    if args.layer != "aerial":
        years = [DEFAULT_YEAR]  # year irrelevant for non-aerial layers
    elif "all" in args.year:
        years = list(AERIAL_YEARS.keys())
    elif "latest" in args.year:
        years = [DEFAULT_YEAR]
    else:
        years = []
        for y in args.year:
            if y in AERIAL_YEARS:
                years.append(y)
            else:
                print(f"WARNING: Unknown year '{y}', skipping")

    print(f"=== GIS Aerial Photo Downloader ===")
    print(f"Layer: {args.layer}")
    if args.layer == "aerial":
        print(f"Years: {', '.join(years)}")
    print(f"Levels: {args.level}")
    print()

    # Create driver and establish session
    driver = create_gis_driver()
    try:
        establish_session(driver)

        for year in years:
            layer_info = get_layer(args.layer, year)
            year_label = year if args.layer == "aerial" else args.layer

            print(f"\n--- {layer_info['description']} ---")
            print(f"  WMTS layer: {layer_info['name']}")

            output_dir = os.path.join(args.output, args.layer, year_label)
            os.makedirs(output_dir, exist_ok=True)

            if args.wms:
                bbox = (185500, 647500, 188500, 650000)
                download_wms_image(driver, args.layer, bbox,
                                   args.wms_size, args.wms_size, output_dir)
            else:
                for level in args.level:
                    if level < 3 or level > 10:
                        print(f"  Skipping level {level} (valid range: 3-10)")
                        continue

                    try:
                        tiles = download_tiles_for_level(
                            driver, args.layer, level, output_dir, year
                        )
                    except Exception as dl_err:
                        err_name = type(dl_err).__name__
                        print(f"  Session error ({err_name}), restarting browser...")
                        try:
                            driver.quit()
                        except Exception:
                            pass
                        driver = create_gis_driver()
                        establish_session(driver)
                        # Retry with fresh session (cached tiles will be skipped)
                        try:
                            tiles = download_tiles_for_level(
                                driver, args.layer, level, output_dir, year
                            )
                        except Exception as retry_err:
                            print(f"  Retry failed: {retry_err}")
                            tiles = []

                    if args.stitch and tiles:
                        stitch_tiles(tiles, level, output_dir, layer_info["ext"],
                                     georef=not args.no_georef)

        print("\n=== Done ===")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            driver.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
