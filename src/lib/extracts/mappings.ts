import type {
  ExtractCategory,
  ExtractActionCodeMapping,
  ExtractCategoryRule,
} from "@/types/database";
import { categorize } from "@/lib/extracts/categories";

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

/**
 * Prefer action-code mappings, then FROM/TO category rules.
 * Used by OCR parse, commit, and transaction edit.
 */
export function resolveExtractCategory(
  row: { tran_code?: string | null; from_to?: string | null },
  actionMappings: Pick<ExtractActionCodeMapping, "action_code" | "category">[],
  rules: Omit<ExtractCategoryRule, "id">[],
): ExtractCategory {
  const fromCode = resolveActionCodeCategory(row.tran_code, actionMappings);
  if (fromCode !== "uncategorized") return fromCode;
  return categorize(row.from_to ?? row.tran_code, rules);
}
