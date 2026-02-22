"""
upload_files_to_storage.py – Resumable background uploader to Supabase Storage
===============================================================================
Uploads all files from kfar_chabad_data/ (<=15MB) to Supabase Storage bucket.
Saves progress to a JSON file so it can resume if interrupted.

Usage:
  python scripts/upload_files_to_storage.py          # upload all
  python scripts/upload_files_to_storage.py --reset   # reset progress & start fresh
"""

import json
import mimetypes
import os
import sys
import time
import hashlib
import urllib.parse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

# ─── Config ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "kfar_chabad_data"
PROGRESS_FILE = BASE_DIR / "upload_progress.json"
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
BUCKET = "kfar-chabad-data"
WORKERS = 3  # concurrent uploads
RETRY_MAX = 3

SUPABASE_URL = "https://txltujmbkhsszpvsgujs.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0."
    "K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw"
)

STORAGE_URL = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"
HEADERS_BASE = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
}

# ─── Progress tracking ──────────────────────────────────────────────────────

def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
    return {"uploaded": {}, "failed": {}, "started_at": None}

def save_progress(progress):
    PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")

# ─── Scan files ──────────────────────────────────────────────────────────────

def scan_files():
    """Find all files <= 15MB under kfar_chabad_data/"""
    files = []
    for root, _, fnames in os.walk(DATA_DIR):
        for f in fnames:
            fp = Path(root) / f
            sz = fp.stat().st_size
            if sz <= MAX_FILE_SIZE and sz > 0:
                rel = fp.relative_to(BASE_DIR).as_posix()
                files.append({"path": str(fp), "rel": rel, "size": sz})
    return files

# ─── Upload one file ────────────────────────────────────────────────────────

def upload_file(file_info):
    """Upload a single file to Supabase Storage. Returns (rel_path, success, error)"""
    rel = file_info["rel"]
    local_path = file_info["path"]
    
    # Storage path: URL-encode each segment for Hebrew & special chars
    segments = rel.replace("\\", "/").split("/")
    storage_path = "/".join(urllib.parse.quote(seg, safe="") for seg in segments)
    
    # Determine content type
    mime, _ = mimetypes.guess_type(local_path)
    if not mime:
        mime = "application/octet-stream"
    
    headers = {
        **HEADERS_BASE,
        "Content-Type": mime,
        "x-upsert": "true",  # overwrite if exists
    }
    
    url = f"{STORAGE_URL}/{storage_path}"
    
    for attempt in range(1, RETRY_MAX + 1):
        try:
            with open(local_path, "rb") as f:
                resp = requests.post(url, headers=headers, data=f, timeout=120)
            
            if resp.status_code in (200, 201):
                return (rel, True, None)
            elif resp.status_code == 409:
                # Already exists
                return (rel, True, None)
            else:
                error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                if attempt < RETRY_MAX:
                    time.sleep(2 ** attempt)
                    continue
                return (rel, False, error)
        except Exception as e:
            error = str(e)
            if attempt < RETRY_MAX:
                time.sleep(2 ** attempt)
                continue
            return (rel, False, error)
    
    return (rel, False, "max retries exceeded")

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    reset = "--reset" in sys.argv
    
    print("=" * 60)
    print("   Supabase Storage Uploader (Resumable)")
    print("=" * 60)
    print(f"  Bucket: {BUCKET}")
    print(f"  Source: {DATA_DIR}")
    print(f"  Max file size: {MAX_FILE_SIZE // (1024*1024)} MB")
    print(f"  Workers: {WORKERS}")
    print()
    
    # Load or reset progress
    if reset and PROGRESS_FILE.exists():
        PROGRESS_FILE.unlink()
        print("  Progress reset.")
    
    progress = load_progress()
    uploaded_set = set(progress.get("uploaded", {}).keys())
    
    # Scan files
    print("  Scanning files...")
    all_files = scan_files()
    total_count = len(all_files)
    total_size = sum(f["size"] for f in all_files)
    
    # Filter out already uploaded
    pending = [f for f in all_files if f["rel"] not in uploaded_set]
    pending_size = sum(f["size"] for f in pending)
    
    print(f"  Total files: {total_count}")
    print(f"  Already uploaded: {len(uploaded_set)}")
    print(f"  Pending: {len(pending)}")
    print(f"  Pending size: {pending_size / (1024*1024):.1f} MB")
    print()
    
    if not pending:
        print("  Nothing to upload!")
        return
    
    if not progress.get("started_at"):
        progress["started_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    
    # Upload with thread pool
    success_count = len(uploaded_set)
    fail_count = 0
    bytes_done = sum(progress["uploaded"].get(k, {}).get("size", 0) for k in uploaded_set)
    start_time = time.time()
    
    print(f"  Starting upload...")
    print("-" * 60)
    
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(upload_file, f): f for f in pending}
        
        for i, future in enumerate(as_completed(futures), 1):
            file_info = futures[future]
            rel, ok, error = future.result()
            
            if ok:
                success_count += 1
                bytes_done += file_info["size"]
                progress["uploaded"][rel] = {
                    "size": file_info["size"],
                    "at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                # Remove from failed if was there
                progress["failed"].pop(rel, None)
            else:
                fail_count += 1
                progress["failed"][rel] = {
                    "error": error,
                    "at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            
            # Save progress every 10 files
            if i % 10 == 0 or i == len(pending):
                save_progress(progress)
                elapsed = time.time() - start_time
                rate = bytes_done / elapsed if elapsed > 0 else 0
                eta = (total_size - bytes_done) / rate if rate > 0 else 0
                pct = (success_count / total_count) * 100
                print(
                    f"  [{i}/{len(pending)}] "
                    f"{pct:.0f}% ({success_count}/{total_count}) "
                    f"| {bytes_done/(1024*1024):.0f}/{total_size/(1024*1024):.0f} MB "
                    f"| {rate/(1024*1024):.1f} MB/s "
                    f"| ETA {eta/60:.0f}m "
                    f"| fails: {fail_count}"
                )
    
    # Final save
    progress["last_run"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_progress(progress)
    
    print()
    print("=" * 60)
    print(f"   Upload complete!")
    print(f"   Uploaded: {success_count}/{total_count}")
    print(f"   Failed: {fail_count}")
    if fail_count > 0:
        print(f"   Run again to retry failed uploads.")
    print("=" * 60)

if __name__ == "__main__":
    main()
