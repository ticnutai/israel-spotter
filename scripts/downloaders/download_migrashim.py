"""Download migrash data for all gushim in Kfar Chabad from Complot SOAP API."""
import requests
import json
import time
import os
from xml.etree import ElementTree as ET

WS_URL = "https://handasi.complot.co.il/wsComplotPublicData/ComplotPublicData.asmx"
NS = "https://handasi.complot.co.il"
SITE_ID = 31
OUTPUT_DIR = "data/complot_kfar_chabad"


def soap_call(op, params_xml):
    """Make a SOAP call."""
    envelope = f'''<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:web="{NS}">
  <soap:Body>
    <web:{op}>
      {params_xml}
    </web:{op}>
  </soap:Body>
</soap:Envelope>'''
    r = requests.post(WS_URL, data=envelope.encode("utf-8"),
                      headers={
                          "Content-Type": "text/xml; charset=utf-8",
                          "SOAPAction": f"{NS}/{op}",
                      }, timeout=60, verify=True)
    return r


def parse_items(xml_text):
    """Parse SOAP response with ReturnedItem elements."""
    root = ET.fromstring(xml_text)
    items = []
    for item in root.iter():
        if item.tag.endswith("ReturnedItem"):
            entry = {}
            for child in item:
                tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                entry[tag] = child.text
            items.append(entry)
    return items


def get_migrashim_for_gush(gush_num):
    """Get all migrashim for a specific gush."""
    params = f"<web:site_id>{SITE_ID}</web:site_id><web:key>{gush_num}</web:key><web:prefix></web:prefix>"
    r = soap_call("GetMigrashimForGush", params)
    if r.status_code == 200:
        items = parse_items(r.text)
        return items, r.text
    else:
        print(f"  HTTP {r.status_code}")
        return [], r.text


def get_helkot(gush_key, prefix=0):
    """Get all helkot for a gush."""
    params = f"<web:site_id>{SITE_ID}</web:site_id><web:key>{gush_key}</web:key><web:prefix>{prefix}</web:prefix>"
    r = soap_call("GetHelkot", params)
    if r.status_code == 200:
        items = parse_items(r.text)
        return items, r.text
    else:
        print(f"  HTTP {r.status_code}")
        return [], r.text


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load gushim from existing data
    with open("data/complot_kfar_chabad/complot_parsed.json", "r", encoding="utf-8") as f:
        parsed = json.load(f)
    
    gushim = parsed.get("GetGushim", [])
    print(f"Known gushim: {len(gushim)}")
    for g in gushim:
        print(f"  {g}")
    
    # Also get gush numbers from cadastre
    with open("data/cadastre/parcels_kfar_chabad.geojson", "r", encoding="utf-8") as f:
        parcels = json.load(f)
    
    cadastre_gushim = sorted(set(f["properties"]["GUSH_NUM"] for f in parcels["features"]))
    print(f"\nCadastre gushim: {len(cadastre_gushim)}")
    
    # First, test with gush 7188
    print("\n" + "=" * 60)
    print("Testing GetMigrashimForGush for gush 7188...")
    print("=" * 60)
    
    items, raw_xml = get_migrashim_for_gush(7188)
    print(f"  Got {len(items)} migrashim")
    
    # Save raw XML
    xml_path = os.path.join(OUTPUT_DIR, "soap_GetMigrashimForGush_7188.xml")
    with open(xml_path, "w", encoding="utf-8") as f:
        f.write(raw_xml)
    print(f"  Saved raw XML: {xml_path}")
    
    if items:
        print(f"\nSample migrashim:")
        for item in items[:10]:
            print(f"  {item}")
        
        # Save parsed
        json_path = os.path.join(OUTPUT_DIR, "migrashim_7188.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(items, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(items)} items to {json_path}")
    
    # Also try GetHelkot
    print("\n" + "=" * 60)
    print("Testing GetHelkot for gush 7188...")
    print("=" * 60)
    
    # Need to find the key for gush 7188 from the gushim list
    gush_key = None
    for g in gushim:
        if g.get("label") == "7188" or g.get("v") == "7188":
            gush_key = g.get("k")
            print(f"  Found gush key: {gush_key}")
            break
    
    if gush_key:
        helkot, raw = get_helkot(int(gush_key))
        print(f"  Got {len(helkot)} helkot")
        if helkot:
            for h in helkot[:10]:
                print(f"  {h}")
    else:
        # Try with gush number directly
        print("  Trying gush number as key...")
        helkot, raw = get_helkot(7188)
        print(f"  Got {len(helkot)} helkot")
        if helkot:
            for h in helkot[:5]:
                print(f"  {h}")
    
    # Now fetch migrashim for ALL gushim
    print("\n" + "=" * 60)
    print("Fetching migrashim for ALL gushim...")
    print("=" * 60)
    
    all_migrashim = {}
    
    for gush_num in cadastre_gushim:
        print(f"\n  Gush {gush_num}...", end="", flush=True)
        items, raw = get_migrashim_for_gush(gush_num)
        all_migrashim[str(gush_num)] = items
        print(f" {len(items)} migrashim")
        
        if items:
            # Save raw XML for each gush
            xml_path = os.path.join(OUTPUT_DIR, f"soap_GetMigrashimForGush_{gush_num}.xml")
            with open(xml_path, "w", encoding="utf-8") as f:
                f.write(raw)
        
        time.sleep(0.3)  # Be polite
    
    # Save all migrashim
    all_path = os.path.join(OUTPUT_DIR, "all_migrashim_by_gush.json")
    with open(all_path, "w", encoding="utf-8") as f:
        json.dump(all_migrashim, f, ensure_ascii=False, indent=2)
    
    total = sum(len(v) for v in all_migrashim.values())
    print(f"\n{'=' * 60}")
    print(f"Total: {total} migrashim across {len(all_migrashim)} gushim")
    print(f"Saved to {all_path}")
    
    # Summary
    print(f"\nGushim with migrashim:")
    for gush, items in sorted(all_migrashim.items(), key=lambda x: int(x[0])):
        if items:
            print(f"  Gush {gush}: {len(items)} migrashim")


if __name__ == "__main__":
    main()
