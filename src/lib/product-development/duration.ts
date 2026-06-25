import type { PdDurationMode } from "@/types/database";

const MS_PER_DAY = 86_400_000;

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addCalendarDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

/** Advance to the next weekday when start lands on a weekend (working-day schedules). */
export function normalizeWorkingStart(d: Date): Date {
  const next = new Date(d);
  while (!isWeekday(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** Move back to the previous weekday when end lands on a weekend (working-day schedules). */
export function normalizeWorkingEnd(d: Date): Date {
  const next = new Date(d);
  while (!isWeekday(next)) {
    next.setDate(next.getDate() - 1);
  }
  return next;
}

/**
 * Add N effective (calendar) days inclusively.
 * Duration 1 → end is the same day as start.
 */
export function addEffectiveDays(start: Date, durationDays: number): Date {
  if (durationDays <= 1) return new Date(start);
  return addCalendarDays(start, durationDays - 1);
}

/**
 * Add N working days (Mon–Fri) inclusively.
 * Duration 1 on a weekday → end is that same day.
 */
export function addWorkingDays(start: Date, durationDays: number): Date {
  if (durationDays <= 0) return new Date(start);
  let current = normalizeWorkingStart(new Date(start));
  let remaining = durationDays - 1;
  while (remaining > 0) {
    current = addCalendarDays(current, 1);
    if (isWeekday(current)) remaining -= 1;
  }
  return current;
}

export function calculateEndDate(
  start: Date,
  durationDays: number,
  mode: PdDurationMode,
): Date {
  if (durationDays <= 0) return new Date(start);
  return mode === "effective_days"
    ? addEffectiveDays(start, durationDays)
    : addWorkingDays(start, durationDays);
}

export function subtractCalendarDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() - days);
  return next;
}

/**
 * Subtract N effective (calendar) days inclusively.
 * Duration 1 → start is the same day as end.
 */
export function subtractEffectiveDays(end: Date, durationDays: number): Date {
  if (durationDays <= 1) return new Date(end);
  return subtractCalendarDays(end, durationDays - 1);
}

/**
 * Subtract N working days (Mon–Fri) inclusively backward from end.
 */
export function subtractWorkingDays(end: Date, durationDays: number): Date {
  if (durationDays <= 0) return new Date(end);
  let current = normalizeWorkingEnd(new Date(end));
  let remaining = durationDays - 1;
  while (remaining > 0) {
    current = subtractCalendarDays(current, 1);
    if (isWeekday(current)) remaining -= 1;
  }
  return current;
}

export function calculateStartDate(
  end: Date,
  durationDays: number,
  mode: PdDurationMode,
): Date {
  if (durationDays <= 0) return new Date(end);
  return mode === "effective_days"
    ? subtractEffectiveDays(end, durationDays)
    : subtractWorkingDays(end, durationDays);
}

/**
 * Parse duration text such as "14 days", "3 mons", "2 wks", "14 edays".
 * Returns day count and whether the text implies effective (elapsed) days.
 */
export function parseDurationText(text: string): {
  days: number | null;
  impliesEffective: boolean;
} {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return { days: null, impliesEffective: false };

  const match = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*(eday|edays|effective|eff|d|day|days|wk|wks|week|weeks|mon|mons|month|months)?$/,
  );
  if (!match) return { days: null, impliesEffective: false };

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return { days: null, impliesEffective: false };

  const unit = match[2] ?? "days";
  let days = value;
  let impliesEffective = false;

  if (unit === "eday" || unit === "edays" || unit === "effective" || unit === "eff") {
    impliesEffective = true;
  } else if (unit.startsWith("wk") || unit.startsWith("week")) {
    days = value * 7;
  } else if (unit.startsWith("mon") || unit.startsWith("month")) {
    days = value * 30;
  }

  return { days: Math.max(1, Math.round(days)), impliesEffective };
}

export function calcEndDateFromInputs(
  startDate: string | null,
  durationText: string,
  durationDays: number | null,
  mode: PdDurationMode,
): string | null {
  const start = parseDate(startDate);
  if (!start) return null;

  const parsed = parseDurationText(durationText);
  const days = durationDays ?? parsed.days;
  if (!days || days < 1) return null;

  return formatIsoDate(calculateEndDate(start, days, mode));
}

export function calcStartDateFromInputs(
  endDate: string | null,
  durationText: string,
  durationDays: number | null,
  mode: PdDurationMode,
): string | null {
  const end = parseDate(endDate);
  if (!end) return null;

  const parsed = parseDurationText(durationText);
  const days = durationDays ?? parsed.days;
  if (!days || days < 1) return null;

  return formatIsoDate(calculateStartDate(end, days, mode));
}

/** Resolve duration days from explicit text or infer from an existing start/end span. */
export function resolveDurationDaysForRow(input: {
  duration_text: string;
  duration_mode: PdDurationMode;
  start_date: string | null;
  end_date: string | null;
}): number | null {
  const parsed = parseDurationText(input.duration_text);
  if (parsed.days) return parsed.days;
  if (input.start_date && input.end_date) {
    return inferDurationDaysFromSpan(
      input.start_date,
      input.end_date,
      input.duration_mode,
    );
  }
  return null;
}

/**
 * Recalculate the non-anchored schedule date from duration + day type.
 * End-anchored rows update start; all others update finish from start when possible.
 */
export function recalculateRowScheduleDates(row: {
  start_date: string | null;
  end_date: string | null;
  duration_text: string;
  duration_mode: PdDurationMode;
  date_anchor?: "start" | "end" | null;
}): Partial<{ start_date: string; end_date: string }> {
  const days = resolveDurationDaysForRow(row);
  if (!days || days < 1) return {};

  if (row.date_anchor === "end" && row.end_date) {
    const start = calcStartDateFromInputs(
      row.end_date,
      row.duration_text,
      days,
      row.duration_mode,
    );
    return start ? { start_date: start } : {};
  }

  if (row.start_date) {
    const end = calcEndDateFromInputs(
      row.start_date,
      row.duration_text,
      days,
      row.duration_mode,
    );
    return end ? { end_date: end } : {};
  }

  if (row.end_date) {
    const start = calcStartDateFromInputs(
      row.end_date,
      row.duration_text,
      days,
      row.duration_mode,
    );
    return start ? { start_date: start } : {};
  }

  return {};
}

/** Infer inclusive duration days from an existing start/end pair. */
export function inferDurationDaysFromSpan(
  startDate: string,
  endDate: string,
  mode: PdDurationMode,
): number | null {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end < start) return null;

  if (mode === "effective_days") {
    const diff = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    return Math.max(1, diff + 1);
  }

  let count = 0;
  let current = new Date(start);
  while (current <= end) {
    if (isWeekday(current)) count += 1;
    current = addCalendarDays(current, 1);
  }
  return Math.max(1, count);
}

export const DURATION_MODE_LABELS: Record<PdDurationMode, string> = {
  effective_days: "Effective days",
  working_days: "Working days",
};

export { MS_PER_DAY };
