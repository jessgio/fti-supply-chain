import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("skus")
      .select("id, sku_code, name, is_bundle")
      .eq("is_bundle", false)
      .order("sku_code");
    if (error) throw error;
    return NextResponse.json({ skus: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
