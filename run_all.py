"""
run_all.py – הרצת כל ההורדות: תכניות + היתרים + צילומי אוויר
==============================================================

מריץ קודם את כל התכניות (plans) ואז את כל ההיתרים (permits),
כשבתוך כל קטגוריה הגושים רצים במקביל ב-threads.
לאחר מכן מוריד צילומי אוויר מ-GIS (9 שנות צילום, 1965–2025).
לבסוף מבצע גיאורפרנס לתשריטים שהורדו.

שימוש::

    python run_all.py                        # הכל, 3 threads
    python run_all.py --workers 4            # 4 threads
    python run_all.py --category plans       # רק תכניות
    python run_all.py --category permits     # רק היתרים
    python run_all.py --category aerial      # רק צילומי אוויר
    python run_all.py --category georef      # רק גיאורפרנס לתשריטים
    python run_all.py --gush 6260 6262       # גושים ספציפיים בלבד
    python run_all.py --aerial-year all      # כל שנות הצילום
    python run_all.py --aerial-year 1965     # שנה ספציפית
    python run_all.py --aerial-level 3 5     # רמות זום ספציפיות
"""

import argparse
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from sdan_common import KFAR_CHABAD_GUSHIM, process_gush

DOWNLOAD_ROOT = "./kfar_chabad_data"
SDAN_CATEGORIES = ["plans", "permits"]
ALL_CATEGORIES = ["plans", "permits", "aerial", "georef"]

CATEGORY_NAMES = {
    "plans": "תכניות בניין עיר (תב\"ע)",
    "permits": "בקשות להיתר בנייה",
    "aerial": "צילומי אוויר (GIS)",
    "georef": "גיאורפרנס תשריטים",
}


def run_sdan_category(category: str, gushim: list, workers: int):
    """Run one SDAN category (plans/permits) with parallel threads."""
    name = CATEGORY_NAMES.get(category, category)
    print(f"\n{'═'*50}")
    print(f"  {name}")
    print(f"  {len(gushim)} גושים × {workers} threads")
    print(f"{'═'*50}\n")

    results = []
    start = time.time()

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(process_gush, g, category, DOWNLOAD_ROOT): g
            for g in gushim
        }
        for future in as_completed(futures):
            gush = futures[future]
            try:
                stats = future.result()
                results.append(stats)
                print(
                    f"  ✓ גוש {gush} – "
                    f"{stats['files']} קבצים, {stats['errors']} שגיאות"
                )
            except Exception as e:
                print(f"  ✗ גוש {gush} נכשל: {e}")
                results.append({"gush": gush, "files": 0, "errors": 1})

    elapsed = time.time() - start
    total_files = sum(r["files"] for r in results)
    total_errors = sum(r["errors"] for r in results)
    print(f"\n  סיכום {name}: {total_files} קבצים, "
          f"{total_errors} שגיאות, {elapsed/60:.1f} דקות")
    return results


def run_aerial(years: list, levels: list, stitch: bool):
    """Run GIS aerial photo download."""
    from download_aerial import (
        AERIAL_YEARS, DEFAULT_YEAR,
        create_gis_driver, establish_session,
        get_layer, download_tiles_for_level, stitch_tiles,
    )

    name = CATEGORY_NAMES["aerial"]
    print(f"\n{'═'*50}")
    print(f"  {name}")
    print(f"  שנים: {', '.join(years)} | רמות: {levels}")
    print(f"{'═'*50}\n")

    start = time.time()
    total_tiles = 0
    total_errors = 0

    driver = create_gis_driver()
    try:
        establish_session(driver)

        for year in years:
            layer_info = get_layer("aerial", year)
            print(f"\n  --- {layer_info['description']} ---")

            output_dir = os.path.join("gis_downloads", "aerial", year)
            os.makedirs(output_dir, exist_ok=True)

            for level in levels:
                if level < 3 or level > 8:
                    continue
                tiles = download_tiles_for_level(
                    driver, "aerial", level, output_dir, year
                )
                total_tiles += len(tiles)
                if stitch and tiles:
                    stitch_tiles(tiles, level, output_dir, layer_info["ext"])
    except Exception as e:
        print(f"  שגיאה בהורדת צילומי אוויר: {e}")
        total_errors += 1
    finally:
        driver.quit()

    elapsed = time.time() - start
    print(f"\n  סיכום {name}: {total_tiles} אריחים, "
          f"{total_errors} שגיאות, {elapsed/60:.1f} דקות")
    return {"files": total_tiles, "errors": total_errors}


def run_georef():
    """Run georeferencing on downloaded plan maps."""
    from generate_georef import georeference_all_plans

    name = CATEGORY_NAMES["georef"]
    print(f"\n{'═'*50}")
    print(f"  {name}")
    print(f"{'═'*50}\n")

    start = time.time()
    plans_dir = os.path.join(DOWNLOAD_ROOT, "plans")

    try:
        results = georeference_all_plans(plans_dir)
        total_files = len(results)
        total_errors = 0
    except Exception as e:
        print(f"  שגיאה בגיאורפרנס: {e}")
        total_files = 0
        total_errors = 1

    elapsed = time.time() - start
    print(f"\n  סיכום {name}: {total_files} תשריטים, "
          f"{total_errors} שגיאות, {elapsed:.1f} שניות")
    return {"files": total_files, "errors": total_errors}


def main():
    parser = argparse.ArgumentParser(
        description="הורדת כל המסמכים של כפר חב\"ד – מסמכי תכנון + צילומי אוויר"
    )
    parser.add_argument(
        "--workers", type=int, default=3,
        help="מספר threads במקביל (ברירת מחדל: 3)",
    )
    parser.add_argument(
        "--gush", type=int, nargs="+", default=None,
        help="גוש/ים ספציפיים (ברירת מחדל: כולם)",
    )
    parser.add_argument(
        "--category", choices=ALL_CATEGORIES, nargs="+", default=None,
        help="קטגוריות ספציפיות (ברירת מחדל: כולן)",
    )
    parser.add_argument(
        "--aerial-year", nargs="+", default=["latest"],
        help="שנות צילום אוויר: 1965 1980 ... 2025.04 | all | latest",
    )
    parser.add_argument(
        "--aerial-level", type=int, nargs="+", default=[5],
        help="רמות זום לצילומי אוויר (3-8, ברירת מחדל: 5)",
    )
    parser.add_argument(
        "--stitch", action="store_true",
        help="תפירת אריחים לתמונה אחת",
    )
    args = parser.parse_args()

    gushim = args.gush if args.gush else KFAR_CHABAD_GUSHIM
    categories = args.category if args.category else ALL_CATEGORIES
    workers = min(args.workers, len(gushim))

    # Resolve aerial years
    from download_aerial import AERIAL_YEARS, DEFAULT_YEAR
    if "all" in args.aerial_year:
        aerial_years = list(AERIAL_YEARS.keys())
    elif "latest" in args.aerial_year:
        aerial_years = [DEFAULT_YEAR]
    else:
        aerial_years = [y for y in args.aerial_year if y in AERIAL_YEARS]

    print(f"╔══════════════════════════════════════════════╗")
    print(f"║   מערכת הורדת מסמכים – כפר חב\"ד             ║")
    print(f"║   קטגוריות: {', '.join(categories):<20}         ║")
    if "aerial" not in categories:
        print(f"║   גושים: {len(gushim):<3} | threads: {workers:<3}              ║")
    else:
        print(f"║   גושים: {len(gushim):<3} | threads: {workers:<3}              ║")
        print(f"║   צילום אוויר: {', '.join(aerial_years):<20}    ║")
    print(f"╚══════════════════════════════════════════════╝")

    all_results = []
    total_start = time.time()

    # Run SDAN categories (plans / permits)
    sdan_cats = [c for c in categories if c in SDAN_CATEGORIES]
    for cat in sdan_cats:
        results = run_sdan_category(cat, gushim, workers)
        all_results.extend(results)

    # Run GIS aerial download
    if "aerial" in categories:
        aerial_result = run_aerial(aerial_years, args.aerial_level, args.stitch)
        all_results.append(aerial_result)

    # Run georeferencing on plan maps
    if "georef" in categories:
        georef_result = run_georef()
        all_results.append(georef_result)

    total_elapsed = time.time() - total_start
    grand_files = sum(r["files"] for r in all_results)
    grand_errors = sum(r["errors"] for r in all_results)

    print(f"\n{'═'*50}")
    print(f"  סיכום כולל:")
    print(f"    קבצים/אריחים שהורדו: {grand_files}")
    print(f"    שגיאות:               {grand_errors}")
    print(f"    זמן כולל:             {total_elapsed/60:.1f} דקות")
    if sdan_cats:
        print(f"    תיקיית מסמכים:       {DOWNLOAD_ROOT}/")
        print(f"    מסד נתונים:           kfar_chabad_documents.db")
    if "aerial" in categories:
        print(f"    תיקיית צילומי אוויר: gis_downloads/aerial/")
    if "georef" in categories:
        print(f"    קבצי גיאורפרנס:      {DOWNLOAD_ROOT}/plans/ (*.jgw + *.prj)")
    print(f"{'═'*50}")


if __name__ == "__main__":
    main()
