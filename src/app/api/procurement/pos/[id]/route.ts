import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPurchaseOrder,
  updatePurchaseOrderStatus,
} from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";
import type { PoStatus } from "@/types/database";

const VALID_STATUSES: PoStatus[] = [
  "planned",
  "ordered",
  "in_transit",
  "received",
  "cancelled",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const status = body?.status as PoStatus | undefined;
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "A valid status is required." },
        { status: 400 },
      );
    }
    const supabase = createAdminClient();
    const purchaseOrder = await updatePurchaseOrderStatus(supabase, id, status);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
