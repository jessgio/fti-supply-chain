import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { listPoProducts } from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const poId = searchParams.get("po_id");
    if (!poId) {
      return NextResponse.json({ error: "po_id is required." }, { status: 400 });
    }

    const products = await listPoProducts(createAdminClient(), poId);
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
