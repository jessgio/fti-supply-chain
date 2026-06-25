import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import {
  deletePdPantoneSwatch,
  generatePdPantoneSwatchImage,
  updatePdPantoneSwatch,
} from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; swatchId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id: projectId, swatchId } = await context.params;
    const body = await request.json();
    const patch: {
      color_name?: string;
      pantone_code?: string;
      sort_order?: number;
    } = {};

    if (body.color_name != null) {
      patch.color_name = String(body.color_name).trim();
    }
    if (body.pantone_code != null) {
      patch.pantone_code = String(body.pantone_code).trim();
    }
    if (body.sort_order != null) {
      patch.sort_order = Number(body.sort_order);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    await updatePdPantoneSwatch(
      createAdminClient(),
      projectId,
      swatchId,
      patch,
    );

    if (patch.pantone_code != null) {
      const profile = await getCurrentProfile();
      try {
        await generatePdPantoneSwatchImage(
          createAdminClient(),
          projectId,
          swatchId,
          profile?.id ?? null,
        );
      } catch (generateError) {
        return NextResponse.json({
          ok: true,
          warning: errorMessage(generateError),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id: projectId, swatchId } = await context.params;
    await deletePdPantoneSwatch(createAdminClient(), projectId, swatchId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
