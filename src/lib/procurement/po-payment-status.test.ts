import assert from "node:assert/strict";
import test from "node:test";
import { derivePoStatus } from "@/lib/procurement/po-lifecycle-rules";
import { computePoPaymentSummary } from "@/lib/procurement/po-payment-status";
import type { PoPayment, PurchaseOrder, PurchaseOrderLine } from "@/types/database";

function line(): PurchaseOrderLine {
  return {
    id: "line",
    po_id: "po",
    sku_id: "sku",
    sku_name: "Serum",
    qty_ordered: 1,
    qty_received: 0,
    is_closed: false,
    unit_cost: 100,
  };
}

function payment(
  amount: number,
  purpose: string,
  taxWithholding = 0,
): PoPayment {
  return {
    id: purpose,
    po_id: "po",
    payment_date: "2026-10-02",
    amount,
    payment_request_number: "PR-1",
    currency: "IDR",
    exchange_rate: null,
    purpose,
    tax_withholding: taxWithholding,
  };
}

function po(
  payments: PoPayment[],
  overrides: {
    down_payment_pct?: number;
    payment_terms?: PurchaseOrder["payment_terms"];
    unitCost?: number;
  } = {},
): PurchaseOrder {
  return {
    id: "po",
    po_number: "PO-1",
    supplier_id: null,
    status: "ordered",
    order_date: "2026-10-01",
    expected_date: "2026-12-01",
    down_payment_pct: overrides.down_payment_pct ?? 30,
    payment_terms: overrides.payment_terms ?? [
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
    lines: [{ ...line(), unit_cost: overrides.unitCost ?? 100 }],
    payments,
  } as PurchaseOrder;
}

test("a fully paid PO does not leave the down payment unpaid", () => {
  const summary = computePoPaymentSummary(po([payment(100, "Final payment")]));

  assert.equal(summary.overallStatus, "paid");
  assert.equal(summary.downStatus, "paid");
  assert.equal(summary.installments[0]?.paid, 30);
  assert.equal(summary.installments[0]?.expected, 30);
  assert.equal(summary.balanceStatus, "paid");
  assert.equal(summary.installments[1]?.paid, 70);
  assert.equal(
    (summary.installments[0]?.paid ?? 0) + (summary.installments[1]?.paid ?? 0),
    100,
  );
});

test("paying a 50% schedule in one final payment settles both installments", () => {
  const summary = computePoPaymentSummary(
    po([payment(464_733_468, "Final payment")], {
      down_payment_pct: 50,
      payment_terms: [
        { label: "Down payment", pct: 50 },
        { label: "Final payment", pct: 50 },
      ],
      unitCost: 464_733_468,
    }),
  );

  assert.equal(summary.expectedTotal, 464_733_468);
  assert.equal(summary.overallStatus, "paid");
  assert.equal(summary.installments[0]?.expected, 232_366_734);
  assert.equal(summary.installments[0]?.paid, 232_366_734);
  assert.equal(summary.downStatus, "paid");
  assert.equal(summary.installments[1]?.paid, 232_366_734);
  assert.equal(summary.balanceStatus, "paid");
});

test("a full payment that matches no installment still covers the down payment", () => {
  const summary = computePoPaymentSummary(po([payment(100, "Full payment")]));

  assert.equal(summary.overallStatus, "paid");
  assert.equal(summary.downStatus, "paid");
  assert.equal(summary.balanceStatus, "paid");
  assert.equal(summary.installments[0]?.paid, 30);
  assert.equal(summary.installments[1]?.paid, 70);
});

test("a short final payment still leaves the down payment unpaid", () => {
  const summary = computePoPaymentSummary(po([payment(70, "Final payment")]));

  assert.equal(summary.overallStatus, "underpaid");
  assert.equal(summary.downStatus, "underpaid");
  assert.equal(summary.installments[0]?.paid, 0);
  assert.equal(summary.balanceStatus, "paid");
});

test("money above the invoice stays overpaid on the final payment", () => {
  const summary = computePoPaymentSummary(po([payment(120, "Final payment")]));

  assert.equal(summary.overallStatus, "overpaid");
  assert.equal(summary.downStatus, "paid");
  assert.equal(summary.installments[0]?.paid, 30);
  assert.equal(summary.balanceStatus, "overpaid");
  assert.equal(summary.installments[1]?.paid, 90);
});

test("a supplier payment plus tax withholding settles the full invoice", () => {
  const summary = computePoPaymentSummary(
    po([payment(98_000_000, "Final payment", 2_000_000)], {
      unitCost: 100_000_000,
    }),
  );

  assert.equal(summary.expectedTotal, 100_000_000);
  assert.equal(summary.paidToSupplier, 98_000_000);
  assert.equal(summary.taxWithholding, 2_000_000);
  assert.equal(summary.paidTotalPoCurrency, 100_000_000);
  assert.equal(summary.overallStatus, "paid");
  assert.equal(summary.downStatus, "paid");
  assert.equal(summary.balanceStatus, "paid");
  assert.equal(summary.totalIdr, 100_000_000);
});

test("tax withholding that does not make payments match the invoice is flagged", () => {
  const short = computePoPaymentSummary(
    po([payment(98_000_000, "Final payment", 1_000_000)], {
      unitCost: 100_000_000,
    }),
  );
  assert.equal(short.paidTotalPoCurrency, 99_000_000);
  assert.equal(short.overallStatus, "underpaid");

  const over = computePoPaymentSummary(
    po([payment(98_000_000, "Final payment", 3_000_000)], {
      unitCost: 100_000_000,
    }),
  );
  assert.equal(over.paidTotalPoCurrency, 101_000_000);
  assert.equal(over.overallStatus, "overpaid");
});

test("withholding on each installment still adds up to the invoice", () => {
  const summary = computePoPaymentSummary(
    po(
      [
        payment(29_400_000, "Down payment", 600_000),
        payment(68_600_000, "Final payment", 1_400_000),
      ],
      { unitCost: 100_000_000 },
    ),
  );

  assert.equal(summary.paidToSupplier, 98_000_000);
  assert.equal(summary.taxWithholding, 2_000_000);
  assert.equal(summary.overallStatus, "paid");
  assert.equal(summary.installments[0]?.paid, 30_000_000);
  assert.equal(summary.installments[1]?.paid, 70_000_000);
});

test("logged down and final payments keep their own amounts", () => {
  const summary = computePoPaymentSummary(
    po([payment(30, "Down payment"), payment(70, "Final payment")]),
  );

  assert.equal(summary.overallStatus, "paid");
  assert.equal(summary.downStatus, "paid");
  assert.equal(summary.balanceStatus, "paid");
  assert.equal(summary.installments[0]?.paid, 30);
  assert.equal(summary.installments[1]?.paid, 70);
});

test("a settled invoice is not held in ordered status for a missing down payment", () => {
  const input = {
    status: "ordered" as const,
    order_date: "2026-10-01",
    expected_date: "2026-12-01",
    created_at: "2026-10-01T00:00:00.000Z",
    down_payment_pct: 30,
    discount_amount: 0,
    tax_pct: 0,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    lines: [
      {
        qty_ordered: 1,
        qty_received: 0,
        unit_cost: 100,
        is_closed: false,
      },
    ],
    payments: [
      {
        payment_date: "2026-10-02",
        purpose: "Final payment",
        amount: 100,
        currency: "IDR",
      },
    ],
    shipments: [],
  };
  const today = new Date("2026-11-01T00:00:00");

  assert.equal(derivePoStatus(input, today), "in_production");
  assert.equal(
    derivePoStatus(
      {
        ...input,
        payments: [
          {
            payment_date: "2026-10-02",
            purpose: "Final payment",
            amount: 98,
            currency: "IDR",
            tax_withholding: 2,
          },
        ],
      },
      today,
    ),
    "in_production",
  );
  assert.equal(
    derivePoStatus(
      {
        ...input,
        payments: [
          {
            payment_date: "2026-10-02",
            purpose: "Final payment",
            amount: 70,
            currency: "IDR",
          },
        ],
      },
      today,
    ),
    "ordered",
  );
});
