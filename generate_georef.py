"""
Generate georeferencing for plan maps based on estimated coordinates.
Uses Kfar Chabad center from GovMap + scale estimation + map frame detection.
"""
import os
import sys
import json
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, os.path.dirname(__file__))
from georeference_plan import (
    compute_affine_from_gcps, compute_affine_from_bbox,
    write_world_file, write_prj_file, EPSG_2039_WKT
)


def estimate_plan_coordinates(image_path, center_x=187353, center_y=655659,
                                scale=2500, dpi=150):
    """
    Estimate georeferencing for a plan map based on:
    - Known center coordinates of the settlement
    - Estimated map scale
    - Image DPI
    - Detected map frame position
    
    Returns bbox (xmin, ymin, xmax, ymax) and map frame info.
    """
    img = Image.open(image_path)
    w, h = img.size
    actual_dpi = img.info.get('dpi', (dpi, dpi))
    if isinstance(actual_dpi, tuple):
        dpi_x, dpi_y = actual_dpi
    else:
        dpi_x = dpi_y = actual_dpi
    img.close()
    
    # Calculate physical paper size (cm)
    paper_w_cm = w / dpi_x * 2.54
    paper_h_cm = h / dpi_y * 2.54
    
    # Ground coverage at given scale
    ground_w = paper_w_cm * scale / 100  # meters
    ground_h = paper_h_cm * scale / 100  # meters
    
    # The map is typically centered on the settlement
    # But with margins for title, legend, etc.
    # Estimate margin distribution:
    # - Left margin larger (title block/legend often on left)
    # - Top margin larger (title)
    # Based on detected map frame at (25.8%, 26.7%) → (78.0%, 83.7%)
    
    # Full image extent (assumes map frame is centered on settlement)
    # Map frame position relative to image:
    frame_left_pct = 0.258
    frame_top_pct = 0.267
    frame_right_pct = 0.780
    frame_bottom_pct = 0.837
    
    # Map frame center relative to image
    frame_cx = (frame_left_pct + frame_right_pct) / 2  # 0.519
    frame_cy = (frame_top_pct + frame_bottom_pct) / 2  # 0.552
    
    # Full image bbox
    xmin = center_x - frame_cx * ground_w
    xmax = xmin + ground_w
    ymax = center_y + frame_cy * ground_h
    ymin = ymax - ground_h
    
    return (xmin, ymin, xmax, ymax), {
        'w': w, 'h': h,
        'dpi': (dpi_x, dpi_y),
        'paper_cm': (paper_w_cm, paper_h_cm),
        'ground_m': (ground_w, ground_h),
        'scale': scale,
        'pixel_size_m': ground_w / w,
    }


def georeference_all_plans(plans_dir, center_x=187353, center_y=655659, 
                             scale=2500):
    """Find and georeference all plan map images."""
    
    results = []
    processed = set()
    
    for root, dirs, files in os.walk(plans_dir):
        for f in files:
            fpath = os.path.join(root, f)
            fname_lower = f.lower()
            
            # Check if it's a plan map (image/pdf only)
            valid_ext = ('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.pdf')
            if not fname_lower.endswith(valid_ext):
                continue
            
            is_plan_map = False
            if "תשריט" in f:
                is_plan_map = True
            elif "תוכנית" in f:
                is_plan_map = True
            
            if not is_plan_map:
                continue
            
            # Skip duplicates (same file in multiple gush directories)
            fsize = os.path.getsize(fpath)
            key = (f, fsize)
            if key in processed:
                continue
            processed.add(key)
            
            print(f"\n{'='*60}")
            print(f"File: {fpath}")
            
            ext = os.path.splitext(f)[1].lower()
            
            # Handle PDFs
            if ext == '.pdf':
                try:
                    import fitz
                    doc = fitz.open(fpath)
                    page = doc[0]
                    zoom = 300 / 72.0
                    mat = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                    doc.close()
                    
                    png_path = os.path.splitext(fpath)[0] + "_georef.png"
                    img.save(png_path, "PNG")
                    print(f"  PDF → PNG: {png_path} ({img.size[0]}×{img.size[1]})")
                    
                    fpath = png_path
                    ext = '.png'
                    img.close()
                except Exception as e:
                    print(f"  PDF conversion failed: {e}")
                    continue
            
            # Estimate coordinates
            try:
                bbox, info = estimate_plan_coordinates(
                    fpath, center_x, center_y, scale
                )
            except Exception as e:
                print(f"  Error: {e}")
                continue
            
            print(f"  Size: {info['w']}×{info['h']} px, DPI: {info['dpi']}")
            print(f"  Paper: {info['paper_cm'][0]:.1f}×{info['paper_cm'][1]:.1f} cm")
            print(f"  Scale: 1:{info['scale']}")
            print(f"  Ground: {info['ground_m'][0]:.0f}×{info['ground_m'][1]:.0f} m")
            print(f"  Pixel size: {info['pixel_size_m']:.4f} m/px")
            print(f"  Bbox: X[{bbox[0]:.0f}–{bbox[2]:.0f}] Y[{bbox[1]:.0f}–{bbox[3]:.0f}]")
            
            # Compute affine transform
            affine = compute_affine_from_bbox(info['w'], info['h'], bbox)
            
            # Write world file
            base = os.path.splitext(fpath)[0]
            wf_path = write_world_file(base, ext, affine)
            prj_path = write_prj_file(base, "2039")
            
            print(f"  World file: {os.path.basename(wf_path)}")
            print(f"  Projection: {os.path.basename(prj_path)}")
            
            results.append({
                'image': fpath,
                'bbox': bbox,
                'info': info,
                'world_file': wf_path,
                'prj_file': prj_path,
            })
    
    # Also copy world files to all duplicate locations
    print(f"\n{'='*60}")
    print("Copying world files to duplicate plan locations...")
    
    for root, dirs, files in os.walk(plans_dir):
        for f in files:
            fpath = os.path.join(root, f)
            fsize = os.path.getsize(fpath)
            key = (f, fsize)
            
            # Find matching result
            for result in results:
                orig = result['image']
                orig_fname = os.path.basename(orig)
                orig_size = os.path.getsize(orig)
                
                if f == orig_fname and fsize == orig_size and fpath != orig:
                    # Copy world file and prj
                    base = os.path.splitext(fpath)[0]
                    ext = os.path.splitext(fpath)[1]
                    
                    src_wf = result['world_file']
                    src_prj = result['prj_file']
                    
                    dst_wf = write_world_file(base, ext, 
                        compute_affine_from_bbox(result['info']['w'], result['info']['h'], result['bbox']))
                    dst_prj = write_prj_file(base, "2039")
                    
                    print(f"  {os.path.dirname(fpath)} ← world file + prj")
    
    return results


def main():
    plans_dir = os.path.join(os.path.dirname(__file__), "kfar_chabad_data", "plans")
    
    if not os.path.exists(plans_dir):
        print(f"Plans directory not found: {plans_dir}")
        return
    
    # Kfar Chabad center coordinates (from GovMap search)
    CENTER_X = 187353
    CENTER_Y = 655659
    
    # Estimated scale (common for Israeli detailed settlement plans)
    SCALE = 2500
    
    print("="*60)
    print("  Georeferencing Plan Maps – כפר חב\"ד")
    print("="*60)
    print(f"  Center: ({CENTER_X}, {CENTER_Y}) EPSG:2039")
    print(f"  Estimated scale: 1:{SCALE}")
    print(f"  Plans directory: {plans_dir}")
    
    results = georeference_all_plans(plans_dir, CENTER_X, CENTER_Y, SCALE)
    
    print(f"\n{'='*60}")
    print(f"Summary: {len(results)} unique plan maps georeferenced")
    print(f"\nIMPORTANT: These are ESTIMATED coordinates based on:")
    print(f"  • Settlement center from GovMap: ({CENTER_X}, {CENTER_Y})")
    print(f"  • Estimated scale: 1:{SCALE}")
    print(f"  • Detected map frame position")
    print(f"\nTo verify/refine:")
    print(f"  1. Open the plan map in QGIS (drag and drop)")
    print(f"  2. Load an aerial image (e.g., gis_downloads/aerial/2025.04/)")
    print(f"  3. Check if the plan overlays correctly on the aerial")
    print(f"  4. If not, adjust using:")
    print(f"     python georeference_plan.py <image> --bbox XMIN,YMIN,XMAX,YMAX")
    print(f"  5. Or provide GCPs (read grid values from map borders):")
    print(f"     python georeference_plan.py <image> --gcps PX,PY,CX,CY PX,PY,CX,CY ...")
    
    # Save config for reference
    config = {
        "center": {"x": CENTER_X, "y": CENTER_Y},
        "crs": "EPSG:2039",
        "estimated_scale": SCALE,
        "plans": [
            {
                "image": r["image"],
                "bbox": list(r["bbox"]),
                "pixel_size_m": r["info"]["pixel_size_m"],
                "note": "ESTIMATED coordinates - verify in GIS"
            }
            for r in results
        ]
    }
    config_path = os.path.join(plans_dir, "georef_config.json")
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"\nConfig saved: {config_path}")


if __name__ == "__main__":
    main()
