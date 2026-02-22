/**
 * Subcategory metadata for document classification.
 *
 * Maps DB `subcategory` values (tashrit, takanon, approved_status, decision,
 * blue_line, area_cells, kml, dwg, shapefile, local_scan, other) to display
 * metadata: Hebrew labels, colors, sort priority.
 */

export interface SubcategoryDef {
  label: string;
  labelPlural: string;
  /** tailwind text-color class for the icon */
  color: string;
  /** tailwind bg-color class for badge background */
  bgColor: string;
  /** tailwind text-color class for badge text */
  textColor: string;
  /** Sort priority: lower = shown first */
  priority: number;
}

export const SUBCATEGORY_META: Record<string, SubcategoryDef> = {
  tashrit:         { label: "תשריט",       labelPlural: "תשריטים",     color: "text-purple-600", bgColor: "bg-purple-100", textColor: "text-purple-700", priority: 1 },
  takanon:         { label: "תקנון",       labelPlural: "תקנונים",     color: "text-blue-600",   bgColor: "bg-blue-100",   textColor: "text-blue-700",   priority: 2 },
  approved_status: { label: "מצב מאושר",   labelPlural: "מצב מאושר",   color: "text-green-600",  bgColor: "bg-green-100",  textColor: "text-green-700",  priority: 3 },
  decision:        { label: "החלטה",       labelPlural: "החלטות",     color: "text-red-600",    bgColor: "bg-red-100",    textColor: "text-red-700",    priority: 4 },
  blue_line:       { label: "קו כחול",     labelPlural: "קווים כחולים", color: "text-sky-600",    bgColor: "bg-sky-100",    textColor: "text-sky-700",    priority: 5 },
  area_cells:      { label: "תאי שטח",     labelPlural: "תאי שטח",     color: "text-amber-600",  bgColor: "bg-amber-100",  textColor: "text-amber-700",  priority: 6 },
  kml:             { label: "KML",          labelPlural: "KML",         color: "text-teal-600",   bgColor: "bg-teal-100",   textColor: "text-teal-700",   priority: 7 },
  dwg:             { label: "DWG",          labelPlural: "DWG",         color: "text-orange-600", bgColor: "bg-orange-100", textColor: "text-orange-700", priority: 8 },
  shapefile:       { label: "Shapefile",    labelPlural: "Shapefiles",  color: "text-violet-600", bgColor: "bg-violet-100", textColor: "text-violet-700", priority: 9 },
  local_scan:      { label: "סריקה",       labelPlural: "סריקות",     color: "text-indigo-600", bgColor: "bg-indigo-100", textColor: "text-indigo-700", priority: 10 },
  other:           { label: "אחר",         labelPlural: "אחר",        color: "text-gray-500",   bgColor: "bg-gray-100",   textColor: "text-gray-700",   priority: 99 },
};

/** All subcategory keys in priority order (for filter dropdowns) */
export const SUBCATEGORY_OPTIONS = Object.entries(SUBCATEGORY_META)
  .sort(([, a], [, b]) => a.priority - b.priority)
  .map(([key, def]) => ({ value: key, label: def.label }));

export function subcategoryMeta(sub: string | undefined): SubcategoryDef {
  return SUBCATEGORY_META[sub || "other"] ?? SUBCATEGORY_META["other"];
}

/** Sort documents by subcategory priority, then by title */
export function sortBySubcategory<T extends { subcategory?: string; title?: string; file_name?: string }>(docs: T[]): T[] {
  return [...docs].sort((a, b) => {
    const pa = subcategoryMeta(a.subcategory).priority;
    const pb = subcategoryMeta(b.subcategory).priority;
    if (pa !== pb) return pa - pb;
    const na = (a.title || a.file_name || "").toLowerCase();
    const nb = (b.title || b.file_name || "").toLowerCase();
    return na.localeCompare(nb, "he");
  });
}
