import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { getSupplierUsualTerms } from "@/lib/db/supplier-usual-terms";
import { errorMessage } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const excludePoId = searchParams.get("exclude_po_id");

    const supabase = createAdminClient();
    const terms = await getSupplierUsualTerms(supabase, id, { excludePoId });
    return NextResponse.json({ terms });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
