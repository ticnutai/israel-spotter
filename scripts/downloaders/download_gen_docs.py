"""
Download rsPlanDocsGen (general plan documents) that were not downloaded before.

These are documents from the "general" section of MAVAT plan data that the
original download scripts missed. There are 873 documents across 56 plans.

Uses Playwright to get reCAPTCHA tokens for each download.
"""

import json, os, re, time, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

METADATA_JSON = Path("data/mavat_extracted_metadata.json")
OUTPUT_DIR = Path("data/docs")
API_BASE = "https://mavat.iplan.gov.il/rest/api"
RECAPTCHA_KEY = "6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db"
MAVAT_URL_TEMPLATE = "https://mavat.iplan.gov.il/SV4/1/310"

DELAY_BETWEEN_DOWNLOADS = 1.5
DELAY_BETWEEN_PLANS = 3.0


def sanitize_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name)
    return name[:200]


def download_document(page, eid, edn, fn, ft, plan_number, output_dir):
    safe_name = sanitize_filename(fn)
    out_path = output_dir / f"{safe_name}.{ft}"

    if out_path.exists() and out_path.stat().st_size > 0:
        return "skip"

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
                xhr.timeout = 60000;
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
            print(f"    OK: {out_path.name} ({len(data):,} bytes)")
            return "ok"
        else:
            print(f"    FAIL: {safe_name}.{ft} – HTTP {result.get('status')} {result.get('error','')[:100]}")
            return "fail"
    except Exception as e:
        print(f"    ERROR: {safe_name}.{ft} – {e}")
        return "error"


def main():
    with open(METADATA_JSON, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    plans_to_download = metadata.get("plans_with_gen_docs_to_download", [])
    print(f"Plans with rsPlanDocsGen: {len(plans_to_download)}")
    total_docs = sum(p["count"] for p in plans_to_download)
    print(f"Total documents to check: {total_docs}")

    all_stats = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Load MAVAT to get reCAPTCHA
        print("Loading MAVAT...")
        page.goto("https://mavat.iplan.gov.il/SV4/1/310", wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(8000)
        print("Ready.\n")

        for idx, plan_info in enumerate(plans_to_download):
            plan_name = plan_info["plan"]
            docs = plan_info["docs"]
            plan_dir = OUTPUT_DIR / plan_name

            print(f"\n[{idx+1}/{len(plans_to_download)}] {plan_name} ({len(docs)} docs)")

            # Get plan number from planDetails
            plan_meta_path = plan_dir / "_plan_data.json"
            plan_number = plan_name
            if plan_meta_path.exists():
                with open(plan_meta_path, "r", encoding="utf-8") as f:
                    pd = json.load(f)
                if "planDetails" in pd and pd["planDetails"].get("NUMB"):
                    plan_number = pd["planDetails"]["NUMB"].strip()

            plan_dir.mkdir(parents=True, exist_ok=True)
            stats = {"plan": plan_name, "ok": 0, "fail": 0, "skip": 0, "error": 0}

            for i, doc in enumerate(docs):
                eid = doc.get("ID") or doc.get("ENTITY_DOC_ID")
                if not eid:
                    continue
                eid = str(int(eid))
                edn = doc.get("PLAN_ENTITY_DOC_NUM") or doc.get("ENTITY_DOC_NUM") or "temp-default"
                if edn:
                    edn = str(edn)
                else:
                    edn = "temp-default"
                ft = (doc.get("FILE_TYPE") or "pdf").strip().lower()
                doc_name = (doc.get("DOC_NAME") or doc.get("DESCRIPTION") or "gen_document").strip()
                fn = f"{plan_number}_gen_{doc_name}"

                print(f"  [{i+1}/{len(docs)}] {doc_name[:60]} ({ft})")
                result = download_document(page, eid, edn, fn, ft, plan_number, plan_dir)
                stats[result] = stats.get(result, 0) + 1

                time.sleep(DELAY_BETWEEN_DOWNLOADS)

            all_stats.append(stats)
            print(f"  Result: {stats['ok']} ok, {stats['fail']} fail, {stats['skip']} skip")

            # Save progress
            progress_path = OUTPUT_DIR / "_gen_docs_progress.json"
            with open(progress_path, "w", encoding="utf-8") as f:
                json.dump(all_stats, f, ensure_ascii=False, indent=2)

            time.sleep(DELAY_BETWEEN_PLANS)

        browser.close()

    # Summary
    total_ok = sum(s["ok"] for s in all_stats)
    total_fail = sum(s["fail"] for s in all_stats)
    total_skip = sum(s["skip"] for s in all_stats)
    print(f"\n{'='*60}")
    print(f"SUMMARY: {total_ok} downloaded, {total_fail} failed, {total_skip} skipped")


if __name__ == "__main__":
    main()
