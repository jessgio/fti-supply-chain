import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { getLineAllocations } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const poIds = searchParams.getAll("po_id");
    if (!poIds.length) {
      return NextResponse.json(
        { error: "At least one po_id is required." },
        { status: 400 },
      );
    }

    const allocations = await getLineAllocations(createAdminClient(), poIds);
    return NextResponse.json({ allocations });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
