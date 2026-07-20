import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InboundReceive,
  InboundReceiveStatus,
  PoTimelineEntry,
} from "@/types/database";
import { receivePoLine } from "@/lib/db/procurement";
import {
  computePoDisplayStatus,
  isTimelineActiveShipmentStatus,
  recalculatePoStatus,
} from "@/lib/db/po-lifecycle";
import type { PoLifecycleInput } from "@/lib/procurement/po-lifecycle-rules";
import { TIMELINE_PO_STATUSES } from "@/lib/shipments/constants";
import type { PoStatus } from "@/types/database";

function buildTimelineLifecycleInput(
  po: Record<string, unknown>,
  lines: Array<{
    qty_ordered: number;
    qty_received: number;
    is_closed: boolean;
    unit_cost?: number | null;
  }>,
  payments: Array<{
    payment_date: string;
    purpose: string;
    amount: number;
    currency?: string;
  }>,
  shipments: Array<{
    estimated_departure_date: string;
    expected_delivery_date: string;
    status?: string;
  }>,
): PoLifecycleInput {
  return {
    status: po.status as PoStatus,
    order_date: (po.order_date as string | null) ?? null,
    expected_date: (po.expected_date as string | null) ?? null,
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
    payments,
    shipments: shipments.map((shipment) => ({
      status: shipment.status ?? "planned",
      estimated_departure_date: shipment.estimated_departure_date,
      expected_delivery_date: shipment.expected_delivery_date,
    })),
  };
}

export interface InboundReceiveBatchInput {
  batch_code?: string | null;
  expiry_date?: string | null;
  qty: number;
}

export interface CreateInboundReceiveInput {
  shipment_id: string;
  receive_date?: string;
  received_by?: string | null;
  notes?: string | null;
  location?: string;
  /** @deprecated Use batches on each item instead */
  batch_code?: string | null;
  /** @deprecated Use batches on each item instead */
  expiry_date?: string | null;
  items: Array<{
    po_line_id: string;
    sku_id: string;
    ordered_qty: number;
    received_qty: number;
    batches?: InboundReceiveBatchInput[];
  }>;
}

export interface InboundListParams {
  search?: string;
}

const INBOUND_SELECT = `
  id,
  receive_number,
  po_id,
  shipment_id,
  receive_date,
  status,
  received_by,
  notes,
  created_at,
  purchase_orders ( po_number, suppliers ( name ) ),
  shipments ( shipment_number ),
  inbound_receive_items (
    id,
    po_line_id,
    sku_id,
    ordered_qty,
    received_qty,
    discrepancy,
    skus ( sku_code, name )
  )
`;

type InboundRow = {
  id: string;
  receive_number: string | null;
  po_id: string | null;
  shipment_id: string | null;
  receive_date: string;
  status: InboundReceiveStatus;
  received_by: string | null;
  notes: string | null;
  created_at?: string;
  purchase_orders: {
    po_number: string;
    suppliers: { name: string } | null;
  } | null;
  shipments: { shipment_number: string } | null;
  inbound_receive_items?: Array<{
    id: string;
    po_line_id: string | null;
    sku_id: string | null;
    ordered_qty: number;
    received_qty: number;
    discrepancy: number;
    skus: { sku_code: string; name: string | null } | null;
  }>;
};

function mapInboundRow(row: InboundRow): InboundReceive {
  return {
    id: row.id,
    receive_number: row.receive_number,
    po_id: row.po_id,
    po_number: row.purchase_orders?.po_number ?? null,
    supplier_name: row.purchase_orders?.suppliers?.name ?? null,
    shipment_id: row.shipment_id,
    shipment_number: row.shipments?.shipment_number ?? null,
    receive_date: row.receive_date,
    status: row.status,
    received_by: row.received_by,
    notes: row.notes,
    created_at: row.created_at,
    items: (row.inbound_receive_items ?? []).map((item) => ({
      id: item.id,
      po_line_id: item.po_line_id,
      sku_id: item.sku_id,
      sku_code: item.skus?.sku_code,
      sku_name: item.skus?.name ?? null,
      ordered_qty: Number(item.ordered_qty),
      received_qty: Number(item.received_qty),
      discrepancy: Number(item.discrepancy),
    })),
  };
}

function deriveReceiveStatus(
  items: Array<{ ordered_qty: number; received_qty: number }>,
): InboundReceiveStatus {
  const totalOrdered = items.reduce((s, i) => s + i.ordered_qty, 0);
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0);
  if (totalReceived <= 0) return "pending";
  if (totalReceived >= totalOrdered) return "complete";
  return "partial";
}

async function getPriorReceivedByLine(
  supabase: SupabaseClient,
  shipmentId: string,
): Promise<Map<string, number>> {
  const { data: priorReceives, error } = await supabase
    .from("inbound_receives")
    .select("inbound_receive_items ( po_line_id, received_qty )")
    .eq("shipment_id", shipmentId);
  if (error) throw error;

  const totals = new Map<string, number>();
  for (const receive of priorReceives ?? []) {
    const items = receive.inbound_receive_items as Array<{
      po_line_id: string;
      received_qty: number;
    }> | null;
    for (const item of items ?? []) {
      totals.set(
        item.po_line_id,
        (totals.get(item.po_line_id) ?? 0) + Number(item.received_qty),
      );
    }
  }
  return totals;
}

function generateReceiveNumber(): string {
  const date = new Date();
  const stamp =
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RCV-${stamp}-${rand}`;
}

export async function listInboundReceives(
  supabase: SupabaseClient,
  params: InboundListParams = {},
): Promise<InboundReceive[]> {
  const { data, error } = await supabase
    .from("inbound_receives")
    .select(INBOUND_SELECT)
    .order("receive_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  let rows = ((data ?? []) as unknown as InboundRow[]).map(mapInboundRow);

  if (params.search?.trim()) {
    const q = params.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.receive_number ?? "").toLowerCase().includes(q) ||
        (r.po_number ?? "").toLowerCase().includes(q) ||
        (r.shipment_number ?? "").toLowerCase().includes(q) ||
        (r.supplier_name ?? "").toLowerCase().includes(q),
    );
  }

  return rows;
}

export async function getInboundReceive(
  supabase: SupabaseClient,
  id: string,
): Promise<InboundReceive | null> {
  const { data, error } = await supabase
    .from("inbound_receives")
    .select(INBOUND_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapInboundRow(data as unknown as InboundRow);
}

export async function createInboundReceive(
  supabase: SupabaseClient,
  input: CreateInboundReceiveInput,
): Promise<InboundReceive> {
  const { data: shipment, error: shipError } = await supabase
    .from("shipments")
    .select(
      `
      id,
      status,
      shipment_purchase_orders ( po_id ),
      shipment_items ( po_line_id, quantity, purchase_order_lines ( sku_id ) )
    `,
    )
    .eq("id", input.shipment_id)
    .maybeSingle();
  if (shipError) throw shipError;
  if (!shipment) throw new Error("Shipment not found.");
  if (shipment.status === "closed") {
    throw new Error("Cannot receive against a closed shipment.");
  }

  const priorReceivedByLine = await getPriorReceivedByLine(
    supabase,
    input.shipment_id,
  );

  if (!input.items.length) {
    throw new Error("Add at least one received line item.");
  }

  const shipmentItems = (shipment.shipment_items ?? []) as Array<{
    po_line_id: string;
    quantity: number;
  }>;
  const shippedByLine = new Map(
    shipmentItems.map((i) => [i.po_line_id, Number(i.quantity)]),
  );

  for (const item of input.items) {
    if (item.received_qty < 0) {
      throw new Error("Received quantity cannot be negative.");
    }
    if (!shippedByLine.has(item.po_line_id)) {
      throw new Error(
        `Line ${item.po_line_id} is not on this shipment.`,
      );
    }
  }

  const poIds = (
    (shipment.shipment_purchase_orders ?? []) as Array<{ po_id: string }>
  ).map((l) => l.po_id);
  const primaryPoId = poIds[0] ?? null;

  const status = deriveReceiveStatus(input.items);

  const cumulativeItems = shipmentItems.map((item) => {
    const prior = priorReceivedByLine.get(item.po_line_id) ?? 0;
    const increment =
      input.items.find((i) => i.po_line_id === item.po_line_id)?.received_qty ??
      0;
    return {
      ordered_qty: Number(item.quantity),
      received_qty: prior + increment,
    };
  });
  const shipmentComplete =
    deriveReceiveStatus(cumulativeItems) === "complete";

  const receiveDate = input.receive_date ?? new Date().toISOString().slice(0, 10);

  const { data: receive, error: recvError } = await supabase
    .from("inbound_receives")
    .insert({
      receive_number: generateReceiveNumber(),
      po_id: primaryPoId,
      shipment_id: input.shipment_id,
      receive_date: receiveDate,
      status,
      received_by: input.received_by ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (recvError) throw recvError;

  const itemRows = input.items.map((item) => ({
    inbound_receive_id: receive.id,
    po_line_id: item.po_line_id,
    sku_id: item.sku_id,
    ordered_qty: item.ordered_qty,
    received_qty: item.received_qty,
    discrepancy: item.received_qty - item.ordered_qty,
  }));
  const { error: itemsError } = await supabase
    .from("inbound_receive_items")
    .insert(itemRows);
  if (itemsError) throw itemsError;

  for (const item of input.items) {
    if (item.received_qty <= 0) continue;

    const batches = (item.batches ?? []).filter((b) => b.qty > 0);
    if (batches.length > 0) {
      const batchTotal = batches.reduce((sum, b) => sum + b.qty, 0);
      if (batchTotal !== item.received_qty) {
        throw new Error(
          `Batch quantities must equal received quantity for line ${item.po_line_id}.`,
        );
      }
      for (const batch of batches) {
        await receivePoLine(
          supabase,
          item.po_line_id,
          batch.qty,
          receiveDate,
          input.location ?? "Gudang Finished Goods",
          batch.batch_code ?? null,
          batch.expiry_date ?? null,
        );
      }
    } else {
      await receivePoLine(
        supabase,
        item.po_line_id,
        item.received_qty,
        receiveDate,
        input.location ?? "Gudang Finished Goods",
        input.batch_code ?? null,
        input.expiry_date ?? null,
      );
    }
  }

  const newShipmentStatus = shipmentComplete ? "closed" : "delivered";
  await supabase
    .from("shipments")
    .update({
      status: newShipmentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.shipment_id);

  for (const poId of poIds) {
    await recalculatePoStatus(supabase, poId);
  }

  const created = await getInboundReceive(supabase, receive.id);
  if (!created) throw new Error("Failed to load created inbound receive.");
  return created;
}

export async function deleteInboundReceive(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  throw new Error(
    "Deleting inbound receives is not supported because stock has already been updated. Adjust via procurement receipts instead.",
  );
}

export async function listOngoingPosForTimeline(
  supabase: SupabaseClient,
): Promise<PoTimelineEntry[]> {
  const { data: pos, error: poError } = await supabase
    .from("purchase_orders")
    .select(
      `
      id,
      po_number,
      status,
      expected_date,
      order_date,
      created_at,
      down_payment_pct,
      discount_amount,
      tax_pct,
      pph_pct,
      other_charges,
      currency,
      suppliers ( name ),
      purchase_order_lines (
        qty_ordered,
        qty_received,
        is_closed,
        unit_cost,
        skus ( sku_code, name )
      ),
      po_payments ( payment_date, purpose, amount, currency ),
      shipment_purchase_orders (
        shipments (
          id,
          shipment_number,
          estimated_departure_date,
          expected_delivery_date,
          delay_days,
          status,
          shipment_items (
            quantity,
            purchase_order_lines (
              skus ( sku_code, name )
            )
          )
        )
      )
    `,
    )
    .in("status", [...TIMELINE_PO_STATUSES])
    .order("expected_date", { ascending: true, nullsFirst: false });
  if (poError) throw poError;

  return (pos ?? []).map((po) => {
    const lines = (po.purchase_order_lines ?? []) as unknown as Array<{
      qty_ordered: number;
      qty_received: number;
      is_closed: boolean;
      unit_cost: number | null;
      skus: { sku_code: string; name: string | null } | null;
    }>;

    const rawPayments = (po.po_payments ?? []) as Array<{
      payment_date: string;
      purpose: string;
      amount: number;
      currency: string;
    }>;
    const payments = rawPayments.map((p) => ({
      payment_date: p.payment_date,
      purpose: p.purpose,
      amount: Number(p.amount),
      currency: p.currency,
    }));

    const shipmentLinks = (po.shipment_purchase_orders ?? []) as unknown as Array<{
      shipments: {
        id: string;
        shipment_number: string;
        estimated_departure_date: string;
        expected_delivery_date: string;
        delay_days: number;
        status: string;
        shipment_items: Array<{
          quantity: number;
          purchase_order_lines: {
            skus: { sku_code: string; name: string | null } | null;
          } | null;
        }>;
      } | null;
    }>;

    const shipments = shipmentLinks
      .map((l) => l.shipments)
      .filter(
        (s): s is NonNullable<typeof s> =>
          s != null && isTimelineActiveShipmentStatus(s.status),
      )
      .map((s) => ({
        id: s.id,
        shipment_number: s.shipment_number,
        estimated_departure_date: s.estimated_departure_date,
        expected_delivery_date: s.expected_delivery_date,
        delay_days: s.delay_days,
        line_items: (s.shipment_items ?? []).map((item) => ({
          sku_code: item.purchase_order_lines?.skus?.sku_code ?? "",
          sku_name: item.purchase_order_lines?.skus?.name ?? null,
          quantity: Number(item.quantity),
        })),
      }));

    const supplierRaw = po.suppliers as
      | { name: string }
      | { name: string }[]
      | null;
    const supplier = Array.isArray(supplierRaw)
      ? (supplierRaw[0] ?? null)
      : supplierRaw;
    const displayStatus = computePoDisplayStatus(
      buildTimelineLifecycleInput(
        po as Record<string, unknown>,
        lines,
        payments,
        shipments,
      ),
    );

    return {
      id: po.id as string,
      po_number: po.po_number as string,
      supplier_name: supplier?.name ?? null,
      status: po.status as PoTimelineEntry["status"],
      display_status: displayStatus,
      created_at: po.created_at as string,
      order_date: (po.order_date as string | null) ?? null,
      expected_date: po.expected_date as string | null,
      payments: payments.map((p) => ({
        payment_date: p.payment_date,
        purpose: p.purpose,
      })),
      shipments,
      line_items: lines.map((l) => ({
        sku_code: l.skus?.sku_code ?? "",
        sku_name: l.skus?.name ?? null,
        qty_ordered: Number(l.qty_ordered),
        qty_received: Number(l.qty_received),
      })),
    };
  });
}

const PO_TIMELINE_SELECT = `
  id,
  po_number,
  status,
  expected_date,
  order_date,
  created_at,
  down_payment_pct,
  discount_amount,
  tax_pct,
  pph_pct,
  other_charges,
  currency,
  suppliers ( name ),
  purchase_order_lines (
    qty_ordered,
    qty_received,
    is_closed,
    unit_cost,
    skus ( sku_code, name )
  ),
  po_payments ( payment_date, purpose, amount, currency ),
  shipment_purchase_orders (
    shipments (
      id,
      shipment_number,
      estimated_departure_date,
      expected_delivery_date,
      delay_days,
      status,
      shipment_items (
        quantity,
        purchase_order_lines (
          skus ( sku_code, name )
        )
      )
    )
  )
`;

function mapPoTimelineRow(po: Record<string, unknown>): PoTimelineEntry {
  const lines = (po.purchase_order_lines ?? []) as unknown as Array<{
    qty_ordered: number;
    qty_received: number;
    is_closed: boolean;
    unit_cost: number | null;
    skus: { sku_code: string; name: string | null } | null;
  }>;

  const rawPayments = (po.po_payments ?? []) as Array<{
    payment_date: string;
    purpose: string;
    amount: number;
    currency: string;
  }>;
  const payments = rawPayments.map((p) => ({
    payment_date: p.payment_date,
    purpose: p.purpose,
    amount: Number(p.amount),
    currency: p.currency,
  }));

  const shipmentLinks = (po.shipment_purchase_orders ?? []) as unknown as Array<{
    shipments: {
      id: string;
      shipment_number: string;
      estimated_departure_date: string;
      expected_delivery_date: string;
      delay_days: number;
      status: string;
      shipment_items: Array<{
        quantity: number;
        purchase_order_lines: {
          skus: { sku_code: string; name: string | null } | null;
        } | null;
      }>;
    } | null;
  }>;

  const shipments = shipmentLinks
    .map((l) => l.shipments)
    .filter(
      (s): s is NonNullable<typeof s> =>
        s != null && isTimelineActiveShipmentStatus(s.status),
    )
    .map((s) => ({
      id: s.id,
      shipment_number: s.shipment_number,
      estimated_departure_date: s.estimated_departure_date,
      expected_delivery_date: s.expected_delivery_date,
      delay_days: s.delay_days,
      line_items: (s.shipment_items ?? []).map((item) => ({
        sku_code: item.purchase_order_lines?.skus?.sku_code ?? "",
        sku_name: item.purchase_order_lines?.skus?.name ?? null,
        quantity: Number(item.quantity),
      })),
    }));

  const supplierRaw = po.suppliers as
    | { name: string }
    | { name: string }[]
    | null;
  const supplier = Array.isArray(supplierRaw)
    ? (supplierRaw[0] ?? null)
    : supplierRaw;
  const displayStatus = computePoDisplayStatus(
    buildTimelineLifecycleInput(po, lines, payments, shipments),
  );

  return {
    id: po.id as string,
    po_number: po.po_number as string,
    supplier_name: supplier?.name ?? null,
    status: po.status as PoTimelineEntry["status"],
    display_status: displayStatus,
    created_at: po.created_at as string,
    order_date: (po.order_date as string | null) ?? null,
    expected_date: po.expected_date as string | null,
    payments: payments.map((p) => ({
      payment_date: p.payment_date,
      purpose: p.purpose,
    })),
    shipments,
    line_items: lines.map((l) => ({
      sku_code: l.skus?.sku_code ?? "",
      sku_name: l.skus?.name ?? null,
      qty_ordered: Number(l.qty_ordered),
      qty_received: Number(l.qty_received),
    })),
  };
}

export async function getPoTimelineEntry(
  supabase: SupabaseClient,
  poId: string,
): Promise<PoTimelineEntry | null> {
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select(PO_TIMELINE_SELECT)
    .eq("id", poId)
    .maybeSingle();
  if (error) throw error;
  if (!po) return null;
  return mapPoTimelineRow(po as Record<string, unknown>);
}
