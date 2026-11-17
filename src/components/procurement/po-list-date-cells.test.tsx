import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PoListDateCells } from "./po-list-date-cells";
import type { PoListShipment, PurchaseOrder } from "@/types/database";

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-100",
    supplier_id: null,
    status: "ordered",
    order_date: "2026-05-01",
    expected_date: "2026-06-12",
    down_payment_pct: 30,
    discount_amount: 0,
    tax_pct: 11,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    notes: null,
    pd_project_id: null,
    shipments: [],
    ...overrides,
  };
}

const linked: PoListShipment = {
  id: "s1",
  shipment_number: "SH-9",
  shipment_type: "sea",
  status: "planned",
  estimated_departure_date: "2026-06-01",
  expected_delivery_date: "2026-06-22",
  transit_days: 21,
  delay_days: 0,
};

test("expected date and shipment window render as calendar buttons", () => {
  const html = renderToStaticMarkup(
    <PoListDateCells
      po={po({ shipments: [linked] })}
      pendingKeys={new Set()}
      errors={{}}
      onExpectedDate={() => {}}
      onShipmentDate={() => {}}
      onCreateShipment={() => {}}
    />,
  );

  assert.match(html, /Expected date for PO-100/);
  assert.match(html, /12 Jun 2026/);
  assert.match(html, /Ship start for PO-100, SH-9/);
  assert.match(html, /Ship end for PO-100, SH-9/);
  assert.match(html, /1 Jun 2026/);
  assert.match(html, /22 Jun 2026/);
  assert.match(html, /SH-9/);
  assert.doesNotMatch(html, /Create shipment for PO-100/);
});

test("a purchase order with no shipment offers to create one", () => {
  const html = renderToStaticMarkup(
    <PoListDateCells
      po={po()}
      pendingKeys={new Set()}
      errors={{}}
      onExpectedDate={() => {}}
      onShipmentDate={() => {}}
      onCreateShipment={() => {}}
    />,
  );

  assert.match(html, /Create shipment for PO-100/);
  assert.doesNotMatch(html, /Ship start for PO-100/);
});

test("cancelled purchase orders keep the expected date read-only", () => {
  const html = renderToStaticMarkup(
    <PoListDateCells
      po={po({ status: "cancelled", shipments: [] })}
      pendingKeys={new Set()}
      errors={{}}
      onExpectedDate={() => {}}
      onShipmentDate={() => {}}
      onCreateShipment={() => {}}
    />,
  );

  assert.match(html, /Cancelled purchase orders can only have notes updated/);
  assert.doesNotMatch(html, /Expected date for PO-100/);
  assert.doesNotMatch(html, /Create shipment for PO-100/);
});

test("a date save error is shown on the cell", () => {
  const html = renderToStaticMarkup(
    <PoListDateCells
      po={po({ shipments: [linked] })}
      pendingKeys={new Set(["po-1:expected"])}
      errors={{ "po-1:expected": "Couldn't save the expected date for PO-100. Not authenticated" }}
      onExpectedDate={() => {}}
      onShipmentDate={() => {}}
      onCreateShipment={() => {}}
    />,
  );

  assert.match(html, /role="alert"/);
  assert.match(html, /Not authenticated/);
  assert.match(html, /aria-busy="true"/);
});
