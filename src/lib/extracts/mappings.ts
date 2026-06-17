import type { ExtractCategory, ExtractActionCodeMapping } from "@/types/database";

export function normalizeMappingKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Resolve a manufacturer action code to an internal category (exact match). */
export function resolveActionCodeCategory(
  actionCode: string | null | undefined,
  mappings: Pick<ExtractActionCodeMapping, "action_code" | "category">[],
): ExtractCategory {
  const key = normalizeMappingKey(String(actionCode ?? ""));
  if (!key) return "uncategorized";
  const hit = mappings.find(
    (m) => normalizeMappingKey(m.action_code) === key,
  );
  return hit?.category ?? "uncategorized";
}
