import {
  isReturnSalesStatus,
  normalizeWmsSalesAmounts,
  parseWmsSalesNumber,
} from "../src/lib/excel/sales-filters";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log("ok", label);
}

assert("unicode minus", parseWmsSalesNumber("\u22121") === -1);
assert("accounting qty", parseWmsSalesNumber("(2)") === -2);
assert("RETURNED flips qty", normalizeWmsSalesAmounts("RETURNED", 1, 100).qty_sold === -1);
assert("negative qty kept", normalizeWmsSalesAmounts("SHIPPED", -3, 100).qty_sold === -3);
assert("negative net flips qty", normalizeWmsSalesAmounts("SHIPPED", 2, -50).qty_sold === -2);
assert("tipe RETUR", isReturnSalesStatus("", "RETUR"));
assert("tipe return row", normalizeWmsSalesAmounts("", 1, 100, "RETUR").qty_sold === -1);

console.log("All return normalization checks passed.");
