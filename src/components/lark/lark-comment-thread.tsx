"use client";

import { format } from "date-fns";
import { Download, Eye, Paperclip } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DocumentFilePreviewDialog } from "@/components/shipments/document-file-preview-dialog";
import type { LarkCommentAttachment } from "@/lib/lark/comment-files";
import { isPreviewableDocument } from "@/lib/shipments/document-preview";

export type LarkCommentView = {
  id: string;
  openId: string | null;
  comment: string;
  createTime: string | null;
  authorName: string | null;
  authorEmail: string | null;
  files?: LarkCommentAttachment[];
};

function previewMime(blobType: string, fallback: string | null): string | null {
  const type = blobType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type.startsWith("image/") && type !== "image/svg+xml") return type;
  if (type === "application/pdf") return type;
  return fallback;
}

function canPreview(file: LarkCommentAttachment): boolean {
  if (file.mimeType === "image/svg+xml") return false;
  if (file.title.toLowerCase().endsWith(".svg")) return false;
  return isPreviewableDocument(file.mimeType, file.title);
}

function formatBytes(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type PreviewState = {
  fileName: string;
  mimeType: string | null;
  url: string | null;
  loading: boolean;
  error: string | null;
};

export function larkCommentFileHref(
  path: string,
  instanceCode: string,
  commentId: string,
  index: number,
  file: LarkCommentAttachment,
  download: boolean,
): string {
  const params = new URLSearchParams({
    instanceCode,
    commentId,
    index: String(index),
    title: file.title,
  });
  if (download) params.set("download", "1");
  return `${path}?${params.toString()}`;
}

export function larkFormFileHref(
  path: string,
  instanceCode: string,
  index: number,
  file: LarkCommentAttachment,
  download: boolean,
): string {
  const params = new URLSearchParams({
    instanceCode,
    index: String(index),
    title: file.title,
  });
  if (download) params.set("download", "1");
  return `${path}?${params.toString()}`;
}

async function readAttachmentError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error?.trim()) return data.error;
  } catch {
    // Response body was the file, or not JSON.
  }
  return `Could not load attachment (${res.status})`;
}

export function LarkAttachmentList({
  files,
  fileHref,
  busy = false,
  className = "mt-2 space-y-1.5",
}: {
  files: LarkCommentAttachment[];
  fileHref: (
    index: number,
    file: LarkCommentAttachment,
    download: boolean,
  ) => string;
  busy?: boolean;
  className?: string;
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const previewRequest = useRef(0);

  useEffect(() => {
    const objectUrl = preview?.url;
    if (!objectUrl?.startsWith("blob:")) return;
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [preview?.url]);

  async function loadBlob(url: string): Promise<Blob> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await readAttachmentError(res));
    return res.blob();
  }

  function closePreview() {
    previewRequest.current += 1;
    setPreview(null);
  }

  async function previewFile(index: number, file: LarkCommentAttachment) {
    const requestId = ++previewRequest.current;
    const key = `${index}:preview`;
    setPendingKey(key);
    setFileError(null);
    setPreview({
      fileName: file.title,
      mimeType: file.mimeType,
      url: null,
      loading: true,
      error: null,
    });
    try {
      const blob = await loadBlob(fileHref(index, file, false));
      if (previewRequest.current !== requestId) return;
      setPreview({
        fileName: file.title,
        mimeType: previewMime(blob.type, file.mimeType),
        url: URL.createObjectURL(blob),
        loading: false,
        error: null,
      });
    } catch (err) {
      if (previewRequest.current !== requestId) return;
      setPreview({
        fileName: file.title,
        mimeType: file.mimeType,
        url: null,
        loading: false,
        error: err instanceof Error ? err.message : "Preview failed",
      });
    } finally {
      setPendingKey((current) => (current === key ? null : current));
    }
  }

  async function downloadFile(index: number, file: LarkCommentAttachment) {
    const key = `${index}:download`;
    setPendingKey(key);
    setFileError(null);
    try {
      const blob = await loadBlob(fileHref(index, file, true));
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.title || "attachment";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setPendingKey((current) => (current === key ? null : current));
    }
  }

  if (files.length === 0) return null;

  return (
    <>
      <ul className={className}>
        {files.map((file, index) => {
          const size = formatBytes(file.fileSize);
          const previewKey = `${index}:preview`;
          const downloadKey = `${index}:download`;
          return (
            <li
              key={`${file.title}-${index}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip
                  className="h-3.5 w-3.5 shrink-0 text-stone-500"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-stone-800">{file.title}</p>
                  {size ? (
                    <p className="text-[11px] text-stone-500">{size}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {canPreview(file) ? (
                  <button
                    type="button"
                    disabled={busy || pendingKey !== null}
                    onClick={() => void previewFile(index, file)}
                    className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                    {pendingKey === previewKey ? "Opening…" : "Preview"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy || pendingKey !== null}
                  onClick={() => void downloadFile(index, file)}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {pendingKey === downloadKey ? "Downloading…" : "Download"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {fileError ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {fileError}
        </p>
      ) : null}
      <DocumentFilePreviewDialog
        open={preview !== null}
        onClose={closePreview}
        fileName={preview?.fileName ?? ""}
        mimeType={preview?.mimeType ?? null}
        url={preview?.url ?? null}
        loading={preview?.loading ?? false}
        error={preview?.error ?? null}
      />
    </>
  );
}

export function LarkCommentThread({
  comments,
  fileHref,
  busy = false,
  listClassName = "mt-3 max-h-72",
}: {
  comments: LarkCommentView[];
  fileHref: (
    commentId: string,
    index: number,
    file: LarkCommentAttachment,
    download: boolean,
  ) => string;
  busy?: boolean;
  listClassName?: string;
}) {
  return (
    <ul className={`${listClassName} space-y-2 overflow-y-auto`}>
      {comments.map((comment) => {
        const author =
          comment.authorName?.trim() ||
          comment.authorEmail?.trim() ||
          comment.openId ||
          "Unknown";
        const files = comment.files ?? [];
        return (
          <li
            key={comment.id}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-stone-900">{author}</p>
              <p className="text-[11px] text-stone-500">
                {comment.createTime
                  ? format(new Date(comment.createTime), "dd/MM/yyyy HH:mm")
                  : "—"}
              </p>
            </div>
            {comment.comment ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-800/90">
                {comment.comment}
              </p>
            ) : files.length === 0 ? (
              <p className="mt-1 text-sm text-stone-500">(empty comment)</p>
            ) : null}
            <LarkAttachmentList
              files={files}
              busy={busy}
              fileHref={(index, file, download) =>
                fileHref(comment.id, index, file, download)
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
