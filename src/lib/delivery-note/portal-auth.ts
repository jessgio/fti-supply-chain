import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalByToken } from "@/lib/db/delivery-notes";
import { errorMessage } from "@/lib/errors";

export async function requirePortalToken(
  token: string,
): Promise<NextResponse | null> {
  try {
    const supabase = createAdminClient();
    const portal = await getPortalByToken(supabase, token);
    if (!portal) {
      return NextResponse.json({ error: "Invalid or expired link." }, { status: 403 });
    }
    return null;
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
