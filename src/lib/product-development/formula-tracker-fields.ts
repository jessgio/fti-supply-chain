import type { PdFormulaTrackerEntryDetail, PdProjectSummary } from "@/types/database";

const ONGOING_PROJECT_STATUSES = new Set(["draft", "active", "on_hold"]);

export function isOngoingPdProject(project: PdProjectSummary): boolean {
  return ONGOING_PROJECT_STATUSES.has(project.status);
}

export function projectProductLabel(project: PdProjectSummary): string {
  if (project.product_name && project.product_name !== project.name) {
    return `${project.product_name} (${project.name})`;
  }
  return project.product_name ?? project.name;
}

export function resolveProductProjectId(
  entry: Pick<
    PdFormulaTrackerEntryDetail,
    "product_project_id" | "product_name"
  >,
  projects: PdProjectSummary[],
): string {
  if (entry.product_project_id) return entry.product_project_id;
  if (!entry.product_name) return "";
  const match = projects.find(
    (p) =>
      p.product_name === entry.product_name || p.name === entry.product_name,
  );
  return match?.id ?? "";
}

export interface FormulaTrackerFieldDef {
  key: keyof PdFormulaTrackerEntryDetail;
  label: string;
  type: "text" | "date" | "file";
  /** Hide in read-only detail when parent condition not met */
  showWhen?: (entry: PdFormulaTrackerEntryDetail) => boolean;
}

export const FORMULA_TRACKER_FIELD_SECTIONS: {
  title: string;
  fields: FormulaTrackerFieldDef[];
}[] = [
  {
    title: "Brief & product",
    fields: [
      { key: "brief_concept", label: "Brief Concept", type: "text" },
      { key: "target_ingredient", label: "Target Ingredient", type: "text" },
      { key: "product_name", label: "Product Name", type: "text" },
      { key: "sample_date", label: "Date", type: "date" },
    ],
  },
  {
    title: "Sample & lab",
    fields: [
      { key: "sample_trial_no", label: "Sample Trial No", type: "text" },
      { key: "lab_no", label: "Lab No", type: "text" },
    ],
  },
  {
    title: "Main feedback",
    fields: [
      { key: "main_feedback", label: "Main Feedback", type: "text" },
      {
        key: "benchmark_changed_from_previous_feedback",
        label: "Did the benchmark change from the previous feedback?",
        type: "text",
        showWhen: (e) => e.main_feedback === "Revise",
      },
      {
        key: "benchmark_change_from_previous_explanation",
        label: "Why? Explain why the benchmark(s) was/were changed.",
        type: "text",
        showWhen: (e) =>
          e.main_feedback === "Revise" &&
          e.benchmark_changed_from_previous_feedback === "Yes",
      },
    ],
  },
  {
    title: "Reviews",
    fields: [
      { key: "texture_review", label: "Texture Review", type: "text" },
      {
        key: "texture_feedback",
        label: "Texture Feedback / Explanation",
        type: "text",
        showWhen: (e) => e.texture_review === "Revise",
      },
      { key: "scent_review", label: "Scent Review", type: "text" },
      {
        key: "scent_feedback",
        label: "Scent Feedback / Explanation",
        type: "text",
        showWhen: (e) => e.scent_review === "Revise",
      },
      { key: "efficacy_result", label: "Efficacy Result", type: "text" },
      {
        key: "efficacy_feedback",
        label: "Efficacy Feedback / Explanation",
        type: "text",
        showWhen: (e) => e.efficacy_result === "Revise",
      },
    ],
  },
  {
    title: "Benchmarks",
    fields: [
      { key: "texture_benchmark", label: "Texture Benchmark", type: "text" },
      { key: "color_benchmark", label: "Color Benchmark", type: "text" },
      {
        key: "benchmark_change_confirmation",
        label: "Benchmark Change Confirmation",
        type: "text",
      },
      {
        key: "benchmark_change_reason",
        label: "Benchmark Change Reason",
        type: "text",
        showWhen: (e) => e.benchmark_change_confirmation === "Yes",
      },
    ],
  },
  {
    title: "Summary & confirmation",
    fields: [
      { key: "summary", label: "Summary", type: "text" },
      { key: "npd_confirmation", label: "NPD Confirmation", type: "text" },
      { key: "confirmation_date", label: "Confirmation Date", type: "date" },
      { key: "confirmed_by", label: "Confirmed By", type: "text" },
    ],
  },
];

export function formatFieldValue(
  entry: PdFormulaTrackerEntryDetail,
  field: FormulaTrackerFieldDef,
): string | null {
  if (field.type === "file") return null;
  if (field.showWhen && !field.showWhen(entry)) return null;
  const value = entry[field.key];
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  return String(value);
}
