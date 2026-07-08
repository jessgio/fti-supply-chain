import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createProductionReport,
  listProductionReportsByPo,
  suggestProductionTransactions,
} from "@/lib/db/manufacturer-production-reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id: poId } = await context.params;
    const { searchParams } = new URL(request.url);

    if (searchParams.get("suggestions") === "1") {
      const { data: po, error: poError } = await createAdminClient()
        .from("purchase_orders")
        .select("po_number")
        .eq("id", poId)
        .maybeSingle();
      if (poError) throw poError;
      if (!po) {
        return NextResponse.json({ error: "PO not found." }, { status: 404 });
      }

      const exclude = searchParams.get("exclude") ?? undefined;
      const suggestions = await suggestProductionTransactions(
        createAdminClient(),
        po.po_number,
        exclude,
      );
      return NextResponse.json({ suggestions });
    }

    const supabase = createAdminClient();
    const reports = await listProductionReportsByPo(supabase, poId);
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id: poId } = await context.params;
    const body = await request.json();

    const supabase = createAdminClient();
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select("id, po_number")
      .eq("id", poId)
      .maybeSingle();
    if (poError) throw poError;
    if (!po) {
      return NextResponse.json({ error: "PO not found." }, { status: 404 });
    }

    if (!body?.report_date || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json(
        { error: "Report date and at least one line are required." },
        { status: 400 },
      );
    }

    const report = await createProductionReport(supabase, {
      po_id: po.id,
      po_number: po.po_number,
      manufacturer: body.manufacturer,
      invoice_number: body.invoice_number,
      report_date: body.report_date,
      notes: body.notes,
      lines: body.lines.map(
        (line: {
          po_line_id?: string | null;
          sku_id: string;
          qty_produced: number;
          uom?: string;
        }) => ({
          po_line_id: line.po_line_id ?? null,
          sku_id: line.sku_id,
          qty_produced: Number(line.qty_produced),
          uom: line.uom,
        }),
      ),
    });

    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
