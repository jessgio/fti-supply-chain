import assert from "node:assert/strict";
import test from "node:test";
import { sortSuppliersByName, suppliersMatchingName } from "./supplier-list";

const suppliers = [
  { name: "zeta labs" },
  { name: "Alpha Co" },
  { name: "beta Packaging" },
  { name: "Supplier 10" },
  { name: "Supplier 2" },
];

test("suppliers sort alphabetically without caring about case", () => {
  assert.deepEqual(
    sortSuppliersByName(suppliers).map((supplier) => supplier.name),
    ["Alpha Co", "beta Packaging", "Supplier 2", "Supplier 10", "zeta labs"],
  );
});

test("typing a supplier name returns matching names in alphabetical order", () => {
  assert.deepEqual(
    suppliersMatchingName(suppliers, "a").map((supplier) => supplier.name),
    ["Alpha Co", "beta Packaging", "zeta labs"],
  );
  assert.deepEqual(
    suppliersMatchingName(suppliers, "SUPPLIER").map((supplier) => supplier.name),
    ["Supplier 2", "Supplier 10"],
  );
  assert.deepEqual(suppliersMatchingName(suppliers, "   "), suppliersMatchingName(suppliers, ""));
  assert.equal(suppliersMatchingName(suppliers, "").length, suppliers.length);
});
