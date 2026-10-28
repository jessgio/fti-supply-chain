import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";
import {
  AP_FORM_WIDGETS,
  buildApFormControls,
  buildPaymentPlanRows,
  DEFAULT_AP_BRAND,
  DEFAULT_AP_EXPENSE_CATEGORY,
  suggestNextApPaymentScope,
} from "./ap-form";

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

test("AP payment plan lists every installment when a supplier has more than two", () => {
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

  const rows = buildPaymentPlanRows(po, "both");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.amount),
    [30, 40, 30],
  );
  assert.match(rows[1]?.remarks ?? "", /Progress payment 40%/);

  const later = buildPaymentPlanRows(po, "balance");
  assert.equal(later.length, 2);
  assert.equal(later[0]?.amount, 40);
});

test("remaining installments that share a due date are distinct Lark dates", () => {
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

  const planRows = buildPaymentPlanRows(po, "balance");
  assert.equal(planRows.length, 2);
  assert.equal(planRows[0]?.dateYmd, planRows[1]?.dateYmd);

  const controls = buildApFormControls({
    po,
    expenseCategory: DEFAULT_AP_EXPENSE_CATEGORY,
    brand: DEFAULT_AP_BRAND,
    planRows,
  });
  const fieldList = controls.find(
    (control) => control.id === AP_FORM_WIDGETS.paymentPlan,
  );
  const rows = fieldList?.value as Array<Array<{ id: string; value: string }>>;
  const dates = rows.map(
    (row) => row.find((cell) => cell.id === AP_FORM_WIDGETS.datePlanned)?.value,
  );
  assert.equal(new Set(dates).size, dates.length);
  assert.ok(dates.every((date) => date?.startsWith("2026-11-01T00:00:")));
  assert.notEqual(dates[0], dates[1]);
});

test("an existing AP form still suggests a scope for the next one", () => {
  assert.equal(
    suggestNextApPaymentScope(true, ["down_payment"]),
    "balance",
  );
  assert.equal(suggestNextApPaymentScope(true, ["both"]), "balance");
  assert.equal(suggestNextApPaymentScope(false, ["both"]), "both");
});
