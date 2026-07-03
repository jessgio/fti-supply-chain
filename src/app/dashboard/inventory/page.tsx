"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/dashboard/page-shell";
import { formatNumber } from "@/lib/utils";
import {
  DAYS_PER_MONTH,
  DEFAULT_LEAD_TIME_MONTHS,
  DEFAULT_SAFETY_STOCK_MONTHS,
  DEFAULT_TARGET_STOCK_MONTHS,
} from "@/lib/forecast/demand";
import {
  OVERSTOCK_MONTHS,
  STOCK_STATUS_BADGE,
  STOCK_STATUS_ORDER,
  stockStatusOf,
  type StockStatus,
} from "@/lib/forecast/stock-status";
import { applySeasonalityToggle } from "@/lib/forecast/seasonality-toggle";
import type {
  DemandPattern,
  NpdStockRow,
  ProductLinkedPackagingRow,
  RestockRecommendation,
  VelocityClass,
} from "@/types/database";

function riskOf(row: RestockRecommendation): StockStatus {
  return stockStatusOf(row);
}

const RISK_BADGE = STOCK_STATUS_BADGE;

const RISK_ORDER = STOCK_STATUS_ORDER;

const CONFIDENCE_BADGE: Record<
  RestockRecommendation["confidence"],
  string
> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-stone-100 text-stone-600",
};

const VELOCITY_BADGE: Record<VelocityClass, { label: string; className: string }> =
  {
    fast: { label: "Fast", className: "bg-violet-100 text-violet-800" },
    normal: { label: "Normal", className: "bg-stone-100 text-stone-700" },
    slow: { label: "Slow", className: "bg-slate-100 text-slate-600" },
  };

const PATTERN_BADGE: Record<DemandPattern, { label: string; className: string }> =
  {
    npd: { label: "NPD", className: "bg-sky-100 text-sky-800" },
    volatile: { label: "Volatile", className: "bg-amber-100 text-amber-900" },
    steady: { label: "Steady", className: "bg-emerald-100 text-emerald-800" },
  };

const VELOCITY_ORDER: Record<VelocityClass, number> = {
  fast: 0,
  normal: 1,
  slow: 2,
};

const CONFIDENCE_ORDER: Record<RestockRecommendation["confidence"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type SortKey =
  | "status"
  | "sku_code"
  | "franchise_name"
  | "velocity_class"
  | "demand_pattern"
  | "current_stock"
  | "on_order_qty"
  | "forecast_daily_demand"
  | "forecast_monthly_demand"
  | "days_until_stockout"
  | "projected_stockout_date"
  | "earliest_incoming_batch_date"
  | "incoming_batch_stockout_date"
  | "reorder_point"
  | "recommended_restock_qty"
  | "confidence";

type SortDir = "asc" | "desc";

interface ColumnFilters {
  status: StockStatus | "";
  velocity: VelocityClass | "";
  pattern: DemandPattern | "";
  confidence: RestockRecommendation["confidence"] | "";
  franchise: string;
}

type MetricKey =
  | "total"
  | "fast"
  | "slow"
  | "npd"
  | "volatile"
  | "seasonalUplift"
  | "reorder"
  | "stockoutSoon"
  | "onOrder"
  | "overstock";

const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  status: "",
  velocity: "",
  pattern: "",
  confidence: "",
  franchise: "",
};

function matchesMetric(
  row: RestockRecommendation,
  metric: MetricKey,
): boolean {
  switch (metric) {
    case "total":
      return true;
    case "fast":
      return row.velocity_class === "fast";
    case "slow":
      return row.velocity_class === "slow";
    case "npd":
      return row.demand_pattern === "npd";
    case "volatile":
      return row.demand_pattern === "volatile";
    case "seasonalUplift":
      return row.seasonal_uplift_multiplier > 1;
    case "reorder":
      return riskOf(row) === "reorder";
    case "stockoutSoon":
      return (
        row.days_until_stockout !== null && row.days_until_stockout <= 30
      );
    case "onOrder":
      return row.on_order_qty > 0;
    case "overstock":
      return riskOf(row) === "overstock";
  }
}

function columnFiltersForMetric(metric: MetricKey): ColumnFilters {
  switch (metric) {
    case "reorder":
      return { ...EMPTY_COLUMN_FILTERS, status: "reorder" };
    case "overstock":
      return { ...EMPTY_COLUMN_FILTERS, status: "overstock" };
    case "fast":
      return { ...EMPTY_COLUMN_FILTERS, velocity: "fast" };
    case "slow":
      return { ...EMPTY_COLUMN_FILTERS, velocity: "slow" };
    case "npd":
      return { ...EMPTY_COLUMN_FILTERS, pattern: "npd" };
    case "volatile":
      return { ...EMPTY_COLUMN_FILTERS, pattern: "volatile" };
    default:
      return EMPTY_COLUMN_FILTERS;
  }
}

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

function compareRows(
  a: RestockRecommendation,
  b: RestockRecommendation,
  key: SortKey,
  dir: SortDir,
): number {
  let cmp = 0;
  switch (key) {
    case "status":
      cmp = RISK_ORDER[riskOf(a)] - RISK_ORDER[riskOf(b)];
      break;
    case "sku_code":
      cmp = a.sku_code.localeCompare(b.sku_code);
      break;
    case "franchise_name":
      cmp = (a.franchise_name ?? "").localeCompare(b.franchise_name ?? "");
      break;
    case "velocity_class":
      cmp = VELOCITY_ORDER[a.velocity_class] - VELOCITY_ORDER[b.velocity_class];
      break;
    case "demand_pattern":
      cmp = a.demand_pattern.localeCompare(b.demand_pattern);
      break;
    case "current_stock":
      cmp = a.current_stock - b.current_stock;
      break;
    case "on_order_qty":
      cmp = a.on_order_qty - b.on_order_qty;
      break;
    case "forecast_daily_demand":
      cmp = a.forecast_daily_demand - b.forecast_daily_demand;
      break;
    case "forecast_monthly_demand":
      cmp =
        a.forecast_daily_demand * DAYS_PER_MONTH -
        b.forecast_daily_demand * DAYS_PER_MONTH;
      break;
    case "days_until_stockout":
      return compareNullableNumber(a.days_until_stockout, b.days_until_stockout, dir);
    case "projected_stockout_date": {
      const aDate = a.projected_stockout_date ?? "";
      const bDate = b.projected_stockout_date ?? "";
      if (!aDate && !bDate) cmp = 0;
      else if (!aDate) cmp = 1;
      else if (!bDate) cmp = -1;
      else cmp = aDate.localeCompare(bDate);
      break;
    }
    case "earliest_incoming_batch_date": {
      const aDate = a.earliest_incoming_batch_date ?? "";
      const bDate = b.earliest_incoming_batch_date ?? "";
      if (!aDate && !bDate) cmp = 0;
      else if (!aDate) cmp = 1;
      else if (!bDate) cmp = -1;
      else cmp = aDate.localeCompare(bDate);
      break;
    }
    case "incoming_batch_stockout_date": {
      const aDate = a.incoming_batch_stockout_date ?? "";
      const bDate = b.incoming_batch_stockout_date ?? "";
      if (!aDate && !bDate) cmp = 0;
      else if (!aDate) cmp = 1;
      else if (!bDate) cmp = -1;
      else cmp = aDate.localeCompare(bDate);
      break;
    }
    case "reorder_point":
      cmp = a.reorder_point - b.reorder_point;
      break;
    case "recommended_restock_qty":
      cmp = a.recommended_restock_qty - b.recommended_restock_qty;
      break;
    case "confidence":
      cmp = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      break;
  }
  return dir === "asc" ? cmp : -cmp;
}

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
  filter,
}: {
  label: string;
  columnKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  filter?: ReactNode;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="sticky top-0 z-10 bg-stone-50 py-2 pr-4 align-top shadow-[inset_0_-1px_0_#e7e5e4]">
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
      {filter}
    </th>
  );
}

export default function InventoryPage() {
  const [rawRecommendations, setRawRecommendations] = useState<
    RestockRecommendation[]
  >([]);
  const [npdSkus, setNpdSkus] = useState<NpdStockRow[]>([]);
  const [packagingByProduct, setPackagingByProduct] = useState<
    Record<string, ProductLinkedPackagingRow[]>
  >({});
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [seasonalityEnabled, setSeasonalityEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(
    EMPTY_COLUMN_FILTERS,
  );
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  function handleMetricClick(metric: MetricKey) {
    if (metric === "total" || activeMetric === metric) {
      clearAllFilters();
      return;
    }
    setActiveMetric(metric);
    setColumnFilters(columnFiltersForMetric(metric));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleColumnFilterChange(
    updater: (filters: ColumnFilters) => ColumnFilters,
  ) {
    setActiveMetric(null);
    setColumnFilters(updater);
  }

  function clearAllFilters() {
    setActiveMetric(null);
    setColumnFilters(EMPTY_COLUMN_FILTERS);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleSkuExpanded(skuCode: string) {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(skuCode)) next.delete(skuCode);
      else next.add(skuCode);
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    async function loadForecast() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/forecast");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Forecast failed");
        if (!active) return;
        setRawRecommendations(data.recommendations ?? []);
        setNpdSkus(data.npd_skus ?? []);
        setPackagingByProduct(data.packaging_by_product ?? {});
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Forecast failed");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadForecast();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const recommendations = useMemo(
    () => applySeasonalityToggle(rawRecommendations, seasonalityEnabled),
    [rawRecommendations, seasonalityEnabled],
  );

  const summary = useMemo(() => {
    const reorder = recommendations.filter(
      (r) => riskOf(r) === "reorder",
    ).length;
    const onOrder = recommendations.filter((r) => r.on_order_qty > 0).length;
    const stockoutSoon = recommendations.filter(
      (r) => r.days_until_stockout !== null && r.days_until_stockout <= 30,
    ).length;
    const fast = recommendations.filter((r) => r.velocity_class === "fast").length;
    const slow = recommendations.filter((r) => r.velocity_class === "slow").length;
    const npd = recommendations.filter((r) => r.demand_pattern === "npd").length;
    const volatile = recommendations.filter(
      (r) => r.demand_pattern === "volatile",
    ).length;
    const overstock = recommendations.filter(
      (r) => riskOf(r) === "overstock",
    ).length;
    const seasonalUplift = rawRecommendations.filter(
      (r) => r.seasonal_uplift_multiplier > 1,
    ).length;
    return {
      reorder,
      onOrder,
      stockoutSoon,
      overstock,
      fast,
      slow,
      npd,
      volatile,
      seasonalUplift,
      total: recommendations.length,
    };
  }, [recommendations, rawRecommendations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const franchiseQ = columnFilters.franchise.trim().toLowerCase();

    const rows = recommendations.filter((r) => {
      if (needsActionOnly && !(r.needs_reorder && !r.covered_by_po))
        return false;
      if (activeMetric && activeMetric !== "total" && !matchesMetric(r, activeMetric))
        return false;
      if (columnFilters.status && riskOf(r) !== columnFilters.status)
        return false;
      if (
        columnFilters.velocity &&
        r.velocity_class !== columnFilters.velocity
      )
        return false;
      if (columnFilters.pattern && r.demand_pattern !== columnFilters.pattern)
        return false;
      if (columnFilters.confidence && r.confidence !== columnFilters.confidence)
        return false;
      if (
        franchiseQ &&
        !(r.franchise_name ?? "").toLowerCase().includes(franchiseQ)
      )
        return false;
      if (!q) return true;
      return (
        r.sku_code.toLowerCase().includes(q) ||
        (r.franchise_name ?? "").toLowerCase().includes(q)
      );
    });

    return [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [
    recommendations,
    search,
    needsActionOnly,
    activeMetric,
    columnFilters,
    sortKey,
    sortDir,
  ]);

  const hasColumnFilters =
    activeMetric !== null ||
    columnFilters.status !== "" ||
    columnFilters.velocity !== "" ||
    columnFilters.pattern !== "" ||
    columnFilters.confidence !== "" ||
    columnFilters.franchise.trim() !== "";

  return (
    <PageShell wide={true}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Inventory & demand forecast
          </h1>
          <p className="mt-1 text-stone-600">
            Active (franchise-mapped) SKUs only. Reorder{" "}
            {DEFAULT_LEAD_TIME_MONTHS + DEFAULT_SAFETY_STOCK_MONTHS} months before
            the projected stockout ({DEFAULT_LEAD_TIME_MONTHS}-month lead time +{" "}
            {DEFAULT_SAFETY_STOCK_MONTHS}-month buffer) and order a{" "}
            {DEFAULT_TARGET_STOCK_MONTHS}-month batch. Fcst/day is uplifted when
            the reorder window overlaps Ramadan or Q4 (from prior-year sales, or
            +35% / +25% defaults). Open purchase orders are netted out so
            already-ordered SKUs are not re-flagged. See{" "}
            <Link
              href="/dashboard/insights"
              className="font-medium text-emerald-800 hover:underline"
            >
              Supply chain insights
            </Link>{" "}
            for the narrative summary.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={seasonalityEnabled ? "default" : "outline"}
            onClick={() => setSeasonalityEnabled((v) => !v)}
            disabled={loading}
            title="Toggle Ramadan / Q4 uplift on Fcst/day and restock calculations"
          >
            Seasonality {seasonalityEnabled ? "on" : "off"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            Refresh forecast
          </Button>
        </div>
      </div>

      {!seasonalityEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Seasonality is off — Fcst/day and restock metrics use the base L3M/L6M
          blend without Ramadan or Q4 uplift. Toggle on to compare with seasonal
          demand.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-10">
        <StatCard
          label="SKUs tracked"
          value={formatNumber(summary.total)}
          onClick={() => handleMetricClick("total")}
        />
        <StatCard
          label="Fast-moving"
          value={formatNumber(summary.fast)}
          hint="Top third by Fcst/day"
          active={activeMetric === "fast"}
          onClick={() => handleMetricClick("fast")}
        />
        <StatCard
          label="Slow-moving"
          value={formatNumber(summary.slow)}
          hint="Bottom third or no demand"
          active={activeMetric === "slow"}
          onClick={() => handleMetricClick("slow")}
        />
        <StatCard
          label="NPD"
          value={formatNumber(summary.npd)}
          hint="Launched < 3 months ago"
          tone="info"
          active={activeMetric === "npd"}
          onClick={() => handleMetricClick("npd")}
        />
        <StatCard
          label="Volatile"
          value={formatNumber(summary.volatile)}
          hint="Erratic monthly sales"
          tone="warning"
          active={activeMetric === "volatile"}
          onClick={() => handleMetricClick("volatile")}
        />
        <StatCard
          label="Seasonal uplift"
          value={formatNumber(summary.seasonalUplift)}
          hint="Ramadan or Q4 in reorder window"
          tone="warning"
          active={activeMetric === "seasonalUplift"}
          onClick={() => handleMetricClick("seasonalUplift")}
        />
        <StatCard
          label="Reorder now"
          value={formatNumber(summary.reorder)}
          tone="danger"
          active={activeMetric === "reorder"}
          onClick={() => handleMetricClick("reorder")}
        />
        <StatCard
          label="Stockout < 30 days"
          value={formatNumber(summary.stockoutSoon)}
          tone="warning"
          active={activeMetric === "stockoutSoon"}
          onClick={() => handleMetricClick("stockoutSoon")}
        />
        <StatCard
          label="SKUs on order"
          value={formatNumber(summary.onOrder)}
          tone="info"
          active={activeMetric === "onOrder"}
          onClick={() => handleMetricClick("onOrder")}
        />
        <StatCard
          label="Overstock"
          value={formatNumber(summary.overstock)}
          hint={`>${OVERSTOCK_MONTHS} mo cover`}
          tone={summary.overstock > 0 ? "info" : "default"}
          active={activeMetric === "overstock"}
          onClick={() => handleMetricClick("overstock")}
        />
      </div>

      <div ref={tableRef}>
      <Card className="overflow-hidden">
        <CardHeader className="sticky top-0 z-20 border-b border-stone-200 bg-white pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Restock plan</CardTitle>
              <CardDescription>
                Click column headers to sort; use filters below each label to
                narrow results. Velocity = franchise rank by Fcst/day (includes
                Ramadan / Q4 uplift when in the reorder window). Stockout is
                on-hand only; Batch stockout projects when the latest incoming
                PO batch runs out after current stock (FIFO). Restock qty is the
                standard {DEFAULT_TARGET_STOCK_MONTHS}-month batch. Expand a SKU
                row to see linked packaging stock and restock needs.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-48"
                placeholder="Search SKU or franchise"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                size="sm"
                variant={needsActionOnly ? "default" : "outline"}
                onClick={() => setNeedsActionOnly((v) => !v)}
              >
                Needs action
              </Button>
              {hasColumnFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAllFilters}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-5 text-sm text-stone-500">
              Calculating forecast from recent demand and stock levels...
            </p>
          ) : error ? (
            <p className="p-5 text-sm text-red-600">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-stone-500">
              {recommendations.length === 0
                ? "Upload sales and stock data to generate recommendations."
                : "No SKUs match the current filters."}
            </p>
          ) : (
            <div className="max-h-[min(70vh,calc(100vh-14rem))] overflow-auto px-5 pb-5">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-stone-500">
                    <SortableHeader
                      label="Status"
                      columnKey="status"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      filter={
                        <Select
                          className="mt-1 h-7 w-full min-w-[6.5rem] py-0 text-xs"
                          value={columnFilters.status}
                          onChange={(e) =>
                            handleColumnFilterChange((f) => ({
                              ...f,
                              status: e.target.value as StockStatus | "",
                            }))
                          }
                        >
                          <option value="">All</option>
                          <option value="reorder">Reorder now</option>
                          <option value="watch">Watch</option>
                          <option value="on_order">On order</option>
                          <option value="overstock">Overstock</option>
                          <option value="healthy">Healthy</option>
                        </Select>
                      }
                    />
                    <SortableHeader
                      label="SKU"
                      columnKey="sku_code"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Franchise"
                      columnKey="franchise_name"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      filter={
                        <Input
                          className="mt-1 h-7 text-xs"
                          placeholder="Filter"
                          value={columnFilters.franchise}
                          onChange={(e) =>
                            handleColumnFilterChange((f) => ({
                              ...f,
                              franchise: e.target.value,
                            }))
                          }
                        />
                      }
                    />
                    <SortableHeader
                      label="Velocity"
                      columnKey="velocity_class"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      filter={
                        <Select
                          className="mt-1 h-7 w-full min-w-[5.5rem] py-0 text-xs"
                          value={columnFilters.velocity}
                          onChange={(e) =>
                            handleColumnFilterChange((f) => ({
                              ...f,
                              velocity: e.target.value as VelocityClass | "",
                            }))
                          }
                        >
                          <option value="">All</option>
                          <option value="fast">Fast</option>
                          <option value="normal">Normal</option>
                          <option value="slow">Slow</option>
                        </Select>
                      }
                    />
                    <SortableHeader
                      label="Pattern"
                      columnKey="demand_pattern"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      filter={
                        <Select
                          className="mt-1 h-7 w-full min-w-[5.5rem] py-0 text-xs"
                          value={columnFilters.pattern}
                          onChange={(e) =>
                            handleColumnFilterChange((f) => ({
                              ...f,
                              pattern: e.target.value as DemandPattern | "",
                            }))
                          }
                        >
                          <option value="">All</option>
                          <option value="npd">NPD</option>
                          <option value="volatile">Volatile</option>
                          <option value="steady">Steady</option>
                        </Select>
                      }
                    />
                    <SortableHeader
                      label="Stock"
                      columnKey="current_stock"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="On order"
                      columnKey="on_order_qty"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Fcst/day"
                      columnKey="forecast_daily_demand"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Fcst/mo"
                      columnKey="forecast_monthly_demand"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Days left"
                      columnKey="days_until_stockout"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="On-hand stockout"
                      columnKey="projected_stockout_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Next batch in"
                      columnKey="earliest_incoming_batch_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Batch stockout"
                      columnKey="incoming_batch_stockout_date"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Reorder pt."
                      columnKey="reorder_point"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Restock qty"
                      columnKey="recommended_restock_qty"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Conf."
                      columnKey="confidence"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      filter={
                        <Select
                          className="mt-1 h-7 w-full min-w-[5rem] py-0 text-xs"
                          value={columnFilters.confidence}
                          onChange={(e) =>
                            handleColumnFilterChange((f) => ({
                              ...f,
                              confidence: e.target
                                .value as RestockRecommendation["confidence"] | "",
                            }))
                          }
                        >
                          <option value="">All</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </Select>
                      }
                    />
                    <th className="sticky top-0 z-10 bg-stone-50 py-2 shadow-[inset_0_-1px_0_#e7e5e4]" />
                  </tr>
                </thead>
              <tbody>
                {filtered.map((row) => {
                  const risk = riskOf(row);
                  const badge = RISK_BADGE[risk];
                  const packagingLinks = packagingByProduct[row.sku_code] ?? [];
                  const hasPackaging = packagingLinks.length > 0;
                  const isExpanded = expandedSkus.has(row.sku_code);
                  const stockoutGapDays =
                    row.has_stockout_gap &&
                    row.projected_stockout_date &&
                    row.earliest_incoming_batch_date
                      ? Math.round(
                          (Date.parse(row.earliest_incoming_batch_date) -
                            Date.parse(row.projected_stockout_date)) /
                            86_400_000,
                        )
                      : null;
                  return (
                    <Fragment key={row.sku_code}>
                    <tr className="border-b border-stone-100">
                      <td className="py-2 pr-4">
                        <Badge className={badge.className}>{badge.label}</Badge>
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        <div className="flex items-center gap-1">
                          {hasPackaging ? (
                            <button
                              type="button"
                              className="rounded p-0.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                              onClick={() => toggleSkuExpanded(row.sku_code)}
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `Collapse packaging for ${row.sku_code}`
                                  : `Expand packaging for ${row.sku_code}`
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="w-5 shrink-0" aria-hidden />
                          )}
                          <span>{row.sku_code}</span>
                          {hasPackaging && (
                            <span className="text-xs font-normal text-stone-400">
                              ({packagingLinks.length} pkg)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{row.franchise_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          className={
                            VELOCITY_BADGE[row.velocity_class].className
                          }
                        >
                          {VELOCITY_BADGE[row.velocity_class].label}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          className={
                            PATTERN_BADGE[row.demand_pattern].className
                          }
                        >
                          {PATTERN_BADGE[row.demand_pattern].label}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {formatNumber(row.current_stock)}
                      </td>
                      <td className="py-2 pr-4 text-sky-700">
                        {row.on_order_qty > 0
                          ? formatNumber(row.on_order_qty)
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col gap-0.5">
                          <span>{formatNumber(row.forecast_daily_demand, 1)}</span>
                          {seasonalityEnabled &&
                            row.seasonal_uplift_multiplier > 1 && (
                            <span
                              className="text-xs text-amber-800"
                              title={row.seasonal_uplift_reasons.join(", ")}
                            >
                              +
                              {Math.round(
                                (row.seasonal_uplift_multiplier - 1) * 100,
                              )}
                              % seasonal
                            </span>
                          )}
                          {!seasonalityEnabled &&
                            row.seasonal_uplift_multiplier > 1 && (
                            <span
                              className="text-xs text-stone-400 line-through"
                              title={row.seasonal_uplift_reasons.join(", ")}
                            >
                              +
                              {Math.round(
                                (row.seasonal_uplift_multiplier - 1) * 100,
                              )}
                              % seasonal (off)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        {formatNumber(
                          row.forecast_daily_demand * DAYS_PER_MONTH,
                          0,
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {row.days_until_stockout ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.projected_stockout_date ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.earliest_incoming_batch_date ? (
                          <div className="flex flex-col gap-0.5">
                            <span>{row.earliest_incoming_batch_date}</span>
                            {row.has_stockout_gap && (
                              <Badge
                                className="w-fit bg-red-100 text-red-800"
                                title={`Stock runs out ${row.projected_stockout_date} but the next batch only arrives ${row.earliest_incoming_batch_date} — projected out of stock${
                                  stockoutGapDays != null
                                    ? ` for ~${stockoutGapDays} day${
                                        stockoutGapDays === 1 ? "" : "s"
                                      }`
                                    : ""
                                }.`}
                              >
                                OOS gap
                                {stockoutGapDays != null
                                  ? ` ~${stockoutGapDays}d`
                                  : ""}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className="py-2 pr-4"
                        title={
                          row.incoming_batch_arrival_date
                            ? `Latest batch arrives ${row.incoming_batch_arrival_date}; depletes after current stock is consumed`
                            : row.on_order_qty > 0
                              ? "Set PO expected date to project batch stockout"
                              : undefined
                        }
                      >
                        {row.incoming_batch_stockout_date ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {formatNumber(row.reorder_point)}
                      </td>
                      <td className="py-2 pr-4 font-medium text-emerald-800">
                        {formatNumber(row.recommended_restock_qty)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge className={CONFIDENCE_BADGE[row.confidence]}>
                          {row.confidence}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {row.needs_reorder && !row.covered_by_po && (
                          <Link
                            href={`/dashboard/procurement?sku=${encodeURIComponent(
                              row.sku_code,
                            )}&qty=${row.recommended_restock_qty}`}
                          >
                            <Button size="sm" variant="outline">
                              Create PO
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                    {isExpanded &&
                      packagingLinks.map((pkg) => (
                        <tr
                          key={`${row.sku_code}-${pkg.packaging_sku_code}`}
                          className="border-b border-stone-100 bg-stone-50/80"
                        >
                          <td className="py-1.5 pr-4" />
                          <td className="py-1.5 pr-4 pl-6 text-xs text-stone-600">
                            <span className="font-medium text-stone-500">
                              Packaging ·{" "}
                            </span>
                            <span className="font-mono">
                              {pkg.packaging_sku_code}
                            </span>
                            {pkg.packaging_name ? (
                              <span className="text-stone-500">
                                {" "}
                                · {pkg.packaging_name}
                              </span>
                            ) : null}
                            <span className="text-stone-400">
                              {" "}
                              · {formatNumber(pkg.qty_per_unit)}/unit
                            </span>
                          </td>
                          <td className="py-1.5 pr-4" colSpan={3} />
                          <td className="py-1.5 pr-4 tabular-nums">
                            {formatNumber(pkg.qty_on_hand)}
                          </td>
                          <td className="py-1.5 pr-4 tabular-nums text-sky-700">
                            {pkg.on_order_qty > 0
                              ? formatNumber(pkg.on_order_qty)
                              : "—"}
                          </td>
                          <td className="py-1.5 pr-4" colSpan={7} />
                          <td
                            className="py-1.5 pr-4 font-medium tabular-nums text-emerald-800"
                            title={
                              pkg.need_from_product > 0
                                ? `${formatNumber(pkg.need_from_product)} units needed from this SKU's restock batch`
                                : pkg.recommended_po_qty > 0
                                  ? "Net packaging PO qty across all linked finished goods"
                                  : undefined
                            }
                          >
                            {pkg.recommended_po_qty > 0
                              ? formatNumber(pkg.recommended_po_qty)
                              : pkg.need_from_product > 0
                                ? formatNumber(pkg.need_from_product)
                                : "—"}
                          </td>
                          <td className="py-1.5 pr-4" colSpan={2} />
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-20">
        <CardHeader>
          <CardTitle>Upcoming NPD stock</CardTitle>
          <CardDescription>
            SKUs with no sales yet that either hold stock in Gudang Finished
            Goods, Gudang Inventory, or Gudang Inventory Offline, or have an open
            purchase order (stock ordered ahead of launch). These are excluded
            from the demand forecast above. Shows on-hand stock and any incoming
            PO batches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : npdSkus.length === 0 ? (
            <p className="text-sm text-stone-500">
              No upcoming NPD stock detected. SKUs appear here once stock arrives
              but before they record any sales.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Franchise</th>
                    <th className="px-3 py-2 text-right">On hand</th>
                    <th className="px-3 py-2">Stock as of</th>
                    <th className="px-3 py-2 text-right">Incoming qty</th>
                    <th className="px-3 py-2">Next batch in</th>
                    <th className="px-3 py-2 text-right">Open batches</th>
                  </tr>
                </thead>
                <tbody>
                  {npdSkus.map((row) => (
                    <tr
                      key={row.sku_code}
                      className="border-b border-stone-100 last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">{row.sku_code}</td>
                      <td className="px-3 py-2">{row.sku_name ?? "—"}</td>
                      <td className="px-3 py-2">{row.franchise_name ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {formatNumber(row.qty_on_hand)}
                      </td>
                      <td className="px-3 py-2">{row.stock_as_of ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-sky-700">
                        {row.incoming_qty > 0
                          ? formatNumber(row.incoming_qty)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.earliest_incoming_batch_date ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.open_batch_count > 0 ? row.open_batch_count : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}
