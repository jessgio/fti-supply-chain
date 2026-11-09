import assert from "node:assert/strict";
import test from "node:test";
import { formatMoneyInput, parseMoneyInput, readTaxWithholding } from "./money-input";

test("parses comma-grouped amounts used when logging a tax withholding", () => {
  assert.equal(parseMoneyInput("2,000,000"), 2_000_000);
  assert.equal(parseMoneyInput("  2,000,000  "), 2_000_000);
  assert.equal(parseMoneyInput("2,000,000.50"), 2_000_000.5);
  assert.equal(parseMoneyInput("98,000,000"), 98_000_000);
});

test("parses Indonesian dot grouping and plain digits", () => {
  assert.equal(parseMoneyInput("2.000.000"), 2_000_000);
  assert.equal(parseMoneyInput("2.000.000,50"), 2_000_000.5);
  assert.equal(parseMoneyInput("2000000"), 2_000_000);
  assert.equal(parseMoneyInput("2.5"), 2.5);
  assert.equal(parseMoneyInput("10.33333"), 10.33333);
});

test("empty withholding means zero and rejects text that is not an amount", () => {
  assert.equal(parseMoneyInput(""), 0);
  assert.equal(parseMoneyInput("   "), 0);
  assert.equal(parseMoneyInput("2 million"), null);
  assert.equal(parseMoneyInput("-2,000,000"), null);
  assert.equal(parseMoneyInput("2,00,000"), null);
});

test("reads a withholding from a payment request", () => {
  assert.equal(readTaxWithholding(undefined), 0);
  assert.equal(readTaxWithholding(null), 0);
  assert.equal(readTaxWithholding(""), 0);
  assert.equal(readTaxWithholding("2,000,000"), 2_000_000);
  assert.equal(readTaxWithholding(2_000_000), 2_000_000);
  assert.equal(readTaxWithholding(-1), null);
  assert.equal(readTaxWithholding("nope"), null);
});

test("formats a stored withholding for the text field", () => {
  assert.equal(formatMoneyInput(2_000_000), "2,000,000");
  assert.equal(formatMoneyInput(0), "");
  assert.equal(formatMoneyInput(2_000_000.5), "2,000,000.5");
});
