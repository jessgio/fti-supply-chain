import assert from "node:assert/strict";
import test from "node:test";
import { paymentAmountIdrSync } from "./payment-idr";
import { previewPaymentIdr } from "./po-payment-status";

test("IDR payment history keeps the invoice decimal", () => {
  assert.equal(
    paymentAmountIdrSync({
      amount: 153292387.5,
      currency: "IDR",
      exchange_rate: null,
    }),
    153292387.5,
  );
  assert.equal(previewPaymentIdr(153292387.5, "IDR", ""), 153292387.5);
});
