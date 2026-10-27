import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PoSearchResultsTable } from "./po-search-results-table";
import type { PurchaseOrder } from "@/types/database";

function purchaseOrder(patch: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-1",
    supplier_id: null,
    supplier_name: "Acme",
    status: "ordered",
    order_date: "2026-01-15",
    expected_date: null,
    down_payment_pct: 30,
    discount_amount: 0,
    tax_pct: 11,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    notes: null,
    pd_project_id: null,
    lines: [],
    ...patch,
  };
}

test("procurement search shows each AP form and marks orders with none", () => {
  const html = renderToStaticMarkup(
    <PoSearchResultsTable
      query="PO"
      skus={[]}
      purchaseOrders={[
        purchaseOrder({
          id: "split",
          po_number: "PO-SPLIT",
          lark_submissions: [
            {
              id: "dp",
              lark_instance_code: "inst-dp",
              lark_serial_number: "202401010001",
              lark_approval_status: "APPROVED",
              payment_scope: "down_payment",
              submitted_at: "2026-01-02T00:00:00.000Z",
            },
            {
              id: "bal",
              lark_instance_code: "inst-bal",
              lark_serial_number: "202402020002",
              lark_approval_status: "PENDING",
              payment_scope: "balance",
              submitted_at: "2026-02-02T00:00:00.000Z",
            },
          ],
        }),
        purchaseOrder({
          id: "open",
          po_number: "PO-OPEN",
          lark_submissions: [],
        }),
      ]}
    />,
  );

  const theadStart = html.indexOf("<thead");
  const tbodyStart = html.indexOf("<tbody");
  const header = html.slice(theadStart, tbodyStart);
  const poHeader = header.indexOf("PO");
  const apHeader = header.indexOf("AP Form");
  const dateHeader = header.indexOf("Order date");
  assert.ok(poHeader >= 0 && apHeader > poHeader && apHeader < dateHeader);

  assert.match(html, /AP 202401010001/);
  assert.match(html, /Approved/);
  assert.match(html, /Down payment/);
  assert.match(html, /AP 202402020002/);
  assert.match(html, /Under Review/);
  assert.match(html, /Balance/);
  assert.match(html, /Not submitted/);
});

test("procurement search lists every installment when a PO has more than two", () => {
  const html = renderToStaticMarkup(
    <PoSearchResultsTable
      query="PO"
      skus={[]}
      purchaseOrders={[
        purchaseOrder({
          payment_terms: [
            { label: "Down payment", pct: 30 },
            { label: "Progress payment", pct: 40 },
            { label: "Before shipment", pct: 30 },
          ],
        }),
      ]}
    />,
  );

  assert.match(html, /30% Down payment/);
  assert.match(html, /40% Progress payment/);
  assert.match(html, /30% Before shipment/);
});
