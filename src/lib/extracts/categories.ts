import type {
  ExtractCategory,
  ExtractCategoryRule,
  ExtractFlow,
} from "@/types/database";

export const EXTRACT_CATEGORIES: ExtractCategory[] = [
  "inbound_supplier",
  "production",
  "quality_control",
  "rnd",
  "destroy_defect",
  "waste",
  "uncategorized",
];

/** Categories whose issued quantity counts as waste in the waste-% numerator. */
export const WASTE_CATEGORIES: ExtractCategory[] = ["waste"];

export const EXTRACT_CATEGORY_LABELS: Record<ExtractCategory, string> = {
  quality_control: "Quality Control Check",
  rnd: "R&D",
  production: "Production",
  inbound_supplier: "Inbound from Supplier",
  destroy_defect: "Destroy (Defect)",
  waste: "Waste",
  uncategorized: "Uncategorized",
};

/** Tailwind classes for a category badge. */
export const EXTRACT_CATEGORY_STYLES: Record<ExtractCategory, string> = {
  inbound_supplier: "bg-emerald-100 text-emerald-800",
  production: "bg-sky-100 text-sky-800",
  quality_control: "bg-indigo-100 text-indigo-800",
  rnd: "bg-violet-100 text-violet-800",
  destroy_defect: "bg-amber-100 text-amber-800",
  waste: "bg-rose-100 text-rose-700",
  uncategorized: "bg-stone-100 text-stone-600",
};

/** Expected flow direction for a category (used to validate/label movements). */
export const EXTRACT_CATEGORY_FLOW: Record<ExtractCategory, ExtractFlow> = {
  inbound_supplier: "in",
  production: "out",
  quality_control: "out",
  rnd: "out",
  destroy_defect: "out",
  waste: "out",
  uncategorized: "neutral",
};

/** Default rules used when the DB rules table is empty (mirrors the seed). */
export const DEFAULT_CATEGORY_RULES: Omit<ExtractCategoryRule, "id">[] = [
  { pattern: "QAC", category: "quality_control", priority: 10 },
  { pattern: "RNI", category: "rnd", priority: 10 },
  { pattern: "SC/HC", category: "production", priority: 10 },
  { pattern: "Mixing", category: "production", priority: 20 },
  { pattern: "Inovasi Alam", category: "inbound_supplier", priority: 10 },
  { pattern: "Logistic", category: "destroy_defect", priority: 10 },
  { pattern: "WH. RM. Not Match", category: "waste", priority: 10 },
  { pattern: "Not Match", category: "waste", priority: 20 },
  { pattern: "SCM", category: "waste", priority: 30 },
];

/**
 * Resolve a raw FROM/TO string to a category. Rules are checked in priority
 * order (ascending); the first whose pattern is contained (case-insensitively)
 * in the text wins. Falls back to `uncategorized`.
 */
export function categorize(
  fromTo: string | null | undefined,
  rules: Omit<ExtractCategoryRule, "id">[] = DEFAULT_CATEGORY_RULES,
): ExtractCategory {
  if (!fromTo) return "uncategorized";
  const haystack = fromTo.toLowerCase();
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    if (rule.pattern && haystack.includes(rule.pattern.toLowerCase())) {
      return rule.category;
    }
  }
  return "uncategorized";
}

export function isWasteCategory(category: ExtractCategory): boolean {
  return WASTE_CATEGORIES.includes(category);
}
