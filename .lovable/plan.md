

# הפעלת Lovable Cloud והוספת העלאת קבצי GIS עם שמירה בענן

## שלב 1: הפעלת Lovable Cloud (Supabase)
הפעלת Supabase מובנה בפרויקט כדי לקבל בסיס נתונים ואחסון קבצים בענן.

## שלב 2: הגדרת בסיס נתונים ואחסון
- יצירת **Storage Bucket** בשם `gis-files` (ציבורי) לאחסון קבצי GIS
- יצירת טבלת **`gis_layers`** לשמירת מטא-דאטה על כל שכבה:
  - שם, סוג קובץ, נתיב באחסון, GeoJSON מפורסק, תאריך יצירה
- הגדרת הרשאות RLS פתוחות (ללא אימות משתמשים)

## שלב 3: יצירת רכיבים חדשים
- **`src/lib/gis-parser.ts`** - המרת קבצי KML/GPX ל-GeoJSON באמצעות ספריית `@tmcw/togeojson`
- **`src/hooks/use-gis-layers.ts`** - hook לטעינת, העלאת ומחיקת שכבות מ-Supabase
- **`src/components/GISUploader.tsx`** - רכיב UI צף על המפה:
  - כפתור העלאה עם תמיכה ב-GeoJSON, KML, GPX, Shapefile (.zip)
  - סרגל התקדמות בזמן העלאה
  - רשימת שכבות עם מתגי הצגה/הסתרה ומחיקה

## שלב 4: שילוב במפה
- עדכון `MapView.tsx` להציג שכבות GIS שהועלו על מפת Leaflet
- עדכון `Index.tsx` לכלול את רכיב ה-GISUploader

## פרטים טכניים

### מיגרציית בסיס נתונים
```sql
CREATE TABLE gis_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  geojson JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gis_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to gis_layers"
  ON gis_layers FOR ALL
  USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('gis-files', 'gis-files', true);

CREATE POLICY "Allow all uploads to gis-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'gis-files');

CREATE POLICY "Allow all reads from gis-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gis-files');

CREATE POLICY "Allow all deletes from gis-files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'gis-files');
```

### ספרייה נדרשת
- `@tmcw/togeojson` - להמרת KML/GPX ל-GeoJSON

### קבצים
- **חדש**: `src/lib/gis-parser.ts`
- **חדש**: `src/hooks/use-gis-layers.ts`
- **חדש**: `src/components/GISUploader.tsx`
- **עריכה**: `src/components/MapView.tsx` - הוספת הצגת שכבות GIS
- **עריכה**: `src/pages/Index.tsx` - הוספת GISUploader

