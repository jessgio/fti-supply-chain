import type { PdFile } from "@/types/database";

export const MASTER_SHADE_TUBE_CATEGORY = "master_shade_tube";
export const MASTER_SHADE_SWATCH_CATEGORY = "master_shade_swatch";
export const MASTER_SHADE_BPOM_CATEGORY = "master_shade_bpom";
export const MASTER_SHADE_GS1_BARCODE_CATEGORY = "master_shade_gs1_barcode";

export type MasterShadeImageKind = "tube" | "swatch";
export type MasterShadeDocumentKind = "bpom" | "gs1_barcode";

export function masterShadeImageCategory(kind: MasterShadeImageKind): string {
  return kind === "tube" ? MASTER_SHADE_TUBE_CATEGORY : MASTER_SHADE_SWATCH_CATEGORY;
}

export function getMasterShadeImages(files: PdFile[], shadeId: string) {
  const shadeFiles = files.filter((f) => f.master_shade_id === shadeId);
  return {
    tube: shadeFiles.find((f) => f.file_category === MASTER_SHADE_TUBE_CATEGORY) ?? null,
    swatch:
      shadeFiles.find((f) => f.file_category === MASTER_SHADE_SWATCH_CATEGORY) ?? null,
    bpom: shadeFiles.find((f) => f.file_category === MASTER_SHADE_BPOM_CATEGORY) ?? null,
    gs1Barcode:
      shadeFiles.find((f) => f.file_category === MASTER_SHADE_GS1_BARCODE_CATEGORY) ??
      null,
  };
}

export function masterShadeDocumentCategory(kind: MasterShadeDocumentKind): string {
  return kind === "bpom" ? MASTER_SHADE_BPOM_CATEGORY : MASTER_SHADE_GS1_BARCODE_CATEGORY;
}

export function isMasterShadeImage(file: PdFile): boolean {
  return (
    file.file_category === MASTER_SHADE_TUBE_CATEGORY ||
    file.file_category === MASTER_SHADE_SWATCH_CATEGORY ||
    file.file_category === MASTER_SHADE_BPOM_CATEGORY ||
    file.file_category === MASTER_SHADE_GS1_BARCODE_CATEGORY
  );
}
