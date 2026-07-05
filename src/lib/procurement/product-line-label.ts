import type { PurchaseOrderLine } from "@/types/database";

export function resolveProductLineLabel(
  line: Pick<PurchaseOrderLine, "sku_code" | "sku_name">,
): string {
  if (line.sku_name?.trim()) return line.sku_name.trim();
  return line.sku_code ?? "—";
}

export function showSkuCodeSubline(
  line: Pick<PurchaseOrderLine, "sku_code" | "sku_name">,
): boolean {
  const label = resolveProductLineLabel(line);
  return Boolean(line.sku_code && line.sku_code !== label);
}
