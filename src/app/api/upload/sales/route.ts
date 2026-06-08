import { NextResponse } from "next/server";
import { parseSalesExcel } from "@/lib/excel/parse";
import { importSales } from "@/lib/db/uploads";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const fullReprocess = request.headers.get("x-sales-full-reprocess") === "1";

    const buffer = await file.arrayBuffer();
    const rows = await parseSalesExcel(buffer);
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid sales rows found. For FTI Sales.xlsx, ensure Tanggal, Channel, SKU, QTY, Harga, and Nett Sales columns. FAKTUR rows are imported; CANCELED orders are excluded.",
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await importSales(supabase, rows, file.name, {
      mode: fullReprocess ? "full" : "incremental",
    });
    invalidateForecastCache();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Sales upload failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
