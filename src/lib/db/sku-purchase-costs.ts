import type { SupabaseClient } from "@supabase/supabase-js";

export interface SkuLastPurchaseCost {
  sku_id: string;
  currency: string;
  unit_cost: number;
  po_id: string | null;
  po_line_id: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  order_date: string | null;
  updated_at: string;
}

const SELECT_COLS =
  "sku_id, currency, unit_cost, po_id, po_line_id, po_number, supplier_id, supplier_name, order_date, updated_at";

function mapRow(row: Record<string, unknown>): SkuLastPurchaseCost {
  return {
    sku_id: String(row.sku_id),
    currency: String(row.currency),
    unit_cost: Number(row.unit_cost),
    po_id: row.po_id ? String(row.po_id) : null,
    po_line_id: row.po_line_id ? String(row.po_line_id) : null,
    po_number: row.po_number ? String(row.po_number) : null,
    supplier_id: row.supplier_id ? String(row.supplier_id) : null,
    supplier_name: row.supplier_name ? String(row.supplier_name) : null,
    order_date: row.order_date ? String(row.order_date) : null,
    updated_at: String(row.updated_at),
  };
}

/** Latest recorded purchase cost for SKUs, optionally filtered to one currency. */
export async function getSkuLastPurchaseCosts(
  supabase: SupabaseClient,
  skuIds: string[],
  currency?: string | null,
): Promise<SkuLastPurchaseCost[]> {
  const uniqueIds = [...new Set(skuIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  let query = supabase
    .from("sku_last_purchase_costs")
    .select(SELECT_COLS)
    .in("sku_id", uniqueIds);

  if (currency?.trim()) {
    query = query.eq("currency", currency.trim().toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

/**
 * Recompute and upsert last purchase costs for the given SKUs from PO history.
 * Call after PO create/update when line unit costs may have changed.
 */
export async function syncSkuLastPurchaseCosts(
  supabase: SupabaseClient,
  skuIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(skuIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const { data: lineRows, error } = await supabase
    .from("purchase_order_lines")
    .select(
      `
      id,
      sku_id,
      unit_cost,
      purchase_orders!inner (
        id,
        po_number,
        currency,
        status,
        order_date,
        created_at,
        supplier_id,
        suppliers ( name )
      )
    `,
    )
    .in("sku_id", uniqueIds)
    .not("unit_cost", "is", null);
  if (error) throw error;

  type LineJoin = {
    id: string;
    sku_id: string;
    unit_cost: number;
    purchase_orders:
      | {
          id: string;
          po_number: string;
          currency: string;
          status: string;
          order_date: string | null;
          created_at: string;
          supplier_id: string | null;
          suppliers: { name: string } | { name: string }[] | null;
        }
      | {
          id: string;
          po_number: string;
          currency: string;
          status: string;
          order_date: string | null;
          created_at: string;
          supplier_id: string | null;
          suppliers: { name: string } | { name: string }[] | null;
        }[];
  };

  const latestByKey = new Map<
    string,
    {
      sku_id: string;
      currency: string;
      unit_cost: number;
      po_id: string;
      po_line_id: string;
      po_number: string;
      supplier_id: string | null;
      supplier_name: string | null;
      order_date: string | null;
      sortDate: string;
      sortCreated: string;
    }
  >();

  for (const raw of (lineRows ?? []) as unknown as LineJoin[]) {
    const poRaw = raw.purchase_orders;
    const po = Array.isArray(poRaw) ? poRaw[0] : poRaw;
    if (!po || po.status === "cancelled") continue;
    if (raw.unit_cost == null || !Number.isFinite(Number(raw.unit_cost))) continue;

    const currency = (po.currency ?? "IDR").trim().toUpperCase();
    if (!currency) continue;

    const suppliers = po.suppliers;
    const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
    const key = `${raw.sku_id}::${currency}`;
    const candidate = {
      sku_id: raw.sku_id,
      currency,
      unit_cost: Number(raw.unit_cost),
      po_id: po.id,
      po_line_id: raw.id,
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      supplier_name: supplier?.name ?? null,
      order_date: po.order_date,
      sortDate: po.order_date ?? "",
      sortCreated: po.created_at,
    };

    const existing = latestByKey.get(key);
    if (!existing) {
      latestByKey.set(key, candidate);
      continue;
    }
    if (
      candidate.sortDate > existing.sortDate ||
      (candidate.sortDate === existing.sortDate &&
        candidate.sortCreated > existing.sortCreated)
    ) {
      latestByKey.set(key, candidate);
    }
  }

  const upserts = [...latestByKey.values()].map((row) => ({
    sku_id: row.sku_id,
    currency: row.currency,
    unit_cost: row.unit_cost,
    po_id: row.po_id,
    po_line_id: row.po_line_id,
    po_number: row.po_number,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    order_date: row.order_date,
    updated_at: new Date().toISOString(),
  }));

  if (upserts.length === 0) return;

  const { error: upsertError } = await supabase
    .from("sku_last_purchase_costs")
    .upsert(upserts, { onConflict: "sku_id,currency" });
  if (upsertError) throw upsertError;
}
