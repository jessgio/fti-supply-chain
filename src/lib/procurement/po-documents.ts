export const PO_DOCUMENT_TYPES = ["proforma_invoice"] as const;

export type PoDocumentType = (typeof PO_DOCUMENT_TYPES)[number];

export const PO_DOCUMENT_LABELS: Record<PoDocumentType, string> = {
  proforma_invoice: "Proforma invoice",
};

export const PROFORMA_INVOICE_ACCEPT =
  ".pdf,.jpg,.jpeg,.xls,.xlsx,application/pdf,image/jpeg,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "xls", "xlsx"]);

export const PO_DOCUMENT_MAX_FILE_SIZE = 50 * 1024 * 1024;

export function isPoDocumentType(value: string): value is PoDocumentType {
  return (PO_DOCUMENT_TYPES as readonly string[]).includes(value);
}

function fileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedPoDocumentFile(
  fileName: string,
  mimeType: string | null | undefined,
): boolean {
  const ext = fileExtension(fileName);
  if (ALLOWED_EXTENSIONS.has(ext)) return true;
  if (mimeType && ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) return true;
  return false;
}

export function poDocumentTypeLabel(type: PoDocumentType): string {
  return PO_DOCUMENT_LABELS[type];
}
