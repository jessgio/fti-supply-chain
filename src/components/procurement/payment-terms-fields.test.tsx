import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PaymentTermsFields,
  paymentTermFormFromDrafts,
} from "./payment-terms-fields";
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
  assert.doesNotMatch(html, /must add up to 100%/);
});
