"""
download_plans.py – הורדת תכניות בניין עיר (תב"ע) לכפר חב"ד
=============================================================

מוריד את כל מסמכי התכניות מאתר שדות דן (SDAN).
כל גוש רץ ב-thread נפרד עם Chrome driver משלו.

שימוש::

    python download_plans.py                  # כל הגושים, 3 threads
    python download_plans.py --workers 5      # 5 threads במקביל
    python download_plans.py --gush 6260      # גוש ספציפי בלבד
    python download_plans.py --gush 6260 6262 # כמה גושים ספציפיים
"""

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from sdan_common import KFAR_CHABAD_GUSHIM, process_gush

CATEGORY = "plans"
DOWNLOAD_ROOT = "./kfar_chabad_data"


def main():
    parser = argparse.ArgumentParser(
        description="הורדת תכניות בניין עיר (תב\"ע) לכפר חב\"ד"
    )
    parser.add_argument(
        "--workers", type=int, default=3,
        help="מספר threads במקביל (ברירת מחדל: 3)",
    )
    parser.add_argument(
        "--gush", type=int, nargs="+", default=None,
        help="גוש/ים ספציפיים להורדה (ברירת מחדל: כולם)",
    )
    args = parser.parse_args()

    gushim = args.gush if args.gush else KFAR_CHABAD_GUSHIM
    workers = min(args.workers, len(gushim))

    print(f"╔══════════════════════════════════════════╗")
    print(f"║   תכניות בניין עיר – כפר חב\"ד           ║")
    print(f"║   גושים: {len(gushim):<3}  |  threads: {workers:<3}          ║")
    print(f"╚══════════════════════════════════════════╝")
    print(f"גושים: {gushim}\n")

    results = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(process_gush, g, CATEGORY, DOWNLOAD_ROOT): g
            for g in gushim
        }
        for future in as_completed(futures):
            gush = futures[future]
            try:
                stats = future.result()
                results.append(stats)
                print(
                    f"\n✓ גוש {gush} הסתיים – "
                    f"{stats['files']} קבצים, {stats['errors']} שגיאות"
                )
            except Exception as e:
                print(f"\n✗ גוש {gush} נכשל: {e}")
                results.append({"gush": gush, "files": 0, "errors": 1})

    # Summary
    total_files = sum(r["files"] for r in results)
    total_errors = sum(r["errors"] for r in results)
    print(f"\n{'='*45}")
    print(f"  סיכום תכניות: {total_files} קבצים הורדו, {total_errors} שגיאות")
    print(f"  נשמר ב: {DOWNLOAD_ROOT}/plans/")
    print(f"{'='*45}")


if __name__ == "__main__":
    main()
