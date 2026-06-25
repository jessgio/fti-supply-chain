import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import {
  createPdPantoneSwatch,
  generatePdPantoneSwatchImage,
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
    const colorName = body.color_name?.toString().trim();
    const pantoneCode = body.pantone_code?.toString().trim();
    if (!colorName || !pantoneCode) {
      return NextResponse.json(
        { error: "color_name and pantone_code are required." },
        { status: 400 },
      );
    }

    const swatch = await createPdPantoneSwatch(createAdminClient(), projectId, {
      color_name: colorName,
      pantone_code: pantoneCode,
      sort_order:
        body.sort_order != null ? Number(body.sort_order) : undefined,
    });

    const profile = await getCurrentProfile();
    try {
      await generatePdPantoneSwatchImage(
        createAdminClient(),
        projectId,
        swatch.id,
        profile?.id ?? null,
      );
    } catch (generateError) {
      return NextResponse.json(
        {
          swatch,
          warning: errorMessage(generateError),
        },
        { status: 201 },
      );
    }

    return NextResponse.json({ swatch }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
