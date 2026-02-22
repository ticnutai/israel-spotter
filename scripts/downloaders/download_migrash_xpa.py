"""
Download migrash data for ALL parcels using the Complot XPA API directly.
API: handasi.complot.co.il/magicscripts/mgrqispi.dll?appname=cixpa&prgname=GetGushFile
"""
import json
import re
import time
import os
import requests
from pathlib import Path

OUTPUT_DIR = Path("data/complot_kfar_chabad")
API_BASE = "https://handasi.complot.co.il/magicscripts/mgrqispi.dll"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://sdan.complot.co.il/gush2/",
}

SITE_ID = 31

# Load parcels from cadastre
with open("data/cadastre/parcels_kfar_chabad.geojson", "r", encoding="utf-8") as f:
    parcels_data = json.load(f)

gush_parcels = {}
for feat in parcels_data["features"]:
    gush = feat["properties"]["GUSH_NUM"]
    helka = feat["properties"]["PARCEL"]
    if gush not in gush_parcels:
        gush_parcels[gush] = []
    gush_parcels[gush].append(helka)
for gush in gush_parcels:
    gush_parcels[gush].sort()


def fetch_gush_file(gush, helka, session):
    """Fetch parcel data from the XPA API."""
    params = {
        "appname": "cixpa",
        "prgname": "GetGushFile",
        "siteid": SITE_ID,
        "g": gush,
        "h": helka,
        "arguments": "siteid,g,h",
    }
    try:
        r = session.get(API_BASE, params=params, headers=HEADERS, timeout=30)
        if r.status_code == 200:
            return r.text
        else:
            return None
    except Exception as e:
        print(f"    Error: {e}")
        return None


def parse_html_data(html, gush, helka):
    """Parse migrash/yeud/shetach data from the XPA HTML response."""
    result = {
        "gush": gush,
        "helka": helka,
        "migrash": None,
        "migrash_plan": None,
        "yeud": None,
        "yeud_plan": None,
        "shetach": None,
        "addresses": [],
        "plans": [],
        "has_data": False,
    }
    
    if not html or len(html) < 100:
        return result
    
    # Check for "not found" response
    if 'מצטערים' in html or 'לא ניתן להציג' in html or 'לא אותרו תוצאות' in html:
        result["not_found"] = True
        return result
    
    result["has_data"] = True
    
    # Parse migrash number: look for מגרש pattern
    # The HTML contains spans with labels and values
    m = re.search(r'מגרש[:\s]*</?\w*[^>]*>\s*(\d+(?:\+\d+)?)\s*(?:\(מתוכנית\s*([^)]+)\))?', html)
    if not m:
        # Try without HTML tags
        m = re.search(r'מגרש\s+(\d+(?:\+\d+)?)\s*(?:\(מתוכנית\s*([^)]+)\))?', html)
    if m:
        result["migrash"] = m.group(1)
        result["migrash_plan"] = m.group(2)
    
    # Parse yeud
    m = re.search(r'יעוד[:\s]*</?\w*[^>]*>\s*(.+?)\s*(?:\(מתוכנית\s*([^)]+)\))?(?:\s*<)', html)
    if not m:
        m = re.search(r'יעוד\s+(.+?)\s*(?:\(מתוכנית\s*([^)]+)\))?(?:\s*שטח|\s*<)', html)
    if m:
        result["yeud"] = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        result["yeud_plan"] = m.group(2)
    
    # Parse shetach
    m = re.search(r'שטח[:\s]*</?\w*[^>]*>\s*([\d,]+)\s*מ', html)
    if not m:
        m = re.search(r'שטח\s+([\d,]+)\s*מ', html)
    if m:
        result["shetach"] = m.group(1).replace(",", "")
    
    # Parse addresses
    for addr_m in re.finditer(r'כפר חב"ד.*?(\d+)', html):
        result["addresses"].append(addr_m.group(0)[:50])
    
    return result


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    session = requests.Session()
    
    # Get all gushim that need scraping
    soap_path = OUTPUT_DIR / "all_migrashim_by_gush.json"
    if soap_path.exists():
        with open(soap_path, "r", encoding="utf-8") as f:
            soap_data = json.load(f)
        gushim_with_migrashim = set(int(g) for g, items in soap_data.items() if items)
    else:
        gushim_with_migrashim = set()
    
    # Start with all gushim in our cadastre data
    # Prioritize gush 7188
    all_gushim = sorted(gush_parcels.keys())
    all_gushim.remove(7188)
    all_gushim.insert(0, 7188)
    
    all_results = {}
    
    for gush in all_gushim:
        helkot = gush_parcels[gush]
        print(f"\nGush {gush}: {len(helkot)} parcels", flush=True)
        
        gush_results = {}
        found_count = 0
        not_found_count = 0
        
        for helka in helkot:
            html = fetch_gush_file(gush, helka, session)
            result = parse_html_data(html, gush, helka)
            gush_results[helka] = result
            
            if result.get("migrash"):
                found_count += 1
                print(f"  Helka {helka:>3} → מגרש {result['migrash']:>5}", end="")
                if result.get("yeud"):
                    print(f"  {result['yeud']}", end="")
                print()
            elif result.get("not_found"):
                not_found_count += 1
            
            time.sleep(0.15)  # Be polite
        
        all_results[str(gush)] = gush_results
        has_data = sum(1 for v in gush_results.values() if v.get("has_data"))
        with_migrash = sum(1 for v in gush_results.values() if v.get("migrash"))
        print(f"  Summary: {with_migrash} with migrash, {has_data} with data, {not_found_count} not found")
        
        # Save per-gush results
        gush_path = OUTPUT_DIR / f"xpa_gush_{gush}.json"
        with open(gush_path, "w", encoding="utf-8") as f:
            json.dump(gush_results, f, ensure_ascii=False, indent=2)
    
    # Save combined results
    combined_path = OUTPUT_DIR / "all_migrash_data.json"
    with open(combined_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    # Create clean mapping
    summary = []
    for gush_str, gush_results in sorted(all_results.items(), key=lambda x: int(x[0])):
        for helka_str, data in sorted(gush_results.items(), key=lambda x: int(x[0])):
            if data.get("migrash"):
                summary.append({
                    "gush": int(gush_str),
                    "helka": int(helka_str),
                    "migrash": data["migrash"],
                    "migrash_plan": data.get("migrash_plan", ""),
                    "yeud": data.get("yeud", ""),
                    "shetach": data.get("shetach", ""),
                })
    
    summary_path = Path("data/migrash_helka_mapping.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    
    total_parcels = sum(len(v) for v in all_results.values())
    total_with_migrash = len(summary)
    
    print(f"\n{'='*60}")
    print(f"FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"Total parcels checked: {total_parcels}")
    print(f"Total with migrash data: {total_with_migrash}")
    print(f"Combined data saved to: {combined_path}")
    print(f"Clean mapping saved to: {summary_path}")
    
    # Show per-gush summary
    print(f"\nGushim with migrash data:")
    for gush_str, gush_results in sorted(all_results.items(), key=lambda x: int(x[0])):
        with_m = sum(1 for v in gush_results.values() if v.get("migrash"))
        if with_m > 0:
            print(f"  Gush {gush_str}: {with_m}/{len(gush_results)} parcels")


if __name__ == "__main__":
    main()
