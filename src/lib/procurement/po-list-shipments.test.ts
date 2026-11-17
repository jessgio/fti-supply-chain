import assert from "node:assert/strict";
import test from "node:test";
import {
  addIsoDays,
  canLogShipmentFromList,
  mapPoListShipments,
  mergePurchaseOrderUpdate,
  patchDesiredWindow,
  patchShipmentWindow,
  procurementListShipment,
  withShipmentSummary,
} from "./po-list-shipments";
import type { PoListShipment, PurchaseOrder } from "@/types/database";

function shipment(overrides: Partial<PoListShipment> = {}): PoListShipment {
  return {
    id: "s1",
    shipment_number: "SH-1",
    shipment_type: "sea",
    status: "planned",
    estimated_departure_date: "2026-06-01",
    expected_delivery_date: "2026-06-22",
    transit_days: 21,
    delay_days: 0,
    ...overrides,
  };
}

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-1",
    supplier_id: null,
    status: "ordered",
    order_date: "2026-05-01",
    expected_date: "2026-06-15",
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

test("addIsoDays crosses month boundaries without a timezone shift", () => {
  assert.equal(addIsoDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addIsoDays("2026-03-01", -1), "2026-02-28");
});

test("mapPoListShipments reads the purchase order embed and sorts by departure", () => {
  const rows = mapPoListShipments([
    {
      shipments: {
        id: "later",
        shipment_number: "SH-2",
        shipment_type: "air",
        status: "in_transit",
        estimated_departure_date: "2026-05-02T00:00:00+00:00",
        expected_delivery_date: "2026-05-09",
        transit_days: "7",
        delay_days: 0,
      },
    },
    {
      shipments: [
        {
          id: "sooner",
          shipment_number: "SH-1",
          shipment_type: "sea",
          status: "planned",
          estimated_departure_date: "2026-04-01",
          expected_delivery_date: "2026-04-22",
          transit_days: 21,
          delay_days: 1,
        },
      ],
    },
    { shipments: null },
    { shipments: { id: "sooner" } },
  ]);

  assert.deepEqual(
    rows.map((row) => row.id),
    ["sooner", "later"],
  );
  assert.equal(rows[0]?.delay_days, 1);
  assert.equal(rows[1]?.transit_days, 7);
  assert.equal(rows[1]?.shipment_type, "air");
  assert.equal(rows[1]?.estimated_departure_date, "2026-05-02");
});

test("mapPoListShipments reads linked purchase order production dates", () => {
  const rows = mapPoListShipments([
    {
      shipments: {
        id: "shared",
        shipment_number: "SH-1",
        shipment_type: "sea",
        status: "planned",
        estimated_departure_date: "2026-06-01",
        expected_delivery_date: "2026-06-22",
        transit_days: 21,
        delay_days: 0,
        shipment_purchase_orders: [
          {
            po_id: "po-1",
            purchase_orders: {
              id: "po-1",
              expected_date: "2026-06-01T00:00:00+00:00",
              status: "ordered",
            },
          },
          {
            po_id: "po-2",
            purchase_orders: {
              id: "po-2",
              expected_date: null,
              status: "cancelled",
            },
          },
        ],
      },
    },
  ]);
  assert.deepEqual(rows[0]?.linked_purchase_orders, [
    { id: "po-1", expected_date: "2026-06-01", status: "ordered" },
    { id: "po-2", expected_date: null, status: "cancelled" },
  ]);
});

test("procurementListShipment edits the soonest open shipment", () => {
  const chosen = procurementListShipment([
    shipment({
      id: "closed-early",
      shipment_number: "SH-0",
      status: "closed",
      estimated_departure_date: "2026-01-01",
      expected_delivery_date: "2026-01-20",
    }),
    shipment({
      id: "later",
      shipment_number: "SH-3",
      estimated_departure_date: "2026-08-01",
      expected_delivery_date: "2026-08-22",
    }),
    shipment({
      id: "next",
      shipment_number: "SH-2",
      estimated_departure_date: "2026-07-01",
      expected_delivery_date: "2026-07-22",
    }),
  ]);
  assert.equal(chosen?.id, "next");
});

test("procurementListShipment shows the latest shipment when all are closed", () => {
  const chosen = procurementListShipment([
    shipment({
      id: "old",
      status: "closed",
      estimated_departure_date: "2026-01-01",
    }),
    shipment({
      id: "new",
      shipment_number: "SH-9",
      status: "closed",
      estimated_departure_date: "2026-03-01",
    }),
  ]);
  assert.equal(chosen?.id, "new");
});

test("ship start keeps the transit and delay window", () => {
  const patch = patchShipmentWindow(
    shipment({ delay_days: 2 }),
    "start",
    "2020-01-01",
  );
  assert.ok(!("error" in patch));
  if ("error" in patch) return;
  assert.deepEqual(patch.body, { estimated_departure_date: "2020-01-01" });
  assert.equal(patch.next.expected_delivery_date, "2020-01-24");
  assert.equal(patch.next.status, "in_transit");
});

test("ship end lengthens the window with delay days", () => {
  const patch = patchShipmentWindow(shipment(), "end", "2026-07-01");
  assert.ok(!("error" in patch));
  if ("error" in patch) return;
  assert.equal(patch.next.transit_days, 21);
  assert.equal(patch.next.delay_days, 9);
  assert.deepEqual(patch.body, { transit_days: 21, delay_days: 9 });
  assert.equal(patch.next.expected_delivery_date, "2026-07-01");
});

test("ship end shortens transit when the new arrival is inside the current transit", () => {
  const patch = patchShipmentWindow(shipment(), "end", "2026-06-10");
  assert.ok(!("error" in patch));
  if ("error" in patch) return;
  assert.equal(patch.next.transit_days, 9);
  assert.equal(patch.next.delay_days, 0);
});

test("ship end before departure is rejected", () => {
  const patch = patchShipmentWindow(shipment(), "end", "2026-05-01");
  assert.equal(
    "error" in patch ? patch.error : "",
    "Ship end has to be on or after the ship start date.",
  );
});

test("closed shipments are not editable", () => {
  const patch = patchShipmentWindow(
    shipment({ status: "closed" }),
    "start",
    "2026-08-01",
  );
  assert.equal("error" in patch, true);
});

test("a queued start and end are saved as one shipment update", () => {
  const patch = patchDesiredWindow(shipment(), {
    start: "2026-06-05",
    end: "2026-07-01",
  });
  assert.ok(!("error" in patch));
  if ("error" in patch) return;
  assert.equal(patch.body.estimated_departure_date, "2026-06-05");
  assert.equal(patch.next.expected_delivery_date, "2026-07-01");
  assert.equal(
    (patch.body.transit_days ?? 0) + (patch.body.delay_days ?? 0),
    26,
  );
});

test("canLogShipmentFromList matches the purchase order log-shipment rule", () => {
  assert.equal(canLogShipmentFromList(po({ shipments: [] })), true);
  assert.equal(
    canLogShipmentFromList(po({ shipments: [], status: "cancelled" })),
    false,
  );
  assert.equal(
    canLogShipmentFromList(po({ shipments: [], status: "received" })),
    false,
  );
  assert.equal(canLogShipmentFromList(po({ shipments: [shipment()] })), false);
  assert.equal(canLogShipmentFromList(po()), false);
});

test("list updates keep embedded shipments and replace a linked shipment", () => {
  const current = po({ shipments: [shipment()], lines: [] });
  const merged = mergePurchaseOrderUpdate(current, {
    ...current,
    expected_date: "2026-07-01",
    shipments: undefined,
    lines: undefined,
  });
  assert.equal(merged.expected_date, "2026-07-01");
  assert.equal(merged.shipments?.[0]?.id, "s1");

  const created = shipment({ id: "s2", shipment_number: "SH-2" });
  const withNew = withShipmentSummary([po({ shipments: [] })], created, ["po-1"]);
  assert.equal(withNew[0]?.shipments?.[0]?.id, "s2");

  const replaced = withShipmentSummary(withNew, { ...created, delay_days: 4 }, []);
  assert.equal(replaced[0]?.shipments?.[0]?.delay_days, 4);

  const withLinks = shipment({
    linked_purchase_orders: [
      { id: "po-1", expected_date: "2026-06-15", status: "ordered" },
    ],
  });
  const kept = withShipmentSummary(
    [po({ shipments: [withLinks] })],
    { ...withLinks, delay_days: 4, linked_purchase_orders: undefined },
    [],
  );
  assert.equal(kept[0]?.shipments?.[0]?.linked_purchase_orders?.[0]?.id, "po-1");
});
