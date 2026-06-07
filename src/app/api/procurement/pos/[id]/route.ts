import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deletePurchaseOrder,
  getPurchaseOrder,
  updatePurchaseOrder,
  type UpdatePoLineInput,
} from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";
import type { PoStatus } from "@/types/database";

const VALID_STATUSES: PoStatus[] = [
  "planned",
  "ordered",
  "in_transit",
  "received",
  "cancelled",
];

function parseLines(raw: unknown): UpdatePoLineInput[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((l: { sku_id?: string }) => l?.sku_id)
    .map(
      (l: {
        id?: string;
        sku_id: string;
        qty_ordered: number;
        unit_cost?: number;
      }) => ({
        id: l.id,
        sku_id: l.sku_id,
        qty_ordered: Number(l.qty_ordered),
        unit_cost: l.unit_cost != null ? Number(l.unit_cost) : null,
      }),
    )
    .filter((l: UpdatePoLineInput) => l.qty_ordered > 0);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const purchaseOrder = await getPurchaseOrder(supabase, id);
    if (!purchaseOrder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();

    const input: {
      supplier_id?: string | null;
      status?: PoStatus;
      order_date?: string | null;
      expected_date?: string | null;
      notes?: string | null;
      lines?: UpdatePoLineInput[];
    } = {};

    if (body?.supplier_id !== undefined) {
      input.supplier_id = body.supplier_id ?? null;
    }
    if (body?.status !== undefined) {
      const status = body.status as PoStatus;
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: "A valid status is required." },
          { status: 400 },
        );
      }
      input.status = status;
    }
    if (body?.order_date !== undefined) {
      input.order_date = body.order_date ?? null;
    }
    if (body?.expected_date !== undefined) {
      input.expected_date = body.expected_date ?? null;
    }
    if (body?.notes !== undefined) {
      input.notes = body.notes ?? null;
    }

    const lines = parseLines(body?.lines);
    if (lines !== undefined) {
      if (lines.length === 0) {
        return NextResponse.json(
          { error: "Add at least one line with a SKU and quantity." },
          { status: 400 },
        );
      }
      input.lines = lines;
    }

    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const purchaseOrder = await updatePurchaseOrder(supabase, id, input);
    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();
    await deletePurchaseOrder(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
