import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendSalesImportRows,
  beginSalesImport,
  finalizeSalesImport,
} from "@/lib/db/uploads";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export const maxDuration = 600;

const salesRowSchema = z.object({
  sale_date: z.string().min(1),
  channel: z.string().min(1),
  sku_code: z.string().min(1),
  qty_sold: z.number(),
  net_sales: z.number(),
  retail_price: z.number().optional(),
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
  rows: z.array(salesRowSchema).min(1).max(3000),
});

const finalizeSchema = z.object({
  phase: z.literal("finalize"),
  batchId: z.string().uuid(),
  retailBySku: z.record(z.string(), z.number()).optional(),
});

const bodySchema = z.discriminatedUnion("phase", [
  initSchema,
  chunkSchema,
  finalizeSchema,
]);

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = bodySchema.parse(await request.json());
    const supabase = createAdminClient();

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

    await finalizeSalesImport(supabase, body.retailBySku ?? {});
    invalidateForecastCache();
    return NextResponse.json({ ok: true, batchId: body.batchId });
  } catch (error) {
    console.error("Sales import failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
