import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import {
  deletePdProject,
  getPdProject,
  updatePdProject,
} from "@/lib/db/product-development";
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
    const project = await getPdProject(createAdminClient(), id);
    if (!project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    return NextResponse.json({ project });
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
    const project = await updatePdProject(createAdminClient(), id, body);
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await context.params;
    await deletePdProject(createAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
