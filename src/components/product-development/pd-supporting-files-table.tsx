"use client";

import { useState } from "react";
import { PdMasterFileField } from "@/components/product-development/pd-master-file-field";
import { PdNpdConfirmationDialog } from "@/components/product-development/pd-npd-confirmation-dialog";
import { getMasterShadeImages } from "@/lib/product-development/master-shades";
import type { PdProjectDetail } from "@/types/database";

interface PdSupportingFilesTableProps {
  project: PdProjectDetail;
  editable?: boolean;
  uploadingBpomShadeId?: string | null;
  generatingGs1ShadeId?: string | null;
  onUploadBpom?: (shadeId: string, file: File) => void;
  onDeleteBpom?: (shadeId: string, fileId: string) => void;
  onGenerateGs1?: (shadeId: string) => void;
}

function FileLink({
  label,
  href,
}: {
  label: string;
  href?: string | null;
}) {
  if (!href) {
    return <span className="text-stone-400">—</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-emerald-700 hover:underline"
    >
      {label}
    </a>
  );
}

export function PdSupportingFilesTable({
  project,
  editable = false,
  uploadingBpomShadeId = null,
  generatingGs1ShadeId = null,
  onUploadBpom,
  onDeleteBpom,
  onGenerateGs1,
}: PdSupportingFilesTableProps) {
  const [npdDialogOpen, setNpdDialogOpen] = useState(false);
  const shades = [...project.master_shades].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const npdEntry = project.npd_approved_entry;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase text-stone-500">
              <th className="px-4 py-2">Shade</th>
              <th className="px-4 py-2">Lab no.</th>
              <th className="px-4 py-2">NPD Confirmation</th>
              <th className="px-4 py-2">BPOM</th>
              <th className="px-4 py-2">GS1</th>
              <th className="px-4 py-2">GS1 File</th>
            </tr>
          </thead>
          <tbody>
            {shades.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-stone-500"
                >
                  Add shades in the Shades section above to track regulatory
                  files per variant.
                </td>
              </tr>
            ) : (
              shades.map((shade, index) => {
                const assets = getMasterShadeImages(project.files, shade.id);
                return (
                  <tr key={shade.id} className="border-b border-stone-100">
                    <td className="px-4 py-2 font-medium">{shade.shade_name}</td>
                    <td className="px-4 py-2">{shade.lab_no ?? "—"}</td>
                    {index === 0 && (
                      <td
                        className="px-4 py-2 align-top"
                        rowSpan={shades.length}
                      >
                        {npdEntry ? (
                          <button
                            type="button"
                            onClick={() => setNpdDialogOpen(true)}
                            className="text-left text-sm font-medium text-emerald-700 hover:underline"
                          >
                            View approval
                          </button>
                        ) : (
                          <span className="text-stone-400">Pending approval</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2 align-top">
                      {editable ? (
                        <PdMasterFileField
                          label=""
                          file={assets.bpom}
                          editable
                          compact
                          uploading={uploadingBpomShadeId === shade.id}
                          onUpload={
                            onUploadBpom
                              ? (file) => onUploadBpom(shade.id, file)
                              : undefined
                          }
                          onDelete={
                            assets.bpom && onDeleteBpom
                              ? () => onDeleteBpom(shade.id, assets.bpom!.id)
                              : undefined
                          }
                        />
                      ) : assets.bpom?.download_url ? (
                        <FileLink
                          label={assets.bpom.file_name}
                          href={assets.bpom.download_url}
                        />
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{shade.gs1 ?? "—"}</td>
                    <td className="px-4 py-2 align-top">
                      {assets.gs1Barcode?.download_url ? (
                        <div className="space-y-1">
                          <FileLink
                            label={assets.gs1Barcode.file_name}
                            href={assets.gs1Barcode.download_url}
                          />
                          {editable && onGenerateGs1 && shade.gs1 && (
                            <button
                              type="button"
                              onClick={() => onGenerateGs1(shade.id)}
                              disabled={generatingGs1ShadeId === shade.id}
                              className="block text-xs text-stone-500 hover:text-emerald-700"
                            >
                              {generatingGs1ShadeId === shade.id
                                ? "Regenerating…"
                                : "Regenerate"}
                            </button>
                          )}
                        </div>
                      ) : editable && onGenerateGs1 && shade.gs1 ? (
                        <button
                          type="button"
                          onClick={() => onGenerateGs1(shade.id)}
                          disabled={generatingGs1ShadeId === shade.id}
                          className="text-sm text-emerald-700 hover:underline"
                        >
                          {generatingGs1ShadeId === shade.id
                            ? "Generating…"
                            : "Generate barcode"}
                        </button>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PdNpdConfirmationDialog
        entry={npdEntry}
        open={npdDialogOpen}
        onOpenChange={setNpdDialogOpen}
      />
    </>
  );
}
