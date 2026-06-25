"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PdMasterFileField } from "@/components/product-development/pd-master-file-field";
import {
  PACKAGING_ASSET_TABLE_ROWS,
  packagingAssetFile,
  packagingAssetRowFieldKey,
  type PackagingAssetSection,
  type PackagingAssetTableRow,
} from "@/lib/product-development/master-packaging-assets";
import type { PdProjectDetail } from "@/types/database";

interface PdPackagingAssetsEditProps {
  project: PdProjectDetail;
  uploadingPackagingKey?: string | null;
  uploadingPantoneSwatchId?: string | null;
  generatingPantoneSwatchId?: string | null;
  onUpdateField: (fieldKey: string, value: string | null) => void | Promise<void>;
  onUploadAssetFile: (
    section: "primary" | "secondary",
    rowKey: string,
    file: File,
  ) => void | Promise<void>;
  onDeleteFile: (fileId: string) => void | Promise<void>;
  onAddPantone: (colorName: string, pantoneCode: string) => void | Promise<void>;
  onUpdatePantone: (
    swatchId: string,
    patch: { color_name?: string; pantone_code?: string },
  ) => void | Promise<void>;
  onDeletePantone: (swatchId: string) => void | Promise<void>;
  onUploadPantoneSwatch: (swatchId: string, file: File) => void | Promise<void>;
}

function uploadKey(section: string, rowKey: string) {
  return `${section}:${rowKey}`;
}

function PantonePreview({
  hexColor,
  generating,
}: {
  hexColor?: string | null;
  generating: boolean;
}) {
  if (generating) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-md border border-stone-200 bg-stone-50 text-[10px] text-stone-500">
        Generating…
      </div>
    );
  }
  if (!hexColor) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-stone-200 bg-stone-50 text-[10px] text-stone-400">
        No color
      </div>
    );
  }
  return (
    <div
      className="h-16 w-16 rounded-md border border-stone-200 shadow-inner"
      style={{ backgroundColor: hexColor }}
      title={hexColor}
    />
  );
}

function RowSupportingNotes({
  row,
  fields,
  onUpdateField,
}: {
  row: PackagingAssetTableRow;
  fields: Record<string, string | null>;
  onUpdateField: (fieldKey: string, value: string | null) => void | Promise<void>;
}) {
  const supportingKey = packagingAssetRowFieldKey(row.section, row.rowKey, "supporting");
  const notesKey = packagingAssetRowFieldKey(row.section, row.rowKey, "notes");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-medium text-stone-600">Supporting</label>
        <Input
          key={fields[supportingKey] ?? ""}
          defaultValue={fields[supportingKey] ?? ""}
          placeholder="Optional"
          onBlur={(e) => {
            const value = e.target.value.trim() || null;
            void onUpdateField(supportingKey, value);
          }}
          className="mt-1 h-8 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">Notes</label>
        <textarea
          key={fields[notesKey] ?? ""}
          defaultValue={fields[notesKey] ?? ""}
          rows={2}
          placeholder="Optional"
          onBlur={(e) => {
            const value = e.target.value.trim() || null;
            void onUpdateField(notesKey, value);
          }}
          className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function PackagingSectionEdit({
  title,
  section,
  rows,
  project,
  fields,
  uploadingPackagingKey,
  onUpdateField,
  onUploadAssetFile,
  onDeleteFile,
}: {
  title: string;
  section: PackagingAssetSection;
  rows: PackagingAssetTableRow[];
  project: PdProjectDetail;
  fields: Record<string, string | null>;
  uploadingPackagingKey: string | null;
  onUpdateField: (fieldKey: string, value: string | null) => void | Promise<void>;
  onUploadAssetFile: (
    section: "primary" | "secondary",
    rowKey: string,
    file: File,
  ) => void | Promise<void>;
  onDeleteFile: (fileId: string) => void | Promise<void>;
}) {
  const files = project.files ?? [];
  const sectionRows = rows.filter((row) => row.section === section);

  return (
    <div>
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-600">
        {title}
      </h4>
      <div className="space-y-4">
        {sectionRows.map((row) => {
          const fileRowKey = row.fileRowKey;
          const assetFile = fileRowKey
            ? packagingAssetFile(files, row.section, fileRowKey)
            : null;

          return (
          <div
            key={`${row.section}-${row.rowKey}`}
            className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/50 p-3"
          >
            <p className="text-sm font-medium text-stone-800">{row.label}</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {row.detailsFieldKey && (
                <div>
                  <label className="text-xs font-medium text-stone-600">
                    Details (notes)
                  </label>
                  <textarea
                    key={fields[row.detailsFieldKey] ?? ""}
                    defaultValue={fields[row.detailsFieldKey] ?? ""}
                    rows={2}
                    onBlur={(e) => {
                      const value = e.target.value.trim() || null;
                      void onUpdateField(row.detailsFieldKey!, value);
                    }}
                    className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
                  />
                </div>
              )}
              {fileRowKey && (
                <div>
                  <PdMasterFileField
                    label={
                      row.detailsFieldKey
                        ? "Details (file)"
                        : "Details"
                    }
                    file={assetFile}
                    editable
                    compact={!assetFile}
                    uploading={
                      uploadingPackagingKey === uploadKey(row.section, fileRowKey)
                    }
                    onUpload={(file) =>
                      void onUploadAssetFile(row.section, fileRowKey, file)
                    }
                    onDelete={
                      assetFile
                        ? () => void onDeleteFile(assetFile.id)
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
            <RowSupportingNotes
              row={row}
              fields={fields}
              onUpdateField={onUpdateField}
            />
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function PdPackagingAssetsEdit({
  project,
  uploadingPackagingKey = null,
  uploadingPantoneSwatchId = null,
  generatingPantoneSwatchId = null,
  onUpdateField,
  onUploadAssetFile,
  onDeleteFile,
  onAddPantone,
  onUpdatePantone,
  onDeletePantone,
  onUploadPantoneSwatch,
}: PdPackagingAssetsEditProps) {
  const fields = project.packaging_asset_fields ?? {};
  const swatches = project.pantone_swatches ?? [];

  return (
    <div className="space-y-8">
      <PackagingSectionEdit
        title="Primary Packaging"
        section="primary"
        rows={PACKAGING_ASSET_TABLE_ROWS}
        project={project}
        fields={fields}
        uploadingPackagingKey={uploadingPackagingKey}
        onUpdateField={onUpdateField}
        onUploadAssetFile={onUploadAssetFile}
        onDeleteFile={onDeleteFile}
      />

      <PackagingSectionEdit
        title="Secondary Packaging"
        section="secondary"
        rows={PACKAGING_ASSET_TABLE_ROWS}
        project={project}
        fields={fields}
        uploadingPackagingKey={uploadingPackagingKey}
        onUpdateField={onUpdateField}
        onUploadAssetFile={onUploadAssetFile}
        onDeleteFile={onDeleteFile}
      />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-600">
            Pantone Codes
          </h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onAddPantone("New shade", "1955 C")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Pantone
          </Button>
        </div>
        <p className="mb-3 text-xs text-stone-500">
          Enter each color name and Pantone code (e.g. 1955 C). The swatch is
          generated automatically when you save the code. Colors are approximate
          screen previews, not official Pantone references. You can optionally
          upload a custom swatch image to override the generated one.
        </p>
        {swatches.length === 0 ? (
          <p className="text-sm text-stone-500">No Pantone entries yet.</p>
        ) : (
          <div className="space-y-3">
            {swatches.map((swatch) => {
              const generating =
                generatingPantoneSwatchId === swatch.id ||
                generatingPantoneSwatchId === "new";
              return (
                <div
                  key={swatch.id}
                  className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50/50 p-3 sm:grid-cols-[1fr_1fr_auto_1fr]"
                >
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Color name
                    </label>
                    <Input
                      key={`${swatch.id}-name-${swatch.color_name}`}
                      defaultValue={swatch.color_name}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value && value !== swatch.color_name) {
                          void onUpdatePantone(swatch.id, { color_name: value });
                        }
                      }}
                      className="mt-1 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-stone-600">
                      Pantone code
                    </label>
                    <Input
                      key={`${swatch.id}-code-${swatch.pantone_code}`}
                      defaultValue={swatch.pantone_code}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value && value !== swatch.pantone_code) {
                          void onUpdatePantone(swatch.id, { pantone_code: value });
                        }
                      }}
                      className="mt-1 h-8 text-sm"
                      placeholder="e.g. 1955 C"
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-medium text-stone-600">
                      Preview
                    </span>
                    <div className="mt-1">
                      <PantonePreview
                        hexColor={swatch.hex_color}
                        generating={generating}
                      />
                    </div>
                  </div>
                  <div>
                    <PdMasterFileField
                      label="Custom swatch (optional)"
                      file={swatch.swatch_file ?? null}
                      editable
                      compact={!swatch.swatch_file}
                      uploading={uploadingPantoneSwatchId === swatch.id}
                      onUpload={(file) => void onUploadPantoneSwatch(swatch.id, file)}
                      onDelete={
                        swatch.swatch_file
                          ? () => void onDeleteFile(swatch.swatch_file!.id)
                          : undefined
                      }
                    />
                  </div>
                  <div className="flex items-end justify-end sm:col-span-4">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => {
                        if (confirm("Remove this Pantone entry?")) {
                          void onDeletePantone(swatch.id);
                        }
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
