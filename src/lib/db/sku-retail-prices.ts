import type { SupabaseClient } from "@supabase/supabase-js";
import { MONTHS } from "@/lib/sales-forecast/constants";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export const RSP_BASE_EFFECTIVE_FROM = "2000-01-01";

export type SkuPriceHistoryRow = {
  sku_id: string;
  effective_from: string;
  retail_price: number;
};

export function startOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function currentMonthStartIso(now = new Date()): string {
  return startOfMonthIso(now.getFullYear(), now.getMonth() + 1);
}

/** Normalize YYYY-MM or YYYY-MM-DD to the first of that month. */
export function parseEffectiveFrom(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") {
    return currentMonthStartIso();
  }
  const trimmed = String(value).trim();
  const ym = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (ym) {
    const month = Number(ym[2]);
    if (month < 1 || month > 12) {
      throw new Error("effective_from month must be 1–12.");
    }
    return startOfMonthIso(Number(ym[1]), month);
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (ymd) {
    const month = Number(ymd[2]);
    if (month < 1 || month > 12) {
      throw new Error("effective_from month must be 1–12.");
    }
    return startOfMonthIso(Number(ymd[1]), month);
  }
  throw new Error("effective_from must be YYYY-MM or YYYY-MM-DD.");
}

export function priceAsOf(
  history: Array<{ effective_from: string; retail_price: number }>,
  onDate: string,
): number | null {
  let price: number | null = null;
  for (const row of history) {
    if (row.effective_from <= onDate) price = row.retail_price;
  }
  return price;
}

export function rspByMonthForYear(
  history: Array<{ effective_from: string; retail_price: number }>,
  year: number,
  fallback: number | null,
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const month of MONTHS) {
    out[month] =
      priceAsOf(history, startOfMonthIso(year, month)) ?? fallback;
  }
  return out;
}

export async function loadSkuRetailPriceHistory(
  supabase: SupabaseClient,
): Promise<Map<string, SkuPriceHistoryRow[]>> {
  const rows = await fetchAllRows<SkuPriceHistoryRow>(() =>
    supabase
      .from("sku_retail_prices")
      .select("sku_id, effective_from, retail_price")
      .order("effective_from", { ascending: true }),
  );
  const bySku = new Map<string, SkuPriceHistoryRow[]>();
  for (const row of rows) {
    const list = bySku.get(row.sku_id) ?? [];
    list.push({
      sku_id: row.sku_id,
      effective_from: String(row.effective_from).slice(0, 10),
      retail_price: Number(row.retail_price),
    });
    bySku.set(row.sku_id, list);
  }
  return bySku;
}

export async function setSkuRetailPrice(
  supabase: SupabaseClient,
  skuId: string,
  price: number | null,
  effectiveFrom?: string | null,
): Promise<void> {
  if (price == null || price === 0) {
    const { error } = await supabase
      .from("sku_retail_prices")
      .delete()
      .eq("sku_id", skuId);
    if (error) throw error;
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("RSP must be a number greater than 0.");
  }

  const { count, error: countError } = await supabase
    .from("sku_retail_prices")
    .select("id", { count: "exact", head: true })
    .eq("sku_id", skuId);
  if (countError) throw countError;

  const from =
    (count ?? 0) === 0
      ? RSP_BASE_EFFECTIVE_FROM
      : parseEffectiveFrom(effectiveFrom);

  const { error } = await supabase.from("sku_retail_prices").upsert(
    {
      sku_id: skuId,
      effective_from: from,
      retail_price: price,
    },
    { onConflict: "sku_id,effective_from" },
  );
  if (error) throw error;
}
