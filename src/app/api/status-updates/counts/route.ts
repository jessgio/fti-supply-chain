import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { listStatusUpdateCountsByEntity } from "@/lib/db/status-updates";
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
    const idsParam = searchParams.get("ids");

    if (
      !entityType ||
      !ENTITY_TYPES.has(entityType as StatusUpdateRecordEntityType)
    ) {
      return NextResponse.json(
        { error: "Valid entity_type is required (po, payment, shipment)." },
        { status: 400 },
      );
    }
    if (!idsParam?.trim()) {
      return NextResponse.json({ counts: [] });
    }

    const entityIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const counts = await listStatusUpdateCountsByEntity(
      createAdminClient(),
      entityType as StatusUpdateRecordEntityType,
      entityIds,
    );

    return NextResponse.json({ counts });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
