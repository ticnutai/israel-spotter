"""
Download all relevant iPlan GIS layers for כפר חב"ד area.

Downloads from multiple MapServer services:
  1. Xplan layers 0,2,3,4 (point/line/polygon entities + land use)
  2. TMM 3/21 (תמ"מ מחוז מרכז – all 28 layers)
  3. Road compilation
  4. Train compilation
  5. Gas compilation
  6. Gvulot (borders: district, municipal, planning areas, sub-districts)
  7. Shimour (conservation)
  8. TAMA 1 (national infrastructure)
  9. TAMA 35 (national textures)
  10. TTL blue lines (national outline plans)
  11. VATMAL (affordable housing declared compounds)

Uses spatial filtering with the כפר חב"ד extent + 2km buffer.
CRS: Israel TM Grid (EPSG 2039)
"""

import json, os, ssl, time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── SSL adapter ───────────────────────────────────────────────────
class _IplanSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)

SESSION = requests.Session()
SESSION.mount("https://ags.iplan.gov.il", _IplanSSLAdapter())
SESSION.verify = False

# ── Spatial extent of כפר חב"ד (EPSG 2039) + 2km buffer ─────────
EXTENT = {
    "xmin": 183536, "ymin": 652679,
    "xmax": 188828, "ymax": 658106,
    "spatialReference": {"wkid": 2039}
}
# Wider extent for regional layers (+5km)
WIDE_EXTENT = {
    "xmin": 180536, "ymin": 649679,
    "xmax": 191828, "ymax": 661106,
    "spatialReference": {"wkid": 2039}
}

PAGE_SIZE = 1000
OUTPUT_DIR = "data/gis_layers"

# ── Services & layers to download ─────────────────────────────────
SERVICES = [
    # Xplan layers (use WHERE filter for plan_county_name)
    {
        "name": "xplan_points",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/0",
        "where": "plan_county_name LIKE '%חב_ד%'",
        "extent": None,  # WHERE is sufficient
        "description": "ישויות נקודתיות – תכניות כפר חב\"ד",
    },
    {
        "name": "xplan_lines",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/2",
        "where": "plan_county_name LIKE '%חב_ד%'",
        "extent": None,
        "description": "ישויות קוויות – תכניות כפר חב\"ד",
    },
    {
        "name": "xplan_polygons",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/3",
        "where": "plan_county_name LIKE '%חב_ד%'",
        "extent": None,
        "description": "ישויות פוליגונליות – תכניות כפר חב\"ד",
    },
    {
        "name": "xplan_land_use",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer/4",
        "where": "plan_county_name LIKE '%חב_ד%'",
        "extent": None,
        "description": "יעודי קרקע – תכניות כפר חב\"ד",
    },

    # TMM 3/21 – Central District master plan layers (spatial filter)
    {
        "name": "tmm321_land_use",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/28",
        "where": "1=1",
        "extent": EXTENT,
        "description": "תמ\"מ 3/21 – יעודי קרקע",
    },
    {
        "name": "tmm321_roads",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/10",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – כבישים",
    },
    {
        "name": "tmm321_rail",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/12",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – מסילת ברזל",
    },
    {
        "name": "tmm321_interchanges",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/9",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – מחלפים",
    },
    {
        "name": "tmm321_noise_natbag",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/5",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – מגבלות רעש נתב\"ג",
    },
    {
        "name": "tmm321_birds_natbag",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/6",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – מגבלת ציפורים נתב\"ג",
    },
    {
        "name": "tmm321_height_limit",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/7",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – מגבלת גובה",
    },
    {
        "name": "tmm321_electricity",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/4",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – קווי חשמל",
    },
    {
        "name": "tmm321_gas",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/19",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – קו גז",
    },
    {
        "name": "tmm321_water",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/20",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – קו מים",
    },
    {
        "name": "tmm321_streams",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/21",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – נחלים",
    },
    {
        "name": "tmm321_sewage",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/22",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – אתר טיהור שפכים",
    },
    {
        "name": "tmm321_heritage",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/23",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – אתר הנצחה ואתר לאומי",
    },
    {
        "name": "tmm321_valued_area",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/24",
        "where": "1=1",
        "extent": EXTENT,
        "description": "תמ\"מ 3/21 – שטח ערכי",
    },
    {
        "name": "tmm321_waste",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/25",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – אתר אשפה",
    },
    {
        "name": "tmm321_municipal_border",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/26",
        "where": "1=1",
        "extent": EXTENT,
        "description": "תמ\"מ 3/21 – גבול מוניציפלי",
    },
    {
        "name": "tmm321_plan_border",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/27",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – גבול תכנית",
    },
    {
        "name": "tmm321_nature",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/14",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – שמורה",
    },
    {
        "name": "tmm321_stations",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/0",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – תחנות",
    },
    {
        "name": "tmm321_scenic_road",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/11",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – דרך נופית",
    },
    {
        "name": "tmm321_fire_area",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/2",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – גבול שטח אש",
    },
    {
        "name": "tmm321_transport_center",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tmm_3_21/MapServer/16",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"מ 3/21 – מרכז תחבורה",
    },

    # Road compilation
    {
        "name": "road_compilation_roads",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/road_compilation/MapServer/2",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "קומפילציית דרכים – דרכים",
    },
    {
        "name": "road_compilation_interchanges",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/road_compilation/MapServer/1",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "קומפילציית דרכים – מחלפים",
    },
    {
        "name": "road_compilation_detailed",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/road_compilation/MapServer/3",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "קומפילציית דרכים – תכניות מפורטות",
    },

    # Train compilation
    {
        "name": "train_compilation",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/train_compilation/MapServer/0",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "קומפילציית מסילות ברזל",
    },

    # Gas compilation
    {
        "name": "gas_stations",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gaz_compilation/MapServer/1",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "גז טבעי – תחנות",
    },
    {
        "name": "gas_pipelines",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gaz_compilation/MapServer/2",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "גז טבעי – תוואי הולכה",
    },
    {
        "name": "gas_fuel_pipes",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gaz_compilation/MapServer/3",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "גז טבעי – צנרות דלק",
    },
    {
        "name": "gas_survey_area",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gaz_compilation/MapServer/4",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "גז טבעי – תחום סקירה",
    },

    # Gvulot (borders)
    {
        "name": "gvulot_district",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/0",
        "where": "1=1",
        "extent": EXTENT,
        "description": "גבולות – מחוז",
    },
    {
        "name": "gvulot_municipal",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/1",
        "where": "1=1",
        "extent": EXTENT,
        "description": "גבולות – שיפוט",
    },
    {
        "name": "gvulot_local_councils",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/2",
        "where": "1=1",
        "extent": EXTENT,
        "description": "גבולות – ועדים מקומיים",
    },
    {
        "name": "gvulot_planning_areas",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/3",
        "where": "1=1",
        "extent": EXTENT,
        "description": "גבולות – מרחבי תכנון",
    },
    {
        "name": "gvulot_sub_districts",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/gvulot_retzef/MapServer/4",
        "where": "1=1",
        "extent": EXTENT,
        "description": "גבולות – נפות",
    },

    # Shimour (conservation)
    {
        "name": "shimour_points",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Shimour/MapServer/1",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "שימור – ישויות נקודתיות",
    },
    {
        "name": "shimour_polygons",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Shimour/MapServer/2",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "שימור – ישויות פוליגונליות",
    },

    # TTL blue lines (national outline plans)
    {
        "name": "ttl_blue_lines",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/ttl_all_blue_lines/MapServer/0",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "קווים כחולים – כל התת\"לים",
    },

    # VATMAL (affordable housing)
    {
        "name": "vatmal_compounds",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/vatmal_mitchamim_muchrazim/MapServer/0",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "ותמ\"ל – מתחמים מוכרזים",
    },

    # TAMA 35 (national textures)
    {
        "name": "tama35_textures",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/22",
        "where": "1=1",
        "extent": EXTENT,
        "description": "תמ\"א 35 – מרקמים",
    },
    {
        "name": "tama35_eco_corridor",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/2",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – מסדרון אקולוגי",
    },
    {
        "name": "tama35_conservation",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/6",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – מכלול שימור",
    },
    {
        "name": "tama35_roads",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/15",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – דרכים",
    },
    {
        "name": "tama35_train",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/13",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – מסילות ברזל",
    },
    {
        "name": "tama35_landscape",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/28",
        "where": "1=1",
        "extent": EXTENT,
        "description": "תמ\"א 35 – מכלולי נוף",
    },
    {
        "name": "tama35_nature_reserves",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/29",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – שמורות וגנים",
    },
    {
        "name": "tama35_forests",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Tama_35_1/MapServer/30",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – יער ויעור",
    },

    # TAMA 1 – key infrastructure layers
    {
        "name": "tama1_roads",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/26",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – דרכים",
    },
    {
        "name": "tama1_train",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/28",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – מסילות ברזל",
    },
    {
        "name": "tama1_electricity",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/14",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – קו חשמל ארצי",
    },
    {
        "name": "tama1_gas_pipeline",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/17",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – קו גז טבעי",
    },
    {
        "name": "tama1_water_storage",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/4",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – אתר איגום והחדרה",
    },
    {
        "name": "tama1_water_pipe",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/8",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – רצועת קו מים",
    },
    {
        "name": "tama1_waste",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/23",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – אתר פסולת",
    },
    {
        "name": "tama1_quarry",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/32",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – אתר כריה וחציבה",
    },
    {
        "name": "tama1_forest",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/34",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – יער",
    },
    {
        "name": "tama1_nature",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/35",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – שמורה וגן",
    },
    {
        "name": "tama1_stream",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/37",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – נחל",
    },
    {
        "name": "tama1_flood",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/39",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – שטח הצפה",
    },
    {
        "name": "tama1_water_protect",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/TAMA_1/MapServer/51",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 1 – שטח רגישות הידרולוגית",
    },

    # Drainage
    {
        "name": "drainage_projects",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tochniot_mifalei_nikuz_hok_hanikuz/MapServer/0",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "מפעלי ניקוז מאושרים",
    },

    # Raw materials
    {
        "name": "raw_materials",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/mirbatzei_chomrei_gelem/MapServer/0",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "מרבצי חומרי גלם",
    },

    # TAMA 35 environmental guidelines
    {
        "name": "tama35_env_noise",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/10",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – הנחיות סביבתיות: תחום רעש מטוסים",
    },
    {
        "name": "tama35_env_electricity",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/11",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – הנחיות סביבתיות: קו חשמל ראשי",
    },
    {
        "name": "tama35_env_water_protect",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/12",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – הנחיות סביבתיות: שימור משאבי מים",
    },
    {
        "name": "tama35_env_landscape",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/13",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – הנחיות סביבתיות: רגישות נופית-סביבתית",
    },
    {
        "name": "tama35_env_security",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/14",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – הנחיות סביבתיות: שטח בטחוני",
    },
    {
        "name": "tama35_env_recharge",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/tama35_hanchayot_svivatiot/MapServer/15",
        "where": "1=1",
        "extent": WIDE_EXTENT,
        "description": "תמ\"א 35 – הנחיות סביבתיות: אזורי החדרה ואיגום",
    },

    # Functional areas
    {
        "name": "functional_areas",
        "url": "https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/functional_area_ezoriyut_str/MapServer/0",
        "where": "1=1",
        "extent": EXTENT,
        "description": "אזורי תפקוד – תכנית אסטרטגית",
    },
]


def esri_to_geojson_geom(geom):
    """Convert Esri JSON geometry to GeoJSON geometry."""
    if not geom:
        return None
    if "rings" in geom:
        rings = geom["rings"]
        if len(rings) == 1:
            return {"type": "Polygon", "coordinates": rings}
        return {"type": "MultiPolygon", "coordinates": [rings]}
    if "paths" in geom:
        paths = geom["paths"]
        if len(paths) == 1:
            return {"type": "LineString", "coordinates": paths[0]}
        return {"type": "MultiLineString", "coordinates": paths}
    if "x" in geom and "y" in geom:
        return {"type": "Point", "coordinates": [geom["x"], geom["y"]]}
    return None


def query_layer(url, where="1=1", extent=None, out_sr=2039):
    """Query all features from a MapServer layer with pagination."""
    query_url = f"{url}/query"
    all_features = []
    last_oid = -1

    # First get count
    params = {"where": where, "returnCountOnly": "true", "f": "json"}
    if extent:
        params["geometry"] = json.dumps(extent)
        params["geometryType"] = "esriGeometryEnvelope"
        params["spatialRel"] = "esriSpatialRelIntersects"
        params["inSR"] = 2039

    try:
        r = SESSION.get(query_url, params=params, timeout=60)
        r.raise_for_status()
        count = r.json().get("count", 0)
    except Exception as e:
        print(f"    Count error: {e}")
        count = "?"

    print(f"    Features: {count}")
    if count == 0:
        return []

    while True:
        where_clause = f"({where}) AND objectid > {last_oid}" if where != "1=1" else f"objectid > {last_oid}"
        params = {
            "where": where_clause,
            "outFields": "*",
            "outSR": out_sr,
            "returnGeometry": "true",
            "resultRecordCount": PAGE_SIZE,
            "f": "json",
            "orderByFields": "objectid ASC",
        }
        if extent:
            params["geometry"] = json.dumps(extent)
            params["geometryType"] = "esriGeometryEnvelope"
            params["spatialRel"] = "esriSpatialRelIntersects"
            params["inSR"] = 2039

        try:
            r = SESSION.get(query_url, params=params, timeout=120)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"    Query error: {e}")
            break

        if data.get("error"):
            print(f"    API error: {data['error'].get('message','')}")
            break

        features = data.get("features", [])
        if not features:
            break

        for feat in features:
            geojson_geom = esri_to_geojson_geom(feat.get("geometry"))
            all_features.append({
                "type": "Feature",
                "properties": feat.get("attributes", {}),
                "geometry": geojson_geom,
            })

        # Get last objectid
        oids = [f["attributes"].get("objectid") or f["attributes"].get("OBJECTID") or f["attributes"].get("ObjectID") for f in features]
        oids = [o for o in oids if o is not None]
        if not oids:
            break
        last_oid = max(oids)

        exceeded = data.get("exceededTransferLimit", False)
        if not exceeded and len(features) < PAGE_SIZE:
            break

        time.sleep(0.5)

    return all_features


def save_geojson(features, path, name, description=""):
    geojson = {
        "type": "FeatureCollection",
        "name": name,
        "description": description,
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::2039"}},
        "features": features,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(path) / 1024
    return size_kb


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []

    print(f"Downloading {len(SERVICES)} layers...")
    print("=" * 60)

    for idx, svc in enumerate(SERVICES):
        name = svc["name"]
        url = svc["url"]
        desc = svc["description"]
        output_path = os.path.join(OUTPUT_DIR, f"{name}.geojson")

        # Skip if already downloaded
        if os.path.exists(output_path) and os.path.getsize(output_path) > 100:
            size_kb = os.path.getsize(output_path) / 1024
            print(f"[{idx+1}/{len(SERVICES)}] SKIP {name} (exists, {size_kb:.0f} KB)")
            results.append({"name": name, "description": desc, "status": "skip", "features": "?", "size_kb": size_kb})
            continue

        print(f"[{idx+1}/{len(SERVICES)}] {desc}")
        print(f"    URL: {url}")

        try:
            features = query_layer(url, where=svc["where"], extent=svc.get("extent"))
            if features:
                size_kb = save_geojson(features, output_path, name, desc)
                print(f"    Saved: {len(features)} features ({size_kb:.0f} KB)")
                results.append({"name": name, "description": desc, "status": "ok",
                                "features": len(features), "size_kb": round(size_kb, 1)})
            else:
                print(f"    No features found")
                # Save empty GeoJSON
                save_geojson([], output_path, name, desc)
                results.append({"name": name, "description": desc, "status": "empty", "features": 0, "size_kb": 0})
        except Exception as e:
            print(f"    ERROR: {e}")
            results.append({"name": name, "description": desc, "status": "error", "error": str(e)})

        time.sleep(1)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    ok = sum(1 for r in results if r["status"] == "ok")
    empty = sum(1 for r in results if r["status"] == "empty")
    skip = sum(1 for r in results if r["status"] == "skip")
    err = sum(1 for r in results if r["status"] == "error")
    total_features = sum(r.get("features", 0) for r in results if isinstance(r.get("features"), int))
    total_kb = sum(r.get("size_kb", 0) for r in results)
    print(f"  Downloaded: {ok}")
    print(f"  Empty: {empty}")
    print(f"  Skipped: {skip}")
    print(f"  Errors: {err}")
    print(f"  Total features: {total_features}")
    print(f"  Total size: {total_kb/1024:.1f} MB")

    # Save summary
    summary_path = os.path.join(OUTPUT_DIR, "_download_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nSummary saved to {summary_path}")


if __name__ == "__main__":
    main()
