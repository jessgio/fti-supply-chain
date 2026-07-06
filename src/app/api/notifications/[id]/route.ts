import { NextResponse } from "next/server";
import { getCurrentProfile, requireReadRole } from "@/lib/auth";
import { markNotificationRead } from "@/lib/db/notifications";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const supabase = await createClient();
    await markNotificationRead(supabase, id, profile.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
