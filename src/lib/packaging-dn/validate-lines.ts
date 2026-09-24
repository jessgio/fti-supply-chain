import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackagingCatalogTable } from "@/lib/packaging-dn/catalog";
import {
  poHasManufacturingLine,
  type PackagingDnPoLineRef,
} from "@/lib/packaging-dn/open-pos";

export interface PackagingDnLineInput {
  packaging_item_id: string;
  cartons: number;
  pcs_per_carton: number;
}

export interface ValidatePackagingDnPoAndLinesOptions {
  allowClosedPoId?: string;
  allowInactivePackagingIds?: string[];
  /** When true, reject packaging-only / extract-only POs (primary packaging DN). */
  requireManufacturingPo?: boolean;
}

export interface ValidatedPackagingDnPoAndLines {
  po: { id: string; po_number: string; status: string };
  lineRows: Array<{
    packaging_item_id: string;
    item_code: string;
    product_name: string;
    cartons: number;
    pcs_per_carton: number;
    total_pcs: number;
  }>;
}

const PO_SELECT_BASIC = "id, po_number, status" as const;
const PO_SELECT_WITH_LINES =
  "id, po_number, status, purchase_order_lines ( skus!sku_id ( is_packaging, is_extract ) )" as const;

export async function validatePackagingDnPoAndLines(
  supabase: SupabaseClient,
  catalogTable: PackagingCatalogTable,
  input: { po_id: string; lines: PackagingDnLineInput[] },
  options: ValidatePackagingDnPoAndLinesOptions = {},
): Promise<ValidatedPackagingDnPoAndLines> {
  const poQuery = options.requireManufacturingPo
    ? supabase
        .from("purchase_orders")
        .select(PO_SELECT_WITH_LINES)
        .eq("id", input.po_id)
        .maybeSingle()
    : supabase
        .from("purchase_orders")
        .select(PO_SELECT_BASIC)
        .eq("id", input.po_id)
        .maybeSingle();

  const { data: po, error: poError } = await poQuery;
  if (poError) throw poError;
  if (!po) throw new Error("Purchase order not found.");
  if (po.status === "received" || po.status === "cancelled") {
    if (!options.allowClosedPoId || po.id !== options.allowClosedPoId) {
      throw new Error("Selected PO is closed.");
    }
  }
  if (options.requireManufacturingPo) {
    const keepingExistingPo =
      Boolean(options.allowClosedPoId) && po.id === options.allowClosedPoId;
    if (!keepingExistingPo) {
      const lines =
        ("purchase_order_lines" in po
          ? (po.purchase_order_lines ?? [])
          : []) as PackagingDnPoLineRef[];
      if (!poHasManufacturingLine(lines)) {
        throw new Error(
          "Select a manufacturing (filling) purchase order, not a packaging-production PO.",
        );
      }
    }
  }
  if (input.lines.length === 0) {
    throw new Error("Add at least one line item.");
  }

  const packagingIds = input.lines.map((line) => line.packaging_item_id);
  const { data: packagingRows, error: packagingError } = await supabase
    .from(catalogTable)
    .select("id, item_code, product_name, is_active")
    .in("id", packagingIds);
  if (packagingError) throw packagingError;

  const packagingById = new Map(
    (packagingRows ?? []).map((row) => [row.id as string, row]),
  );
  const allowedInactive = new Set(options.allowInactivePackagingIds ?? []);

  const lineRows = input.lines.map((line) => {
    const item = packagingById.get(line.packaging_item_id);
    if (!item) {
      throw new Error("One or more packaging items are invalid.");
    }
    if (!item.is_active && !allowedInactive.has(line.packaging_item_id)) {
      throw new Error("One or more packaging items are invalid.");
    }
    if (!Number.isInteger(line.cartons) || line.cartons <= 0) {
      throw new Error("Carton count must be a positive whole number.");
    }
    if (!Number.isInteger(line.pcs_per_carton) || line.pcs_per_carton <= 0) {
      throw new Error("Pieces per carton must be a positive whole number.");
    }

    return {
      packaging_item_id: line.packaging_item_id,
      item_code: item.item_code as string,
      product_name: item.product_name as string,
      cartons: line.cartons,
      pcs_per_carton: line.pcs_per_carton,
      total_pcs: line.cartons * line.pcs_per_carton,
    };
  });

  return {
    po: {
      id: po.id as string,
      po_number: po.po_number as string,
      status: po.status as string,
    },
    lineRows,
  };
}
