import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { updateSku } from "@/lib/db/skus";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = (await request.json()) as {
      name?: string | null;
      is_active?: boolean;
      is_bundle?: boolean;
      is_packaging?: boolean;
      is_clearance?: boolean;
      franchise_id?: string | null;
      franchise_name?: string | null;
    };

    const input: {
      name?: string | null;
      is_active?: boolean;
      is_bundle?: boolean;
      is_packaging?: boolean;
      is_clearance?: boolean;
      franchise_id?: string | null;
      franchise_name?: string | null;
    } = {};

    if (body.name !== undefined) {
      input.name = typeof body.name === "string" ? body.name : null;
    }

    if (typeof body.is_active === "boolean") {
      input.is_active = body.is_active;
    }
    if (typeof body.is_bundle === "boolean") {
      input.is_bundle = body.is_bundle;
    }
    if (typeof body.is_packaging === "boolean") {
      input.is_packaging = body.is_packaging;
    }
    if (typeof body.is_clearance === "boolean") {
      input.is_clearance = body.is_clearance;
    }
    if (body.franchise_id !== undefined) {
      input.franchise_id =
        typeof body.franchise_id === "string" ? body.franchise_id : null;
    }
    if (body.franchise_name !== undefined) {
      input.franchise_name =
        typeof body.franchise_name === "string" ? body.franchise_name : null;
    }

    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        {
          error:
            "Provide name, is_active, is_bundle, is_packaging, is_clearance, franchise_id, and/or franchise_name",
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const sku = await updateSku(supabase, id, input);

    if (
      typeof input.is_active === "boolean" ||
      typeof input.is_clearance === "boolean"
    ) {
      invalidateForecastCache();
    }

    return NextResponse.json({ ok: true, sku });
  } catch (error) {
    const message = errorMessage(error);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
