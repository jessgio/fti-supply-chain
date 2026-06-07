import type { RestockRecommendation } from "@/types/database";
import { DAYS_PER_MONTH } from "@/lib/forecast/demand";

export const OVERSTOCK_MONTHS = 6;
export const OVERSTOCK_DAYS = OVERSTOCK_MONTHS * DAYS_PER_MONTH;

export type StockStatus =
  | "reorder"
  | "watch"
  | "on_order"
  | "overstock"
  | "healthy";

export function isOverstock(row: RestockRecommendation): boolean {
  return (
    row.current_stock > 0 &&
    row.forecast_daily_demand > 0 &&
    row.days_until_stockout !== null &&
    row.days_until_stockout > OVERSTOCK_DAYS
  );
}

export function stockStatusOf(row: RestockRecommendation): StockStatus {
  if (row.covered_by_po) return "on_order";
  if (
    row.days_until_stockout !== null &&
    row.days_until_stockout <= row.reorder_lead_days
  ) {
    return "reorder";
  }
  if (
    row.days_until_stockout !== null &&
    row.days_until_stockout <= row.reorder_lead_days * 1.5
  ) {
    return "watch";
  }
  if (isOverstock(row)) return "overstock";
  return "healthy";
}

export const STOCK_STATUS_BADGE: Record<
  StockStatus,
  { label: string; className: string }
> = {
  reorder: { label: "Reorder now", className: "bg-rose-100 text-rose-700" },
  watch: { label: "Watch", className: "bg-amber-100 text-amber-800" },
  on_order: { label: "On order", className: "bg-sky-100 text-sky-800" },
  overstock: { label: "Overstock", className: "bg-indigo-100 text-indigo-800" },
  healthy: { label: "Healthy", className: "bg-emerald-100 text-emerald-800" },
};

export const STOCK_STATUS_ORDER: Record<StockStatus, number> = {
  reorder: 0,
  watch: 1,
  on_order: 2,
  overstock: 3,
  healthy: 4,
};

export function monthsOfCover(row: RestockRecommendation): number | null {
  if (row.days_until_stockout === null) return null;
  return row.days_until_stockout / DAYS_PER_MONTH;
}
