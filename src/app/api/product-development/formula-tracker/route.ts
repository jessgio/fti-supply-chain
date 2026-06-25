import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import {
  createFormulaTrackerEntry,
  listFormulaTrackerEntries,
  listFormulaTrackerMasterView,
} from "@/lib/db/formula-tracker";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");
    const view = searchParams.get("view");

    if (!projectId || view === "master") {
      const projects = await listFormulaTrackerMasterView(createAdminClient());
      return NextResponse.json({ projects });
    }

    const entries = await listFormulaTrackerEntries(
      createAdminClient(),
      projectId,
    );
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    const body = await request.json();
    const projectId = body.project_id?.trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required." },
        { status: 400 },
      );
    }

    const { project_id: _pid, ...fields } = body;
    const entry = await createFormulaTrackerEntry(createAdminClient(), {
      project_id: projectId,
      created_by: profile?.id ?? null,
      fields,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
