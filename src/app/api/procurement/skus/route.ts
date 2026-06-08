import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("skus")
      .select(
        "id, sku_code, name, is_bundle, product_franchises(name)",
      )
      .eq("is_bundle", false)
      .order("sku_code");
    if (error) throw error;

    const skus = (data ?? []).map((row) => {
      const franchise = row.product_franchises as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const franchiseName = Array.isArray(franchise)
        ? (franchise[0]?.name ?? null)
        : (franchise?.name ?? null);
      return {
        id: row.id,
        sku_code: row.sku_code,
        name: row.name,
        franchise_name: franchiseName,
      };
    });

    return NextResponse.json({ skus });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
