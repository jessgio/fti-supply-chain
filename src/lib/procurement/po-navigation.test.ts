import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePoReturnTo,
  poDetailHref,
  poReturnLabel,
  sanitizePoReturnTo,
} from "./po-navigation";

const PO_ID = "po-1";

test("poDetailHref keeps a bare PO path when there is no safe return target", () => {
  assert.equal(poDetailHref(PO_ID), "/dashboard/procurement/po-1");
  assert.equal(poDetailHref(PO_ID, null), "/dashboard/procurement/po-1");
  assert.equal(
    poDetailHref(PO_ID, "/dashboard/procurement"),
    "/dashboard/procurement/po-1",
  );
  assert.equal(
    poDetailHref(PO_ID, "/dashboard/procurement?sku=ABC&qty=10"),
    "/dashboard/procurement/po-1",
  );
  assert.equal(
    poDetailHref(PO_ID, "/dashboard/procurement/po-1"),
    "/dashboard/procurement/po-1",
  );
  assert.equal(
    poDetailHref(PO_ID, "/dashboard/procurement/po-1?returnTo=%2Fdashboard%2Fpayments"),
    "/dashboard/procurement/po-1?returnTo=%2Fdashboard%2Fpayments",
  );
});

test("poDetailHref records the page that opened the PO", () => {
  assert.equal(
    poDetailHref(PO_ID, "/dashboard/payments"),
    "/dashboard/procurement/po-1?returnTo=%2Fdashboard%2Fpayments",
  );
  assert.equal(
    poDetailHref(PO_ID, "/dashboard/po-timeline"),
    "/dashboard/procurement/po-1?returnTo=%2Fdashboard%2Fpo-timeline",
  );
  assert.equal(
    poDetailHref(
      PO_ID,
      "/dashboard/shipments/ship-1?returnTo=%2Fdashboard%2Fpo-timeline",
    ),
    "/dashboard/procurement/po-1?returnTo=%2Fdashboard%2Fshipments%2Fship-1%3FreturnTo%3D%252Fdashboard%252Fpo-timeline",
  );
});

test("sanitizePoReturnTo accepts only in-app dashboard paths", () => {
  assert.equal(sanitizePoReturnTo(null), null);
  assert.equal(sanitizePoReturnTo(""), null);
  assert.equal(sanitizePoReturnTo("https://evil.example"), null);
  assert.equal(sanitizePoReturnTo("//evil.example"), null);
  assert.equal(sanitizePoReturnTo("/dashboard/../secret"), null);
  assert.equal(sanitizePoReturnTo("/login"), null);
  assert.equal(
    sanitizePoReturnTo("/dashboard/payments?search=dp"),
    "/dashboard/payments?search=dp",
  );
  assert.equal(
    parsePoReturnTo("/dashboard/procurement/other", PO_ID),
    "/dashboard/procurement/other",
  );
  assert.equal(parsePoReturnTo("/dashboard/procurement/po-1?returnTo=%2Fdashboard%2Fpayments", PO_ID), null);
});

test("poReturnLabel names the page the back button returns to", () => {
  assert.equal(poReturnLabel("/dashboard/payments"), "Back to payments");
  assert.equal(poReturnLabel("/dashboard/payments?search=dp"), "Back to payments");
  assert.equal(poReturnLabel("/dashboard/po-timeline"), "Back to PO timeline");
  assert.equal(poReturnLabel("/dashboard/shipments"), "Back to shipments");
  assert.equal(poReturnLabel("/dashboard/shipments/ship-1"), "Back to shipment");
  assert.equal(
    poReturnLabel("/dashboard/shipment-payments"),
    "Back to shipment payments",
  );
  assert.equal(
    poReturnLabel("/dashboard/shipment-payments/ship-1"),
    "Back to shipment payment",
  );
  assert.equal(
    poReturnLabel("/dashboard/procurement/other"),
    "Back to purchase order",
  );
  assert.equal(
    poReturnLabel("/dashboard/status-updates/new"),
    "Back to status updates",
  );
  assert.equal(
    poReturnLabel("/dashboard/extract-inbound-delivery-notes"),
    "Back to extract inbound",
  );
  assert.equal(
    poReturnLabel("/dashboard/primary-packaging-delivery-notes/note/edit"),
    "Back to primary packaging inbound",
  );
  assert.equal(poReturnLabel("/dashboard"), "Back to overview");
  assert.equal(poReturnLabel("/dashboard/unknown"), "Back");
});
