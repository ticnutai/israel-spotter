"""
upload_files_to_storage.py – Upload all kfar_chabad_data files to Supabase Storage
==================================================================================

Uploads files <=15MB to the 'kfar-chabad-data' bucket.
Preserves directory structure. Skips files already uploaded.

Usage:
  python upload_files_to_storage.py
"""

import mimetypes
import os
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Missing httpx. Run: pip install httpx")
    sys.exit(1)

# ─── Configuration ───────────────────────────────────────────────────────────
SUPABASE_URL = "https://txltujmbkhsszpvsgujs.supabase.co"
SUPABASE_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0."
    "K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw"
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "kfar_chabad_data"
BUCKET = "kfar-chabad-data"
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15MB

STORAGE_URL = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}"


def get_content_type(file_path: Path) -> str:
    """Guess MIME type from file extension."""
    ct, _ = mimetypes.guess_type(str(file_path))
    return ct or "application/octet-stream"


def upload_file(client: httpx.Client, local_path: Path, remote_path: str) -> bool:
    """Upload a single file to Supabase Storage."""
    url = f"{STORAGE_URL}/{remote_path}"
    content_type = get_content_type(local_path)

    with open(local_path, "rb") as f:
        data = f.read()

    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",  # overwrite if exists
    }

    try:
        resp = client.post(url, headers=headers, content=data, timeout=60)
        if resp.status_code in (200, 201):
            return True
        else:
            print(f"  ERR {resp.status_code}: {remote_path} - {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"  ERR: {remote_path} - {e}")
        return False


def main():
    print("=" * 60)
    print("   Upload Files to Supabase Storage")
    print("=" * 60)
    print(f"  Source: {DATA_DIR}")
    print(f"  Bucket: {BUCKET}")
    print(f"  Max size: {MAX_FILE_SIZE // 1024 // 1024}MB")

    if not DATA_DIR.exists():
        print("  Data directory not found!")
        sys.exit(1)

    # Collect all files
    all_files = []
    skipped_big = 0
    total_size = 0

    for f in sorted(DATA_DIR.rglob("*")):
        if f.is_file():
            size = f.stat().st_size
            if size <= MAX_FILE_SIZE:
                rel = f.relative_to(DATA_DIR)
                # Convert Windows path separators to forward slashes for storage
                remote = str(rel).replace("\\", "/")
                all_files.append((f, remote, size))
                total_size += size
            else:
                skipped_big += 1

    print(f"  Files to upload: {len(all_files)}")
    print(f"  Total size: {total_size / 1024 / 1024:.1f} MB")
    print(f"  Skipped (>15MB): {skipped_big}")
    print()

    client = httpx.Client(timeout=60)

    uploaded = 0
    failed = 0
    uploaded_size = 0
    start_time = time.time()

    for i, (local, remote, size) in enumerate(all_files):
        if upload_file(client, local, remote):
            uploaded += 1
            uploaded_size += size
        else:
            failed += 1

        # Progress every 50 files
        if (i + 1) % 50 == 0 or i == len(all_files) - 1:
            elapsed = time.time() - start_time
            pct = (i + 1) / len(all_files) * 100
            mb_done = uploaded_size / 1024 / 1024
            rate = mb_done / elapsed * 60 if elapsed > 0 else 0
            eta_min = (total_size - uploaded_size) / 1024 / 1024 / rate if rate > 0 else 0
            print(f"  [{pct:5.1f}%] {uploaded}/{len(all_files)} files"
                  f" ({mb_done:.0f}MB) {rate:.1f}MB/min"
                  f" ETA={eta_min:.0f}min  failed={failed}")

    client.close()

    elapsed = time.time() - start_time
    print()
    print("=" * 60)
    print(f"  Uploaded: {uploaded}/{len(all_files)} files")
    print(f"  Failed: {failed}")
    print(f"  Size: {uploaded_size / 1024 / 1024:.1f} MB")
    print(f"  Time: {elapsed / 60:.1f} minutes")
    print("=" * 60)


if __name__ == "__main__":
    main()
