import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPurchaseOrder } from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: payment, error } = await supabase
      .from("po_payments")
      .select(
        "id, payment_date, purpose, amount, currency, po_id, purchase_orders ( po_number, suppliers ( name ) )",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const poRaw = payment.purchase_orders as unknown as
      | { po_number: string; suppliers: { name: string } | null }
      | { po_number: string; suppliers: { name: string } | null }[]
      | null;
    const poHeader = Array.isArray(poRaw) ? (poRaw[0] ?? null) : poRaw;
    const purchaseOrder = await getPurchaseOrder(supabase, payment.po_id);

    return NextResponse.json({
      title: `${payment.purpose} · ${Number(payment.amount).toLocaleString()} ${payment.currency}`,
      subtitle: poHeader
        ? `${poHeader.po_number}${poHeader.suppliers?.name ? ` · ${poHeader.suppliers.name}` : ""}`
        : undefined,
      lines: (purchaseOrder?.lines ?? []).map((line) => ({
        sku_code: line.sku_code ?? "",
        sku_name: line.sku_name ?? null,
        quantity: line.qty_ordered,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
