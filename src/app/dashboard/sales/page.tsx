"use client";

import { useEffect, useMemo, useState } from "react";
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
  latestPeriodGrowthRows,
  sumGrowthAcrossChannels,
} from "@/lib/analytics/growth";
import type { FranchiseGrowthPoint, TimeGrain } from "@/types/database";

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
  const [channels, setChannels] = useState<FilterOption[]>([]);
  const [franchises, setFranchises] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setPoints(channelId ? raw : sumGrowthAcrossChannels(raw, grain));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [grain, channelId, franchiseId]);

  const tableRows = useMemo(
    () =>
      latestPeriodGrowthRows(points, {
        franchises: franchiseId || channelId ? undefined : franchises,
        includeZeroSales: !franchiseId && !channelId,
      }),
    [points, franchises, franchiseId, channelId],
  );

  const metrics = useMemo(
    () => computeGrowthMetrics(points, grain, metric),
    [points, grain, metric],
  );

  const isSales = metric === "sales";
  const headlineValue = isSales
    ? formatCurrency(metrics.totalSales)
    : `${formatNumber(metrics.totalQty)} units`;
  const headlineMom = isSales ? metrics.salesMomPct : metrics.qtyMomPct;
  const headlineYoy = isSales ? metrics.salesYoyPct : metrics.qtyYoyPct;

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
              metrics.latestPeriod
                ? `Period ${metrics.latestPeriod}`
                : undefined
            }
          />
          <StatCard
            label="MoM change"
            value={formatPct(headlineMom)}
            hint={
              metrics.prevPeriod
                ? `vs ${metrics.prevPeriod}`
                : "No prior period"
            }
            tone={momTone(headlineMom)}
          />
          <StatCard
            label="YoY change"
            value={formatPct(headlineYoy)}
            hint="vs same period last year"
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
            <GrowthChart data={points} metric={metric} view={chartView} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Growth table</CardTitle>
          <CardDescription>Latest period MoM / YoY</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">Franchise</th>
                  {channelId ? <th className="py-2 pr-4">Channel</th> : null}
                <th className="py-2 pr-4">
                  {metric === "sales" ? "Net sales" : "Qty"}
                </th>
                <th className="py-2 pr-4">MoM</th>
                <th className="py-2">YoY</th>
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
                  <td className="py-2 pr-4">
                    {metric === "sales"
                      ? formatCurrency(row.total_net_sales)
                      : row.total_qty}
                  </td>
                  <td className="py-2 pr-4">
                    {formatPct(
                      metric === "sales" ? row.sales_mom_pct : row.qty_mom_pct,
                    )}
                  </td>
                  <td className="py-2">
                    {formatPct(
                      metric === "sales" ? row.sales_yoy_pct : row.qty_yoy_pct,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
