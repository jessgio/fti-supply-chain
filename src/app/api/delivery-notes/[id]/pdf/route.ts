import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanySettings, downloadCompanyLogo } from "@/lib/db/company-settings";
import {
  getDeliveryNote,
  getDeliveryNoteSettings,
  getPortal,
  getSupplierForDeliveryNote,
  regeneratePortalToken,
} from "@/lib/db/delivery-notes";
import { generateDeliveryNotePdf } from "@/lib/delivery-note/delivery-note-pdf";
import { formatDeliveryNotePdfFilename } from "@/lib/delivery-note/constants";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    const note = await getDeliveryNote(supabase, id);
    if (!note || !note.lines?.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [company, settings, supplier] = await Promise.all([
      getCompanySettings(supabase),
      getDeliveryNoteSettings(supabase),
      getSupplierForDeliveryNote(supabase, note.supplier_id),
    ]);

    const logo =
      company.logo_path != null
        ? await downloadCompanyLogo(supabase, company.logo_path)
        : null;

    const pdf = await generateDeliveryNotePdf({
      note,
      lines: note.lines,
      company,
      supplier,
      settings,
      logo,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${formatDeliveryNotePdfFilename(note)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
