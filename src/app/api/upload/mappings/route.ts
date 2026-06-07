import { NextResponse } from "next/server";
import { parseMappingsExcel } from "@/lib/excel/parse";
import { importMappings } from "@/lib/db/uploads";
import { errorMessage } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireWriteRole } from "@/lib/auth";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const { mappings, bundles } = parseMappingsExcel(buffer);
    if (mappings.length === 0) {
      return NextResponse.json(
        { error: "No franchise mappings found. Include sku_code and franchise columns." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await importMappings(supabase, mappings, bundles, file.name);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Mappings upload failed:", error);
    const message = errorMessage(error);
    const hint = message.includes("product_franchises")
      ? " Database tables are missing — run Supabase migrations first (see README)."
      : "";
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
