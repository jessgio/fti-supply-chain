import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";
import { buildPaymentPlanRows } from "./ap-form";

function line(unitCost: number): PurchaseOrderLine {
  return {
    id: "line",
    po_id: "po",
    sku_id: "sku",
    sku_name: "Serum",
    qty_ordered: 1,
    qty_received: 0,
    is_closed: false,
    unit_cost: unitCost,
  };
}

test("AP payment plan states the exact 50% down payment", () => {
  const po = {
    id: "po",
    po_number: "PO-1",
    supplier_id: null,
    status: "ordered",
    order_date: "2026-10-01",
    expected_date: "2026-11-01",
    down_payment_pct: 50,
    discount_amount: 0,
    tax_pct: 0,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    notes: null,
    pd_project_id: null,
    lines: [line(101)],
    payments: [],
  } as PurchaseOrder;

  const rows = buildPaymentPlanRows(po, "both");
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.amount, 50.5);
  assert.equal(rows[1]?.amount, 50.5);
  assert.equal(
    rows.reduce((sum, row) => sum + row.amount, 0),
    101,
  );
});
