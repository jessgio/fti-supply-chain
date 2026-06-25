import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import {
  addCycleNote,
  updatePhaseCycleNotes,
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

    const profile = await getCurrentProfile();
    const { id: projectId } = await context.params;
    const body = await request.json();

    if (body.phase_id && body.cycle_notes !== undefined) {
      await updatePhaseCycleNotes(
        createAdminClient(),
        body.phase_id,
        body.cycle_notes,
      );
      return NextResponse.json({ ok: true });
    }

    if (!body.notes?.trim()) {
      return NextResponse.json({ error: "Notes are required." }, { status: 400 });
    }

    const note = await addCycleNote(createAdminClient(), {
      project_id: projectId,
      phase_id: body.phase_id ?? null,
      title: body.title ?? null,
      notes: body.notes.trim(),
      created_by: profile?.id ?? null,
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
