import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PoStatus,
  PurchaseOrder,
  PurchaseOrderLine,
  Supplier,
} from "@/types/database";

export interface NewPoLineInput {
  sku_id: string;
  qty_ordered: number;
  unit_cost?: number | null;
}

export interface NewPoInput {
  po_number?: string;
  supplier_id?: string | null;
  status?: PoStatus;
  order_date?: string | null;
  expected_date?: string | null;
  notes?: string | null;
  lines: NewPoLineInput[];
}

export interface UpdatePoLineInput {
  id?: string;
  sku_id: string;
  qty_ordered: number;
  unit_cost?: number | null;
}

export interface UpdatePoInput {
  supplier_id?: string | null;
  status?: PoStatus;
  order_date?: string | null;
  expected_date?: string | null;
  notes?: string | null;
  lines?: UpdatePoLineInput[];
}

export interface NewSupplierInput {
  name: string;
  lead_time_days?: number;
  contact?: string | null;
  notes?: string | null;
}

function generatePoNumber(): string {
  const date = new Date();
  const stamp =
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${stamp}-${rand}`;
}

export async function listSuppliers(
  supabase: SupabaseClient,
): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, lead_time_days, contact, notes")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function createSupplier(
  supabase: SupabaseClient,
  input: NewSupplierInput,
): Promise<Supplier> {
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: input.name,
      lead_time_days: input.lead_time_days ?? 90,
      contact: input.contact ?? null,
      notes: input.notes ?? null,
    })
    .select("id, name, lead_time_days, contact, notes")
    .single();
  if (error) throw error;
  return data as Supplier;
}

type PoRow = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  suppliers: { name: string } | null;
  purchase_order_lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_received: number;
    unit_cost: number | null;
    skus: { sku_code: string; name: string | null } | null;
    po_receipts?: {
      id: string;
      qty_received: number;
      received_date: string;
      location: string;
    }[];
  }[];
};

function mapPoRow(row: PoRow): PurchaseOrder {
  const lines: PurchaseOrderLine[] = (row.purchase_order_lines ?? []).map(
    (l) => ({
      id: l.id,
      po_id: row.id,
      sku_id: l.sku_id,
      sku_code: l.skus?.sku_code,
      sku_name: l.skus?.name ?? null,
      qty_ordered: Number(l.qty_ordered),
      qty_received: Number(l.qty_received),
      unit_cost: l.unit_cost === null ? null : Number(l.unit_cost),
      receipts: (l.po_receipts ?? []).map((r) => ({
        id: r.id,
        po_line_id: l.id,
        qty_received: Number(r.qty_received),
        received_date: r.received_date,
        location: r.location,
      })),
    }),
  );
  return {
    id: row.id,
    po_number: row.po_number,
    supplier_id: row.supplier_id,
    supplier_name: row.suppliers?.name ?? null,
    status: row.status,
    order_date: row.order_date,
    expected_date: row.expected_date,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lines,
  };
}

const PO_SELECT =
  "id, po_number, supplier_id, status, order_date, expected_date, notes, created_at, updated_at, " +
  "suppliers(name), " +
  "purchase_order_lines(id, sku_id, qty_ordered, qty_received, unit_cost, skus(sku_code, name))";

const PO_DETAIL_SELECT =
  "id, po_number, supplier_id, status, order_date, expected_date, notes, created_at, updated_at, " +
  "suppliers(name), " +
  "purchase_order_lines(id, sku_id, qty_ordered, qty_received, unit_cost, skus(sku_code, name), " +
  "po_receipts(id, qty_received, received_date, location))";

export async function listPurchaseOrders(
  supabase: SupabaseClient,
  status?: PoStatus,
): Promise<PurchaseOrder[]> {
  let query = supabase
    .from("purchase_orders")
    .select(PO_SELECT)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as PoRow[]).map(mapPoRow);
}

export async function getPurchaseOrder(
  supabase: SupabaseClient,
  id: string,
): Promise<PurchaseOrder | null> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(PO_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapPoRow(data as unknown as PoRow);
}

export async function createPurchaseOrder(
  supabase: SupabaseClient,
  input: NewPoInput,
): Promise<PurchaseOrder> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error("A purchase order needs at least one line item.");
  }

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: input.po_number?.trim() || generatePoNumber(),
      supplier_id: input.supplier_id ?? null,
      status: input.status ?? "planned",
      order_date: input.order_date ?? null,
      expected_date: input.expected_date ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (poError) throw poError;

  const lineRows = input.lines.map((l) => ({
    po_id: po.id,
    sku_id: l.sku_id,
    qty_ordered: l.qty_ordered,
    unit_cost: l.unit_cost ?? null,
  }));

  const { error: linesError } = await supabase
    .from("purchase_order_lines")
    .insert(lineRows);
  if (linesError) throw linesError;

  const created = await getPurchaseOrder(supabase, po.id);
  if (!created) throw new Error("Failed to load created purchase order.");
  return created;
}

export async function updatePurchaseOrderStatus(
  supabase: SupabaseClient,
  id: string,
  status: PoStatus,
): Promise<PurchaseOrder> {
  return updatePurchaseOrder(supabase, id, { status });
}

export async function updatePurchaseOrder(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePoInput,
): Promise<PurchaseOrder> {
  const existing = await getPurchaseOrder(supabase, id);
  if (!existing) throw new Error("Purchase order not found.");

  const lockedStatus =
    existing.status === "received" || existing.status === "cancelled";
  if (lockedStatus) {
    const notesOnly =
      input.notes !== undefined &&
      input.supplier_id === undefined &&
      input.status === undefined &&
      input.order_date === undefined &&
      input.expected_date === undefined &&
      input.lines === undefined;
    if (!notesOnly) {
      throw new Error(
        `${existing.status === "received" ? "Received" : "Cancelled"} purchase orders can only have notes updated.`,
      );
    }
  }

  const headerPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.supplier_id !== undefined) headerPatch.supplier_id = input.supplier_id;
  if (input.status !== undefined) headerPatch.status = input.status;
  if (input.order_date !== undefined) headerPatch.order_date = input.order_date;
  if (input.expected_date !== undefined)
    headerPatch.expected_date = input.expected_date;
  if (input.notes !== undefined) headerPatch.notes = input.notes;

  if (Object.keys(headerPatch).length > 1) {
    const { error } = await supabase
      .from("purchase_orders")
      .update(headerPatch)
      .eq("id", id);
    if (error) throw error;
  }

  if (input.lines !== undefined) {
    if (input.lines.length === 0) {
      throw new Error("A purchase order needs at least one line item.");
    }

    const existingLines = existing.lines ?? [];
    const incomingIds = new Set(
      input.lines.filter((l) => l.id).map((l) => l.id!),
    );

    for (const line of existingLines) {
      if (line.qty_received > 0) {
        if (!incomingIds.has(line.id)) {
          throw new Error(
            `Cannot remove line ${line.sku_code ?? line.id} with received quantity.`,
          );
        }
        const incoming = input.lines.find((l) => l.id === line.id)!;
        if (incoming.sku_id !== line.sku_id) {
          throw new Error(
            `Cannot change SKU on line ${line.sku_code ?? line.id} with received quantity.`,
          );
        }
        if (incoming.qty_ordered < line.qty_received) {
          throw new Error(
            `Quantity ordered cannot be below received quantity for ${line.sku_code ?? line.id}.`,
          );
        }
      }
    }

    const toDelete = existingLines
      .filter((l) => l.qty_received === 0 && !incomingIds.has(l.id))
      .map((l) => l.id);
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("purchase_order_lines")
        .delete()
        .in("id", toDelete);
      if (error) throw error;
    }

    for (const line of input.lines) {
      if (line.id && existingLines.some((l) => l.id === line.id)) {
        const { error } = await supabase
          .from("purchase_order_lines")
          .update({
            sku_id: line.sku_id,
            qty_ordered: line.qty_ordered,
            unit_cost: line.unit_cost ?? null,
          })
          .eq("id", line.id);
        if (error) throw error;
      } else if (!line.id) {
        const { error } = await supabase.from("purchase_order_lines").insert({
          po_id: id,
          sku_id: line.sku_id,
          qty_ordered: line.qty_ordered,
          unit_cost: line.unit_cost ?? null,
        });
        if (error) throw error;
      }
    }
  }

  const updated = await getPurchaseOrder(supabase, id);
  if (!updated) throw new Error("Purchase order not found.");
  return updated;
}

export async function deletePurchaseOrder(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const existing = await getPurchaseOrder(supabase, id);
  if (!existing) throw new Error("Purchase order not found.");

  const hasReceipts = (existing.lines ?? []).some((l) => l.qty_received > 0);
  if (hasReceipts) {
    throw new Error(
      "Cannot delete a purchase order with received items. Cancel it instead.",
    );
  }

  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) throw error;
}

export interface OpenPoBatch {
  line_id: string;
  po_id: string;
  sku_id: string;
  sku_code: string;
  open_qty: number;
  expected_date: string | null;
}

export async function listOpenPoBatchesBySkus(
  supabase: SupabaseClient,
  skuIds: string[],
): Promise<OpenPoBatch[]> {
  if (skuIds.length === 0) return [];

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, expected_date, purchase_order_lines(id, sku_id, qty_ordered, qty_received, skus(sku_code))",
    )
    .in("status", ["planned", "ordered", "in_transit"]);
  if (error) throw error;

  const skuSet = new Set(skuIds);
  const batches: OpenPoBatch[] = [];

  for (const po of data ?? []) {
    const lines = (po.purchase_order_lines ?? []) as unknown as {
      id: string;
      sku_id: string;
      qty_ordered: number;
      qty_received: number;
      skus: { sku_code: string } | null;
    }[];
    for (const line of lines) {
      if (!skuSet.has(line.sku_id)) continue;
      const openQty = Number(line.qty_ordered) - Number(line.qty_received);
      if (openQty <= 0) continue;
      batches.push({
        line_id: line.id,
        po_id: po.id,
        sku_id: line.sku_id,
        sku_code: line.skus?.sku_code ?? "",
        open_qty: openQty,
        expected_date: po.expected_date,
      });
    }
  }

  return batches;
}

export async function receivePoLine(
  supabase: SupabaseClient,
  lineId: string,
  qty: number,
  receivedDate?: string,
  location?: string,
): Promise<void> {
  const { error } = await supabase.rpc("receive_po_line", {
    p_po_line_id: lineId,
    p_qty: qty,
    p_received_date: receivedDate ?? new Date().toISOString().slice(0, 10),
    p_location: location ?? "Gudang Finished Goods",
  });
  if (error) throw error;
}
