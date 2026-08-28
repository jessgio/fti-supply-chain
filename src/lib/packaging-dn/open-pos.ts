import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractInboundPoOption } from "@/types/database";

/** Open POs for packaging inbound delivery notes (primary + secondary). */
export async function listOpenPosForPackagingDn(
  supabase: SupabaseClient,
): Promise<ExtractInboundPoOption[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, purchase_order_lines ( skus!sku_id ( name, sku_code ) )",
    )
    .not("status", "in", '("received","cancelled")')
    .order("order_date", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const lines = (row.purchase_order_lines ?? []) as Array<{
      skus:
        | { name: string | null; sku_code: string }
        | { name: string | null; sku_code: string }[]
        | null;
    }>;
    const skuNames: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const skus = line.skus;
      const sku = Array.isArray(skus) ? skus[0] : skus;
      const label = sku?.name?.trim() || sku?.sku_code?.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        skuNames.push(label);
      }
    }
    return {
      id: row.id as string,
      po_number: row.po_number as string,
      status: row.status as string,
      order_date: row.order_date as string,
      sku_names: skuNames,
    };
  });
}
