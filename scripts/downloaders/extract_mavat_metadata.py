"""
Extract additional metadata from all existing _plan_data.json files.

Extracts:
  - rsBlocks: גושים וחלקות בכל תכנית
  - rsInstructions: הוראות תכנית (טקסט)
  - rsQuantities: זכויות בנייה (שטחים, קומות, אחוזי בנייה)
  - rsRelation: תכניות קשורות
  - rsTasrit: תשריטים
  - rsOppositions: התנגדויות
  - rsOpenOpp: התנגדויות פתוחות
  - rsMeetingsDocs: מסמכי ישיבות
  - rsLocalPlanActions: פעולות ועדה מקומית
  - planDetails: פרטים מלאים
  - recExplanation: הסבר/תיאור
  - rsVoice: חוות דעת
  - rsPlanDocsGen: מסמכים כלליים (לא הורדו!)

Output: data/mavat_extracted_metadata.json
"""

import json, os
from pathlib import Path

DOCS_DIR = Path("data/docs")
OUTPUT = Path("data/mavat_extracted_metadata.json")

EXTRACT_KEYS = [
    "rsBlocks", "rsInstructions", "rsQuantities", "rsRelation",
    "rsTasrit", "rsOppositions", "rsOpenOpp", "rsMeetingsDocs",
    "rsLocalPlanActions", "planDetails", "recExplanation", "rsVoice",
    "rsPlanDocsGen", "rsDesInvited", "rsInternet", "rsLocation",
    "rsTopic", "printCounters", "decAreaDunam", "mainStatus",
    "shortStatus", "statusDate", "unifiedStatus", "planAddData",
]

all_data = {}
plans_with_docs_gen = []

for plan_dir in sorted(DOCS_DIR.iterdir()):
    if not plan_dir.is_dir():
        continue
    meta = plan_dir / "_plan_data.json"
    if not meta.exists():
        continue

    plan_name = plan_dir.name
    with open(meta, "r", encoding="utf-8") as f:
        pd = json.load(f)

    extracted = {"plan_dir": plan_name}
    for key in EXTRACT_KEYS:
        if key in pd:
            val = pd[key]
            extracted[key] = val

    # Track plans with rsPlanDocsGen that have undownloaded docs
    gen_docs = pd.get("rsPlanDocsGen", [])
    if gen_docs:
        plans_with_docs_gen.append({
            "plan": plan_name,
            "count": len(gen_docs),
            "docs": gen_docs,
        })

    all_data[plan_name] = extracted

# Build summary
summary = {
    "total_plans": len(all_data),
    "plans_with_blocks": sum(1 for p in all_data.values() if p.get("rsBlocks")),
    "plans_with_instructions": sum(1 for p in all_data.values() if p.get("rsInstructions")),
    "plans_with_quantities": sum(1 for p in all_data.values() if p.get("rsQuantities") and len(p["rsQuantities"]) > 0),
    "plans_with_relations": sum(1 for p in all_data.values() if p.get("rsRelation") and len(p["rsRelation"]) > 0),
    "plans_with_oppositions": sum(1 for p in all_data.values() if p.get("rsOppositions") and len(p["rsOppositions"]) > 0),
    "plans_with_gen_docs": len(plans_with_docs_gen),
    "total_gen_docs": sum(p["count"] for p in plans_with_docs_gen),
    "plans_with_voice": sum(1 for p in all_data.values() if p.get("rsVoice") and len(p["rsVoice"]) > 0),
    "plans_with_meetings_docs": sum(1 for p in all_data.values() if p.get("rsMeetingsDocs") and len(p["rsMeetingsDocs"]) > 0),
}

output = {
    "summary": summary,
    "plans_with_gen_docs_to_download": plans_with_docs_gen,
    "plans": all_data,
}

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"Extracted metadata from {len(all_data)} plans")
print(f"\nSummary:")
for k, v in summary.items():
    print(f"  {k}: {v}")

# Also extract a clean blocks summary
blocks_map = {}
for plan_name, data in all_data.items():
    for block in data.get("rsBlocks", []):
        block_num = str(block.get("BLOCKS", ""))
        if block_num:
            if block_num not in blocks_map:
                blocks_map[block_num] = []
            blocks_map[block_num].append({
                "plan": plan_name,
                "block_type": block.get("BLOCK_TYPE", ""),
                "partiality": block.get("BLOCK_PARTIALITY", ""),
                "parcels_whole": block.get("PARCELS_WHOLE", ""),
                "parcels_partial": block.get("PARCELS_PARTIAL", ""),
            })

blocks_output = Path("data/blocks_parcels_by_plan.json")
with open(blocks_output, "w", encoding="utf-8") as f:
    json.dump(blocks_map, f, ensure_ascii=False, indent=2)
print(f"\nBlocks map saved: {len(blocks_map)} unique blocks → {blocks_output}")

# Extract quantities/building rights summary
quantities_output = Path("data/building_rights_summary.json")
qty_data = {}
for plan_name, data in all_data.items():
    quantities = data.get("rsQuantities", [])
    if quantities:
        qty_data[plan_name] = {
            "plan_name": data.get("planDetails", {}).get("E_NAME", ""),
            "plan_number": data.get("planDetails", {}).get("NUMB", ""),
            "area_dunam": data.get("decAreaDunam"),
            "status": data.get("unifiedStatus", ""),
            "quantities": quantities,
        }

with open(quantities_output, "w", encoding="utf-8") as f:
    json.dump(qty_data, f, ensure_ascii=False, indent=2)
print(f"Building rights saved for {len(qty_data)} plans → {quantities_output}")

# Extract instructions summary
instructions_output = Path("data/plan_instructions_summary.json")
instr_data = {}
for plan_name, data in all_data.items():
    instructions = data.get("rsInstructions", [])
    if instructions:
        instr_data[plan_name] = {
            "plan_name": data.get("planDetails", {}).get("E_NAME", ""),
            "plan_number": data.get("planDetails", {}).get("NUMB", ""),
            "status": data.get("unifiedStatus", ""),
            "explanation": data.get("recExplanation", {}),
            "instructions": instructions,
        }

with open(instructions_output, "w", encoding="utf-8") as f:
    json.dump(instr_data, f, ensure_ascii=False, indent=2)
print(f"Instructions saved for {len(instr_data)} plans → {instructions_output}")
