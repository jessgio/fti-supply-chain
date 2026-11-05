import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPaymentPlanRows } from "@/lib/lark/ap-form";
import {
  LarkApSubmissionPanel,
  PaymentPlanLineList,
} from "./lark-ap-submission-panel";
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

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po",
    po_number: "PO-1",
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
    lark_instance_code: null,
    lark_serial_number: null,
    lark_approval_status: null,
    lark_submitted_at: null,
    lark_status_synced_at: null,
    lark_submissions: [],
    ...overrides,
  } as PurchaseOrder;
}

test("a PO with an AP form can start another one", () => {
  const html = renderToStaticMarkup(
    <LarkApSubmissionPanel
      po={po({
        lark_instance_code: "inst-dp",
        lark_serial_number: "202610280001",
        lark_approval_status: "PENDING",
        lark_submitted_at: "2026-10-27T02:00:00.000Z",
        lark_submissions: [
          {
            id: "sub-dp",
            lark_instance_code: "inst-dp",
            lark_serial_number: "202610280001",
            lark_approval_status: "PENDING",
            payment_scope: "down_payment",
            submitted_at: "2026-10-27T02:00:00.000Z",
          },
        ],
      })}
    />,
  );

  assert.match(html, /Submit another/);
  assert.match(html, /Link existing AP Form/);
  assert.match(html, /202610280001/);
  assert.doesNotMatch(html, /Submit new AP Form/);
});

test("multiple payments can each be removed from the AP form", () => {
  const rows = buildPaymentPlanRows(po(), "both");
  assert.equal(rows.length, 3);

  const html = renderToStaticMarkup(
    <PaymentPlanLineList
      rows={rows.map((row, index) => ({ ...row, draftKey: `row-${index}` }))}
      onChange={() => {}}
      onRemove={() => {}}
    />,
  );

  assert.equal(html.match(/aria-label="Remove line /g)?.length, 3);
  assert.match(html, /<table/);
  assert.match(html, /Search/);
  assert.match(html, /All lines/);
  assert.match(html, /aria-sort="none"/);
  assert.match(html, /Progress payment 40%/);
  assert.match(html, /Before shipment 30%/);
});

test("a single payment line stays on the AP form", () => {
  const rows = buildPaymentPlanRows(
    po({
      down_payment_pct: 0,
      payment_terms: [{ label: "Full payment", pct: 100 }],
    }),
    "both",
  );
  assert.equal(rows.length, 1);

  const html = renderToStaticMarkup(
    <PaymentPlanLineList
      rows={rows.map((row, index) => ({ ...row, draftKey: `row-${index}` }))}
      onChange={() => {}}
      onRemove={() => {}}
    />,
  );

  assert.doesNotMatch(html, /Remove line/);
  assert.match(html, /<table/);
  assert.match(html, /Full payment/);
});

test("a bad Lark timestamp does not crash the submitted panel", () => {
  const html = renderToStaticMarkup(
    <LarkApSubmissionPanel
      po={po({
        lark_instance_code: "inst-dp",
        lark_submitted_at: "not-a-date",
        lark_status_synced_at: "also-bad",
        lark_submissions: [
          {
            id: "sub-dp",
            lark_instance_code: "inst-dp",
            lark_serial_number: null,
            lark_approval_status: "PENDING",
            payment_scope: "down_payment",
            submitted_at: "not-a-date",
          },
        ],
      })}
    />,
  );
  assert.match(html, /Submit another/);
});
