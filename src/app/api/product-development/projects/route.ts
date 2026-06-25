import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import {
  createPdProject,
  listPdProjects,
} from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const projects = await listPdProjects(createAdminClient());
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const body = await request.json();
    const profile = await getCurrentProfile();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    }

    const project = await createPdProject(createAdminClient(), {
      name: body.name.trim(),
      description: body.description ?? null,
      product_name: body.product_name ?? null,
      created_by: profile?.id ?? null,
      phases: body.phases ?? [],
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
