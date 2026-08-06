import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PoStatus,
  PoPayment,
  PurchaseOrder,
  PurchaseOrderLine,
  Supplier,
} from "@/types/database";
import { recalculatePoStatus } from "@/lib/db/po-lifecycle";
import { deletePoDocuments } from "@/lib/db/po-documents";

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
  down_payment_pct?: number;
  discount_amount?: number;
  tax_pct?: number;
  pph_pct?: number;
  other_charges?: number;
  currency?: string;
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
  po_number?: string;
  supplier_id?: string | null;
  status?: PoStatus;
  order_date?: string | null;
  expected_date?: string | null;
  down_payment_pct?: number;
  discount_amount?: number;
  tax_pct?: number;
  pph_pct?: number;
  other_charges?: number;
  currency?: string;
  notes?: string | null;
  pd_project_id?: string | null;
  lines?: UpdatePoLineInput[];
}

export interface NewPoPaymentInput {
  payment_date?: string;
  amount: number;
  payment_request_number: string;
  currency?: string;
  exchange_rate?: number | null;
  purpose: string;
}

export interface UpdatePoPaymentInput {
  payment_date?: string;
  amount?: number;
  payment_request_number?: string;
  currency?: string;
  exchange_rate?: number | null;
  purpose?: string;
}

export interface NewSupplierInput {
  name: string;
  lead_time_days?: number;
  contact?: string | null;
  address?: string | null;
  pic_name?: string | null;
  pic_email?: string | null;
  pic_phone?: string | null;
  payment_terms?: string | null;
  lead_time_note?: string | null;
  delivery_time?: string | null;
  packaging_notes?: string | null;
  beneficiary_name?: string | null;
  beneficiary_account_number?: string | null;
  swift_code?: string | null;
  beneficiary_country?: string | null;
  beneficiary_address?: string | null;
  beneficiary_bank?: string | null;
  beneficiary_bank_address?: string | null;
  bank_code?: string | null;
  branch_code?: string | null;
  notes?: string | null;
}

export interface UpdateSupplierInput {
  name?: string;
  lead_time_days?: number;
  contact?: string | null;
  address?: string | null;
  pic_name?: string | null;
  pic_email?: string | null;
  pic_phone?: string | null;
  payment_terms?: string | null;
  lead_time_note?: string | null;
  delivery_time?: string | null;
  packaging_notes?: string | null;
  beneficiary_name?: string | null;
  beneficiary_account_number?: string | null;
  swift_code?: string | null;
  beneficiary_country?: string | null;
  beneficiary_address?: string | null;
  beneficiary_bank?: string | null;
  beneficiary_bank_address?: string | null;
  bank_code?: string | null;
  branch_code?: string | null;
  notes?: string | null;
}

const SUPPLIER_SELECT =
  "id, name, lead_time_days, contact, address, pic_name, pic_email, pic_phone, " +
  "payment_terms, lead_time_note, delivery_time, packaging_notes, " +
  "beneficiary_name, beneficiary_account_number, swift_code, beneficiary_country, " +
  "beneficiary_address, beneficiary_bank, beneficiary_bank_address, bank_code, branch_code, notes";

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
    .select(SUPPLIER_SELECT)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Supplier[];
}

export async function getSupplier(
  supabase: SupabaseClient,
  id: string,
): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from("suppliers")
    .select(SUPPLIER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Supplier) ?? null;
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
      address: input.address ?? null,
      pic_name: input.pic_name ?? null,
      pic_email: input.pic_email ?? null,
      pic_phone: input.pic_phone ?? null,
      payment_terms: input.payment_terms ?? null,
      lead_time_note: input.lead_time_note ?? null,
      delivery_time: input.delivery_time ?? null,
      packaging_notes: input.packaging_notes ?? null,
      beneficiary_name: input.beneficiary_name ?? null,
      beneficiary_account_number: input.beneficiary_account_number ?? null,
      swift_code: input.swift_code ?? null,
      beneficiary_country: input.beneficiary_country ?? null,
      beneficiary_address: input.beneficiary_address ?? null,
      beneficiary_bank: input.beneficiary_bank ?? null,
      beneficiary_bank_address: input.beneficiary_bank_address ?? null,
      bank_code: input.bank_code ?? null,
      branch_code: input.branch_code ?? null,
      notes: input.notes ?? null,
    })
    .select(SUPPLIER_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Supplier;
}

export async function updateSupplier(
  supabase: SupabaseClient,
  id: string,
  input: UpdateSupplierInput,
): Promise<Supplier> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.lead_time_days !== undefined)
    patch.lead_time_days = input.lead_time_days;
  if (input.contact !== undefined) patch.contact = input.contact;
  if (input.address !== undefined) patch.address = input.address;
  if (input.pic_name !== undefined) patch.pic_name = input.pic_name;
  if (input.pic_email !== undefined) patch.pic_email = input.pic_email;
  if (input.pic_phone !== undefined) patch.pic_phone = input.pic_phone;
  if (input.payment_terms !== undefined) patch.payment_terms = input.payment_terms;
  if (input.lead_time_note !== undefined) patch.lead_time_note = input.lead_time_note;
  if (input.delivery_time !== undefined) patch.delivery_time = input.delivery_time;
  if (input.packaging_notes !== undefined)
    patch.packaging_notes = input.packaging_notes;
  if (input.beneficiary_name !== undefined)
    patch.beneficiary_name = input.beneficiary_name;
  if (input.beneficiary_account_number !== undefined)
    patch.beneficiary_account_number = input.beneficiary_account_number;
  if (input.swift_code !== undefined) patch.swift_code = input.swift_code;
  if (input.beneficiary_country !== undefined)
    patch.beneficiary_country = input.beneficiary_country;
  if (input.beneficiary_address !== undefined)
    patch.beneficiary_address = input.beneficiary_address;
  if (input.beneficiary_bank !== undefined)
    patch.beneficiary_bank = input.beneficiary_bank;
  if (input.beneficiary_bank_address !== undefined)
    patch.beneficiary_bank_address = input.beneficiary_bank_address;
  if (input.bank_code !== undefined) patch.bank_code = input.bank_code;
  if (input.branch_code !== undefined) patch.branch_code = input.branch_code;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase
    .from("suppliers")
    .update(patch)
    .eq("id", id)
    .select(SUPPLIER_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Supplier;
}

type PoRow = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  pd_project_id: string | null;
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  down_payment_pct: number;
  discount_amount: number;
  tax_pct: number;
  pph_pct: number;
  other_charges: number;
  currency: string;
  notes: string | null;
  lark_instance_code?: string | null;
  lark_serial_number?: string | null;
  lark_submitted_at?: string | null;
  lark_expense_category?: string | null;
  lark_approval_status?: string | null;
  lark_status_synced_at?: string | null;
  created_at: string;
  updated_at: string;
  suppliers: { name: string } | null;
  pd_projects: { product_name: string | null; name: string } | { product_name: string | null; name: string }[] | null;
  purchase_order_lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_received: number;
    is_closed: boolean;
    unit_cost: number | null;
    skus: { sku_code: string; name: string | null; is_packaging: boolean } | null;
    po_receipts?: {
      id: string;
      qty_received: number;
      received_date: string;
      location: string;
      batch_code: string | null;
      expiry_date: string | null;
    }[];
  }[];
  po_payments?: {
    id: string;
    payment_date: string;
    amount: number;
    payment_request_number: string;
    currency: string;
    exchange_rate: number | null;
    purpose: string;
    created_at: string;
    updated_at: string;
  }[];
};

function mapPoPayment(row: NonNullable<PoRow["po_payments"]>[number]): PoPayment {
  return {
    id: row.id,
    po_id: "",
    payment_date: row.payment_date,
    amount: Number(row.amount),
    payment_request_number: row.payment_request_number,
    currency: row.currency ?? "IDR",
    exchange_rate:
      row.exchange_rate === null ? null : Number(row.exchange_rate),
    purpose: row.purpose,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

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
      is_closed: Boolean(l.is_closed),
      unit_cost: l.unit_cost === null ? null : Number(l.unit_cost),
      receipts: (l.po_receipts ?? []).map((r) => ({
        id: r.id,
        po_line_id: l.id,
        qty_received: Number(r.qty_received),
        received_date: r.received_date,
        location: r.location,
        batch_code: r.batch_code ?? null,
        expiry_date: r.expiry_date ?? null,
      })),
    }),
  );
  const payments = (row.po_payments ?? [])
    .map((p) => ({
      ...mapPoPayment(p),
      po_id: row.id,
    }))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  const pdProject = Array.isArray(row.pd_projects)
    ? (row.pd_projects[0] ?? null)
    : row.pd_projects;
  return {
    id: row.id,
    po_number: row.po_number,
    supplier_id: row.supplier_id,
    supplier_name: row.suppliers?.name ?? null,
    status: row.status,
    order_date: row.order_date,
    expected_date: row.expected_date,
    down_payment_pct: Number(row.down_payment_pct ?? 30),
    discount_amount: Number(row.discount_amount ?? 0),
    tax_pct: Number(row.tax_pct ?? 11),
    pph_pct: Number(row.pph_pct ?? 0),
    other_charges: Number(row.other_charges ?? 0),
    currency: row.currency ?? "IDR",
    notes: row.notes,
    pd_project_id: row.pd_project_id ?? null,
    pd_project_name: pdProject?.name ?? null,
    pd_project_product_name: pdProject?.product_name ?? null,
    lark_instance_code: row.lark_instance_code ?? null,
    lark_serial_number: row.lark_serial_number ?? null,
    lark_submitted_at: row.lark_submitted_at ?? null,
    lark_expense_category: row.lark_expense_category ?? null,
    lark_approval_status: (row.lark_approval_status as PurchaseOrder["lark_approval_status"]) ?? null,
    lark_status_synced_at: row.lark_status_synced_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lines,
    payments,
  };
}

const PO_LARK_COLS =
  "lark_instance_code, lark_serial_number, lark_submitted_at, lark_expense_category, lark_approval_status, lark_status_synced_at";

const PO_SELECT =
  "id, po_number, supplier_id, pd_project_id, status, order_date, expected_date, down_payment_pct, discount_amount, tax_pct, pph_pct, other_charges, currency, notes, " +
  PO_LARK_COLS +
  ", created_at, updated_at, " +
  "suppliers(name), pd_projects(product_name, name), " +
  "purchase_order_lines(id, sku_id, qty_ordered, qty_received, is_closed, unit_cost, skus(sku_code, name, is_packaging))";

const PO_DETAIL_SELECT =
  "id, po_number, supplier_id, pd_project_id, status, order_date, expected_date, down_payment_pct, discount_amount, tax_pct, pph_pct, other_charges, currency, notes, " +
  PO_LARK_COLS +
  ", created_at, updated_at, " +
  "suppliers(name), pd_projects(product_name, name), " +
  "purchase_order_lines(id, sku_id, qty_ordered, qty_received, is_closed, unit_cost, skus(sku_code, name, is_packaging), " +
  "po_receipts(id, qty_received, received_date, location, batch_code, expiry_date)), " +
  "po_payments(id, payment_date, amount, payment_request_number, currency, exchange_rate, purpose, created_at, updated_at)";

export async function listPurchaseOrders(
  supabase: SupabaseClient,
  status?: PoStatus,
): Promise<PurchaseOrder[]> {
  let query = supabase
    .from("purchase_orders")
    .select(PO_SELECT)
    .order("order_date", { ascending: false, nullsFirst: false })
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
      down_payment_pct: input.down_payment_pct ?? 30,
      discount_amount: input.discount_amount ?? 0,
      tax_pct: input.tax_pct ?? 11,
      pph_pct: input.pph_pct ?? 0,
      other_charges: input.other_charges ?? 0,
      currency: input.currency ?? "IDR",
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

  const manualStatus = input.status !== undefined;

  const lockedStatus = existing.status === "cancelled";
  if (lockedStatus) {
    const notesOnly =
      input.notes !== undefined &&
      input.po_number === undefined &&
      input.supplier_id === undefined &&
      input.status === undefined &&
      input.order_date === undefined &&
      input.expected_date === undefined &&
      input.down_payment_pct === undefined &&
      input.discount_amount === undefined &&
      input.tax_pct === undefined &&
      input.pph_pct === undefined &&
      input.other_charges === undefined &&
      input.currency === undefined &&
      input.lines === undefined;
    if (!notesOnly) {
      throw new Error("Cancelled purchase orders can only have notes updated.");
    }
  }

  // Rolling a received PO back is allowed (e.g. status advanced without
  // inbound). If lines are fully received, the next lifecycle recalc may
  // set status back to received until receipts are reversed.

  const headerPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.po_number !== undefined) {
    const trimmed = input.po_number.trim();
    if (!trimmed) {
      throw new Error("PO number cannot be empty.");
    }
    headerPatch.po_number = trimmed;
  }
  if (input.supplier_id !== undefined) headerPatch.supplier_id = input.supplier_id;
  if (input.status !== undefined) headerPatch.status = input.status;
  if (input.order_date !== undefined) headerPatch.order_date = input.order_date;
  if (input.expected_date !== undefined)
    headerPatch.expected_date = input.expected_date;
  if (input.down_payment_pct !== undefined)
    headerPatch.down_payment_pct = input.down_payment_pct;
  if (input.discount_amount !== undefined)
    headerPatch.discount_amount = input.discount_amount;
  if (input.tax_pct !== undefined) headerPatch.tax_pct = input.tax_pct;
  if (input.pph_pct !== undefined) headerPatch.pph_pct = input.pph_pct;
  if (input.other_charges !== undefined)
    headerPatch.other_charges = input.other_charges;
  if (input.currency !== undefined) headerPatch.currency = input.currency;
  if (input.notes !== undefined) headerPatch.notes = input.notes;
  if (input.pd_project_id !== undefined) headerPatch.pd_project_id = input.pd_project_id;

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
      if (line.qty_received > 0 || line.is_closed) {
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
      .filter(
        (l) =>
          l.qty_received === 0 &&
          !l.is_closed &&
          !incomingIds.has(l.id),
      )
      .map((l) => l.id);
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("purchase_order_lines")
        .delete()
        .in("id", toDelete);
      if (error) throw error;
    }

    const toUpdate = input.lines
      .filter((l) => l.id && existingLines.some((el) => el.id === l.id))
      .map((l) => ({
        id: l.id!,
        po_id: id,
        sku_id: l.sku_id,
        qty_ordered: l.qty_ordered,
        unit_cost: l.unit_cost ?? null,
      }));
    const toInsert = input.lines
      .filter((l) => !l.id)
      .map((l) => ({
        po_id: id,
        sku_id: l.sku_id,
        qty_ordered: l.qty_ordered,
        unit_cost: l.unit_cost ?? null,
      }));

    if (toUpdate.length > 0) {
      const { error } = await supabase
        .from("purchase_order_lines")
        .upsert(toUpdate, { onConflict: "id" });
      if (error) throw error;
    }
    if (toInsert.length > 0) {
      const { error } = await supabase
        .from("purchase_order_lines")
        .insert(toInsert);
      if (error) throw error;
    }
  }

  if (!manualStatus) {
    await recalculatePoStatus(supabase, id);
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

  await deletePoDocuments(supabase, id);

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

type OpenPoLineRow = {
  id: string;
  sku_id: string;
  qty_ordered: number;
  qty_received: number;
  is_closed: boolean;
  skus: { sku_code: string } | null;
  purchase_orders: {
    id: string;
    expected_date: string | null;
    status: string;
  } | null;
};

export async function listOpenPoBatchesBySkus(
  supabase: SupabaseClient,
  skuIds: string[],
): Promise<OpenPoBatch[]> {
  if (skuIds.length === 0) return [];

  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, sku_id, qty_ordered, qty_received, is_closed, skus(sku_code), purchase_orders!inner(id, expected_date, status)",
    )
    .in("sku_id", skuIds)
    .in("purchase_orders.status", [
      "planned",
      "ordered",
      "in_production",
      "in_transit",
    ]);
  if (error) throw error;

  const batches: OpenPoBatch[] = [];
  for (const line of (data ?? []) as unknown as OpenPoLineRow[]) {
    const po = line.purchase_orders;
    if (!po) continue;
    if (line.is_closed) continue;
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

  return batches;
}

export async function receivePoLine(
  supabase: SupabaseClient,
  lineId: string,
  qty: number,
  receivedDate?: string,
  location?: string,
  batchCode?: string | null,
  expiryDate?: string | null,
  closeLine?: boolean,
  inboundReceiveId?: string | null,
): Promise<void> {
  const trimmedBatch =
    batchCode === undefined || batchCode === null
      ? null
      : batchCode.trim() || null;
  const { error } = await supabase.rpc("receive_po_line", {
    p_po_line_id: lineId,
    p_qty: qty,
    p_received_date: receivedDate ?? new Date().toISOString().slice(0, 10),
    p_location: location ?? "Gudang Finished Goods",
    p_batch_code: trimmedBatch,
    p_expiry_date: expiryDate ?? null,
    p_close_line: closeLine ?? false,
    p_inbound_receive_id: inboundReceiveId ?? null,
  });
  if (error) throw error;
}

export async function closePoLine(
  supabase: SupabaseClient,
  lineId: string,
): Promise<void> {
  const { error } = await supabase.rpc("close_po_line", {
    p_po_line_id: lineId,
  });
  if (error) throw error;
}

function validatePaymentInput(
  input: {
    amount?: number;
    payment_request_number?: string;
    currency?: string;
    exchange_rate?: number | null;
    purpose?: string;
  },
  resolvedCurrency?: string,
) {
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount <= 0)) {
    throw new Error("Payment amount must be a positive number.");
  }
  if (input.payment_request_number !== undefined) {
    const trimmed = input.payment_request_number.trim();
    if (!trimmed) {
      throw new Error("Payment request number is required.");
    }
  }
  if (input.purpose !== undefined && !input.purpose.trim()) {
    throw new Error("Payment purpose is required.");
  }
  if (
    input.exchange_rate !== undefined &&
    input.exchange_rate !== null &&
    (!Number.isFinite(input.exchange_rate) || input.exchange_rate <= 0)
  ) {
    throw new Error("Exchange rate must be a positive number.");
  }

  const currency = input.currency ?? resolvedCurrency ?? "IDR";
  if (currency !== "IDR") {
    const rate = input.exchange_rate;
    if (rate === undefined || rate === null || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(
        "Exchange rate to IDR is required for non-IDR payments.",
      );
    }
  }
}

export async function createPoPayment(
  supabase: SupabaseClient,
  poId: string,
  input: NewPoPaymentInput,
): Promise<PurchaseOrder> {
  const { data: poMeta, error: poMetaErr } = await supabase
    .from("purchase_orders")
    .select("id, currency")
    .eq("id", poId)
    .maybeSingle();
  if (poMetaErr) throw poMetaErr;
  if (!poMeta) throw new Error("Purchase order not found.");

  const currency = input.currency ?? poMeta.currency ?? "IDR";
  const exchangeRate =
    currency === "IDR" ? null : (input.exchange_rate ?? null);

  validatePaymentInput(
    {
      ...input,
      currency,
      exchange_rate: exchangeRate,
    },
    poMeta.currency ?? "IDR",
  );

  const requestNumber = input.payment_request_number.trim();
  if (!requestNumber) {
    throw new Error("Payment request number is required.");
  }
  if (!input.purpose.trim()) {
    throw new Error("Payment purpose is required.");
  }

  const { error } = await supabase.from("po_payments").insert({
    po_id: poId,
    payment_date: input.payment_date ?? new Date().toISOString().slice(0, 10),
    amount: input.amount,
    payment_request_number: requestNumber,
    currency,
    exchange_rate: exchangeRate,
    purpose: input.purpose.trim(),
  });
  if (error) throw error;

  await recalculatePoStatus(supabase, poId);

  const updated = await getPurchaseOrder(supabase, poId);
  if (!updated) throw new Error("Purchase order not found.");
  return updated;
}

export async function updatePoPayment(
  supabase: SupabaseClient,
  poId: string,
  paymentId: string,
  input: UpdatePoPaymentInput,
): Promise<PurchaseOrder> {
  const [poMetaRes, paymentRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, currency")
      .eq("id", poId)
      .maybeSingle(),
    supabase
      .from("po_payments")
      .select("*")
      .eq("id", paymentId)
      .eq("po_id", poId)
      .maybeSingle(),
  ]);
  if (poMetaRes.error) throw poMetaRes.error;
  if (!poMetaRes.data) throw new Error("Purchase order not found.");
  if (paymentRes.error) throw paymentRes.error;
  const existing = paymentRes.data;
  if (!existing) throw new Error("Payment not found.");

  const currency = input.currency ?? existing.currency;
  const exchangeRate =
    currency === "IDR"
      ? null
      : input.exchange_rate !== undefined
        ? input.exchange_rate
        : existing.exchange_rate;

  validatePaymentInput(
    {
      amount: input.amount ?? existing.amount,
      payment_request_number:
        input.payment_request_number ?? existing.payment_request_number,
      currency,
      exchange_rate: exchangeRate,
      purpose: input.purpose ?? existing.purpose,
    },
    poMetaRes.data.currency ?? "IDR",
  );

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.payment_date !== undefined) patch.payment_date = input.payment_date;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.payment_request_number !== undefined) {
    const trimmed = input.payment_request_number.trim();
    if (!trimmed) throw new Error("Payment request number is required.");
    patch.payment_request_number = trimmed;
  }
  if (input.purpose !== undefined) {
    const trimmed = input.purpose.trim();
    if (!trimmed) throw new Error("Payment purpose is required.");
    patch.purpose = trimmed;
  }

  if (input.currency !== undefined) patch.currency = currency;
  if (input.currency !== undefined || input.exchange_rate !== undefined) {
    patch.exchange_rate = exchangeRate;
  }

  const { error } = await supabase
    .from("po_payments")
    .update(patch)
    .eq("id", paymentId)
    .eq("po_id", poId);
  if (error) throw error;

  await recalculatePoStatus(supabase, poId);

  const updated = await getPurchaseOrder(supabase, poId);
  if (!updated) throw new Error("Purchase order not found.");
  return updated;
}

export async function deletePoPayment(
  supabase: SupabaseClient,
  poId: string,
  paymentId: string,
): Promise<PurchaseOrder> {
  const { data: existing, error: checkErr } = await supabase
    .from("po_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("po_id", poId)
    .maybeSingle();
  if (checkErr) throw checkErr;
  if (!existing) throw new Error("Payment not found.");

  const { error } = await supabase
    .from("po_payments")
    .delete()
    .eq("id", paymentId)
    .eq("po_id", poId);
  if (error) throw error;

  await recalculatePoStatus(supabase, poId);

  const updated = await getPurchaseOrder(supabase, poId);
  if (!updated) throw new Error("Purchase order not found.");
  return updated;
}
