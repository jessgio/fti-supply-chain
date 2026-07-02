"use client";

import { Dialog } from "@/components/ui/dialog";
import {
  getDocumentPreviewKind,
  type DocumentPreviewKind,
} from "@/lib/shipments/document-preview";

interface DocumentFilePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  mimeType: string | null;
  url: string | null;
  loading?: boolean;
  error?: string | null;
}

export function DocumentFilePreviewDialog({
  open,
  onClose,
  fileName,
  mimeType,
  url,
  loading = false,
  error = null,
}: DocumentFilePreviewDialogProps) {
  const kind: DocumentPreviewKind | null = getDocumentPreviewKind(mimeType, fileName);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={fileName}
      description="Document preview"
      className="max-w-4xl"
    >
      {loading ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading preview…</p>
      ) : error ? (
        <p className="py-12 text-center text-sm text-rose-600">{error}</p>
      ) : !url ? (
        <p className="py-12 text-center text-sm text-stone-500">Preview unavailable.</p>
      ) : kind === "image" ? (
        <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={fileName}
            className="max-h-[68vh] max-w-full object-contain"
          />
        </div>
      ) : kind === "pdf" ? (
        <iframe
          src={url}
          title={fileName}
          className="h-[70vh] w-full rounded-lg border border-stone-200 bg-white"
        />
      ) : (
        <p className="py-12 text-center text-sm text-stone-500">
          Preview is not available for this file type. Use download instead.
        </p>
      )}
    </Dialog>
  );
}
