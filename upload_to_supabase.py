"""
upload_to_supabase.py – Upload local SQLite data to Supabase cloud
===================================================================

Reads from local kfar_chabad_documents.db and pushes all data to Supabase.
Skips aerial_images table (as requested).

Usage:
  python upload_to_supabase.py

Requirements:
  pip install httpx
"""

import json
import sqlite3
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("❌ Missing httpx. Run: pip install httpx")
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
DB_PATH = BASE_DIR / "kfar_chabad_documents.db"

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# Tables in order (respecting FK dependencies)
TABLES_TO_UPLOAD = ["gushim", "parcels", "plans", "documents", "plan_georef"]


def get_local_data(table: str) -> list[dict]:
    """Read all rows from a local SQLite table."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def clear_table(client: httpx.Client, table: str):
    """Delete all existing rows from Supabase table."""
    # Use a filter that matches all rows
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=gt.0"
    if table == "gushim":
        url = f"{SUPABASE_URL}/rest/v1/{table}?gush=gt.0"
    resp = client.delete(url, headers=HEADERS)
    if resp.status_code in (200, 204):
        print(f"  🗑️  Cleared existing data from {table}")
    elif resp.status_code == 404:
        print(f"  ⚠️  Table {table} doesn't exist yet – run migration first!")
        return False
    else:
        print(f"  ⚠️  Clear {table}: {resp.status_code} {resp.text[:200]}")
    return True


def upload_table(client: httpx.Client, table: str, rows: list[dict]):
    """Upload rows to Supabase in batches."""
    if not rows:
        print(f"  ℹ️  {table}: no rows to upload")
        return True

    # For plans, documents, plan_georef – remove 'id' to let Supabase auto-generate
    if table in ("parcels", "plans", "documents", "plan_georef"):
        for r in rows:
            r.pop("id", None)

    batch_size = 50
    total = len(rows)
    success_count = 0

    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        url = f"{SUPABASE_URL}/rest/v1/{table}"

        # Upsert for gushim (PK = gush), insert for others
        headers = {**HEADERS}
        if table == "gushim":
            headers["Prefer"] = "return=representation,resolution=merge-duplicates"

        resp = client.post(url, headers=headers, json=batch)

        if resp.status_code in (200, 201):
            success_count += len(batch)
            print(f"  ✅ {table}: {success_count}/{total} rows uploaded")
        else:
            print(f"  ❌ {table} batch error: {resp.status_code}")
            print(f"     {resp.text[:300]}")
            return False

    return True


def main():
    print("=" * 60)
    print("   🚀 Upload Local DB → Supabase Cloud")
    print("=" * 60)
    print(f"\n📦 DB: {DB_PATH}")
    print(f"☁️  Target: {SUPABASE_URL}")
    print()

    if not DB_PATH.exists():
        print("❌ Local database not found!")
        sys.exit(1)

    client = httpx.Client(timeout=30)

    # First, clear tables in reverse order (FK dependencies)
    print("🗑️  Clearing existing cloud data...")
    for table in reversed(TABLES_TO_UPLOAD):
        clear_table(client, table)
    print()

    # Then upload in order
    for table in TABLES_TO_UPLOAD:
        print(f"\n📤 Uploading {table}...")
        rows = get_local_data(table)
        print(f"   Found {len(rows)} rows in local DB")

        if not upload_table(client, table, rows):
            print(f"\n❌ Failed on {table}. Stopping.")
            sys.exit(1)

    print("\n" + "=" * 60)
    print("   ✅ All data uploaded successfully!")
    print("=" * 60)

    # Verify counts
    print("\n📊 Verification:")
    for table in TABLES_TO_UPLOAD:
        local_count = len(get_local_data(table))
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=count"
        headers = {**HEADERS, "Prefer": "count=exact"}
        resp = client.head(url, headers=headers)
        cloud_count = resp.headers.get("content-range", "?/?").split("/")[-1]
        status = "✅" if str(local_count) == cloud_count else "⚠️"
        print(f"  {status} {table}: local={local_count}, cloud={cloud_count}")

    client.close()


if __name__ == "__main__":
    main()
