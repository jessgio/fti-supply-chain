import { fetchLarkHostedFile } from "@/lib/lark/comment-file-proxy";
import type { LarkCommentFile } from "@/lib/lark/comment-files";
import { getApprovalInstanceDetails } from "@/lib/lark/client";
import {
  formFilesFromLarkForm,
  type LarkFormFile,
} from "@/lib/lark/form-files";

export async function resolveLarkFormFile(input: {
  instanceCode: string;
  index: number;
  title?: string | null;
}): Promise<LarkFormFile | null> {
  const details = await getApprovalInstanceDetails(input.instanceCode, {
    retries: 1,
  });
  const file = formFilesFromLarkForm(details.form)[input.index];
  if (!file) return null;
  if (input.title && input.title !== file.title) return null;
  return file;
}

export async function fetchLarkFormFile(
  file: LarkFormFile,
  download: boolean,
): Promise<{ body: ReadableStream<Uint8Array>; headers: Headers }> {
  if (!file.url) {
    throw new Error(
      "Lark did not return a download link for this file. Refresh status and try again.",
    );
  }
  const hosted: LarkCommentFile = {
    title: file.title,
    fileSize: file.fileSize,
    type: file.type,
    mimeType: file.mimeType,
    url: file.url,
  };
  return fetchLarkHostedFile(hosted, download, { authorize: true });
}
