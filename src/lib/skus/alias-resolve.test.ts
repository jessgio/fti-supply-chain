import assert from "node:assert/strict";
import test from "node:test";
import {
  aliasAssignmentError,
  remapSkuIdsToCanonical,
  sumStockQtyBySkuLocationDate,
} from "./alias-resolve";

test("sales import cache stores an alias code on the canonical SKU", () => {
  const cache = new Map<string, string>([
    ["PRE-1", "alias"],
    ["REG-1", "canonical"],
    ["OTHER", "other"],
  ]);

  remapSkuIdsToCanonical(cache, [
    { alias_sku_id: "alias", canonical_sku_id: "canonical" },
  ]);

  assert.equal(cache.get("PRE-1"), "canonical");
  assert.equal(cache.get("REG-1"), "canonical");
  assert.equal(cache.get("OTHER"), "other");
});

test("alias assignment rejects self links and chains", () => {
  const existing = [
    { alias_sku_id: "pre-a", canonical_sku_id: "regular" },
  ];

  assert.equal(aliasAssignmentError("pre-b", "regular", existing), null);
  assert.match(
    aliasAssignmentError("regular", "regular", existing) ?? "",
    /cannot alias itself/,
  );
  assert.match(
    aliasAssignmentError("pre-b", "pre-a", existing) ?? "",
    /itself an alias/,
  );
  assert.match(
    aliasAssignmentError("regular", "other", existing) ?? "",
    /already alias onto/,
  );
  assert.equal(aliasAssignmentError("pre-a", "regular", existing), null);
});

test("stock rows that resolve to the same SKU are summed", () => {
  const rows = sumStockQtyBySkuLocationDate([
    {
      sku_id: "canonical",
      location: "Gudang Finished Goods",
      as_of_date: "2026-10-01",
      qty_on_hand: 4,
      upload_batch_id: "a",
    },
    {
      sku_id: "canonical",
      location: "Gudang Finished Goods",
      as_of_date: "2026-10-01",
      qty_on_hand: 6,
      upload_batch_id: "a",
    },
    {
      sku_id: "canonical",
      location: "Gudang Inventory",
      as_of_date: "2026-10-01",
      qty_on_hand: 1,
      upload_batch_id: "a",
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.qty_on_hand, 10);
  assert.equal(rows[1]?.qty_on_hand, 1);
});
