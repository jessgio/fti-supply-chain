import type { PdFile, PdPantoneSwatch } from "@/types/database";

export type PackagingAssetSection = "primary" | "secondary";

export const PANTONE_SWATCH_FILE_CATEGORY = "pantone_swatch";

export const PACKAGING_ASSET_FIELD_KEYS = {
  primaryFinalArtworkNotes: "primary.final_artwork.notes",
  secondaryFinalArtworkNotes: "secondary.final_artwork.notes",
} as const;

export type PackagingAssetFieldKey =
  (typeof PACKAGING_ASSET_FIELD_KEYS)[keyof typeof PACKAGING_ASSET_FIELD_KEYS];

export type PackagingAssetRowColumn = "supporting" | "notes";

export function packagingAssetRowFieldKey(
  section: PackagingAssetSection,
  rowKey: string,
  column: PackagingAssetRowColumn,
): string {
  return `${section}.${rowKey}.${column}`;
}

export interface PackagingAssetTableRow {
  section: PackagingAssetSection;
  rowKey: string;
  label: string;
  /** When set, Details column shows a file upload/link for this slot. */
  fileRowKey?: string;
  /** When set, Details column shows text from this field key. */
  detailsFieldKey?: PackagingAssetFieldKey;
}

export const PACKAGING_ASSET_TABLE_ROWS: PackagingAssetTableRow[] = [
  {
    section: "primary",
    rowKey: "technical_drawing",
    label: "Technical Drawing",
    fileRowKey: "technical_drawing",
  },
  {
    section: "primary",
    rowKey: "compatibility_test",
    label: "Compatibility Test",
    fileRowKey: "compatibility_test",
  },
  {
    section: "primary",
    rowKey: "final_artwork",
    label: "Final Artwork",
    detailsFieldKey: PACKAGING_ASSET_FIELD_KEYS.primaryFinalArtworkNotes,
    fileRowKey: "fa_bottom_label",
  },
  {
    section: "primary",
    rowKey: "tr_original",
    label: "TR Original File",
    fileRowKey: "tr_original",
  },
  {
    section: "primary",
    rowKey: "table_photoshot",
    label: "Photoshoot Assets",
    fileRowKey: "table_photoshot",
  },
  {
    section: "secondary",
    rowKey: "technical_drawing",
    label: "Technical Drawing",
    fileRowKey: "technical_drawing",
  },
  {
    section: "secondary",
    rowKey: "final_artwork",
    label: "Final Artwork",
    detailsFieldKey: PACKAGING_ASSET_FIELD_KEYS.secondaryFinalArtworkNotes,
  },
  {
    section: "secondary",
    rowKey: "tr_original",
    label: "TR Original File",
    fileRowKey: "tr_original",
  },
  {
    section: "secondary",
    rowKey: "mockup",
    label: "Mockup (if any)",
    fileRowKey: "mockup",
  },
];

export function packagingAssetFileCategory(
  section: PackagingAssetSection,
  rowKey: string,
): string {
  return `packaging_asset:${section}:${rowKey}`;
}

export function isPackagingAssetFileCategory(category: string | null): boolean {
  return Boolean(category?.startsWith("packaging_asset:"));
}

export interface PackagingAssetFileSlot {
  section: PackagingAssetSection;
  rowKey: string;
  label: string;
}

export const PACKAGING_ASSET_FILE_SLOTS: PackagingAssetFileSlot[] = [
  { section: "primary", rowKey: "technical_drawing", label: "Technical Drawing" },
  { section: "primary", rowKey: "compatibility_test", label: "Compatibility Test" },
  { section: "primary", rowKey: "fa_bottom_label", label: "FA Bottom Label" },
  { section: "primary", rowKey: "tr_original", label: "TR Original File" },
  { section: "primary", rowKey: "table_photoshot", label: "Photoshoot Assets" },
  { section: "secondary", rowKey: "technical_drawing", label: "Technical Drawing" },
  { section: "secondary", rowKey: "tr_original", label: "TR Original File" },
  { section: "secondary", rowKey: "mockup", label: "Mockup (if any)" },
];

export function packagingAssetFile(
  files: PdFile[],
  section: PackagingAssetSection,
  rowKey: string,
): PdFile | null {
  const category = packagingAssetFileCategory(section, rowKey);
  return (
    files.find(
      (f) =>
        f.file_category === category &&
        !f.phase_id &&
        !f.component_id &&
        !f.master_shade_id &&
        !f.pricing_line_id &&
        !f.pantone_swatch_id,
    ) ?? null
  );
}

export function packagingAssetFieldValue(
  fields: Record<string, string | null>,
  key: string,
): string | null {
  const value = fields[key];
  return value?.trim() ? value.trim() : null;
}

export function enrichPantoneSwatches(
  swatches: PdPantoneSwatch[],
  files: PdFile[],
): PdPantoneSwatch[] {
  return swatches.map((swatch) => ({
    ...swatch,
    swatch_file:
      files.find(
        (f) =>
          f.pantone_swatch_id === swatch.id &&
          f.file_category === PANTONE_SWATCH_FILE_CATEGORY,
      ) ?? null,
  }));
}

export function pantoneDisplayLabel(swatch: PdPantoneSwatch): string {
  return `${swatch.color_name} ${swatch.pantone_code}`.trim();
}
