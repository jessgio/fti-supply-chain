/**
 * Lark approval comments carry attachments in two places:
 * - `comment_list[].files` on the instance payload (`file_size`)
 * - `content` JSON from the comments API (`{"text","files":[{fileSize,url,title,type}]}`)
 * Replies nest the same JSON under `replies`.
 */

export type LarkCommentFile = {
  title: string;
  fileSize: number | null;
  /** Lark type: "image" or "attachment". */
  type: string;
  mimeType: string | null;
  /** Signed Lark URL. Valid for a limited time; do not send to the browser. */
  url: string;
};

export type LarkCommentAttachment = Omit<LarkCommentFile, "url">;

export type LarkNormalizedComment = {
  id: string;
  openId: string | null;
  userId: string | null;
  comment: string;
  createTime: string | null;
  files: LarkCommentFile[];
};

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
};

const OTHER_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
};

function fileExtension(title: string): string {
  const base = title.split(/[/\\]/).pop() ?? title;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function mimeTypeForLarkFile(title: string, type: string): string | null {
  const ext = fileExtension(title);
  if (ext === "svg") return null;
  if (ext && IMAGE_MIME[ext]) return IMAGE_MIME[ext];
  if (ext && OTHER_MIME[ext]) return OTHER_MIME[ext];
  if (type === "image") return "image/jpeg";
  return null;
}

export function parseLarkCommentPayload(raw: string | null | undefined): {
  text: string;
  files: unknown[];
} {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { text: "", files: [] };
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return { text: trimmed, files: [] };
  }
  try {
    let parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      const inner = parsed.trim();
      if (inner.startsWith("{") || inner.startsWith("[")) {
        parsed = JSON.parse(inner);
      } else {
        return { text: inner, files: [] };
      }
    }
    if (typeof parsed === "string") return { text: parsed.trim(), files: [] };
    if (Array.isArray(parsed)) return payloadFromObject({ elements: parsed });
    if (parsed && typeof parsed === "object") {
      return payloadFromObject(parsed as Record<string, unknown>);
    }
  } catch {
    // keep raw
  }
  return { text: trimmed, files: [] };
}

function payloadFromObject(obj: Record<string, unknown>): {
  text: string;
  files: unknown[];
} {
  let text = "";
  if (typeof obj.text === "string") text = obj.text.trim();
  else if (typeof obj.content === "string") text = obj.content.trim();
  else if (typeof obj.comment === "string") text = obj.comment.trim();

  const files: unknown[] = [];
  if (Array.isArray(obj.files)) files.push(...obj.files);
  if (Array.isArray(obj.elements)) {
    const parts: string[] = [];
    for (const el of obj.elements) {
      if (!el || typeof el !== "object") continue;
      const rec = el as Record<string, unknown>;
      if (typeof rec.text === "string" && rec.text.trim()) parts.push(rec.text.trim());
      if (typeof rec.url === "string") files.push(rec);
    }
    if (!text && parts.length) text = parts.join("");
  }
  return { text, files };
}

/** Visible comment text. Attachment-only JSON does not leak the raw payload. */
export function parseLarkCommentText(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  const payload = parseLarkCommentPayload(raw);
  if (payload.text) return payload.text;
  if (payload.files.length > 0) return "";
  return trimmed;
}

function unescapeLarkUrl(raw: string): string {
  return raw.trim().replace(/\\u0026/gi, "&").replace(/&amp;/g, "&");
}

export function isPrivateIpAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (!ip) return true;
  if (ip.includes(":")) {
    if (ip === "::1" || ip === "::") return true;
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    const first = ip.split(":")[0] || "0";
    const n = Number.parseInt(first, 16);
    if (!Number.isFinite(n)) return true;
    if (n >= 0xfc00 && n <= 0xfdff) return true;
    if (n >= 0xfe80 && n <= 0xfebf) return true;
    return false;
  }
  return isPrivateIpv4(ip);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Accept only public HTTPS URLs that Lark returned on a comment. */
export function assertSafeLarkFileUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(unescapeLarkUrl(raw));
  } catch {
    throw new Error("Invalid attachment URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Attachment URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Attachment URL is not allowed");
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Attachment URL host is not allowed");
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    if (isPrivateIpAddress(host)) {
      throw new Error("Attachment URL host is not allowed");
    }
  }
  return url;
}

function parseFileSize(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function normalizeFile(raw: unknown, fallbackIndex: number): LarkCommentFile | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.url !== "string" || !rec.url.trim()) return null;
  let url: URL;
  try {
    url = assertSafeLarkFileUrl(rec.url);
  } catch {
    return null;
  }
  const type =
    (typeof rec.type === "string" ? rec.type.trim().toLowerCase() : "") ||
    "attachment";
  const titleRaw = typeof rec.title === "string" ? rec.title.trim() : "";
  const title =
    titleRaw ||
    (type === "image" ? `image-${fallbackIndex + 1}` : `attachment-${fallbackIndex + 1}`);
  return {
    title,
    fileSize: parseFileSize(rec.file_size ?? rec.fileSize),
    type,
    mimeType: mimeTypeForLarkFile(title, type),
    url: url.toString(),
  };
}

function dedupeFiles(files: LarkCommentFile[]): LarkCommentFile[] {
  const seen = new Set<string>();
  const out: LarkCommentFile[] = [];
  for (const file of files) {
    if (seen.has(file.url)) continue;
    seen.add(file.url);
    out.push(file);
  }
  return out;
}

type RawComment = {
  id?: string;
  user_id?: string;
  open_id?: string;
  comment?: string;
  content?: string;
  create_time?: string;
  is_delete?: number;
  commentator?: string;
  commentator_list?: { open_id?: string; user_id?: string }[];
  files?: unknown[];
  replies?: unknown[];
};

function authorIds(raw: RawComment): { openId: string | null; userId: string | null } {
  const openId =
    raw.open_id?.trim() ||
    raw.commentator_list?.[0]?.open_id?.trim() ||
    raw.commentator?.trim() ||
    null;
  const userId =
    raw.user_id?.trim() ||
    raw.commentator_list?.[0]?.user_id?.trim() ||
    null;
  return { openId, userId };
}

function commentFromRaw(raw: RawComment): LarkNormalizedComment | null {
  const source = raw.comment ?? raw.content ?? "";
  const payload = parseLarkCommentPayload(source);
  const text =
    payload.text ||
    (payload.files.length === 0 ? source.trim() : "");
  const fieldFiles = Array.isArray(raw.files) ? raw.files : [];
  const files = dedupeFiles(
    [...fieldFiles, ...payload.files]
      .map((file, index) => normalizeFile(file, index))
      .filter((file): file is LarkCommentFile => !!file),
  );
  const id = raw.id?.trim() || "";
  if (!id && !text && files.length === 0) return null;
  const { openId, userId } = authorIds(raw);
  const createMs = raw.create_time?.trim();
  const createTime =
    createMs && /^\d+$/.test(createMs)
      ? new Date(Number(createMs)).toISOString()
      : createMs || null;
  return {
    id: id || `${openId ?? userId ?? "anon"}-${createMs ?? text}`,
    openId,
    userId,
    comment: text,
    createTime,
    files,
  };
}

function flattenComments(list: unknown, out: LarkNormalizedComment[]) {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const raw = item as RawComment;
    if (raw.is_delete === 1) {
      flattenComments(raw.replies, out);
      continue;
    }
    const comment = commentFromRaw(raw);
    if (comment) out.push(comment);
    flattenComments(raw.replies, out);
  }
}

function timeMs(comment: LarkNormalizedComment): number {
  if (!comment.createTime) return 0;
  const ms = new Date(comment.createTime).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function sortComments(list: LarkNormalizedComment[]): LarkNormalizedComment[] {
  return [...list].sort((a, b) => timeMs(a) - timeMs(b));
}

/** Normalize instance `comment_list` or comments-API rows, including replies. */
export function normalizeLarkComments(list: unknown): LarkNormalizedComment[] {
  const flat: LarkNormalizedComment[] = [];
  flattenComments(list, flat);
  return sortComments(flat);
}

function sameComment(a: LarkNormalizedComment, b: LarkNormalizedComment): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  const ta = timeMs(a);
  const tb = timeMs(b);
  if (!ta || ta !== tb) return false;
  const authorA = a.openId || a.userId || "";
  const authorB = b.openId || b.userId || "";
  if (!authorA || !authorB || authorA !== authorB) return false;
  const textA = a.comment.trim();
  const textB = b.comment.trim();
  if (!textA || !textB) return true;
  return textA === textB;
}

function mergePair(
  primary: LarkNormalizedComment,
  extra: LarkNormalizedComment,
): LarkNormalizedComment {
  return {
    id: primary.id || extra.id,
    openId: primary.openId || extra.openId,
    userId: primary.userId || extra.userId,
    comment: primary.comment.trim() ? primary.comment : extra.comment,
    createTime: primary.createTime || extra.createTime,
    files: dedupeFiles([...primary.files, ...extra.files]),
  };
}

/** Union instance comments with the threaded comments API (replies + files). */
export function mergeLarkComments(
  primary: LarkNormalizedComment[],
  extra: LarkNormalizedComment[],
): LarkNormalizedComment[] {
  const out = primary.map((comment) => ({
    ...comment,
    files: [...comment.files],
  }));
  for (const comment of extra) {
    const idx = out.findIndex((existing) => sameComment(existing, comment));
    if (idx === -1) {
      out.push({ ...comment, files: [...comment.files] });
      continue;
    }
    out[idx] = mergePair(out[idx]!, comment);
  }
  return sortComments(out);
}

export function toClientLarkCommentFile(file: LarkCommentFile): LarkCommentAttachment {
  return {
    title: file.title,
    fileSize: file.fileSize,
    type: file.type,
    mimeType: file.mimeType,
  };
}

export function toClientLarkComments<T extends { files?: LarkCommentFile[] }>(
  comments: T[],
): Array<Omit<T, "files"> & { files: LarkCommentAttachment[] }> {
  return comments.map((comment) => ({
    ...comment,
    files: (comment.files ?? []).map(toClientLarkCommentFile),
  }));
}
