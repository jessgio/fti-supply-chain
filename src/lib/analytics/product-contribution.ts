import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRpc } from "@/lib/supabase/fetch-all";
import type {
  ContributionWindow,
  FranchiseProductContribution,
  ProductContributionMeta,
} from "@/types/database";

type RpcRow = {
  window_type: string;
  franchise_id: string;
  franchise_name: string;
  sku_code: string;
  product_name: string;
  total_qty: number | string;
  total_net_sales: number | string;
};

export interface ProductContributionLoadParams {
  channelId?: string | null;
  franchiseId?: string | null;
}

export interface ProductContributionLoadResult {
  rows: FranchiseProductContribution[];
  meta: ProductContributionMeta;
}

function mapRow(row: RpcRow): FranchiseProductContribution {
  return {
    window_type: row.window_type as ContributionWindow,
    franchise_id: String(row.franchise_id),
    franchise_name: String(row.franchise_name),
    sku_code: String(row.sku_code),
    product_name: String(row.product_name),
    total_qty: Number(row.total_qty),
    total_net_sales: Number(row.total_net_sales),
  };
}

export async function loadProductContribution(
  supabase: SupabaseClient,
  params: ProductContributionLoadParams = {},
): Promise<ProductContributionLoadResult> {
  const rpcData = await fetchAllRpc<RpcRow>(supabase, "get_franchise_product_contribution", {
    p_as_of: null,
    p_channel_id: params.channelId || null,
    p_franchise_id: params.franchiseId || null,
  });

  const rows = rpcData.map(mapRow);

  const { data: latestDate, error } = await supabase
    .from("sku_sales_daily_agg")
    .select("sale_date")
    .order("sale_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const asOf = latestDate?.sale_date ?? null;
  const meta: ProductContributionMeta = asOf
    ? {
        as_of: asOf,
        mtd_from: `${asOf.slice(0, 7)}-01`,
        ytd_from: `${asOf.slice(0, 4)}-01-01`,
      }
    : { as_of: null, mtd_from: null, ytd_from: null };

  return { rows, meta };
}

export interface FranchiseShareRow {
  franchise_name: string;
  share_pct: number;
  value: number;
}

export function buildFranchiseShareData(
  rows: FranchiseProductContribution[],
  window: ContributionWindow,
  metric: "sales" | "qty",
): { rows: FranchiseShareRow[]; grandTotal: number } {
  const filtered = rows.filter((r) => r.window_type === window);
  const valueOf = (row: FranchiseProductContribution) =>
    metric === "sales" ? row.total_net_sales : row.total_qty;

  const byFranchise = new Map<string, { name: string; value: number }>();
  for (const row of filtered) {
    const existing = byFranchise.get(row.franchise_id);
    const value = valueOf(row);
    if (existing) {
      existing.value += value;
    } else {
      byFranchise.set(row.franchise_id, {
        name: row.franchise_name,
        value,
      });
    }
  }

  const grandTotal = [...byFranchise.values()].reduce(
    (sum, f) => sum + f.value,
    0,
  );

  const chartRows = [...byFranchise.values()]
    .map((f) => ({
      franchise_name: f.name,
      value: f.value,
      share_pct: grandTotal > 0 ? (f.value / grandTotal) * 100 : 0,
    }))
    .filter((f) => f.value > 0)
    .sort((a, b) => b.share_pct - a.share_pct);

  return { rows: chartRows, grandTotal };
}
