import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listDeliveryNotes } from "@/lib/db/delivery-notes";
import { requireReadRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const supabase = await createClient();
    const notes = await listDeliveryNotes(supabase);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
