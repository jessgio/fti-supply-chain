import assert from "node:assert/strict";
import test from "node:test";
import {
  appendShipmentGoods,
  defaultTaxApPaymentPlanRows,
  formatShipmentPaymentRemarks,
} from "./shipment-ap";
import type { Shipment } from "@/types/database";

function inboundedShipment(): Shipment {
  return {
    id: "ship",
    shipment_number: "SHP-1",
    shipment_type: "sea",
    status: "closed",
    estimated_departure_date: "2026-10-01",
    transit_days: 14,
    delay_days: 0,
    expected_delivery_date: "2026-10-15",
    notes: null,
    purchase_orders: [
      {
        id: "po",
        po_number: "PO-IN",
        supplier_name: "Maker",
        items: [
          {
            id: "item-1",
            po_line_id: "line-1",
            po_id: "po",
            po_number: "PO-IN",
            sku_id: "sku-1",
            sku_code: "FCR-SERUM",
            sku_name: "Serum",
            quantity: 5000,
            qty_ordered: 5000,
            qty_previously_received: 5000,
          },
          {
            id: "item-2",
            po_line_id: "line-2",
            po_id: "po",
            po_number: "PO-IN",
            sku_id: "sku-2",
            sku_code: "FCR-JAR",
            sku_name: null,
            quantity: 1000,
            qty_ordered: 1000,
            qty_previously_received: 1000,
          },
        ],
      },
    ],
  };
}

test("a shipped and inbounded PO keeps SKU and quantity on shipment AP remarks", () => {
  const shipment = inboundedShipment();
  const shipping = formatShipmentPaymentRemarks(shipment, "shipping");
  const tax = formatShipmentPaymentRemarks(shipment, "tax");

  assert.match(shipping, /Serum \(FCR-SERUM, 5,000 pcs\)/);
  assert.match(shipping, /FCR-JAR \(1,000 pcs\)/);
  assert.match(tax, /Serum \(FCR-SERUM, 5,000 pcs\)/);
  assert.match(tax, /FCR-JAR \(1,000 pcs\)/);
  assert.doesNotMatch(shipping, /for 0/);
});

test("tax payment lines keep the SKU quantities after inbound", () => {
  const shipment = inboundedShipment();
  const goods = "Serum (FCR-SERUM, 5,000 pcs), FCR-JAR (1,000 pcs)";
  const rows = defaultTaxApPaymentPlanRows("PO-IN", goods);

  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.match(row.remarks, /PO-IN/);
    assert.match(row.remarks, /Serum \(FCR-SERUM, 5,000 pcs\)/);
    assert.match(row.remarks, /FCR-JAR \(1,000 pcs\)/);
  }

  const filed = appendShipmentGoods("411212 - PPN Import, PO-IN", shipment, " - ");
  assert.match(filed, /PPN Import, PO-IN - Serum \(FCR-SERUM, 5,000 pcs\)/);
  assert.equal(appendShipmentGoods(filed, shipment, " - "), filed);
});
