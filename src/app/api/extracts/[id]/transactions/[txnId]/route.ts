import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  deleteExtractTransaction,
  updateExtractTransaction,
} from "@/lib/db/extracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; txnId: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { txnId } = await params;
    const body = (await request.json()) as {
      txn_date?: string;
      tran_code?: string | null;
      order_no?: string | null;
      lot_no?: string | null;
      received?: number;
      issued?: number;
      remark?: string | null;
      status?: string | null;
    };

    await updateExtractTransaction(createAdminClient(), txnId, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; txnId: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { txnId } = await params;
    await deleteExtractTransaction(createAdminClient(), txnId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
