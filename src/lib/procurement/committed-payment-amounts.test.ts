import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommittedPatchFromPayment,
  downPaymentLabel,
  formatPaymentPct,
  resolvePaymentSchedule,
} from "./committed-payment-amounts";
import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";

/** PO FTI-10-06052026 lines from the invoice that showed a stale 52.7% split. */
function cosmaxLines(): PurchaseOrderLine[] {
  return [
    line(7011, 10000),
    line(2909, 22500),
    line(7039, 10000),
    line(7025, 10000),
  ];
}

function line(qty: number, unitCost: number): PurchaseOrderLine {
  return {
    id: "line",
    po_id: "po",
    sku_id: "sku",
    qty_ordered: qty,
    qty_received: qty,
    unit_cost: unitCost,
    is_closed: false,
  };
}

function cosmaxPo(
  patch: Partial<PurchaseOrder> = {},
): Pick<
  PurchaseOrder,
  | "lines"
  | "discount_amount"
  | "tax_pct"
  | "pph_pct"
  | "other_charges"
  | "down_payment_pct"
  | "status"
> &
  Partial<PurchaseOrder> {
  return {
    status: "received",
    lines: cosmaxLines(),
    discount_amount: 0,
    tax_pct: 11,
    pph_pct: 0,
    other_charges: 0,
    down_payment_pct: 0,
    committed_invoice_total: 322960050,
    committed_down_payment: 161480025,
    committed_balance: 161480025,
    payment_amounts_committed_at: "2026-10-04T05:19:46.540Z",
    ...patch,
  };
}

test("unpaid PO follows the down payment percentage, not a stale freeze", () => {
  const atZero = resolvePaymentSchedule({
    ...cosmaxPo(),
    payments: [],
  });
  assert.equal(atZero.invoiceTotal, 306584775);
  assert.equal(atZero.downPayment, 0);
  assert.equal(atZero.balance, 306584775);
  assert.equal(atZero.isCommitted, false);
  assert.equal(downPaymentLabel(atZero.downPaymentPct), "Down payment (0%)");

  const atFifty = resolvePaymentSchedule({
    ...cosmaxPo({ down_payment_pct: 50 }),
    payments: [],
  });
  assert.equal(atFifty.downPayment, 153292387.5);
  assert.equal(atFifty.balance, 153292387.5);
  assert.equal(atFifty.downPayment + atFifty.balance, atFifty.invoiceTotal);
  assert.equal(downPaymentLabel(atFifty.downPaymentPct), "Down payment (50%)");
  assert.equal(formatPaymentPct(atFifty.finalPaymentPct), "50");
});

test("a logged payment keeps its amount and shows that share of the current total", () => {
  const schedule = resolvePaymentSchedule({
    ...cosmaxPo({ down_payment_pct: 0 }),
    payments: [
      {
        purpose: "Down payment",
        amount: 161480025,
        currency: "IDR",
      },
    ],
  });
  assert.equal(schedule.isCommitted, true);
  assert.equal(schedule.downPayment, 161480025);
  assert.equal(schedule.balance, 306584775 - 161480025);
  assert.equal(formatPaymentPct(schedule.downPaymentPct), "52.7");
  assert.equal(formatPaymentPct(schedule.finalPaymentPct), "47.3");
});

test("omitted payments still honor a stored freeze for callers that did not load them", () => {
  const schedule = resolvePaymentSchedule(cosmaxPo());
  assert.equal(schedule.isCommitted, true);
  assert.equal(schedule.downPayment, 161480025);
  assert.equal(formatPaymentPct(schedule.downPaymentPct), "52.7");
});

test("the first logged payment replaces a stale unpaid freeze", () => {
  const patch = buildCommittedPatchFromPayment(
    cosmaxPo({ down_payment_pct: 50 }),
    "Down payment",
    1000,
    "2026-10-13T00:00:00.000Z",
    { replaceExisting: true },
  );
  assert.ok(patch);
  assert.equal(patch.committed_down_payment, 1000);
  assert.equal(patch.payment_amounts_committed_at, "2026-10-13T00:00:00.000Z");
});

test("three payment terms show on the invoice and freeze when one is logged", () => {
  const terms = [
    { label: "Down payment", pct: 30 },
    { label: "Progress payment", pct: 40 },
    { label: "Before shipment", pct: 30 },
  ];
  const unpaid = resolvePaymentSchedule({
    ...cosmaxPo({ down_payment_pct: 30, payment_terms: terms }),
    payments: [],
    committed_down_payment: null,
    committed_balance: null,
    committed_invoice_total: null,
    payment_amounts_committed_at: null,
  });
  assert.equal(unpaid.terms.length, 3);
  assert.equal(
    unpaid.terms.reduce((sum, term) => sum + term.amount, 0),
    unpaid.invoiceTotal,
  );
  assert.equal(unpaid.terms[1]?.label, "Progress payment");

  const patch = buildCommittedPatchFromPayment(
    cosmaxPo({ down_payment_pct: 30, payment_terms: terms }),
    "Progress payment",
    1000,
    "2026-10-13T00:00:00.000Z",
    { replaceExisting: true },
  );
  assert.ok(patch);
  assert.equal(patch.committed_payment_terms[1]?.amount, 1000);

  const committed = resolvePaymentSchedule({
    ...cosmaxPo({
      down_payment_pct: 30,
      payment_terms: terms,
      committed_payment_terms: patch.committed_payment_terms,
      committed_down_payment: patch.committed_down_payment,
      committed_balance: patch.committed_balance,
      committed_invoice_total: patch.committed_invoice_total,
      payment_amounts_committed_at: patch.payment_amounts_committed_at,
    }),
    payments: [{ purpose: "Progress payment", amount: 1000, currency: "IDR" }],
  });
  assert.equal(committed.terms[1]?.amount, 1000);
  assert.equal(
    committed.terms.reduce((sum, term) => sum + term.amount, 0),
    committed.invoiceTotal,
  );
});
