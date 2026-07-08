import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  deleteProductExtractFormula,
  updateProductExtractFormula,
} from "@/lib/db/product-extract-formulas";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await context.params;
    const body = await request.json();
    const patch: {
      extract_kg_per_unit?: number;
      notes?: string | null;
    } = {};

    if (body.extract_kg_per_unit !== undefined) {
      const kg = Number(body.extract_kg_per_unit);
      if (!Number.isFinite(kg) || kg <= 0) {
        return NextResponse.json(
          { error: "Extract kg per unit must be greater than zero." },
          { status: 400 },
        );
      }
      patch.extract_kg_per_unit = kg;
    }
    if (body.notes !== undefined) {
      patch.notes = body.notes;
    }

    const supabase = createAdminClient();
    const formula = await updateProductExtractFormula(supabase, id, patch);
    return NextResponse.json({ formula });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await context.params;
    const supabase = createAdminClient();
    await deleteProductExtractFormula(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
