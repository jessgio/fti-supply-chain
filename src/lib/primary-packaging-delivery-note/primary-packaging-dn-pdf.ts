import type {
  CompanySettings,
  PrimaryPackagingDeliveryNote,
  PrimaryPackagingDeliveryNoteLine,
  PrimaryPackagingDnSettings,
} from "@/types/database";
import { generatePackagingDnPdf } from "@/lib/packaging-dn/packaging-dn-pdf";

export interface PrimaryPackagingDnPdfData {
  note: PrimaryPackagingDeliveryNote;
  lines: PrimaryPackagingDeliveryNoteLine[];
  company: CompanySettings;
  settings: PrimaryPackagingDnSettings;
  logo?: Buffer | null;
}

export function generatePrimaryPackagingDnPdf(
  data: PrimaryPackagingDnPdfData,
): Promise<Buffer> {
  const { note, lines, company, settings, logo } = data;

  return generatePackagingDnPdf({
    variant: "primary",
    note,
    lines,
    company,
    fromParty: {
      name: company.company_name,
      pic: company.pic_name,
      address: company.address,
      phone: company.pic_phone,
      email: company.pic_email,
    },
    shipTo: {
      name: settings.recipient_company,
      pic: note.recipient_name || settings.recipient_pic_name,
      address: settings.recipient_address,
      phone: settings.recipient_phone,
      email: settings.recipient_email,
    },
    pengirimName: company.pic_name ?? "—",
    logo,
  });
}
