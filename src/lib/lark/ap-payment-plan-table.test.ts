import assert from "node:assert/strict";
import test from "node:test";
import { buildPaymentPlanRows } from "./ap-form";
import { visiblePlanRowIndexes } from "./ap-payment-plan-table";
import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";

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

const po = {
  id: "po",
  po_number: "PO-2",
  supplier_id: null,
  status: "ordered",
  order_date: "2026-10-01",
  expected_date: "2026-11-01",
  down_payment_pct: 30,
  payment_terms: [
    { label: "Down payment", pct: 30 },
    { label: "Progress payment", pct: 40 },
    { label: "Before shipment", pct: 30 },
  ],
  discount_amount: 0,
  tax_pct: 0,
  pph_pct: 0,
  other_charges: 0,
  currency: "IDR",
  notes: null,
  pd_project_id: null,
  lines: [line(100)],
  payments: [],
} as PurchaseOrder;

test("payment lines can be searched, filtered, and sorted without dropping hidden rows", () => {
  const rows = buildPaymentPlanRows(po, "both");
  assert.equal(rows.length, 3);

  assert.deepEqual(
    visiblePlanRowIndexes(rows, {
      query: "",
      label: "",
      sortKey: null,
      sortDir: "asc",
    }),
    [0, 1, 2],
  );

  assert.deepEqual(
    visiblePlanRowIndexes(rows, {
      query: "progress",
      label: "",
      sortKey: null,
      sortDir: "asc",
    }),
    [1],
  );

  assert.deepEqual(
    visiblePlanRowIndexes(rows, {
      query: "",
      label: "Before shipment 30%",
      sortKey: null,
      sortDir: "asc",
    }),
    [2],
  );

  assert.deepEqual(
    visiblePlanRowIndexes(rows, {
      query: "",
      label: "",
      sortKey: "amount",
      sortDir: "desc",
    }),
    [1, 0, 2],
  );
});
