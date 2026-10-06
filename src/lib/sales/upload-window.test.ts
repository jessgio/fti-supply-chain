import assert from "node:assert/strict";
import test from "node:test";
import type { SalesRow } from "@/types/database";
import {
  filterSalesRowsForUpload,
  getSalesUploadCutoff,
  SALES_UPLOAD_MONTHS,
} from "./upload-window";

function row(sale_date: string): SalesRow {
  return {
    sale_date,
    channel: "SHOPEE",
    sku_code: "SKU-1",
    qty_sold: 1,
    net_sales: 100,
  };
}

test("October upload keeps June through October, including July", () => {
  const october = new Date(2026, 9, 6);
  assert.equal(SALES_UPLOAD_MONTHS, 5);
  assert.equal(getSalesUploadCutoff(october), "2026-06-01");

  const filtered = filterSalesRowsForUpload(
    [
      row("2026-05-31"),
      row("2026-06-01"),
      row("2026-07-15"),
      row("2026-08-01"),
      row("2026-10-06"),
    ],
    october,
  );

  assert.deepEqual(
    filtered.eligible.map((entry) => entry.sale_date),
    ["2026-06-01", "2026-07-15", "2026-08-01", "2026-10-06"],
  );
  assert.equal(filtered.skippedOlder, 1);
  assert.equal(filtered.rangeStart, "2026-06-01");
  assert.equal(filtered.rangeEnd, "2026-10-06");
});
