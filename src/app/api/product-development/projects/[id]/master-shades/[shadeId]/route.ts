import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  deletePdMasterShade,
  updatePdMasterShade,
} from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; shadeId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { shadeId } = await context.params;
    const body = await request.json();

    const shade = await updatePdMasterShade(createAdminClient(), shadeId, {
      ...(body.shade_name != null
        ? { shade_name: String(body.shade_name).trim() }
        : {}),
      ...(typeof body.sort_order === "number"
        ? { sort_order: body.sort_order }
        : {}),
      ...(body.lab_no !== undefined
        ? { lab_no: body.lab_no ? String(body.lab_no).trim() : null }
        : {}),
      ...(body.gs1 !== undefined
        ? { gs1: body.gs1 ? String(body.gs1).trim() : null }
        : {}),
    });

    return NextResponse.json({ shade });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { shadeId } = await context.params;
    await deletePdMasterShade(createAdminClient(), shadeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
