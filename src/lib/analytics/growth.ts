import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  format,
  getDaysInMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type {
  FranchiseGrowthPoint,
  PeriodCoverage,
  TimeGrain,
} from "@/types/database";
import { pctChange } from "@/lib/utils";

export interface DailyRow {
  sale_date: string;
  channel_id: string;
  channel_name: string;
  franchise_id: string;
  franchise_name: string;
  total_qty: number;
  total_net_sales: number;
}

function periodKey(date: string, grain: TimeGrain): string {
  const d = parseISO(date);
  switch (grain) {
    case "day":
      return format(startOfDay(d), "yyyy-MM-dd");
    case "week":
      return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    case "month":
      return format(startOfMonth(d), "yyyy-MM");
    case "year":
      return format(startOfYear(d), "yyyy");
  }
}

function shiftPeriod(period: string, grain: TimeGrain, delta: number): string {
  if (grain === "month") {
    const [year, month] = period.split("-").map(Number);
    const d = new Date(year, month - 1, 1);
    return format(addMonths(d, delta), "yyyy-MM");
  }
  if (grain === "year") {
    return String(Number(period) + delta);
  }
  const d = parseISO(period);
  if (grain === "week") return format(addWeeks(d, delta), "yyyy-MM-dd");
  if (grain === "day") return format(addDays(d, delta), "yyyy-MM-dd");
  return period;
}

export function effectiveNetSales(point: FranchiseGrowthPoint): number {
  return point.projected_net_sales ?? point.total_net_sales;
}

export function effectiveQty(point: FranchiseGrowthPoint): number {
  return point.projected_qty ?? point.total_qty;
}

/** Inclusive calendar-day bounds for fetching daily rows in a period. */
export function periodToDateBounds(
  period: string,
  grain: TimeGrain,
): { from: string; to: string; daysInPeriod: number } {
  if (grain === "month") {
    const [year, month] = period.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(endOfMonth(start), "yyyy-MM-dd"),
      daysInPeriod: getDaysInMonth(start),
    };
  }
  if (grain === "week") {
    const start = parseISO(period);
    const end = addDays(start, 6);
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      daysInPeriod: 7,
    };
  }
  return { from: period, to: period, daysInPeriod: 1 };
}

function rowInPeriod(
  saleDate: string,
  period: string,
  grain: TimeGrain,
): boolean {
  return periodKey(saleDate, grain) === period;
}

/**
 * Derive how much of a period is covered by uploaded sales, using the latest
 * sale date in daily rows (not today's calendar date).
 */
export function computePeriodCoverage(
  dailyRows: DailyRow[],
  period: string,
  grain: TimeGrain,
): PeriodCoverage {
  const { from, to, daysInPeriod } = periodToDateBounds(period, grain);
  let lastSaleDate: string | null = null;

  for (const row of dailyRows) {
    if (!rowInPeriod(row.sale_date, period, grain)) continue;
    if (!lastSaleDate || row.sale_date > lastSaleDate) {
      lastSaleDate = row.sale_date;
    }
  }

  if (!lastSaleDate) {
    return {
      period,
      isPartial: false,
      lastSaleDate: null,
      daysElapsed: daysInPeriod,
      daysInPeriod,
    };
  }

  const daysElapsed =
    differenceInCalendarDays(parseISO(lastSaleDate), parseISO(from)) + 1;
  const isPartial = lastSaleDate < to && daysElapsed < daysInPeriod;

  return {
    period,
    isPartial,
    lastSaleDate,
    daysElapsed,
    daysInPeriod,
  };
}

function runRateScale(coverage: PeriodCoverage): number {
  if (!coverage.isPartial || coverage.daysElapsed <= 0) return 1;
  return coverage.daysInPeriod / coverage.daysElapsed;
}

function recomputeComparisonsForPoint(
  current: FranchiseGrowthPoint,
  lookup: Map<string, FranchiseGrowthPoint>,
  grain: TimeGrain,
  compareSales: number,
  compareQty: number,
): Pick<
  FranchiseGrowthPoint,
  | "qty_mom_pct"
  | "sales_mom_pct"
  | "qty_yoy_pct"
  | "sales_yoy_pct"
  | "qty_mom_eom_pct"
  | "sales_mom_eom_pct"
  | "qty_yoy_eom_pct"
  | "sales_yoy_eom_pct"
> {
  const momKey = `${shiftPeriod(current.period, grain, -1)}|${current.franchise_id}|${current.channel_id}`;
  const yoyKey = `${shiftPeriod(current.period, grain, yoyDeltaFor(grain))}|${current.franchise_id}|${current.channel_id}`;
  const prevMom = lookup.get(momKey);
  const prevYoy = lookup.get(yoyKey);

  const salesMomEom = prevMom
    ? pctChange(compareSales, prevMom.total_net_sales)
    : null;
  const qtyMomEom = prevMom ? pctChange(compareQty, prevMom.total_qty) : null;
  const salesYoyEom = prevYoy
    ? pctChange(compareSales, prevYoy.total_net_sales)
    : null;
  const qtyYoyEom = prevYoy ? pctChange(compareQty, prevYoy.total_qty) : null;

  return {
    qty_mom_eom_pct: qtyMomEom,
    sales_mom_eom_pct: salesMomEom,
    qty_yoy_eom_pct: qtyYoyEom,
    sales_yoy_eom_pct: salesYoyEom,
    qty_mom_pct: qtyMomEom,
    sales_mom_pct: salesMomEom,
    qty_yoy_pct: qtyYoyEom,
    sales_yoy_pct: salesYoyEom,
  };
}

function buildGrowthPctFields(
  currentQty: number,
  currentSales: number,
  projectedQty: number,
  projectedSales: number,
  prevMom: { total_qty: number; total_net_sales: number } | undefined,
  prevYoy: { total_qty: number; total_net_sales: number } | undefined,
): Pick<
  FranchiseGrowthPoint,
  | "qty_mom_pct"
  | "sales_mom_pct"
  | "qty_yoy_pct"
  | "sales_yoy_pct"
  | "qty_mom_mtd_pct"
  | "sales_mom_mtd_pct"
  | "qty_yoy_mtd_pct"
  | "sales_yoy_mtd_pct"
  | "qty_mom_eom_pct"
  | "sales_mom_eom_pct"
  | "qty_yoy_eom_pct"
  | "sales_yoy_eom_pct"
> {
  const qtyMomMtd = prevMom ? pctChange(currentQty, prevMom.total_qty) : null;
  const salesMomMtd = prevMom
    ? pctChange(currentSales, prevMom.total_net_sales)
    : null;
  const qtyYoyMtd = prevYoy ? pctChange(currentQty, prevYoy.total_qty) : null;
  const salesYoyMtd = prevYoy
    ? pctChange(currentSales, prevYoy.total_net_sales)
    : null;

  const qtyMomEom = prevMom ? pctChange(projectedQty, prevMom.total_qty) : null;
  const salesMomEom = prevMom
    ? pctChange(projectedSales, prevMom.total_net_sales)
    : null;
  const qtyYoyEom = prevYoy ? pctChange(projectedQty, prevYoy.total_qty) : null;
  const salesYoyEom = prevYoy
    ? pctChange(projectedSales, prevYoy.total_net_sales)
    : null;

  return {
    qty_mom_mtd_pct: qtyMomMtd,
    sales_mom_mtd_pct: salesMomMtd,
    qty_yoy_mtd_pct: qtyYoyMtd,
    sales_yoy_mtd_pct: salesYoyMtd,
    qty_mom_eom_pct: qtyMomEom,
    sales_mom_eom_pct: salesMomEom,
    qty_yoy_eom_pct: qtyYoyEom,
    sales_yoy_eom_pct: salesYoyEom,
    qty_mom_pct: qtyMomEom,
    sales_mom_pct: salesMomEom,
    qty_yoy_pct: qtyYoyEom,
    sales_yoy_pct: salesYoyEom,
  };
}

/** Apply run-rate projections and recompute MoM/YoY for an in-progress period. */
export function applyRunRateGrowth(
  points: FranchiseGrowthPoint[],
  coverage: PeriodCoverage,
  grain: TimeGrain,
): void {
  if (!coverage.isPartial || coverage.daysElapsed <= 0) return;

  const scale = runRateScale(coverage);
  const lookup = new Map(
    points.map((p) => [
      `${p.period}|${p.franchise_id}|${p.channel_id}`,
      p,
    ]),
  );

  for (const point of points) {
    if (point.period !== coverage.period) continue;

    point.is_partial = true;
    point.projected_net_sales = point.total_net_sales * scale;
    point.projected_qty = point.total_qty * scale;

    Object.assign(
      point,
      recomputeComparisonsForPoint(
        point,
        lookup,
        grain,
        point.projected_net_sales,
        point.projected_qty,
      ),
    );
  }
}

export function buildGrowthPoints(
  rows: DailyRow[],
  grain: TimeGrain,
  dailyRowsForLatest: DailyRow[] | null = null,
): { points: FranchiseGrowthPoint[]; coverage: PeriodCoverage | null } {
  const points = aggregateFranchiseGrowth(rows, grain);

  if (grain !== "month" && grain !== "week") {
    return { points, coverage: null };
  }

  const latestPeriod = getLatestPeriod(points);
  if (!latestPeriod || !dailyRowsForLatest?.length) {
    return { points, coverage: null };
  }

  const coverage = computePeriodCoverage(
    dailyRowsForLatest,
    latestPeriod,
    grain,
  );
  applyRunRateGrowth(points, coverage, grain);
  return { points, coverage: coverage.isPartial ? coverage : null };
}

export function formatPeriodCoverageHint(coverage: PeriodCoverage): string {
  const through = coverage.lastSaleDate
    ? format(parseISO(coverage.lastSaleDate), "d MMM")
    : "—";
  return `${coverage.daysElapsed} of ${coverage.daysInPeriod} days · through ${through}`;
}

export function aggregateFranchiseGrowth(
  rows: DailyRow[],
  grain: TimeGrain,
): FranchiseGrowthPoint[] {
  const bucket = new Map<
    string,
    {
      period: string;
      franchise_id: string;
      franchise_name: string;
      channel_id: string;
      channel_name: string;
      total_qty: number;
      total_net_sales: number;
    }
  >();

  for (const row of rows) {
    const period = periodKey(row.sale_date, grain);
    const key = `${period}|${row.franchise_id}|${row.channel_id}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.total_qty += row.total_qty;
      existing.total_net_sales += row.total_net_sales;
    } else {
      bucket.set(key, {
        period,
        franchise_id: row.franchise_id,
        franchise_name: row.franchise_name,
        channel_id: row.channel_id,
        channel_name: row.channel_name,
        total_qty: row.total_qty,
        total_net_sales: row.total_net_sales,
      });
    }
  }

  const lookup = new Map(
    [...bucket.values()].map((v) => [
      `${v.period}|${v.franchise_id}|${v.channel_id}`,
      v,
    ]),
  );

  return [...bucket.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((current) => {
      const momKey = `${shiftPeriod(current.period, grain, -1)}|${current.franchise_id}|${current.channel_id}`;
      const yoyDelta =
        grain === "year"
          ? -1
          : grain === "month"
            ? -12
            : grain === "week"
              ? -52
              : -365;
      const yoyKey = `${shiftPeriod(current.period, grain, yoyDelta)}|${current.franchise_id}|${current.channel_id}`;
      const prevMom = lookup.get(momKey);
      const prevYoy = lookup.get(yoyKey);

      return {
        ...current,
        ...buildGrowthPctFields(
          current.total_qty,
          current.total_net_sales,
          current.total_qty,
          current.total_net_sales,
          prevMom,
          prevYoy,
        ),
      };
    });
}

/** Sum franchise totals across channels (for all-channels dashboard view). */
export function sumGrowthAcrossChannels(
  points: FranchiseGrowthPoint[],
  grain: TimeGrain,
): FranchiseGrowthPoint[] {
  const bucket = new Map<
    string,
    {
      period: string;
      franchise_id: string;
      franchise_name: string;
      total_qty: number;
      total_net_sales: number;
      projected_qty: number | null;
      projected_net_sales: number | null;
      is_partial: boolean;
    }
  >();

  for (const point of points) {
    const key = `${point.period}|${point.franchise_id}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.total_qty += point.total_qty;
      existing.total_net_sales += point.total_net_sales;
      if (point.projected_qty != null) {
        existing.projected_qty =
          (existing.projected_qty ?? 0) + point.projected_qty;
      }
      if (point.projected_net_sales != null) {
        existing.projected_net_sales =
          (existing.projected_net_sales ?? 0) + point.projected_net_sales;
      }
      existing.is_partial = existing.is_partial || Boolean(point.is_partial);
    } else {
      bucket.set(key, {
        period: point.period,
        franchise_id: point.franchise_id,
        franchise_name: point.franchise_name,
        total_qty: point.total_qty,
        total_net_sales: point.total_net_sales,
        projected_qty: point.projected_qty ?? null,
        projected_net_sales: point.projected_net_sales ?? null,
        is_partial: Boolean(point.is_partial),
      });
    }
  }

  const lookup = new Map(
    [...bucket.values()].map((v) => [`${v.period}|${v.franchise_id}`, v]),
  );

  return [...bucket.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((current) => {
      const momKey = `${shiftPeriod(current.period, grain, -1)}|${current.franchise_id}`;
      const yoyDelta =
        grain === "year"
          ? -1
          : grain === "month"
            ? -12
            : grain === "week"
              ? -52
              : -365;
      const yoyKey = `${shiftPeriod(current.period, grain, yoyDelta)}|${current.franchise_id}`;
      const prevMom = lookup.get(momKey);
      const prevYoy = lookup.get(yoyKey);
      const projectedQty = current.projected_qty ?? current.total_qty;
      const projectedSales =
        current.projected_net_sales ?? current.total_net_sales;

      return {
        period: current.period,
        franchise_id: current.franchise_id,
        franchise_name: current.franchise_name,
        channel_id: "",
        channel_name: "All channels",
        total_qty: current.total_qty,
        total_net_sales: current.total_net_sales,
        projected_qty: current.projected_qty,
        projected_net_sales: current.projected_net_sales,
        is_partial: current.is_partial,
        ...buildGrowthPctFields(
          current.total_qty,
          current.total_net_sales,
          projectedQty,
          projectedSales,
          prevMom,
          prevYoy,
        ),
      };
    });
}

export interface GrowthMover {
  franchise_name: string;
  pct: number | null;
  value: number;
}

export interface GrowthSummaryMetrics {
  latestPeriod: string | null;
  prevPeriod: string | null;
  totalSales: number;
  totalQty: number;
  projectedSales: number | null;
  projectedQty: number | null;
  isPartialPeriod: boolean;
  periodCoverageHint: string | null;
  salesMomPct: number | null;
  qtyMomPct: number | null;
  salesYoyPct: number | null;
  qtyYoyPct: number | null;
  arpu: number | null;
  arpuMomPct: number | null;
  topGrower: GrowthMover | null;
  topDecliner: GrowthMover | null;
  growing: number;
  declining: number;
  flat: number;
}

const EMPTY_METRICS: GrowthSummaryMetrics = {
  latestPeriod: null,
  prevPeriod: null,
  totalSales: 0,
  totalQty: 0,
  projectedSales: null,
  projectedQty: null,
  isPartialPeriod: false,
  periodCoverageHint: null,
  salesMomPct: null,
  qtyMomPct: null,
  salesYoyPct: null,
  qtyYoyPct: null,
  arpu: null,
  arpuMomPct: null,
  topGrower: null,
  topDecliner: null,
  growing: 0,
  declining: 0,
  flat: 0,
};

function yoyDeltaFor(grain: TimeGrain): number {
  switch (grain) {
    case "year":
      return -1;
    case "month":
      return -12;
    case "week":
      return -52;
    default:
      return -365;
  }
}

/**
 * Derive headline KPIs and franchise movers for the latest period from an
 * already-aggregated set of growth points. Runs client-side; no extra fetch.
 */
export function computeGrowthMetrics(
  points: FranchiseGrowthPoint[],
  grain: TimeGrain,
  metric: "sales" | "qty",
  coverage: PeriodCoverage | null = null,
): GrowthSummaryMetrics {
  if (points.length === 0) return EMPTY_METRICS;

  const periodTotals = new Map<
    string,
    { sales: number; qty: number; projectedSales: number; projectedQty: number }
  >();
  for (const p of points) {
    const t = periodTotals.get(p.period) ?? {
      sales: 0,
      qty: 0,
      projectedSales: 0,
      projectedQty: 0,
    };
    t.sales += p.total_net_sales;
    t.qty += p.total_qty;
    t.projectedSales += effectiveNetSales(p);
    t.projectedQty += effectiveQty(p);
    periodTotals.set(p.period, t);
  }

  const latestPeriod = [...periodTotals.keys()].sort().pop() ?? null;
  if (!latestPeriod) return EMPTY_METRICS;

  const prevPeriod = shiftPeriod(latestPeriod, grain, -1);
  const yoyPeriod = shiftPeriod(latestPeriod, grain, yoyDeltaFor(grain));

  const cur = periodTotals.get(latestPeriod) ?? {
    sales: 0,
    qty: 0,
    projectedSales: 0,
    projectedQty: 0,
  };
  const prev = periodTotals.get(prevPeriod) ?? null;
  const yoy = periodTotals.get(yoyPeriod) ?? null;

  const isPartialPeriod = Boolean(
    coverage?.isPartial && coverage.period === latestPeriod,
  );
  const compareSales = isPartialPeriod ? cur.projectedSales : cur.sales;
  const compareQty = isPartialPeriod ? cur.projectedQty : cur.qty;

  const arpu = cur.qty > 0 ? compareSales / compareQty : null;
  const prevArpu = prev && prev.qty > 0 ? prev.sales / prev.qty : null;

  const byFranchise = new Map<string, GrowthMover>();
  for (const p of points) {
    if (p.period !== latestPeriod) continue;
    const value = metric === "sales" ? p.total_net_sales : p.total_qty;
    const pct = metric === "sales" ? p.sales_mom_pct : p.qty_mom_pct;
    const existing = byFranchise.get(p.franchise_id);
    if (existing) {
      existing.value += value;
    } else {
      byFranchise.set(p.franchise_id, {
        franchise_name: p.franchise_name,
        pct,
        value,
      });
    }
  }

  let topGrower: GrowthMover | null = null;
  let topDecliner: GrowthMover | null = null;
  let growing = 0;
  let declining = 0;
  let flat = 0;
  for (const mover of byFranchise.values()) {
    if (mover.pct === null) continue;
    if (mover.pct > 0) growing++;
    else if (mover.pct < 0) declining++;
    else flat++;
    if (!topGrower || mover.pct > (topGrower.pct ?? -Infinity)) topGrower = mover;
    if (!topDecliner || mover.pct < (topDecliner.pct ?? Infinity)) topDecliner = mover;
  }

  return {
    latestPeriod,
    prevPeriod: prev ? prevPeriod : null,
    totalSales: cur.sales,
    totalQty: cur.qty,
    projectedSales: isPartialPeriod ? cur.projectedSales : null,
    projectedQty: isPartialPeriod ? cur.projectedQty : null,
    isPartialPeriod,
    periodCoverageHint:
      isPartialPeriod && coverage ? formatPeriodCoverageHint(coverage) : null,
    salesMomPct: prev ? pctChange(compareSales, prev.sales) : null,
    qtyMomPct: prev ? pctChange(compareQty, prev.qty) : null,
    salesYoyPct: yoy ? pctChange(compareSales, yoy.sales) : null,
    qtyYoyPct: yoy ? pctChange(compareQty, yoy.qty) : null,
    arpu,
    arpuMomPct:
      arpu !== null && prevArpu !== null ? pctChange(arpu, prevArpu) : null,
    topGrower,
    topDecliner,
    growing,
    declining,
    flat,
  };
}

export function getLatestPeriod(points: FranchiseGrowthPoint[]): string | null {
  if (points.length === 0) return null;
  return points.reduce(
    (max, p) => (p.period > max ? p.period : max),
    points[0]!.period,
  );
}

/** Rows for the latest period, optionally including mapped franchises with no sales. */
export function latestPeriodGrowthRows(
  points: FranchiseGrowthPoint[],
  options?: {
    franchises?: { id: string; name: string }[];
    includeZeroSales?: boolean;
  },
): FranchiseGrowthPoint[] {
  const latestPeriod = getLatestPeriod(points);
  if (!latestPeriod) return [];

  const rows = points.filter((p) => p.period === latestPeriod);

  if (!options?.includeZeroSales || !options.franchises?.length) {
    return rows.sort((a, b) =>
      a.franchise_name.localeCompare(b.franchise_name),
    );
  }

  const byId = new Map(rows.map((r) => [r.franchise_id, r]));
  const channelId = rows[0]?.channel_id ?? "";
  const channelName = rows[0]?.channel_name ?? "All channels";

  return options.franchises
    .map((franchise) => {
      const existing = byId.get(franchise.id);
      if (existing) return existing;
      return {
        period: latestPeriod,
        franchise_id: franchise.id,
        franchise_name: franchise.name,
        channel_id: channelId,
        channel_name: channelName,
        total_qty: 0,
        total_net_sales: 0,
        qty_mom_pct: null,
        sales_mom_pct: null,
        qty_yoy_pct: null,
        sales_yoy_pct: null,
        qty_mom_mtd_pct: null,
        sales_mom_mtd_pct: null,
        qty_yoy_mtd_pct: null,
        sales_yoy_mtd_pct: null,
        qty_mom_eom_pct: null,
        sales_mom_eom_pct: null,
        qty_yoy_eom_pct: null,
        sales_yoy_eom_pct: null,
      };
    })
    .sort((a, b) => a.franchise_name.localeCompare(b.franchise_name));
}

export type GrowthPctKind = "mom_mtd" | "mom_eom" | "yoy_mtd" | "yoy_eom";

export function growthPctForRow(
  row: FranchiseGrowthPoint,
  metric: "sales" | "qty",
  kind: GrowthPctKind,
): number | null {
  if (metric === "sales") {
    switch (kind) {
      case "mom_mtd":
        return row.sales_mom_mtd_pct ?? row.sales_mom_pct;
      case "mom_eom":
        return row.sales_mom_eom_pct ?? row.sales_mom_pct;
      case "yoy_mtd":
        return row.sales_yoy_mtd_pct ?? row.sales_yoy_pct;
      case "yoy_eom":
        return row.sales_yoy_eom_pct ?? row.sales_yoy_pct;
    }
  }
  switch (kind) {
    case "mom_mtd":
      return row.qty_mom_mtd_pct ?? row.qty_mom_pct;
    case "mom_eom":
      return row.qty_mom_eom_pct ?? row.qty_mom_pct;
    case "yoy_mtd":
      return row.qty_yoy_mtd_pct ?? row.qty_yoy_pct;
    case "yoy_eom":
      return row.qty_yoy_eom_pct ?? row.qty_yoy_pct;
  }
}

export function summarizeGrowth(points: FranchiseGrowthPoint[]) {
  const latestByFranchise = new Map<string, FranchiseGrowthPoint>();
  for (const point of points) {
    const existing = latestByFranchise.get(point.franchise_id);
    if (!existing || point.period > existing.period) {
      latestByFranchise.set(point.franchise_id, point);
    }
  }
  return [...latestByFranchise.values()].sort(
    (a, b) => b.total_net_sales - a.total_net_sales,
  );
}
