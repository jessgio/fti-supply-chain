import {
  addDays,
  format,
  parseISO,
  subDays,
  subMonths,
} from "date-fns";

export type SeasonId = "ramadan" | "q4";

export interface SeasonalPeriod {
  id: SeasonId;
  label: string;
  start: string;
  end: string;
}

interface DemandPoint {
  date: string;
  qty: number;
}

/** Ramadan core window (Indonesia). Extend table as years are added. */
const RAMADAN_CORE: Record<number, { start: string; end: string }> = {
  2023: { start: "2023-03-23", end: "2023-04-21" },
  2024: { start: "2024-03-11", end: "2024-04-09" },
  2025: { start: "2025-03-01", end: "2025-03-29" },
  2026: { start: "2026-02-18", end: "2026-03-19" },
  2027: { start: "2027-02-08", end: "2027-03-09" },
  2028: { start: "2028-01-28", end: "2028-02-26" },
  2029: { start: "2029-01-16", end: "2029-02-14" },
  2030: { start: "2030-01-06", end: "2030-02-04" },
};

/** Days before Ramadan when pre-festive buying ramps up. */
export const RAMADAN_PREP_DAYS = 60;
/** Days after Ramadan for Lebaran / post-Eid demand. */
export const RAMADAN_TAIL_DAYS = 14;

/** Default uplift when prior-year sales are unavailable. */
export const DEFAULT_RAMADAN_UPLIFT = 1.35;
export const DEFAULT_Q4_UPLIFT = 1.25;
export const MIN_UPLIFT = 1;
export const MAX_UPLIFT = 2;

function expandRamadanPeriod(year: number): SeasonalPeriod | null {
  const core = RAMADAN_CORE[year];
  if (!core) return null;
  const start = format(
    subDays(parseISO(core.start), RAMADAN_PREP_DAYS),
    "yyyy-MM-dd",
  );
  const end = format(
    addDays(parseISO(core.end), RAMADAN_TAIL_DAYS),
    "yyyy-MM-dd",
  );
  return { id: "ramadan", label: `Ramadan ${year}`, start, end };
}

function q4Period(year: number): SeasonalPeriod {
  return {
    id: "q4",
    label: `Q4 ${year}`,
    start: `${year}-10-01`,
    end: `${year}-12-31`,
  };
}

function isWithinPlanningHorizon(
  referenceDate: Date,
  period: SeasonalPeriod,
  lookaheadDays: number,
): boolean {
  const periodStart = parseISO(period.start);
  const horizonStart = subDays(periodStart, lookaheadDays);
  const periodEnd = parseISO(period.end);
  return referenceDate >= horizonStart && referenceDate <= periodEnd;
}

/** Seasons whose peak falls inside the reorder lead window from referenceDate. */
export function getActiveSeasons(
  referenceDate = new Date(),
  lookaheadDays: number,
): SeasonalPeriod[] {
  const year = referenceDate.getFullYear();
  const active: SeasonalPeriod[] = [];

  for (const y of [year - 1, year, year + 1]) {
    const ramadan = expandRamadanPeriod(y);
    if (
      ramadan &&
      isWithinPlanningHorizon(referenceDate, ramadan, lookaheadDays)
    ) {
      active.push(ramadan);
    }
    const q4 = q4Period(y);
    if (isWithinPlanningHorizon(referenceDate, q4, lookaheadDays)) {
      active.push(q4);
    }
  }

  return active;
}

function avgDailyInWindow(
  points: DemandPoint[],
  start: string,
  end: string,
): number | null {
  const inWindow = points.filter((p) => p.date >= start && p.date <= end);
  if (inWindow.length === 0) return null;
  const total = inWindow.reduce((sum, p) => sum + p.qty, 0);
  const dayCount =
    Math.floor(
      (parseISO(end).getTime() - parseISO(start).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  return dayCount > 0 ? total / dayCount : null;
}

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseISO(dateStr);
  d.setFullYear(d.getFullYear() + deltaYears);
  return format(d, "yyyy-MM-dd");
}

function isInsideAnySeason(dateStr: string, seasons: SeasonalPeriod[]): boolean {
  return seasons.some((s) => dateStr >= s.start && dateStr <= s.end);
}

function baselineAvgDaily(
  points: DemandPoint[],
  start: string,
  end: string,
  excludeSeasons: SeasonalPeriod[],
): number | null {
  const filtered = points.filter(
    (p) =>
      p.date >= start &&
      p.date <= end &&
      p.qty >= 0 &&
      !isInsideAnySeason(p.date, excludeSeasons),
  );
  if (filtered.length === 0) return null;
  const total = filtered.reduce((sum, p) => sum + p.qty, 0);
  const dayCount =
    Math.floor(
      (parseISO(end).getTime() - parseISO(start).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  return dayCount > 0 ? total / dayCount : null;
}

function defaultUpliftFor(seasonId: SeasonId): number {
  return seasonId === "ramadan" ? DEFAULT_RAMADAN_UPLIFT : DEFAULT_Q4_UPLIFT;
}

function clampUplift(value: number): number {
  return Math.min(MAX_UPLIFT, Math.max(MIN_UPLIFT, value));
}

/** Prior-year season vs baseline; null when history is too thin. */
export function historicalSeasonalMultiplier(
  points: DemandPoint[],
  season: SeasonalPeriod,
  referenceDate = new Date(),
): number | null {
  const priorStart = shiftYear(season.start, -1);
  const priorEnd = shiftYear(season.end, -1);
  if (parseISO(priorEnd) >= referenceDate) return null;

  const seasonAvg = avgDailyInWindow(points, priorStart, priorEnd);
  if (seasonAvg === null || seasonAvg <= 0) return null;

  const baselineEnd = format(subDays(parseISO(priorStart), 1), "yyyy-MM-dd");
  const baselineStart = format(
    subMonths(parseISO(baselineEnd), 6),
    "yyyy-MM-dd",
  );
  const knownSeasons = [season, q4Period(parseISO(priorStart).getFullYear())];
  const ramadan = expandRamadanPeriod(parseISO(priorStart).getFullYear());
  if (ramadan) knownSeasons.push(ramadan);

  const baselineAvg = baselineAvgDaily(
    points,
    baselineStart,
    baselineEnd,
    knownSeasons,
  );
  if (baselineAvg === null || baselineAvg <= 0) return null;

  const ratio = seasonAvg / baselineAvg;
  if (ratio < 1.05) return null;
  return clampUplift(ratio);
}

export interface SeasonalUpliftResult {
  multiplier: number;
  reasons: string[];
}

/**
 * Uplift factor for Fcst/day when reorder lead time overlaps Ramadan or Q4.
 * Uses prior-year SKU sales when available; otherwise Indonesian market defaults.
 */
export function computeSeasonalUplift(
  points: DemandPoint[],
  referenceDate = new Date(),
  lookaheadDays: number,
): SeasonalUpliftResult {
  const active = getActiveSeasons(referenceDate, lookaheadDays);
  if (active.length === 0) {
    return { multiplier: 1, reasons: [] };
  }

  let bestMultiplier = 1;
  const reasons: string[] = [];

  for (const season of active) {
    const historical = historicalSeasonalMultiplier(
      points,
      season,
      referenceDate,
    );
    const multiplier = clampUplift(
      historical ?? defaultUpliftFor(season.id),
    );
    if (multiplier > bestMultiplier) {
      bestMultiplier = multiplier;
    }
    if (multiplier > 1) {
      const pct = Math.round((multiplier - 1) * 100);
      reasons.push(
        historical != null
          ? `${season.label} (+${pct}% from history)`
          : `${season.label} (+${pct}% default)`,
      );
    }
  }

  return {
    multiplier: bestMultiplier,
    reasons: [...new Set(reasons)],
  };
}
