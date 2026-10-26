import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  assertSafeLarkFileUrl,
  isPrivateIpAddress,
  type LarkCommentFile,
} from "@/lib/lark/comment-files";
import {
  getApprovalInstanceDetails,
  getTenantAccessToken,
} from "@/lib/lark/client";

export const LARK_COMMENT_FILE_MAX_BYTES = 52 * 1024 * 1024;

const SAFE_INLINE = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

async function assertPublicDns(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateIpAddress(hostname)) {
      throw new Error("Attachment host is not allowed");
    }
    return;
  }
  const records = await lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error("Attachment host did not resolve");
  }
  for (const record of records) {
    if (isPrivateIpAddress(record.address)) {
      throw new Error("Attachment host is not allowed");
    }
  }
}

function capStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let received = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > maxBytes) {
          controller.error(new Error("Attachment is too large to preview"));
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

const LARK_FILE_HOST_SUFFIXES = [
  "larksuite.com",
  "larkoffice.com",
  "feishu.cn",
  "feishucdn.com",
  "larksuitecdn.com",
  "byteimg.com",
  "ibyteimg.com",
];

function isLarkFileHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.+$/, "");
    return LARK_FILE_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function requestHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) headers.set("Accept", "*/*");
  return headers;
}

function withoutAuthorization(extra?: HeadersInit): HeadersInit | undefined {
  if (!extra) return undefined;
  const headers = new Headers(extra);
  headers.delete("authorization");
  return headers;
}

async function fetchSafe(
  initial: string,
  extraHeaders?: HeadersInit,
): Promise<Response> {
  let current = assertSafeLarkFileUrl(initial);
  await assertPublicDns(current.hostname);
  let headers = extraHeaders;
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
      headers: requestHeaders(headers),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Attachment redirect was empty");
      const next = assertSafeLarkFileUrl(new URL(location, current).toString());
      if (next.hostname !== current.hostname) headers = withoutAuthorization(headers);
      current = next;
      await assertPublicDns(current.hostname);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Attachment download failed (HTTP ${res.status})`);
    }
    const length = Number(res.headers.get("content-length") || "");
    if (Number.isFinite(length) && length > LARK_COMMENT_FILE_MAX_BYTES) {
      throw new Error("Attachment is too large to preview");
    }
    return res;
  }
  throw new Error("Attachment redirect limit exceeded");
}

function chooseMime(
  file: LarkCommentFile,
  upstream: string | null,
): { mime: string; inline: boolean } {
  const upstreamType = upstream?.split(";")[0]?.trim().toLowerCase() ?? "";
  const inferred = file.mimeType;
  let mime = "application/octet-stream";
  if (inferred && inferred !== "image/svg+xml") mime = inferred;
  if (
    SAFE_INLINE.has(upstreamType) &&
    (file.type === "image" ||
      inferred === "application/pdf" ||
      inferred?.startsWith("image/"))
  ) {
    mime = upstreamType;
  }
  return { mime, inline: SAFE_INLINE.has(mime) };
}

function contentDisposition(download: boolean, filename: string): string {
  const safe =
    filename.replace(/[\r\n"]/g, "").replace(/[/\\]/g, "_").slice(0, 180) ||
    "attachment";
  const kind = download ? "attachment" : "inline";
  return `${kind}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function resolveLarkCommentFile(input: {
  instanceCode: string;
  commentId: string;
  index: number;
  title?: string | null;
}): Promise<LarkCommentFile | null> {
  const details = await getApprovalInstanceDetails(input.instanceCode, {
    retries: 1,
  });
  const comment = details.comments.find((item) => item.id === input.commentId);
  const file = comment?.files[input.index];
  if (!file) return null;
  if (input.title && input.title !== file.title) return null;
  return file;
}

function streamedFile(
  file: LarkCommentFile,
  upstream: Response,
  download: boolean,
): { body: ReadableStream<Uint8Array>; headers: Headers } {
  const { mime, inline } = chooseMime(file, upstream.headers.get("content-type"));
  const headers = new Headers();
  headers.set("Content-Type", mime);
  headers.set(
    "Content-Disposition",
    contentDisposition(download || !inline, file.title),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  headers.set("Cache-Control", "private, no-store");
  const body = upstream.body
    ? capStream(upstream.body, LARK_COMMENT_FILE_MAX_BYTES)
    : new ReadableStream<Uint8Array>();
  return { body, headers };
}

function isAuthFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return /HTTP 40[13]/.test(message);
}

export async function fetchLarkHostedFile(
  file: LarkCommentFile,
  download: boolean,
  options?: { authorize?: boolean },
): Promise<{ body: ReadableStream<Uint8Array>; headers: Headers }> {
  try {
    return streamedFile(file, await fetchSafe(file.url), download);
  } catch (err) {
    if (!options?.authorize || !isAuthFailure(err) || !isLarkFileHost(file.url)) {
      throw err;
    }
  }
  const token = await getTenantAccessToken();
  return streamedFile(
    file,
    await fetchSafe(file.url, { Authorization: `Bearer ${token}` }),
    download,
  );
}

export async function fetchLarkCommentFile(
  file: LarkCommentFile,
  download: boolean,
): Promise<{ body: ReadableStream<Uint8Array>; headers: Headers }> {
  return fetchLarkHostedFile(file, download);
}
