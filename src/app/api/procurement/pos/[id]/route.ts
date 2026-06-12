import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deletePurchaseOrder,
  getPurchaseOrder,
  updatePurchaseOrder,
  type UpdatePoLineInput,
} from "@/lib/db/procurement";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { isValidPoCurrency } from "@/lib/procurement/currencies";
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

    if (body?.currency !== undefined && !isValidPoCurrency(String(body.currency))) {
      return NextResponse.json(
        { error: "A valid currency code is required." },
        { status: 400 },
      );
    }

    const input: {
      po_number?: string;
      supplier_id?: string | null;
      status?: PoStatus;
      order_date?: string | null;
      expected_date?: string | null;
      down_payment_pct?: number;
      discount_amount?: number;
      tax_pct?: number;
      other_charges?: number;
      currency?: string;
      notes?: string | null;
      lines?: UpdatePoLineInput[];
    } = {};

    if (body?.po_number !== undefined) {
      const trimmed = String(body.po_number).trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "PO number cannot be empty." },
          { status: 400 },
        );
      }
      input.po_number = trimmed;
    }
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
    if (body?.down_payment_pct !== undefined) {
      input.down_payment_pct = Number(body.down_payment_pct);
    }
    if (body?.discount_amount !== undefined) {
      input.discount_amount = Number(body.discount_amount);
    }
    if (body?.tax_pct !== undefined) {
      input.tax_pct = Number(body.tax_pct);
    }
    if (body?.other_charges !== undefined) {
      input.other_charges = Number(body.other_charges);
    }
    if (body?.currency !== undefined) {
      input.currency = String(body.currency);
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
    invalidateForecastCache();
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
    invalidateForecastCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
