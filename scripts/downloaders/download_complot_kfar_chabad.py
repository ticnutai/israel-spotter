#!/usr/bin/env python3
"""
Download all תב"ע (plan) documents for כפר חב"ד from the Complot platform.

Uses Playwright (headless browser) to bypass the WAF on handasi.complot.co.il.
The script navigates to each plan's page on sdan.complot.co.il and extracts
document links (תקנון, תשריטים, etc.), then downloads them.

Site: sdan.complot.co.il (שדות דן local planning committee)
Backend: handasi.complot.co.il (Complot platform)
site_id: 31

Usage:
    python download_complot_kfar_chabad.py [--plan PLAN_NUMBER] [--delay SECONDS]
"""

import json
import os
import re
import sys
import time
import argparse
from pathlib import Path
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright


# === Configuration ===
SITE_ID = 31
SITE_URL = "https://sdan.complot.co.il"
BINYAN_PAGE = f"{SITE_URL}/binyan/"
XPA_BASE = "magicscripts/mgrqispi.dll?appname=cixpa&prgname="
WS_URL = "https://handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx/"
OUTPUT_DIR = Path("data/complot_kfar_chabad")
DEFAULT_DELAY = 3  # seconds between requests


# Known plans for כפר חב"ד (from iPlan Xplan service)
KFAR_CHABAD_PLANS = [
    "425-0449702", "425-0486316", "425-0498865", "425-0541870", "425-0589184",
    "425-0736678", "425-0774018", "425-1030113", "425-1153212", "425-1248244",
    "425-1279793", "425-1348390", "425-1348440", "425-1405075", "425-1313394",
    "425-1467992", "425-1383173", "425-1285790", "425-1254218", "425-1303775",
    "425-1348473", "425-1279140", "425-1393933", "425-1306505", "425-1308469",
]


def sanitize_filename(name: str) -> str:
    """Clean a string for use as a filename."""
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:200]  # limit length


def extract_plan_documents(page, plan_number: str, delay: float) -> dict:
    """
    Navigate to a plan's page and extract all document links.
    
    Returns dict with plan info and list of document URLs.
    """
    result = {
        "plan_number": plan_number,
        "title": "",
        "documents": [],
        "error": None,
    }
    
    try:
        # Navigate to the plan page via hash route
        plan_url = f"{BINYAN_PAGE}#taba/{plan_number}"
        print(f"  Navigating to {plan_url}")
        
        # Set the hash to trigger Backbone route
        page.evaluate(f"window.location.hash = 'taba/{plan_number}'")
        page.wait_for_timeout(int(delay * 1000))  # Wait for content to load
        
        # Wait for the XHR content to load
        container = page.query_selector('#MainContainerHandasa')
        if not container:
            result["error"] = "No MainContainerHandasa found"
            return result
        
        inner_html = container.inner_html()
        if len(inner_html.strip()) < 10:
            # Content might still be loading, wait more
            page.wait_for_timeout(3000)
            inner_html = container.inner_html()
        
        if len(inner_html.strip()) < 10:
            result["error"] = "Container is empty (API may be unreachable)"
            return result
        
        # Extract plan title
        title_el = container.query_selector('h2, h3, .panel-title')
        if title_el:
            result["title"] = title_el.inner_text().strip()
        
        # Extract all document links (download links)
        links = container.query_selector_all('a[href]')
        for link in links:
            href = link.get_attribute('href')
            text = link.inner_text().strip()
            
            if not href:
                continue
                
            # Skip navigation links, look for document links
            # Document links typically point to file downloads or external URLs
            if any(ext in href.lower() for ext in ['.pdf', '.doc', '.docx', '.jpg', '.png', '.tif', '.dwg']):
                result["documents"].append({
                    "url": href if href.startswith('http') else urljoin(SITE_URL, href),
                    "text": text,
                    "type": "direct_file",
                })
            elif 'download' in href.lower() or 'file' in href.lower() or 'document' in href.lower():
                result["documents"].append({
                    "url": href if href.startswith('http') else urljoin(SITE_URL, href),
                    "text": text,
                    "type": "download_link",
                })
            elif href.startswith('#'):
                continue  # Skip hash links
            elif href.startswith('javascript:'):
                # Check for document-opening JavaScript
                if 'open' in href or 'download' in href:
                    result["documents"].append({
                        "url": href,
                        "text": text,
                        "type": "javascript",
                    })
        
        # Also look for onclick handlers that open documents
        clickable = container.query_selector_all('[onclick]')
        for el in clickable:
            onclick = el.get_attribute('onclick')
            if onclick and ('open' in onclick.lower() or 'download' in onclick.lower()):
                text = el.inner_text().strip()
                # Extract URL from onclick
                url_match = re.search(r"['\"]([^'\"]*(?:pdf|doc|file|download)[^'\"]*)['\"]", onclick, re.IGNORECASE)
                if url_match:
                    result["documents"].append({
                        "url": url_match.group(1),
                        "text": text,
                        "type": "onclick",
                    })
        
        # Save the raw HTML for inspection
        result["html_length"] = len(inner_html)
        
        print(f"    Title: {result['title']}")
        print(f"    Documents found: {len(result['documents'])}")
        
    except Exception as e:
        result["error"] = str(e)
        print(f"    ERROR: {e}")
    
    return result


def download_file(page, url: str, filepath: Path) -> bool:
    """Download a file using the browser's download capability."""
    try:
        if filepath.exists():
            print(f"    Already exists: {filepath.name}")
            return True
        
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        # Use page.request (browser context) for authenticated downloads
        response = page.request.get(url)
        if response.ok:
            filepath.write_bytes(response.body())
            print(f"    Downloaded: {filepath.name} ({len(response.body())} bytes)")
            return True
        else:
            print(f"    Failed ({response.status}): {url}")
            return False
    except Exception as e:
        print(f"    Download error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download כפר חב\"ד plans from Complot")
    parser.add_argument("--plan", help="Specific plan number to download")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="Delay between requests (seconds)")
    parser.add_argument("--list-only", action="store_true", help="Only list documents, don't download")
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode (visible)")
    args = parser.parse_args()
    
    plans = [args.plan] if args.plan else KFAR_CHABAD_PLANS
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print(f"=== Complot כפר חב\"ד Document Downloader ===")
    print(f"Plans to process: {len(plans)}")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Delay between requests: {args.delay}s")
    print()
    
    all_results = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="he-IL",
        )
        page = context.new_page()
        
        # First, navigate to the main page to initialize the SPA
        print("Initializing SPA...")
        page.goto(BINYAN_PAGE, timeout=60000, wait_until='networkidle')
        page.wait_for_timeout(5000)
        
        # Check if the SPA loaded correctly
        js_check = page.evaluate("""() => {
            return {
                xpaBaseURL: typeof xpaBaseURL !== 'undefined' ? xpaBaseURL : null,
                backbone: typeof Backbone !== 'undefined' && Backbone.history ? true : false,
                getSiteId: typeof getSiteId !== 'undefined' ? getSiteId() : null,
            }
        }""")
        print(f"  xpaBaseURL: {js_check['xpaBaseURL']}")
        print(f"  Backbone active: {js_check['backbone']}")
        print(f"  Site ID: {js_check['getSiteId']}")
        
        if not js_check['xpaBaseURL']:
            print("\nERROR: SPA failed to initialize. The handasi.complot.co.il server may be")
            print("       unreachable (WAF ban or connectivity issue). Try again later.")
            print("       If persistent, check if the site is accessible in your browser.")
            browser.close()
            sys.exit(1)
        
        print(f"\nSPA loaded successfully! Processing {len(plans)} plans...\n")
        
        for i, plan_number in enumerate(plans, 1):
            print(f"[{i}/{len(plans)}] Plan: {plan_number}")
            
            result = extract_plan_documents(page, plan_number, args.delay)
            all_results.append(result)
            
            if not args.list_only and result["documents"]:
                plan_dir = OUTPUT_DIR / sanitize_filename(plan_number)
                plan_dir.mkdir(parents=True, exist_ok=True)
                
                for doc in result["documents"]:
                    if doc["type"] in ("direct_file", "download_link"):
                        filename = sanitize_filename(doc["text"] or os.path.basename(urlparse(doc["url"]).path))
                        if not filename:
                            filename = f"document_{hash(doc['url']) % 10000}"
                        filepath = plan_dir / filename
                        download_file(page, doc["url"], filepath)
            
            # Rate limiting
            if i < len(plans):
                time.sleep(args.delay)
            
            print()
        
        browser.close()
    
    # Save results summary
    summary_path = OUTPUT_DIR / "download_summary.json"
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    print(f"\n=== Summary ===")
    total_docs = sum(len(r["documents"]) for r in all_results)
    errors = sum(1 for r in all_results if r["error"])
    print(f"Plans processed: {len(all_results)}")
    print(f"Total documents found: {total_docs}")
    print(f"Errors: {errors}")
    print(f"Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
