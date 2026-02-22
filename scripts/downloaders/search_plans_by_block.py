"""
Search MAVAT for ALL plans by block number for כפר חב"ד.
Uses direct API calls from browser context with reCaptcha tokens.
Then downloads documents for any new plans found.
"""
from playwright.sync_api import sync_playwright
import json, time, os

# Block numbers from existing plan data for כפר חב"ד
BLOCKS = ['6256', '6258', '6260', '6261', '6262', '6269', '6272', '6280', '7187', '7188', '7196', '7311']

OUTPUT_FILE = "data/all_plans_by_block.json"
os.makedirs("data", exist_ok=True)

all_plans = {}  # plan_number -> plan_info
block_plan_map = {}  # block -> [plan_numbers]

SEARCH_JS = """
async (params) => {
    const [blockNumber, fromResult, toResult, pageNum] = params;
    
    const token = await grecaptcha.execute(
        '6LeUKkMoAAAAAH4UacB4zewg4ult8Rcriv-ce0Db', 
        {action: 'importantAction'}
    );
    
    const body = {
        freeSearchLut: {DESCRIPTION: "הכל", CODE: -1},
        searchName: "",
        favored: false,
        code: -1,
        text: "",
        blockNumber: blockNumber,
        fromResult: fromResult,
        toResult: toResult,
        _page: pageNum,
        token: token
    };
    
    const resp = await fetch('https://mavat.iplan.gov.il/rest/api/sv3/Search', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    
    return await resp.json();
}
"""


def search_single_block(page, block_number):
    """Search for all plans associated with a block number."""
    plans = []
    page_size = 100
    page_num = 1
    
    while True:
        from_result = (page_num - 1) * page_size + 1
        to_result = page_num * page_size
        
        result = page.evaluate(SEARCH_JS, [block_number, from_result, to_result, page_num])
        
        if not isinstance(result, list) or len(result) == 0:
            print(f"  Block {block_number}: unexpected response format", flush=True)
            break
        
        # Type "1" contains plan results
        plan_results = None
        for item in result:
            if item.get('type') == '1':
                plan_results = item.get('result', {})
                break
        
        if plan_results is None:
            print(f"  Block {block_number}: no type=1 in response", flush=True)
            break
        
        total = plan_results.get('intRecordsCount', 0)
        dt_results = plan_results.get('dtResults', [])
        
        for r in dt_results:
            plan_num = r.get('ENTITY_NUMBER', '')
            if plan_num:
                plans.append({
                    'PL_NUMBER': plan_num,
                    'PL_NAME': r.get('ENTITY_NAME', ''),
                    'MP_ID': r.get('MP_ID', ''),
                    'PLAN_ID': r.get('PLAN_ID', ''),
                    'ENTITY_TYPE': r.get('ENTITY_TYPE', ''),
                    'STATION_DESC': r.get('STATION_DESC', ''),
                    'LOCATION': r.get('DistrictAreaDesc', ''),
                    'STATUS': r.get('LAST_UPDATE_STATUS', ''),
                })
        
        if page_num == 1:
            print(f"  Block {block_number}: {total} total plans", flush=True)
        
        if len(plans) >= total or len(dt_results) == 0:
            break
        
        page_num += 1
        time.sleep(1.5)
    
    return plans


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})

    print("Loading MAVAT SV3...", flush=True)
    page.goto("https://mavat.iplan.gov.il/SV3", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(6000)
    print("Ready.\n", flush=True)

    for block in BLOCKS:
        try:
            plans = search_single_block(page, block)
            
            plan_nums = []
            for plan in plans:
                pn = plan['PL_NUMBER']
                plan_nums.append(pn)
                if pn not in all_plans:
                    all_plans[pn] = plan
            
            block_plan_map[block] = list(set(plan_nums))
            print(f"  Got {len(plans)} plans, {len(all_plans)} unique total\n", flush=True)
            
        except Exception as e:
            print(f"  ERROR block {block}: {e}\n", flush=True)
        
        time.sleep(2)

    browser.close()

    # Load existing plan numbers
    existing_plans = set()
    geojson_file = "data/taba_kfar_chabad.geojson"
    if os.path.exists(geojson_file):
        with open(geojson_file, 'r', encoding='utf-8') as f:
            gj = json.load(f)
        for feat in gj.get('features', []):
            pn = feat['properties'].get('pl_number', '')
            if pn:
                existing_plans.add(pn)

    new_plans = set(all_plans.keys()) - existing_plans

    print(f"\n{'='*60}", flush=True)
    print(f"SUMMARY", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"Blocks searched: {len(BLOCKS)}", flush=True)
    print(f"Total unique plans found: {len(all_plans)}", flush=True)
    print(f"Already in our collection: {len(existing_plans & set(all_plans.keys()))}", flush=True)
    print(f"NEW plans to download: {len(new_plans)}", flush=True)
    
    if new_plans:
        print(f"\nNew plans:", flush=True)
        for pn in sorted(new_plans):
            p = all_plans[pn]
            print(f"  {pn}: {p.get('PL_NAME', '')} [{p.get('STATUS', '')}]", flush=True)
    
    # Save results
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            'blocks_searched': BLOCKS,
            'block_plan_map': block_plan_map,
            'total_unique_plans': len(all_plans),
            'new_plans_count': len(new_plans),
            'existing_plans_count': len(existing_plans & set(all_plans.keys())),
            'new_plan_numbers': sorted(list(new_plans)),
            'plans': all_plans
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\nSaved to {OUTPUT_FILE}", flush=True)
