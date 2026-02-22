"""
Download migrash data using Playwright - fresh page per parcel.
The XPA backend requires browser context (cookies from SPA).
Strategy: Open SPA once, then navigate via hash for 15 parcels max,
then close and reopen browser for next batch.
"""
import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUTPUT_DIR = Path("data/complot_kfar_chabad")
SITE_URL = "https://sdan.complot.co.il/gush2/"
BATCH_SIZE = 15  # Restart browser every N parcels

# Load parcels
with open("data/cadastre/parcels_kfar_chabad.geojson", "r", encoding="utf-8") as f:
    parcels_data = json.load(f)

gush_parcels = {}
for feat in parcels_data["features"]:
    gush = feat["properties"]["GUSH_NUM"]
    helka = feat["properties"]["PARCEL"]
    if gush not in gush_parcels:
        gush_parcels[gush] = []
    gush_parcels[gush].append(helka)
for g in gush_parcels:
    gush_parcels[g].sort()


def parse_migrash(text):
    """Parse migrash data from rendered page text."""
    result = {
        "migrash": None,
        "migrash_plan": None,
        "yeud": None,
        "shetach": None,
        "not_found": False,
    }
    
    if not text:
        return result
    
    if 'מצטערים' in text or 'לא ניתן להציג' in text:
        result["not_found"] = True
        return result
    
    # migrash: "מגרש 152 (מתוכנית גז/12/525)"
    m = re.search(r'מגרש\s+(\d+(?:\+\d+)?)\s*(?:\(מתוכנית\s*([^)]+)\))?', text)
    if m:
        result["migrash"] = m.group(1)
        result["migrash_plan"] = m.group(2)
    
    # yeud
    m = re.search(r'יעוד\s+(.+?)\s*(?:\(מתוכנית\s*([^)]+)\))?\s*שטח', text)
    if m:
        result["yeud"] = m.group(1).strip()
    
    # shetach
    m = re.search(r'שטח\s+([\d,]+)\s*מ', text)
    if m:
        result["shetach"] = m.group(1).replace(",", "")
    
    return result


def scrape_gush_parcels(gush_num, helkot, existing=None):
    """Scrape all parcels for a gush, using batched browser instances."""
    if existing is None:
        existing = {}
    
    # Filter to only parcels we still need
    needed = [h for h in helkot if h not in existing or 
              (not existing[h].get("migrash") and not existing[h].get("not_found"))]
    
    if not needed:
        print(f"  All {len(helkot)} parcels already scraped")
        return existing
    
    results = dict(existing)
    batches = [needed[i:i+BATCH_SIZE] for i in range(0, len(needed), BATCH_SIZE)]
    
    for batch_idx, batch in enumerate(batches):
        print(f"  Batch {batch_idx+1}/{len(batches)}: {len(batch)} parcels")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            )
            page = context.new_page()
            
            # Load the SPA
            page.goto(SITE_URL, timeout=60000, wait_until='networkidle')
            page.wait_for_timeout(3000)
            
            for i, helka in enumerate(batch):
                print(f"    [{batch_idx*BATCH_SIZE+i+1}/{len(needed)}] Helka {helka}...", end="", flush=True)
                
                try:
                    page.evaluate(f"window.location.hash = 'gush/{gush_num}/{helka}'")
                    page.wait_for_timeout(2000)
                    
                    content = page.inner_text('#MainContainerHandasa')
                    parsed = parse_migrash(content)
                    
                    results[helka] = {
                        "gush": gush_num,
                        "helka": helka,
                        **parsed,
                    }
                    
                    if parsed["migrash"]:
                        print(f" מגרש {parsed['migrash']}")
                    elif parsed["not_found"]:
                        print(f" (לא נמצא)")
                    else:
                        print(f" (אין מגרש)")
                        
                except Exception as e:
                    print(f" ERROR: {e}")
                    results[helka] = {
                        "gush": gush_num,
                        "helka": helka,
                        "error": str(e),
                    }
            
            browser.close()
        
        # Save intermediate results
        out_path = OUTPUT_DIR / f"migrash_data_gush_{gush_num}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
    
    return results


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load previous results
    combined_path = OUTPUT_DIR / "all_migrash_data.json"
    all_data = {}
    
    # Start with gush 7188
    gush = 7188
    helkot = gush_parcels.get(gush, [])
    
    # Load existing results for this gush
    existing_path = OUTPUT_DIR / f"migrash_data_gush_{gush}.json"
    existing = {}
    if existing_path.exists():
        with open(existing_path, "r", encoding="utf-8") as f:
            existing_raw = json.load(f)
        # Convert: old format might have different fields
        for k, v in existing_raw.items():
            helka_num = int(k)
            migrash_val = v.get("migrash")
            if migrash_val and isinstance(migrash_val, str):
                # Clean up: extract just the number from "103 (מתוכנית גז/12/525)"
                m = re.match(r'(\d+(?:\+\d+)?)\s*(?:\(מתוכנית\s*([^)]+)\))?', migrash_val)
                if m:
                    existing[helka_num] = {
                        "gush": gush,
                        "helka": helka_num,
                        "migrash": m.group(1),
                        "migrash_plan": m.group(2),
                        "yeud": v.get("yeud", ""),
                        "shetach": v.get("shetach", ""),
                    }
    
    print(f"Gush {gush}: {len(helkot)} parcels, {len(existing)} already scraped")
    with_m = sum(1 for v in existing.values() if v.get("migrash"))
    print(f"  Already have {with_m} with migrash data")
    
    results = scrape_gush_parcels(gush, helkot, existing)
    all_data[str(gush)] = results
    
    # Summary for gush 7188
    total = len(results)
    with_migrash = sum(1 for v in results.values() if v.get("migrash"))
    not_found = sum(1 for v in results.values() if v.get("not_found"))
    print(f"\n{'='*60}")
    print(f"Gush {gush}: {with_migrash} with migrash, {not_found} not found, {total} total")
    print(f"{'='*60}")
    
    for helka in sorted(results.keys()):
        r = results[helka]
        if r.get("migrash"):
            plan = f" (תוכנית {r.get('migrash_plan', '')})" if r.get('migrash_plan') else ""
            yeud = r.get("yeud", "")
            shetach = r.get("shetach", "")
            print(f"  Helka {helka:>3} → מגרש {r['migrash']:>5}{plan}  {yeud}  {shetach}")
    
    # Save combined
    with open(combined_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    
    # Create clean mapping
    summary = []
    for gush_str, gush_results in sorted(all_data.items(), key=lambda x: int(x[0])):
        for helka, data in sorted(gush_results.items(), key=lambda x: int(x[0]) if isinstance(x[0], int) else int(x[0])):
            if data.get("migrash"):
                summary.append({
                    "gush": int(gush_str),
                    "helka": int(helka) if isinstance(helka, str) else helka,
                    "migrash": data["migrash"],
                    "migrash_plan": data.get("migrash_plan", ""),
                    "yeud": data.get("yeud", ""),
                    "shetach": data.get("shetach", ""),
                })
    
    summary_path = Path("data/migrash_helka_mapping.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\nClean mapping: {len(summary)} entries → {summary_path}")


if __name__ == "__main__":
    main()
