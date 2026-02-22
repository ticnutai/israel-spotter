"""
setup_dwg_converter.py
======================
מוריד ומתקין את ODA File Converter (חינם) לצורך המרת DWG → DXF.
הרץ פעם אחת בלבד. לאחר ההתקנה עצור והפעל מחדש את serve_ui.py.

Usage:
    python setup_dwg_converter.py
"""

import sys
import os
import subprocess
import urllib.request
import tempfile
import glob

# ── קישור הורדה ישיר (Windows x64 MSI) ─────────────────────────────────────
DOWNLOAD_URL = (
    "https://www.opendesign.com/guestfiles/get"
    "?filename=ODAFileConverter_QT6_vc16_amd64dll_26.12.msi"
)


def _find_installed():
    """מחפש ODAFileConverter.exe בכל המיקומים הסבירים."""
    # Per-user AppData (הכי נפוץ)
    local_programs = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'ODA')
    matches = glob.glob(os.path.join(local_programs, '**', 'ODAFileConverter.exe'), recursive=True)
    if matches:
        return matches[0]
    # System-wide
    for base in [r'C:\Program Files\ODA', r'C:\Program Files (x86)\ODA']:
        matches = glob.glob(os.path.join(base, '**', 'ODAFileConverter.exe'), recursive=True)
        if matches:
            return matches[0]
    # PATH
    import shutil
    return shutil.which('ODAFileConverter')


def _progress_hook(count, block_size, total_size):
    if total_size > 0:
        pct = min(100, int(count * block_size * 100 / total_size))
        bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
        print(f"\r  [{bar}] {pct}%", end="", flush=True)


def main():
    print("=" * 60)
    print("  ODA File Converter — הגדרה אוטומטית")
    print("=" * 60)

    # 1. בדוק אם כבר מותקן
    existing = _find_installed()
    if existing:
        print(f"\n✅ ODA File Converter כבר מותקן:")
        print(f"   {existing}")
        print("\n  serve_ui.py יזהה אותו אוטומטית.")
        print("  הפעל מחדש את השרת וייבוא DWG יפעל.")
        return

    print("\n  ODA File Converter לא נמצא — מוריד...")
    print(f"  מקור: {DOWNLOAD_URL}\n")

    # 2. הורדה
    msi_path = os.path.join(tempfile.gettempdir(), "ODAFileConverter_setup.msi")
    try:
        urllib.request.urlretrieve(DOWNLOAD_URL, msi_path, _progress_hook)
        print()  # newline after progress
        size_mb = os.path.getsize(msi_path) / 1024 / 1024
        print(f"  ✅ הורד: {msi_path} ({size_mb:.1f} MB)")
    except Exception as e:
        print(f"\n  ❌ שגיאת הורדה: {e}")
        print("  נסה להוריד ידנית מ:")
        print("  https://www.opendesign.com/guestfiles/oda_file_converter")
        sys.exit(1)

    # 3. התקנה — קודם per-user (ללא הרשאות מנהל), אחר כך system-wide
    log_path = os.path.join(tempfile.gettempdir(), "oda_install.log")
    print("\n  מתקין (ללא הרשאות מנהל — per-user)...")

    cmd = [
        "msiexec", "/i", msi_path, "/quiet", "/norestart",
        "ALLUSERS=2", "MSIINSTALLPERUSER=1",
        "/l*v", log_path
    ]
    try:
        result = subprocess.run(cmd, timeout=120)
        if result.returncode == 0:
            print("  ✅ ההתקנה הסתיימה בהצלחה")
        elif result.returncode == 3010:
            print("  ✅ ההתקנה הצליחה (נדרש אתחול מחדש של Windows)")
        else:
            print(f"  ⚠️  per-user נכשל (קוד {result.returncode}) — מנסה כמנהל...")
            # ניסיון שני עם הרשאות מנהל
            cmd2 = ["msiexec", "/i", msi_path, "/quiet", "/norestart", "/l*v", log_path]
            result2 = subprocess.run(
                ["powershell", "-Command",
                 f'Start-Process msiexec -ArgumentList \'/i "{msi_path}" /quiet /norestart /l*v "{log_path}"\' -Verb RunAs -Wait'],
                timeout=120
            )
            if result2.returncode == 0:
                print("  ✅ ההתקנה כמנהל הצליחה")
            else:
                print(f"  ❌ כל הניסיונות נכשלו. בדוק לוג: {log_path}")
                sys.exit(1)
    except subprocess.TimeoutExpired:
        print("  ❌ ההתקנה לקחה יותר מדי זמן")
        sys.exit(1)
    except Exception as e:
        print(f"  ❌ שגיאת התקנה: {e}")
        sys.exit(1)
    finally:
        try:
            os.unlink(msi_path)
        except Exception:
            pass

    # 4. וידוא
    found = _find_installed()
    if found:
        print(f"\n✅ ODA File Converter מוכן לשימוש:")
        print(f"   {found}")
        print("\n  🎉 הכל מוכן!")
        print("  הפעל מחדש את serve_ui.py ואז העלה קבצי DWG דרך הממשק.")
    else:
        print("\n  ⚠️  ההתקנה רצה אך הקובץ לא נמצא אוטומטית.")
        print("  חפש ידנית את ODAFileConverter.exe ומצא אותו בתפריט התחל.")


if __name__ == "__main__":
    main()



def _progress_hook(count, block_size, total_size):
    if total_size > 0:
        pct = min(100, int(count * block_size * 100 / total_size))
        bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
        print(f"\r  [{bar}] {pct}%", end="", flush=True)


def main():
    print("=" * 60)
    print("  ODA File Converter — הגדרה אוטומטית")
    print("=" * 60)

    # 1. בדוק אם כבר מותקן
    existing = _find_installed()
    if existing:
        print(f"\n✅ ODA File Converter כבר מותקן:")
        print(f"   {existing}")
        print("\n  serve_ui.py יזהה אותו אוטומטית.")
        print("  הפעל מחדש את השרת וייבוא DWG יפעל.")
        return

    print("\n  ODA File Converter לא נמצא — מוריד...")
    print(f"  מקור: {DOWNLOAD_URL}\n")

    # 2. הורדה
    msi_path = os.path.join(tempfile.gettempdir(), "ODAFileConverter_setup.msi")
    try:
        urllib.request.urlretrieve(DOWNLOAD_URL, msi_path, _progress_hook)
        print()  # newline after progress
        size_mb = os.path.getsize(msi_path) / 1024 / 1024
        print(f"  ✅ הורד: {msi_path} ({size_mb:.1f} MB)")
    except Exception as e:
        print(f"\n  ❌ שגיאת הורדה: {e}")
        print("  נסה להוריד ידנית מ:")
        print("  https://www.opendesign.com/guestfiles/oda_file_converter")
        sys.exit(1)

    # 3. התקנה שקטה
    print("\n  מתקין... (דורש הרשאות מנהל)")
    cmd = ["msiexec", "/i", msi_path, "/quiet", "/norestart", "/l*v",
           os.path.join(tempfile.gettempdir(), "oda_install.log")]
    try:
        result = subprocess.run(cmd, timeout=120)
        if result.returncode not in (0, 3010):  # 3010 = success, reboot needed
            log_path = os.path.join(tempfile.gettempdir(), "oda_install.log")
            print(f"  ⚠️  msiexec החזיר קוד {result.returncode}")
            print(f"     בדוק לוג ב: {log_path}")
        else:
            print("  ✅ ההתקנה הסתיימה בהצלחה")
    except subprocess.TimeoutExpired:
        print("  ❌ ההתקנה לקחה יותר מדי זמן — נסה להתקין ידנית")
        sys.exit(1)
    except Exception as e:
        print(f"  ❌ שגיאת התקנה: {e}")
        sys.exit(1)
    finally:
        try:
            os.unlink(msi_path)
        except Exception:
            pass

    # 4. וידוא
    found = _find_installed()
    if found:
        print(f"\n✅ ODA File Converter מוכן לשימוש:")
        print(f"   {found}")

        # בדיקת הרצה פשוטה
        try:
            r = subprocess.run([found, "--help"], capture_output=True, timeout=10)
            print("   הכלי מגיב תקין ✓")
        except Exception:
            print("   (הכלי מותקן — לא בדקנו --help כי GUI-only)")

        print("\n  🎉 הכל מוכן!")
        print("  הפעל מחדש את serve_ui.py ואז העלה קבצי DWG דרך הממשק.")
    else:
        print("\n  ⚠️  ההתקנה רצה אך הקובץ לא נמצא במיקומים הצפויים.")
        print("  חפש ידנית את ODAFileConverter.exe ועדכן את _ODA_SEARCH_PATHS ב-serve_ui.py")


if __name__ == "__main__":
    main()
