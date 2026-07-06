import { NextResponse } from "next/server";
import { getCurrentProfile, requireReadRole } from "@/lib/auth";
import {
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/db/notifications";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, Number(searchParams.get("limit") ?? "50") || 50),
    );

    const supabase = await createClient();
    const notifications = await listNotificationsForUser(
      supabase,
      profile.id,
      limit,
    );

    return NextResponse.json({ notifications });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.action !== "mark_all_read") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const supabase = await createClient();
    await markAllNotificationsRead(supabase, profile.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
