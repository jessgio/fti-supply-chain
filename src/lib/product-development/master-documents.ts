import type { PdFile } from "@/types/database";

export const VOLUME_TEST_RESULTS_CATEGORY = "volume_test_results";
export const STABILITY_TEST_CATEGORY = "stability_test";
export const EFFICACY_TEST_CATEGORY = "efficacy_test";
export const TECHNICAL_SHEET_CATEGORY = "technical_sheet";
export const HRIPT_CATEGORY = "hript";

export const SUPPORTING_DOCUMENT_SLOTS = [
  { category: STABILITY_TEST_CATEGORY, label: "Stability test" },
  { category: EFFICACY_TEST_CATEGORY, label: "Efficacy test" },
  { category: TECHNICAL_SHEET_CATEGORY, label: "Technical sheet" },
  { category: HRIPT_CATEGORY, label: "HRIPT" },
] as const;

export type SupportingDocumentCategory =
  (typeof SUPPORTING_DOCUMENT_SLOTS)[number]["category"];

export const MASTER_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function isProjectLevelMasterFile(file: PdFile): boolean {
  return (
    !file.phase_id &&
    !file.component_id &&
    !file.shade_file_id &&
    !file.master_shade_id &&
    !file.pricing_line_id &&
    !file.pantone_swatch_id
  );
}

export function projectMasterDocumentFile(
  files: PdFile[],
  category: string,
): PdFile | null {
  return (
    files.find(
      (f) => f.file_category === category && isProjectLevelMasterFile(f),
    ) ?? null
  );
}

export function volumeTestResultsFile(files: PdFile[]): PdFile | null {
  return projectMasterDocumentFile(files, VOLUME_TEST_RESULTS_CATEGORY);
}

export function isSupportingDocumentCategory(
  category: string | null | undefined,
): boolean {
  return SUPPORTING_DOCUMENT_SLOTS.some((slot) => slot.category === category);
}
