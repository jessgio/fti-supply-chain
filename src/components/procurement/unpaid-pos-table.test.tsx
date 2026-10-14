import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  UnpaidPosTableView,
} from "./unpaid-pos-table";
import type { UnpaidPoRow } from "@/lib/procurement/unpaid-pos";

const open: UnpaidPoRow = {
  id: "po-1",
  poNumber: "PO-100",
  supplierName: "Acme",
  date: "2026-04-20",
  dateKind: "received",
  lines: [
    { skuCode: "SKU-A", skuName: "Alpha serum", qty: 10, unitCost: 1000 },
    { skuCode: "SKU-B", skuName: null, qty: 4, unitCost: 2500 },
  ],
  currency: "IDR",
  vat: 1100,
  vatPct: 11,
  totalPayables: 11100,
  paid: 0,
  remaining: 11100,
  partiallyPaid: false,
};

const partial: UnpaidPoRow = {
  id: "po-2",
  poNumber: "PO-200",
  supplierName: "Northwind",
  date: "2026-05-01",
  dateKind: "expected",
  lines: [{ skuCode: "PKG-9", skuName: "Bottle", qty: 2, unitCost: 500 }],
  currency: "IDR",
  vat: 0,
  vatPct: 0,
  totalPayables: 1000,
  paid: 300,
  remaining: 700,
  partiallyPaid: true,
};

function render(rows: UnpaidPoRow[], query = "") {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? rows.filter(
        (row) =>
          row.poNumber.toLowerCase().includes(needle) ||
          (row.supplierName ?? "").toLowerCase().includes(needle) ||
          row.lines.some(
            (line) =>
              line.skuCode.toLowerCase().includes(needle) ||
              (line.skuName ?? "").toLowerCase().includes(needle),
          ),
      )
    : rows;
  return renderToStaticMarkup(
    <UnpaidPosTableView
      rows={rows}
      visibleRows={visible}
      partialCount={rows.filter((row) => row.partiallyPaid).length}
      loading={false}
      error={null}
      query={query}
      onQueryChange={() => {}}
      sortKey="date"
      sortDir="asc"
      onSort={() => {}}
    />,
  );
}

test("unpaid table renders payable columns, receive date, and partial balances", () => {
  const html = render([partial, open]);

  for (const header of [
    "PO",
    "Delivery date",
    "Supplier",
    "SKU",
    "Qty",
    "Unit price",
    "VAT",
    "Total payables",
    "Paid",
    "Remaining",
  ]) {
    assert.match(html, new RegExp(`>${header}<`));
  }

  assert.match(html, /PO-100/);
  assert.match(html, /Received/);
  assert.match(html, /Expected/);
  assert.match(html, /SKU-A/);
  assert.match(html, /Alpha serum/);
  assert.match(html, /SKU-B/);
  assert.match(html, /11%/);
  assert.match(html, /Partial/);
  assert.match(html, />paid</);
  assert.match(html, /still due/);
  assert.match(html, /Search PO number, SKU, or supplier/);
  assert.equal((html.match(/aria-sort=/g) ?? []).length, 10);
});

test("search hides purchase orders that do not match the PO, SKU, or supplier", () => {
  const html = render([partial, open], "bottle");
  assert.match(html, /PO-200/);
  assert.doesNotMatch(html, /PO-100/);
  assert.match(html, /1 match/);
});
