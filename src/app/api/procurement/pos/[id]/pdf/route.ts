import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanySettings, downloadCompanyLogo } from "@/lib/db/company-settings";
import { getVendorProductNamesBySkuIds } from "@/lib/db/vendor-products";
import { getPurchaseOrder, getSupplier } from "@/lib/db/procurement";
import { generatePoPdf } from "@/lib/procurement/po-pdf";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const po = await getPurchaseOrder(supabase, id);
    if (!po) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [company, supplier] = await Promise.all([
      getCompanySettings(supabase),
      po.supplier_id ? getSupplier(supabase, po.supplier_id) : null,
    ]);

    const logo =
      company.logo_path != null
        ? await downloadCompanyLogo(supabase, company.logo_path)
        : null;

    const skuIds = (po.lines ?? []).map((l) => l.sku_id);
    const vendorProductNames = await getVendorProductNamesBySkuIds(
      supabase,
      skuIds,
    );

    const pdf = await generatePoPdf({
      po,
      supplier,
      company,
      logo,
      vendorProductNames,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${po.po_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
