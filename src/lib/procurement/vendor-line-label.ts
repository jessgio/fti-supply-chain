import type { PurchaseOrderLine } from "@/types/database";

export function resolveVendorLineLabel(
  line: Pick<PurchaseOrderLine, "sku_id" | "sku_code" | "sku_name">,
  vendorProductNames: Map<string, string>,
): string {
  const vendorName = vendorProductNames.get(line.sku_id);
  if (vendorName) return vendorName;
  if (line.sku_name?.trim()) return line.sku_name.trim();
  return line.sku_code ?? "—";
}

export function usesVendorProductName(
  line: Pick<PurchaseOrderLine, "sku_id">,
  vendorProductNames: Map<string, string>,
): boolean {
  return vendorProductNames.has(line.sku_id);
}
