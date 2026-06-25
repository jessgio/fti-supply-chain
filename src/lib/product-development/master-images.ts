import type { PdFile } from "@/types/database";

export const PD_MASTER_IMAGE_SECTIONS = {
  product_identity: "Product Identity",
  ingredient_info: "Ingredient Information",
  bom: "Product Component Information",
  supporting_files: "Product Supporting Files",
} as const;

export type PdMasterImageSection = keyof typeof PD_MASTER_IMAGE_SECTIONS;

export function masterImageCategory(section: PdMasterImageSection): string {
  return `master_image:${section}`;
}

export function isMasterViewImage(file: PdFile): boolean {
  return Boolean(file.file_category?.startsWith("master_image:"));
}

export function masterImageSectionFromCategory(
  category: string | null,
): PdMasterImageSection | null {
  if (!category?.startsWith("master_image:")) return null;
  const section = category.replace("master_image:", "") as PdMasterImageSection;
  return section in PD_MASTER_IMAGE_SECTIONS ? section : null;
}

export function masterSectionImages(
  files: PdFile[],
  section: PdMasterImageSection,
): PdFile[] {
  const category = masterImageCategory(section);
  return files.filter(
    (f) =>
      f.file_category === category &&
      !f.phase_id &&
      !f.component_id &&
      !f.shade_file_id &&
      (f.mime_type?.startsWith("image/") ?? /\.(jpe?g|png|webp|gif)$/i.test(f.file_name)),
  );
}

export const MASTER_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
