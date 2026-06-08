import {
  isIncludedWmsSalesRow,
  parseWmsSalesNumber,
} from "../src/lib/excel/sales-filters";

function assert(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log("ok", label);
}

// Signs are taken from the file as-is — no status-based flipping.
assert("unicode minus", parseWmsSalesNumber("\u22121") === -1);
assert("accounting negative", parseWmsSalesNumber("(2)") === -2);
assert("negative qty kept", parseWmsSalesNumber("-3") === -3);
assert("positive qty kept", parseWmsSalesNumber("5") === 5);
assert("locale thousands", parseWmsSalesNumber("1,234") === 1234);

// Only CANCELED orders are excluded; everything else is included.
assert("CANCELED excluded", !isIncludedWmsSalesRow("FAKTUR", "CANCELED"));
assert("CANCELLED excluded", !isIncludedWmsSalesRow("FAKTUR", "CANCELLED"));
assert("completed included", isIncludedWmsSalesRow("FAKTUR", "COMPLETED"));
assert("returned faktur included", isIncludedWmsSalesRow("FAKTUR", "RETURNED"));
assert("retur included", isIncludedWmsSalesRow("RETUR", "RETURNED"));
assert("shipped included", isIncludedWmsSalesRow("FAKTUR", "SHIPPED"));

console.log("All sales filter checks passed.");
