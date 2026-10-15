import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOpenShipmentArrivalDates,
  toOutstandingShipmentAllocations,
} from "./open-batch-arrivals";

test("shipment expected delivery replaces the PO date for quantity not yet inbounded", () => {
  const [navy, green] = applyOpenShipmentArrivalDates(
    [
      {
        line_id: "navy-line",
        sku_code: "MER-BASEBALLCAP-NAVY",
        open_qty: 279,
        expected_date: "2026-09-21",
      },
      {
        line_id: "green-line",
        sku_code: "MER-BASEBALLCAP-GREEN",
        open_qty: 274,
        expected_date: "2026-09-21",
      },
    ],
    [
      {
        po_line_id: "navy-line",
        shipment_id: "ship-oct",
        outstanding_qty: 279,
        expected_delivery_date: "2026-10-19",
      },
      {
        po_line_id: "green-line",
        shipment_id: "ship-oct",
        outstanding_qty: 274,
        expected_delivery_date: "2026-10-19",
      },
    ],
  );

  assert.equal(navy.expected_date, "2026-10-19");
  assert.equal(navy.open_qty, 279);
  assert.equal(green.expected_date, "2026-10-19");
  assert.equal(green.open_qty, 274);
});

test("unshipped remainder keeps the purchase order expected date", () => {
  const batches = applyOpenShipmentArrivalDates(
    [
      {
        line_id: "line-1",
        open_qty: 100,
        expected_date: "2026-09-21",
      },
    ],
    [
      {
        po_line_id: "line-1",
        shipment_id: "ship-oct",
        outstanding_qty: 40,
        expected_delivery_date: "2026-10-19",
      },
    ],
  );

  assert.deepEqual(
    batches.map((batch) => ({
      qty: batch.open_qty,
      date: batch.expected_date,
      key: batch.batch_key,
    })),
    [
      { qty: 40, date: "2026-10-19", key: "line-1:ship-oct" },
      { qty: 60, date: "2026-09-21", key: "line-1:unshipped" },
    ],
  );
});

test("earliest open shipment is the next batch when a line is split", () => {
  const batches = applyOpenShipmentArrivalDates(
    [
      {
        line_id: "line-1",
        open_qty: 80,
        expected_date: "2026-11-01",
      },
    ],
    [
      {
        po_line_id: "line-1",
        shipment_id: "later",
        outstanding_qty: 50,
        expected_delivery_date: "2026-12-01",
      },
      {
        po_line_id: "line-1",
        shipment_id: "sooner",
        outstanding_qty: 30,
        expected_delivery_date: "2026-10-19",
      },
    ],
  );

  const earliest = batches.reduce((min, batch) =>
    batch.expected_date && batch.expected_date < min
      ? batch.expected_date
      : min,
  batches[0].expected_date!);

  assert.equal(earliest, "2026-10-19");
  assert.equal(
    batches.reduce((sum, batch) => sum + batch.open_qty, 0),
    80,
  );
});

test("a line with no open shipment keeps the purchase order expected date", () => {
  const [batch] = applyOpenShipmentArrivalDates(
    [
      {
        line_id: "line-1",
        open_qty: 10,
        expected_date: "2026-09-21",
      },
    ],
    [],
  );

  assert.equal(batch.expected_date, "2026-09-21");
  assert.equal(batch.batch_key, "line-1");
});

test("closed and fully received shipments are not incoming", () => {
  const allocations = toOutstandingShipmentAllocations([
    {
      po_line_id: "line-1",
      shipment_id: "closed-ship",
      quantity: 100,
      status: "closed",
      expected_delivery_date: "2026-09-21",
      received_qty: 100,
    },
    {
      po_line_id: "line-1",
      shipment_id: "partial-ship",
      quantity: 100,
      status: "delivered",
      expected_delivery_date: "2026-10-19",
      received_qty: 40,
    },
    {
      po_line_id: "line-2",
      shipment_id: "received-ship",
      quantity: 20,
      status: "in_transit",
      expected_delivery_date: "2026-10-19",
      received_qty: 20,
    },
  ]);

  assert.deepEqual(allocations, [
    {
      po_line_id: "line-1",
      shipment_id: "partial-ship",
      outstanding_qty: 60,
      expected_delivery_date: "2026-10-19",
    },
  ]);
});
