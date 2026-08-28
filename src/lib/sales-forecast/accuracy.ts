/** Plan vs actual observation for WMAPE / bias. */
export type AccuracyPoint = {
  plan: number;
  actual: number;
};

export type AccuracyMetrics = {
  plan_total: number;
  actual_total: number;
  wmape: number | null;
  bias: number | null;
  point_count: number;
};

/** WMAPE = sum(|plan − actual|) / sum(actual) as a percent. */
export function wmape(points: AccuracyPoint[]): number | null {
  let absErr = 0;
  let actualSum = 0;
  for (const p of points) {
    absErr += Math.abs(p.plan - p.actual);
    actualSum += p.actual;
  }
  if (actualSum <= 0) return null;
  return (absErr / actualSum) * 100;
}

/** Bias % = sum(plan − actual) / sum(actual). Positive = over-forecast. */
export function biasPct(points: AccuracyPoint[]): number | null {
  let err = 0;
  let actualSum = 0;
  for (const p of points) {
    err += p.plan - p.actual;
    actualSum += p.actual;
  }
  if (actualSum <= 0) return null;
  return (err / actualSum) * 100;
}

export function summarizeAccuracy(points: AccuracyPoint[]): AccuracyMetrics {
  let plan_total = 0;
  let actual_total = 0;
  for (const p of points) {
    plan_total += p.plan;
    actual_total += p.actual;
  }
  return {
    plan_total,
    actual_total,
    wmape: wmape(points),
    bias: biasPct(points),
    point_count: points.length,
  };
}

/** Completed months in `year` relative to "now" (1–12). */
export function completedMonthsInYear(
  year: number,
  now: Date = new Date(),
): number[] {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year > currentYear) return [];
  if (year < currentYear) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
  const months: number[] = [];
  for (let m = 1; m < currentMonth; m += 1) months.push(m);
  return months;
}
