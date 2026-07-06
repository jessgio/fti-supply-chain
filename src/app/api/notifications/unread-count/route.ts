import { NextResponse } from "next/server";
import { getCurrentProfile, requireReadRole } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/db/notifications";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ unread_count: 0 });
    }

    const supabase = await createClient();
    const unread_count = await getUnreadNotificationCount(supabase, profile.id);
    return NextResponse.json({ unread_count });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
