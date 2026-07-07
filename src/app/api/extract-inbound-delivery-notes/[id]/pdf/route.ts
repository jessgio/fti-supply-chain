import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanySettings, downloadCompanyLogo } from "@/lib/db/company-settings";
import { getExtractInboundDeliveryNote, getExtractInboundDnSettings } from "@/lib/db/extract-inbound-delivery-notes";
import { generateExtractInboundDnPdf, extractInboundDnPdfFilename } from "@/lib/extract-inbound-delivery-note/extract-inbound-dn-pdf";
import { requireReadRole } from "@/lib/auth";
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
    const note = await getExtractInboundDeliveryNote(supabase, id);
    if (!note || !note.lines?.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [company, settings] = await Promise.all([
      getCompanySettings(supabase),
      getExtractInboundDnSettings(supabase),
    ]);

    const logo =
      company.logo_path != null
        ? await downloadCompanyLogo(supabase, company.logo_path)
        : null;

    const pdf = await generateExtractInboundDnPdf({
      note,
      lines: note.lines,
      company,
      settings,
      logo,
    });

    const filename = extractInboundDnPdfFilename(note.delivery_date, note.po_number);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
