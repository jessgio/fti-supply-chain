import {
  groupPurchaseOrdersByPrimaryGood,
  type PrimaryGoodSkuMeta,
} from "@/lib/procurement/po-primary-groups";
import type {
  ProductPackagingLink,
  PurchaseOrder,
  PurchaseOrderLine,
  Shipment,
  ShipmentItemRef,
} from "@/types/database";

export interface ShipmentGroupEntry {
  shipment: Shipment;
  po_id: string;
  po_number: string;
  supplier_name: string | null;
}

export interface ShipmentPrimaryGroup {
  key: string;
  primarySkuId: string | null;
  label: string;
  skuCode: string | null;
  entries: ShipmentGroupEntry[];
  poCount: number;
  shipmentCount: number;
}

function buildPackagingToProducts(
  links: ProductPackagingLink[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const link of links) {
    const list = map.get(link.packaging_sku_id) ?? [];
    if (!list.includes(link.product_sku_id)) list.push(link.product_sku_id);
    map.set(link.packaging_sku_id, list);
  }
  return map;
}

function resolvePrimaryKeysForLineSku(
  skuId: string,
  skuById: Map<string, PrimaryGoodSkuMeta>,
  packagingToProducts: Map<string, string[]>,
): string[] {
  const linkedProducts = packagingToProducts.get(skuId);
  if (linkedProducts && linkedProducts.length > 0) {
    return linkedProducts;
  }

  const sku = skuById.get(skuId);
  if (!sku || sku.is_packaging) return [];
  return [skuId];
}

function buildPurchaseOrdersFromShipments(
  shipments: Shipment[],
): PurchaseOrder[] {
  const poMap = new Map<string, PurchaseOrder>();

  for (const shipment of shipments) {
    for (const poRef of shipment.purchase_orders ?? []) {
      let po = poMap.get(poRef.id);
      if (!po) {
        po = {
          id: poRef.id,
          po_number: poRef.po_number,
          supplier_id: null,
          supplier_name: poRef.supplier_name ?? null,
          status: "ordered",
          order_date: null,
          expected_date: null,
          down_payment_pct: 0,
          discount_amount: 0,
          tax_pct: 0,
          pph_pct: 0,
          other_charges: 0,
          currency: "IDR",
          notes: null,
          pd_project_id: null,
          lines: [],
        };
        poMap.set(poRef.id, po);
      }

      const seenLineIds = new Set((po.lines ?? []).map((line) => line.id));
      for (const item of poRef.items ?? []) {
        if (seenLineIds.has(item.po_line_id)) continue;
        seenLineIds.add(item.po_line_id);
        po.lines!.push(toPurchaseOrderLine(item));
      }
    }
  }

  return [...poMap.values()];
}

function toPurchaseOrderLine(item: ShipmentItemRef): PurchaseOrderLine {
  return {
    id: item.po_line_id,
    po_id: item.po_id,
    sku_id: item.sku_id,
    sku_code: item.sku_code,
    sku_name: item.sku_name,
    qty_ordered: item.qty_ordered,
    qty_received: 0,
    is_closed: false,
    unit_cost: null,
  };
}

function shipmentMatchesGroupPo(
  shipment: Shipment,
  poId: string,
  groupKey: string,
  skuById: Map<string, PrimaryGoodSkuMeta>,
  packagingToProducts: Map<string, string[]>,
): boolean {
  const poRef = shipment.purchase_orders?.find((po) => po.id === poId);
  if (!poRef) return false;

  if (groupKey.startsWith("pd:") || groupKey === "uncategorized") {
    return true;
  }

  for (const item of poRef.items ?? []) {
    const keys = resolvePrimaryKeysForLineSku(
      item.sku_id,
      skuById,
      packagingToProducts,
    );
    if (keys.includes(groupKey)) return true;
  }

  return false;
}

export function groupShipmentsByPrimaryGood(
  shipments: Shipment[],
  skus: PrimaryGoodSkuMeta[],
  packagingLinks: ProductPackagingLink[],
): ShipmentPrimaryGroup[] {
  const purchaseOrders = buildPurchaseOrdersFromShipments(shipments);
  const primaryGroups = groupPurchaseOrdersByPrimaryGood(
    purchaseOrders,
    skus,
    packagingLinks,
  );

  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const packagingToProducts = buildPackagingToProducts(packagingLinks);

  return primaryGroups
    .map((group) => {
      const entries: ShipmentGroupEntry[] = [];

      for (const po of group.pos) {
        const matchedShipments = shipments
          .filter((shipment) =>
            shipmentMatchesGroupPo(
              shipment,
              po.id,
              group.key,
              skuById,
              packagingToProducts,
            ),
          )
          .sort((a, b) =>
            b.estimated_departure_date.localeCompare(a.estimated_departure_date),
          );

        for (const shipment of matchedShipments) {
          entries.push({
            shipment,
            po_id: po.id,
            po_number: po.po_number,
            supplier_name: po.supplier_name ?? null,
          });
        }
      }

      entries.sort((a, b) =>
        b.shipment.estimated_departure_date.localeCompare(
          a.shipment.estimated_departure_date,
        ),
      );

      const poCount = new Set(entries.map((entry) => entry.po_id)).size;
      const shipmentCount = new Set(
        entries.map((entry) => entry.shipment.id),
      ).size;

      return {
        key: group.key,
        primarySkuId: group.primarySkuId,
        label: group.label,
        skuCode: group.skuCode,
        entries,
        poCount,
        shipmentCount,
      };
    })
    .filter((group) => group.entries.length > 0);
}
