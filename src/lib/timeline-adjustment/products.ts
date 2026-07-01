import type { TimelineProductOption } from "@/types/database";
import type { TimelineScheduleProduct } from "@/lib/timeline-adjustment/schedule";

export function displayTimelineProductName(
  product: Pick<TimelineProductOption, "sku_code" | "name">,
): string {
  return product.name?.trim() || product.sku_code;
}

export function resolveTimelineProduct(
  products: TimelineProductOption[],
  input: { skuId?: string | null; productName?: string | null },
): TimelineProductOption | null {
  if (input.skuId) {
    const byId = products.find((p) => p.id === input.skuId);
    if (byId) return byId;
  }

  const trimmed = input.productName?.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  return (
    products.find(
      (p) =>
        p.sku_code.toLowerCase() === lower ||
        (p.name?.trim().toLowerCase() ?? "") === lower ||
        displayTimelineProductName(p).toLowerCase() === lower,
    ) ?? null
  );
}

export function formatTimelineDisplayName(
  products: Pick<TimelineScheduleProduct, "productName">[],
): string {
  if (products.length === 0) return "Untitled timeline";
  const names = products.map((p) => p.productName.trim()).filter(Boolean);
  if (names.length === 0) return "Untitled timeline";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

export function timelineProductsMatch(
  a: TimelineScheduleProduct[],
  b: TimelineScheduleProduct[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) =>
      item.productName === b[index].productName && item.skuId === b[index].skuId,
  );
}

export function isDuplicateTimelineProduct(
  products: TimelineScheduleProduct[],
  candidate: TimelineScheduleProduct,
  excludeIndex?: number,
): boolean {
  const key = productEntryKey(candidate);
  return products.some((item, index) => {
    if (excludeIndex != null && index === excludeIndex) return false;
    return productEntryKey(item) === key;
  });
}

export function productEntryKey(
  product: TimelineScheduleProduct,
): string {
  if (product.skuId) return `sku:${product.skuId}`;
  return `name:${product.productName.trim().toLowerCase()}`;
}
