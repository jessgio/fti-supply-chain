/** Standard first task under Formula Development — see default-phases.ts */
export const NPD_CONFIRMATION_PHASE_NAME = "NPD Confirmation";

export function isNpdConfirmationPhase(phaseName: string): boolean {
  return (
    phaseName.trim().toLowerCase() ===
    NPD_CONFIRMATION_PHASE_NAME.toLowerCase()
  );
}

/** Approved formula tracker confirmation_date, when present. */
export function resolveNpdConfirmationStartDate(
  approvedConfirmationDate: string | null | undefined,
): string | null {
  const trimmed = approvedConfirmationDate?.trim();
  return trimmed ? trimmed : null;
}

export interface PdTimelineScheduleOptions {
  npdConfirmationStartDate?: string | null;
}
