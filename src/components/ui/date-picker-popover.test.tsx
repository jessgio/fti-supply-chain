import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarDays } from "./date-picker-popover";

test("calendar weeks start on Monday", () => {
  const days = buildCalendarDays(new Date(2026, 5, 1));
  assert.equal(days.length, 42);
  assert.equal(days[0]?.getDay(), 1);
  assert.equal(days[0]?.getDate(), 1);
  assert.equal(days[0]?.getMonth(), 5);
  assert.equal(days[41]?.getMonth(), 6);
});
