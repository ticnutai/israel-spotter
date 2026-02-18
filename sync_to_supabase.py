"""
sync_to_supabase.py – Full sync: local SQLite → Supabase cloud
================================================================

1. Runs migration SQL via Edge Function (run-sql) to create/alter tables
2. Clears existing cloud data
3. Uploads ALL data from local SQLite

Usage:
  python sync_to_supabase.py

Requirements:
  pip install httpx
"""

import json
import sqlite3
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
DB_PATH = BASE_DIR / "kfar_chabad_documents.db"
MIGRATION_SQL = BASE_DIR / "supabase" / "migrations" / "002_enrich_tables.sql"

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# Tables in dependency order (FK-safe)
TABLES_ORDER = [
    "gushim",
    "parcels",
    "plans",
    "plan_blocks",
    "documents",
    "permits",
    "permit_documents",
    "taba_outlines",
    "plan_georef",
]


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_local_data(table: str) -> list[dict]:
    """Read all rows from local SQLite table."""
    conn = get_db()
    rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        # Convert None values to None (JSON null) - this is default
        # But ensure no Python-specific types leak through
        for k, v in d.items():
            if isinstance(v, bytes):
                d[k] = v.decode("utf-8", errors="replace")
        result.append(d)
    return result


# ─── Step 1: Run Migration ──────────────────────────────────────────────────

def run_migration(client: httpx.Client) -> bool:
    """Execute migration SQL via the run-sql Edge Function."""
    print("\n" + "=" * 60)
    print("   Step 1: Running Migration SQL")
    print("=" * 60)

    if not MIGRATION_SQL.exists():
        print(f"  Migration file not found: {MIGRATION_SQL}")
        return False

    sql = MIGRATION_SQL.read_text(encoding="utf-8")
    print(f"  SQL file: {MIGRATION_SQL.name} ({len(sql)} chars)")

    url = f"{SUPABASE_URL}/functions/v1/run-sql"
    resp = client.post(
        url,
        json={"sql": sql},
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        },
        timeout=60,
    )

    if resp.status_code != 200:
        print(f"  Edge Function error: {resp.status_code}")
        print(f"  {resp.text[:500]}")
        return False

    data = resp.json()
    summary = data.get("summary", {})
    print(f"  Executed {summary.get('total', 0)} statements")
    print(f"  Succeeded: {summary.get('succeeded', 0)}")
    print(f"  Failed: {summary.get('failed', 0)}")

    # Show failures
    for r in data.get("results", []):
        if not r.get("success"):
            stmt = r.get("statement", "")[:100]
            err = r.get("error", "")
            # Skip "already exists" errors - they're fine for idempotent migrations
            if "already exists" in err.lower():
                continue
            print(f"  WARN: {stmt}... -> {err}")

    return True


# ─── Step 2: Clear Cloud Data ───────────────────────────────────────────────

def clear_table(client: httpx.Client, table: str) -> bool:
    """Delete all existing rows from a Supabase table."""
    # Use a filter that matches everything
    if table == "gushim":
        url = f"{SUPABASE_URL}/rest/v1/{table}?gush=gte.0"
    else:
        url = f"{SUPABASE_URL}/rest/v1/{table}?id=gte.0"

    # Need delete headers
    headers = {**HEADERS}
    headers["Prefer"] = "return=minimal"

    resp = client.delete(url, headers=headers)
    if resp.status_code in (200, 204):
        print(f"  Cleared {table}")
        return True
    elif resp.status_code == 404:
        print(f"  Table {table} not found (will be created by migration)")
        return True
    else:
        print(f"  Clear {table}: {resp.status_code} - {resp.text[:200]}")
        # Continue anyway
        return True


def clear_all_data(client: httpx.Client):
    """Clear all cloud data in reverse FK order."""
    print("\n" + "=" * 60)
    print("   Step 2: Clearing Existing Cloud Data")
    print("=" * 60)

    for table in reversed(TABLES_ORDER):
        clear_table(client, table)
    print("  Done clearing.")


# ─── Step 3: Upload Data ────────────────────────────────────────────────────

def upload_table(client: httpx.Client, table: str, rows: list[dict]) -> bool:
    """Upload rows to Supabase in batches."""
    if not rows:
        print(f"  {table}: no rows to upload")
        return True

    # Remove 'id' for auto-increment tables (let Supabase generate)
    auto_id_tables = {"parcels", "plans", "plan_blocks", "documents",
                      "permits", "permit_documents", "taba_outlines", "plan_georef"}

    if table in auto_id_tables:
        for r in rows:
            r.pop("id", None)

    # For permit_documents, we need to map the local permit_id (integer FK)
    # to the new Supabase permit_id. We'll handle this separately.

    batch_size = 50
    total = len(rows)
    success_count = 0

    for i in range(0, total, batch_size):
        batch = rows[i: i + batch_size]
        url = f"{SUPABASE_URL}/rest/v1/{table}"

        headers = {**HEADERS}
        # Use upsert mode for tables with natural keys
        if table == "gushim":
            headers["Prefer"] = "return=representation,resolution=merge-duplicates"
        elif table == "parcels":
            headers["Prefer"] = "return=representation,resolution=merge-duplicates"
            # parcels has UNIQUE(gush, helka)
        elif table == "plans":
            headers["Prefer"] = "return=representation,resolution=merge-duplicates"
            # plans has UNIQUE(plan_number)
        elif table == "plan_blocks":
            headers["Prefer"] = "return=representation,resolution=merge-duplicates"
            # plan_blocks has UNIQUE(plan_number, gush, helka)
        else:
            headers["Prefer"] = "return=representation"

        resp = client.post(url, headers=headers, json=batch)

        if resp.status_code in (200, 201):
            success_count += len(batch)
            pct = int(success_count / total * 100)
            print(f"  {table}: {success_count}/{total} ({pct}%)", end="\r")
        else:
            print(f"\n  ERROR {table} batch {i}: {resp.status_code}")
            err_text = resp.text[:500]
            print(f"  {err_text}")
            # Try individual inserts for the failed batch
            for row in batch:
                resp2 = client.post(url, headers=headers, json=[row])
                if resp2.status_code in (200, 201):
                    success_count += 1
                else:
                    # Log but continue
                    print(f"  Skip row: {resp2.text[:200]}")

    print(f"  {table}: {success_count}/{total} rows uploaded")
    return success_count > 0 or total == 0


def upload_all_data(client: httpx.Client):
    """Upload all tables from local SQLite to Supabase."""
    print("\n" + "=" * 60)
    print("   Step 3: Uploading Data")
    print("=" * 60)

    # We need special handling for permit_documents because the
    # permit_id FK references the Supabase-generated permits.id
    # Strategy: Upload permits first, then map IDs for permit_documents

    for table in TABLES_ORDER:
        if table == "permit_documents":
            continue  # Handle separately after permits
        print(f"\n  Uploading {table}...")
        rows = get_local_data(table)
        print(f"  Found {len(rows)} rows in local DB")
        upload_table(client, table, rows)

    # Now handle permit_documents with ID mapping
    print(f"\n  Uploading permit_documents (with FK mapping)...")
    upload_permit_documents(client)


def upload_permit_documents(client: httpx.Client):
    """Upload permit_documents with proper FK mapping."""
    conn = get_db()

    # Get local permit_documents with their parent permit info
    local_docs = conn.execute("""
        SELECT pd.*, p.gush, p.helka, p.permit_id as parent_permit_id
        FROM permit_documents pd
        JOIN permits p ON pd.permit_id = p.id
    """).fetchall()
    conn.close()

    if not local_docs:
        print("  permit_documents: no rows to upload")
        return

    # Get the Supabase permits to find the new IDs
    resp = client.get(
        f"{SUPABASE_URL}/rest/v1/permits?select=id,gush,helka,permit_id",
        headers=HEADERS,
    )
    if resp.status_code != 200:
        print(f"  ERROR: Cannot fetch Supabase permits: {resp.status_code}")
        return

    cloud_permits = resp.json()
    # Build mapping: (gush, helka, permit_id) -> cloud id
    permit_map = {}
    for p in cloud_permits:
        key = (p["gush"], p["helka"], p["permit_id"])
        permit_map[key] = p["id"]

    rows = []
    for doc in local_docs:
        d = dict(doc)
        lookup_key = (d["gush"], d["helka"], d["parent_permit_id"])
        cloud_permit_id = permit_map.get(lookup_key)
        if cloud_permit_id is None:
            continue  # Skip if parent permit not found in cloud
        rows.append({
            "permit_id": cloud_permit_id,
            "file_name": d["file_name"],
            "file_path": d["file_path"],
            "file_size": d.get("file_size", 0),
            "file_type": d.get("file_type"),
        })

    print(f"  Found {len(rows)} permit documents to upload")
    upload_table(client, "permit_documents", rows)


# ─── Step 4: Verify ─────────────────────────────────────────────────────────

def verify(client: httpx.Client):
    """Compare local vs cloud row counts."""
    print("\n" + "=" * 60)
    print("   Step 4: Verification")
    print("=" * 60)

    conn = get_db()
    all_ok = True

    for table in TABLES_ORDER:
        local_count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

        resp = client.head(
            f"{SUPABASE_URL}/rest/v1/{table}?select=*",
            headers={**HEADERS, "Prefer": "count=exact"},
        )
        range_header = resp.headers.get("content-range", "?/?")
        cloud_count_str = range_header.split("/")[-1]
        try:
            cloud_count = int(cloud_count_str)
        except ValueError:
            cloud_count = -1

        match = cloud_count == local_count
        icon = "OK" if match else "!!"
        print(f"  [{icon}] {table:20s}  local={local_count:>5}  cloud={cloud_count:>5}")
        if not match:
            all_ok = False

    conn.close()

    if all_ok:
        print("\n  All tables match!")
    else:
        print("\n  Some tables have mismatched counts - check above.")

    return all_ok


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("   Sync Local SQLite -> Supabase Cloud")
    print("=" * 60)
    print(f"  DB: {DB_PATH}")
    print(f"  Target: {SUPABASE_URL}")

    if not DB_PATH.exists():
        print("  Local database not found!")
        sys.exit(1)

    client = httpx.Client(timeout=30)

    # Step 1: Run migration
    if not run_migration(client):
        print("\n  Migration failed. You can also run the SQL manually")
        print("  in Supabase Dashboard -> SQL Editor.")
        print(f"  File: {MIGRATION_SQL}")
        # Continue anyway - tables might already exist

    time.sleep(1)

    # Step 2: Clear existing data
    clear_all_data(client)

    time.sleep(1)

    # Step 3: Upload all data
    upload_all_data(client)

    time.sleep(2)

    # Step 4: Verify
    verify(client)

    client.close()
    print("\n  Done!")


if __name__ == "__main__":
    main()
