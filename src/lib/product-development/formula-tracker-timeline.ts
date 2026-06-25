import type { PdFormulaTrackerEntryDetail } from "@/types/database";

export interface FormulaTrackerTrialTimeline {
  entry: PdFormulaTrackerEntryDetail;
  daysSincePrevious: number | null;
  daysUntilNext: number | null;
  cycleDays: number | null;
}

export interface FormulaTrackerProjectTimeline {
  projectId: string;
  projectName: string;
  productName: string | null;
  projectStatus: string;
  trialCount: number;
  firstTrialDate: string | null;
  lastTrialDate: string | null;
  totalSpanDays: number | null;
  trials: FormulaTrackerTrialTimeline[];
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function sortEntriesChronologically(
  entries: PdFormulaTrackerEntryDetail[],
): PdFormulaTrackerEntryDetail[] {
  return [...entries].sort((a, b) => {
    const aDate = parseDate(a.sample_date);
    const bDate = parseDate(b.sample_date);
    if (aDate && bDate) return aDate.getTime() - bDate.getTime();
    if (aDate) return -1;
    if (bDate) return 1;
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
}

export function buildTrialTimelines(
  entries: PdFormulaTrackerEntryDetail[],
): FormulaTrackerTrialTimeline[] {
  const sorted = sortEntriesChronologically(entries);
  return sorted.map((entry, index) => {
    const currentDate = parseDate(entry.sample_date);
    const prevDate = parseDate(sorted[index - 1]?.sample_date ?? null);
    const nextDate = parseDate(sorted[index + 1]?.sample_date ?? null);

    const daysSincePrevious =
      currentDate && prevDate ? daysBetween(prevDate, currentDate) : null;

    const daysUntilNext =
      currentDate && nextDate ? daysBetween(currentDate, nextDate) : null;

    const cycleDays =
      daysUntilNext ??
      (currentDate ? daysBetween(currentDate, new Date()) : null);

    return {
      entry,
      daysSincePrevious,
      daysUntilNext,
      cycleDays,
    };
  });
}

export function formatDurationDays(days: number | null): string {
  if (days == null) return "—";
  if (days === 0) return "Same day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function formatDateRange(
  first: string | null,
  last: string | null,
): string {
  if (!first && !last) return "—";
  if (first === last || !last) return first ?? "—";
  if (!first) return last ?? "—";
  return `${first} → ${last}`;
}
