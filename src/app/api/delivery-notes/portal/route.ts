import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPortal,
  regeneratePortalToken,
  updatePortalToken,
} from "@/lib/db/delivery-notes";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const portal = await getPortal(supabase);
    return NextResponse.json({ portal });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const supabase = createAdminClient();
    const portal = await regeneratePortalToken(supabase);
    return NextResponse.json({ portal });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const accessToken = body?.access_token;
    if (!accessToken || typeof accessToken !== "string") {
      return NextResponse.json(
        { error: "access_token is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const portal = await updatePortalToken(supabase, accessToken);
    return NextResponse.json({ portal });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
