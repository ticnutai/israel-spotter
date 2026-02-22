"""Retry all failed downloads - both GenDocs and plan docs."""
import json, os, re, time, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

METADATA_JSON = Path("data/mavat_extracted_metadata.json")
OUTPUT_DIR = Path("data/docs")
API_BASE = "https://mavat.iplan.gov.il/rest/api"
RECAPTCHA_KEY = "6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db"
DELAY = 2.0


def sanitize_filename(name):
    name = name.strip()
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name)
    return name[:200]


def download_document(page, eid, edn, fn, ft, plan_number, output_dir):
    safe_name = sanitize_filename(fn)
    out_path = output_dir / f"{safe_name}.{ft}"

    if out_path.exists() and out_path.stat().st_size > 0:
        return "skip", out_path.name

    fn_escaped = fn.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')
    fn_escaped = fn_escaped.replace("\n", " ").replace("\r", " ")

    try:
        result = page.evaluate("""async ([apiBase, recaptchaKey, eid, fn, edn, pn]) => {
            const token = await grecaptcha.execute(recaptchaKey, {action: 'importantAction'});
            const url = apiBase + '/Attacments/?eid=' + eid
                + '&fn=' + encodeURIComponent(fn)
                + '&edn=' + edn
                + '&pn=' + pn;
            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'arraybuffer';
                xhr.setRequestHeader('Authorization', token);
                xhr.timeout = 120000;
                xhr.onload = function() {
                    if (xhr.status === 200 && xhr.response.byteLength > 0) {
                        const bytes = new Uint8Array(xhr.response);
                        let binary = '';
                        const chunkSize = 32768;
                        for (let i = 0; i < bytes.length; i += chunkSize) {
                            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                        }
                        resolve({ok: true, size: xhr.response.byteLength, data: btoa(binary)});
                    } else {
                        let errText = '';
                        try { errText = new TextDecoder().decode(xhr.response).substring(0, 200); } catch(e) {}
                        resolve({ok: false, status: xhr.status, error: errText});
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
            return "ok", f"{out_path.name} ({len(data):,} bytes)"
        else:
            return "fail", f"{safe_name}.{ft} – HTTP {result.get('status')} {result.get('error','')[:80]}"
    except Exception as e:
        return "error", f"{safe_name}.{ft} – {e}"


def get_plan_number(plan_name):
    """Get the NUMB field from plan metadata."""
    plan_dir = OUTPUT_DIR / plan_name
    plan_meta_path = plan_dir / "_plan_data.json"
    if plan_meta_path.exists():
        with open(plan_meta_path, "r", encoding="utf-8") as f:
            pd = json.load(f)
        if "planDetails" in pd and pd["planDetails"].get("NUMB"):
            return pd["planDetails"]["NUMB"].strip()
    return plan_name


def collect_failed_gen_docs():
    """Find GenDocs that failed (file not present on disk)."""
    with open(METADATA_JSON, "r", encoding="utf-8") as f:
        metadata = json.load(f)
    plans_to_download = metadata.get("plans_with_gen_docs_to_download", [])

    failed_docs = []
    for plan_info in plans_to_download:
        plan_name = plan_info["plan"]
        plan_dir = OUTPUT_DIR / plan_name
        plan_number = get_plan_number(plan_name)

        for doc in plan_info["docs"]:
            eid = doc.get("ID") or doc.get("ENTITY_DOC_ID")
            if not eid:
                continue
            eid = str(int(eid))
            edn = doc.get("PLAN_ENTITY_DOC_NUM") or doc.get("ENTITY_DOC_NUM") or "temp-default"
            edn = str(edn) if edn else "temp-default"
            ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
            doc_name = (doc.get("DOC_NAME") or doc.get("DESCRIPTION") or "gen_document").strip()
            fn = f"{plan_number}_gen_{doc_name}"
            safe_name = sanitize_filename(fn)
            out_path = plan_dir / f"{safe_name}.{ft}"

            if not out_path.exists() or out_path.stat().st_size == 0:
                failed_docs.append({
                    "plan_name": plan_name,
                    "plan_number": plan_number,
                    "eid": eid,
                    "edn": edn,
                    "fn": fn,
                    "ft": ft,
                    "doc_name": doc_name,
                    "source": "gen_docs",
                })

    return failed_docs


def collect_failed_plan_docs():
    """Find plan docs (rsPlanDocs, rsPlanDocsAdd) that failed."""
    failed_docs = []

    for plan_dir in OUTPUT_DIR.iterdir():
        if not plan_dir.is_dir() or plan_dir.name.startswith("_"):
            continue

        plan_data_path = plan_dir / "_plan_data.json"
        if not plan_data_path.exists():
            continue

        with open(plan_data_path, "r", encoding="utf-8") as f:
            pd = json.load(f)

        plan_name = plan_dir.name
        plan_number = get_plan_number(plan_name)

        # Check rsPlanDocs
        for source_key in ["rsPlanDocs", "rsPlanDocsAdd"]:
            docs = pd.get(source_key, [])
            for doc in docs:
                eid = doc.get("ENTITY_DOC_ID")
                if not eid:
                    continue
                eid = str(int(eid))
                edn = doc.get("ENTITY_DOC_NUM") or "temp-default"
                edn = str(edn) if edn else "temp-default"
                ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
                doc_name = (doc.get("DOC_NAME") or doc.get("DESCRIPTION") or "document").strip()
                fn = f"{plan_number}_{doc_name}"
                safe_name = sanitize_filename(fn)
                out_path = plan_dir / f"{safe_name}.{ft}"

                if not out_path.exists() or out_path.stat().st_size == 0:
                    failed_docs.append({
                        "plan_name": plan_name,
                        "plan_number": plan_number,
                        "eid": eid,
                        "edn": edn,
                        "fn": fn,
                        "ft": ft,
                        "doc_name": doc_name,
                        "source": source_key,
                    })

    return failed_docs


def main():
    print("=" * 60)
    print("  Retry Failed Downloads")
    print("=" * 60)

    # Collect all failed docs
    print("\nCollecting failed GenDocs...")
    gen_failed = collect_failed_gen_docs()
    print(f"  Missing GenDocs: {len(gen_failed)}")

    print("\nCollecting failed plan docs...")
    plan_failed = collect_failed_plan_docs()
    print(f"  Missing plan docs: {len(plan_failed)}")

    all_failed = gen_failed + plan_failed
    print(f"\n  Total to retry: {len(all_failed)}")

    if not all_failed:
        print("Nothing to retry!")
        return

    # Group by plan
    by_plan = {}
    for doc in all_failed:
        pn = doc["plan_name"]
        if pn not in by_plan:
            by_plan[pn] = []
        by_plan[pn].append(doc)

    print(f"  Plans with missing docs: {len(by_plan)}")
    for pn, docs in sorted(by_plan.items()):
        print(f"    {pn}: {len(docs)} docs")

    # Download with Playwright
    stats = {"ok": 0, "fail": 0, "skip": 0, "error": 0}
    retry_log = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        print("\nLoading MAVAT...")
        page.goto("https://mavat.iplan.gov.il/SV4/1/310",
                   wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(10000)
        print("Ready.\n")

        for plan_name, docs in sorted(by_plan.items()):
            plan_dir = OUTPUT_DIR / plan_name
            plan_dir.mkdir(parents=True, exist_ok=True)

            print(f"\n[{plan_name}] {len(docs)} docs to retry")

            for i, doc in enumerate(docs):
                print(f"  [{i+1}/{len(docs)}] {doc['doc_name'][:50]} ({doc['ft']}) [{doc['source']}]")
                status, msg = download_document(
                    page, doc["eid"], doc["edn"], doc["fn"], doc["ft"],
                    doc["plan_number"], plan_dir
                )
                print(f"    {status}: {msg[:80]}")
                stats[status] = stats.get(status, 0) + 1
                retry_log.append({
                    "plan": plan_name,
                    "doc": doc["doc_name"],
                    "source": doc["source"],
                    "status": status,
                })

                time.sleep(DELAY)

                # Re-navigate periodically to refresh reCAPTCHA
                if (stats["ok"] + stats["fail"] + stats["error"]) % 30 == 0 and \
                   (stats["ok"] + stats["fail"] + stats["error"]) > 0:
                    print("  Refreshing reCAPTCHA...")
                    page.reload(wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(8000)

        browser.close()

    # Save retry log
    log_path = OUTPUT_DIR / "_retry_log.json"
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump({"stats": stats, "log": retry_log}, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"RETRY SUMMARY: {stats['ok']} ok, {stats['fail']} still failed, "
          f"{stats['skip']} skip, {stats['error']} error")
    print(f"Log saved → {log_path}")


if __name__ == "__main__":
    main()
