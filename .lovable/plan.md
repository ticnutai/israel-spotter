

# הוספת העלאת קבצי GIS עם שמירה בענן (Lovable Cloud)

## שלב 1: הפעלת Lovable Cloud (Supabase)
- הפעלת Supabase מובנה בפרויקט

## שלב 2: הגדרת בסיס נתונים ואחסון
- יצירת **Storage Bucket** בשם `gis-files` לאחסון הקבצים (Shapefile, GeoJSON, KML, GPX)
- יצירת טבלת **`gis_layers`** במסד הנתונים לשמירת מטא-דאטה:
  - שם הקובץ, סוג, תאריך העלאה, נתיב באחסון
- הגדרת הרשאות RLS מתאימות

## שלב 3: רכיב העלאת קבצים
- יצירת קומפוננטת `GISUploader` עם:
  - כפתור העלאה צף על המפה
  - תמיכה בפורמטים: GeoJSON, KML, GPX, Shapefile (.zip)
  - סרגל התקדמות בזמן העלאה
  - רשימת שכבות שהועלו עם אפשרות הצגה/הסתרה/מחיקה

## שלב 4: הצגת שכבות על המפה
- פירוק קבצי GeoJSON/KML/GPX והצגתם כשכבות על מפת Leaflet
- אפשרות להפעיל ולכבות כל שכבה בנפרד
- שמירת השכבות בענן כך שיהיו זמינות בכל כניסה

## פרטים טכניים

### טבלת מטא-דאטה
```sql
CREATE TABLE gis_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  geojson JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### קבצים שייווצרו/יערכו
- **חדש**: `src/components/GISUploader.tsx` - רכיב העלאה וניהול שכבות
- **חדש**: `src/hooks/use-gis-layers.ts` - hook לניהול שכבות GIS מול Supabase
- **חדש**: `src/lib/gis-parser.ts` - פירוק קבצי KML/GPX ל-GeoJSON
- **עריכה**: `src/components/MapView.tsx` - הצגת שכבות GIS על המפה

### ספריות נדרשות
- `@tmcw/togeojson` - להמרת KML/GPX ל-GeoJSON

