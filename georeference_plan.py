"""
georeference_plan.py – Georeference planning maps (תשריטים) for GIS
=====================================================================

Takes a plan map image (JPG/PNG/TIF/PDF) and creates georeferenced output
using Ground Control Points (GCPs). The output can be opened directly in
QGIS, ArcGIS, or any GIS software and will appear at the correct location
on the Israeli coordinate grid.

Modes:
  1. GCP mode (--gcps): Provide pixel→coordinate point pairs
  2. Bbox mode (--bbox): Provide bounding box coordinates
  3. Config mode (--config): Load GCPs from a JSON config file
  4. Interactive mode (--interactive): Click on points and enter coords

Output files:
  • .jgw / .pgw  – World file (pixel-to-coordinate mapping)
  • .prj         – Projection file (EPSG:2039 Israel TM Grid)
  • .tif         – GeoTIFF (if --geotiff flag used)

Usage examples:
  # Provide 4 GCPs (pixel_x,pixel_y,coord_x,coord_y):
  python georeference_plan.py plan.jpg \\
    --gcps 100,50,185500,657000  5000,50,188000,657000 \\
           100,4000,185500,654000  5000,4000,188000,654000

  # Provide bounding box (xmin,ymin,xmax,ymax in EPSG:2039):
  python georeference_plan.py plan.jpg \\
    --bbox 185500,654000,188000,657000

  # Use a JSON config file with GCPs:
  python georeference_plan.py plan.jpg --config plan_gcps.json

  # Convert PDF to image first, then georeference:
  python georeference_plan.py plan.pdf --bbox 185500,654000,188000,657000

Coordinate systems:
  Default: EPSG:2039 (Israel 1993 / Israeli TM Grid = New Israeli Grid)
  Use --old-grid for EPSG:6991 (Israel 1993 / Israeli CS Grid = Old grid)
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# ─── Coordinate system definitions ───────────────────────────────────────────

# EPSG:2039 – Israel 1993 / Israeli TM Grid (New Israeli Grid, ITM)
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

# EPSG:6991 – Israel 1993 / Israeli CS Grid (Old/Cassini grid)
EPSG_6991_WKT = (
    'PROJCS["Israel 1993 / Israeli CS Grid",'
    'GEOGCS["Israel 1993",'
    'DATUM["Israel_1993",'
    'SPHEROID["GRS 1980",6378137,298.257222101]],'
    'PRIMEM["Greenwich",0],'
    'UNIT["degree",0.0174532925199433]],'
    'PROJECTION["Cassini_Soldner"],'
    'PARAMETER["latitude_of_origin",31.7340969444444],'
    'PARAMETER["central_meridian",35.2120805555556],'
    'PARAMETER["false_easting",170251.555],'
    'PARAMETER["false_northing",1126867.909],'
    'UNIT["metre",1]]'
)

CRS_MAP = {
    "2039": {"wkt": EPSG_2039_WKT, "name": "Israel TM Grid (חדשה)", "epsg": 2039},
    "6991": {"wkt": EPSG_6991_WKT, "name": "Israeli CS Grid (ישנה)", "epsg": 6991},
}


# ─── Image loading ───────────────────────────────────────────────────────────

def load_image(path: str, dpi: int = 300) -> tuple[Image.Image, str]:
    """Load image from file. Converts PDF to image if needed.
    
    Returns (PIL.Image, output_base_path)
    """
    path = os.path.abspath(path)
    ext = os.path.splitext(path)[1].lower()
    base = os.path.splitext(path)[0]
    
    if ext == ".pdf":
        return _pdf_to_image(path, dpi), base
    elif ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"):
        return Image.open(path), base
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _pdf_to_image(pdf_path: str, dpi: int = 300) -> Image.Image:
    """Convert first page of PDF to PIL Image."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("ERROR: PyMuPDF required for PDF conversion.")
        print("  Install: pip install pymupdf")
        sys.exit(1)

    doc = fitz.open(pdf_path)
    page = doc[0]  # First page
    
    # Render at specified DPI
    zoom = dpi / 72.0  # PDF default is 72 DPI
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat)
    
    # Convert to PIL
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    doc.close()
    
    png_path = os.path.splitext(pdf_path)[0] + "_georef.png"
    img.save(png_path, "PNG")
    print(f"  PDF → PNG: {png_path} ({img.size[0]}x{img.size[1]} px, {dpi} DPI)")
    
    return img


# ─── Affine transform computation ────────────────────────────────────────────

def compute_affine_from_gcps(gcps: list[tuple]) -> tuple:
    """Compute affine transform parameters from GCPs.
    
    GCPs: list of (pixel_x, pixel_y, coord_x, coord_y) tuples.
    Returns: (a, b, c, d, e, f) where:
      coord_x = a * pixel_x + b * pixel_y + c
      coord_y = d * pixel_x + e * pixel_y + f
    
    Uses least-squares fit for overdetermined systems (>3 GCPs).
    """
    n = len(gcps)
    if n < 3:
        raise ValueError(f"Need at least 3 GCPs, got {n}")
    
    # Build matrices for least squares: A @ params = b
    # For X: a*px + b*py + c = cx
    # For Y: d*px + e*py + f = cy
    A = np.zeros((n, 3))
    bx = np.zeros(n)
    by = np.zeros(n)
    
    for i, (px, py, cx, cy) in enumerate(gcps):
        A[i] = [px, py, 1.0]
        bx[i] = cx
        by[i] = cy
    
    # Solve using least squares
    result_x, residuals_x, _, _ = np.linalg.lstsq(A, bx, rcond=None)
    result_y, residuals_y, _, _ = np.linalg.lstsq(A, by, rcond=None)
    
    a, b, c = result_x  # coord_x = a*px + b*py + c
    d, e, f = result_y  # coord_y = d*px + e*py + f
    
    # Report fit quality
    if n > 3:
        errors = []
        for px, py, cx, cy in gcps:
            pred_x = a * px + b * py + c
            pred_y = d * px + e * py + f
            err = np.sqrt((pred_x - cx) ** 2 + (pred_y - cy) ** 2)
            errors.append(err)
        rms = np.sqrt(np.mean(np.array(errors) ** 2))
        max_err = max(errors)
        print(f"  Affine fit: RMS error = {rms:.2f} m, max error = {max_err:.2f} m")
    
    return (a, b, c, d, e, f)


def compute_affine_from_bbox(width: int, height: int, 
                              bbox: tuple, margin_pct: float = 0) -> tuple:
    """Compute affine from bounding box.
    
    bbox: (xmin, ymin, xmax, ymax) in real-world coordinates.
    margin_pct: percentage of image that is margin (e.g., 5 for 5%).
    
    Assumes the image is north-up with the bbox covering the non-margin area.
    """
    xmin, ymin, xmax, ymax = bbox
    
    # Account for margins
    if margin_pct > 0:
        mx = width * margin_pct / 100
        my = height * margin_pct / 100
    else:
        mx, my = 0, 0
    
    # Map pixel corners to coordinate corners
    # Top-left pixel (mx, my) → (xmin, ymax)
    # Bottom-right pixel (width-mx, height-my) → (xmax, ymin)
    effective_w = width - 2 * mx
    effective_h = height - 2 * my
    
    pixel_size_x = (xmax - xmin) / effective_w
    pixel_size_y = (ymax - ymin) / effective_h
    
    # Affine: coord_x = a*px + b*py + c, coord_y = d*px + e*py + f
    a = pixel_size_x
    b = 0.0
    c = xmin - mx * pixel_size_x
    d = 0.0
    e = -pixel_size_y  # Y axis is inverted (pixel Y goes down, coord Y goes up)
    f = ymax + my * pixel_size_y
    
    return (a, b, c, d, e, f)


# ─── Output writing ──────────────────────────────────────────────────────────

def write_world_file(base_path: str, ext: str, affine: tuple) -> str:
    """Write a world file (.jgw/.pgw/.tfw) from affine parameters.
    
    World file format (6 lines):
      Line 1: pixel size in x (a)
      Line 2: rotation about y (d)  
      Line 3: rotation about x (b)
      Line 4: pixel size in y (e, negative)
      Line 5: x coordinate of center of upper-left pixel
      Line 6: y coordinate of center of upper-left pixel
    """
    a, b, c, d, e, f = affine
    
    # World file extension mapping
    wf_ext_map = {
        ".jpg": ".jgw", ".jpeg": ".jgw",
        ".png": ".pgw",
        ".tif": ".tfw", ".tiff": ".tfw",
        ".bmp": ".bpw",
    }
    wf_ext = wf_ext_map.get(ext.lower(), ".wld")
    wf_path = base_path + wf_ext
    
    # Upper-left pixel CENTER (0.5 pixel offset from corner)
    x_ul = a * 0.5 + b * 0.5 + c
    y_ul = d * 0.5 + e * 0.5 + f
    
    with open(wf_path, "w") as wf:
        wf.write(f"{a:.10f}\n")      # pixel size x
        wf.write(f"{d:.10f}\n")      # rotation y (usually 0)
        wf.write(f"{b:.10f}\n")      # rotation x (usually 0)
        wf.write(f"{e:.10f}\n")      # pixel size y (negative)
        wf.write(f"{x_ul:.10f}\n")   # x of upper-left pixel center
        wf.write(f"{y_ul:.10f}\n")   # y of upper-left pixel center
    
    return wf_path


def write_prj_file(base_path: str, crs_key: str = "2039") -> str:
    """Write projection file."""
    prj_path = base_path + ".prj"
    crs = CRS_MAP[crs_key]
    with open(prj_path, "w") as f:
        f.write(crs["wkt"])
    return prj_path


def write_geotiff(img: Image.Image, output_path: str, 
                  affine: tuple, crs_key: str = "2039") -> str:
    """Write a GeoTIFF using rasterio (if available)."""
    try:
        import rasterio
        from rasterio.transform import Affine
    except ImportError:
        print("  GeoTIFF skipped (install rasterio for GeoTIFF support)")
        return None
    
    a, b, c, d, e, f = affine
    transform = Affine(a, b, c, d, e, f)
    
    arr = np.array(img)
    if len(arr.shape) == 2:
        count = 1
        bands = [arr]
    else:
        count = arr.shape[2]
        bands = [arr[:, :, i] for i in range(count)]
    
    tif_path = output_path + ".tif"
    crs = CRS_MAP[crs_key]
    
    with rasterio.open(
        tif_path, "w", driver="GTiff",
        height=arr.shape[0], width=arr.shape[1], count=count,
        dtype=arr.dtype, crs=f"EPSG:{crs['epsg']}",
        transform=transform,
        compress="jpeg", jpeg_quality=95,
    ) as dst:
        for i, band in enumerate(bands):
            dst.write(band, i + 1)
    
    fsize = os.path.getsize(tif_path)
    print(f"  GeoTIFF: {tif_path} ({fsize:,} bytes)")
    return tif_path


# ─── GCP configuration file handling ─────────────────────────────────────────

def load_config(config_path: str) -> dict:
    """Load GCP configuration from a JSON file.
    
    Expected format:
    {
      "image": "תשריט.jpg",
      "crs": "2039",
      "gcps": [
        {"pixel": [100, 50], "coord": [185500, 657000]},
        {"pixel": [5000, 50], "coord": [188000, 657000]},
        ...
      ]
    }
    
    Or with bbox:
    {
      "image": "תשריט.jpg",
      "crs": "2039",
      "bbox": [185500, 654000, 188000, 657000],
      "margin_pct": 5
    }
    """
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_config_template(output_path: str):
    """Save a template GCP config file."""
    template = {
        "image": "path/to/plan_map.jpg",
        "crs": "2039",
        "description": "plan name / תוכנית",
        "gcps": [
            {"pixel": [100, 50], "coord": [185500, 657000], "note": "top-left grid intersection"},
            {"pixel": [5000, 50], "coord": [188000, 657000], "note": "top-right grid intersection"},
            {"pixel": [100, 4000], "coord": [185500, 654000], "note": "bottom-left grid intersection"},
            {"pixel": [5000, 4000], "coord": [188000, 654000], "note": "bottom-right grid intersection"},
        ],
        "_comment": [
            "crs: '2039' = New Israeli Grid (ITM), '6991' = Old Israeli Grid (ICS)",
            "pixel: [x, y] in pixels from top-left corner",
            "coord: [x, y] = [easting, northing] in meters",
            "You can add more GCPs for better accuracy",
        ],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(template, f, indent=2, ensure_ascii=False)
    print(f"Template saved to: {output_path}")


# ─── Batch processing ────────────────────────────────────────────────────────

def find_plan_maps(directory: str) -> list:
    """Find plan map files in a directory tree."""
    map_files = []
    for root, dirs, files in os.walk(directory):
        for f in files:
            fpath = os.path.join(root, f)
            fname = f.lower()
            # Look for files that are likely plan maps
            if ("תשריט" in f or "tashrit" in fname or
                fname.startswith("401") and fname.endswith(".pdf")):
                if any(fname.endswith(e) for e in ('.jpg', '.jpeg', '.png', '.tif', '.pdf')):
                    map_files.append(fpath)
    return map_files


# ─── Main ─────────────────────────────────────────────────────────────────────

def georeference_image(image_path: str, gcps: list = None, bbox: tuple = None,
                        margin_pct: float = 0, crs_key: str = "2039",
                        make_geotiff: bool = False, dpi: int = 300) -> str:
    """Georeference a single image.
    
    Args:
        image_path: Path to the image or PDF
        gcps: List of (pixel_x, pixel_y, coord_x, coord_y) tuples
        bbox: (xmin, ymin, xmax, ymax) for simple bbox mode
        margin_pct: Image margin percentage for bbox mode
        crs_key: CRS key ('2039' or '6991')
        make_geotiff: Create GeoTIFF output
        dpi: DPI for PDF rendering
    
    Returns: Path to the output image
    """
    # Load image
    img, base = load_image(image_path, dpi)
    w, h = img.size
    ext = os.path.splitext(image_path)[1].lower()
    if ext == ".pdf":
        ext = ".png"
        base = os.path.splitext(image_path)[0] + "_georef"
    
    print(f"  Image: {w}x{h} pixels")
    crs = CRS_MAP[crs_key]
    print(f"  CRS: EPSG:{crs['epsg']} ({crs['name']})")
    
    # Compute affine transform
    if gcps:
        print(f"  GCPs: {len(gcps)} points")
        affine = compute_affine_from_gcps(gcps)
    elif bbox:
        print(f"  Bbox: X[{bbox[0]:.0f}–{bbox[2]:.0f}], Y[{bbox[1]:.0f}–{bbox[3]:.0f}]")
        affine = compute_affine_from_bbox(w, h, bbox, margin_pct)
    else:
        raise ValueError("Must provide either gcps or bbox")
    
    a, b, c, d, e, f = affine
    
    # Report pixel size
    pixel_size_x = np.sqrt(a**2 + d**2)
    pixel_size_y = np.sqrt(b**2 + e**2)
    print(f"  Pixel size: {pixel_size_x:.4f} × {pixel_size_y:.4f} m/px")
    
    # Compute extent
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    xs = [a * px + b * py + c for px, py in corners]
    ys = [d * px + e * py + f for px, py in corners]
    print(f"  Extent: X[{min(xs):.2f} – {max(xs):.2f}], "
          f"Y[{min(ys):.2f} – {max(ys):.2f}]")
    print(f"  Coverage: {max(xs)-min(xs):.0f}m × {max(ys)-min(ys):.0f}m")
    
    # Write world file
    wf_path = write_world_file(base, ext, affine)
    print(f"  World file: {wf_path}")
    
    # Write PRJ
    prj_path = write_prj_file(base, crs_key)
    print(f"  Projection: {prj_path}")
    
    # Optionally write GeoTIFF
    if make_geotiff:
        write_geotiff(img, base, affine, crs_key)
    
    img.close()
    output_path = base + ext
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Georeference planning maps (תשריטים) for GIS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  # Using GCPs (pixel_x,pixel_y,coord_x,coord_y):\n"
            "  python georeference_plan.py plan.jpg \\\n"
            "    --gcps 100,50,185500,657000 5000,50,188000,657000 \\\n"
            "           100,4000,185500,654000 5000,4000,188000,654000\n\n"
            "  # Using bounding box (xmin,ymin,xmax,ymax):\n"
            "  python georeference_plan.py plan.jpg \\\n"
            "    --bbox 185500,654000,188000,657000\n\n"
            "  # Using config file:\n"
            "  python georeference_plan.py plan.jpg --config gcps.json\n\n"
            "  # Create template config:\n"
            "  python georeference_plan.py --template\n"
        ),
    )
    parser.add_argument("image", nargs="?", help="Image or PDF file to georeference")
    parser.add_argument("--gcps", nargs="+", metavar="PX,PY,CX,CY",
                        help="Ground Control Points: pixel_x,pixel_y,coord_x,coord_y")
    parser.add_argument("--bbox", metavar="XMIN,YMIN,XMAX,YMAX",
                        help="Bounding box in real-world coordinates")
    parser.add_argument("--margin", type=float, default=0,
                        help="Image margin percentage for bbox mode (default: 0)")
    parser.add_argument("--config", metavar="FILE",
                        help="JSON config file with GCPs")
    parser.add_argument("--crs", choices=["2039", "6991"], default="2039",
                        help="Coordinate system: 2039=New Israeli Grid, 6991=Old (default: 2039)")
    parser.add_argument("--dpi", type=int, default=300,
                        help="DPI for PDF rendering (default: 300)")
    parser.add_argument("--geotiff", action="store_true",
                        help="Also create GeoTIFF output")
    parser.add_argument("--template", action="store_true",
                        help="Create a template GCP config file")
    parser.add_argument("--batch", metavar="DIR",
                        help="Find and list plan maps in directory")
    args = parser.parse_args()
    
    if args.template:
        save_config_template("gcps_template.json")
        return
    
    if args.batch:
        maps = find_plan_maps(args.batch)
        print(f"Found {len(maps)} plan maps:")
        for m in maps:
            print(f"  {m}")
        return
    
    if not args.image:
        parser.print_help()
        return
    
    print(f"=== Georeferencing: {os.path.basename(args.image)} ===")
    
    # Determine GCPs or bbox
    gcps = None
    bbox = None
    crs_key = args.crs
    
    if args.config:
        config = load_config(args.config)
        crs_key = config.get("crs", crs_key)
        if "gcps" in config:
            gcps = [(g["pixel"][0], g["pixel"][1], g["coord"][0], g["coord"][1])
                    for g in config["gcps"]]
        elif "bbox" in config:
            bbox = tuple(config["bbox"])
            args.margin = config.get("margin_pct", args.margin)
    elif args.gcps:
        gcps = []
        for gcp_str in args.gcps:
            parts = [float(x) for x in gcp_str.split(",")]
            if len(parts) != 4:
                print(f"ERROR: GCP must have 4 values (px,py,cx,cy), got: {gcp_str}")
                sys.exit(1)
            gcps.append(tuple(parts))
    elif args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        if len(parts) != 4:
            print(f"ERROR: Bbox must have 4 values (xmin,ymin,xmax,ymax)")
            sys.exit(1)
        bbox = tuple(parts)
    else:
        print("ERROR: Must provide --gcps, --bbox, or --config")
        sys.exit(1)
    
    georeference_image(
        args.image, gcps=gcps, bbox=bbox,
        margin_pct=args.margin, crs_key=crs_key,
        make_geotiff=args.geotiff, dpi=args.dpi,
    )
    
    print("\n=== Done ===")
    print("Open the image in QGIS/ArcGIS – it will load at the correct position.")


if __name__ == "__main__":
    main()
