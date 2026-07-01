import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getMargasetaSupplier,
  listOpenPosForDeliveryNote,
  listPackagingItems,
} from "@/lib/db/delivery-notes";
import { requirePortalToken } from "@/lib/delivery-note/portal-auth";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const denied = await requirePortalToken(token);
    if (denied) return denied;

    const supabase = createAdminClient();
    const [supplier, packagingItems] = await Promise.all([
      getMargasetaSupplier(supabase),
      listPackagingItems(supabase),
    ]);

    if (!supplier) {
      return NextResponse.json(
        { error: "Configured supplier was not found in the database." },
        { status: 500 },
      );
    }

    const pos = await listOpenPosForDeliveryNote(supabase, supplier.id);

    return NextResponse.json({
      supplier,
      pos,
      packagingItems,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
