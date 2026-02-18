"""
backend/import_all_data.py – Import ALL Kfar Chabad data into SQLite
=====================================================================

Categories:
  1. Parcels (חלקות)     – 778 parcels with area, status, location from JSON
  2. Plans (תוכניות)     – 71 plans from all_plans_by_block.json + _plan_data.json
  3. Documents (מסמכים)  – ~780 files from docs/ folders
  4. Permits (היתרים)    – from permits/ folders
  5. TABA Outlines (קווי תב"ע) – 25 planning polygons from GeoJSON
  6. Aerial Photos (תצ"א) – 10 years of aerial imagery
  7. Plan-Block linkage  – which plans cover which gush/helka

Run:
  cd backend
  python import_all_data.py
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "kfar_chabad_data"
GIS_DIR = BASE_DIR / "gis_downloads"
AERIAL_DIR = GIS_DIR / "aerial"
DB_PATH = BASE_DIR / "kfar_chabad_documents.db"

KFAR_CHABAD_GUSHIM = [6256, 6258, 6260, 6261, 6262, 6269, 6272, 6280, 7187, 7188, 7196, 7311]


def log(msg: str):
    print(f"  → {msg}")


def create_schema(conn: sqlite3.Connection):
    """Create/extend all tables with proper schema."""
    print("\n═══ Creating/extending schema ═══")

    conn.executescript("""
    -- Gushim (blocks) ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS gushim (
        gush INTEGER PRIMARY KEY,
        name TEXT,
        area_type TEXT DEFAULT 'unknown',
        plan_count INTEGER DEFAULT 0,
        permit_count INTEGER DEFAULT 0,
        parcel_count INTEGER DEFAULT 0,
        notes TEXT
    );

    -- Parcels (extended with cadastral data) ──────────────────
    CREATE TABLE IF NOT EXISTS parcels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gush INTEGER NOT NULL REFERENCES gushim(gush),
        helka INTEGER NOT NULL,
        legal_area_sqm REAL,
        shape_area_sqm REAL,
        status_code INTEGER,
        status_text TEXT,
        locality_code INTEGER,
        municipality_code INTEGER,
        municipality TEXT,
        county_code INTEGER,
        county TEXT,
        region_code INTEGER,
        region TEXT,
        gush_suffix TEXT,
        centroid_lat REAL,
        centroid_lng REAL,
        update_date TEXT,
        plan_count INTEGER DEFAULT 0,
        permit_count INTEGER DEFAULT 0,
        doc_count INTEGER DEFAULT 0,
        has_tashrit INTEGER DEFAULT 0,
        notes TEXT,
        UNIQUE(gush, helka)
    );

    -- Plans (extended with iplan metadata) ────────────────────
    CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_number TEXT NOT NULL UNIQUE,
        plan_name TEXT,
        entity_type TEXT,
        entity_subtype TEXT,
        authority TEXT,
        status TEXT,
        main_status TEXT,
        status_date TEXT,
        phase TEXT,
        area_dunam REAL,
        goals TEXT,
        location_desc TEXT,
        district TEXT,
        plan_area TEXT,
        jurisdiction TEXT,
        city_county TEXT,
        street TEXT,
        house_number TEXT,
        mp_id REAL,
        plan_id REAL,
        doc_count INTEGER DEFAULT 0,
        gush_list TEXT,
        has_plan_data INTEGER DEFAULT 0,
        data_json_path TEXT,
        plan_type TEXT,
        notes TEXT
    );

    -- Plan ↔ Block linkage (many-to-many) ─────────────────────
    CREATE TABLE IF NOT EXISTS plan_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_number TEXT NOT NULL,
        gush INTEGER NOT NULL,
        helka INTEGER,
        block_type TEXT,
        is_partial INTEGER DEFAULT 0,
        UNIQUE(plan_number, gush, helka)
    );

    -- Documents (plan files: PDFs, DWGs, KMLs...) ─────────────
    CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gush INTEGER,
        helka INTEGER,
        plan_number TEXT,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT,
        file_size INTEGER DEFAULT 0,
        file_type TEXT,
        category TEXT NOT NULL DEFAULT 'plans',
        subcategory TEXT,
        is_tashrit INTEGER DEFAULT 0,
        is_takanon INTEGER DEFAULT 0,
        is_georef INTEGER DEFAULT 0,
        doc_date TEXT,
        downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (gush) REFERENCES gushim(gush)
    );

    -- Permits ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS permits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gush INTEGER NOT NULL,
        helka INTEGER NOT NULL,
        permit_id TEXT NOT NULL,
        file_count INTEGER DEFAULT 0,
        UNIQUE(gush, helka, permit_id)
    );

    -- Permit documents ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS permit_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        permit_id INTEGER NOT NULL REFERENCES permits(id),
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        file_type TEXT,
        UNIQUE(file_path)
    );

    -- TABA planning outlines ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS taba_outlines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pl_number TEXT,
        pl_name TEXT,
        entity_subtype TEXT,
        status TEXT,
        area_dunam REAL,
        land_use TEXT,
        district TEXT,
        jurisdiction TEXT,
        plan_county TEXT,
        mp_id REAL,
        objectid INTEGER,
        pl_url TEXT,
        depositing_date TEXT,
        last_update TEXT,
        geometry_json TEXT,
        properties_json TEXT
    );

    -- Aerial images ───────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS aerial_images (
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

    -- Plan georef ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS plan_georef (
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
    """)

    # Add new columns to existing tables (safe ALTER TABLE)
    new_columns = {
        "parcels": [
            ("legal_area_sqm", "REAL"),
            ("shape_area_sqm", "REAL"),
            ("status_code", "INTEGER"),
            ("status_text", "TEXT"),
            ("locality_code", "INTEGER"),
            ("municipality_code", "INTEGER"),
            ("municipality", "TEXT"),
            ("county_code", "INTEGER"),
            ("county", "TEXT"),
            ("region_code", "INTEGER"),
            ("region", "TEXT"),
            ("gush_suffix", "TEXT"),
            ("centroid_lat", "REAL"),
            ("centroid_lng", "REAL"),
            ("update_date", "TEXT"),
        ],
        "plans": [
            ("entity_type", "TEXT"),
            ("entity_subtype", "TEXT"),
            ("authority", "TEXT"),
            ("main_status", "TEXT"),
            ("status_date", "TEXT"),
            ("phase", "TEXT"),
            ("area_dunam", "REAL"),
            ("goals", "TEXT"),
            ("location_desc", "TEXT"),
            ("district", "TEXT"),
            ("plan_area", "TEXT"),
            ("jurisdiction", "TEXT"),
            ("city_county", "TEXT"),
            ("street", "TEXT"),
            ("house_number", "TEXT"),
            ("mp_id", "REAL"),
            ("plan_id", "REAL"),
            ("has_plan_data", "INTEGER DEFAULT 0"),
            ("data_json_path", "TEXT"),
        ],
        "documents": [
            ("subcategory", "TEXT"),
            ("is_takanon", "INTEGER DEFAULT 0"),
            ("doc_date", "TEXT"),
        ],
    }

    for table, cols in new_columns.items():
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        for col_name, col_type in cols:
            if col_name not in existing:
                try:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
                    log(f"Added column {table}.{col_name}")
                except sqlite3.OperationalError:
                    pass

    log("Schema ready")


def create_indexes(conn: sqlite3.Connection):
    """Create performance indexes."""
    print("\n═══ Creating indexes ═══")
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_parcels_gush ON parcels(gush)",
        "CREATE INDEX IF NOT EXISTS idx_parcels_gush_helka ON parcels(gush, helka)",
        "CREATE INDEX IF NOT EXISTS idx_parcels_municipality ON parcels(municipality)",
        "CREATE INDEX IF NOT EXISTS idx_docs_gush ON documents(gush)",
        "CREATE INDEX IF NOT EXISTS idx_docs_gush_helka ON documents(gush, helka)",
        "CREATE INDEX IF NOT EXISTS idx_docs_plan ON documents(plan_number)",
        "CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category)",
        "CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(file_type)",
        "CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(main_status)",
        "CREATE INDEX IF NOT EXISTS idx_plans_gush_list ON plans(gush_list)",
        "CREATE INDEX IF NOT EXISTS idx_plan_blocks_plan ON plan_blocks(plan_number)",
        "CREATE INDEX IF NOT EXISTS idx_plan_blocks_gush ON plan_blocks(gush)",
        "CREATE INDEX IF NOT EXISTS idx_plan_blocks_gush_helka ON plan_blocks(gush, helka)",
        "CREATE INDEX IF NOT EXISTS idx_taba_pl_number ON taba_outlines(pl_number)",
        "CREATE INDEX IF NOT EXISTS idx_permits_gush_helka ON permits(gush, helka)",
        "CREATE INDEX IF NOT EXISTS idx_aerial_year ON aerial_images(year)",
    ]
    for idx in indexes:
        conn.execute(idx)
    log(f"Created {len(indexes)} indexes")


def import_parcels(conn: sqlite3.Connection):
    """Import enriched parcel data from all_parcels_details.json."""
    print("\n═══ Importing parcels ═══")
    details_file = DATA_DIR / "parcel_details" / "all_parcels_details.json"
    if not details_file.exists():
        log("all_parcels_details.json not found, skipping")
        return

    with open(details_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = 0
    updated = 0
    for gush_str, block_data in data.items():
        gush = int(gush_str)
        # Ensure gush exists
        conn.execute(
            "INSERT OR IGNORE INTO gushim (gush, name, area_type) VALUES (?, ?, ?)",
            (gush, f"גוש {gush}", ""),
        )

        parcels = block_data.get("parcels", [])
        for p in parcels:
            helka = p.get("helka", 0)
            if not helka:
                continue
            total += 1

            conn.execute("""
                INSERT INTO parcels (gush, helka, legal_area_sqm, shape_area_sqm,
                    status_code, status_text, locality_code, municipality_code,
                    municipality, county_code, county, region_code, region,
                    gush_suffix, centroid_lat, centroid_lng, update_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(gush, helka) DO UPDATE SET
                    legal_area_sqm = excluded.legal_area_sqm,
                    shape_area_sqm = excluded.shape_area_sqm,
                    status_code = excluded.status_code,
                    status_text = excluded.status_text,
                    locality_code = excluded.locality_code,
                    municipality_code = excluded.municipality_code,
                    municipality = excluded.municipality,
                    county_code = excluded.county_code,
                    county = excluded.county,
                    region_code = excluded.region_code,
                    region = excluded.region,
                    gush_suffix = excluded.gush_suffix,
                    centroid_lat = excluded.centroid_lat,
                    centroid_lng = excluded.centroid_lng,
                    update_date = excluded.update_date
            """, (
                gush, helka,
                p.get("legal_area_sqm"),
                p.get("shape_area_sqm"),
                p.get("status_code"),
                p.get("status"),
                p.get("locality_code"),
                p.get("municipality_code"),
                p.get("municipality"),
                p.get("county_code"),
                p.get("county"),
                p.get("region_code"),
                p.get("region"),
                p.get("gush_suffix"),
                p.get("centroid_lat"),
                p.get("centroid_lng"),
                p.get("update_date"),
            ))
            updated += 1

    conn.commit()
    log(f"Imported {updated}/{total} parcels across {len(data)} gushim")


def import_plans(conn: sqlite3.Connection):
    """Import plans from all_plans_by_block.json + enriched _plan_data.json."""
    print("\n═══ Importing plans ═══")

    # Step 1: Load plan list from all_plans_by_block.json
    plans_file = DATA_DIR / "all_plans_by_block.json"
    if not plans_file.exists():
        log("all_plans_by_block.json not found, skipping")
        return

    with open(plans_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    plans_dict = data.get("plans", {})
    block_plan_map = data.get("block_plan_map", {})

    # Build reverse map: plan → list of gushim
    plan_gushim: dict[str, list[str]] = {}
    for gush_str, plan_numbers in block_plan_map.items():
        for pn in plan_numbers:
            if pn not in plan_gushim:
                plan_gushim[pn] = []
            plan_gushim[pn].append(gush_str)

    imported = 0
    enriched = 0

    for plan_number, plan_info in plans_dict.items():
        gush_list = ",".join(sorted(plan_gushim.get(plan_number, [])))

        # Basic insert from all_plans_by_block
        conn.execute("""
            INSERT INTO plans (plan_number, plan_name, entity_type, status,
                mp_id, plan_id, gush_list)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(plan_number) DO UPDATE SET
                plan_name = COALESCE(excluded.plan_name, plans.plan_name),
                entity_type = COALESCE(excluded.entity_type, plans.entity_type),
                status = COALESCE(excluded.status, plans.status),
                mp_id = COALESCE(excluded.mp_id, plans.mp_id),
                plan_id = COALESCE(excluded.plan_id, plans.plan_id),
                gush_list = COALESCE(excluded.gush_list, plans.gush_list)
        """, (
            plan_number,
            plan_info.get("PL_NAME"),
            plan_info.get("ENTITY_TYPE"),
            plan_info.get("STATUS"),
            plan_info.get("MP_ID"),
            plan_info.get("PLAN_ID"),
            gush_list,
        ))
        imported += 1

        # Step 2: Enrich with _plan_data.json if exists
        # Try multiple folder name patterns
        doc_folder = DATA_DIR / "docs" / plan_number
        if not doc_folder.is_dir():
            # Try with spaces around slashes (the folder naming convention)
            alt_name = plan_number.replace("/", "_ ").replace("\\", "_ ")
            doc_folder = DATA_DIR / "docs" / alt_name
        if not doc_folder.is_dir():
            # Try with spaces
            alt_name2 = plan_number.replace("/", " ")
            doc_folder = DATA_DIR / "docs" / alt_name2

        plan_data_path = doc_folder / "_plan_data.json" if doc_folder.is_dir() else None

        if plan_data_path and plan_data_path.is_file():
            try:
                with open(plan_data_path, "r", encoding="utf-8") as f:
                    pd = json.load(f)

                details = pd.get("planDetails", {})
                loc = pd.get("rsLocation", [{}])
                loc0 = loc[0] if loc else {}

                # Extract goals text (may be long)
                goals = details.get("GOALS", "")
                if goals and len(goals) > 500:
                    goals = goals[:500] + "..."

                rel_path = str(plan_data_path.relative_to(BASE_DIR)).replace("\\", "/")

                conn.execute("""
                    UPDATE plans SET
                        entity_subtype = ?,
                        authority = ?,
                        main_status = ?,
                        status_date = ?,
                        phase = ?,
                        area_dunam = ?,
                        goals = ?,
                        district = ?,
                        plan_area = ?,
                        jurisdiction = ?,
                        city_county = ?,
                        street = ?,
                        house_number = ?,
                        has_plan_data = 1,
                        data_json_path = ?
                    WHERE plan_number = ?
                """, (
                    details.get("ENTITY_SUBTYPE"),
                    details.get("AUTH"),
                    pd.get("mainStatus"),
                    pd.get("statusDate"),
                    details.get("PHASE"),
                    pd.get("decAreaDunam"),
                    goals,
                    loc0.get("DISTRICT_AREA"),
                    loc0.get("PLAN_AREA"),
                    loc0.get("JURST_AREA"),
                    loc0.get("CITY_COUNTY"),
                    loc0.get("STREET_NAME"),
                    loc0.get("HOUSE_NUMBER"),
                    rel_path,
                    plan_number,
                ))
                enriched += 1

                # Import plan-block linkage
                for block in pd.get("rsBlocks", []):
                    blocks_str = block.get("BLOCKS", "")
                    parcels_whole = block.get("PARCELS_WHOLE", "")
                    block_type = block.get("BLOCK_TYPE", "")
                    is_partial = 1 if block.get("BLOCK_PARTIALITY_CODE") == "ח" else 0

                    for gush_str in blocks_str.split(","):
                        gush_str = gush_str.strip()
                        if not gush_str:
                            continue
                        try:
                            gush = int(gush_str)
                        except ValueError:
                            continue

                        # Parse parcels
                        helkot = []
                        if parcels_whole:
                            for h in parcels_whole.split(","):
                                h = h.strip()
                                if h:
                                    try:
                                        helkot.append(int(h))
                                    except ValueError:
                                        pass

                        if helkot:
                            for helka in helkot:
                                conn.execute("""
                                    INSERT OR IGNORE INTO plan_blocks
                                    (plan_number, gush, helka, block_type, is_partial)
                                    VALUES (?, ?, ?, ?, ?)
                                """, (plan_number, gush, helka, block_type, is_partial))
                        else:
                            conn.execute("""
                                INSERT OR IGNORE INTO plan_blocks
                                (plan_number, gush, helka, block_type, is_partial)
                                VALUES (?, ?, NULL, ?, ?)
                            """, (plan_number, gush, block_type, is_partial))

            except Exception as e:
                log(f"  Warning: Failed to parse {plan_data_path.name}: {e}")

    conn.commit()
    log(f"Imported {imported} plans ({enriched} enriched with metadata)")


def import_documents(conn: sqlite3.Connection):
    """Import all document files from docs/ folder."""
    print("\n═══ Importing documents ═══")
    docs_dir = DATA_DIR / "docs"
    if not docs_dir.is_dir():
        log("docs/ folder not found, skipping")
        return

    imported = 0
    skipped = 0

    for plan_folder in sorted(docs_dir.iterdir()):
        if not plan_folder.is_dir():
            continue

        plan_number = plan_folder.name

        for f in sorted(plan_folder.iterdir()):
            if not f.is_file():
                continue
            if f.name.startswith("_"):  # Skip _plan_data.json etc
                continue

            ext = f.suffix.lower()
            file_type = ext.lstrip(".")
            rel_path = str(f.relative_to(BASE_DIR)).replace("\\", "/")
            file_size = f.stat().st_size
            title = f.stem

            # Remove plan_number prefix from title if present
            if title.startswith(plan_number + "_"):
                title = title[len(plan_number) + 1:]

            # Detect category
            is_tashrit = 1 if "תשריט" in f.name else 0
            is_takanon = 1 if ("תקנון" in f.name or "הוראות" in f.name) else 0

            # Determine subcategory
            subcategory = "other"
            if is_tashrit:
                subcategory = "tashrit"
            elif is_takanon:
                subcategory = "takanon"
            elif "מצב מאושר" in f.name:
                subcategory = "approved_status"
            elif "החלטה" in f.name:
                subcategory = "decision"
            elif "קו כחול" in f.name:
                subcategory = "blue_line"
            elif "תאי שטח" in f.name:
                subcategory = "area_cells"
            elif file_type in ("kml",):
                subcategory = "kml"
            elif file_type in ("dwg",):
                subcategory = "dwg"
            elif file_type in ("zip",) and "SHP" in f.name:
                subcategory = "shapefile"

            # Try to find which gush this plan covers
            gush = None
            plan_row = conn.execute(
                "SELECT gush_list FROM plans WHERE plan_number = ?",
                (plan_number,)
            ).fetchone()
            if plan_row and plan_row[0]:
                gush_list = plan_row[0].split(",")
                if gush_list:
                    try:
                        gush = int(gush_list[0])
                    except ValueError:
                        pass

            try:
                conn.execute("""
                    INSERT INTO documents
                    (gush, helka, plan_number, title, file_path, file_name,
                     file_size, file_type, category, subcategory,
                     is_tashrit, is_takanon, is_georef)
                    VALUES (?, 0, ?, ?, ?, ?, ?, ?, 'plans', ?, ?, ?, 0)
                    ON CONFLICT(file_path) DO UPDATE SET
                        plan_number = excluded.plan_number,
                        title = excluded.title,
                        file_size = excluded.file_size,
                        subcategory = excluded.subcategory,
                        is_tashrit = excluded.is_tashrit,
                        is_takanon = excluded.is_takanon,
                        gush = COALESCE(excluded.gush, documents.gush)
                """, (
                    gush, plan_number, title, rel_path, f.name,
                    file_size, file_type, subcategory,
                    is_tashrit, is_takanon,
                ))
                imported += 1
            except Exception as e:
                log(f"  Warning: {f.name}: {e}")
                skipped += 1

    conn.commit()
    log(f"Imported {imported} documents (skipped {skipped})")


def import_permits(conn: sqlite3.Connection):
    """Import permits and permit documents from permits/ folder."""
    print("\n═══ Importing permits ═══")
    permits_dir = DATA_DIR / "permits"
    if not permits_dir.is_dir():
        log("permits/ folder not found, skipping")
        return

    permit_count = 0
    doc_count = 0

    for parcel_folder in sorted(permits_dir.iterdir()):
        if not parcel_folder.is_dir():
            continue

        parts = parcel_folder.name.split("_")
        if len(parts) != 2:
            continue
        try:
            gush = int(parts[0])
            helka = int(parts[1])
        except ValueError:
            continue

        # Ensure gush/parcel exist
        conn.execute("INSERT OR IGNORE INTO gushim (gush, name) VALUES (?, ?)",
                      (gush, f"גוש {gush}"))
        conn.execute("INSERT OR IGNORE INTO parcels (gush, helka) VALUES (?, ?)",
                      (gush, helka))

        for permit_dir in sorted(parcel_folder.iterdir()):
            if not permit_dir.is_dir():
                continue

            permit_id_str = permit_dir.name
            files = list(permit_dir.iterdir())
            file_count = sum(1 for f in files if f.is_file())

            conn.execute("""
                INSERT INTO permits (gush, helka, permit_id, file_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(gush, helka, permit_id) DO UPDATE SET
                    file_count = excluded.file_count
            """, (gush, helka, permit_id_str, file_count))

            permit_row_id = conn.execute(
                "SELECT id FROM permits WHERE gush=? AND helka=? AND permit_id=?",
                (gush, helka, permit_id_str)
            ).fetchone()[0]

            permit_count += 1

            for f in sorted(files):
                if not f.is_file():
                    continue
                ext = f.suffix.lower()
                rel_path = str(f.relative_to(BASE_DIR)).replace("\\", "/")

                try:
                    conn.execute("""
                        INSERT INTO permit_documents
                        (permit_id, file_name, file_path, file_size, file_type)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(file_path) DO UPDATE SET
                            file_size = excluded.file_size,
                            file_type = excluded.file_type
                    """, (permit_row_id, f.name, rel_path, f.stat().st_size, ext.lstrip(".")))
                    doc_count += 1
                except Exception as e:
                    log(f"  Warning: {f.name}: {e}")

    conn.commit()
    log(f"Imported {permit_count} permits with {doc_count} documents")


def import_taba(conn: sqlite3.Connection):
    """Import TABA planning outlines from GeoJSON."""
    print("\n═══ Importing TABA outlines ═══")
    taba_file = DATA_DIR / "taba_kfar_chabad.geojson"
    if not taba_file.exists():
        log("taba_kfar_chabad.geojson not found, skipping")
        return

    with open(taba_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])

    # Clear existing
    conn.execute("DELETE FROM taba_outlines")

    imported = 0
    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry")

        conn.execute("""
            INSERT INTO taba_outlines
            (pl_number, pl_name, entity_subtype, status, area_dunam,
             land_use, district, jurisdiction, plan_county, mp_id,
             objectid, pl_url, depositing_date, last_update,
             geometry_json, properties_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            props.get("pl_number"),
            props.get("pl_name"),
            props.get("entity_subtype_desc"),
            props.get("pl_status_desc") or props.get("station_desc"),
            props.get("pl_area_dunam"),
            props.get("pl_landuse_string"),
            props.get("district_name"),
            props.get("jurstiction_area_name"),
            props.get("plan_county_name"),
            props.get("mp_id"),
            props.get("objectid"),
            props.get("pl_url"),
            props.get("depositing_date"),
            props.get("last_update_date"),
            json.dumps(geom, ensure_ascii=False) if geom else None,
            json.dumps(props, ensure_ascii=False),
        ))
        imported += 1

    conn.commit()
    log(f"Imported {imported} TABA outlines")


def import_aerial(conn: sqlite3.Connection):
    """Import aerial photo metadata."""
    print("\n═══ Importing aerial metadata ═══")
    if not AERIAL_DIR.is_dir():
        log("aerial/ folder not found, skipping")
        return

    # Clear existing
    conn.execute("DELETE FROM aerial_images")

    imported = 0
    for yr_folder in sorted(AERIAL_DIR.iterdir()):
        if not yr_folder.is_dir():
            continue
        year = yr_folder.name

        # Skip root-level composite folders
        if year.startswith("level_"):
            continue

        for level_folder in sorted(yr_folder.iterdir()):
            if not level_folder.is_dir() or not level_folder.name.startswith("level_"):
                continue

            level = int(level_folder.name.split("_")[1])
            tiles = list(level_folder.glob("tile_*.jpg"))
            tile_count = len(tiles)

            # Check for stitched image
            stitched_path = None
            stitched_size = 0
            for ext in [".jpg", ".png"]:
                sp = yr_folder / f"aerial_level_{level}{ext}"
                if sp.exists():
                    stitched_path = str(sp.relative_to(BASE_DIR)).replace("\\", "/")
                    stitched_size = sp.stat().st_size
                    break

            # Read world file
            pixel_size_x = pixel_size_y = origin_x = origin_y = None
            for wfext in [".jgw", ".pgw"]:
                wf = yr_folder / f"aerial_level_{level}{wfext}"
                if wf.exists():
                    lines = wf.read_text().strip().split("\n")
                    if len(lines) >= 6:
                        pixel_size_x = float(lines[0])
                        pixel_size_y = float(lines[3])
                        origin_x = float(lines[4])
                        origin_y = float(lines[5])
                    break

            conn.execute("""
                INSERT INTO aerial_images
                (year, level, tile_count, stitched_path, stitched_size,
                 pixel_size_x, pixel_size_y, origin_x, origin_y)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(year, level) DO UPDATE SET
                    tile_count = excluded.tile_count,
                    stitched_path = excluded.stitched_path,
                    stitched_size = excluded.stitched_size,
                    pixel_size_x = excluded.pixel_size_x,
                    pixel_size_y = excluded.pixel_size_y,
                    origin_x = excluded.origin_x,
                    origin_y = excluded.origin_y
            """, (year, level, tile_count, stitched_path, stitched_size,
                  pixel_size_x, pixel_size_y, origin_x, origin_y))
            imported += 1

    conn.commit()
    log(f"Imported {imported} aerial image entries")


def import_plans_from_plans_folder(conn: sqlite3.Connection):
    """Import plan documents from the plans/ folder (gush_helka organized)."""
    print("\n═══ Importing plans/ folder documents ═══")
    plans_dir = DATA_DIR / "plans"
    if not plans_dir.is_dir():
        log("plans/ folder not found, skipping")
        return

    imported = 0
    for parcel_folder in sorted(plans_dir.iterdir()):
        if not parcel_folder.is_dir():
            continue

        parts = parcel_folder.name.split("_")
        if len(parts) != 2:
            continue
        try:
            gush = int(parts[0])
            helka = int(parts[1])
        except ValueError:
            continue

        for plan_dir in sorted(parcel_folder.iterdir()):
            if not plan_dir.is_dir():
                continue

            plan_name = plan_dir.name
            for f in sorted(plan_dir.iterdir()):
                if not f.is_file():
                    continue

                ext = f.suffix.lower()
                rel_path = str(f.relative_to(BASE_DIR)).replace("\\", "/")
                is_tashrit = 1 if "תשריט" in f.name else 0
                is_takanon = 1 if ("תקנון" in f.name or "הוראות" in f.name) else 0

                try:
                    conn.execute("""
                        INSERT INTO documents
                        (gush, helka, plan_number, title, file_path, file_name,
                         file_size, file_type, category, subcategory,
                         is_tashrit, is_takanon, is_georef)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'plans', 'local_scan', ?, ?, 0)
                        ON CONFLICT(file_path) DO NOTHING
                    """, (
                        gush, helka, plan_name, f.stem, rel_path, f.name,
                        f.stat().st_size, ext.lstrip("."),
                        is_tashrit, is_takanon,
                    ))
                    imported += 1
                except Exception:
                    pass

    conn.commit()
    log(f"Imported {imported} documents from plans/ folder")


def update_aggregates(conn: sqlite3.Connection):
    """Update all aggregate counts in gushim and parcels tables."""
    print("\n═══ Updating aggregate counts ═══")

    # Update gushim counts
    conn.execute("""
        UPDATE gushim SET
            plan_count = (
                SELECT COUNT(DISTINCT pb.plan_number)
                FROM plan_blocks pb WHERE pb.gush = gushim.gush
            ),
            parcel_count = (
                SELECT COUNT(*) FROM parcels WHERE parcels.gush = gushim.gush
            ),
            permit_count = (
                SELECT COUNT(*) FROM permits WHERE permits.gush = gushim.gush
            )
    """)

    # Update parcels counts
    conn.execute("""
        UPDATE parcels SET
            doc_count = (
                SELECT COUNT(*) FROM documents
                WHERE documents.gush = parcels.gush AND documents.helka = parcels.helka
            ),
            plan_count = (
                SELECT COUNT(DISTINCT pb.plan_number)
                FROM plan_blocks pb
                WHERE pb.gush = parcels.gush AND (pb.helka = parcels.helka OR pb.helka IS NULL)
            ),
            permit_count = (
                SELECT COUNT(*) FROM permits
                WHERE permits.gush = parcels.gush AND permits.helka = parcels.helka
            ),
            has_tashrit = (
                SELECT MAX(COALESCE(is_tashrit, 0)) FROM documents
                WHERE documents.gush = parcels.gush AND documents.helka = parcels.helka
            )
    """)

    # Update plans doc_count
    conn.execute("""
        UPDATE plans SET doc_count = (
            SELECT COUNT(*) FROM documents WHERE documents.plan_number = plans.plan_number
        )
    """)

    conn.commit()
    log("Updated all aggregate counts")


def print_summary(conn: sqlite3.Connection):
    """Print final DB summary."""
    print("\n" + "═" * 50)
    print("  DATABASE SUMMARY")
    print("═" * 50)

    tables = [
        ("gushim", "גושים"),
        ("parcels", "חלקות"),
        ("plans", "תוכניות"),
        ("plan_blocks", "קישורי תוכנית-גוש"),
        ("documents", "מסמכים"),
        ("permits", "היתרים"),
        ("permit_documents", "מסמכי היתרים"),
        ("taba_outlines", "קווי תב\"ע"),
        ("aerial_images", "תצ\"א"),
        ("plan_georef", "גיאורפרנס"),
    ]

    for table, label in tables:
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            print(f"  {label:25s} ({table:20s}): {count:,} rows")
        except Exception:
            pass

    # Plan status breakdown
    print("\n  Plan statuses:")
    for row in conn.execute(
        "SELECT COALESCE(main_status, status, 'unknown') s, COUNT(*) c "
        "FROM plans GROUP BY s ORDER BY c DESC"
    ):
        print(f"    {row[0]:30s} {row[1]:4d}")

    # Document type breakdown
    print("\n  Document types:")
    for row in conn.execute(
        "SELECT file_type, COUNT(*) c FROM documents GROUP BY file_type ORDER BY c DESC"
    ):
        print(f"    {row[0]:10s} {row[1]:4d}")

    # DB file size
    db_size = os.path.getsize(str(DB_PATH))
    print(f"\n  DB file size: {db_size / 1024:.1f} KB")
    print("═" * 50)


def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  Kfar Chabad Data Import                        ║")
    print("║  מייבא את כל המידע למסד נתונים SQLite           ║")
    print("╚══════════════════════════════════════════════════╝")
    print(f"\nDB: {DB_PATH}")
    print(f"Data: {DATA_DIR}")

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    try:
        create_schema(conn)
        import_parcels(conn)
        import_plans(conn)
        import_documents(conn)
        import_plans_from_plans_folder(conn)
        import_permits(conn)
        import_taba(conn)
        import_aerial(conn)
        update_aggregates(conn)
        create_indexes(conn)
        print_summary(conn)
    finally:
        conn.close()

    print("\n✓ Import complete!")


if __name__ == "__main__":
    main()
