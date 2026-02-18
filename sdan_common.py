"""
sdan_common.py – Shared utilities for downloading documents from SDAN
=====================================================================

Contains:
  • CSS/ID selectors per category
  • Chrome driver factory
  • File download helpers
  • Document-link extraction from modals
  • SQLite database helpers
  • The core ``process_gush`` function used by all category scripts
"""

import os
import re
import time
import sqlite3
from typing import List, Tuple, Dict, Optional
from urllib.parse import urlparse

import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException,
    StaleElementReferenceException,
)
from webdriver_manager.chrome import ChromeDriverManager

# ─── Kfar Chabad gush list ───────────────────────────────────────────────────
KFAR_CHABAD_GUSHIM = [
    6256, 6258, 6260, 6261, 6262, 6269,
    6272, 6280, 7187, 7188, 7196, 7311,
]

HELKA_RANGE = range(1, 201)  # 1–200

# ─── Category-specific selectors ─────────────────────────────────────────────
SELECTORS: Dict[str, Dict[str, str]] = {
    "plans": {
        "url": "https://sdan.complot.co.il/binyan/",
        "radio_label_id": "C_TabaGushHelkaGRP",
        "gush_input_id": "TabaGush",
        "helka_input_id": "TabaHelka",
        "show_button_id": "btn_Show",
    },
    "permits": {
        "url": "https://sdan.complot.co.il/iturbakashot/",
        "radio_label_id": "C_RequestByGushGRP",
        "gush_input_id": "RequestGush",
        "helka_input_id": "RequestHelka",
        "show_button_id": "btnShow",
    },
}


# ─── Chrome driver factory ───────────────────────────────────────────────────
def create_driver(headless: bool = False) -> webdriver.Chrome:
    """Create a Chrome WebDriver with anti-detection flags."""
    opts = webdriver.ChromeOptions()
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    if headless:
        opts.add_argument("--headless=new")
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()), options=opts
    )
    driver.execute_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return driver


# ─── File helpers ─────────────────────────────────────────────────────────────
def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def sanitize(name: str) -> str:
    """Remove invalid filename characters."""
    name = re.sub(r'[\\/:*?"<>|\n\r]', '_', name)
    return name.strip('. ') or "document"


def file_ext(url: str, default: str = ".pdf") -> str:
    _, ext = os.path.splitext(urlparse(url).path)
    return ext.lower() if ext else default


def download_file(url: str, dest: str) -> None:
    r = requests.get(url, stream=True, timeout=60)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)


# ─── Selenium helpers ────────────────────────────────────────────────────────
def safe_click(driver: webdriver.Chrome, el) -> None:
    try:
        el.click()
    except ElementClickInterceptedException:
        driver.execute_script("arguments[0].click();", el)


def dismiss_banner(driver: webdriver.Chrome) -> None:
    """Hide the cookie-consent banner if present."""
    try:
        banner = driver.find_element(By.ID, "cap-banner")
        if banner.is_displayed():
            for sel in [
                "#cap-banner button[id*='accept']",
                "#cap-banner button[id*='close']",
                "#cap-banner .cap-accept",
                "#cap-banner button",
            ]:
                btns = driver.find_elements(By.CSS_SELECTOR, sel)
                for b in btns:
                    if b.is_displayed():
                        b.click()
                        time.sleep(0.5)
                        return
            driver.execute_script(
                "document.getElementById('cap-banner').style.display='none';"
            )
    except NoSuchElementException:
        pass


def extract_doc_links(driver: webdriver.Chrome) -> List[Tuple[str, str]]:
    """Return [(title, url), …] from the currently open modal."""
    links: List[Tuple[str, str]] = []
    try:
        mc = driver.find_element(By.ID, "modalcontent")
    except NoSuchElementException:
        return links

    anchors = mc.find_elements(
        By.CSS_SELECTOR, "table#tblGrid tbody tr td:first-child a"
    )
    if not anchors:
        anchors = mc.find_elements(
            By.CSS_SELECTOR, "a[href*='archive.gis-net.co.il']"
        )
    if not anchors:
        anchors = mc.find_elements(By.CSS_SELECTOR, "a[target='_blank']")

    for a in anchors:
        url = a.get_attribute("href")
        if not url or url.startswith("javascript"):
            continue
        title = a.text.replace("נפתח בחלון חדש", "").strip() or "document"
        links.append((title, url))
    return links


def close_modal(driver: webdriver.Chrome) -> None:
    try:
        btn = driver.find_element(
            By.CSS_SELECTOR,
            "#modalcontent .complot-modal-close[data-dismiss='modal']",
        )
        btn.click()
    except NoSuchElementException:
        try:
            btn = driver.find_element(
                By.XPATH,
                "//div[@id='modalcontent']//button[contains(., 'סגור')]",
            )
            btn.click()
        except NoSuchElementException:
            driver.find_element(By.TAG_NAME, "body").send_keys("\u001b")
    try:
        WebDriverWait(driver, 5).until(
            EC.invisibility_of_element_located((By.ID, "modal-window"))
        )
    except TimeoutException:
        pass
    time.sleep(0.5)


# ─── Database ────────────────────────────────────────────────────────────────
def open_db(path: str = "kfar_chabad_documents.db") -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute("PRAGMA foreign_keys=ON")
    # Ensure new normalized schema exists (safe if tables already present)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS gushim (
            gush INTEGER PRIMARY KEY,
            name TEXT,
            area_type TEXT DEFAULT 'unknown',
            plan_count INTEGER DEFAULT 0,
            permit_count INTEGER DEFAULT 0,
            parcel_count INTEGER DEFAULT 0,
            notes TEXT
        );
        CREATE TABLE IF NOT EXISTS parcels (
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
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_number TEXT NOT NULL UNIQUE,
            plan_name TEXT,
            status TEXT,
            plan_type TEXT,
            doc_count INTEGER DEFAULT 0,
            gush_list TEXT,
            notes TEXT
        );
        CREATE TABLE IF NOT EXISTS documents (
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
        CREATE INDEX IF NOT EXISTS idx_documents_gush ON documents(gush);
        CREATE INDEX IF NOT EXISTS idx_documents_gush_helka ON documents(gush, helka);
        CREATE INDEX IF NOT EXISTS idx_documents_plan ON documents(plan_number);
        CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
        CREATE INDEX IF NOT EXISTS idx_parcels_gush ON parcels(gush);
    """)
    conn.commit()
    return conn


# ─── Core download logic for one gush ───────────────────────────────────────
def process_gush(
    gush: int,
    category: str,
    download_root: str,
    db_path: str = "kfar_chabad_documents.db",
    helka_range: range = HELKA_RANGE,
    timeout: int = 20,
) -> Dict[str, int]:
    """Download all documents for one *gush* in one *category*.

    Creates its own Chrome driver and DB connection.
    Returns a summary dict: {"gush": …, "files": …, "errors": …}.
    """
    sel = SELECTORS[category]
    base_url = sel["url"]

    driver = create_driver()
    conn = open_db(db_path)
    stats = {"gush": gush, "category": category, "files": 0, "errors": 0}

    try:
        for helka in helka_range:
            _process_one_pair(
                driver, gush, helka, sel, base_url,
                download_root, conn, category, timeout, stats,
            )
    finally:
        driver.quit()
        conn.close()

    return stats


def _process_one_pair(
    driver, gush, helka, sel, base_url,
    download_root, conn, category, timeout, stats,
):
    """Search one (gush, helka) pair and download any documents found."""
    driver.get(base_url)

    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.form-horizontal"))
        )
    except TimeoutException:
        return

    dismiss_banner(driver)

    # Click "גוש וחלקה" radio
    try:
        safe_click(driver, driver.find_element(By.ID, sel["radio_label_id"]))
        time.sleep(0.3)
    except NoSuchElementException:
        return

    # Fill gush
    try:
        gi = driver.find_element(By.ID, sel["gush_input_id"])
        gi.clear(); gi.send_keys(str(gush))
    except NoSuchElementException:
        return

    # Fill helka
    try:
        hi = driver.find_element(By.ID, sel["helka_input_id"])
        hi.clear(); hi.send_keys(str(helka))
    except NoSuchElementException:
        return

    # Click "הצג"
    try:
        safe_click(driver, driver.find_element(By.ID, sel["show_button_id"]))
    except NoSuchElementException:
        return

    # Wait for results
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "table#results-table tbody tr[role='row']")
            )
        )
    except TimeoutException:
        return  # no results – normal

    pair_dir = os.path.join(download_root, category, f"{gush}_{helka}")
    ensure_dir(pair_dir)

    rows = driver.find_elements(
        By.CSS_SELECTOR, "table#results-table tbody tr[role='row']"
    )
    print(f"  [{category}] gush={gush} helka={helka}: {len(rows)} result(s)")

    for idx in range(len(rows)):
        rows = driver.find_elements(
            By.CSS_SELECTOR, "table#results-table tbody tr[role='row']"
        )
        if idx >= len(rows):
            break
        row = rows[idx]

        # Plan number
        try:
            plinks = row.find_elements(
                By.CSS_SELECTOR, "td a[href^='javascript:get']"
            )
            plan_num = plinks[1].text.strip() if len(plinks) > 1 else "unknown"
        except (IndexError, StaleElementReferenceException):
            plan_num = f"row_{idx}"

        # Archive button
        try:
            abtn = row.find_element(By.CSS_SELECTOR, "button.openBtn")
        except NoSuchElementException:
            continue

        safe_click(driver, abtn)

        try:
            WebDriverWait(driver, timeout).until(
                EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, "#modal-window .modal-body")
                )
            )
            time.sleep(1.5)
        except TimeoutException:
            continue

        doc_links = extract_doc_links(driver)
        if not doc_links:
            close_modal(driver)
            continue

        plan_dir = os.path.join(pair_dir, sanitize(plan_num))
        ensure_dir(plan_dir)

        for title, url in doc_links:
            ext = file_ext(url)
            fname = sanitize(title) + ext
            dest = os.path.join(plan_dir, fname)
            if os.path.exists(dest):
                continue
            try:
                print(f"    ⬇ {plan_num} / {title}{ext}")
                download_file(url, dest)
                stats["files"] += 1

                fsize = os.path.getsize(dest) if os.path.exists(dest) else 0
                ftype = "image" if ext.lower() in (".jpg", ".jpeg", ".png", ".tif") else (
                    "pdf" if ext.lower() == ".pdf" else "other"
                )
                is_tash = 1 if "תשריט" in title else 0
                rel_path = "./" + dest.replace("\\", "/")

                # Ensure gush row exists
                conn.execute(
                    "INSERT OR IGNORE INTO gushim (gush, name) VALUES (?, ?)",
                    (gush, f"גוש {gush}"),
                )
                conn.execute(
                    "INSERT OR IGNORE INTO documents "
                    "(gush, helka, plan_number, title, file_path, file_name, "
                    "file_size, file_type, category, is_tashrit, is_georef) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                    (gush, helka, plan_num, title, rel_path, fname,
                     fsize, ftype, category, is_tash),
                )
                conn.commit()
            except Exception as e:
                stats["errors"] += 1
                print(f"    ✗ {title}: {e}")

        close_modal(driver)
