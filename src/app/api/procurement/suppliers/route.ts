import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupplier, listSuppliers } from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const suppliers = await listSuppliers(supabase);
    return NextResponse.json({ suppliers });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    if (!body?.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Supplier name is required." },
        { status: 400 },
      );
    }
    const supabase = createAdminClient();
    const supplier = await createSupplier(supabase, {
      name: body.name.trim(),
      lead_time_days:
        body.lead_time_days != null ? Number(body.lead_time_days) : undefined,
      contact: body.contact ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ supplier });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
