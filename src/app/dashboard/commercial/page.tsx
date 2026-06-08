"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/dashboard/page-shell";
import {
  computeGrowthMetrics,
  sumGrowthAcrossChannels,
  summarizeGrowth,
} from "@/lib/analytics/growth";
import {
  isOverstock,
  monthsOfCover,
  OVERSTOCK_MONTHS,
} from "@/lib/forecast/stock-status";
import { formatCurrency, formatNumber, formatPct } from "@/lib/utils";
import type {
  FranchiseGrowthPoint,
  PeriodCoverage,
  RestockRecommendation,
} from "@/types/database";

export default function CommercialPage() {
  const [points, setPoints] = useState<FranchiseGrowthPoint[]>([]);
  const [coverage, setCoverage] = useState<PeriodCoverage | null>(null);
  const [recommendations, setRecommendations] = useState<
    RestockRecommendation[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [growthRes, forecastRes] = await Promise.all([
          fetch("/api/analytics/growth?grain=month&aggregate_channels=false"),
          fetch("/api/forecast"),
        ]);
        const growthData = await growthRes.json();
        if (!growthRes.ok)
          throw new Error(growthData.error ?? "Failed to load growth");
        setPoints(growthData.points ?? []);
        setCoverage(growthData.coverage ?? null);

        const forecastData = await forecastRes.json();
        if (forecastRes.ok) {
          setRecommendations(forecastData.recommendations ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const latestPeriod = useMemo(
    () =>
      points.reduce(
        (max, p) => (p.period > max ? p.period : max),
        points[0]?.period ?? "",
      ),
    [points],
  );

  // Per-franchise totals (channels summed); channel mix uses per-channel rows below.
  const byFranchise = useMemo(
    () => summarizeGrowth(sumGrowthAcrossChannels(points, "month")),
    [points],
  );

  const growthMetrics = useMemo(
    () =>
      computeGrowthMetrics(
        sumGrowthAcrossChannels(points, "month"),
        "month",
        "sales",
        coverage,
      ),
    [points, coverage],
  );

  const headline = useMemo(
    () => ({
      current: growthMetrics.totalSales,
      projected: growthMetrics.projectedSales,
      momPct: growthMetrics.salesMomPct,
      isPartial: growthMetrics.isPartialPeriod,
      coverageHint: growthMetrics.periodCoverageHint,
      activeFranchises: byFranchise.length,
    }),
    [growthMetrics, byFranchise.length],
  );

  const channelMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of points) {
      if (p.period !== latestPeriod) continue;
      map.set(
        p.channel_name || "Unknown",
        (map.get(p.channel_name || "Unknown") ?? 0) + p.total_net_sales,
      );
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, share: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [points, latestPeriod]);

  const fastestGrowing = useMemo(
    () =>
      [...byFranchise]
        .filter((f) => f.sales_mom_pct !== null)
        .sort((a, b) => (b.sales_mom_pct ?? 0) - (a.sales_mom_pct ?? 0))
        .slice(0, 5),
    [byFranchise],
  );

  // Popular products at risk of stocking out — the marketing-facing view of
  // supply risk: high demand SKUs that need restocking soon. We surface every
  // at-risk SKU (no cap) but drop any that already have a replenishment landing
  // before on-hand stock runs out (reordered with no coverage gap). SKUs that
  // are on order yet still face a gap stay flagged — they remain exposed.
  const hotSellersAtRisk = useMemo(
    () =>
      [...recommendations]
        .filter(
          (r) =>
            r.days_until_stockout !== null &&
            r.days_until_stockout <= 45 &&
            !(r.on_order_qty > 0 && !r.has_stockout_gap),
        )
        .sort((a, b) => b.forecast_daily_demand - a.forecast_daily_demand),
    [recommendations],
  );

  const overstockSkus = useMemo(
    () =>
      [...recommendations]
        .filter(isOverstock)
        .sort(
          (a, b) =>
            (b.days_until_stockout ?? 0) - (a.days_until_stockout ?? 0),
        ),
    [recommendations],
  );

  return (
    <PageShell wide={true}>
      <div>
        <Badge className="mb-2 bg-emerald-100 text-emerald-800">
          Sales & Marketing
        </Badge>
        <h1 className="text-2xl font-semibold text-stone-900">
          Commercial dashboard
        </h1>
        <p className="mt-1 text-stone-600">
          Franchise momentum, channel mix, which best-sellers need a restock
          before they sell out, and overstocked SKUs to push in campaigns.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="p-5 text-sm text-red-600">{error}</CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="p-5 text-sm text-stone-500">
            Loading commercial insights...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Net sales (latest month)"
              value={formatCurrency(headline.current)}
              hint={
                headline.isPartial && headline.projected != null
                  ? `MTD · projected ${formatCurrency(headline.projected)} EOM`
                  : latestPeriod
              }
            />
            <StatCard
              label="Net sales MoM"
              value={formatPct(headline.momPct)}
              hint={
                headline.isPartial
                  ? `Projected · ${headline.coverageHint ?? ""}`
                  : undefined
              }
              tone={
                headline.momPct == null
                  ? "default"
                  : headline.momPct >= 0
                    ? "success"
                    : "danger"
              }
            />
            <StatCard
              label="Active franchises"
              value={formatNumber(headline.activeFranchises)}
            />
            <StatCard
              label="Hot sellers at risk"
              value={formatNumber(hotSellersAtRisk.length)}
              tone={hotSellersAtRisk.length > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Overstock to push"
              value={formatNumber(overstockSkus.length)}
              hint={`>${OVERSTOCK_MONTHS} mo cover`}
              tone={overstockSkus.length > 0 ? "info" : "default"}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top franchises</CardTitle>
                <CardDescription>
                  Latest month net sales with month-on-month growth
                  {headline.isPartial && " (MoM uses projected month-end run rate)"}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {byFranchise.length === 0 ? (
                  <p className="text-sm text-stone-500">No sales data yet.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2 pr-4">Franchise</th>
                        <th className="py-2 pr-4">Net sales</th>
                        <th className="py-2 pr-4">MoM</th>
                        <th className="py-2">YoY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byFranchise.slice(0, 8).map((f) => (
                        <tr
                          key={f.franchise_id}
                          className="border-b border-stone-100"
                        >
                          <td className="py-2 pr-4 font-medium text-stone-900">
                            {f.franchise_name}
                          </td>
                          <td className="py-2 pr-4">
                            {formatCurrency(f.total_net_sales)}
                          </td>
                          <td
                            className={`py-2 pr-4 ${pctClass(f.sales_mom_pct)}`}
                          >
                            {formatPct(f.sales_mom_pct)}
                          </td>
                          <td className={`py-2 ${pctClass(f.sales_yoy_pct)}`}>
                            {formatPct(f.sales_yoy_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Channel mix</CardTitle>
                <CardDescription>
                  Net sales share by channel · {latestPeriod}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {channelMix.length === 0 ? (
                  <p className="text-sm text-stone-500">No channel data yet.</p>
                ) : (
                  channelMix.map((c) => (
                    <div key={c.name}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-stone-800">
                          {c.name}
                        </span>
                        <span className="text-stone-500">
                          {formatCurrency(c.value)} · {c.share.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${c.share}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Fastest growing</CardTitle>
                <CardDescription>
                  Franchises with the strongest MoM net sales growth
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fastestGrowing.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    Not enough history for growth comparison.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {fastestGrowing.map((f) => (
                      <li
                        key={f.franchise_id}
                        className="flex items-center justify-between"
                      >
                        <span className="font-medium text-stone-800">
                          {f.franchise_name}
                        </span>
                        <Badge className="bg-emerald-100 text-emerald-800">
                          {formatPct(f.sales_mom_pct)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Hot sellers running low
                </CardTitle>
                <CardDescription>
                  High-demand SKUs projected to stock out within 45 days, unless
                  a reorder lands before on-hand stock runs out — flag before
                  promoting
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {hotSellersAtRisk.length === 0 ? (
                  <p className="text-sm text-stone-500">
                    No popular products at immediate risk. Good to promote.
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2 pr-4">SKU</th>
                        <th className="py-2 pr-4">Franchise</th>
                        <th className="py-2 pr-4">On hand</th>
                        <th className="py-2 pr-4">Demand/day</th>
                        <th className="py-2">Stockout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hotSellersAtRisk.map((r) => (
                        <tr
                          key={r.sku_code}
                          className="border-b border-stone-100"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {r.sku_code}
                          </td>
                          <td className="py-2 pr-4">
                            {r.franchise_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {formatNumber(r.current_stock)}
                          </td>
                          <td className="py-2 pr-4">
                            {formatNumber(r.forecast_daily_demand, 1)}
                          </td>
                          <td className="py-2 text-amber-700">
                            {r.projected_stockout_date ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PackageOpen className="h-4 w-4 text-indigo-600" />
                Overstock to push
              </CardTitle>
              <CardDescription>
                SKUs with more than {OVERSTOCK_MONTHS} months of cover at current
                demand — prioritize in promos, bundles, and channel pushes
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {overstockSkus.length === 0 ? (
                <p className="text-sm text-stone-500">
                  No SKUs exceed {OVERSTOCK_MONTHS}-month cover right now.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2 pr-4">SKU</th>
                      <th className="py-2 pr-4">Franchise</th>
                      <th className="py-2 pr-4">On hand</th>
                      <th className="py-2 pr-4">Demand/day</th>
                      <th className="py-2 pr-4">Cover</th>
                      <th className="py-2">Stockout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overstockSkus.map((r) => {
                      const cover = monthsOfCover(r);
                      return (
                        <tr
                          key={r.sku_code}
                          className="border-b border-stone-100"
                        >
                          <td className="py-2 pr-4 font-medium">
                            {r.sku_code}
                          </td>
                          <td className="py-2 pr-4">
                            {r.franchise_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {formatNumber(r.current_stock)}
                          </td>
                          <td className="py-2 pr-4">
                            {formatNumber(r.forecast_daily_demand, 1)}
                          </td>
                          <td className="py-2 pr-4 text-indigo-700">
                            {cover !== null
                              ? `${formatNumber(cover, 1)} mo`
                              : "—"}
                          </td>
                          <td className="py-2 text-stone-600">
                            {r.projected_stockout_date ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function pctClass(value: number | null): string {
  if (value === null) return "text-stone-400";
  return value >= 0 ? "text-emerald-700" : "text-rose-600";
}
