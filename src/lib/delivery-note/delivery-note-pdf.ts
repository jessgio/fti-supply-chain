import type {
  CompanySettings,
  DeliveryNote,
  DeliveryNoteLine,
  DeliveryNoteSettings,
  Supplier,
} from "@/types/database";
import { generatePackagingDnPdf } from "@/lib/packaging-dn/packaging-dn-pdf";

export interface DeliveryNotePdfData {
  note: DeliveryNote;
  lines: DeliveryNoteLine[];
  company: CompanySettings;
  supplier: Supplier | null;
  settings: DeliveryNoteSettings;
  logo?: Buffer | null;
}

export function generateDeliveryNotePdf(data: DeliveryNotePdfData): Promise<Buffer> {
  const { note, lines, company, supplier, settings, logo } = data;

  return generatePackagingDnPdf({
    variant: "secondary",
    note,
    lines,
    company,
    fromParty: {
      name: supplier?.name ?? "—",
      pic: supplier?.pic_name,
      address: supplier?.address,
      phone: supplier?.pic_phone,
      email: supplier?.pic_email,
    },
    shipTo: {
      name: settings.recipient_company,
      pic: note.recipient_name || settings.recipient_pic_name,
      address: settings.recipient_address,
      phone: settings.recipient_phone,
      email: settings.recipient_email,
    },
    pengirimName: supplier?.pic_name ?? "—",
    logo,
  });
}
