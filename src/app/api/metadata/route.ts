import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const [channelsRes, franchisesRes] = await Promise.all([
      supabase.from("sales_channels").select("id, name").order("name"),
      supabase
        .from("product_franchises")
        .select("id, name")
        .order("name"),
    ]);

    if (channelsRes.error) throw channelsRes.error;
    if (franchisesRes.error) throw franchisesRes.error;

    return NextResponse.json({
      channels: channelsRes.data ?? [],
      franchises: franchisesRes.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Metadata failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
