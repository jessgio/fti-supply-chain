import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";
import { buildPoSearchRows, purchaseOrdersForStatusTab } from "./po-search-results";

function line(
  sku: string,
  qty: number,
  unitCost: number,
  patch: Partial<PurchaseOrderLine> = {},
): PurchaseOrderLine {
  return {
    id: sku,
    po_id: "po",
    sku_id: sku,
    sku_code: sku,
    sku_name: patch.sku_name ?? null,
    qty_ordered: qty,
    qty_received: 0,
    is_closed: false,
    unit_cost: unitCost,
    ...patch,
  };
}

function po(patch: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: patch.id ?? "po-1",
    po_number: patch.po_number ?? "PO-1",
    supplier_id: null,
    supplier_name: "Acme",
    status: "ordered",
    order_date: "2026-01-15",
    expected_date: null,
    down_payment_pct: 30,
    discount_amount: 0,
    tax_pct: 11,
    pph_pct: 0,
    other_charges: 5000,
    currency: "IDR",
    notes: null,
    pd_project_id: null,
    lines: [line("FG-1", 10, 1000, { sku_name: "Serum" })],
    ...patch,
  };
}

test("active tab search keeps received and cancelled purchase orders out", () => {
  const orders = [
    po({ id: "active", status: "in_transit" }),
    po({ id: "done", status: "received" }),
    po({ id: "cancelled", status: "cancelled" }),
    po({ id: "planned", status: "planned" }),
  ];

  assert.deepEqual(
    purchaseOrdersForStatusTab(orders, "").map((order) => order.id),
    ["active", "planned"],
  );
  assert.deepEqual(
    purchaseOrdersForStatusTab(orders, "received").map((order) => order.id),
    ["done"],
  );
});

test("search rows keep commercial fields and packaging types for every status", () => {
  const rows = buildPoSearchRows(
    [
      po({
        id: "hist",
        status: "received",
        po_number: "PO-OLD",
        down_payment_pct: 40,
        other_charges: 2500,
        last_inbound_date: "2026-03-02",
        lines: [
          line("UB-1", 100, 1500, {
            sku_id: "ub",
            sku_code: "FCR-PRF-PLUMPINGCREAM-15ML-UB",
            sku_name: "Unit box",
            qty_received: 100,
          }),
          line("JAR-1", 100, 4000, {
            sku_id: "jar",
            sku_code: "FCR-PRF-PLUMPINGCREAM-15ML-JAR",
            sku_name: "Jar",
            qty_received: 100,
          }),
        ],
      }),
    ],
    [
      { id: "ub", is_packaging: true, is_extract: false },
      { id: "jar", is_packaging: true, is_extract: false },
    ],
    "plumping",
  );

  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.status, "received");
  assert.equal(row.downPaymentPct, 40);
  assert.equal(row.balancePct, 60);
  assert.equal(row.otherCosts, 2500);
  assert.equal(row.vatPct, 11);
  assert.ok(row.vat > 0);
  assert.equal(row.lastInboundDate, "2026-03-02");
  assert.equal(row.unitPriceVaries, true);
  assert.deepEqual(row.productTypes, [
    "secondary_packaging",
    "primary_packaging",
  ]);
  assert.equal(row.qty, 200);
  assert.equal(row.lines.every((item) => item.matched), true);
});
