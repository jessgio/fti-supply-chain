import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkuAliasRecord } from "@/lib/skus/alias-resolve";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export type { SkuAliasRecord };

export interface ApplySkuAliasResult {
  sales_moved: number;
  stock_rows: number;
  plans_moved: number;
  previous_canonical_sku_id: string | null;
}

interface AliasJoinRow {
  alias_sku_id: string;
  canonical_sku_id: string;
  alias: { sku_code: string; name: string | null } | { sku_code: string; name: string | null }[] | null;
  canonical: { sku_code: string; name: string | null } | { sku_code: string; name: string | null }[] | null;
}

function oneSku(
  value: AliasJoinRow["alias"],
): { sku_code: string; name: string | null } | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function listSkuAliases(
  supabase: SupabaseClient,
): Promise<SkuAliasRecord[]> {
  const rows = await fetchAllRows<AliasJoinRow>(() =>
    supabase
      .from("sku_aliases")
      .select(
        "alias_sku_id, canonical_sku_id, alias:skus!sku_aliases_alias_sku_id_fkey(sku_code, name), canonical:skus!sku_aliases_canonical_sku_id_fkey(sku_code, name)",
      ),
  );

  return rows
    .map((row) => {
      const alias = oneSku(row.alias);
      const canonical = oneSku(row.canonical);
      if (!alias || !canonical) return null;
      return {
        alias_sku_id: row.alias_sku_id,
        alias_sku_code: alias.sku_code,
        alias_name: alias.name,
        canonical_sku_id: row.canonical_sku_id,
        canonical_sku_code: canonical.sku_code,
        canonical_name: canonical.name,
      };
    })
    .filter((row): row is SkuAliasRecord => row != null)
    .sort((a, b) => a.alias_sku_code.localeCompare(b.alias_sku_code));
}

export async function listAliasSkuIds(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const rows = await fetchAllRows<{ alias_sku_id: string }>(() =>
    supabase.from("sku_aliases").select("alias_sku_id"),
  );
  return new Set(rows.map((row) => row.alias_sku_id));
}

export async function applySkuAlias(
  supabase: SupabaseClient,
  aliasSkuId: string,
  canonicalSkuId: string,
): Promise<ApplySkuAliasResult> {
  const { data, error } = await supabase.rpc("apply_sku_alias", {
    p_alias_sku_id: aliasSkuId,
    p_canonical_sku_id: canonicalSkuId,
  });
  if (error) throw error;

  const payload = (data ?? {}) as Partial<ApplySkuAliasResult>;
  const { error: refreshError } = await supabase.rpc(
    "refresh_franchise_sales_daily_agg",
  );
  if (refreshError) {
    throw new Error(
      `Alias saved, but daily sales totals did not refresh (${refreshError.message}). Save the alias again to retry.`,
    );
  }

  return {
    sales_moved: Number(payload.sales_moved ?? 0),
    stock_rows: Number(payload.stock_rows ?? 0),
    plans_moved: Number(payload.plans_moved ?? 0),
    previous_canonical_sku_id: payload.previous_canonical_sku_id ?? null,
  };
}

export async function clearSkuAlias(
  supabase: SupabaseClient,
  aliasSkuId: string,
): Promise<void> {
  const { error } = await supabase.rpc("clear_sku_alias", {
    p_alias_sku_id: aliasSkuId,
  });
  if (error) throw error;
}
