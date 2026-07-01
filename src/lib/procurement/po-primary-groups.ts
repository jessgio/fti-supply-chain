import type { ProductPackagingLink, PurchaseOrder } from "@/types/database";

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
): string[] {
  const keys = new Set<string>();

  for (const line of po.lines ?? []) {
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

  if (keys.size === 0 && po.pd_project_id) {
    keys.add(`pd:${po.pd_project_id}`);
  }

  if (keys.size === 0) {
    keys.add(UNCATEGORIZED_KEY);
  }

  return [...keys];
}

export function classifyPoForPrimary(
  po: PurchaseOrder,
  primarySkuId: string,
  packagingToProducts: Map<string, string[]>,
  skuById: Map<string, PrimaryGoodSkuMeta>,
): PoPrimaryRole {
  let hasFinished = false;
  let hasPackaging = false;

  for (const line of po.lines ?? []) {
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
): PoPrimaryGroup[] {
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
    const keys = resolvePrimaryKeysForPo(po, skuById, packagingToProducts);

    for (const key of keys) {
      ensureGroup(key, po);

      const seen = poIdsByGroup.get(key)!;
      if (seen.has(po.id)) continue;
      seen.add(po.id);

      const role =
        key !== UNCATEGORIZED_KEY && !key.startsWith("pd:") && groups.get(key)?.primarySkuId
          ? classifyPoForPrimary(
              po,
              groups.get(key)!.primarySkuId!,
              packagingToProducts,
              skuById,
            )
          : undefined;

      groups.get(key)!.pos.push(role ? { ...po, primaryRole: role } : po);
    }
  }

  return [...groups.values()].sort((a, b) => {
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
