"""
Scrape migrash data for ALL parcels from Complot gush2 page.
Uses Playwright with periodic page reloads to avoid SPA staleness.
"""
import json
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUTPUT_DIR = Path("data/complot_kfar_chabad")
SITE_URL = "https://sdan.complot.co.il/gush2/"
BATCH_SIZE = 25  # Reload browser every N parcels

# Load parcels from cadastre
with open("data/cadastre/parcels_kfar_chabad.geojson", "r", encoding="utf-8") as f:
    parcels_data = json.load(f)

# Group by gush
gush_parcels = {}
for feat in parcels_data["features"]:
    gush = feat["properties"]["GUSH_NUM"]
    helka = feat["properties"]["PARCEL"]
    if gush not in gush_parcels:
        gush_parcels[gush] = []
    gush_parcels[gush].append(helka)
for gush in gush_parcels:
    gush_parcels[gush].sort()

print(f"Total gushim: {len(gush_parcels)}")


def parse_parcel_data(content, gush_num, helka):
    """Parse migrash data from page content."""
    result = {
        "gush": gush_num,
        "helka": helka,
        "migrash": None,
        "migrash_plan": None,
        "yeud": None,
        "yeud_plan": None,
        "shetach": None,
    }
    
    # Parse migrash: "מגרש 152 (מתוכנית גז/12/525)"
    m = re.search(r'מגרש\s+(\d+(?:\+\d+)?)\s*(?:\(מתוכנית\s+([^)]+)\))?', content)
    if m:
        result["migrash"] = m.group(1)
        result["migrash_plan"] = m.group(2)
    
    # Parse yeud: "יעוד מגורים א (מתוכנית גז/12/525)"
    m = re.search(r'יעוד\s+(.+?)\s*(?:\(מתוכנית\s+([^)]+)\))?(?:\s*שטח|\s*$)', content)
    if m:
        result["yeud"] = m.group(1).strip()
        result["yeud_plan"] = m.group(2)
    
    # Parse shetach: 'שטח 610 מ"ר'
    m = re.search(r'שטח\s+([\d,]+)\s*מ', content)
    if m:
        result["shetach"] = m.group(1).replace(",", "")
    
    return result


def scrape_batch(gush_num, helkot_batch, batch_num):
    """Scrape a batch of parcels using a single browser instance.
    Navigate to base page first, then change hash via JS for each parcel."""
    results = {}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = context.new_page()
        
        # Navigate to the base gush2 page first
        print(f"    Loading SPA...", flush=True)
        page.goto(SITE_URL, timeout=60000, wait_until='networkidle')
        page.wait_for_timeout(2000)
        
        for i, helka in enumerate(helkot_batch):
            global_idx = (batch_num * BATCH_SIZE) + i + 1
            print(f"  [{global_idx}] Gush {gush_num} Helka {helka}...", end="", flush=True)
            
            try:
                # Change hash via JavaScript (triggers SPA routing)
                page.evaluate(f"window.location.hash = 'gush/{gush_num}/{helka}'")
                page.wait_for_timeout(1500)
                
                content = page.inner_text('#MainContainerHandasa')
                
                # Verify it shows the right parcel
                if str(helka) not in content:
                    # Wait a bit more
                    page.wait_for_timeout(1500)
                    content = page.inner_text('#MainContainerHandasa')
                
                result = parse_parcel_data(content, gush_num, helka)
                results[helka] = result
                
                if result["migrash"]:
                    plan = f" (תוכנית {result['migrash_plan']})" if result["migrash_plan"] else ""
                    print(f" מגרש {result['migrash']}{plan}")
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
    
    return results


def scrape_gush(gush_num):
    """Scrape all parcels in a gush, using batched browser reloads."""
    helkot = gush_parcels.get(gush_num, [])
    if not helkot:
        return {}
    
    all_results = {}
    batches = [helkot[i:i+BATCH_SIZE] for i in range(0, len(helkot), BATCH_SIZE)]
    
    print(f"\nScraping gush {gush_num}: {len(helkot)} parcels in {len(batches)} batches")
    
    for batch_num, batch in enumerate(batches):
        print(f"\n  Batch {batch_num+1}/{len(batches)} ({len(batch)} parcels)")
        results = scrape_batch(gush_num, batch, batch_num)
        all_results.update(results)
        
        # Save intermediate results
        out_path = OUTPUT_DIR / f"migrash_data_gush_{gush_num}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    return all_results


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load previous results if any
    combined_path = OUTPUT_DIR / "all_migrash_data.json"
    if combined_path.exists():
        with open(combined_path, "r", encoding="utf-8") as f:
            all_data = json.load(f)
    else:
        all_data = {}
    
    # Focus on gush 7188 first (main request)
    priority_gushim = [7188]
    
    # Also add other gushim that have migrashim
    soap_path = OUTPUT_DIR / "all_migrashim_by_gush.json"
    if soap_path.exists():
        with open(soap_path, "r", encoding="utf-8") as f:
            soap_data = json.load(f)
        other_gushim = [int(g) for g, items in soap_data.items() 
                       if items and int(g) != 7188 and int(g) in gush_parcels]
        priority_gushim.extend(sorted(other_gushim))
    
    print(f"Will scrape {len(priority_gushim)} gushim")
    
    for gush_num in priority_gushim:
        # Skip if already done with good data
        if str(gush_num) in all_data:
            results = all_data[str(gush_num)]
            with_migrash = sum(1 for v in results.values() if v.get("migrash"))
            total = len(results)
            # Skip only if we got reasonable coverage
            if with_migrash > 0 or total == 0:
                pass  # Don't skip, re-scrape everything for now
        
        results = scrape_gush(gush_num)
        all_data[str(gush_num)] = results
        
        # Save combined
        with open(combined_path, "w", encoding="utf-8") as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)
        
        with_migrash = sum(1 for v in results.values() if v.get("migrash"))
        print(f"\n  => Gush {gush_num}: {with_migrash}/{len(results)} with migrash data")
    
    # Final summary
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    total_parcels = 0
    total_with_migrash = 0
    for gush, results in sorted(all_data.items(), key=lambda x: int(x[0])):
        count = len(results)
        with_m = sum(1 for v in results.values() if v.get("migrash"))
        if with_m > 0:
            print(f"  Gush {gush}: {with_m}/{count} with migrash")
        total_parcels += count
        total_with_migrash += with_m
    
    print(f"\nTotal: {total_with_migrash}/{total_parcels} parcels with migrash data")
    print(f"Saved to {combined_path}")
    
    # Also create a clean summary file
    summary = []
    for gush, results in sorted(all_data.items(), key=lambda x: int(x[0])):
        for helka_str, data in sorted(results.items(), key=lambda x: int(x[0])):
            if data.get("migrash"):
                summary.append({
                    "gush": int(gush),
                    "helka": int(helka_str),
                    "migrash": data["migrash"],
                    "migrash_plan": data.get("migrash_plan", ""),
                    "yeud": data.get("yeud", ""),
                    "shetach": data.get("shetach", ""),
                })
    
    summary_path = Path("data/migrash_helka_mapping.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Clean mapping saved to {summary_path} ({len(summary)} entries)")


if __name__ == "__main__":
    main()
