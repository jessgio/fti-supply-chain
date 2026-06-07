import type { SupabaseClient } from "@supabase/supabase-js";
import { STOCK_AGGREGATE_LOCATIONS } from "@/lib/stock/locations";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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
    .in("location", [...STOCK_AGGREGATE_LOCATIONS])
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.as_of_date ?? null;
}

export async function listPackagingOverview(
  supabase: SupabaseClient,
): Promise<PackagingOverview> {
  const stockAsOf = await latestStockDate(supabase);

  const packagingSkus = await fetchAllRows<{
    id: string;
    sku_code: string;
    name: string | null;
  }>(() =>
    supabase
      .from("skus")
      .select("id, sku_code, name")
      .eq("is_packaging", true)
      .order("sku_code"),
  );

  if (packagingSkus.length === 0) {
    return { stockAsOf, items: [], openPoLines: [] };
  }

  const skuIds = packagingSkus.map((s) => s.id);
  const stockBySku = new Map<string, number>();

  if (stockAsOf) {
    const stockRows = await fetchAllRows<{
      sku_id: string;
      qty_on_hand: number;
    }>(() =>
      supabase
        .from("stock_levels")
        .select("sku_id, qty_on_hand")
        .in("sku_id", skuIds)
        .eq("as_of_date", stockAsOf)
        .in("location", [...STOCK_AGGREGATE_LOCATIONS]),
    );
    for (const row of stockRows) {
      stockBySku.set(
        row.sku_id,
        (stockBySku.get(row.sku_id) ?? 0) + Number(row.qty_on_hand),
      );
    }
  }

  const { data: onOrderRows, error: onOrderError } = await supabase.rpc(
    "get_on_order_qty_by_sku",
  );
  if (onOrderError) throw onOrderError;

  const onOrderBySku = new Map<string, number>();
  for (const row of onOrderRows ?? []) {
    onOrderBySku.set(row.sku_id as string, Number(row.on_order_qty));
  }

  const items: PackagingSkuRow[] = packagingSkus.map((sku) => ({
    id: sku.id,
    sku_code: sku.sku_code,
    name: sku.name,
    is_packaging: true,
    qty_on_hand: stockBySku.get(sku.id) ?? 0,
    on_order_qty: onOrderBySku.get(sku.id) ?? 0,
    stock_as_of: stockAsOf,
  }));

  const openPoLines = await listOpenPackagingPoLines(supabase);

  return { stockAsOf, items, openPoLines };
}

type OpenPoRow = {
  id: string;
  po_number: string;
  status: string;
  expected_date: string | null;
  suppliers: { name: string } | null;
  purchase_order_lines: {
    qty_ordered: number;
    qty_received: number;
    skus: { sku_code: string; is_packaging: boolean } | null;
  }[];
};

export async function listOpenPackagingPoLines(
  supabase: SupabaseClient,
): Promise<PackagingPoLine[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, expected_date, suppliers(name), " +
        "purchase_order_lines(qty_ordered, qty_received, skus(sku_code, is_packaging))",
    )
    .in("status", ["planned", "ordered", "in_transit"])
    .order("expected_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as OpenPoRow[];
  const lines: PackagingPoLine[] = [];
  for (const po of rows) {
    for (const line of po.purchase_order_lines ?? []) {
      if (!line.skus?.is_packaging) continue;
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
