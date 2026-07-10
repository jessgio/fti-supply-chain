import type { Supplier } from "@/types/database";

type SupplierNotesFields = Pick<
  Supplier,
  | "payment_terms"
  | "lead_time_note"
  | "delivery_time"
  | "packaging_notes"
  | "beneficiary_name"
  | "beneficiary_account_number"
  | "swift_code"
  | "beneficiary_country"
  | "beneficiary_address"
  | "beneficiary_bank"
  | "beneficiary_bank_address"
  | "bank_code"
  | "branch_code"
>;

function hasPaymentTerms(s: SupplierNotesFields): boolean {
  return Boolean(
    s.payment_terms?.trim() ||
      s.lead_time_note?.trim() ||
      s.delivery_time?.trim() ||
      s.packaging_notes?.trim(),
  );
}

function hasBankingDetails(s: SupplierNotesFields): boolean {
  return Boolean(
    s.beneficiary_name?.trim() ||
      s.beneficiary_account_number?.trim() ||
      s.swift_code?.trim() ||
      s.beneficiary_country?.trim() ||
      s.beneficiary_address?.trim() ||
      s.beneficiary_bank?.trim() ||
      s.beneficiary_bank_address?.trim() ||
      s.bank_code?.trim() ||
      s.branch_code?.trim(),
  );
}

function numberedLine(
  index: number,
  label: string,
  value: string | null | undefined,
): string {
  const trimmed = value?.trim();
  return trimmed
    ? `${index}) ${label} : ${trimmed}`
    : `${index}) ${label} :`;
}

function labeledLine(
  label: string,
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? `${label} : ${trimmed}` : null;
}

export function formatSupplierPoNotes(
  supplier: SupplierNotesFields | null | undefined,
): string | null {
  if (!supplier) return null;

  const sections: string[] = [];

  if (hasPaymentTerms(supplier)) {
    sections.push(
      [
        "Term of Payment :",
        numberedLine(1, "Payment", supplier.payment_terms),
        numberedLine(2, "Lead time", supplier.lead_time_note),
        numberedLine(3, "Delivery time", supplier.delivery_time),
        numberedLine(4, "Packaging", supplier.packaging_notes),
      ].join("\n"),
    );
  }

  if (hasBankingDetails(supplier)) {
    const bankLines = [
      labeledLine("Beneficiary Name", supplier.beneficiary_name),
      labeledLine("Beneficiary Account Number", supplier.beneficiary_account_number),
      labeledLine("Swift Code", supplier.swift_code),
      labeledLine("Country/Region", supplier.beneficiary_country),
      labeledLine("Beneficiary Address", supplier.beneficiary_address),
      labeledLine("Beneficiary Bank", supplier.beneficiary_bank),
      labeledLine("Beneficiary Bank Address", supplier.beneficiary_bank_address),
      labeledLine("Bank Code", supplier.bank_code),
      labeledLine("Branch Code", supplier.branch_code),
    ].filter((l): l is string => l != null);

    if (bankLines.length > 0) sections.push(bankLines.join("\n"));
  }

  if (sections.length === 0) return null;
  return sections.join("\n\n");
}

/** Banking / remittance block for Lark AP Form supplier field (matches PO form). */
export function formatSupplierPaymentDetails(
  supplier: (SupplierNotesFields & { name?: string | null }) | null | undefined,
): string {
  if (!supplier) return "";

  const parts: string[] = [];
  const name = supplier.name?.trim();
  if (name) parts.push(name);

  if (hasBankingDetails(supplier)) {
    const bankLines = [
      labeledLine("Beneficiary Name", supplier.beneficiary_name),
      labeledLine(
        "Beneficiary Account Number",
        supplier.beneficiary_account_number,
      ),
      labeledLine("Swift Code", supplier.swift_code),
      labeledLine("Country/Region", supplier.beneficiary_country),
      labeledLine("Beneficiary Address", supplier.beneficiary_address),
      labeledLine("Beneficiary Bank", supplier.beneficiary_bank),
      labeledLine(
        "Beneficiary Bank Address",
        supplier.beneficiary_bank_address,
      ),
      labeledLine("Bank Code", supplier.bank_code),
      labeledLine("Branch Code", supplier.branch_code),
    ].filter((l): l is string => l != null);

    if (bankLines.length > 0) parts.push(bankLines.join("\n"));
  }

  return parts.join("\n\n");
}

export function composePoPdfNotes(
  poNotes: string | null | undefined,
  supplier: SupplierNotesFields | null | undefined,
): string | null {
  const parts: string[] = [];
  const trimmedPoNotes = poNotes?.trim();
  if (trimmedPoNotes) parts.push(trimmedPoNotes);

  const supplierNotes = formatSupplierPoNotes(supplier);
  if (supplierNotes) parts.push(supplierNotes);

  return parts.length > 0 ? parts.join("\n\n") : null;
}
