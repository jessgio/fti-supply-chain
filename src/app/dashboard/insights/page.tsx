"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lightbulb, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatNumber } from "@/lib/utils";
import {
  DEFAULT_LEAD_TIME_MONTHS,
  DEFAULT_SAFETY_STOCK_MONTHS,
} from "@/lib/forecast/demand";
import { buildInsightFocusRows } from "@/lib/forecast/insight-focus";
import {
  STOCK_STATUS_BADGE,
  stockStatusOf,
} from "@/lib/forecast/stock-status";
import type { ForecastInsight, RestockRecommendation } from "@/types/database";

const OPENAI_ENABLED = process.env.NEXT_PUBLIC_OPENAI_ENABLED === "true";

function riskBadge(row: RestockRecommendation) {
  return STOCK_STATUS_BADGE[stockStatusOf(row)];
}

export default function InsightsPage() {
  const [recommendations, setRecommendations] = useState<
    RestockRecommendation[]
  >([]);
  const [insight, setInsight] = useState<ForecastInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [useAi, setUseAi] = useState(OPENAI_ENABLED);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/insights?ai=${useAi ? "true" : "false"}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load insights");
        if (!active) return;
        setRecommendations(data.recommendations ?? []);
        setInsight(data.insight ?? null);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [refreshKey, useAi]);

  const summary = useMemo(() => {
    const urgent = recommendations.filter(
      (r) => r.needs_reorder && !r.covered_by_po,
    );
    const onOrder = recommendations.filter((r) => r.on_order_qty > 0).length;
    const stockoutSoon = recommendations.filter(
      (r) => r.days_until_stockout !== null && r.days_until_stockout <= 30,
    ).length;
    return {
      urgent: urgent.length,
      onOrder,
      stockoutSoon,
      total: recommendations.length,
    };
  }, [recommendations]);

  const focusRows = useMemo(
    () => buildInsightFocusRows(recommendations),
    [recommendations],
  );

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-emerald-800" />
            <h1 className="text-2xl font-semibold text-stone-900">
              Supply chain insights
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-stone-600">
            Narrative summary of restock priorities and demand risks, built from
            the same L3M / L6M forecast as{" "}
            <Link
              href="/dashboard/inventory"
              className="font-medium text-emerald-800 hover:underline"
            >
              Inventory &amp; forecast
            </Link>
            .
            {OPENAI_ENABLED
              ? " Toggle OpenAI for a richer narrative, or use the rule-based summary."
              : " Rule-based summary from reorder points and demand patterns."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {OPENAI_ENABLED && (
            <Button
              size="sm"
              variant={useAi ? "default" : "outline"}
              onClick={() => setUseAi((v) => !v)}
              disabled={loading}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {useAi ? "OpenAI on" : "OpenAI off"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="SKUs analyzed" value={formatNumber(summary.total)} />
        <StatCard
          label="Need reorder"
          value={formatNumber(summary.urgent)}
          tone="danger"
          hint="Below reorder point, not on PO"
        />
        <StatCard
          label="Stockout < 30 days"
          value={formatNumber(summary.stockoutSoon)}
          tone="warning"
        />
        <StatCard
          label="On open POs"
          value={formatNumber(summary.onOrder)}
          tone="info"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-stone-500">
              Generating insights from demand and stock levels…
            </p>
          </CardContent>
        </Card>
      ) : insight ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>
                {useAi && OPENAI_ENABLED
                  ? "OpenAI narrative on top of forecast data"
                  : `Rule-based analysis (${DEFAULT_LEAD_TIME_MONTHS}-month lead + ${DEFAULT_SAFETY_STOCK_MONTHS}-month buffer)`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-stone-700">
              <p className="text-base leading-relaxed">{insight.summary}</p>
              {insight.highlights.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-stone-900">Highlights</p>
                  <ul className="list-inside list-disc space-y-1 text-stone-600">
                    {insight.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {insight.risks.length > 0 && (
                <div>
                  <p className="mb-2 font-medium text-stone-900">Risks</p>
                  <ul className="list-inside list-disc space-y-1 text-amber-900">
                    {insight.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {focusRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Focus SKUs</CardTitle>
                <CardDescription>
                  Urgent reorders and highest daily demand from the current
                  forecast.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border border-stone-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                        <th className="px-3 py-2 font-medium">Focus</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Franchise</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Stock
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Fcst/day
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Reorder pt.
                        </th>
                        <th className="px-3 py-2 font-medium">Stockout</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Restock qty
                        </th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {focusRows.map(({ row, focus }) => {
                        const badge = riskBadge(row);
                        return (
                          <tr
                            key={row.sku_code}
                            className="border-b border-stone-100 last:border-0"
                          >
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {focus.has("risk") && (
                                  <Badge className="bg-amber-100 text-amber-900">
                                    Reorder risk
                                  </Badge>
                                )}
                                {focus.has("demand") && (
                                  <Badge className="bg-violet-100 text-violet-800">
                                    High demand
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium">
                              {row.sku_code}
                            </td>
                            <td className="px-3 py-2">
                              {row.franchise_name ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(row.current_stock)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <div className="flex flex-col items-end gap-0.5">
                                <span>
                                  {formatNumber(row.forecast_daily_demand, 1)}
                                </span>
                                {row.seasonal_uplift_multiplier > 1 && (
                                  <span
                                    className="text-xs text-amber-800"
                                    title={row.seasonal_uplift_reasons.join(
                                      ", ",
                                    )}
                                  >
                                    +
                                    {Math.round(
                                      (row.seasonal_uplift_multiplier - 1) *
                                        100,
                                    )}
                                    %
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNumber(Math.ceil(row.reorder_point))}
                            </td>
                            <td className="px-3 py-2">
                              {row.projected_stockout_date ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums text-emerald-800">
                              {formatNumber(row.recommended_restock_qty)}
                            </td>
                            <td className="px-3 py-2">
                              <Badge className={badge.className}>
                                {badge.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-stone-500">
              Upload sales and stock data to generate insights.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link href="/dashboard/inventory">
            <Button variant="outline" size="sm">
              View full restock plan
            </Button>
          </Link>
          <Link href="/dashboard/procurement">
            <Button variant="outline" size="sm">
              Raise purchase orders
            </Button>
          </Link>
        </CardContent>
      </Card>
    </PageShell>
  );
}
