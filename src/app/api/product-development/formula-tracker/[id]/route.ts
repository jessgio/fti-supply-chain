import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  deleteFormulaTrackerEntry,
  getFormulaTrackerEntry,
  updateFormulaTrackerEntry,
} from "@/lib/db/formula-tracker";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await context.params;
    const entry = await getFormulaTrackerEntry(createAdminClient(), id);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await context.params;
    const body = await request.json();
    const { project_id: _pid, id: _id, ...fields } = body;

    const entry = await updateFormulaTrackerEntry(
      createAdminClient(),
      id,
      fields,
    );
    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await context.params;
    await deleteFormulaTrackerEntry(createAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
