export const PACKAGING_DN_NOTES = [
  "Delivery Note is proof of delivery and not proof of payment or an invoice.",
  "This Delivery Note should be signed by both parties.",
  "This Delivery Note should be kept as proof of delivery.",
] as const;

export function formatPackagingDnPdfFilename(note: {
  delivery_date: string;
  po_number: string;
}): string {
  const datePart = note.delivery_date.replace(/-/g, "");
  return `DN-${datePart} - ${note.po_number}.pdf`;
}
