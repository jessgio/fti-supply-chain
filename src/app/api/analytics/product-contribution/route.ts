import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadProductContribution } from "@/lib/analytics/product-contribution";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channel_id");
    const franchiseId = searchParams.get("franchise_id");

    const supabase = createAdminClient();
    const { rows, meta } = await loadProductContribution(supabase, {
      channelId,
      franchiseId,
    });

    return NextResponse.json({ rows, meta });
  } catch (error) {
    console.error("Product contribution analytics failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
