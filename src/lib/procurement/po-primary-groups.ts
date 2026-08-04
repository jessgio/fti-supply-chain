import type { ProductPackagingLink, PurchaseOrder } from "@/types/database";
import { poLineOpenQty } from "@/lib/procurement/po-totals";

export interface PrimaryGoodSkuMeta {
  id: string;
  sku_code: string;
  name: string | null;
  is_packaging: boolean;
  is_bundle: boolean;
}

export type PoPrimaryRole = "finished" | "packaging" | "mixed";

export interface PoPrimaryGroup {
  key: string;
  primarySkuId: string | null;
  label: string;
  skuCode: string | null;
  packagingComponents: ProductPackagingLink[];
  pos: Array<PurchaseOrder & { primaryRole?: PoPrimaryRole }>;
}

const UNCATEGORIZED_KEY = "uncategorized";

function primaryLabel(sku: PrimaryGoodSkuMeta): string {
  return sku.name?.trim() || sku.sku_code;
}

function buildPackagingToProducts(
  links: ProductPackagingLink[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const link of links) {
    const list = map.get(link.packaging_sku_id) ?? [];
    if (!list.includes(link.product_sku_id)) {
      list.push(link.product_sku_id);
    }
    map.set(link.packaging_sku_id, list);
  }
  return map;
}

function buildPackagingByProduct(
  links: ProductPackagingLink[],
): Map<string, ProductPackagingLink[]> {
  const map = new Map<string, ProductPackagingLink[]>();
  for (const link of links) {
    const list = map.get(link.product_sku_id) ?? [];
    list.push(link);
    map.set(link.product_sku_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.packaging_sku_code.localeCompare(b.packaging_sku_code));
  }
  return map;
}

function resolvePrimaryKeysForPo(
  po: PurchaseOrder,
  skuById: Map<string, PrimaryGoodSkuMeta>,
  packagingToProducts: Map<string, string[]>,
  includeCompleted = false,
): string[] {
  const keys = new Set<string>();
  const lines = po.lines ?? [];

  for (const line of lines) {
    // Fully received / short-closed lines should not keep a product on the
    // active procurement list — only remaining open SKUs stay visible.
    // Historical received/cancelled views include completed lines.
    if (!includeCompleted && poLineOpenQty(line) <= 0) continue;

    const linkedProducts = packagingToProducts.get(line.sku_id);
    if (linkedProducts && linkedProducts.length > 0) {
      for (const productId of linkedProducts) {
        keys.add(productId);
      }
      continue;
    }

    const sku = skuById.get(line.sku_id);
    if (!sku) continue;

    if (sku.is_packaging) {
      continue;
    }

    keys.add(line.sku_id);
  }

  if (keys.size === 0) {
    if (!includeCompleted) {
      const hasOpenLines = lines.some((line) => poLineOpenQty(line) > 0);
      if (!hasOpenLines) {
        return [];
      }
    } else if (lines.length === 0) {
      return [];
    }
    if (po.pd_project_id) {
      keys.add(`pd:${po.pd_project_id}`);
    } else {
      keys.add(UNCATEGORIZED_KEY);
    }
  }

  return [...keys];
}

export function classifyPoForPrimary(
  po: PurchaseOrder,
  primarySkuId: string,
  packagingToProducts: Map<string, string[]>,
  skuById: Map<string, PrimaryGoodSkuMeta>,
  includeCompleted = false,
): PoPrimaryRole {
  let hasFinished = false;
  let hasPackaging = false;

  for (const line of po.lines ?? []) {
    if (!includeCompleted && poLineOpenQty(line) <= 0) continue;

    const linkedProducts = packagingToProducts.get(line.sku_id) ?? [];
    if (linkedProducts.includes(primarySkuId)) {
      hasPackaging = true;
      continue;
    }

    if (line.sku_id === primarySkuId) {
      hasFinished = true;
      continue;
    }

    const sku = skuById.get(line.sku_id);
    if (sku && !sku.is_packaging && !linkedProducts.length) {
      hasFinished = true;
    }
  }

  if (hasFinished && hasPackaging) return "mixed";
  if (hasPackaging) return "packaging";
  return "finished";
}

function groupMetaForKey(
  key: string,
  skuById: Map<string, PrimaryGoodSkuMeta>,
  po?: PurchaseOrder,
): Pick<PoPrimaryGroup, "primarySkuId" | "label" | "skuCode"> {
  if (key === UNCATEGORIZED_KEY) {
    return {
      primarySkuId: null,
      label: "Other / uncategorized",
      skuCode: null,
    };
  }

  if (key.startsWith("pd:")) {
    const productName = po?.pd_project_product_name?.trim();
    const projectName = po?.pd_project_name?.trim();
    return {
      primarySkuId: null,
      label: productName || projectName || "Product development project",
      skuCode:
        projectName && productName && projectName !== productName
          ? projectName
          : null,
    };
  }

  const sku = skuById.get(key);
  if (!sku) {
    return {
      primarySkuId: key,
      label: "Unknown product",
      skuCode: null,
    };
  }

  return {
    primarySkuId: sku.id,
    label: primaryLabel(sku),
    skuCode: sku.sku_code,
  };
}

export function groupPurchaseOrdersByPrimaryGood(
  pos: PurchaseOrder[],
  skus: PrimaryGoodSkuMeta[],
  packagingLinks: ProductPackagingLink[],
  options?: { includeCompleted?: boolean },
): PoPrimaryGroup[] {
  const includeCompleted = Boolean(options?.includeCompleted);
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const packagingToProducts = buildPackagingToProducts(packagingLinks);
  const packagingByProduct = buildPackagingByProduct(packagingLinks);
  const groups = new Map<string, PoPrimaryGroup>();
  const poIdsByGroup = new Map<string, Set<string>>();

  function ensureGroup(key: string, po: PurchaseOrder) {
    if (groups.has(key)) return;
    const meta = groupMetaForKey(key, skuById, po);
    groups.set(key, {
      key,
      primarySkuId: meta.primarySkuId,
      label: meta.label,
      skuCode: meta.skuCode,
      packagingComponents:
        meta.primarySkuId != null
          ? (packagingByProduct.get(meta.primarySkuId) ?? [])
          : [],
      pos: [],
    });
    poIdsByGroup.set(key, new Set());
  }

  for (const po of pos) {
    const keys = resolvePrimaryKeysForPo(
      po,
      skuById,
      packagingToProducts,
      includeCompleted,
    );

    for (const key of keys) {
      ensureGroup(key, po);

      const seen = poIdsByGroup.get(key)!;
      if (seen.has(po.id)) continue;

      const primarySkuId = groups.get(key)?.primarySkuId ?? null;
      const role =
        key !== UNCATEGORIZED_KEY && !key.startsWith("pd:") && primarySkuId
          ? classifyPoForPrimary(
              po,
              primarySkuId,
              packagingToProducts,
              skuById,
              includeCompleted,
            )
          : undefined;

      const poWithRole = role ? { ...po, primaryRole: role } : po;
      // Skip product sections where this PO no longer has open qty for that SKU.
      // Received/cancelled (and search across statuses) keep completed POs visible.
      if (
        !includeCompleted &&
        poOpenQtyForPrimaryGroup(poWithRole, primarySkuId, packagingToProducts) <=
          0
      ) {
        continue;
      }

      seen.add(po.id);
      groups.get(key)!.pos.push(poWithRole);
    }
  }

  return [...groups.values()]
    .filter((group) => group.pos.length > 0)
    .sort((a, b) => {
      if (a.key === UNCATEGORIZED_KEY) return 1;
      if (b.key === UNCATEGORIZED_KEY) return -1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
}

export const ACTIVE_PO_STATUSES = new Set([
  "planned",
  "ordered",
  "in_production",
  "in_transit",
]);

export function isActivePurchaseOrder(po: PurchaseOrder): boolean {
  return ACTIVE_PO_STATUSES.has(po.status);
}

/**
 * Open qty attributable to one primary product within a PO.
 * Finished/mixed POs: only that finished-good SKU.
 * Packaging-only POs: only packaging lines mapped to that product.
 * Uncategorized / PD groups: full PO open qty.
 */
export function poOpenQtyForPrimaryGroup(
  po: PurchaseOrder & { primaryRole?: PoPrimaryRole },
  primarySkuId: string | null,
  packagingToProducts: Map<string, string[]>,
): number {
  const lines = po.lines ?? [];
  if (!primarySkuId) {
    return lines.reduce((sum, line) => sum + poLineOpenQty(line), 0);
  }

  if (po.primaryRole === "packaging") {
    return lines
      .filter((line) =>
        (packagingToProducts.get(line.sku_id) ?? []).includes(primarySkuId),
      )
      .reduce((sum, line) => sum + poLineOpenQty(line), 0);
  }

  return lines
    .filter((line) => line.sku_id === primarySkuId)
    .reduce((sum, line) => sum + poLineOpenQty(line), 0);
}

export function packagingSkuToProductIds(
  links: ProductPackagingLink[],
): Map<string, string[]> {
  return buildPackagingToProducts(links);
}
