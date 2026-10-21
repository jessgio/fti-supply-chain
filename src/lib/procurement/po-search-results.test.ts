import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrder, PurchaseOrderLine } from "@/types/database";
import {
  apFormsFromPurchaseOrder,
  buildPoSearchRows,
  EMPTY_PO_SEARCH_FILTERS,
  filterPoSearchRows,
  purchaseOrdersForStatusTab,
  sortPoSearchRows,
} from "./po-search-results";
import type { PoPayment } from "@/types/database";

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
  assert.equal(row.paymentStatus, null);
});

function payment(amount: number): PoPayment {
  return {
    id: `pay-${amount}`,
    po_id: "po",
    payment_date: "2026-02-01",
    amount,
    payment_request_number: "PR",
    currency: "IDR",
    exchange_rate: null,
    purpose: "Balance payment",
  };
}

test("search filters combine month, dates, supplier, type, status, and payment", () => {
  const rows = buildPoSearchRows(
    [
      po({
        id: "jan-paid",
        po_number: "PO-JAN",
        supplier_name: "Acme",
        status: "received",
        order_date: "2026-01-20",
        other_charges: 0,
        payments: [payment(11100)],
        lines: [line("FG", 10, 1000, { sku_id: "fg", sku_name: "Serum" })],
      }),
      po({
        id: "mar-open",
        po_number: "PO-MAR",
        supplier_name: "Beta",
        status: "ordered",
        order_date: "2026-03-02",
        other_charges: 0,
        payments: [],
        lines: [
          line("UB", 4, 100, {
            sku_id: "ub",
            sku_code: "FCR-PRF-PLUMPINGCREAM-15ML-UB",
            sku_name: "Unit box",
          }),
        ],
      }),
    ],
    [
      { id: "fg", is_packaging: false, is_extract: false },
      { id: "ub", is_packaging: true, is_extract: false },
    ],
    "po",
  );

  assert.equal(rows.find((row) => row.id === "jan-paid")?.fullyPaid, true);
  assert.equal(rows.find((row) => row.id === "mar-open")?.fullyPaid, false);

  assert.deepEqual(
    filterPoSearchRows(rows, { ...EMPTY_PO_SEARCH_FILTERS, month: "2026-03" }).map(
      (row) => row.id,
    ),
    ["mar-open"],
  );
  assert.deepEqual(
    filterPoSearchRows(rows, {
      ...EMPTY_PO_SEARCH_FILTERS,
      from: "2026-01-01",
      to: "2026-01-31",
      supplier: "Acme",
      status: "received",
      paid: "paid",
    }).map((row) => row.id),
    ["jan-paid"],
  );
  assert.deepEqual(
    filterPoSearchRows(rows, {
      ...EMPTY_PO_SEARCH_FILTERS,
      productType: "secondary_packaging",
      paid: "unpaid",
    }).map((row) => row.id),
    ["mar-open"],
  );
});

test("search rows sort by total and keep missing dates last", () => {
  const rows = buildPoSearchRows(
    [
      po({ id: "low", po_number: "PO-B", order_date: null, other_charges: 0 }),
      po({
        id: "high",
        po_number: "PO-A",
        order_date: "2026-05-01",
        other_charges: 0,
        lines: [line("FG", 10, 5000)],
      }),
    ],
    [],
    "po",
  );

  assert.deepEqual(
    sortPoSearchRows(rows, "total", "desc").map((row) => row.id),
    ["high", "low"],
  );
  assert.deepEqual(
    sortPoSearchRows(rows, "orderDate", "asc").map((row) => row.id),
    ["high", "low"],
  );
});

test("search rows list every AP form and fall back to the PO badge", () => {
  const rows = buildPoSearchRows(
    [
      po({
        id: "split",
        po_number: "PO-SPLIT",
        lark_submissions: [
          {
            id: "older",
            lark_instance_code: "inst-old",
            lark_serial_number: "202401010001",
            lark_approval_status: "APPROVED",
            payment_scope: "down_payment",
            submitted_at: "2026-01-02T00:00:00.000Z",
          },
          {
            id: "newer",
            lark_instance_code: "inst-new",
            lark_serial_number: "202402020002",
            lark_approval_status: "PENDING",
            payment_scope: "balance",
            submitted_at: "2026-02-02T00:00:00.000Z",
          },
        ],
      }),
      po({
        id: "legacy",
        po_number: "PO-LEGACY",
        lark_instance_code: "inst-legacy",
        lark_serial_number: "202403030003",
        lark_approval_status: "APPROVED",
      }),
      po({ id: "none", po_number: "PO-NONE", lark_submissions: [] }),
    ],
    [],
    "po",
  );

  const split = rows.find((row) => row.id === "split");
  assert.deepEqual(
    split?.apForms.map((form) => form.serialNumber),
    ["202402020002", "202401010001"],
  );
  assert.equal(
    apFormsFromPurchaseOrder(
      po({
        lark_instance_code: "inst-legacy",
        lark_serial_number: "202403030003",
        lark_approval_status: "APPROVED",
      }),
    )[0]?.serialNumber,
    "202403030003",
  );
  assert.deepEqual(rows.find((row) => row.id === "none")?.apForms, []);
  assert.equal(rows.find((row) => row.id === "legacy")?.apForms.length, 1);

  assert.deepEqual(
    sortPoSearchRows(rows, "apForm", "asc").map((row) => row.id),
    ["split", "legacy", "none"],
  );
});
