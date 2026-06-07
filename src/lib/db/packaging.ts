import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGING_STOCK_LOCATION } from "@/lib/stock/locations";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { listProductPackagingLinks } from "@/lib/db/product-packaging";
import { loadRestockRecommendations } from "@/lib/forecast/service";
import { computePackagingRestockNeed } from "@/lib/packaging/restock-needs";
import type { PackagingPoLine, PackagingSkuRow } from "@/types/database";

export interface PackagingOverview {
  stockAsOf: string | null;
  items: PackagingSkuRow[];
  openPoLines: PackagingPoLine[];
}

export interface SkuForPackagingToggle {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  franchise_name: string | null;
}

async function latestStockDate(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("stock_levels")
    .select("as_of_date")
    .eq("location", PACKAGING_STOCK_LOCATION)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.as_of_date ?? null;
}

export async function listPackagingOverview(
  supabase: SupabaseClient,
): Promise<PackagingOverview> {
  const [stockAsOf, packagingSkus] = await Promise.all([
    latestStockDate(supabase),
    fetchAllRows<{
      id: string;
      sku_code: string;
      name: string | null;
    }>(() =>
      supabase
        .from("skus")
        .select("id, sku_code, name")
        .eq("is_packaging", true)
        .order("sku_code"),
    ),
  ]);

  if (packagingSkus.length === 0) {
    return { stockAsOf, items: [], openPoLines: [] };
  }

  const skuIds = packagingSkus.map((s) => s.id);

  const [
    stockRows,
    onOrderRes,
    links,
    { recommendations },
    openPoLines,
  ] = await Promise.all([
    stockAsOf
      ? fetchAllRows<{
          sku_id: string;
          qty_on_hand: number;
        }>(() =>
          supabase
            .from("stock_levels")
            .select("sku_id, qty_on_hand")
            .in("sku_id", skuIds)
            .eq("as_of_date", stockAsOf)
            .eq("location", PACKAGING_STOCK_LOCATION),
        )
      : Promise.resolve([]),
    supabase.rpc("get_on_order_qty_by_sku"),
    listProductPackagingLinks(supabase),
    loadRestockRecommendations(supabase),
    listOpenPackagingPoLines(supabase, skuIds),
  ]);

  if (onOrderRes.error) throw onOrderRes.error;

  const stockBySku = new Map<string, number>();
  for (const row of stockRows) {
    stockBySku.set(
      row.sku_id,
      (stockBySku.get(row.sku_id) ?? 0) + Number(row.qty_on_hand),
    );
  }

  const onOrderBySku = new Map<string, number>();
  for (const row of onOrderRes.data ?? []) {
    onOrderBySku.set(row.sku_id as string, Number(row.on_order_qty));
  }

  const recBySku = new Map(recommendations.map((r) => [r.sku_code, r]));
  const linksByPackagingId = new Map<string, typeof links>();
  for (const link of links) {
    const list = linksByPackagingId.get(link.packaging_sku_id) ?? [];
    list.push(link);
    linksByPackagingId.set(link.packaging_sku_id, list);
  }

  const items: PackagingSkuRow[] = packagingSkus.map((sku) => {
    const onHand = stockBySku.get(sku.id) ?? 0;
    const onOrder = onOrderBySku.get(sku.id) ?? 0;
    const skuLinks = linksByPackagingId.get(sku.id) ?? [];
    const need = computePackagingRestockNeed(
      skuLinks.map((l) => ({
        product_sku_code: l.product_sku_code,
        product_name: l.product_name,
        qty_per_unit: l.qty_per_unit,
      })),
      recBySku,
      onHand,
      onOrder,
    );

    return {
      id: sku.id,
      sku_code: sku.sku_code,
      name: sku.name,
      is_packaging: true,
      qty_on_hand: onHand,
      on_order_qty: onOrder,
      stock_as_of: stockAsOf,
      suggested_from_fg_restock: need.suggested_from_fg_restock,
      recommended_po_qty: need.recommended_po_qty,
      linked_products: need.linked_products,
    };
  });

  return { stockAsOf, items, openPoLines };
}

type PackagingPoLineRow = {
  qty_ordered: number;
  qty_received: number;
  skus: { sku_code: string } | null;
  purchase_orders: {
    id: string;
    po_number: string;
    status: string;
    expected_date: string | null;
    suppliers: { name: string } | null;
  } | null;
};

export async function listOpenPackagingPoLines(
  supabase: SupabaseClient,
  packagingSkuIds: string[],
): Promise<PackagingPoLine[]> {
  if (packagingSkuIds.length === 0) return [];

  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select(
      "qty_ordered, qty_received, skus(sku_code), " +
        "purchase_orders!inner(id, po_number, status, expected_date, suppliers(name))",
    )
    .in("sku_id", packagingSkuIds)
    .in("purchase_orders.status", ["planned", "ordered", "in_transit"])
    .order("expected_date", {
      ascending: true,
      nullsFirst: false,
      foreignTable: "purchase_orders",
    });
  if (error) throw error;

  const lines: PackagingPoLine[] = [];
  for (const line of (data ?? []) as unknown as PackagingPoLineRow[]) {
    const po = line.purchase_orders;
    if (!po || !line.skus) continue;
    const qtyOpen = Math.max(
      0,
      Number(line.qty_ordered) - Number(line.qty_received),
    );
    if (qtyOpen <= 0) continue;
    lines.push({
      po_id: po.id,
      po_number: po.po_number,
      po_status: po.status as PackagingPoLine["po_status"],
      supplier_name: po.suppliers?.name ?? null,
      expected_date: po.expected_date,
      sku_code: line.skus.sku_code,
      qty_ordered: Number(line.qty_ordered),
      qty_received: Number(line.qty_received),
      qty_open: qtyOpen,
    });
  }

  return lines;
}

type SkuToggleRow = {
  id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  is_packaging: boolean;
  product_franchises: { name: string } | null;
};

export async function listSkusForPackagingToggle(
  supabase: SupabaseClient,
): Promise<SkuForPackagingToggle[]> {
  const rows = await fetchAllRows<SkuToggleRow>(() =>
    supabase
      .from("skus")
      .select(
        "id, sku_code, name, is_bundle, is_packaging, product_franchises(name)",
      )
      .order("sku_code") as unknown as Parameters<
      typeof fetchAllRows<SkuToggleRow>
    >[0] extends () => infer Q
      ? Q
      : never,
  );

  return rows.map((row) => ({
    id: row.id,
    sku_code: row.sku_code,
    name: row.name,
    is_bundle: row.is_bundle,
    is_packaging: row.is_packaging,
    franchise_name: row.product_franchises?.name ?? null,
  }));
}
