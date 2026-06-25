import { parseDate } from "@/lib/product-development/duration";
import type { PdPhaseDetail } from "@/types/database";

export const PROJECT_CARD_COVER_CATEGORY = "project_card_cover";

const MS_PER_DAY = 86_400_000;
const UPCOMING_WINDOW_DAYS = 7;

export interface PdUpcomingPhase {
  name: string;
  start_date: string | null;
  end_date: string | null;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function daysUntilLaunch(launchDate: string | null | undefined): number | null {
  const launch = parseDate(launchDate);
  if (!launch) return null;
  const today = startOfToday();
  return Math.round((launch.getTime() - today.getTime()) / MS_PER_DAY);
}

export function formatDaysUntilLaunch(days: number | null): string {
  if (days == null) return "Not set";
  if (days === 0) return "Launch day";
  if (days === 1) return "1 day left";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `${days} days left`;
}

function isDateInUpcomingWindow(
  iso: string | null | undefined,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  const date = parseDate(iso);
  if (!date) return false;
  return date >= windowStart && date <= windowEnd;
}

export function getUpcomingPhasesWithinDays(
  phases: PdPhaseDetail[],
  days = UPCOMING_WINDOW_DAYS,
): PdUpcomingPhase[] {
  const today = startOfToday();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + days);

  return phases
    .filter((phase) => {
      if (phase.status === "completed") return false;
      return (
        isDateInUpcomingWindow(phase.start_date, today, windowEnd) ||
        isDateInUpcomingWindow(phase.end_date, today, windowEnd)
      );
    })
    .sort((a, b) => {
      const aDate = parseDate(a.start_date) ?? parseDate(a.end_date);
      const bDate = parseDate(b.start_date) ?? parseDate(b.end_date);
      if (!aDate && !bDate) return a.sort_order - b.sort_order;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.getTime() - bDate.getTime();
    })
    .map((phase) => ({
      name: phase.name,
      start_date: phase.start_date,
      end_date: phase.end_date,
    }));
}

export function upcomingPhaseLabel(phase: PdUpcomingPhase): string {
  const date = phase.start_date ?? phase.end_date;
  if (!date) return phase.name;
  return `${phase.name} (${date})`;
}
