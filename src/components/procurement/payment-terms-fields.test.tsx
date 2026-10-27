import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PaymentTermsFields,
  paymentTermFormFromDrafts,
} from "./payment-terms-fields";
import { formatPoMoney } from "@/lib/procurement/currencies";
import { defaultPaymentTerms } from "@/lib/procurement/payment-terms";

test("the payment editor starts with a down payment and a final payment", () => {
  const html = renderToStaticMarkup(
    <PaymentTermsFields
      rows={paymentTermFormFromDrafts(defaultPaymentTerms(30))}
      onChange={() => {}}
    />,
  );

  assert.match(html, /Add payment/);
  assert.match(html, /value="Down payment"/);
  assert.match(html, /value="Final payment"/);
  assert.match(html, /value="30"/);
  assert.match(html, /value="70"/);
  assert.match(html, /Amount/);
  assert.doesNotMatch(html, /must add up to 100%/);
  assert.doesNotMatch(html, /Rest of the invoice/);
});

test("a nominal payment shows the amount and leaves the rest of the invoice", () => {
  const html = renderToStaticMarkup(
    <PaymentTermsFields
      rows={paymentTermFormFromDrafts([
        { label: "Down payment", basis: "amount", amount: 3_500_000, pct: 0 },
        { label: "Final payment", basis: "pct", pct: 0 },
      ])}
      invoiceTotal={14_250_000}
      currency="IDR"
      onChange={() => {}}
    />,
  );

  assert.match(html, /value="3500000"/);
  assert.match(html, /Rest of the invoice/);
  assert.ok(html.includes(formatPoMoney(10_750_000, "IDR")));
  assert.doesNotMatch(html, /24[,.]56/);
});
