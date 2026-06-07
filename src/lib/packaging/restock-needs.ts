import type { RestockRecommendation } from "@/types/database";

export interface ProductPackagingInput {
  product_sku_code: string;
  product_name: string | null;
  qty_per_unit: number;
}

export interface PackagingLinkContribution {
  product_sku_code: string;
  product_name: string | null;
  qty_per_unit: number;
  fg_restock_qty: number | null;
  contribution: number;
}

export interface PackagingRestockNeed {
  suggested_from_fg_restock: number;
  recommended_po_qty: number;
  linked_products: PackagingLinkContribution[];
}

export function computePackagingRestockNeed(
  links: ProductPackagingInput[],
  recBySku: Map<string, RestockRecommendation>,
  onHand: number,
  onOrder: number,
): PackagingRestockNeed {
  const linked_products: PackagingLinkContribution[] = [];
  let suggested_from_fg_restock = 0;

  for (const link of links) {
    const rec = recBySku.get(link.product_sku_code);
    const fgNeedsRestock =
      rec != null && rec.needs_reorder && !rec.covered_by_po;
    const fgRestockQty = fgNeedsRestock ? rec.recommended_restock_qty : null;
    const contribution =
      fgRestockQty != null ? fgRestockQty * link.qty_per_unit : 0;

    suggested_from_fg_restock += contribution;
    linked_products.push({
      product_sku_code: link.product_sku_code,
      product_name: link.product_name,
      qty_per_unit: link.qty_per_unit,
      fg_restock_qty: fgRestockQty,
      contribution,
    });
  }

  const recommended_po_qty = Math.max(
    0,
    Math.ceil(suggested_from_fg_restock - onHand - onOrder),
  );

  return {
    suggested_from_fg_restock,
    recommended_po_qty,
    linked_products,
  };
}
