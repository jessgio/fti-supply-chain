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
  const { error } = await supabase
    .from("purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  const updated = await getPurchaseOrder(supabase, id);
  if (!updated) throw new Error("Purchase order not found.");
  return updated;
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
