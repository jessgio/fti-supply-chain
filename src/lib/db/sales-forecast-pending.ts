import type { SupabaseClient } from "@supabase/supabase-js";
import { createSku, updateSku } from "@/lib/db/skus";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import type { PendingForecastSku } from "@/lib/sales-forecast/resolve-csv-skus";
import { isForecastCatalogEligible } from "@/lib/sales-forecast/resolve-csv-skus";
import type { SopChannelGroup, SopPendingForecastSku } from "@/types/database";

function isSopGroup(value: string): value is SopChannelGroup {
  return value === "online" || value === "offline";
}

async function writeMonthPlans(
  supabase: SupabaseClient,
  input: {
    year: number;
    group: SopChannelGroup;
    lines: Array<{
      sku_id: string;
      month: number;
      projected_qty: number;
      avg_discount_pct: number;
    }>;
    userId: string | null;
  },
) {
  const { upsertSkuMonthPlans } = await import("@/lib/db/sales-forecast");
  await upsertSkuMonthPlans(supabase, input);
}

const PENDING_SELECT =
  "id, year, sop_group, sku_code, sku_id, reason, suggested_sku_code, name, retail_price, is_bundle, franchise_id, months";

type PendingRow = {
  id: string;
  year: number;
  sop_group: string;
  sku_code: string;
  sku_id: string | null;
  reason: SopPendingForecastSku["reason"];
  suggested_sku_code: string | null;
  name: string | null;
  retail_price: number | null;
  is_bundle: boolean;
  franchise_id: string | null;
  months: unknown;
};

function parseMonths(raw: unknown): SopPendingForecastSku["months"] {
  if (!Array.isArray(raw)) return [];
  const byMonth = new Map<number, SopPendingForecastSku["months"][number]>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const month = Number((entry as { month?: unknown }).month);
    const qty = Number((entry as { qty?: unknown }).qty);
    const disc = Number((entry as { disc?: unknown }).disc);
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    byMonth.set(month, {
      month,
      qty: Number.isFinite(qty) ? qty : 0,
      disc: Number.isFinite(disc) ? Math.min(100, Math.max(0, disc)) : 0,
    });
  }
  return [...byMonth.values()].sort((a, b) => a.month - b.month);
}

function mapPendingRow(
  row: PendingRow,
  franchiseNames: Map<string, string>,
): SopPendingForecastSku | null {
  if (!isSopGroup(row.sop_group)) return null;
  return {
    id: row.id,
    year: row.year,
    sop_group: row.sop_group,
    sku_code: row.sku_code,
    sku_id: row.sku_id,
    reason: row.reason,
    suggested_sku_code: row.suggested_sku_code,
    name: row.name,
    retail_price: row.retail_price == null ? null : Number(row.retail_price),
    is_bundle: Boolean(row.is_bundle),
    franchise_id: row.franchise_id,
    franchise_name: row.franchise_id
      ? (franchiseNames.get(row.franchise_id) ?? null)
      : null,
    months: parseMonths(row.months),
  };
}

async function franchiseNameMap(
  supabase: SupabaseClient,
  rows: PendingRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows.map((row) => row.franchise_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("product_franchises")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((row) => [row.id as string, String(row.name ?? "")]),
  );
}

export async function listForecastPendingSkus(
  supabase: SupabaseClient,
  year: number,
): Promise<SopPendingForecastSku[]> {
  const { data, error } = await supabase
    .from("sop_forecast_pending_skus")
    .select(PENDING_SELECT)
    .eq("year", year)
    .order("sku_code");
  if (error) throw error;
  const rows = (data ?? []) as PendingRow[];
  const franchiseNames = await franchiseNameMap(supabase, rows).catch(
    () => new Map<string, string>(),
  );
  return rows
    .map((row) => mapPendingRow(row, franchiseNames))
    .filter((row): row is SopPendingForecastSku => row != null);
}

export async function replaceForecastPendingSkus(
  supabase: SupabaseClient,
  input: {
    year: number;
    group: SopChannelGroup;
    uploadId: string | null;
    userId: string | null;
    pending: PendingForecastSku[];
    eligibleCodes: string[];
  },
): Promise<void> {
  const now = new Date().toISOString();
  if (input.pending.length > 0) {
    const rows = input.pending.map((sku) => ({
      year: input.year,
      sop_group: input.group,
      sku_code: sku.sku_code,
      sku_id: sku.sku_id,
      reason: sku.reason,
      suggested_sku_code: sku.suggested_sku_code,
      name: sku.name,
      retail_price: sku.retail_price,
      is_bundle: sku.is_bundle,
      franchise_id: sku.franchise_id,
      upload_id: input.uploadId,
      months: sku.months,
      updated_by: input.userId,
      updated_at: now,
    }));
    const { error } = await supabase
      .from("sop_forecast_pending_skus")
      .upsert(rows, { onConflict: "year,sop_group,sku_code" });
    if (error) throw error;
  }

  const eligible = [
    ...new Set(input.eligibleCodes.map((code) => code.trim()).filter(Boolean)),
  ];
  if (eligible.length === 0) return;
  const chunk = 80;
  for (let i = 0; i < eligible.length; i += chunk) {
    const { error } = await supabase
      .from("sop_forecast_pending_skus")
      .delete()
      .eq("year", input.year)
      .eq("sop_group", input.group)
      .in("sku_code", eligible.slice(i, i + chunk));
    if (error) throw error;
  }
}

export async function deleteForecastPendingSku(
  supabase: SupabaseClient,
  id: string,
): Promise<SopPendingForecastSku | null> {
  const { data, error } = await supabase
    .from("sop_forecast_pending_skus")
    .delete()
    .eq("id", id)
    .select(PENDING_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as PendingRow;
  const franchiseNames = await franchiseNameMap(supabase, [row]);
  return mapPendingRow(row, franchiseNames);
}

async function loadPendingOrThrow(
  supabase: SupabaseClient,
  id: string,
): Promise<SopPendingForecastSku> {
  const { data, error } = await supabase
    .from("sop_forecast_pending_skus")
    .select(PENDING_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Pending SKU not found.");
  const row = data as PendingRow;
  const franchiseNames = await franchiseNameMap(supabase, [row]);
  const pending = mapPendingRow(row, franchiseNames);
  if (!pending) throw new Error("Pending SKU not found.");
  return pending;
}

export async function applyPendingToExistingSku(
  supabase: SupabaseClient,
  input: {
    pendingId: string;
    skuId: string;
    userId: string | null;
  },
): Promise<{ year: number; group: SopChannelGroup }> {
  const pending = await loadPendingOrThrow(supabase, input.pendingId);
  const lines = pending.months.map((month) => ({
    sku_id: input.skuId,
    month: month.month,
    projected_qty: month.qty,
    avg_discount_pct: month.disc,
  }));
  await writeMonthPlans(supabase, {
    year: pending.year,
    group: pending.sop_group,
    lines,
    userId: input.userId,
  });
  await deleteForecastPendingSku(supabase, pending.id);
  return { year: pending.year, group: pending.sop_group };
}

export async function promoteForecastPendingSku(
  supabase: SupabaseClient,
  input: {
    pendingId: string;
    userId: string | null;
    isBundle: boolean;
    franchiseId: string | null;
    franchiseName: string | null;
    retailPrice: number;
  },
): Promise<{ year: number; group: SopChannelGroup }> {
  const pending = await loadPendingOrThrow(supabase, input.pendingId);
  if (!Number.isFinite(input.retailPrice) || input.retailPrice <= 0) {
    throw new Error("RSP must be a number greater than 0.");
  }
  if (!input.isBundle && !input.franchiseId && !input.franchiseName?.trim()) {
    throw new Error("Franchise is required for singles.");
  }

  let skuId = pending.sku_id;
  if (skuId) {
    await updateSku(supabase, skuId, {
      is_active: true,
      is_bundle: input.isBundle,
      is_packaging: false,
      is_extract: false,
      ...(input.isBundle
        ? {}
        : {
            franchise_id: input.franchiseId,
            franchise_name: input.franchiseName,
          }),
      retail_price: input.retailPrice,
    });
  } else {
    const created = await createSku(supabase, {
      sku_code: pending.sku_code,
      name: pending.name,
      is_bundle: input.isBundle,
      franchise_id: input.isBundle ? null : input.franchiseId,
      franchise_name: input.isBundle ? null : input.franchiseName,
      retail_price: input.retailPrice,
    });
    skuId = created.id;
  }

  const lines = pending.months.map((month) => ({
    sku_id: skuId!,
    month: month.month,
    projected_qty: month.qty,
    avg_discount_pct: month.disc,
  }));
  await writeMonthPlans(supabase, {
    year: pending.year,
    group: pending.sop_group,
    lines,
    userId: input.userId,
  });
  await deleteForecastPendingSku(supabase, pending.id);
  invalidateForecastCache();
  return { year: pending.year, group: pending.sop_group };
}

export async function useSuggestedForecastSku(
  supabase: SupabaseClient,
  input: { pendingId: string; userId: string | null },
): Promise<{ year: number; group: SopChannelGroup }> {
  const pending = await loadPendingOrThrow(supabase, input.pendingId);
  const suggested = pending.suggested_sku_code?.trim();
  if (!suggested) {
    throw new Error("No suggested SKU to apply.");
  }
  const { data, error } = await supabase
    .from("skus")
    .select(
      "id, sku_code, is_bundle, is_packaging, is_extract, is_active, franchise_id",
    )
    .eq("sku_code", suggested)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    !isForecastCatalogEligible({
      id: data.id,
      sku_code: data.sku_code,
      name: null,
      is_bundle: data.is_bundle,
      is_packaging: data.is_packaging,
      is_extract: data.is_extract,
      is_active: data.is_active,
      franchise_id: data.franchise_id,
      retail_price: null,
    })
  ) {
    throw new Error(`${suggested} is not an active forecast SKU.`);
  }
  return applyPendingToExistingSku(supabase, {
    pendingId: pending.id,
    skuId: data.id,
    userId: input.userId,
  });
}
