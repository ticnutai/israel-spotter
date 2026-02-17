# 🚀 מדריך הרצת מיגרציות – כפר חב"ד GIS

## 📖 מה זה בכלל מיגרציה?

דמיין שיש לך קופסת לגו ענקית (הדאטהבייס שלך).
**מיגרציה** = הוראות איך להוסיף חלקים חדשים לקופסה.

במקום להוסיף ידנית כל חלק, אתה נותן למחשב דף הוראות והוא עושה הכל בשבילך!

---

## 🏗️ ארכיטקטורת הנתונים

```
┌──────────────────────┐     ┌─────────────────────┐
│   מחשב מקומי          │     │   ענן (Supabase)      │
│                      │     │                     │
│  SQLite DB           │     │  PostgreSQL DB      │
│  + קבצים על הדיסק    │←──→│  (מידע בלבד)        │
│                      │     │                     │
│  📋 ברירת מחדל       │     │  ☁️ גיבוי/fallback  │
└──────────────────────┘     └─────────────────────┘
```

**כלל ברזל:** המערכת מחפשת קודם במחשב. אם לא מוצאת – עוברת לענן.

---

## 🔑 פרטי החיבור לענן

| פרמטר | ערך |
|-------|-----|
| **Supabase URL** | `https://txltujmbkhsszpvsgujs.supabase.co` |
| **Project ID** | `txltujmbkhsszpvsgujs` |
| **Dashboard** | https://supabase.com/dashboard/project/txltujmbkhsszpvsgujs |

---

## 🛠️ שני כלים להרצת מיגרציות

### כלי 1: דרך האתר (SettingsDialog)

1. פתח את האתר
2. לך ל**הגדרות** (בסיידבר)
3. מצא את **כלי פיתוח** → כפתור ⚙️ הגדרות
4. בלשונית **פיתוח** → הכנס SQL או העלה קובץ `.sql`
5. לחץ **הרץ מיגרציה**

### כלי 2: סקריפט Python (upload_to_supabase.py)

מסנכרן את כל הנתונים מ-SQLite המקומי לענן:

```powershell
cd "c:\Users\jj121\OneDrive\שולחן העבודה\meida"
python upload_to_supabase.py
```

---

## 📋 טבלאות בענן

| טבלה | תיאור | שורות |
|------|-------|-------|
| `gushim` | גושים קדסטריים | 12 |
| `parcels` | חלקות (גוש+חלקה) | 40 |
| `plans` | תוכניות ייחודיות | 19 |
| `documents` | מסמכים שהורדו | 120 |
| `plan_georef` | נתוני גיאורפרנס | 3 |

> ⚠️ **aerial_images** – לא בענן עדיין (קבצים כבדים, רק מקומית)

---

## 🎮 איך להשתמש – צעד אחר צעד

### שלב 1: פתח את הטרמינל ב-VS Code
לחץ על: **Ctrl + `** (הכפתור מתחת ל-Esc)

### שלב 2: עבור לתיקיית הפרויקט
```powershell
cd "c:\Users\jj121\OneDrive\שולחן העבודה\meida"
```

---

## 📋 פקודות שימושיות

### 1️⃣ יצירת טבלאות בענן (פעם ראשונה)

הרצת קובץ ה-SQL דרך edge function:

```powershell
python -c "
import httpx, json
SUPABASE_URL = 'https://txltujmbkhsszpvsgujs.supabase.co'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0.K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw'
with open('supabase/migrations/001_create_tables.sql', 'r', encoding='utf-8') as f:
    sql = f.read()
resp = httpx.post(f'{SUPABASE_URL}/functions/v1/run-sql',
    headers={'Authorization': f'Bearer {ANON_KEY}', 'Content-Type': 'application/json'},
    json={'sql': sql}, timeout=30)
print(json.dumps(resp.json(), indent=2, ensure_ascii=False)[:1000])
"
```

### 2️⃣ העלאת כל הנתונים לענן

```powershell
python upload_to_supabase.py
```

**מה יקרה:**
```
══════════════════════════════════════════════════
   🚀 Upload Local DB → Supabase Cloud
══════════════════════════════════════════════════
📦 DB: kfar_chabad_documents.db
☁️  Target: https://txltujmbkhsszpvsgujs.supabase.co

📤 Uploading gushim...
  ✅ gushim: 12/12 rows uploaded
📤 Uploading parcels...
  ✅ parcels: 40/40 rows uploaded
...
✅ All data uploaded successfully!

📊 Verification:
  ✅ gushim: local=12, cloud=12
  ✅ parcels: local=40, cloud=40
  ✅ plans: local=19, cloud=19
  ✅ documents: local=120, cloud=120
  ✅ plan_georef: local=3, cloud=3
```

### 3️⃣ הרצת SQL ישירות על הענן

```powershell
python -c "
import httpx
SUPABASE_URL = 'https://txltujmbkhsszpvsgujs.supabase.co'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0.K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw'
resp = httpx.post(f'{SUPABASE_URL}/functions/v1/run-sql',
    headers={'Authorization': f'Bearer {ANON_KEY}', 'Content-Type': 'application/json'},
    json={'sql': 'SELECT COUNT(*) as total FROM gushim'}, timeout=15)
print(resp.json())
"
```

### 4️⃣ בדיקת נתונים דרך REST API

```powershell
# ספירת גושים
curl "https://txltujmbkhsszpvsgujs.supabase.co/rest/v1/gushim?select=count" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0.K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw" -H "Prefer: count=exact" -I

# רשימת גושים
curl "https://txltujmbkhsszpvsgujs.supabase.co/rest/v1/gushim?order=gush.asc" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bHR1am1ia2hzc3pwdnNndWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzgyMzIsImV4cCI6MjA4NjkxNDIzMn0.K3y9ZkrmmnZifjHgwzkoekvCB3dgyINFh6bPRki4YUw"
```

---

## 🔄 איך הפולבק עובד

```
שאילתה נכנסת (לדוגמה: /api/gushim)
         │
         ▼
  ┌──────────────┐
  │ יש SQLite    │───כן──→ 📋 מחזיר מ-SQLite
  │ מקומי?       │          (source: "local")
  └──────┬───────┘
         │ לא
         ▼
  ┌──────────────┐
  │ שואל את      │───כן──→ ☁️ מחזיר מ-Supabase
  │ Supabase     │          (source: "cloud")
  └──────┬───────┘
         │ נכשל
         ▼
      ❌ שגיאה
```

כל תשובת API מכילה שדה `"source"` – `"local"` או `"cloud"`.

---

## 📁 קבצי מיגרציה

```
meida/
├── supabase/
│   ├── config.toml                    # הגדרות Supabase
│   ├── functions/
│   │   └── run-sql/index.ts           # Edge function להרצת SQL
│   └── migrations/
│       ├── 001_create_tables.sql      # יצירת טבלאות (gushim, parcels, plans, documents, plan_georef)
│       ├── 20260217...7a4bafe5.sql    # GIS layers + storage bucket
│       └── 20260217...e18cc43f.sql    # Profiles + user roles
├── upload_to_supabase.py             # סקריפט סנכרון מקומי→ענן
└── kfar_chabad_documents.db          # SQLite מקומי
```

---

## ⚠️ מה לעשות כשיש שגיאה?

### שגיאה: "relation does not exist"
**הבעיה:** הטבלה לא נוצרה עדיין
**הפתרון:** הרץ `001_create_tables.sql` קודם

### שגיאה: "duplicate key value"
**הבעיה:** הנתונים כבר קיימים בענן
**הפתרון:** הסקריפט מוחק ומעלה מחדש – פשוט הרץ שוב

### שגיאה: "permission denied"
**הבעיה:** ה-RLS לא מוגדר
**הפתרון:** הרץ את ה-migration שכולל את ה-policies

---

## 💡 טיפים

1. **העלה לענן אחרי כל שינוי גדול ב-DB** – `python upload_to_supabase.py`
2. **בדוק source בתשובת API** – ככה תדע אם הנתונים מגיעים ממקומי או ענן
3. **צילומי אוויר רק מקומית** – לא מועלים לענן (קבצים כבדים מדי)
4. **Dashboard מלא** – https://supabase.com/dashboard/project/txltujmbkhsszpvsgujs

---

## 🎓 סיכום

| מה רוצים | הפקודה |
|----------|--------|
| ליצור טבלאות בענן | הרץ `001_create_tables.sql` דרך SettingsDialog או edge function |
| לסנכרן נתונים לענן | `python upload_to_supabase.py` |
| לשאול את הענן ישירות | `curl` עם Supabase REST API |
| לבדוק מאיפה נתונים | חפש `"source": "local"` או `"cloud"` |

---

**🌟 הכל מסונכרן! מקומי ← ענן, עם fallback אוטומטי.**
