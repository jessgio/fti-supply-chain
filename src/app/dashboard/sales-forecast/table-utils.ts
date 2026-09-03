import { cn } from "@/lib/utils";
import type { SopSkuRow } from "@/types/database";

/** Sticky left offsets: identity + stock + L3M qty + L6M qty. */
export const FREEZE = {
  id: "left-0 min-w-[24rem] w-[24rem] px-3",
  stock: "left-[24rem] min-w-[5.75rem] w-[5.75rem] px-3 tabular-nums",
  l3m: "left-[29.75rem] min-w-[6.25rem] w-[6.25rem] px-3 tabular-nums",
  l6m: "left-[36rem] min-w-[6.25rem] w-[6.25rem] px-3 tabular-nums",
} as const;

export const FREEZE_EDGE = "shadow-[4px_0_8px_-4px_rgba(28,25,23,0.18)]";

export type ForecastSortKey =
  | "sku_code"
  | "franchise_name"
  | "current_stock"
  | "l3m_qty"
  | "shortfall_qty"
  | "plan_qty"
  | "plan_pct"
  | "l3m_qty_delta"
  | "l3m_net_delta";

export function freezeHead(col: string): string {
  return cn(
    "sticky top-0 z-30 bg-stone-50 py-2.5 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
    col,
  );
}

export function freezeBody(col: string, bg: string): string {
  return cn("sticky z-20 py-2.5", col, bg);
}

export function hasMissingRsp(row: Pick<SopSkuRow, "retail_price">): boolean {
  return row.retail_price == null || row.retail_price <= 0;
}

export function rspForMonth(
  row: Pick<SopSkuRow, "retail_price" | "rsp_by_month">,
  month: number,
): number | null {
  const byMonth = row.rsp_by_month?.[month];
  if (byMonth !== undefined) return byMonth;
  return row.retail_price;
}

/** Stock on hand below 3× L3M monthly avg (established SKUs only). */
export function hasLowL3mCover(
  row: Pick<SopSkuRow, "is_npd" | "l3m_qty" | "current_stock">,
): boolean {
  if (row.is_npd) return false;
  if (!Number.isFinite(row.l3m_qty) || row.l3m_qty <= 0) return false;
  return row.current_stock < 3 * row.l3m_qty;
}

/**
 * Row background priority: focus → no RSP → low L3M cover → year shortfall → zebra.
 */
export function rowStripeBg(
  index: number,
  opts?: {
    highlight?: boolean;
    missingRsp?: boolean;
    lowCover?: boolean;
    warn?: boolean;
  },
): { row: string; freeze: string } {
  if (opts?.highlight) {
    return { row: "bg-emerald-50", freeze: "bg-emerald-50" };
  }
  if (opts?.missingRsp) {
    return { row: "bg-rose-100/90", freeze: "bg-rose-100" };
  }
  if (opts?.lowCover) {
    return { row: "bg-sky-100/90", freeze: "bg-sky-100" };
  }
  if (opts?.warn) {
    return { row: "bg-amber-50/80", freeze: "bg-amber-50" };
  }
  if (index % 2 === 1) {
    return { row: "bg-stone-100", freeze: "bg-stone-100" };
  }
  return { row: "bg-white", freeze: "bg-white" };
}

export function draftKey(skuId: string, month: number): string {
  return `${skuId}:${month}`;
}

/** Blank so the qty/disc placeholders stay visible when the plan is zero. */
export function planDraftValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  return String(value);
}

export function isPlanMonth(
  month: number,
  currentMonth: number,
  readOnly: boolean,
): boolean {
  if (readOnly) return false;
  return month >= currentMonth;
}

/** True when `year`/`month` is the real calendar month happening today. */
export function isCurrentCalendarMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

/** Calendar month for the live Plan / % / L3M-delta columns, or null if `year` is not this year. */
export function calendarActiveMonth(
  year: number,
  now: Date = new Date(),
): number | null {
  if (year !== now.getFullYear()) return null;
  const month = now.getMonth() + 1;
  return month >= 1 && month <= 12 ? month : null;
}
