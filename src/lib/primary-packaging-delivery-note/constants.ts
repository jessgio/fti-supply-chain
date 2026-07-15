export const PRIMARY_PACKAGING_DN_SETTINGS_ID =
  "00000000-0000-0000-0000-000000000005";

export const PRIMARY_PACKAGING_DN_NOTES = [
  "Delivery Note is proof of delivery and not proof of payment or an invoice.",
  "This Delivery Note should be signed by both parties.",
  "This Delivery Note should be kept as proof of delivery.",
] as const;

export function formatPrimaryPackagingDnPdfFilename(note: {
  delivery_date: string;
  po_number: string;
}): string {
  const datePart = note.delivery_date.replace(/-/g, "");
  return `DN-${datePart} - ${note.po_number}.pdf`;
}
