import {
  addDays,
  addMonths,
  addWeeks,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { FranchiseGrowthPoint, TimeGrain } from "@/types/database";
import { pctChange } from "@/lib/utils";

interface DailyRow {
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
        qty_mom_pct: prevMom
          ? pctChange(current.total_qty, prevMom.total_qty)
          : null,
        sales_mom_pct: prevMom
          ? pctChange(current.total_net_sales, prevMom.total_net_sales)
          : null,
        qty_yoy_pct: prevYoy
          ? pctChange(current.total_qty, prevYoy.total_qty)
          : null,
        sales_yoy_pct: prevYoy
          ? pctChange(current.total_net_sales, prevYoy.total_net_sales)
          : null,
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
    }
  >();

  for (const point of points) {
    const key = `${point.period}|${point.franchise_id}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.total_qty += point.total_qty;
      existing.total_net_sales += point.total_net_sales;
    } else {
      bucket.set(key, {
        period: point.period,
        franchise_id: point.franchise_id,
        franchise_name: point.franchise_name,
        total_qty: point.total_qty,
        total_net_sales: point.total_net_sales,
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

      return {
        period: current.period,
        franchise_id: current.franchise_id,
        franchise_name: current.franchise_name,
        channel_id: "",
        channel_name: "All channels",
        total_qty: current.total_qty,
        total_net_sales: current.total_net_sales,
        qty_mom_pct: prevMom
          ? pctChange(current.total_qty, prevMom.total_qty)
          : null,
        sales_mom_pct: prevMom
          ? pctChange(current.total_net_sales, prevMom.total_net_sales)
          : null,
        qty_yoy_pct: prevYoy
          ? pctChange(current.total_qty, prevYoy.total_qty)
          : null,
        sales_yoy_pct: prevYoy
          ? pctChange(current.total_net_sales, prevYoy.total_net_sales)
          : null,
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
): GrowthSummaryMetrics {
  if (points.length === 0) return EMPTY_METRICS;

  const periodTotals = new Map<string, { sales: number; qty: number }>();
  for (const p of points) {
    const t = periodTotals.get(p.period) ?? { sales: 0, qty: 0 };
    t.sales += p.total_net_sales;
    t.qty += p.total_qty;
    periodTotals.set(p.period, t);
  }

  const latestPeriod = [...periodTotals.keys()].sort().pop() ?? null;
  if (!latestPeriod) return EMPTY_METRICS;

  const prevPeriod = shiftPeriod(latestPeriod, grain, -1);
  const yoyPeriod = shiftPeriod(latestPeriod, grain, yoyDeltaFor(grain));

  const cur = periodTotals.get(latestPeriod) ?? { sales: 0, qty: 0 };
  const prev = periodTotals.get(prevPeriod) ?? null;
  const yoy = periodTotals.get(yoyPeriod) ?? null;

  const arpu = cur.qty > 0 ? cur.sales / cur.qty : null;
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
    salesMomPct: prev ? pctChange(cur.sales, prev.sales) : null,
    qtyMomPct: prev ? pctChange(cur.qty, prev.qty) : null,
    salesYoyPct: yoy ? pctChange(cur.sales, yoy.sales) : null,
    qtyYoyPct: yoy ? pctChange(cur.qty, yoy.qty) : null,
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
      };
    })
    .sort((a, b) => a.franchise_name.localeCompare(b.franchise_name));
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
