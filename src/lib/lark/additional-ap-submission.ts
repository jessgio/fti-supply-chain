/**
 * A purchase order can have more than one Lark AP Form (down payment, then
 * the balance, then another). The history table is the source of truth.
 * Columns on purchase_orders are only the latest badge and are unique, so a
 * clash there must not fail a submission that was already stored.
 */

export type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isUniqueViolation(
  error: PostgrestErrorLike | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return /duplicate key|unique constraint/i.test(message);
}

/** Why inserting a history row was rejected. */
export function submissionInsertConflict(
  error: PostgrestErrorLike | null | undefined,
): "instance" | "other" | null {
  if (!isUniqueViolation(error)) return null;
  const message = error?.message ?? "";
  if (
    message.includes("instance_uidx") ||
    message.includes("lark_instance_code")
  ) {
    return "instance";
  }
  return "other";
}

export type BadgeConflict = "serial" | "instance" | "other";

/** Why updating the denormalized PO badge was rejected. */
export function poLarkBadgeConflict(
  error: PostgrestErrorLike | null | undefined,
): BadgeConflict | null {
  if (!isUniqueViolation(error)) return null;
  const message = error?.message ?? "";
  if (message.includes("lark_serial_number")) return "serial";
  if (message.includes("lark_instance_code")) return "instance";
  return "other";
}

/**
 * Drop the conflicting badge field and try again. Null means leave the
 * previous badge alone — the history row is already saved.
 */
export function badgePatchAfterConflict<
  T extends { lark_serial_number?: string | null },
>(patch: T, conflict: BadgeConflict): T | null {
  if (conflict === "serial" && patch.lark_serial_number) {
    return { ...patch, lark_serial_number: null };
  }
  return null;
}

/**
 * Apply the latest-submission badge. A unique clash on the badge is not a
 * failed AP Form: the history row is what the PO page lists.
 */
export async function saveLatestPoLarkBadge<T extends { lark_serial_number?: string | null }>(
  patch: T,
  update: (patch: T) => Promise<PostgrestErrorLike | null>,
): Promise<PostgrestErrorLike | null> {
  let next: T | null = patch;
  const seen = new Set<string>();
  while (next) {
    const key = JSON.stringify(next);
    if (seen.has(key)) return null;
    seen.add(key);
    const error = await update(next);
    if (!error) return null;
    const conflict = poLarkBadgeConflict(error);
    if (!conflict) return error;
    next = badgePatchAfterConflict(next, conflict);
  }
  return null;
}

/**
 * An existing submission does not block another one. Only the same Lark
 * instance cannot be stored twice.
 */
export function anotherApSubmissionAllowed(input: {
  existingInstanceCodes: readonly string[];
  newInstanceCode: string;
}): boolean {
  const code = input.newInstanceCode.trim();
  if (!code) return false;
  return !input.existingInstanceCodes.some((existing) => existing === code);
}

/** Make a follow-up create differ from the form Lark already has for this PO. */
export function larkRemarksForAdditionalAttempt(
  remarks: string,
  attempt: number,
  nonce: string,
): string {
  if (attempt <= 0) return remarks;
  const line = `Additional AP form ${nonce}`;
  const base = remarks.trim();
  return base ? `${base}\n${line}` : line;
}
