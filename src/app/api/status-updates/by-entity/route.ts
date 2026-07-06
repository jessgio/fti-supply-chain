import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { listStatusUpdatesForEntity } from "@/lib/db/status-updates";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { StatusUpdateRecordEntityType } from "@/types/database";

const ENTITY_TYPES = new Set<StatusUpdateRecordEntityType>([
  "po",
  "payment",
  "shipment",
]);

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");
    const limit = Math.min(
      200,
      Math.max(1, Number(searchParams.get("limit") ?? "5") || 5),
    );

    if (
      !entityType ||
      !ENTITY_TYPES.has(entityType as StatusUpdateRecordEntityType)
    ) {
      return NextResponse.json(
        { error: "Valid entity_type is required (po, payment, shipment)." },
        { status: 400 },
      );
    }
    if (!entityId) {
      return NextResponse.json(
        { error: "entity_id is required." },
        { status: 400 },
      );
    }

    const result = await listStatusUpdatesForEntity(
      createAdminClient(),
      entityType as StatusUpdateRecordEntityType,
      entityId,
      limit,
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
