import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  createPdMasterShade,
  deletePdMasterShade,
  updatePdMasterShade,
} from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id: projectId } = await context.params;
    const body = await request.json();
    const shadeName = body.shade_name?.toString().trim();

    if (!shadeName) {
      return NextResponse.json(
        { error: "shade_name is required." },
        { status: 400 },
      );
    }

    const shade = await createPdMasterShade(createAdminClient(), projectId, {
      shade_name: shadeName,
      sort_order:
        typeof body.sort_order === "number" ? body.sort_order : undefined,
    });

    return NextResponse.json({ shade }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
