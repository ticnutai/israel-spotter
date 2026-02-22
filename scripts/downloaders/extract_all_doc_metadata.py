"""
Extract full document metadata index from all _plan_data.json files.

Creates a comprehensive index of ALL document types:
  - rsPlanDocs: מסמכי תכנית עיקריים
  - rsPlanDocsAdd: מסמכים נוספים
  - rsPubDocs: מסמכי פרסום
  - rsDes: פרוטוקולים והחלטות
  - rsPlanDocsGen: מסמכים כלליים
  - rsMeetingsDocs: מסמכי ישיבות
  - rsTasrit: תשריטים

Output: data/all_documents_index.json
"""

import json, os
from pathlib import Path
from collections import defaultdict

DOCS_DIR = Path("data/docs")
OUTPUT = Path("data/all_documents_index.json")

DOC_SOURCES = [
    "rsPlanDocs", "rsPlanDocsAdd", "rsPubDocs", "rsDes",
    "rsPlanDocsGen", "rsMeetingsDocs",
]


def extract_doc_info(doc, source_type, plan_name, plan_number):
    """Extract relevant fields from a document record."""
    info = {
        "plan": plan_name,
        "plan_number": plan_number,
        "source": source_type,
    }

    # Common fields
    for field in ["ID", "DOC_NAME", "DESCRIPTION", "FILE_TYPE",
                  "INTERNAL_OPEN_DATE", "EDITING_DATE", "DOC_PAGES",
                  "RUB_DESC", "ED_DOC_TYPE"]:
        if field in doc and doc[field] is not None:
            val = doc[field]
            if isinstance(val, float) and val == int(val):
                val = int(val)
            if isinstance(val, str):
                val = val.strip()
            info[field] = val

    # rsDes-specific fields
    if source_type == "rsDes":
        for field in ["COMMITTE_NAME", "CM_NAME", "FO_NAME",
                      "MEETING_DATE", "MEETING_NO", "DISTINCT_NAME"]:
            if field in doc and doc[field] is not None:
                val = doc[field]
                if isinstance(val, str):
                    val = val.strip()
                info[field] = val

    return info


def main():
    all_docs = []
    stats = defaultdict(lambda: {"plans": 0, "docs": 0})
    plan_stats = {}

    for plan_dir in sorted(DOCS_DIR.iterdir()):
        if not plan_dir.is_dir():
            continue
        meta = plan_dir / "_plan_data.json"
        if not meta.exists():
            continue

        plan_name = plan_dir.name
        with open(meta, "r", encoding="utf-8") as f:
            pd = json.load(f)

        plan_number = pd.get("planDetails", {}).get("NUMB", plan_name)
        if isinstance(plan_number, str):
            plan_number = plan_number.strip()

        plan_doc_count = 0

        for source in DOC_SOURCES:
            docs = pd.get(source, [])
            if not docs:
                continue

            stats[source]["plans"] += 1
            stats[source]["docs"] += len(docs)

            for doc in docs:
                info = extract_doc_info(doc, source, plan_name, plan_number)
                all_docs.append(info)
                plan_doc_count += 1

        # Count actual files on disk
        actual_files = [f for f in plan_dir.iterdir()
                        if f.is_file() and f.name != "_plan_data.json"]

        plan_stats[plan_name] = {
            "plan_number": plan_number,
            "plan_name_he": pd.get("planDetails", {}).get("E_NAME", ""),
            "status": pd.get("unifiedStatus", ""),
            "area_dunam": pd.get("decAreaDunam"),
            "metadata_docs": plan_doc_count,
            "files_on_disk": len(actual_files),
            "sources": {s: len(pd.get(s, [])) for s in DOC_SOURCES if pd.get(s)},
        }

    # File type statistics
    file_types = defaultdict(int)
    for doc in all_docs:
        ft = doc.get("FILE_TYPE", "unknown")
        file_types[ft] += 1

    # Committee statistics (from rsDes)
    committees = defaultdict(int)
    for doc in all_docs:
        if doc["source"] == "rsDes":
            cm = doc.get("COMMITTE_NAME", "unknown")
            committees[cm] += 1

    output = {
        "total_documents_in_metadata": len(all_docs),
        "total_plans": len(plan_stats),
        "source_statistics": {k: dict(v) for k, v in stats.items()},
        "file_type_distribution": dict(sorted(file_types.items(), key=lambda x: -x[1])),
        "committee_distribution": dict(sorted(committees.items(), key=lambda x: -x[1])),
        "plan_statistics": plan_stats,
        "documents": all_docs,
    }

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    size_kb = os.path.getsize(OUTPUT) / 1024
    print(f"Extracted {len(all_docs)} document records from {len(plan_stats)} plans")
    print(f"Output: {OUTPUT} ({size_kb:.0f} KB)")
    print(f"\nSource statistics:")
    for source, s in stats.items():
        print(f"  {source}: {s['docs']} docs across {s['plans']} plans")
    print(f"\nFile types:")
    for ft, count in sorted(file_types.items(), key=lambda x: -x[1])[:10]:
        print(f"  {ft}: {count}")
    if committees:
        print(f"\nCommittees (from rsDes):")
        for cm, count in sorted(committees.items(), key=lambda x: -x[1])[:8]:
            print(f"  {cm}: {count}")


if __name__ == "__main__":
    main()
