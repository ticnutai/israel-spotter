"""Try to find plan boundary from IPA mavat site via proper navigation."""
import time
import json
import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

CHROMEDRIVER = os.path.expanduser(
    r"~\.wdm\drivers\chromedriver\win64\144.0.7559.133\chromedriver-win32\chromedriver.exe"
)

def create_driver():
    opts = webdriver.ChromeOptions()
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    svc = Service(executable_path=CHROMEDRIVER)
    d = webdriver.Chrome(service=svc, options=opts)
    d.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    })
    return d

driver = create_driver()
try:
    # Go to GovMap - it's the most accessible Israeli GIS with plan searchs 
    print("Opening GovMap...")
    driver.get("https://www.govmap.gov.il/")
    time.sleep(10)
    
    # Try to search in the search box
    print("Looking for search box...")
    
    # GovMap has a search input in the top bar
    search_el = driver.execute_script("""
        var inputs = document.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp.offsetParent !== null && (inp.type === 'text' || inp.type === 'search' || inp.type === '')) {
                return {found: true, index: i, id: inp.id, placeholder: inp.placeholder};
            }
        }
        return {found: false};
    """)
    print(f"Search element: {search_el}")
    
    if search_el.get('found'):
        idx = search_el['index']
        # Type the search query
        driver.execute_script(f"""
            var inp = document.querySelectorAll('input')[{idx}];
            inp.focus();
            inp.value = '';
            inp.dispatchEvent(new Event('focus', {{bubbles: true}}));
        """)
        time.sleep(1)
        
        # Use Selenium send_keys for more realistic typing
        inputs = driver.find_elements(By.TAG_NAME, 'input')
        if idx < len(inputs):
            inp = inputs[idx]
            inp.clear()
            inp.send_keys("כפר חבד")
            time.sleep(3)
            inp.send_keys(Keys.RETURN)
            time.sleep(5)
            
            # Check results
            body = driver.execute_script("return document.body.innerText.substring(0, 2000);")
            print(f"After search:\n{body[:500]}")
            
            # Get the map extent after navigation
            extent = driver.execute_script("""
                try {
                    // Try to get map center/extent from OpenLayers or other frameworks
                    if (typeof require !== 'undefined') {
                        return 'AMD require detected';
                    }
                    
                    // Look for map coordinates in URL or global state
                    var url = window.location.href;
                    if (url.includes('c=') || url.includes('x=') || url.includes('lon=')) {
                        return 'Coordinates in URL: ' + url;
                    }
                    
                    // Try to access angular scope
                    var app = document.querySelector('[ng-app], [data-ng-app]');
                    if (app) return 'Angular app found: ' + (app.tagName || 'unknown');
                    
                    // Try React/Vue
                    var react = document.querySelector('[data-reactroot]');
                    if (react) return 'React app found';
                    
                    return 'URL: ' + url;
                } catch(e) {
                    return 'Error: ' + e;
                }
            """)
            print(f"Map info: {extent}")
    
    # Try to navigate directly to Kfar Chabad coordinates
    print("\nNavigating to Kfar Chabad coordinates...")
    driver.get("https://www.govmap.gov.il/?c=186500,655500&z=5&b=1&lay=TABA_ACTIVE_BORDER")
    time.sleep(10)
    
    url_after = driver.current_url
    print(f"URL after: {url_after}")
    
    # Try to get plan boundary data from the govmap API - this time from within
    # the govmap.gov.il origin
    print("\n=== Trying plan search from GovMap origin ===")
    
    # First find available API endpoints
    api_test = driver.execute_script("""
        return new Promise(function(resolve) {
            var results = [];
            
            // Try the internal API
            var endpoints = [
                '/api/layers/GetTabaByBbox?xmin=185000&ymin=654000&xmax=188000&ymax=657000',
                '/api/search?q=' + encodeURIComponent('כפר חבד'),
                '/api/layers/GetByGush?gush=6256',
            ];
            
            var promises = endpoints.map(function(ep) {
                return fetch(ep, {credentials: 'same-origin'})
                    .then(function(r) { return r.text().then(function(t) { return ep + ': ' + r.status + ' - ' + t.substring(0, 300); }); })
                    .catch(function(e) { return ep + ': fetch error - ' + e; });
            });
            
            Promise.all(promises).then(function(r) { resolve(r.join('\\n\\n')); });
        });
    """)
    print(api_test)
    
    # Also try XHR to govmap internal services
    print("\n=== XHR to GovMap services ===")
    xhr_test = driver.execute_script("""
        return new Promise(function(resolve) {
            // Try the Tlda API for plan search
            fetch('https://es.govmap.gov.il/TldaApi/api/DetailsByQuery', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    "Query": "כפר חבד",
                    "Token": "",
                    "LayerIds": ["TABA_ACTIVE_BORDER"],
                    "Extent": {
                        "XMin": 185000,
                        "YMin": 654000,
                        "XMax": 188000,
                        "YMax": 657000
                    },
                    "Rows": 20
                }),
                credentials: 'include'
            })
            .then(function(r) { return r.text(); })
            .then(function(t) { resolve('TLDA: ' + t.substring(0, 3000)); })
            .catch(function(e) { resolve('TLDA error: ' + e); });
        });
    """)
    print(xhr_test[:1500])

finally:
    driver.quit()
