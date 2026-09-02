import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendSalesImportRows,
  beginSalesImport,
  finalizeSalesImport,
  importSales,
  importSalesFromBufferStreaming,
} from "@/lib/db/uploads";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export const maxDuration = 600;

const UPLOAD_BUCKET = "data-uploads";

const salesRowSchema = z.object({
  sale_date: z.string().min(1),
  channel: z.string().min(1),
  sku_code: z.string().min(1),
  qty_sold: z.number(),
  net_sales: z.number(),
  retail_price: z.number().optional(),
});

const uploadUrlSchema = z.object({
  phase: z.literal("upload-url"),
  filename: z.string().min(1),
});

const processFileSchema = z.object({
  phase: z.literal("process"),
  storagePath: z.string().min(1),
  filename: z.string().min(1),
  /** Replace every sale_date in the file (signed qty / returns). Default: last 3 months only. */
  fullReprocess: z.boolean().optional(),
});

const initSchema = z.object({
  phase: z.literal("init"),
  filename: z.string().min(1),
  rowCount: z.number().int().positive(),
  rangeStart: z.string().min(1),
  rangeEnd: z.string().min(1),
  skippedOlder: z.number().int().nonnegative(),
  cutoff: z.string().min(1),
});

const chunkSchema = z.object({
  phase: z.literal("chunk"),
  batchId: z.string().uuid(),
  rows: z.array(salesRowSchema).min(1).max(2500),
});

const finalizeSchema = z.object({
  phase: z.literal("finalize"),
  batchId: z.string().uuid(),
  /** Ignored. WMS Harga is not official RSP. Kept so older clients still parse. */
  retailBySku: z.record(z.string(), z.number()).optional(),
});

const bodySchema = z.discriminatedUnion("phase", [
  uploadUrlSchema,
  processFileSchema,
  initSchema,
  chunkSchema,
  finalizeSchema,
]);

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = bodySchema.parse(await request.json());
    const supabase = createAdminClient();

    if (body.phase === "upload-url") {
      const storagePath = `sales/${Date.now()}-${sanitizeFilename(body.filename)}`;
      const { data, error } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .createSignedUploadUrl(storagePath);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        path: data.path,
        token: data.token,
      });
    }

    if (body.phase === "process") {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .download(body.storagePath);

      if (downloadError) throw downloadError;
      if (!fileData) {
        throw new Error("Uploaded file not found in storage.");
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const mode = body.fullReprocess ? "full" : "incremental";
      const result = await importSalesFromBufferStreaming(
        supabase,
        buffer,
        body.filename,
        mode,
      );

      await supabase.storage.from(UPLOAD_BUCKET).remove([body.storagePath]);
      invalidateForecastCache();

      return NextResponse.json({ ok: true, ...result });
    }

    if (body.phase === "init") {
      const { batchId, replacedCount } = await beginSalesImport(supabase, {
        filename: body.filename,
        rangeStart: body.rangeStart,
        rangeEnd: body.rangeEnd,
        rowCount: body.rowCount,
      });

      return NextResponse.json({
        ok: true,
        batchId,
        replacedCount,
        skippedOlder: body.skippedOlder,
        cutoff: body.cutoff,
        rangeStart: body.rangeStart,
        rangeEnd: body.rangeEnd,
      });
    }

    if (body.phase === "chunk") {
      const inserted = await appendSalesImportRows(
        supabase,
        body.batchId,
        body.rows,
      );
      return NextResponse.json({ ok: true, inserted });
    }

    await finalizeSalesImport(supabase);
    invalidateForecastCache();
    return NextResponse.json({ ok: true, batchId: body.batchId });
  } catch (error) {
    console.error("Sales import failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
