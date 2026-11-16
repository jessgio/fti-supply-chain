import assert from "node:assert/strict";
import test from "node:test";
import {
  extractSkuCatalogKey,
  extractSkuNeedsCatalogRow,
  type ExtractCatalogPresence,
  type ExtractLedgerPresence,
} from "./sku-catalog";

const sytenol = {
  sku_code: "SYTENOL A (BAKUCHIOL)",
  name: "SYTENOL A (BAKUCHIOL)",
};

test("a product marked extract with no catalog or ledger row needs a catalog row", () => {
  assert.equal(extractSkuNeedsCatalogRow(sytenol, [], []), true);
});

test("catalog key falls back to the SKU code when the product name is blank", () => {
  assert.deepEqual(
    extractSkuCatalogKey({ sku_code: "  SYTENOL A (BAKUCHIOL)  ", name: "  " }),
    {
      itemCode: "SYTENOL A (BAKUCHIOL)",
      extractName: "SYTENOL A (BAKUCHIOL)",
    },
  );
  assert.equal(
    extractSkuNeedsCatalogRow({ sku_code: "   ", name: "Sytenol" }, [], []),
    false,
  );
});

test("an active catalog item code is already on the extract list", () => {
  const codes: ExtractCatalogPresence[] = [
    {
      item_code: "SYTENOL A (BAKUCHIOL)",
      extract_name: "Sytenol",
      extract_id: "ext-1",
      is_active: true,
    },
  ];
  assert.equal(extractSkuNeedsCatalogRow(sytenol, codes, []), false);
});

test("an active catalog name match is already on the extract list", () => {
  const codes: ExtractCatalogPresence[] = [
    {
      item_code: "RM-014",
      extract_name: "sytenol a (bakuchiol)",
      extract_id: "ext-1",
      is_active: true,
    },
  ];
  assert.equal(extractSkuNeedsCatalogRow(sytenol, codes, []), false);
});

test("historical ledger extracts are not added to the catalog from their SKU", () => {
  const extracts: ExtractLedgerPresence[] = [
    { id: "ext-1", item_no: "SYTENOL A (BAKUCHIOL)" },
  ];
  assert.equal(extractSkuNeedsCatalogRow(sytenol, [], extracts), false);
});

test("a deactivated catalog pair stays off the extract list", () => {
  const codes: ExtractCatalogPresence[] = [
    {
      item_code: "SYTENOL A (BAKUCHIOL)",
      extract_name: "SYTENOL A (BAKUCHIOL)",
      extract_id: "ext-1",
      is_active: false,
    },
  ];
  assert.equal(extractSkuNeedsCatalogRow(sytenol, codes, []), false);
});
