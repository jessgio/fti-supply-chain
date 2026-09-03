import type { ForecastCsvRow } from "@/lib/sales-forecast/csv";

export type ForecastPendingReason =
  | "missing"
  | "inactive"
  | "unclassified"
  | "packaging"
  | "extract";

export interface ForecastCatalogSku {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  is_extract: boolean;
  is_active: boolean;
  franchise_id: string | null;
  retail_price: number | null;
}

export interface ResolvedForecastLine {
  sku_id: string;
  month: number;
  projected_qty: number;
  avg_discount_pct: number;
}

export interface PendingForecastMonth {
  month: number;
  qty: number;
  disc: number;
}

export interface PendingForecastSku {
  sku_code: string;
  sku_id: string | null;
  reason: ForecastPendingReason;
  suggested_sku_code: string | null;
  name: string | null;
  retail_price: number | null;
  is_bundle: boolean;
  franchise_id: string | null;
  months: PendingForecastMonth[];
}

export function isForecastCatalogEligible(sku: ForecastCatalogSku): boolean {
  if (sku.is_packaging || sku.is_extract) return false;
  if (!sku.is_active) return false;
  if (!sku.is_bundle && !sku.franchise_id) return false;
  return true;
}

export function pendingReasonForSku(
  sku: ForecastCatalogSku | undefined,
): ForecastPendingReason {
  if (!sku) return "missing";
  if (sku.is_packaging) return "packaging";
  if (sku.is_extract) return "extract";
  if (!sku.is_bundle && !sku.franchise_id) return "unclassified";
  if (!sku.is_active) return "inactive";
  return "missing";
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function suggestSkuCode(
  skuCode: string,
  catalogCodes: Iterable<string>,
  maxDistance = 2,
): string | null {
  const needle = skuCode.toUpperCase();
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  let bestPrefix = -1;
  for (const raw of catalogCodes) {
    const candidate = raw.toUpperCase();
    if (candidate === needle) continue;
    const distance = levenshtein(needle, candidate, maxDistance);
    if (distance > maxDistance) continue;
    let prefix = 0;
    const n = Math.min(needle.length, candidate.length);
    while (prefix < n && needle[prefix] === candidate[prefix]) prefix += 1;
    if (
      distance < bestDistance ||
      (distance === bestDistance && prefix > bestPrefix)
    ) {
      best = raw;
      bestDistance = distance;
      bestPrefix = prefix;
    }
  }
  return best;
}

export function resolveForecastCsvSkus(
  rows: ForecastCsvRow[],
  catalog: ForecastCatalogSku[],
): {
  lines: ResolvedForecastLine[];
  pending: PendingForecastSku[];
  eligibleCodes: string[];
} {
  const byCode = new Map(
    catalog.map((sku) => [sku.sku_code.toUpperCase(), sku] as const),
  );
  const suggestable = catalog
    .filter(isForecastCatalogEligible)
    .map((sku) => sku.sku_code);

  const lastByKey = new Map<string, ResolvedForecastLine>();
  const eligibleCodes = new Set<string>();
  const pendingByCode = new Map<
    string,
    PendingForecastSku & { monthKeys: Map<number, PendingForecastMonth> }
  >();

  for (const row of rows) {
    const sku = byCode.get(row.skuCode.toUpperCase());
    if (sku && isForecastCatalogEligible(sku)) {
      eligibleCodes.add(sku.sku_code);
      lastByKey.set(`${sku.id}:${row.month}`, {
        sku_id: sku.id,
        month: row.month,
        projected_qty: row.qty,
        avg_discount_pct: row.discountPct,
      });
      continue;
    }

    const key = row.skuCode.toUpperCase();
    let pending = pendingByCode.get(key);
    if (!pending) {
      pending = {
        sku_code: sku?.sku_code ?? row.skuCode.trim(),
        sku_id: sku?.id ?? null,
        reason: pendingReasonForSku(sku),
        suggested_sku_code: suggestSkuCode(row.skuCode, suggestable),
        name: sku?.name ?? null,
        retail_price: sku?.retail_price ?? null,
        is_bundle: sku?.is_bundle ?? key.startsWith("BND-"),
        franchise_id: sku?.franchise_id ?? null,
        months: [],
        monthKeys: new Map(),
      };
      pendingByCode.set(key, pending);
    }
    pending.monthKeys.set(row.month, {
      month: row.month,
      qty: row.qty,
      disc: row.discountPct,
    });
  }

  const pending = [...pendingByCode.values()].map((entry) => {
    const months = [...entry.monthKeys.values()].sort(
      (a, b) => a.month - b.month,
    );
    return {
      sku_code: entry.sku_code,
      sku_id: entry.sku_id,
      reason: entry.reason,
      suggested_sku_code: entry.suggested_sku_code,
      name: entry.name,
      retail_price: entry.retail_price,
      is_bundle: entry.is_bundle,
      franchise_id: entry.franchise_id,
      months,
    };
  });

  return {
    lines: [...lastByKey.values()],
    pending,
    eligibleCodes: [...eligibleCodes],
  };
}
