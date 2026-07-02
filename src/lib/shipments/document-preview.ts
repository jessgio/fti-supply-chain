export type DocumentPreviewKind = "image" | "pdf";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function getDocumentPreviewKind(
  mimeType: string | null,
  fileName: string,
): DocumentPreviewKind | null {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";

  const ext = fileExtension(fileName);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return null;
}

export function isPreviewableDocument(
  mimeType: string | null,
  fileName: string,
): boolean {
  return getDocumentPreviewKind(mimeType, fileName) !== null;
}
