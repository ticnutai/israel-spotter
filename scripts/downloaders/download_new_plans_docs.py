"""
Download all plan documents for the 46 NEW plans found by block search.

Reads plan numbers and MP_IDs from data/all_plans_by_block.json.
For each new plan:
  1. Navigate to MAVAT SV4 page to load Angular app + reCaptcha
  2. Intercept API response to get plan data JSON
  3. Extract document metadata from rsPlanDocs, rsPlanDocsAdd, rsPubDocs, rsDes
  4. Download each document using /rest/api/Attacments/ with fresh reCaptcha token
  5. Save to data/docs/{plan_number}/{filename}.{ext}
"""

import json, os, re, time, sys, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

# ── Configuration ──────────────────────────────────────────────────
PLANS_JSON   = Path("data/all_plans_by_block.json")
OUTPUT_DIR   = Path("data/docs")
API_BASE     = "https://mavat.iplan.gov.il/rest/api"
RECAPTCHA_KEY = "6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db"

# Tab 310 = מסמכי תכנית (plan documents tab)
MAVAT_URL_TEMPLATE = "https://mavat.iplan.gov.il/SV4/1/{mp_id}/310"

# Rate limiting
DELAY_BETWEEN_DOWNLOADS = 1.5   # seconds between file downloads
DELAY_BETWEEN_PLANS     = 3.0   # seconds between plans

# Resume support – skip plans that already have _plan_data.json + docs
SKIP_COMPLETED_PLANS = True


def sanitize_filename(name: str) -> str:
    """Remove illegal filename characters."""
    name = name.strip()
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name)
    return name[:200]


def extract_documents(plan_data: dict, plan_number: str) -> list[dict]:
    """Extract downloadable document records from plan data.
    
    Returns list of dicts with keys: eid, edn, fn, ft, section, doc_name
    """
    docs = []
    seen_eids = set()

    # 1. rsPlanDocs – main plan documents (הוראות, תשריט)
    for doc in plan_data.get("rsPlanDocs", []):
        eid = doc.get("ID")
        if not eid:
            continue
        eid = str(int(eid))
        edn = doc.get("PLAN_ENTITY_DOC_NUM", "temp-default") or "temp-default"
        ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
        doc_name = (doc.get("DOC_NAME") or "document").strip()
        fn = f"{plan_number}_{doc_name}"
        docs.append({"eid": eid, "edn": edn, "fn": fn, "ft": ft,
                      "section": "rsPlanDocs", "doc_name": doc_name})
        seen_eids.add(eid)

    # 2. rsPlanDocsAdd – additional documents (DWG, SHP, etc.)
    for doc in plan_data.get("rsPlanDocsAdd", []):
        eid = doc.get("ID")
        if not eid:
            continue
        eid = str(int(eid))
        if eid in seen_eids:
            continue
        edn = doc.get("PLAN_ENTITY_DOC_NUM", "temp-default") or "temp-default"
        ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
        doc_name = (doc.get("DOC_NAME") or "document").strip()
        fn = f"{plan_number}_{doc_name}"
        docs.append({"eid": eid, "edn": edn, "fn": fn, "ft": ft,
                      "section": "rsPlanDocsAdd", "doc_name": doc_name})
        seen_eids.add(eid)

    # 3. rsPubDocs – publication documents
    for doc in plan_data.get("rsPubDocs", []):
        eid = doc.get("PLAN_ENTITY_DOC_ID")
        if not eid:
            continue
        eid = str(int(eid))
        if eid in seen_eids:
            continue
        edn = "temp-default"
        ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
        doc_name = (doc.get("DOC_NAME") or "publication").strip()
        fn = f"{plan_number}_{doc_name}"
        docs.append({"eid": eid, "edn": edn, "fn": fn, "ft": ft,
                      "section": "rsPubDocs", "doc_name": doc_name})
        seen_eids.add(eid)

    # 4. rsDes – decision meeting protocols
    for doc in plan_data.get("rsDes", []):
        for suffix in ["", "1", "_10", "_110", "_20"]:
            eid_key = f"ENTITY_DOC_ID{suffix}"
            ft_key = f"FILE_TYPE{suffix}"
            eid = doc.get(eid_key)
            if not eid:
                continue
            eid = str(int(eid))
            if eid in seen_eids:
                continue
            edn = doc.get(f"ENTITY_DOC_NUM{suffix}", "temp-default") or "temp-default"
            ft = (doc.get(ft_key) or "pdf").strip().lower()
            meeting_date = (doc.get("MEETING_DATE") or "").strip()
            committee = (doc.get("CM_NAME") or "committee").strip()
            label = f"{'פרוטוקול' if not suffix else 'החלטה'}"
            fn = f"{plan_number}_{label}_{meeting_date}"
            docs.append({"eid": eid, "edn": edn, "fn": fn, "ft": ft,
                          "section": "rsDes", "doc_name": f"{label} {committee} {meeting_date}"})
            seen_eids.add(eid)

    return docs


def download_document(page, doc: dict, plan_number: str, output_dir: Path) -> bool:
    """Download a single document using XHR with fresh reCaptcha token."""
    eid = doc["eid"]
    edn = doc["edn"]
    fn = doc["fn"]
    ft = doc["ft"]

    safe_name = sanitize_filename(fn)
    out_path = output_dir / f"{safe_name}.{ft}"

    if out_path.exists() and out_path.stat().st_size > 0:
        print(f"    SKIP (exists): {out_path.name}")
        return True

    fn_escaped = fn.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')
    fn_escaped = fn_escaped.replace("\n", " ").replace("\r", " ")

    try:
        result = page.evaluate("""async ([apiBase, recaptchaKey, eid, fn, edn, pn]) => {
            const token = await grecaptcha.execute(recaptchaKey, {action: 'importantAction'});
            
            const url = apiBase + '/Attacments/?eid=' + eid
                + '&fn=' + encodeURIComponent(fn)
                + '&edn=' + edn
                + '&pn=' + pn;
            
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'arraybuffer';
                xhr.setRequestHeader('Authorization', token);
                xhr.timeout = 60000;
                xhr.onload = function() {
                    if (xhr.status === 200 && xhr.response.byteLength > 0) {
                        const bytes = new Uint8Array(xhr.response);
                        let binary = '';
                        const chunkSize = 32768;
                        for (let i = 0; i < bytes.length; i += chunkSize) {
                            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                        }
                        resolve({
                            ok: true,
                            status: xhr.status,
                            size: xhr.response.byteLength,
                            data: btoa(binary),
                            ct: xhr.getResponseHeader('Content-Type')
                        });
                    } else {
                        let errText = '';
                        try {
                            const dec = new TextDecoder();
                            errText = dec.decode(xhr.response).substring(0, 200);
                        } catch(e) {}
                        resolve({
                            ok: false,
                            status: xhr.status,
                            size: xhr.response ? xhr.response.byteLength : 0,
                            error: errText
                        });
                    }
                };
                xhr.onerror = () => resolve({ok: false, status: 0, error: 'network error'});
                xhr.ontimeout = () => resolve({ok: false, status: 0, error: 'timeout'});
                xhr.send();
            });
        }""", [API_BASE, RECAPTCHA_KEY, eid, fn_escaped, edn, plan_number])

        if result.get("ok"):
            data = base64.b64decode(result["data"])
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(data)
            print(f"    OK: {out_path.name} ({len(data):,} bytes)")
            return True
        else:
            print(f"    FAIL: {safe_name}.{ft} – HTTP {result.get('status')} "
                  f"size={result.get('size')} {result.get('error','')[:100]}")
            return False

    except Exception as e:
        print(f"    ERROR: {safe_name}.{ft} – {e}")
        return False


def process_plan(page, mp_id: str, plan_number: str) -> dict:
    """Process a single plan: load page, get plan data, download all docs."""
    url = MAVAT_URL_TEMPLATE.format(mp_id=mp_id)
    print(f"\n{'='*60}")
    print(f"Plan: {plan_number}  (mp_id={mp_id})")
    print(f"  URL: {url}")

    # Check if already completed
    safe_plan = sanitize_filename(plan_number)
    plan_dir = OUTPUT_DIR / safe_plan
    meta_path = plan_dir / "_plan_data.json"

    if SKIP_COMPLETED_PLANS and meta_path.exists():
        # Already have plan data - count existing files
        existing = list(plan_dir.glob("*.*"))
        existing = [f for f in existing if f.name != "_plan_data.json"]
        if existing:
            print(f"  SKIP (already processed, {len(existing)} files)")
            return {"plan": plan_number, "downloaded": 0, "failed": 0,
                    "skipped": len(existing), "status": "already_done"}

    # Intercept the API response to capture plan data
    plan_data = {}
    def on_response(response):
        nonlocal plan_data
        try:
            if f"/SV4/1?mid={mp_id}" in response.url and response.status == 200:
                plan_data = response.json()
        except:
            pass

    page.on("response", on_response)

    try:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(8000)
    except Exception as e:
        print(f"  Page load failed: {e}")
        page.remove_listener("response", on_response)
        return {"plan": plan_number, "downloaded": 0, "failed": 0,
                "skipped": 0, "error": str(e)}

    page.remove_listener("response", on_response)

    if not plan_data:
        print(f"  WARNING: No plan data captured for {plan_number}")
        return {"plan": plan_number, "downloaded": 0, "failed": 0,
                "skipped": 0, "warning": "no_data"}

    # Use plan number from the data if available
    actual_plan_number = plan_number
    if "planDetails" in plan_data and plan_data["planDetails"].get("NUMB"):
        actual_plan_number = plan_data["planDetails"]["NUMB"].strip()

    # Extract all documents
    documents = extract_documents(plan_data, actual_plan_number)
    print(f"  Found {len(documents)} documents")

    if not documents:
        # Still save metadata even if no docs
        safe_plan = sanitize_filename(actual_plan_number)
        plan_dir = OUTPUT_DIR / safe_plan
        plan_dir.mkdir(parents=True, exist_ok=True)
        meta_path = plan_dir / "_plan_data.json"
        if not meta_path.exists():
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(plan_data, f, ensure_ascii=False, indent=2)
        return {"plan": plan_number, "downloaded": 0, "failed": 0, "skipped": 0}

    # Create output directory
    safe_plan = sanitize_filename(actual_plan_number)
    plan_dir = OUTPUT_DIR / safe_plan
    plan_dir.mkdir(parents=True, exist_ok=True)

    # Save plan metadata
    meta_path = plan_dir / "_plan_data.json"
    if not meta_path.exists():
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(plan_data, f, ensure_ascii=False, indent=2)

    # Download each document
    stats = {"plan": plan_number, "actual_plan": actual_plan_number,
             "downloaded": 0, "failed": 0, "skipped": 0,
             "total_docs": len(documents)}
    for i, doc in enumerate(documents):
        safe_name = sanitize_filename(doc["fn"])
        out_path = plan_dir / f"{safe_name}.{doc['ft']}"
        if out_path.exists() and out_path.stat().st_size > 0:
            print(f"  [{i+1}/{len(documents)}] SKIP: {out_path.name}")
            stats["skipped"] += 1
            continue

        print(f"  [{i+1}/{len(documents)}] {doc['section']}: {doc['doc_name'][:50]} ({doc['ft']})")
        ok = download_document(page, doc, actual_plan_number, plan_dir)
        if ok:
            stats["downloaded"] += 1
        else:
            stats["failed"] += 1
        time.sleep(DELAY_BETWEEN_DOWNLOADS)

    return stats


def main():
    # Load plans from search results
    with open(PLANS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    new_plan_numbers = data["new_plan_numbers"]
    all_plans = data["plans"]

    print(f"Total new plans to download: {len(new_plan_numbers)}")

    # Build plan list with mp_ids
    plans = []
    for pn in sorted(new_plan_numbers):
        mp_id = str(all_plans[pn]["MP_ID"])
        plans.append({"mp_id": mp_id, "pl_number": pn})

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Start Playwright
    all_stats = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        for idx, plan in enumerate(plans):
            print(f"\n[{idx+1}/{len(plans)}] Processing {plan['pl_number']}...")
            try:
                stats = process_plan(page, plan["mp_id"], plan["pl_number"])
                all_stats.append(stats)
                print(f"  Result: {stats['downloaded']} downloaded, "
                      f"{stats['failed']} failed, {stats['skipped']} skipped")
            except Exception as e:
                print(f"  PLAN ERROR: {e}")
                all_stats.append({"plan": plan["pl_number"], "downloaded": 0,
                                  "failed": 0, "skipped": 0, "error": str(e)})

            # Save progress after each plan
            progress_path = OUTPUT_DIR / "_new_plans_progress.json"
            with open(progress_path, "w", encoding="utf-8") as f:
                json.dump(all_stats, f, ensure_ascii=False, indent=2)

            if idx < len(plans) - 1:
                time.sleep(DELAY_BETWEEN_PLANS)

        browser.close()

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    total_dl = sum(s["downloaded"] for s in all_stats)
    total_fail = sum(s["failed"] for s in all_stats)
    total_skip = sum(s["skipped"] for s in all_stats)
    plans_with_docs = sum(1 for s in all_stats
                          if s["downloaded"] > 0 or s["skipped"] > 0)
    plans_no_data = sum(1 for s in all_stats if s.get("warning") == "no_data")
    plans_error = sum(1 for s in all_stats if "error" in s)

    print(f"Plans processed: {len(all_stats)}")
    print(f"Plans with documents: {plans_with_docs}")
    print(f"Plans with no data: {plans_no_data}")
    print(f"Plans with errors: {plans_error}")
    print(f"Documents downloaded: {total_dl}")
    print(f"Documents failed: {total_fail}")
    print(f"Documents skipped (already exist): {total_skip}")

    # Save final summary
    summary_path = OUTPUT_DIR / "_new_plans_download_summary.json"
    summary = {
        "total_plans": len(all_stats),
        "plans_with_docs": plans_with_docs,
        "plans_no_data": plans_no_data,
        "plans_with_errors": plans_error,
        "total_downloaded": total_dl,
        "total_failed": total_fail,
        "total_skipped": total_skip,
        "details": all_stats
    }
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\nSummary saved to {summary_path}")


if __name__ == "__main__":
    main()
