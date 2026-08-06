/** Human-readable SKU list for PO / shipment option labels. */
export function summarizeSkuLabels(
  items:
    | Array<{ sku_code?: string | null; sku_name?: string | null }>
    | null
    | undefined,
  max = 4,
): string {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const item of items ?? []) {
    const label = (item.sku_name?.trim() || item.sku_code?.trim() || "").trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  if (labels.length === 0) return "";
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} +${labels.length - max} more`;
}
