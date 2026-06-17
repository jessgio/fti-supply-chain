import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import {
  normalizeExtractDate,
  parseExtractScreenshot,
} from "@/lib/extracts/parse";
import { categorize } from "@/lib/extracts/categories";
import { loadCategoryRules } from "@/lib/db/extracts";
import type { ParsedExtract, ParsedExtractRow } from "@/types/database";

export const maxDuration = 120;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const EPSILON = 0.001;

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Upload a PNG, JPG, or WEBP screenshot." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/png";

    const supabase = createAdminClient();

    // Persist the original screenshot for traceability (best-effort).
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const sourcePath = `extracts/${Date.now()}-${safeName}`;
    let storedPath: string | null = null;
    const { error: uploadError } = await supabase.storage
      .from("data-uploads")
      .upload(sourcePath, buffer, { contentType: mimeType, upsert: false });
    if (!uploadError) storedPath = sourcePath;

    const raw = await parseExtractScreenshot({
      data: new Uint8Array(buffer),
      mimeType,
    });

    const rules = await loadCategoryRules(supabase);

    // Validate the running balance chain to flag likely OCR mis-reads.
    let prevBalance: number | null = null;
    const rows: ParsedExtractRow[] = raw.rows.map((row) => {
      const received = Number(row.received) || 0;
      const issued = Number(row.issued) || 0;
      const balance =
        row.balance === null || row.balance === undefined
          ? null
          : Number(row.balance);

      let checksumOk = true;
      if (prevBalance !== null && balance !== null) {
        checksumOk =
          Math.abs(prevBalance + received - issued - balance) < EPSILON;
      }
      if (balance !== null) prevBalance = balance;

      const normalizedDate = normalizeExtractDate(row.txn_date);

      return {
        txn_date: normalizedDate || row.txn_date,
        order_no: row.order_no,
        tran_code: row.tran_code,
        from_to: row.from_to,
        lot_no: row.lot_no,
        entered_qty:
          row.entered_qty === null || row.entered_qty === undefined
            ? null
            : Number(row.entered_qty),
        received,
        issued,
        balance,
        status: row.status,
        remark: row.remark,
        category: categorize(row.from_to, rules),
        checksum_ok: checksumOk && Boolean(normalizedDate),
      } satisfies ParsedExtractRow;
    });

    const parsed: ParsedExtract = {
      item_no: raw.item_no?.trim() ?? "",
      description: raw.description?.trim() || null,
      unit: raw.unit?.trim() || "kg",
      rows,
      source_path: storedPath,
      source_filename: file.name,
    };

    return NextResponse.json({ parsed });
  } catch (error) {
    console.error("Extract screenshot parse failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
