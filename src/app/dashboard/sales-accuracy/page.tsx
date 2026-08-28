"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MONTH_LABELS } from "@/lib/sales-forecast/constants";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type {
  SalesAccuracyGroupSummary,
  SalesAccuracyMetrics,
  SalesAccuracyPayload,
  SalesAccuracySkuRow,
  SopChannelGroup,
} from "@/types/database";

type Workspace = SopChannelGroup | "combined";
type PeriodMode = "monthly" | "ytd";
type SortKey =
  | "sku_code"
  | "wmape_qty"
  | "bias_qty"
  | "wmape_post_tax"
  | "bias_post_tax"
  | "plan_qty"
  | "actual_qty"
  | "plan_post_tax"
  | "actual_post_tax";
type SortDir = "asc" | "desc";

function formatMetricPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}%`;
}

function biasClass(value: number | null): string {
  if (value == null) return "text-stone-500";
  if (Math.abs(value) < 5) return "text-stone-700";
  return value > 0 ? "text-emerald-700" : "text-amber-700";
}

function MetricCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums text-stone-900",
          valueClassName,
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: SalesAccuracyMetrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="WMAPE qty"
        value={formatMetricPct(summary.wmape_qty)}
        hint="Volume-weighted abs. error"
      />
      <MetricCard
        label="Bias qty"
        value={formatMetricPct(summary.bias_qty)}
        hint="Positive = plan above sales"
        valueClassName={biasClass(summary.bias_qty)}
      />
      <MetricCard
        label="WMAPE net"
        value={formatMetricPct(summary.wmape_post_tax)}
        hint="Post-tax net error"
      />
      <MetricCard
        label="Bias net"
        value={formatMetricPct(summary.bias_post_tax)}
        hint="Positive = plan above sales"
        valueClassName={biasClass(summary.bias_post_tax)}
      />
    </div>
  );
}

function TotalsStrip({ summary }: { summary: SalesAccuracyMetrics }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Plan qty"
        value={formatNumber(summary.plan_qty, 1)}
      />
      <MetricCard
        label="Actual qty"
        value={formatNumber(summary.actual_qty, 1)}
      />
      <MetricCard
        label="Plan post-tax"
        value={formatCurrency(summary.plan_post_tax)}
      />
      <MetricCard
        label="Actual post-tax"
        value={formatCurrency(summary.actual_post_tax)}
      />
    </div>
  );
}

export default function SalesAccuracyPage() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  const [year, setYear] = useState(currentYear);
  const [workspace, setWorkspace] = useState<Workspace>("online");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("monthly");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [data, setData] = useState<SalesAccuracyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [sortKey, setSortKey] = useState<SortKey>("wmape_qty");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-accuracy?year=${year}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load accuracy");
      const payload = json as SalesAccuracyPayload;
      setData(payload);
      setSelectedMonth((prev) => {
        if (
          prev != null &&
          payload.completed_months.includes(prev)
        ) {
          return prev;
        }
        return (
          payload.completed_months[payload.completed_months.length - 1] ?? null
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accuracy");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupSummary: SalesAccuracyGroupSummary | null = useMemo(() => {
    if (!data) return null;
    if (workspace === "combined") return data.combined;
    return data.groups[workspace];
  }, [data, workspace]);

  const activeMetrics: SalesAccuracyMetrics | null = useMemo(() => {
    if (!groupSummary) return null;
    if (periodMode === "ytd") return groupSummary;
    const monthSlice = groupSummary.months.find(
      (m) => m.month === selectedMonth,
    );
    return monthSlice ?? null;
  }, [groupSummary, periodMode, selectedMonth]);

  const activeSkus: SalesAccuracySkuRow[] = useMemo(() => {
    if (!groupSummary) return [];
    if (periodMode === "ytd") return groupSummary.skus;
    const monthSlice = groupSummary.months.find(
      (m) => m.month === selectedMonth,
    );
    return monthSlice?.skus ?? [];
  }, [groupSummary, periodMode, selectedMonth]);

  const filteredSkus = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = activeSkus.filter((row) => {
      if (!q) return true;
      return (
        row.sku_code.toLowerCase().includes(q) ||
        (row.name ?? "").toLowerCase().includes(q) ||
        (row.franchise_name ?? "").toLowerCase().includes(q)
      );
    });
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (sortKey === "sku_code") {
        cmp = a.sku_code.localeCompare(b.sku_code);
      } else {
        const an = typeof av === "number" ? av : Number.NEGATIVE_INFINITY;
        const bn = typeof bv === "number" ? bv : Number.NEGATIVE_INFINITY;
        cmp = an - bn;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [activeSkus, debouncedSearch, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "sku_code" ? "asc" : "desc");
    }
  }

  const periodCaption =
    periodMode === "ytd"
      ? "Running annual (YTD across all completed months)"
      : selectedMonth != null
        ? `Monthly: ${MONTH_LABELS[selectedMonth - 1]}`
        : "Monthly";

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Sales accuracy
          </h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Compare latest Sales Forecast plan inputs to actual sales for Online
            and Offline. Switch between a single month and running annual (YTD).
            Positive bias means the plan was above sales (bullish).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-stone-600">
            Year{" "}
            <select
              className="ml-1 h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {(
              [
                ["online", "Online"],
                ["offline", "Offline"],
                ["combined", "Combined"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={workspace === id ? "default" : "outline"}
                onClick={() => setWorkspace(id)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={periodMode === "monthly" ? "default" : "outline"}
            onClick={() => setPeriodMode("monthly")}
          >
            Monthly
          </Button>
          <Button
            size="sm"
            variant={periodMode === "ytd" ? "default" : "outline"}
            onClick={() => setPeriodMode("ytd")}
          >
            YTD (running annual)
          </Button>
        </div>
        {periodMode === "monthly" && data && data.completed_months.length > 0 ? (
          <label className="text-sm text-stone-600">
            Month{" "}
            <select
              className="ml-1 h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm"
              value={selectedMonth ?? ""}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {data.completed_months.map((m) => (
                <option key={m} value={m}>
                  {MONTH_LABELS[m - 1]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Loading accuracy…</p>
      ) : !groupSummary || !activeMetrics ? (
        <p className="text-sm text-stone-500">
          {data && data.completed_months.length === 0
            ? "No completed months yet for this year."
            : "No accuracy data for this period."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="SKUs scored"
              value={formatNumber(activeMetrics.sku_count)}
            />
            <MetricCard
              label={periodMode === "ytd" ? "SKU-months" : "SKUs in month"}
              value={formatNumber(activeMetrics.sku_month_count)}
            />
            <MetricCard label="Period" value={periodCaption} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Team scorecard</CardTitle>
              <CardDescription>
                {periodMode === "ytd"
                  ? "Cumulative plan vs actuals from January through the latest completed month."
                  : "Plan vs actuals for the selected calendar month only."}{" "}
                Silent zero SKU-months (no plan and no sales) are excluded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryStrip summary={activeMetrics} />
              <TotalsStrip summary={activeMetrics} />
            </CardContent>
          </Card>

          {periodMode === "ytd" && groupSummary.ytd_running.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Running YTD by month</CardTitle>
                <CardDescription>
                  How team accuracy evolves as each month is added to the year.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead>
                      <tr className="text-stone-500">
                        <th className="px-4 py-2.5 font-medium">Through</th>
                        <th className="px-4 py-2.5 font-medium">WMAPE qty</th>
                        <th className="px-4 py-2.5 font-medium">Bias qty</th>
                        <th className="px-4 py-2.5 font-medium">WMAPE net</th>
                        <th className="px-4 py-2.5 font-medium">Bias net</th>
                        <th className="px-4 py-2.5 font-medium">Actual net</th>
                        <th className="px-4 py-2.5 font-medium">SKU-months</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupSummary.ytd_running.map((row) => (
                        <tr
                          key={row.through_month}
                          className="border-t border-stone-200"
                        >
                          <td className="px-4 py-2.5 font-medium text-stone-900">
                            {MONTH_LABELS[row.through_month - 1]}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">
                            {formatMetricPct(row.wmape_qty)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2.5 tabular-nums",
                              biasClass(row.bias_qty),
                            )}
                          >
                            {formatMetricPct(row.bias_qty)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">
                            {formatMetricPct(row.wmape_post_tax)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2.5 tabular-nums",
                              biasClass(row.bias_post_tax),
                            )}
                          >
                            {formatMetricPct(row.bias_post_tax)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-stone-600">
                            {formatCurrency(row.actual_post_tax)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-stone-600">
                            {row.sku_month_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {periodMode === "monthly" && groupSummary.months.length > 0 ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Monthly comparison</CardTitle>
                <CardDescription>
                  Single-month team scores for every completed month this year.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead>
                      <tr className="text-stone-500">
                        <th className="px-4 py-2.5 font-medium">Month</th>
                        <th className="px-4 py-2.5 font-medium">WMAPE qty</th>
                        <th className="px-4 py-2.5 font-medium">Bias qty</th>
                        <th className="px-4 py-2.5 font-medium">WMAPE net</th>
                        <th className="px-4 py-2.5 font-medium">Bias net</th>
                        <th className="px-4 py-2.5 font-medium">Actual net</th>
                        <th className="px-4 py-2.5 font-medium">SKUs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupSummary.months.map((row) => {
                        const active = row.month === selectedMonth;
                        return (
                          <tr
                            key={row.month}
                            className={cn(
                              "border-t border-stone-200",
                              active ? "bg-emerald-50/60" : null,
                            )}
                          >
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                className="font-medium text-stone-900 underline-offset-2 hover:underline"
                                onClick={() => setSelectedMonth(row.month)}
                              >
                                {MONTH_LABELS[row.month - 1]}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {formatMetricPct(row.wmape_qty)}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-2.5 tabular-nums",
                                biasClass(row.bias_qty),
                              )}
                            >
                              {formatMetricPct(row.bias_qty)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {formatMetricPct(row.wmape_post_tax)}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-2.5 tabular-nums",
                                biasClass(row.bias_post_tax),
                              )}
                            >
                              {formatMetricPct(row.bias_post_tax)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-stone-600">
                              {formatCurrency(row.actual_post_tax)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-stone-600">
                              {row.sku_count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-stone-200">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>SKU drill-down</CardTitle>
                  <CardDescription>
                    {periodMode === "ytd"
                      ? "Per-SKU WMAPE and bias across all completed months (YTD)."
                      : `Per-SKU accuracy for ${selectedMonth != null ? MONTH_LABELS[selectedMonth - 1] : "the selected month"}.`}
                  </CardDescription>
                </div>
                <Input
                  className="h-8 w-44 text-xs"
                  placeholder="Search SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredSkus.length === 0 ? (
                <p className="p-5 text-sm text-stone-500">
                  No SKUs match for this team and period.
                </p>
              ) : (
                <div className="max-h-[min(70vh,calc(100vh-12rem))] overflow-auto">
                  <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="text-stone-500">
                        <SortTh
                          label="SKU"
                          columnKey="sku_code"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <th className="sticky top-0 z-10 bg-stone-50 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                          Franchise
                        </th>
                        <SortTh
                          label="WMAPE qty"
                          columnKey="wmape_qty"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="Bias qty"
                          columnKey="bias_qty"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="WMAPE net"
                          columnKey="wmape_post_tax"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="Bias net"
                          columnKey="bias_post_tax"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="Plan qty"
                          columnKey="plan_qty"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="Actual qty"
                          columnKey="actual_qty"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="Plan net"
                          columnKey="plan_post_tax"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        <SortTh
                          label="Actual net"
                          columnKey="actual_post_tax"
                          active={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                        {periodMode === "ytd" ? (
                          <th className="sticky top-0 z-10 bg-stone-50 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
                            Months
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSkus.map((row) => (
                        <SkuRow
                          key={row.sku_id}
                          row={row}
                          showMonths={periodMode === "ytd"}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function SkuRow({
  row,
  showMonths,
}: {
  row: SalesAccuracySkuRow;
  showMonths: boolean;
}) {
  return (
    <tr className="border-t border-stone-200">
      <td className="px-3 py-2.5 font-medium text-stone-900">
        <span className="block whitespace-nowrap">{row.sku_code}</span>
        {row.name ? (
          <span className="mt-0.5 block text-xs font-normal text-stone-500">
            {row.name}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-stone-600">
        {row.is_bundle ? "Bundles" : (row.franchise_name ?? "—")}
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        {formatMetricPct(row.wmape_qty)}
      </td>
      <td className={cn("px-3 py-2.5 tabular-nums", biasClass(row.bias_qty))}>
        {formatMetricPct(row.bias_qty)}
      </td>
      <td className="px-3 py-2.5 tabular-nums">
        {formatMetricPct(row.wmape_post_tax)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 tabular-nums",
          biasClass(row.bias_post_tax),
        )}
      >
        {formatMetricPct(row.bias_post_tax)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-stone-600">
        {formatNumber(row.plan_qty, 1)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-stone-600">
        {formatNumber(row.actual_qty, 1)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-stone-600">
        {formatCurrency(row.plan_post_tax)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-stone-600">
        {formatCurrency(row.actual_post_tax)}
      </td>
      {showMonths ? (
        <td className="px-3 py-2.5 tabular-nums text-stone-600">
          {row.sku_month_count}
        </td>
      ) : null}
    </tr>
  );
}

function SortTh({
  label,
  columnKey,
  active,
  dir,
  onSort,
}: {
  label: string;
  columnKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = active === columnKey;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="sticky top-0 z-10 bg-stone-50 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_#e7e5e4]">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-stone-800"
        onClick={() => onSort(columnKey)}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}
