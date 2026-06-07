import { NextResponse } from "next/server";
import { parseStockExcel } from "@/lib/excel/parse";
import { importStock } from "@/lib/db/uploads";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";
import { stockImportLocationsLabel } from "@/lib/stock/locations";

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
    const rows = parseStockExcel(buffer);
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            `No valid stock rows found. Required columns: SKU, Lokasi, Tersedia (${stockImportLocationsLabel()} only).`,
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await importStock(supabase, rows, file.name);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Stock upload failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
