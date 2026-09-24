import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractInboundPoOption } from "@/types/database";

type SkuRef = {
  name?: string | null;
  sku_code?: string | null;
  is_packaging?: boolean | null;
  is_extract?: boolean | null;
};

export type PackagingDnPoLineRef = {
  skus: SkuRef | SkuRef[] | null;
};

function skuFromLine(line: PackagingDnPoLineRef): SkuRef | null {
  const skus = line.skus;
  if (!skus) return null;
  return Array.isArray(skus) ? (skus[0] ?? null) : skus;
}

/** Finished-good (filling / manufacturing) line — not packaging or extract. */
export function isManufacturingSku(sku: {
  is_packaging?: boolean | null;
  is_extract?: boolean | null;
}): boolean {
  return !sku.is_packaging && !sku.is_extract;
}

export function poHasManufacturingLine(lines: PackagingDnPoLineRef[]): boolean {
  return lines.some((line) => {
    const sku = skuFromLine(line);
    return sku != null && isManufacturingSku(sku);
  });
}

export type PackagingDnPoScope = "all" | "manufacturing";

export interface ListOpenPosForPackagingDnOptions {
  /**
   * `manufacturing` — filling / finished-good POs only (primary packaging DN).
   * `all` — any open PO (secondary packaging DN).
   */
  scope?: PackagingDnPoScope;
}

/** Open POs for packaging inbound delivery notes (primary + secondary). */
export async function listOpenPosForPackagingDn(
  supabase: SupabaseClient,
  options: ListOpenPosForPackagingDnOptions = {},
): Promise<ExtractInboundPoOption[]> {
  const scope = options.scope ?? "all";

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, purchase_order_lines ( skus!sku_id ( name, sku_code, is_packaging, is_extract ) )",
    )
    .not("status", "in", '("received","cancelled")')
    .order("order_date", { ascending: false });
  if (error) throw error;

  const pos: ExtractInboundPoOption[] = [];

  for (const row of data ?? []) {
    const lines = (row.purchase_order_lines ?? []) as PackagingDnPoLineRef[];

    if (scope === "manufacturing" && !poHasManufacturingLine(lines)) {
      continue;
    }

    const skuNames: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const sku = skuFromLine(line);
      const label = sku?.name?.trim() || sku?.sku_code?.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        skuNames.push(label);
      }
    }

    pos.push({
      id: row.id as string,
      po_number: row.po_number as string,
      status: row.status as string,
      order_date: row.order_date as string,
      sku_names: skuNames,
    });
  }

  return pos;
}
