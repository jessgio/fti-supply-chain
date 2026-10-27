import assert from "node:assert/strict";
import test from "node:test";
import {
  allocatePaymentTerms,
  configuredPaymentTerms,
  defaultPaymentTerms,
  paymentTermIndexForPurpose,
  paymentTermLabel,
  validatePaymentTerms,
} from "./payment-terms";

test("a purchase order defaults to a down payment and a final payment", () => {
  assert.deepEqual(defaultPaymentTerms(30), [
    { label: "Down payment", pct: 30, basis: "pct" },
    { label: "Final payment", pct: 70, basis: "pct" },
  ]);
  assert.deepEqual(configuredPaymentTerms({ down_payment_pct: 40 }), [
    { label: "Down payment", pct: 40, basis: "pct" },
    { label: "Final payment", pct: 60, basis: "pct" },
  ]);
});

test("three payment terms split the invoice and the last term takes the remainder", () => {
  const terms = [
    { label: "Down payment", pct: 30 },
    { label: "Progress payment", pct: 40 },
    { label: "Before shipment", pct: 30 },
  ];
  assert.equal(validatePaymentTerms(terms), null);

  const allocated = allocatePaymentTerms(101, terms);
  assert.equal(allocated[0]?.amount, 30.3);
  assert.equal(allocated[1]?.amount, 40.4);
  assert.equal(allocated[2]?.amount, 30.3);
  assert.equal(
    allocated.reduce((sum, term) => sum + term.amount, 0),
    101,
  );
  assert.equal(paymentTermLabel(allocated[1]!), "Progress payment (40%)");
});

test("payment percents have to total 100", () => {
  const error = validatePaymentTerms([
    { label: "Down payment", pct: 30 },
    { label: "Progress payment", pct: 30 },
    { label: "Final payment", pct: 30 },
  ]);
  assert.match(error ?? "", /100%/);
});

test("a logged balance payment still belongs to the final installment", () => {
  const terms = defaultPaymentTerms(30);
  assert.equal(paymentTermIndexForPurpose("Down payment", terms), 0);
  assert.equal(paymentTermIndexForPurpose("Balance payment", terms), 1);
  assert.equal(paymentTermIndexForPurpose("Final payment", terms), 1);
  assert.equal(
    paymentTermIndexForPurpose("Progress payment", [
      { label: "Down payment" },
      { label: "Progress payment" },
      { label: "Final payment" },
    ]),
    1,
  );
});

test("a fixed amount stays exact and the other payment is the rest of the invoice", () => {
  const invoice = 14_250_000;
  const terms = [
    { label: "Down payment", basis: "amount" as const, amount: 3_500_000, pct: 0 },
    { label: "Final payment", basis: "pct" as const, pct: 0 },
  ];
  assert.equal(validatePaymentTerms(terms, { invoiceTotal: invoice, currency: "IDR" }), null);

  const allocated = allocatePaymentTerms(invoice, terms);
  assert.equal(allocated[0]?.amount, 3_500_000);
  assert.equal(allocated[1]?.amount, 10_750_000);
  assert.equal(
    allocated.reduce((sum, term) => sum + term.amount, 0),
    invoice,
  );
  assert.equal(paymentTermLabel(allocated[0]!), "Down payment");
  assert.equal(paymentTermLabel(allocated[1]!), "Final payment");
  assert.equal(allocated[0]?.basis, "amount");
  assert.equal(allocated[1]?.remainder, true);
});

test("older percent terms without a basis still split the invoice", () => {
  const allocated = allocatePaymentTerms(1000, [
    { label: "Down payment", pct: 30 },
    { label: "Final payment", pct: 70 },
  ]);
  assert.equal(allocated[0]?.amount, 300);
  assert.equal(allocated[1]?.amount, 700);
  assert.equal(paymentTermLabel(allocated[0]!), "Down payment (30%)");
});

test("fixed payments cannot be larger than the invoice", () => {
  const error = validatePaymentTerms(
    [
      { label: "Down payment", basis: "amount", amount: 3_500_000, pct: 0 },
      { label: "Final payment", basis: "pct", pct: 0 },
    ],
    { invoiceTotal: 3_000_000, currency: "IDR" },
  );
  assert.match(error ?? "", /larger than the invoice/);
});

test("an exact installment name wins over the balance-payment alias", () => {
  const terms = [
    { label: "Down payment" },
    { label: "Balance payment" },
    { label: "Final payment" },
  ];
  assert.equal(paymentTermIndexForPurpose("Balance payment", terms), 1);
});
