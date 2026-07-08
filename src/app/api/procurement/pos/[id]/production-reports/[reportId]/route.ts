import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  deleteProductionReport,
  getProductionReportDetail,
  saveProductionAllocations,
  suggestProductionTransactions,
} from "@/lib/db/manufacturer-production-reports";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; reportId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { reportId } = await context.params;
    const supabase = createAdminClient();
    const report = await getProductionReportDetail(supabase, reportId);
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { reportId } = await context.params;
    const supabase = createAdminClient();
    await deleteProductionReport(supabase, reportId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id: poId, reportId } = await context.params;
    const body = await request.json();

    if (!Array.isArray(body.allocations)) {
      return NextResponse.json(
        { error: "Allocations array is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const report = await saveProductionAllocations(
      supabase,
      reportId,
      body.allocations.map(
        (a: { extract_transaction_id: string; allocated_kg: number }) => ({
          extract_transaction_id: a.extract_transaction_id,
          allocated_kg: Number(a.allocated_kg),
        }),
      ),
    );

    const { data: po } = await supabase
      .from("purchase_orders")
      .select("po_number")
      .eq("id", poId)
      .maybeSingle();

    const suggestions = po
      ? await suggestProductionTransactions(supabase, po.po_number, reportId)
      : [];

    return NextResponse.json({ report, suggestions });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
