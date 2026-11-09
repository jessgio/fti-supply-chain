import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PoPaymentsSection } from "./po-payments-section";
import type { PoPayment, PurchaseOrder, PurchaseOrderLine } from "@/types/database";

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

function payment(amount: number, taxWithholding: number): PoPayment {
  return {
    id: "pay-1",
    po_id: "po",
    payment_date: "2026-10-02",
    amount,
    payment_request_number: "PR-1",
    currency: "IDR",
    exchange_rate: null,
    purpose: "Final payment",
    tax_withholding: taxWithholding,
  };
}

function po(amount: number, taxWithholding: number): PurchaseOrder {
  return {
    id: "po",
    po_number: "PO-1",
    supplier_id: null,
    status: "ordered",
    order_date: "2026-10-01",
    expected_date: "2026-12-01",
    down_payment_pct: 30,
    payment_terms: [
      { label: "Down payment", pct: 30 },
      { label: "Final payment", pct: 70 },
    ],
    discount_amount: 0,
    tax_pct: 0,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    notes: null,
    pd_project_id: null,
    lines: [line(100_000_000)],
    payments: [payment(amount, taxWithholding)],
  } as PurchaseOrder;
}

function render(amount: number, taxWithholding: number): string {
  return renderToStaticMarkup(
    <PoPaymentsSection
      po={po(amount, taxWithholding)}
      busy={false}
      setBusy={() => {}}
      setError={() => {}}
      onUpdated={() => {}}
    />,
  );
}

test("a 98 million payment plus 2 million withholding shows the invoice as fully paid", () => {
  const html = render(98_000_000, 2_000_000);

  assert.match(html, /Withholding/);
  assert.match(html, /Fully paid/);
  assert.match(html, /Paid to supplier/);
  assert.match(html, /paid to the government/);
  assert.match(html, /match the invoice total/);
  assert.match(html, /invoice is fully paid/);
  assert.doesNotMatch(html, /does not match/);
});

test("a withholding that leaves a gap is flagged against the invoice total", () => {
  const html = render(98_000_000, 1_000_000);

  assert.match(html, /Underpaid/);
  assert.match(html, /short of the invoice total/);
});
