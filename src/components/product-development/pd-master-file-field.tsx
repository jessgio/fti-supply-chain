"use client";

import { useRef } from "react";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MASTER_DOCUMENT_ACCEPT } from "@/lib/product-development/master-documents";
import type { PdFile } from "@/types/database";

interface PdMasterFileFieldProps {
  label: string;
  file: PdFile | null;
  editable?: boolean;
  uploading?: boolean;
  onUpload?: (file: File) => void;
  onDelete?: () => void;
  /** Compact layout for table cells — no placeholder dash when empty. */
  compact?: boolean;
}

export function PdMasterFileField({
  label,
  file,
  editable = false,
  uploading = false,
  onUpload,
  onDelete,
  compact = false,
}: PdMasterFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked && onUpload) onUpload(picked);
    e.target.value = "";
  }

  const hasFile = Boolean(file?.download_url);
  const canUpload = editable && onUpload;

  return (
    <div>
      {label ? (
        <p className="text-xs font-medium uppercase text-stone-500">{label}</p>
      ) : null}
      <div className={label ? "mt-1" : undefined}>
        {hasFile ? (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={file!.download_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-700 hover:underline"
            >
              {file!.file_name}
            </a>
            {editable && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-rose-600 hover:text-rose-700"
                disabled={uploading}
                onClick={() => {
                  if (confirm("Remove this file?")) onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ) : (
          !canUpload &&
          !compact && <span className="text-sm text-stone-400">—</span>
        )}
        {canUpload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={MASTER_DOCUMENT_ACCEPT}
              className="hidden"
              onChange={handleChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className={hasFile ? "mt-2 h-8 text-xs" : "h-8 text-xs"}
            >
              {uploading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
              )}
              {hasFile ? "Replace file" : "Upload file"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
