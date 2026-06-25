import type { PdFormulaTrackerEntryDetail } from "@/types/database";
import { parseDate, daysBetween, formatDate } from "@/lib/utils";

export interface FormulaTrackerTrialTimeline {
  entry: PdFormulaTrackerEntryDetail;
  daysSincePrevious: number | null;
  daysUntilNext: number | null;
  /** daysUntilNext for all but the final dated trial; days from sample_date → today for the latest. */
  cycleDays: number | null;
  /** Days from this trial's sample_date to its confirmation_date, if approved. */
  approvalCycleDays: number | null;
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
    const confirmDate = parseDate(entry.confirmation_date ?? null);

    const daysSincePrevious =
      currentDate && prevDate ? daysBetween(prevDate, currentDate) : null;

    const daysUntilNext =
      currentDate && nextDate ? daysBetween(currentDate, nextDate) : null;

    const cycleDays =
      daysUntilNext ??
      (currentDate ? daysBetween(currentDate, new Date()) : null);

    const approvalCycleDays =
      currentDate && confirmDate ? daysBetween(currentDate, confirmDate) : null;

    return {
      entry,
      daysSincePrevious,
      daysUntilNext,
      cycleDays,
      approvalCycleDays,
    };
  });
}

export function computeApprovalSpan(
  entries: PdFormulaTrackerEntryDetail[],
): {
  daysFirstSampleToApproval: number | null;
  daysLastSampleToApproval: number | null;
  approvedConfirmationDate: string | null;
} {
  const timelines = buildTrialTimelines(entries);
  const datedTrials = timelines.filter((t) => t.entry.sample_date);
  const approvedTrial = [...timelines]
    .reverse()
    .find(
      (t) =>
        t.entry.npd_confirmation === "Approved" && t.entry.confirmation_date,
    );

  if (!approvedTrial) {
    return {
      daysFirstSampleToApproval: null,
      daysLastSampleToApproval: null,
      approvedConfirmationDate: null,
    };
  }

  const confirmDate = parseDate(approvedTrial.entry.confirmation_date ?? null);
  const firstSampleDate = parseDate(datedTrials[0]?.entry.sample_date ?? null);
  const lastSampleDate = parseDate(
    datedTrials.at(-1)?.entry.sample_date ?? null,
  );

  return {
    daysFirstSampleToApproval:
      firstSampleDate && confirmDate
        ? daysBetween(firstSampleDate, confirmDate)
        : null,
    daysLastSampleToApproval:
      lastSampleDate && confirmDate
        ? daysBetween(lastSampleDate, confirmDate)
        : null,
    approvedConfirmationDate: approvedTrial.entry.confirmation_date ?? null,
  };
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
  const f = formatDate(first);
  const l = formatDate(last);
  if (f === "—" && l === "—") return "—";
  if (f === l || l === "—") return f;
  if (f === "—") return l;
  return `${f} → ${l}`;
}
