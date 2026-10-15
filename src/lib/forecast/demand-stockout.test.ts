import assert from "node:assert/strict";
import test from "node:test";
import { addDays, format, parseISO } from "date-fns";
import {
  classifyDemandPattern,
  computeForecastDaily,
  formatExcludedStockoutMonths,
  selectExcludedStockoutMonths,
} from "./demand";

const REFERENCE = new Date(2026, 9, 15);

function seriesFromMonthly(
  totals: Record<string, number>,
  from = "2026-04-01",
  to = "2026-09-30",
) {
  const points: { date: string; qty: number }[] = [];
  let cursor = parseISO(from);
  const end = parseISO(to);
  while (cursor <= end) {
    const date = format(cursor, "yyyy-MM-dd");
    const qty = date.endsWith("-01") ? (totals[date.slice(0, 7)] ?? 0) : 0;
    points.push({ date, qty });
    cursor = addDays(cursor, 1);
  }
  return points;
}

const green = seriesFromMonthly({
  "2026-06": 283,
  "2026-07": 334,
  "2026-08": 541,
  "2026-09": 27,
});

const navy = seriesFromMonthly({
  "2026-06": 111,
  "2026-07": 271,
  "2026-08": 663,
  "2026-09": 37,
});

test("September stockout is left out of the baseball-cap forecast", () => {
  const excluded = selectExcludedStockoutMonths(green, REFERENCE);
  assert.deepEqual(excluded, ["2026-09"]);
  assert.equal(formatExcludedStockoutMonths(excluded), "Sep out of stock");

  const adjusted = computeForecastDaily(green, REFERENCE, new Set(excluded));
  const unadjusted = computeForecastDaily(green, REFERENCE);
  // Jul + Aug only. September's 27 units and 30 days stay out.
  assert.ok(Math.abs(adjusted.l3m - 875 / 62) < 1e-9);
  assert.ok(Math.abs(adjusted.l6m - 1158 / 92) < 1e-9);
  assert.ok(adjusted.forecast > unadjusted.forecast);
});

test("a low launch month stays in and the later stockout drops", () => {
  const excluded = selectExcludedStockoutMonths(navy, REFERENCE);
  assert.deepEqual(excluded, ["2026-09"]);
  assert.equal(
    selectExcludedStockoutMonths(
      seriesFromMonthly({
        "2026-06": 20,
        "2026-07": 100,
        "2026-08": 110,
        "2026-09": 105,
      }),
      REFERENCE,
    ).length,
    0,
  );
});

test("a healthy warehouse snapshot keeps a sales dip", () => {
  const excluded = selectExcludedStockoutMonths(
    green,
    REFERENCE,
    new Map([["2026-09", 500]]),
  );
  assert.deepEqual(excluded, []);
});

test("a near-zero snapshot drops a month the sales test would keep", () => {
  const points = seriesFromMonthly({
    "2026-04": 100,
    "2026-05": 100,
    "2026-06": 100,
    "2026-07": 100,
    "2026-08": 100,
    "2026-09": 80,
  });
  assert.deepEqual(selectExcludedStockoutMonths(points, REFERENCE), []);
  assert.deepEqual(
    selectExcludedStockoutMonths(points, REFERENCE, new Map([["2026-09", 0]])),
    ["2026-09"],
  );
});

test("fewer than two remaining months falls back to the unadjusted rate", () => {
  const points = seriesFromMonthly({
    "2026-08": 100,
    "2026-09": 5,
  });
  const excluded = selectExcludedStockoutMonths(
    points,
    REFERENCE,
    new Map([
      ["2026-08", 0],
      ["2026-09", 0],
    ]),
  );
  assert.deepEqual(excluded, []);
});

test("one stockout month does not by itself mark demand volatile", () => {
  assert.equal(
    classifyDemandPattern(green, "2026-06-01", REFERENCE),
    "volatile",
  );
  assert.equal(
    classifyDemandPattern(green, "2026-06-01", REFERENCE, new Set(["2026-09"])),
    "steady",
  );
});
