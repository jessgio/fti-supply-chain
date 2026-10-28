import assert from "node:assert/strict";
import test from "node:test";
import {
  anotherApSubmissionAllowed,
  badgePatchAfterConflict,
  larkRemarksForAdditionalAttempt,
  poLarkBadgeConflict,
  saveLatestPoLarkBadge,
  submissionInsertConflict,
} from "./additional-ap-submission";

test("a purchase order that already has an AP form can store another", () => {
  assert.equal(
    anotherApSubmissionAllowed({
      existingInstanceCodes: ["inst-down-payment"],
      newInstanceCode: "inst-balance",
    }),
    true,
  );
  assert.equal(
    anotherApSubmissionAllowed({
      existingInstanceCodes: ["inst-down-payment"],
      newInstanceCode: "inst-down-payment",
    }),
    false,
  );
});

test("a unique badge clash is not a failed submission", async () => {
  const serialError = {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "purchase_orders_lark_serial_number_uidx"',
  };
  assert.equal(poLarkBadgeConflict(serialError), "serial");

  const attempts: Array<string | null> = [];
  const saved = await saveLatestPoLarkBadge(
    {
      lark_instance_code: "inst-balance",
      lark_serial_number: "202610280002",
    },
    async (patch) => {
      attempts.push(patch.lark_serial_number ?? null);
      if (patch.lark_serial_number) return serialError;
      return null;
    },
  );

  assert.equal(saved, null);
  assert.deepEqual(attempts, ["202610280002", null]);
});

test("an instance already stored on the history table is recognized", () => {
  assert.equal(
    submissionInsertConflict({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "purchase_order_lark_submissions_instance_uidx"',
    }),
    "instance",
  );
  assert.equal(
    badgePatchAfterConflict(
      { lark_instance_code: "inst-2", lark_serial_number: "S2" },
      "instance",
    ),
    null,
  );
});

test("a retried create changes the remarks so Lark opens a new form", () => {
  assert.equal(larkRemarksForAdditionalAttempt("PO 100", 0, "abc"), "PO 100");
  assert.match(
    larkRemarksForAdditionalAttempt("PO 100", 1, "abc"),
    /PO 100\nAdditional AP form abc/,
  );
});
