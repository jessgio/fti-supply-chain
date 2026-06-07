"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  GrowthChart,
  type ChartView,
} from "@/components/dashboard/growth-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/dashboard/page-shell";
import { formatCurrency, formatNumber, formatPct } from "@/lib/utils";
import {
  computeGrowthMetrics,
  growthPctForRow,
  latestPeriodGrowthRows,
  type GrowthPctKind,
} from "@/lib/analytics/growth";
import type {
  FranchiseGrowthPoint,
  PeriodCoverage,
  TimeGrain,
} from "@/types/database";

const grains: TimeGrain[] = ["day", "week", "month", "year"];

const chartViews: { id: ChartView; label: string }[] = [
  { id: "total", label: "Total" },
  { id: "franchise", label: "By franchise" },
  { id: "stacked", label: "Stacked" },
];

function momTone(pct: number | null) {
  if (pct === null) return "default" as const;
  return pct >= 0 ? ("success" as const) : ("danger" as const);
}

type SortKey =
  | "period"
  | "franchise"
  | "channel"
  | "value"
  | "mom"
  | "yoy"
  | "mom_mtd"
  | "mom_eom"
  | "yoy_mtd"
  | "yoy_eom";
type SortDir = "asc" | "desc";

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

function compareGrowthRows(
  a: FranchiseGrowthPoint,
  b: FranchiseGrowthPoint,
  key: SortKey,
  dir: SortDir,
  metric: "sales" | "qty",
): number {
  let cmp = 0;
  switch (key) {
    case "period":
      cmp = a.period.localeCompare(b.period);
      break;
    case "franchise":
      cmp = a.franchise_name.localeCompare(b.franchise_name);
      break;
    case "channel":
      cmp = a.channel_name.localeCompare(b.channel_name);
      break;
    case "value":
      cmp =
        metric === "sales"
          ? a.total_net_sales - b.total_net_sales
          : a.total_qty - b.total_qty;
      break;
    case "mom":
      return compareNullableNumber(
        growthPctForRow(a, metric, "mom_eom"),
        growthPctForRow(b, metric, "mom_eom"),
        dir,
      );
    case "yoy":
      return compareNullableNumber(
        growthPctForRow(a, metric, "yoy_eom"),
        growthPctForRow(b, metric, "yoy_eom"),
        dir,
      );
    case "mom_mtd":
      return compareNullableNumber(
        growthPctForRow(a, metric, "mom_mtd"),
        growthPctForRow(b, metric, "mom_mtd"),
        dir,
      );
    case "mom_eom":
      return compareNullableNumber(
        growthPctForRow(a, metric, "mom_eom"),
        growthPctForRow(b, metric, "mom_eom"),
        dir,
      );
    case "yoy_mtd":
      return compareNullableNumber(
        growthPctForRow(a, metric, "yoy_mtd"),
        growthPctForRow(b, metric, "yoy_mtd"),
        dir,
      );
    case "yoy_eom":
      return compareNullableNumber(
        growthPctForRow(a, metric, "yoy_eom"),
        growthPctForRow(b, metric, "yoy_eom"),
        dir,
      );
  }
  return dir === "asc" ? cmp : -cmp;
}

function pctClass(pct: number | null): string {
  if (pct === null) return "text-stone-400";
  if (pct > 0) return "text-emerald-700";
  if (pct < 0) return "text-rose-700";
  return "text-stone-600";
}

function GrowthPctCell({
  row,
  metric,
  kind,
  projectedLabel,
}: {
  row: FranchiseGrowthPoint;
  metric: "sales" | "qty";
  kind: GrowthPctKind;
  projectedLabel: string;
}) {
  const pct = growthPctForRow(row, metric, kind);
  const isProjected = kind.endsWith("_eom") && row.is_partial;
  return (
    <td
      className={`py-2 pr-4 tabular-nums ${pctClass(pct)} ${isProjected ? "font-medium" : ""}`}
      title={
        isProjected
          ? `${projectedLabel} run-rate projection vs prior period`
          : kind.endsWith("_mtd")
            ? "Month-to-date actual vs prior period"
            : undefined
      }
    >
      {formatPct(pct)}
    </td>
  );
}

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  columnKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="py-2 pr-4">
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap text-left font-medium text-stone-500 hover:text-stone-800"
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}

interface FilterOption {
  id: string;
  name: string;
}

export default function SalesPage() {
  const [grain, setGrain] = useState<TimeGrain>("month");
  const [channelId, setChannelId] = useState("");
  const [franchiseId, setFranchiseId] = useState("");
  const [metric, setMetric] = useState<"sales" | "qty">("qty");
  const [chartView, setChartView] = useState<ChartView>("total");
  const [points, setPoints] = useState<FranchiseGrowthPoint[]>([]);
  const [coverage, setCoverage] = useState<PeriodCoverage | null>(null);
  const [channels, setChannels] = useState<FilterOption[]>([]);
  const [franchises, setFranchises] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("franchise");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch("/api/metadata");
        const data = await res.json();
        if (res.ok) {
          setChannels(data.channels ?? []);
          setFranchises(data.franchises ?? []);
        }
      } catch {
        // filters are optional
      }
    }
    loadMeta();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ grain });
        if (channelId) params.set("channel_id", channelId);
        if (franchiseId) params.set("franchise_id", franchiseId);
        const res = await fetch(`/api/analytics/growth?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        const raw: FranchiseGrowthPoint[] = data.points ?? [];
        setPoints(raw);
        setCoverage(data.coverage ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [grain, channelId, franchiseId]);

  const tableRows = useMemo(() => {
    const rows = latestPeriodGrowthRows(points, {
      franchises: franchiseId || channelId ? undefined : franchises,
      includeZeroSales: !franchiseId && !channelId,
    });
    return [...rows].sort((a, b) =>
      compareGrowthRows(a, b, sortKey, sortDir, metric),
    );
  }, [points, franchises, franchiseId, channelId, sortKey, sortDir, metric]);

  const metrics = useMemo(
    () => computeGrowthMetrics(points, grain, metric, coverage),
    [points, grain, metric, coverage],
  );

  const isSales = metric === "sales";
  const headlineValue = isSales
    ? formatCurrency(metrics.totalSales)
    : `${formatNumber(metrics.totalQty)} units`;
  const headlineProjected = isSales
    ? metrics.projectedSales
    : metrics.projectedQty;
  const headlineMom = isSales ? metrics.salesMomPct : metrics.qtyMomPct;
  const headlineYoy = isSales ? metrics.salesYoyPct : metrics.qtyYoyPct;
  const projectedEndLabel =
    grain === "week" ? "EOW" : grain === "month" ? "EOM" : "EOY";
  const showSplitGrowth =
    Boolean(coverage?.isPartial) &&
    (grain === "month" || grain === "week");

  return (
    <PageShell wide={true}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Franchise sales growth
          </h1>
          <p className="mt-1 text-stone-600">
            Month-on-month and year-on-year by channel. Each franchise total is
            the sum of its SKUs: direct single-SKU sales plus component qty from
            bundles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {grains.map((g) => (
            <Button
              key={g}
              size="sm"
              variant={grain === g ? "default" : "outline"}
              onClick={() => setGrain(g)}
            >
              {g}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={franchiseId}
          onChange={(e) => setFranchiseId(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All franchises</option>
          {franchises.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={metric === "sales" ? "default" : "outline"}
            onClick={() => setMetric("sales")}
          >
            Net sales
          </Button>
          <Button
            size="sm"
            variant={metric === "qty" ? "default" : "outline"}
            onClick={() => setMetric("qty")}
          >
            Quantity
          </Button>
        </div>
      </div>

      {!loading && !error && points.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={isSales ? "Latest net sales" : "Latest units"}
            value={headlineValue}
            hint={
              metrics.isPartialPeriod && headlineProjected != null
                ? `MTD · projected ${isSales ? formatCurrency(headlineProjected) : `${formatNumber(headlineProjected)} units`} ${projectedEndLabel}`
                : metrics.latestPeriod
                  ? `Period ${metrics.latestPeriod}`
                  : undefined
            }
          />
          <StatCard
            label="MoM change"
            value={formatPct(headlineMom)}
            hint={
              metrics.isPartialPeriod
                ? `Projected vs ${metrics.prevPeriod ?? "prior period"} · ${metrics.periodCoverageHint ?? ""}`
                : metrics.prevPeriod
                  ? `vs ${metrics.prevPeriod}`
                  : "No prior period"
            }
            tone={momTone(headlineMom)}
          />
          <StatCard
            label="YoY change"
            value={formatPct(headlineYoy)}
            hint={
              metrics.isPartialPeriod
                ? "Projected vs same period last year"
                : "vs same period last year"
            }
            tone={momTone(headlineYoy)}
          />
          <StatCard
            label="Momentum"
            value={`${metrics.growing} ↑ / ${metrics.declining} ↓`}
            hint={`${metrics.flat} flat · franchises vs prior period`}
            tone={
              metrics.growing > metrics.declining
                ? "success"
                : metrics.declining > metrics.growing
                  ? "danger"
                  : "info"
            }
          />
          <StatCard
            label="Top grower"
            value={
              metrics.topGrower
                ? formatPct(metrics.topGrower.pct)
                : "—"
            }
            hint={metrics.topGrower?.franchise_name ?? "No comparison yet"}
            tone="success"
          />
          <StatCard
            label="Steepest decline"
            value={
              metrics.topDecliner
                ? formatPct(metrics.topDecliner.pct)
                : "—"
            }
            hint={metrics.topDecliner?.franchise_name ?? "No comparison yet"}
            tone={
              metrics.topDecliner && (metrics.topDecliner.pct ?? 0) < 0
                ? "danger"
                : "default"
            }
          />
          <StatCard
            label="Revenue per unit"
            value={metrics.arpu !== null ? formatCurrency(metrics.arpu) : "—"}
            hint={
              metrics.arpuMomPct !== null
                ? `${formatPct(metrics.arpuMomPct)} MoM · price vs volume`
                : "Net sales ÷ units"
            }
            tone={momTone(metrics.arpuMomPct)}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Trend chart</CardTitle>
              <CardDescription>
                {metric === "sales" ? "Net sales" : "Units sold"} over time.
                Switch views to declutter or compare composition.
                {coverage?.isPartial &&
                  grain === "month" &&
                  " The dashed line projects month-end from the MTD run rate."}
                {coverage?.isPartial &&
                  grain === "week" &&
                  " The dashed line projects week-end from the run rate."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {chartViews.map((v) => (
                <Button
                  key={v.id}
                  size="sm"
                  variant={chartView === v.id ? "default" : "outline"}
                  onClick={() => setChartView(v.id)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : points.length === 0 ? (
            <p className="text-sm text-stone-500">
              No sales data yet. Upload mappings and sales from the Data Uploads
              page.
            </p>
          ) : (
            <GrowthChart
              data={points}
              metric={metric}
              view={chartView}
              coverage={coverage}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Growth table</CardTitle>
          <CardDescription>
            Latest period MoM / YoY
            {showSplitGrowth &&
              ` — MTD compares actuals to date; ${projectedEndLabel} uses the run-rate projection.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <SortableHeader
                  label="Period"
                  columnKey="period"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Franchise"
                  columnKey="franchise"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                {channelId ? (
                  <SortableHeader
                    label="Channel"
                    columnKey="channel"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                ) : null}
                <SortableHeader
                  label={metric === "sales" ? "Net sales (MTD)" : "Qty (MTD)"}
                  columnKey="value"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                {showSplitGrowth ? (
                  <>
                    <SortableHeader
                      label="MoM MTD"
                      columnKey="mom_mtd"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label={`MoM ${projectedEndLabel}`}
                      columnKey="mom_eom"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="YoY MTD"
                      columnKey="yoy_mtd"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label={`YoY ${projectedEndLabel}`}
                      columnKey="yoy_eom"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </>
                ) : (
                  <>
                    <SortableHeader
                      label="MoM"
                      columnKey="mom"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="YoY"
                      columnKey="yoy"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr
                  key={`${row.period}-${row.franchise_id}-${row.channel_id}`}
                  className="border-b border-stone-100"
                >
                  <td className="py-2 pr-4">{row.period}</td>
                  <td className="py-2 pr-4">{row.franchise_name}</td>
                    {channelId ? (
                      <td className="py-2 pr-4">{row.channel_name}</td>
                    ) : null}
                  <td className="py-2 pr-4 tabular-nums">
                    {metric === "sales"
                      ? formatCurrency(row.total_net_sales)
                      : formatNumber(row.total_qty)}
                  </td>
                  {showSplitGrowth ? (
                    <>
                      <GrowthPctCell
                        row={row}
                        metric={metric}
                        kind="mom_mtd"
                        projectedLabel={projectedEndLabel}
                      />
                      <GrowthPctCell
                        row={row}
                        metric={metric}
                        kind="mom_eom"
                        projectedLabel={projectedEndLabel}
                      />
                      <GrowthPctCell
                        row={row}
                        metric={metric}
                        kind="yoy_mtd"
                        projectedLabel={projectedEndLabel}
                      />
                      <GrowthPctCell
                        row={row}
                        metric={metric}
                        kind="yoy_eom"
                        projectedLabel={projectedEndLabel}
                      />
                    </>
                  ) : (
                    <>
                      <td className={`py-2 pr-4 tabular-nums ${pctClass(growthPctForRow(row, metric, "mom_eom"))}`}>
                        {formatPct(growthPctForRow(row, metric, "mom_eom"))}
                      </td>
                      <td className={`py-2 pr-4 tabular-nums ${pctClass(growthPctForRow(row, metric, "yoy_eom"))}`}>
                        {formatPct(growthPctForRow(row, metric, "yoy_eom"))}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
