import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ShipmentApRequestForm } from "./shipment-ap-request-form";
import type { ShipmentLarkSubmission } from "@/types/database";

const baseProps = {
  shipmentId: "ship-1",
  invoiceKind: "shipping" as const,
  remarks: "Freight for PO-1",
  project: "SHP-1",
  suppliers: [],
  poLabel: "PO-1",
};

const submission: ShipmentLarkSubmission = {
  id: "sub-1",
  shipment_id: "ship-1",
  invoice_kind: "shipping",
  supplier_id: null,
  supplier_name: "Forwarder",
  lark_instance_code: "inst-1",
  lark_serial_number: "202407110001",
  lark_approval_status: "PENDING",
  lark_status_synced_at: null,
  lark_expense_category: null,
  submitted_amount: 1500000,
  submitted_currency: "IDR",
  plan_rows: null,
  submitted_at: "2026-04-01T00:00:00.000Z",
};

test("shipping payment can start from an existing AP form reference", () => {
  const html = renderToStaticMarkup(
    <ShipmentApRequestForm {...baseProps} submissions={[]} />,
  );
  assert.match(html, /Submit new AP Form/);
  assert.match(html, /Link existing AP Form/);
  assert.match(html, /already filed/);
});

test("a shipment that already has an AP form can link another by reference", () => {
  const html = renderToStaticMarkup(
    <ShipmentApRequestForm {...baseProps} submissions={[submission]} />,
  );
  assert.match(html, /Link existing AP Form/);
  assert.match(html, /Submit another/);
  assert.match(html, /202407110001/);
});
