import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnpaidPoRows,
  defaultUnpaidSortDir,
  filterUnpaidPoRows,
  latestInboundReceiveDate,
  sortUnpaidPoRows,
  type UnpaidPoRow,
} from "./unpaid-pos";
import type { PoPayment, PurchaseOrder, PurchaseOrderLine } from "@/types/database";

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
    qty_received: patch.qty_received ?? 0,
    is_closed: patch.is_closed ?? false,
    unit_cost: unitCost,
    ...patch,
  };
}

function payment(amount: number, purpose = "Down payment"): PoPayment {
  return {
    id: `pay-${amount}`,
    po_id: "po",
    payment_date: "2026-03-01",
    amount,
    payment_request_number: "PR-1",
    currency: "IDR",
    exchange_rate: null,
    purpose,
  };
}

function po(patch: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-1",
    supplier_id: null,
    supplier_name: "Acme",
    status: "ordered",
    order_date: "2026-01-01",
    expected_date: "2026-04-01",
    down_payment_pct: 30,
    discount_amount: 0,
    tax_pct: 11,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    notes: "internal note",
    pd_project_id: null,
    payments: [],
    lines: [line("SKU-A", 10, 1000, { sku_name: "Alpha serum" })],
    ...patch,
  };
}

test("latest inbound receive date keeps the most recent day", () => {
  assert.equal(
    latestInboundReceiveDate(["2026-02-01", null, " 2026-05-03 ", "2026-04-01"]),
    "2026-05-03",
  );
  assert.equal(latestInboundReceiveDate([null, "  "]), null);
});

test("unpaid rows include open and partial POs and omit settled or cancelled ones", () => {
  const open = po();
  const partial = po({
    id: "po-partial",
    po_number: "PO-PARTIAL",
    payments: [payment(3330)],
  });
  const paid = po({
    id: "po-paid",
    po_number: "PO-PAID",
    payments: [payment(11100, "Balance payment")],
  });
  const overpaid = po({
    id: "po-over",
    po_number: "PO-OVER",
    payments: [payment(12000, "Balance payment")],
  });
  const cancelled = po({
    id: "po-cancel",
    po_number: "PO-CANCEL",
    status: "cancelled",
    payments: [],
  });
  const missingPayments = po({
    id: "po-unknown",
    po_number: "PO-UNKNOWN",
    payments: undefined,
  });

  const rows = buildUnpaidPoRows(
    [open, partial, paid, overpaid, cancelled, missingPayments],
    new Map([["po-1", "2026-04-20"]]),
  );

  assert.deepEqual(
    rows.map((row) => row.poNumber),
    ["PO-1", "PO-PARTIAL"],
  );

  const openRow = rows[0]!;
  assert.equal(openRow.date, "2026-04-20");
  assert.equal(openRow.dateKind, "received");
  assert.equal(openRow.vat, 1100);
  assert.equal(openRow.vatPct, 11);
  assert.equal(openRow.totalPayables, 11100);
  assert.equal(openRow.paid, 0);
  assert.equal(openRow.remaining, 11100);
  assert.equal(openRow.partiallyPaid, false);
  assert.equal(openRow.lines[0]?.qty, 10);
  assert.equal(openRow.lines[0]?.unitCost, 1000);

  const partialRow = rows[1]!;
  assert.equal(partialRow.date, "2026-04-01");
  assert.equal(partialRow.dateKind, "expected");
  assert.equal(partialRow.paid, 3330);
  assert.equal(partialRow.remaining, 7770);
  assert.equal(partialRow.partiallyPaid, true);
});

test("received POs bill received quantity and omit zero VAT", () => {
  const rows = buildUnpaidPoRows(
    [
      po({
        status: "received",
        tax_pct: 0,
        lines: [
          line("SKU-B", 10, 1000, { qty_received: 4 }),
          line("SKU-A", 2, 500, { sku_name: "SKU-A", qty_received: 2 }),
        ],
      }),
    ],
    new Map(),
  );

  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.deepEqual(
    row.lines.map((item) => [item.skuCode, item.qty, item.unitCost, item.skuName]),
    [
      ["SKU-A", 2, 500, null],
      ["SKU-B", 4, 1000, null],
    ],
  );
  assert.equal(row.vat, 0);
  assert.equal(row.totalPayables, 5000);
  assert.equal(row.remaining, 5000);
});

test("search matches PO number, SKU, and supplier only", () => {
  const rows = buildUnpaidPoRows(
    [
      po(),
      po({
        id: "po-2",
        po_number: "PO-22",
        supplier_name: "Northwind",
        lines: [line("PKG-9", 1, 50, { sku_name: "Bottle" })],
        tax_pct: 0,
      }),
    ],
    new Map(),
  );

  assert.deepEqual(
    filterUnpaidPoRows(rows, " po-1 ").map((row) => row.poNumber),
    ["PO-1"],
  );
  assert.deepEqual(
    filterUnpaidPoRows(rows, "alpha").map((row) => row.poNumber),
    ["PO-1"],
  );
  assert.deepEqual(
    filterUnpaidPoRows(rows, "SKU-A").map((row) => row.poNumber),
    ["PO-1"],
  );
  assert.deepEqual(
    filterUnpaidPoRows(rows, "north").map((row) => row.poNumber),
    ["PO-22"],
  );
  assert.deepEqual(filterUnpaidPoRows(rows, "internal note"), []);
  assert.deepEqual(filterUnpaidPoRows(rows, "   "), rows);
});

test("every column sorts, with empty values last", () => {
  const dated: UnpaidPoRow = {
    id: "a",
    poNumber: "PO-A",
    supplierName: "Zen",
    date: "2026-06-01",
    dateKind: "expected",
    lines: [{ skuCode: "BBB", skuName: null, qty: 2, unitCost: 10 }],
    currency: "IDR",
    vat: 0,
    vatPct: 0,
    totalPayables: 20,
    paid: 0,
    remaining: 20,
    partiallyPaid: false,
  };
  const earlier: UnpaidPoRow = {
    ...dated,
    id: "b",
    poNumber: "PO-B",
    supplierName: "Acme",
    date: "2026-01-01",
    dateKind: "received",
    lines: [
      { skuCode: "AAA", skuName: "Alpha", qty: 5, unitCost: 4 },
      { skuCode: "CCC", skuName: null, qty: 5, unitCost: 6 },
    ],
    vat: 11,
    vatPct: 11,
    totalPayables: 100,
    paid: 30,
    remaining: 70,
    partiallyPaid: true,
  };
  const undated: UnpaidPoRow = {
    ...dated,
    id: "c",
    poNumber: "PO-C",
    supplierName: null,
    date: null,
    dateKind: null,
    lines: [],
    vat: 5,
    totalPayables: 50,
    paid: 10,
    remaining: 40,
    partiallyPaid: true,
  };
  const rows = [dated, undated, earlier];

  assert.deepEqual(
    sortUnpaidPoRows(rows, "date", "asc").map((row) => row.poNumber),
    ["PO-B", "PO-A", "PO-C"],
  );
  assert.deepEqual(
    sortUnpaidPoRows(rows, "date", "desc").map((row) => row.poNumber),
    ["PO-A", "PO-B", "PO-C"],
  );
  assert.deepEqual(
    sortUnpaidPoRows(rows, "supplier", "asc").map((row) => row.poNumber),
    ["PO-B", "PO-A", "PO-C"],
  );
  assert.deepEqual(
    sortUnpaidPoRows(rows, "sku", "asc").map((row) => row.poNumber),
    ["PO-B", "PO-A", "PO-C"],
  );
  assert.deepEqual(
    sortUnpaidPoRows(rows, "qty", "desc").map((row) => row.poNumber),
    ["PO-B", "PO-A", "PO-C"],
  );
  assert.equal(defaultUnpaidSortDir("remaining"), "desc");
  assert.deepEqual(
    sortUnpaidPoRows(rows, "remaining", defaultUnpaidSortDir("remaining")).map(
      (row) => row.poNumber,
    ),
    ["PO-B", "PO-C", "PO-A"],
  );
  assert.deepEqual(
    sortUnpaidPoRows(rows, "unitPrice", "asc").map((row) => row.poNumber),
    ["PO-B", "PO-A", "PO-C"],
  );
  assert.deepEqual(
    sortUnpaidPoRows(rows, "poNumber", "desc").map((row) => row.poNumber),
    ["PO-C", "PO-B", "PO-A"],
  );
});
