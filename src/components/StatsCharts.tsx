/**
 * StatsCharts.tsx – Statistical analysis with charts
 * Uses recharts for bar/pie/area charts
 */

import { useState, useEffect, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Loader2,
  RefreshCw,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDocumentStats, type DocumentStats } from "@/lib/kfar-chabad-api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#6366f1", // indigo
];

const CATEGORY_LABELS: Record<string, string> = {
  plans: "תוכניות",
  permits: "היתרים",
  aerial: "צילומי אוויר",
  other: "אחר",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF",
  jpg: "JPG",
  jpeg: "JPEG",
  png: "PNG",
  tif: "TIFF",
  tiff: "TIFF",
  dwfx: "DWF",
  bmp: "BMP",
};

export function StatsCharts() {
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await getDocumentStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Prepare chart data
  const categoryData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_category).map(([key, val]) => ({
      name: CATEGORY_LABELS[key] || key,
      count: val,
    }));
  }, [stats]);

  const fileTypeData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_file_type)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => ({
        name: FILE_TYPE_LABELS[key.toLowerCase()] || key.toUpperCase(),
        count: val,
      }));
  }, [stats]);

  const gushData = useMemo(() => {
    if (!stats) return [];
    return stats.by_gush
      .sort((a, b) => b.plan_count + b.permit_count - (a.plan_count + a.permit_count))
      .map((g) => ({
        name: String(g.gush),
        תוכניות: g.plan_count,
        היתרים: g.permit_count,
        חלקות: g.parcel_count,
      }));
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-6 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={load}>
          נסה שוב
        </Button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="סה״כ מסמכים"
              value={stats.total}
              icon={<BarChart3 className="h-4 w-4" />}
              color="text-blue-600"
            />
            <StatCard
              label="תשריטים"
              value={stats.tashrit_count}
              icon={<PieChartIcon className="h-4 w-4" />}
              color="text-green-600"
            />
            <StatCard
              label="גאו-רפרנס"
              value={stats.georef_count}
              icon={<TrendingUp className="h-4 w-4" />}
              color="text-violet-600"
            />
          </div>

          {/* Category pie chart */}
          <ChartSection title="התפלגות לפי קטגוריה">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={65}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="name"
                  label={({ name, count }) => `${name} (${count})`}
                >
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, direction: "rtl" }}
                  formatter={(value: number) => [value, "מסמכים"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Gush bar chart */}
          <ChartSection title="מסמכים לפי גוש">
            <ResponsiveContainer width="100%" height={Math.max(200, gushData.length * 28)}>
              <BarChart
                data={gushData}
                layout="vertical"
                margin={{ top: 0, right: 5, left: 5, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, direction: "rtl" }}
                />
                <Bar dataKey="תוכניות" fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="היתרים" fill="#22c55e" stackId="a" radius={[0, 2, 2, 0]} />
                <Legend
                  wrapperStyle={{ fontSize: 11, direction: "rtl" }}
                  iconSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* File type bar chart */}
          <ChartSection title="התפלגות לפי סוג קובץ">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={fileTypeData}
                margin={{ top: 0, right: 5, left: 5, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, direction: "rtl" }}
                  formatter={(value: number) => [value, "קבצים"]}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                  {fileTypeData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Refresh */}
          <div className="text-center pt-2 pb-4">
            <Button variant="ghost" size="sm" onClick={load} className="text-xs">
              <RefreshCw className="h-3.5 w-3.5 ml-1" />
              רענן נתונים
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ---- Helper components ---- */

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-2 text-center">
      <div className={cn("mx-auto mb-1", color)}>{icon}</div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <h4 className="text-xs font-medium mb-2 px-1">{title}</h4>
      {children}
    </div>
  );
}
