import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPurchaseOrder,
  listPurchaseOrders,
  type NewPoLineInput,
} from "@/lib/db/procurement";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";
import type { PoStatus } from "@/types/database";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as PoStatus | null;
    const supabase = createAdminClient();
    const purchaseOrders = await listPurchaseOrders(
      supabase,
      status ?? undefined,
    );
    return NextResponse.json({ purchaseOrders });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const rawLines = Array.isArray(body?.lines) ? body.lines : [];
    const lines: NewPoLineInput[] = rawLines
      .filter((l: { sku_id?: string }) => l?.sku_id)
      .map((l: { sku_id: string; qty_ordered: number; unit_cost?: number }) => ({
        sku_id: l.sku_id,
        qty_ordered: Number(l.qty_ordered),
        unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
      }))
      .filter((l: NewPoLineInput) => l.qty_ordered > 0);

    if (lines.length === 0) {
      return NextResponse.json(
        { error: "Add at least one line with a SKU and quantity." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const purchaseOrder = await createPurchaseOrder(supabase, {
      po_number: body.po_number,
      supplier_id: body.supplier_id ?? null,
      status: (body.status as PoStatus) ?? "planned",
      order_date: body.order_date ?? null,
      expected_date: body.expected_date ?? null,
      notes: body.notes ?? null,
      lines,
    });
    invalidateForecastCache();
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
