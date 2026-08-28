import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { loadSalesAccuracy } from "@/lib/db/sales-accuracy";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const payload = await loadSalesAccuracy(supabase, year);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
