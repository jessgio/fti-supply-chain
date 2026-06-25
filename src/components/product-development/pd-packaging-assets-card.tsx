"use client";

import { ExternalLink, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  PACKAGING_ASSET_TABLE_ROWS,
  packagingAssetFieldValue,
  packagingAssetFile,
  packagingAssetRowFieldKey,
  pantoneDisplayLabel,
  type PackagingAssetSection,
  type PackagingAssetTableRow,
} from "@/lib/product-development/master-packaging-assets";
import type { PdFile, PdProjectDetail } from "@/types/database";

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="rounded-t-md bg-emerald-100 px-4 py-2.5">
      <h3 className="text-sm font-semibold text-emerald-900">{title}</h3>
    </div>
  );
}

function AssetFileLink({ file }: { file: PdFile | null }) {
  if (!file?.download_url) {
    return null;
  }
  return (
    <a
      href={file.download_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-sm text-emerald-700 hover:underline"
      title={file.file_name}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{file.file_name}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

const TH =
  "px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone-500";
const TD = "px-3 py-2.5 align-top text-sm text-stone-800";

function CellValue({ value }: { value: string | null }) {
  if (!value) {
    return <span className="text-stone-400">—</span>;
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
}

function PackagingTable({
  title,
  section,
  rows,
  fields,
  files,
}: {
  title: string;
  section: PackagingAssetSection;
  rows: PackagingAssetTableRow[];
  fields: Record<string, string | null>;
  files: PdFile[];
}) {
  const sectionRows = rows.filter((row) => row.section === section);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">
        {title}
      </h4>
      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className={`${TH} w-[11rem]`}>Field</th>
              <th className={TH}>Details</th>
              <th className={`${TH} w-[8rem]`}>Supporting</th>
              <th className={TH}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.map((row) => {
              const detailsText = row.detailsFieldKey
                ? packagingAssetFieldValue(fields, row.detailsFieldKey)
                : null;
              const detailsFile = row.fileRowKey
                ? packagingAssetFile(files, row.section, row.fileRowKey)
                : null;
              const hasDetails = Boolean(detailsText || detailsFile);

              return (
                <tr key={`${row.section}-${row.rowKey}`} className="border-b border-stone-100">
                  <td className={`${TD} font-medium`}>{row.label}</td>
                  <td className={TD}>
                    {hasDetails ? (
                      <div className="space-y-1">
                        {detailsText && (
                          <p className="whitespace-pre-wrap">{detailsText}</p>
                        )}
                        <AssetFileLink file={detailsFile} />
                      </div>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className={TD}>
                    <CellValue
                      value={packagingAssetFieldValue(
                        fields,
                        packagingAssetRowFieldKey(row.section, row.rowKey, "supporting"),
                      )}
                    />
                  </td>
                  <td className={TD}>
                    <CellValue
                      value={packagingAssetFieldValue(
                        fields,
                        packagingAssetRowFieldKey(row.section, row.rowKey, "notes"),
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PdPackagingAssetsCard({ project }: { project: PdProjectDetail }) {
  const fields = project.packaging_asset_fields ?? {};
  const files = project.files ?? [];
  const swatches = project.pantone_swatches ?? [];

  return (
    <Card className="overflow-hidden border-stone-200">
      <SectionHeader title="Packaging & Assets Details" />
      <CardContent className="space-y-6 p-4">
        <PackagingTable
          title="Primary Packaging"
          section="primary"
          rows={PACKAGING_ASSET_TABLE_ROWS}
          fields={fields}
          files={files}
        />

        <PackagingTable
          title="Secondary Packaging"
          section="secondary"
          rows={PACKAGING_ASSET_TABLE_ROWS}
          fields={fields}
          files={files}
        />

        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-600">
            Pantone Code
          </h4>
          {swatches.length === 0 ? (
            <p className="text-sm text-stone-500">No Pantone swatches yet.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(10rem,14rem)_1fr]">
              <ul className="space-y-1 text-sm text-stone-700">
                {swatches.map((swatch) => (
                  <li key={swatch.id} className="font-medium">
                    {pantoneDisplayLabel(swatch)}
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {swatches.map((swatch) => (
                  <figure
                    key={swatch.id}
                    className="overflow-hidden rounded-md border border-stone-200 bg-white"
                  >
                    {swatch.swatch_file?.download_url ? (
                      <a
                        href={swatch.swatch_file.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={swatch.swatch_file.download_url}
                          alt={pantoneDisplayLabel(swatch)}
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : swatch.hex_color ? (
                      <div
                        className="aspect-square w-full"
                        style={{ backgroundColor: swatch.hex_color }}
                        title={`Approximate preview ${swatch.hex_color}`}
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-stone-100 text-xs text-stone-400">
                        No swatch
                      </div>
                    )}
                    <figcaption className="border-t border-stone-100 px-2 py-1.5 text-center text-[10px] font-medium text-stone-600">
                      PANTONE {swatch.pantone_code}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
