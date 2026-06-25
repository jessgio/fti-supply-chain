import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import { generateMasterShadeGs1Barcode } from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; shadeId: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    const { id: projectId, shadeId } = await context.params;

    const file = await generateMasterShadeGs1Barcode(
      createAdminClient(),
      projectId,
      shadeId,
      profile?.id ?? null,
    );

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
