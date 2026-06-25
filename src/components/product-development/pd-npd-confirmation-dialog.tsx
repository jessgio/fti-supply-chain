"use client";

import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import {
  FORMULA_TRACKER_FIELD_SECTIONS,
  formatFieldValue,
} from "@/lib/product-development/formula-tracker-fields";
import type { PdFormulaTrackerEntryDetail } from "@/types/database";

interface PdNpdConfirmationDialogProps {
  entry: PdFormulaTrackerEntryDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PdNpdConfirmationDialog({
  entry,
  open,
  onOpenChange,
}: PdNpdConfirmationDialogProps) {
  if (!entry) return null;

  const trackerHref = `/dashboard/product-development/formula-tracker/${entry.project_id}/${entry.id}`;
  const subtitle = [
    entry.product_name ?? entry.project_name ?? "Trial",
    entry.lab_no ? `Lab ${entry.lab_no}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="NPD Confirmation"
      description={`Approved formula trial — ${subtitle}`}
      className="max-w-2xl"
    >
      <div className="max-h-[60vh] space-y-5 overflow-y-auto">
        {FORMULA_TRACKER_FIELD_SECTIONS.map((section) => {
          const fields = section.fields
            .map((field) => ({
              field,
              value: formatFieldValue(entry, field),
            }))
            .filter((row) => row.value != null);
          if (fields.length === 0) return null;
          return (
            <section key={section.title}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                {section.title}
              </h4>
              <dl className="grid gap-2 text-sm">
                {fields.map(({ field, value }) => (
                  <div key={field.key} className="grid grid-cols-[9rem_1fr] gap-2">
                    <dt className="text-stone-500">{field.label}</dt>
                    <dd className="whitespace-pre-wrap text-stone-800">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}

        {entry.brief_files.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Brief files
            </h4>
            <ul className="space-y-1">
              {entry.brief_files.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.download_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {file.file_name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="mt-4 border-t border-stone-100 pt-3">
        <Link
          href={trackerHref}
          className="text-sm font-medium text-emerald-800 hover:underline"
        >
          Open in Formula Tracker
        </Link>
      </div>
    </Dialog>
  );
}
