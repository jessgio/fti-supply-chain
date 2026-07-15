import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { loadItemNameMappings } from "@/lib/db/extract-mappings";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

const CATALOG_HINT =
  "Extract name ↔ item code is managed in the Extract Catalog. Manual item-name mapping writes are disabled.";

/** Read-only: mappings are maintained by catalog sync. */
export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const mappings = await loadItemNameMappings(createAdminClient());
    return NextResponse.json({ mappings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    {
      error: CATALOG_HINT,
      catalog: "/dashboard/extract-inbound-delivery-notes/codes",
    },
    { status: 410 },
  );
}
