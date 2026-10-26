/**
 * Original files on a Lark AP Form live on the attachment widget, not in
 * comments. Instance details return them as:
 * - `value`: temporary download URLs (12h) or upload file codes
 * - `ext`: original filenames, comma-separated, sometimes single-quoted
 */

import { AP_FORM_WIDGETS } from "@/lib/lark/ap-form";
import {
  assertSafeLarkFileUrl,
  mimeTypeForLarkFile,
  type LarkCommentAttachment,
} from "@/lib/lark/comment-files";

export type LarkFormFile = {
  title: string;
  fileSize: number | null;
  /** Lark type: "image" or "attachment". */
  type: string;
  mimeType: string | null;
  /** Signed Lark URL. Valid for a limited time; do not send to the browser. */
  url: string | null;
  /** Upload file code when the instance has not expanded a URL yet. */
  fileCode: string | null;
};

const ATTACHMENT_WIDGET_TYPES = new Set([
  "attachment",
  "attachmentv2",
  "image",
  "imagev2",
]);

const FILE_CODE = /^[A-Za-z0-9_-]{8,128}$/;

function parseWidgets(form: unknown): Record<string, unknown>[] {
  if (Array.isArray(form)) {
    return form.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (typeof form !== "string" || !form.trim()) return [];
  try {
    return parseWidgets(JSON.parse(form) as unknown);
  } catch {
    return [];
  }
}

function widgetType(widget: Record<string, unknown>): string {
  return typeof widget.type === "string" ? widget.type.trim().toLowerCase() : "";
}

function isAttachmentWidget(widget: Record<string, unknown>): boolean {
  if (widget.id === AP_FORM_WIDGETS.attachments) return true;
  return ATTACHMENT_WIDGET_TYPES.has(widgetType(widget));
}

/** Lark documents names as `'a.pdf','b, c.png'` or `a.pdf,b.png`. */
export function splitLarkAttachmentNames(ext: string): string[] {
  const trimmed = ext.trim();
  if (!trimmed) return [];
  if (/^'[^']*'(?:\s*,\s*'[^']*')*$/.test(trimmed)) {
    return [...trimmed.matchAll(/'([^']*)'/g)].map((match) => match[1]);
  }
  return trimmed.split(",").map((part) => part.trim());
}

export function formatLarkAttachmentExt(names: string[]): string {
  const cleaned = names.map(
    (name) => name.replace(/[\r\n']/g, "").trim() || "attachment",
  );
  if (cleaned.length === 0) return "";
  if (cleaned.some((name) => name.includes(","))) {
    return cleaned.map((name) => `'${name}'`).join(",");
  }
  return cleaned.join(",");
}

function readExtNames(ext: unknown): string[] {
  if (Array.isArray(ext)) {
    return ext.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return objectName(item as Record<string, unknown>);
      }
      return "";
    });
  }
  if (typeof ext === "string") return splitLarkAttachmentNames(ext);
  return [];
}

function alignedNames(ext: unknown, count: number): string[] {
  const names = readExtNames(ext);
  if (names.length === count) return names;
  if (
    count === 1 &&
    names.length !== 1 &&
    typeof ext === "string" &&
    ext.trim() &&
    !/'[^']*'/.test(ext)
  ) {
    return [ext.trim()];
  }
  return [];
}

function objectName(rec: Record<string, unknown>): string {
  for (const key of ["title", "name", "file_name", "fileName"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stringField(
  rec: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseFileSize(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function filenameFromUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const hash = decodeURIComponent(url.hash.replace(/^#/, ""));
    if (hash && !hash.startsWith(".") && /\.[a-z0-9]{1,8}$/i.test(hash)) {
      const base = hash.split("/").pop() ?? "";
      if (base && base.length <= 180) return base;
    }
    const path = decodeURIComponent(url.pathname).replace(/~tplv-[^/]+$/i, "");
    const base = path.split("/").pop() ?? "";
    if (
      base &&
      base.length <= 180 &&
      /\.[a-z0-9]{1,8}$/i.test(base) &&
      !/^[0-9a-f-]{16,}$/i.test(base.replace(/\.[a-z0-9]+$/i, ""))
    ) {
      return base;
    }
  } catch {
    return "";
  }
  return "";
}

function classifyToken(raw: string): { url: string } | { fileCode: string } | null {
  const text = raw.trim().replace(/\\u0026/gi, "&").replace(/&amp;/g, "&");
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      return { url: assertSafeLarkFileUrl(text).toString() };
    } catch {
      return null;
    }
  }
  if (FILE_CODE.test(text)) return { fileCode: text };
  return null;
}

function valueItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      // Keep the raw string.
    }
  }
  if (trimmed.includes(",")) {
    const parts = trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const tokens = parts.every(
      (part) => /^https?:\/\//i.test(part) || FILE_CODE.test(part),
    );
    if (tokens && parts.length > 1) return parts;
  }
  return [trimmed];
}

function defaultType(widget: Record<string, unknown>): string {
  const type = widgetType(widget);
  return type === "image" || type === "imagev2" ? "image" : "attachment";
}

function fileFromItem(
  item: unknown,
  index: number,
  extName: string,
  widget: Record<string, unknown>,
): LarkFormFile | null {
  let token: { url: string } | { fileCode: string } | null = null;
  let objectTitle = "";
  let fileSize: number | null = null;
  let type = defaultType(widget);

  if (typeof item === "string") {
    token = classifyToken(item);
  } else if (item && typeof item === "object" && !Array.isArray(item)) {
    const rec = item as Record<string, unknown>;
    objectTitle = objectName(rec);
    fileSize = parseFileSize(rec.file_size ?? rec.fileSize ?? rec.size);
    const objectType =
      typeof rec.type === "string" ? rec.type.trim().toLowerCase() : "";
    if (objectType === "image" || objectType === "attachment") type = objectType;
    const rawUrl = stringField(rec, ["url", "file_url", "download_url"]);
    const rawCode = stringField(rec, ["code", "file_code", "fileCode", "token"]);
    token = rawUrl ? classifyToken(rawUrl) : null;
    if (!token && rawCode) token = classifyToken(rawCode);
    if (!token) {
      const nested = stringField(rec, ["value"]);
      if (nested) token = classifyToken(nested);
    }
  }

  if (!token) return null;
  const url = "url" in token ? token.url : null;
  const fileCode = "fileCode" in token ? token.fileCode : null;
  const titleFromUrl = url ? filenameFromUrl(url) : "";
  const title =
    objectTitle ||
    extName.trim() ||
    titleFromUrl ||
    (type === "image" ? `image-${index + 1}` : `attachment-${index + 1}`);
  const mimeType = mimeTypeForLarkFile(title, type, url ?? undefined);
  if (mimeType?.startsWith("image/")) type = "image";
  return { title, fileSize, type, mimeType, url, fileCode };
}

/** Files attached on the AP Form itself. Comment attachments are not included. */
export function formFilesFromLarkForm(form: unknown): LarkFormFile[] {
  const files: LarkFormFile[] = [];
  for (const widget of parseWidgets(form)) {
    if (!isAttachmentWidget(widget)) continue;
    const items = valueItems(widget.value);
    const names = alignedNames(widget.ext, items.length);
    items.forEach((item, index) => {
      const file = fileFromItem(item, files.length, names[index] ?? "", widget);
      if (file) files.push(file);
    });
  }
  return files;
}

export function toClientLarkFormFiles(
  files: LarkFormFile[],
): LarkCommentAttachment[] {
  return files.map((file) => ({
    title: file.title,
    fileSize: file.fileSize,
    type: file.type,
    mimeType: file.mimeType,
  }));
}
