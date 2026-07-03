import type { SupabaseClient } from "@supabase/supabase-js";
import { listProductPackagingLinks } from "@/lib/db/product-packaging";
import { computePackagingRestockNeed } from "@/lib/packaging/restock-needs";
import { PACKAGING_STOCK_LOCATIONS } from "@/lib/stock/locations";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type {
  ProductLinkedPackagingRow,
  RestockRecommendation,
} from "@/types/database";

async function latestPackagingStockDate(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("stock_levels")
    .select("as_of_date")
    .in("location", [...PACKAGING_STOCK_LOCATIONS])
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.as_of_date ?? null;
}

/**
 * Packaging stock and restock needs keyed by finished-good SKU code.
 * Used on the inventory forecast page when expanding a main SKU row.
 */
export async function loadPackagingByProduct(
  supabase: SupabaseClient,
  recommendations: RestockRecommendation[],
): Promise<Record<string, ProductLinkedPackagingRow[]>> {
  const links = await listProductPackagingLinks(supabase);
  if (links.length === 0) return {};

  const packagingSkuIds = [...new Set(links.map((l) => l.packaging_sku_id))];
  const stockAsOf = await latestPackagingStockDate(supabase);

  const [stockRows, onOrderRes] = await Promise.all([
    stockAsOf
      ? fetchAllRows<{ sku_id: string; qty_on_hand: number }>(() =>
          supabase
            .from("stock_levels")
            .select("sku_id, qty_on_hand")
            .in("sku_id", packagingSkuIds)
            .eq("as_of_date", stockAsOf)
            .in("location", [...PACKAGING_STOCK_LOCATIONS]),
        )
      : Promise.resolve([]),
    supabase.rpc("get_on_order_qty_by_sku"),
  ]);
  if (onOrderRes.error) throw onOrderRes.error;

  const stockBySkuId = new Map<string, number>();
  for (const row of stockRows) {
    stockBySkuId.set(
      row.sku_id,
      (stockBySkuId.get(row.sku_id) ?? 0) + Number(row.qty_on_hand),
    );
  }

  const onOrderBySkuId = new Map<string, number>();
  for (const row of onOrderRes.data ?? []) {
    onOrderBySkuId.set(
      row.sku_id as string,
      Number(row.on_order_qty),
    );
  }

  const recBySku = new Map(recommendations.map((r) => [r.sku_code, r]));

  const linksByPackagingId = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByPackagingId.get(link.packaging_sku_id) ?? [];
    list.push(link);
    linksByPackagingId.set(link.packaging_sku_id, list);
  }

  const needByPackagingId = new Map<
    string,
    ReturnType<typeof computePackagingRestockNeed>
  >();
  for (const packagingSkuId of packagingSkuIds) {
    const skuLinks = linksByPackagingId.get(packagingSkuId) ?? [];
    const onHand = stockBySkuId.get(packagingSkuId) ?? 0;
    const onOrder = onOrderBySkuId.get(packagingSkuId) ?? 0;
    needByPackagingId.set(
      packagingSkuId,
      computePackagingRestockNeed(
        skuLinks.map((l) => ({
          product_sku_code: l.product_sku_code,
          product_name: l.product_name,
          qty_per_unit: l.qty_per_unit,
        })),
        recBySku,
        onHand,
        onOrder,
      ),
    );
  }

  const byProduct: Record<string, ProductLinkedPackagingRow[]> = {};

  for (const link of links) {
    const need = needByPackagingId.get(link.packaging_sku_id);
    const contribution = need?.linked_products.find(
      (p) => p.product_sku_code === link.product_sku_code,
    );

    const row: ProductLinkedPackagingRow = {
      packaging_sku_code: link.packaging_sku_code,
      packaging_name: link.packaging_name,
      qty_per_unit: link.qty_per_unit,
      qty_on_hand: stockBySkuId.get(link.packaging_sku_id) ?? 0,
      on_order_qty: onOrderBySkuId.get(link.packaging_sku_id) ?? 0,
      need_from_product: contribution?.contribution ?? 0,
      recommended_po_qty: need?.recommended_po_qty ?? 0,
    };

    const list = byProduct[link.product_sku_code] ?? [];
    list.push(row);
    byProduct[link.product_sku_code] = list;
  }

  for (const skuCode of Object.keys(byProduct)) {
    byProduct[skuCode].sort((a, b) =>
      a.packaging_sku_code.localeCompare(b.packaging_sku_code),
    );
  }

  return byProduct;
}
