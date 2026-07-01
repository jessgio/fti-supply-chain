import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoStatus } from "@/types/database";
import {
  derivePoDisplayStatus,
  derivePoStatus,
  PO_ACTIVE_SHIPMENT_STATUSES,
  type PoLifecycleInput,
} from "@/lib/procurement/po-lifecycle-rules";

export { PO_ACTIVE_SHIPMENT_STATUSES };

export async function syncPoStatusesAfterShipmentChange(
  supabase: SupabaseClient,
  poIds: string[],
): Promise<void> {
  for (const poId of poIds) {
    await recalculatePoStatus(supabase, poId);
  }
}

export async function poHasOpenShipments(
  supabase: SupabaseClient,
  poId: string,
): Promise<boolean> {
  const { data: shipments, error } = await supabase
    .from("shipment_purchase_orders")
    .select("shipments(status)")
    .eq("po_id", poId);
  if (error) throw error;

  return (shipments ?? []).some((link) => {
    const raw = link.shipments as
      | { status: string }
      | { status: string }[]
      | null;
    const s = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    if (!s) return false;
    return s.status !== "closed";
  });
}

async function loadPoLifecycleInput(
  supabase: SupabaseClient,
  poId: string,
): Promise<PoLifecycleInput | null> {
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select(
      `
      id,
      status,
      order_date,
      expected_date,
      created_at,
      down_payment_pct,
      discount_amount,
      tax_pct,
      pph_pct,
      other_charges,
      currency,
      purchase_order_lines (
        qty_ordered,
        qty_received,
        unit_cost,
        is_closed
      ),
      po_payments (
        payment_date,
        purpose,
        amount,
        currency
      ),
      shipment_purchase_orders (
        shipments (
          status,
          estimated_departure_date,
          expected_delivery_date
        )
      )
    `,
    )
    .eq("id", poId)
    .maybeSingle();
  if (poError) throw poError;
  if (!po) return null;

  const lines = (po.purchase_order_lines ?? []) as Array<{
    qty_ordered: number;
    qty_received: number;
    unit_cost: number | null;
    is_closed: boolean;
  }>;

  const payments = (po.po_payments ?? []) as Array<{
    payment_date: string;
    purpose: string;
    amount: number;
    currency: string;
  }>;

  const shipmentLinks = (po.shipment_purchase_orders ?? []) as Array<{
    shipments:
      | {
          status: string;
          estimated_departure_date: string;
          expected_delivery_date: string;
        }
      | {
          status: string;
          estimated_departure_date: string;
          expected_delivery_date: string;
        }[]
      | null;
  }>;

  const shipments = shipmentLinks.flatMap((link) => {
    const raw = link.shipments;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  });

  return {
    status: po.status as PoStatus,
    order_date: po.order_date as string | null,
    expected_date: po.expected_date as string | null,
    created_at: po.created_at as string,
    down_payment_pct: Number(po.down_payment_pct ?? 30),
    discount_amount: Number(po.discount_amount ?? 0),
    tax_pct: Number(po.tax_pct ?? 11),
    pph_pct: Number(po.pph_pct ?? 0),
    other_charges: Number(po.other_charges ?? 0),
    currency: (po.currency as string) ?? "IDR",
    lines: lines.map((line) => ({
      qty_ordered: Number(line.qty_ordered),
      qty_received: Number(line.qty_received),
      unit_cost: line.unit_cost == null ? null : Number(line.unit_cost),
      is_closed: Boolean(line.is_closed),
    })),
    payments: payments.map((payment) => ({
      payment_date: payment.payment_date,
      purpose: payment.purpose,
      amount: Number(payment.amount),
      currency: payment.currency,
    })),
    shipments,
  };
}

export async function recalculatePoStatus(
  supabase: SupabaseClient,
  poId: string,
): Promise<void> {
  const input = await loadPoLifecycleInput(supabase, poId);
  if (!input) return;
  if (input.status === "cancelled" || input.status === "planned") return;

  const newStatus = derivePoStatus(input);
  if (input.status !== newStatus) {
    await supabase
      .from("purchase_orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", poId);
  }
}

export function computePoDisplayStatus(
  input: PoLifecycleInput,
): string {
  return derivePoDisplayStatus(input);
}

export function isTimelineActiveShipmentStatus(status: string): boolean {
  return PO_ACTIVE_SHIPMENT_STATUSES.has(status);
}
