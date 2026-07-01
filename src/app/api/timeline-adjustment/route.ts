import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createProductTimeline,
  listProductTimelines,
} from "@/lib/db/timeline-adjustment";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { productTimelineBodySchema } from "@/lib/timeline-adjustment/validation";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const timelines = await listProductTimelines(createAdminClient());
    return NextResponse.json({ timelines });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const parsed = productTimelineBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const profile = await getCurrentProfile();
    const timeline = await createProductTimeline(
      createAdminClient(),
      parsed.data,
      profile?.id ?? null,
    );

    return NextResponse.json({ timeline }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
