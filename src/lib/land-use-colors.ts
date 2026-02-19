/**
 * Official land-use designation colors from the Israeli Planning Authority (מנהל התכנון)
 * Based on the official "סיווגי יעודי קרקע" document (2024).
 *
 * Each entry maps a code to a Hebrew name and its official color (border + fill).
 */

export interface LandUseDesignation {
  code: number;
  name: string;
  border: string;
  fill: string;
  category: string;
}

export const LAND_USE_DESIGNATIONS: LandUseDesignation[] = [
  // ── מגורים (Residential) ──
  { code: 10,   name: "מגורים",           border: "#d4a017", fill: "#ffe4a0", category: "מגורים" },
  { code: 20,   name: "מגורים א׳",        border: "#e6c44d", fill: "#fff2cc", category: "מגורים" },
  { code: 60,   name: "מגורים ב׳",        border: "#e6a800", fill: "#ffcc00", category: "מגורים" },
  { code: 100,  name: "מגורים ג׳",        border: "#cc7a00", fill: "#ff9900", category: "מגורים" },
  { code: 140,  name: "מגורים ד׳",        border: "#cc3300", fill: "#e63900", category: "מגורים" },
  { code: 145,  name: "מגורים ה׳",        border: "#993300", fill: "#b34700", category: "מגורים" },
  { code: 150,  name: "דיור מיוחד",       border: "#cc3333", fill: "#e65c5c", category: "מגורים" },
  { code: 160,  name: "מגורים כפרי",      border: "#4da64d", fill: "#80cc80", category: "מגורים" },
  { code: 170,  name: "משק עזר",          border: "#2d862d", fill: "#5cb85c", category: "מגורים" },

  // ── תעסוקה (Employment) ──
  { code: 200,  name: "תעסוקה",           border: "#cc00cc", fill: "#ff00ff", category: "תעסוקה" },
  { code: 210,  name: "מסחר",             border: "#999999", fill: "#bfbfbf", category: "תעסוקה" },
  { code: 220,  name: "משרדים",           border: "#7733b3", fill: "#9966cc", category: "תעסוקה" },
  { code: 230,  name: "תעשיה",            border: "#9933cc", fill: "#cc66ff", category: "תעסוקה" },
  { code: 240,  name: "אחסנה",            border: "#cc3399", fill: "#e680bf", category: "תעסוקה" },
  { code: 250,  name: "תעשיה עתירת ידע",  border: "#8033cc", fill: "#b380e6", category: "תעסוקה" },
  { code: 260,  name: "תעשיה קלה ומלאכה", border: "#996699", fill: "#bf8fbf", category: "תעסוקה" },
  { code: 280,  name: "מתקנים הנדסיים",   border: "#3333cc", fill: "#6666e6", category: "תעסוקה" },
  { code: 290,  name: "עירוני מעורב",     border: "#808080", fill: "#a6a6a6", category: "תעסוקה" },
  { code: 300,  name: "מבני משק",         border: "#669966", fill: "#8fbf8f", category: "תעסוקה" },
  { code: 750,  name: "גן אירועים",       border: "#00cc00", fill: "#33ff33", category: "תעסוקה" },
  { code: 972,  name: "מרכז לוגיסטי",     border: "#997acc", fill: "#b399d9", category: "תעסוקה" },

  // ── מבנים ומוסדות ציבור (Public buildings) ──
  { code: 400,  name: "מבנים ומוסדות ציבור", border: "#3366cc", fill: "#809fcc", category: "מוסדות ציבור" },

  // ── תיירות (Tourism) ──
  { code: 600,  name: "תיירות",           border: "#cc6699", fill: "#e699bf", category: "תיירות" },
  { code: 610,  name: "אירוח כפרי",       border: "#e68080", fill: "#f2b3b3", category: "תיירות" },
  { code: 620,  name: "מלונאות",          border: "#cc3399", fill: "#e680bf", category: "תיירות" },
  { code: 630,  name: "אטרקציה תיירותית", border: "#3366cc", fill: "#6699e6", category: "תיירות" },

  // ── קרקע חקלאית ושטחים פתוחים (Agricultural & open spaces) ──
  { code: 650,  name: "שטחים פתוחים",     border: "#99ccff", fill: "#cce6ff", category: "שטחים פתוחים" },
  { code: 660,  name: "קרקע חקלאית",      border: "#80cc80", fill: "#b3e6b3", category: "שטחים פתוחים" },
  { code: 661,  name: "חקלאי פתוח",       border: "#99cc66", fill: "#c2e699", category: "שטחים פתוחים" },
  { code: 670,  name: "שטח ציבורי פתוח",  border: "#66cc33", fill: "#99e666", category: "שטחים פתוחים" },
  { code: 680,  name: "פרטי פתוח",        border: "#339966", fill: "#66bf99", category: "שטחים פתוחים" },
  { code: 690,  name: "ספורט ונופש",      border: "#8b6914", fill: "#b89948", category: "שטחים פתוחים" },
  { code: 700,  name: "פארק/גן ציבורי",   border: "#669933", fill: "#8fbf5c", category: "שטחים פתוחים" },
  { code: 710,  name: "יער",              border: "#006600", fill: "#009900", category: "שטחים פתוחים" },
  { code: 711,  name: "יער נטע אדם",      border: "#668c33", fill: "#8fb35c", category: "שטחים פתוחים" },
  { code: 712,  name: "יער טבעי",         border: "#4d6600", fill: "#6b8c00", category: "שטחים פתוחים" },
  { code: 713,  name: "יער פארק",         border: "#99cc00", fill: "#ccff33", category: "שטחים פתוחים" },
  { code: 720,  name: "שמורת טבע",        border: "#669933", fill: "#8fbf5c", category: "שטחים פתוחים" },
  { code: 730,  name: "גן לאומי",         border: "#669933", fill: "#8fbf5c", category: "שטחים פתוחים" },
  { code: 740,  name: "נחל/תעלת נחל",     border: "#66ccff", fill: "#99e6ff", category: "שטחים פתוחים" },
  { code: 760,  name: "טיילת",            border: "#cc0033", fill: "#e6335c", category: "שטחים פתוחים" },
  { code: 770,  name: "חוף רחצה",         border: "#669933", fill: "#8fbf5c", category: "שטחים פתוחים" },
  { code: 773,  name: "מרחב ימי פתוח",    border: "#0099cc", fill: "#33ccff", category: "שטחים פתוחים" },
  { code: 780,  name: "כיכר עירונית",      border: "#009966", fill: "#33cc99", category: "שטחים פתוחים" },

  // ── תחבורה (Transportation) ──
  { code: 800,  name: "תחבורה",           border: "#cc3366", fill: "#e6809f", category: "תחבורה" },
  { code: 810,  name: "מרכז תחבורה",      border: "#cc3366", fill: "#e68099", category: "תחבורה" },
  { code: 820,  name: "דרך מאושרת",       border: "#cccc33", fill: "#e6e666", category: "תחבורה" },
  { code: 830,  name: "דרך מוצעת",        border: "#cc3366", fill: "#e6809f", category: "תחבורה" },
  { code: 835,  name: "תחבורה וכיכר עירונית", border: "#cc6699", fill: "#e699bf", category: "תחבורה" },
  { code: 840,  name: "דרך משולבת",       border: "#cccc00", fill: "#e6e633", category: "תחבורה" },
  { code: 850,  name: "דרך ו/או טיפול נופי", border: "#cc6633", fill: "#e69966", category: "תחבורה" },
  { code: 855,  name: "מסילה ו/או טיפול נופי", border: "#6699cc", fill: "#99bfe6", category: "תחבורה" },
  { code: 860,  name: "שביל",             border: "#009999", fill: "#33cccc", category: "תחבורה" },
  { code: 861,  name: "שביל רב קיבולת",   border: "#669933", fill: "#8fbf5c", category: "תחבורה" },
  { code: 870,  name: "חניון",            border: "#cc6699", fill: "#e699bf", category: "תחבורה" },
  { code: 880,  name: "מסילת ברזל מאושרת", border: "#666666", fill: "#999999", category: "תחבורה" },
  { code: 890,  name: "מסילת ברזל מוצעת",  border: "#669966", fill: "#99bf99", category: "תחבורה" },
  { code: 900,  name: "שטח לתפעול מסילה",  border: "#996633", fill: "#bf8f5c", category: "תחבורה" },
  { code: 902,  name: "תחנת תחבורה ציבורית", border: "#cc0033", fill: "#e6335c", category: "תחבורה" },
  { code: 903,  name: "דרך לתחבורה ציבורית", border: "#cc0000", fill: "#ff0000", category: "תחבורה" },
  { code: 910,  name: "תחנת תדלוק",       border: "#999999", fill: "#bfbfbf", category: "תחבורה" },
  { code: 920,  name: "מרכז להדרכת נהיגה", border: "#993333", fill: "#bf5c5c", category: "תחבורה" },
  { code: 930,  name: "מפגש דרך-מסילה",   border: "#6666cc", fill: "#9999e6", category: "תחבורה" },
  { code: 931,  name: "מעגנה תחום יבשתי",  border: "#6699cc", fill: "#99bfe6", category: "תחבורה" },
  { code: 932,  name: "מעגנה תחום ימי",    border: "#003399", fill: "#3366cc", category: "תחבורה" },
  { code: 933,  name: "נמל",              border: "#808080", fill: "#b3b3b3", category: "תחבורה" },
  { code: 935,  name: "נמל תעופה כללי",    border: "#66ccff", fill: "#99e6ff", category: "תחבורה" },
  { code: 936,  name: "נמל תעופה מסלולים",  border: "#3399cc", fill: "#66bfe6", category: "תחבורה" },
  { code: 937,  name: "נמל תעופה אזורי שירות", border: "#6699cc", fill: "#99bfe6", category: "תחבורה" },
  { code: 940,  name: "דרך נופית",         border: "#336699", fill: "#6699cc", category: "תחבורה" },
  { code: 971,  name: "שדה תעופה",         border: "#99cc99", fill: "#c2e6c2", category: "תחבורה" },

  // ── נושאים שונים (Miscellaneous) ──
  { code: 950,  name: "שטח לתכנון בעתיד",  border: "#999999", fill: "#cccccc", category: "שונות" },
  { code: 955,  name: "רצועת תשתיות",      border: "#669966", fill: "#99bf99", category: "שונות" },
  { code: 960,  name: "כריה חציבה",        border: "#993333", fill: "#cc6666", category: "שונות" },
  { code: 970,  name: "פסולת",            border: "#339999", fill: "#66cccc", category: "שונות" },
  { code: 980,  name: "בית קברות",         border: "#9966cc", fill: "#bf99e6", category: "שונות" },
  { code: 990,  name: "מחנה צבאי",         border: "#999933", fill: "#b3b35c", category: "שונות" },
  { code: 994,  name: "גבול הודעה בדבר הכנת תכנית", border: "#003399", fill: "#ffffff", category: "שונות" },
  { code: 996,  name: "מגבלות בניה ופיתוח", border: "#66cccc", fill: "#99e6e6", category: "שונות" },
  { code: 997,  name: "מגבלות בניה ופיתוח ב׳", border: "#66cc99", fill: "#99e6c2", category: "שונות" },
  { code: 999,  name: "שטח שהתכנית אינה חלה עליו", border: "#0066cc", fill: "#ffffff", category: "שונות" },
  { code: 5707, name: "אתר הנצחה",         border: "#cc9933", fill: "#e6bf66", category: "שטחים פתוחים" },

  // ── מגורים ייעודים נוספים (Mixed-use residential) ──
  { code: 1000, name: "מגורים ומסחר",      border: "#cc9933", fill: "#e6bf66", category: "מגורים מעורב" },
  { code: 1050, name: "מגורים, מסחר ותעסוקה", border: "#cc6699", fill: "#e699bf", category: "מגורים מעורב" },
  { code: 1100, name: "מגורים ותעסוקה",    border: "#cc66cc", fill: "#e699e6", category: "מגורים מעורב" },
  { code: 1200, name: "מגורים ומשרדים",    border: "#9966cc", fill: "#bf99e6", category: "מגורים מעורב" },
  { code: 1211, name: "מגורים ותעשיה עתירת ידע", border: "#cc66cc", fill: "#e699e6", category: "מגורים מעורב" },
  { code: 1221, name: "מגורים ומתקנים הנדסיים", border: "#6666cc", fill: "#9999e6", category: "מגורים מעורב" },
  { code: 1250, name: "מגורים ומבנים ומוסדות ציבור", border: "#cc9933", fill: "#e6bf66", category: "מגורים מעורב" },
  { code: 1311, name: "מגורים ותיירות",    border: "#cc6699", fill: "#e699bf", category: "מגורים מעורב" },
  { code: 1321, name: "מגורים ותחבורה",    border: "#cc6699", fill: "#e699bf", category: "מגורים מעורב" },
  { code: 1350, name: "מגורים ודיור מיוחד", border: "#cc6633", fill: "#e69966", category: "מגורים מעורב" },
  { code: 1352, name: "מגורים ואירוח כפרי", border: "#669966", fill: "#99bf99", category: "מגורים מעורב" },
  { code: 1410, name: "מגורים מסחר מבנים ומוסדות ציבור", border: "#cc9966", fill: "#e6bf99", category: "מגורים מעורב" },
  { code: 1420, name: "מגורים, מסחר ותיירות", border: "#cc9966", fill: "#e6bf99", category: "מגורים מעורב" },
];

// Lookup map by code for fast access
const _byCode = new Map<number, LandUseDesignation>();
for (const d of LAND_USE_DESIGNATIONS) {
  _byCode.set(d.code, d);
}

export function getLandUseByCode(code: number): LandUseDesignation | undefined {
  return _byCode.get(code);
}

// Get all unique categories
export function getLandUseCategories(): string[] {
  return [...new Set(LAND_USE_DESIGNATIONS.map((d) => d.category))];
}

// Get sample colors per category for legend display
export function getCategoryColors(): { category: string; border: string; fill: string }[] {
  const cats = new Map<string, { border: string; fill: string }>();
  for (const d of LAND_USE_DESIGNATIONS) {
    if (!cats.has(d.category)) {
      cats.set(d.category, { border: d.border, fill: d.fill });
    }
  }
  return Array.from(cats.entries()).map(([category, colors]) => ({ category, ...colors }));
}

/**
 * Try to match a land-use name to a designation.
 * Useful when we have Hebrew text but no code.
 */
export function getLandUseByName(name: string): LandUseDesignation | undefined {
  if (!name) return undefined;
  const normalized = name.trim();
  return LAND_USE_DESIGNATIONS.find(
    (d) => d.name === normalized || normalized.includes(d.name) || d.name.includes(normalized)
  );
}
