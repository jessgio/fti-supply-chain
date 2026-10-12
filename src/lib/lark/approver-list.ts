export type ApproverListEntry = {
  email: string;
  full_name?: string | null;
  lark_open_id: string | null;
  is_default_approver?: boolean;
};

function compareAlphabetically(
  a: ApproverListEntry,
  b: ApproverListEntry,
): number {
  const nameA = (a.full_name?.trim() || a.email).toLocaleLowerCase();
  const nameB = (b.full_name?.trim() || b.email).toLocaleLowerCase();
  const byName = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
}

function isCheckedDefault(
  entry: ApproverListEntry,
  selectedOpenIds: ReadonlySet<string>,
): boolean {
  return (
    !!entry.is_default_approver &&
    !!entry.lark_open_id &&
    selectedOpenIds.has(entry.lark_open_id)
  );
}

/**
 * Checked default approvers stay at the top (still alphabetical among
 * themselves). Unchecking a default drops them back into the alphabetical list
 * with everyone else. Manually selected non-defaults stay in that list.
 */
export function orderApproversForForm<T extends ApproverListEntry>(
  approvers: readonly T[],
  selectedOpenIds: readonly string[],
): T[] {
  const selected = new Set(selectedOpenIds);
  return [...approvers].sort((a, b) => {
    const aPinned = isCheckedDefault(a, selected);
    const bPinned = isCheckedDefault(b, selected);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return compareAlphabetically(a, b);
  });
}
