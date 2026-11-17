import assert from "node:assert/strict";
import test from "node:test";
import {
  applySavedPurchaseOrderDates,
  planExpectedDateShipmentShifts,
  restorePurchaseOrderExpectedDate,
  shiftPurchaseOrdersForExpectedDate,
  type ShipmentExpectedDateInput,
} from "./po-expected-date-shipments";
import { patchShipmentWindow } from "./po-list-shipments";
import type {
  PoListLinkedPurchaseOrder,
  PoListShipment,
  PurchaseOrder,
} from "@/types/database";

const TODAY = "2026-06-01";

function shipment(overrides: Partial<PoListShipment> = {}): PoListShipment {
  return {
    id: "s1",
    shipment_number: "SH-1",
    shipment_type: "sea",
    status: "planned",
    estimated_departure_date: "2026-06-06",
    expected_delivery_date: "2026-06-29",
    transit_days: 21,
    delay_days: 2,
    ...overrides,
  };
}

function link(
  id: string,
  expected_date: string | null,
  status: PoListLinkedPurchaseOrder["status"] = "ordered",
): PoListLinkedPurchaseOrder {
  return { id, expected_date, status };
}

function input(
  shipmentRow: PoListShipment,
  links: PoListLinkedPurchaseOrder[],
): ShipmentExpectedDateInput {
  return {
    shipment: { ...shipmentRow, linked_purchase_orders: links },
    linkedPurchaseOrders: links,
  };
}

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-1",
    supplier_id: null,
    status: "ordered",
    order_date: "2026-05-01",
    expected_date: "2026-06-01",
    down_payment_pct: 30,
    discount_amount: 0,
    tax_pct: 11,
    pph_pct: 0,
    other_charges: 0,
    currency: "IDR",
    notes: null,
    pd_project_id: null,
    ...overrides,
  };
}

function plan(
  previous: string | null,
  next: string | null,
  rows: ShipmentExpectedDateInput[],
) {
  return planExpectedDateShipmentShifts({
    poId: "po-1",
    previousExpectedDate: previous,
    nextExpectedDate: next,
    shipments: rows,
    today: TODAY,
  });
}

test("a later expected date keeps the gap between production and departure", () => {
  const result = plan("2026-06-01", "2026-06-10", [
    input(shipment(), [link("po-1", "2026-06-01")]),
  ]);
  assert.equal(result.shifts.length, 1);
  const next = result.shifts[0]!.shipment;
  assert.equal(next.estimated_departure_date, "2026-06-15");
  assert.equal(next.expected_delivery_date, "2026-07-08");
  assert.equal(next.transit_days, 21);
  assert.equal(next.delay_days, 2);
  assert.equal(next.status, "planned");
});

test("an earlier expected date shifts departure and ETA back across a month", () => {
  const result = plan("2026-06-10", "2026-05-28", [
    input(
      shipment({
        estimated_departure_date: "2026-06-15",
        expected_delivery_date: "2026-07-08",
      }),
      [link("po-1", "2026-06-10")],
    ),
  ]);
  const next = result.shifts[0]!.shipment;
  assert.equal(next.estimated_departure_date, "2026-06-02");
  assert.equal(next.expected_delivery_date, "2026-06-25");
});

test("an empty previous expected date sets departure to the new date", () => {
  const result = plan(null, "2026-06-10", [
    input(
      shipment({
        estimated_departure_date: "2026-07-01",
        expected_delivery_date: "2026-07-08",
        transit_days: 7,
        delay_days: 0,
      }),
      [link("po-1", null)],
    ),
  ]);
  const next = result.shifts[0]!.shipment;
  assert.equal(next.estimated_departure_date, "2026-06-10");
  assert.equal(next.expected_delivery_date, "2026-06-17");
  assert.equal(next.transit_days, 7);
  assert.equal(next.delay_days, 0);
});

test("clearing the expected date leaves shipment dates unchanged", () => {
  const result = plan("2026-06-01", null, [
    input(shipment(), [link("po-1", "2026-06-01")]),
  ]);
  assert.deepEqual(result.shifts, []);
  assert.equal(result.skipped[0]?.reason, "expected_date_cleared");
});

test("the same expected date does not shift shipments", () => {
  const result = plan("2026-06-01", "2026-06-01", [
    input(shipment(), [link("po-1", "2026-06-01")]),
  ]);
  assert.deepEqual(result.shifts, []);
  assert.deepEqual(result.skipped, []);
});

test("closed, departed, and received shipments are skipped", () => {
  const rows = [
    input(shipment({ id: "closed", status: "closed" }), [link("po-1", "2026-06-01")]),
    input(
      shipment({ id: "departed", status: "in_transit" }),
      [link("po-1", "2026-06-01")],
    ),
    input(
      shipment({ id: "received", status: "delivered" }),
      [link("po-1", "2026-06-01")],
    ),
    input(
      shipment({
        id: "sailed-today",
        status: "planned",
        estimated_departure_date: TODAY,
      }),
      [link("po-1", "2026-06-01")],
    ),
    input(
      shipment({
        id: "open",
        estimated_departure_date: "2026-06-08",
        expected_delivery_date: "2026-06-29",
      }),
      [link("po-1", "2026-06-01")],
    ),
  ];
  const result = plan("2026-06-01", "2026-06-04", rows);
  assert.deepEqual(
    result.shifts.map((shift) => shift.shipment.id),
    ["open"],
  );
  assert.equal(result.shifts[0]!.shipment.estimated_departure_date, "2026-06-11");
  assert.deepEqual(
    result.skipped.map((skip) => [skip.id, skip.reason]),
    [
      ["closed", "closed"],
      ["departed", "departed"],
      ["received", "received"],
      ["sailed-today", "departed"],
    ],
  );
});

test("a departure that moves to today marks the shipment in transit", () => {
  const result = plan("2026-06-20", "2026-06-01", [
    input(
      shipment({
        estimated_departure_date: "2026-06-20",
        expected_delivery_date: "2026-07-13",
      }),
      [link("po-1", "2026-06-20")],
    ),
  ]);
  const next = result.shifts[0]!.shipment;
  assert.equal(next.estimated_departure_date, TODAY);
  assert.equal(next.status, "in_transit");
});

test("a shared shipment shifts only when this order is the latest open production date", () => {
  const shared = shipment();
  const later = plan("2026-06-01", "2026-06-20", [
    input(shared, [link("po-1", "2026-06-01"), link("po-2", "2026-06-10")]),
  ]);
  assert.equal(later.shifts[0]!.shipment.estimated_departure_date, "2026-06-25");

  const earlier = plan("2026-06-01", "2026-06-08", [
    input(shared, [link("po-1", "2026-06-01"), link("po-2", "2026-06-15")]),
  ]);
  assert.deepEqual(earlier.shifts, []);
  assert.equal(earlier.skipped[0]?.reason, "not_latest_po");

  const tied = plan("2026-06-01", "2026-06-15", [
    input(shared, [link("po-1", "2026-06-01"), link("po-2", "2026-06-15")]),
  ]);
  assert.equal(tied.shifts.length, 1);
  assert.equal(tied.shifts[0]!.shipment.estimated_departure_date, "2026-06-20");
});

test("cancelled and received purchase orders do not hold a shared shipment", () => {
  const shared = shipment();
  const cancelled = plan("2026-06-01", "2026-06-08", [
    input(shared, [
      link("po-1", "2026-06-01"),
      link("po-2", "2026-07-01", "cancelled"),
    ]),
  ]);
  assert.equal(cancelled.shifts.length, 1);

  const received = plan("2026-06-01", "2026-06-08", [
    input(shared, [
      link("po-1", "2026-06-01"),
      link("po-2", "2026-07-01", "received"),
    ]),
  ]);
  assert.equal(received.shifts.length, 1);

  const undated = plan("2026-06-01", "2026-06-08", [
    input(shared, [link("po-1", "2026-06-01"), link("po-2", null, "in_production")]),
  ]);
  assert.equal(undated.shifts.length, 1);
});

test("an empty previous date does not pull a shared shipment ahead of a later order", () => {
  const blocked = plan(null, "2026-06-05", [
    input(shipment(), [link("po-1", null), link("po-2", "2026-06-20")]),
  ]);
  assert.equal(blocked.skipped[0]?.reason, "not_latest_po");

  const takesOver = plan(null, "2026-06-25", [
    input(
      shipment({
        estimated_departure_date: "2026-06-20",
        expected_delivery_date: "2026-07-13",
      }),
      [link("po-1", null), link("po-2", "2026-06-20")],
    ),
  ]);
  assert.equal(
    takesOver.shifts[0]!.shipment.estimated_departure_date,
    "2026-06-25",
  );
  assert.equal(takesOver.shifts[0]!.shipment.expected_delivery_date, "2026-07-18");
});

test("the procurement list shows the shifted ship start and end and rolls them back", () => {
  const linked = shipment({
    linked_purchase_orders: [link("po-1", "2026-06-01"), link("po-2", "2026-05-20")],
  });
  const orders = [
    po({ shipments: [linked] }),
    po({
      id: "po-2",
      po_number: "PO-2",
      expected_date: "2026-05-20",
      shipments: [linked],
    }),
  ];
  const shifted = shiftPurchaseOrdersForExpectedDate(
    orders,
    "po-1",
    "2026-06-10",
    TODAY,
  );
  assert.equal(shifted[0]?.expected_date, "2026-06-10");
  assert.equal(shifted[1]?.expected_date, "2026-05-20");
  assert.equal(shifted[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-15");
  assert.equal(shifted[0]?.shipments?.[0]?.expected_delivery_date, "2026-07-08");
  assert.equal(shifted[1]?.shipments?.[0]?.estimated_departure_date, "2026-06-15");
  assert.equal(
    shifted[1]?.shipments?.[0]?.linked_purchase_orders?.[0]?.expected_date,
    "2026-06-10",
  );

  const restored = restorePurchaseOrderExpectedDate(
    shifted,
    "po-1",
    "2026-06-01",
    [linked],
  );
  assert.equal(restored[0]?.expected_date, "2026-06-01");
  assert.equal(restored[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-06");
  assert.equal(restored[1]?.shipments?.[0]?.expected_delivery_date, "2026-06-29");
});

test("a shared shipment stays put when another open order finishes later", () => {
  const linked = shipment({
    linked_purchase_orders: [link("po-1", "2026-06-01"), link("po-2", "2026-06-20")],
  });
  const shifted = shiftPurchaseOrdersForExpectedDate(
    [po({ shipments: [linked] })],
    "po-1",
    "2026-06-08",
    TODAY,
  );
  assert.equal(shifted[0]?.expected_date, "2026-06-08");
  assert.equal(shifted[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-06");
  assert.equal(shifted[0]?.shipments?.[0]?.expected_delivery_date, "2026-06-29");
});

test("the saved shipment dates replace an optimistic shift the server skipped", () => {
  const original = shipment();
  const optimistic = shiftPurchaseOrdersForExpectedDate(
    [po({ shipments: [original] })],
    "po-1",
    "2026-06-04",
    TODAY,
  );
  assert.equal(optimistic[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-09");

  const corrected = applySavedPurchaseOrderDates(optimistic, {
    ...po({ expected_date: "2026-06-04" }),
    shipments: [
      {
        ...original,
        linked_purchase_orders: [
          link("po-1", "2026-06-04"),
          link("po-2", "2026-06-20"),
        ],
      },
    ],
  });
  assert.equal(corrected[0]?.expected_date, "2026-06-04");
  assert.equal(corrected[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-06");
  assert.equal(corrected[0]?.shipments?.[0]?.expected_delivery_date, "2026-06-29");
  assert.equal(
    corrected[0]?.shipments?.[0]?.linked_purchase_orders?.[1]?.expected_date,
    "2026-06-20",
  );
});

test("a cleared date keeps the shifted departure, and the next date then prefills it", () => {
  const orders = [
    po({
      shipments: [
        shipment({
          linked_purchase_orders: [link("po-1", "2026-06-01")],
        }),
      ],
    }),
  ];
  const moved = shiftPurchaseOrdersForExpectedDate(orders, "po-1", "2026-06-05", TODAY);
  const cleared = shiftPurchaseOrdersForExpectedDate(moved, "po-1", null, TODAY);
  assert.equal(cleared[0]?.expected_date, null);
  assert.equal(cleared[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-10");
  const reset = shiftPurchaseOrdersForExpectedDate(cleared, "po-1", "2026-06-12", TODAY);
  assert.equal(reset[0]?.shipments?.[0]?.estimated_departure_date, "2026-06-12");
  assert.equal(reset[0]?.shipments?.[0]?.expected_delivery_date, "2026-07-05");
});

test("editing ship start or ship end does not change the purchase order expected date", () => {
  const start = patchShipmentWindow(shipment(), "start", "2026-07-01");
  const end = patchShipmentWindow(shipment(), "end", "2026-07-20");
  assert.ok(!("error" in start) && !("error" in end));
  if ("error" in start || "error" in end) return;
  assert.equal("expected_date" in start.body, false);
  assert.equal("expected_date" in end.body, false);
  assert.deepEqual(Object.keys(start.body), ["estimated_departure_date"]);
  assert.deepEqual(Object.keys(end.body).sort(), ["delay_days", "transit_days"]);
});
