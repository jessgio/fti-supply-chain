import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrderLine } from "@/types/database";
import { computePoInvoiceTotals } from "./po-totals";

function line(qty: number, unitCost: number): PurchaseOrderLine {
  return {
    id: "line",
    po_id: "po",
    sku_id: "sku",
    qty_ordered: qty,
    qty_received: 0,
    is_closed: false,
    unit_cost: unitCost,
  };
}

test("a 50% down payment keeps the half unit instead of rounding up", () => {
  const totals = computePoInvoiceTotals({
    lines: [line(1, 101)],
    discount_amount: 0,
    tax_pct: 0,
    pph_pct: 0,
    other_charges: 0,
    down_payment_pct: 50,
  });

  assert.equal(totals.invoiceTotal, 101);
  assert.equal(totals.downPayment, 50.5);
  assert.equal(totals.finalPayment, 50.5);
  assert.equal(totals.downPayment + totals.finalPayment, totals.invoiceTotal);
});

test("percentage splits keep invoice decimals past two places", () => {
  const totals = computePoInvoiceTotals({
    lines: [line(1, 10.33333)],
    discount_amount: 0,
    tax_pct: 0,
    pph_pct: 0,
    other_charges: 0,
    down_payment_pct: 50,
  });

  assert.equal(totals.invoiceTotal, 10.33333);
  assert.equal(totals.downPayment, 5.166665);
  assert.equal(totals.finalPayment, 5.166665);
  assert.equal(totals.downPayment + totals.finalPayment, totals.invoiceTotal);
});

test("an even percentage split is unchanged", () => {
  const totals = computePoInvoiceTotals({
    lines: [line(2, 100)],
    discount_amount: 0,
    tax_pct: 0,
    pph_pct: 0,
    other_charges: 0,
    down_payment_pct: 30,
  });

  assert.equal(totals.downPayment, 60);
  assert.equal(totals.finalPayment, 140);
});
