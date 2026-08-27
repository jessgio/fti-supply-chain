import { NextResponse } from "next/server";
import {
  requireCommercialWrite,
  requireReadRole,
} from "@/lib/auth";
import {
  listSalesChannels,
  saveChannelGroups,
  isSopGroup,
} from "@/lib/db/sales-forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { SopChannelGroup } from "@/lib/sales-forecast/constants";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;
    const supabase = createAdminClient();
    const channels = await listSalesChannels(supabase);
    return NextResponse.json({ channels });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;

    const body = await request.json();
    const raw: unknown[] = Array.isArray(body.channels) ? body.channels : [];
    const updates: Array<{ id: string; sop_group: SopChannelGroup | null }> =
      [];
    for (const row of raw) {
      const item = row as { id?: string; sop_group?: string | null };
      const id = String(item.id ?? "");
      if (!id) continue;
      const group = item.sop_group;
      if (group == null || group === "") {
        updates.push({ id, sop_group: null });
      } else if (isSopGroup(group)) {
        updates.push({ id, sop_group: group });
      } else {
        return NextResponse.json(
          { error: "sop_group must be online, offline, or empty." },
          { status: 400 },
        );
      }
    }

    const supabase = createAdminClient();
    await saveChannelGroups(supabase, updates);
    const channels = await listSalesChannels(supabase);
    return NextResponse.json({ channels });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
