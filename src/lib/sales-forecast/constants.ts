/** Indonesian PPN. VAT-inclusive net / 1.11 = post-tax net. */
export const VAT_DIVISOR = 1.11;

/** Jubelio SHOPEE Nett Sales ≈ seller post-tax ÷ 1.11 — undo that strip. */
export const SHOPEE_CHANNEL_NAME = "SHOPEE";

/**
 * Jubelio channels that store TikTok/Tokopedia Nett Sales as pre-tax
 * (SKU Subtotal Before Discount − Seller Discount). Divide by 1.11 once.
 */
export const PRE_TAX_WMS_CHANNEL_NAMES = [
  "Shop | Tokopedia",
  "TOKOPEDIA",
] as const;

export function isShopeeChannel(name: string | null | undefined): boolean {
  return (name ?? "").trim().toUpperCase() === SHOPEE_CHANNEL_NAME;
}

export function isPreTaxWmsChannel(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return (PRE_TAX_WMS_CHANNEL_NAMES as readonly string[]).includes(n);
}

export type SopChannelGroup = "online" | "offline";

export const SOP_GROUPS: SopChannelGroup[] = ["online", "offline"];

/**
 * Offline sell-out usually lands 20–25 days after month end, so L3M/L6M skip
 * the latest completed month (e.g. in September, August is excluded).
 */
export const OFFLINE_SALES_LAG_MONTHS = 1;

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const FORECAST_CSV_HEADERS = ["month", "sku", "disc", "qty"] as const;
