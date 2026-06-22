import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createInboundReceive,
  listInboundReceives,
} from "@/lib/db/inbound";
import { listOpenShipmentsForInbound } from "@/lib/db/shipments";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    const supabase = createAdminClient();
    if (mode === "open_shipments") {
      const shipments = await listOpenShipmentsForInbound(supabase);
      return NextResponse.json({ shipments });
    }

    const receives = await listInboundReceives(supabase, {
      search: searchParams.get("search") ?? undefined,
    });
    return NextResponse.json({ receives });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const receive = await createInboundReceive(createAdminClient(), body);
    invalidateForecastCache();
    return NextResponse.json({ receive }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
