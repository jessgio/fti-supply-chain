import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { recalculateExtractLedger } from "@/lib/db/extracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    let openingBalance: number | undefined;
    try {
      const body = (await request.json()) as {
        opening_balance?: number;
      };
      if (
        body.opening_balance !== undefined &&
        Number.isFinite(Number(body.opening_balance))
      ) {
        openingBalance = Number(body.opening_balance);
      }
    } catch {
      // Empty body is fine — derive opening balance from the ledger.
    }

    const result = await recalculateExtractLedger(
      createAdminClient(),
      id,
      openingBalance,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
