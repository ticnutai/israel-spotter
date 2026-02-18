"""
migrate_db.py – Build comprehensive kfar_chabad_documents.db
============================================================

Deletes existing DB and rebuilds from scratch by scanning the filesystem.

Schema:
  • gushim          – Kfar Chabad gush blocks with metadata
  • parcels         – Gush/helka combinations with doc counts
  • plans           – Unique plan numbers with metadata
  • documents       – All downloaded files (plans + permits)
  • aerial_images   – Stitched aerial year/level imagery with georef
  • plan_georef     – Georeferencing data for plan images

Directory structure:
  plans/{gush}_{helka}/{plan_name_underscored}/{file}
  permits/{gush}_{helka}/{permit_number}/{file}
  aerial/{year}/level_{n}/tile_*

Run:  python migrate_db.py
"""

import json
import os
import re
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "kfar_chabad_documents.db"
PLANS_DIR = BASE_DIR / "kfar_chabad_data" / "plans"
PERMITS_DIR = BASE_DIR / "kfar_chabad_data" / "permits"
AERIAL_DIR = BASE_DIR / "gis_downloads" / "aerial"

KFAR_CHABAD_GUSHIM = [6256, 6258, 6260, 6261, 6262, 6269, 6272, 6280, 7187, 7188, 7196, 7311]

# Only index actual document files
DOC_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".tif", ".dwfx"}

SCHEMA_SQL = """
CREATE TABLE gushim (
    gush INTEGER PRIMARY KEY,
    name TEXT,
    area_type TEXT DEFAULT 'unknown',
    plan_count INTEGER DEFAULT 0,
    permit_count INTEGER DEFAULT 0,
    parcel_count INTEGER DEFAULT 0,
    notes TEXT
);

CREATE TABLE parcels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gush INTEGER NOT NULL REFERENCES gushim(gush),
    helka INTEGER NOT NULL,
    plan_count INTEGER DEFAULT 0,
    permit_count INTEGER DEFAULT 0,
    doc_count INTEGER DEFAULT 0,
    has_tashrit INTEGER DEFAULT 0,
    notes TEXT,
    UNIQUE(gush, helka)
);

CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_number TEXT NOT NULL UNIQUE,
    plan_name TEXT,
    status TEXT,
    plan_type TEXT,
    doc_count INTEGER DEFAULT 0,
    gush_list TEXT,
    notes TEXT
);

CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gush INTEGER NOT NULL,
    helka INTEGER NOT NULL,
    plan_number TEXT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    file_name TEXT,
    file_size INTEGER DEFAULT 0,
    file_type TEXT,
    category TEXT NOT NULL,
    is_tashrit INTEGER DEFAULT 0,
    is_georef INTEGER DEFAULT 0,
    downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gush) REFERENCES gushim(gush)
);

CREATE TABLE aerial_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year TEXT NOT NULL,
    level INTEGER NOT NULL,
    tile_count INTEGER DEFAULT 0,
    stitched_path TEXT,
    stitched_size INTEGER DEFAULT 0,
    pixel_size_x REAL,
    pixel_size_y REAL,
    origin_x REAL,
    origin_y REAL,
    crs TEXT DEFAULT 'EPSG:2039',
    UNIQUE(year, level)
);

CREATE TABLE plan_georef (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER REFERENCES documents(id),
    image_path TEXT NOT NULL,
    pixel_size_x REAL,
    pixel_size_y REAL,
    origin_x REAL,
    origin_y REAL,
    bbox_min_x REAL,
    bbox_min_y REAL,
    bbox_max_x REAL,
    bbox_max_y REAL,
    crs TEXT DEFAULT 'EPSG:2039',
    method TEXT DEFAULT 'estimated',
    notes TEXT
);

CREATE INDEX idx_documents_gush ON documents(gush);
CREATE INDEX idx_documents_gush_helka ON documents(gush, helka);
CREATE INDEX idx_documents_plan ON documents(plan_number);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_parcels_gush ON parcels(gush);
"""


# ────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────

_GUSH_HELKA_RE = re.compile(r"^(\d+)_(\d+)$")  # e.g. "6256_21"


def _parse_gush_helka(dirname: str):
    """Return (gush, helka) ints from a dir name like '6256_21', or None."""
    m = _GUSH_HELKA_RE.match(dirname)
    if m:
        return int(m.group(1)), int(m.group(2))
    return None


def _file_type(ext: str) -> str:
    if ext in (".jpg", ".jpeg", ".png", ".tif"):
        return "image"
    if ext == ".pdf":
        return "pdf"
    if ext == ".dwfx":
        return "dwfx"
    return "other"


def _is_georefable(fpath: Path) -> bool:
    """True if a world-file companion (.jgw/.pgw) exists."""
    return fpath.with_suffix(".jgw").exists() or fpath.with_suffix(".pgw").exists()


# ────────────────────────────────────────────────────────────────
# Scan documents
# ────────────────────────────────────────────────────────────────

def _scan_documents(data_dir: Path, category: str):
    """
    Yield dicts for every document file found under data_dir.

    Expected layout:
        data_dir / {gush}_{helka} / {plan_or_permit_number} / {file}
    """
    if not data_dir or not data_dir.exists():
        return

    for gh_dir in sorted(data_dir.iterdir()):
        if not gh_dir.is_dir():
            continue
        parsed = _parse_gush_helka(gh_dir.name)
        if not parsed:
            continue
        gush, helka = parsed

        for plan_dir in sorted(gh_dir.iterdir()):
            if not plan_dir.is_dir():
                continue
            # Convert underscore dir name back to plan number with slashes
            plan_number = plan_dir.name.replace("_", "/")

            for fpath in sorted(plan_dir.iterdir()):
                if not fpath.is_file():
                    continue
                ext = fpath.suffix.lower()
                if ext not in DOC_EXTENSIONS:
                    continue

                rel_path = "./" + str(fpath.relative_to(BASE_DIR)).replace("\\", "/")
                fname = fpath.name
                title = fpath.stem  # filename without extension
                fsize = fpath.stat().st_size
                ftype = _file_type(ext)
                is_tash = 1 if "תשריט" in fname else 0
                is_geo = 1 if _is_georefable(fpath) or "_georef" in fname else 0

                yield {
                    "gush": gush,
                    "helka": helka,
                    "plan_number": plan_number,
                    "title": title,
                    "file_path": rel_path,
                    "file_name": fname,
                    "file_size": fsize,
                    "file_type": ftype,
                    "category": category,
                    "is_tashrit": is_tash,
                    "is_georef": is_geo,
                }


# ────────────────────────────────────────────────────────────────
# Aerial & georef
# ────────────────────────────────────────────────────────────────

def _scan_aerial(conn):
    """Populate aerial_images from gis_downloads/aerial."""
    if not AERIAL_DIR.exists():
        return
    for year_dir in sorted(AERIAL_DIR.iterdir()):
        if not year_dir.is_dir():
            continue
        for level_dir in year_dir.iterdir():
            if not level_dir.is_dir() or not level_dir.name.startswith("level_"):
                continue
            try:
                level = int(level_dir.name.split("_")[1])
            except (IndexError, ValueError):
                continue

            tile_count = len(list(level_dir.glob("tile_*")))

            stitched_path = None
            stitched_size = 0
            for ext in [".jpg", ".png"]:
                sf = year_dir / f"aerial_level_{level}{ext}"
                if sf.exists():
                    stitched_path = str(sf.relative_to(AERIAL_DIR))
                    stitched_size = sf.stat().st_size
                    break

            px_x = px_y = ox = oy = None
            for wf_ext in [".jgw", ".pgw"]:
                wf = year_dir / f"aerial_level_{level}{wf_ext}"
                if wf.exists():
                    lines = wf.read_text().strip().split("\n")
                    if len(lines) >= 6:
                        px_x = float(lines[0])
                        px_y = float(lines[3])
                        ox = float(lines[4])
                        oy = float(lines[5])
                    break

            conn.execute(
                "INSERT OR REPLACE INTO aerial_images "
                "(year, level, tile_count, stitched_path, stitched_size, "
                "pixel_size_x, pixel_size_y, origin_x, origin_y) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (year_dir.name, level, tile_count, stitched_path, stitched_size,
                 px_x, px_y, ox, oy),
            )


def _scan_georef(conn):
    """Populate plan_georef from georef_config.json."""
    georef_config = PLANS_DIR / "georef_config.json"
    if not georef_config.exists():
        return
    with open(georef_config, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    for p in cfg.get("plans", []):
        img_path = p.get("image", "")
        bbox = p.get("bbox", [0, 0, 0, 0])
        px = p.get("pixel_size_m", 0)

        # Try to find matching document by path
        doc_id = None
        row = conn.execute(
            "SELECT id FROM documents WHERE file_path LIKE ? LIMIT 1",
            (f"%{os.path.basename(img_path)}%",),
        ).fetchone()
        if row:
            doc_id = row[0]

        conn.execute(
            "INSERT INTO plan_georef (document_id, image_path, pixel_size_x, pixel_size_y, "
            "origin_x, origin_y, bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y, method) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (doc_id, img_path, px, -px,
             bbox[0] if len(bbox) > 0 else 0,
             bbox[3] if len(bbox) > 3 else 0,
             bbox[0] if len(bbox) > 0 else 0,
             bbox[1] if len(bbox) > 1 else 0,
             bbox[2] if len(bbox) > 2 else 0,
             bbox[3] if len(bbox) > 3 else 0,
             "estimated"),
        )


# ────────────────────────────────────────────────────────────────
# Update computed tables (parcels, plans, gush counts)
# ────────────────────────────────────────────────────────────────

def _update_aggregates(conn):
    """Rebuild parcels, plans, and gush counts from documents table."""
    # Parcels
    conn.execute("DELETE FROM parcels")
    conn.execute("""
        INSERT INTO parcels (gush, helka, plan_count, permit_count, doc_count, has_tashrit)
        SELECT gush, helka,
            SUM(CASE WHEN category='plans' THEN 1 ELSE 0 END),
            SUM(CASE WHEN category='permits' THEN 1 ELSE 0 END),
            COUNT(*),
            MAX(is_tashrit)
        FROM documents
        GROUP BY gush, helka
    """)

    # Also register parcel dirs that have no docs yet
    for data_dir in [PLANS_DIR, PERMITS_DIR]:
        if not data_dir or not data_dir.exists():
            continue
        for d in data_dir.iterdir():
            if not d.is_dir():
                continue
            parsed = _parse_gush_helka(d.name)
            if not parsed:
                continue
            gush, helka = parsed
            conn.execute("INSERT OR IGNORE INTO gushim (gush, name) VALUES (?, ?)",
                         (gush, f"גוש {gush}"))
            conn.execute("INSERT OR IGNORE INTO parcels (gush, helka) VALUES (?, ?)",
                         (gush, helka))

    parcels_count = conn.execute("SELECT COUNT(*) FROM parcels").fetchone()[0]
    print(f"  {parcels_count} parcels")

    # Plans
    conn.execute("DELETE FROM plans")
    for row in conn.execute(
        "SELECT plan_number, COUNT(*) c, GROUP_CONCAT(DISTINCT gush) gushim "
        "FROM documents WHERE plan_number IS NOT NULL GROUP BY plan_number"
    ):
        conn.execute(
            "INSERT INTO plans (plan_number, doc_count, gush_list) VALUES (?, ?, ?)",
            (row[0], row[1], row[2]),
        )
    plans_count = conn.execute("SELECT COUNT(*) FROM plans").fetchone()[0]
    print(f"  {plans_count} unique plans")

    # Gush counts
    conn.execute("""
        UPDATE gushim SET
            plan_count  = (SELECT COUNT(*) FROM documents WHERE documents.gush = gushim.gush AND category='plans'),
            permit_count = (SELECT COUNT(*) FROM documents WHERE documents.gush = gushim.gush AND category='permits'),
            parcel_count = (SELECT COUNT(*) FROM parcels WHERE parcels.gush = gushim.gush)
    """)


# ────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────

def migrate():
    # Remove old DB and start clean
    if DB_PATH.exists():
        os.remove(str(DB_PATH))
        print("Removed old database")

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    # Create schema
    conn.executescript(SCHEMA_SQL)
    print("Created schema (6 tables)")

    # Insert known gushim
    for g in KFAR_CHABAD_GUSHIM:
        conn.execute("INSERT INTO gushim (gush, name) VALUES (?, ?)", (g, f"גוש {g}"))
    print(f"Inserted {len(KFAR_CHABAD_GUSHIM)} gushim")

    # Scan and insert documents
    doc_count = 0
    for category, data_dir in [("plans", PLANS_DIR), ("permits", PERMITS_DIR)]:
        cat_count = 0
        for doc in _scan_documents(data_dir, category):
            conn.execute(
                "INSERT INTO documents (gush, helka, plan_number, title, file_path, "
                "file_name, file_size, file_type, category, is_tashrit, is_georef) "
                "VALUES (:gush, :helka, :plan_number, :title, :file_path, "
                ":file_name, :file_size, :file_type, :category, :is_tashrit, :is_georef)",
                doc,
            )
            cat_count += 1
        doc_count += cat_count
        print(f"  {category}: {cat_count} documents")
    print(f"Total documents: {doc_count}")

    # Aerial images
    _scan_aerial(conn)
    aerial_count = conn.execute("SELECT COUNT(*) FROM aerial_images").fetchone()[0]
    print(f"Aerial images: {aerial_count}")

    # Georef
    _scan_georef(conn)
    georef_count = conn.execute("SELECT COUNT(*) FROM plan_georef").fetchone()[0]
    print(f"Georef entries: {georef_count}")

    # Aggregates
    print("Computing aggregates...")
    _update_aggregates(conn)

    conn.commit()

    # Summary
    print("\n=== Database summary ===")
    for t in ["gushim", "parcels", "plans", "documents", "aerial_images", "plan_georef"]:
        c = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {c} rows")

    conn.close()
    print("Done.")


if __name__ == "__main__":
    migrate()
