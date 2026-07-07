import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractCode,
  ExtractInboundDeliveryNote,
  ExtractInboundDeliveryNoteLine,
  ExtractInboundDnSettings,
  ExtractInboundPoOption,
} from "@/types/database";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";
import { EXTRACT_INBOUND_DN_SETTINGS_ID } from "@/lib/extract-inbound-delivery-note/constants";

const NOTE_SELECT =
  "id, dn_number, po_id, po_number, delivery_date, recipient_name, special_instruction, created_at";

const LINE_SELECT =
  "id, delivery_note_id, extract_code_id, item_code, extract_name, quantity, uom_kg, total_kg";

const CODE_SELECT = "id, item_code, extract_name, is_active, created_at";

const SETTINGS_SELECT =
  "id, recipient_company, recipient_address, recipient_pic_name, recipient_phone, recipient_email, updated_at";

export interface ExtractInboundLineInput {
  extract_code_id: string;
  quantity: number;
  uom_kg: number;
}

export interface CreateExtractInboundDeliveryNoteInput {
  po_id: string;
  delivery_date: string;
  recipient_name: string;
  special_instruction?: string | null;
  lines: ExtractInboundLineInput[];
}

export type UpdateExtractInboundDeliveryNoteInput = CreateExtractInboundDeliveryNoteInput;

interface ValidateExtractInboundOptions {
  allowClosedPoId?: string;
  allowInactiveCodeIds?: string[];
}

interface ValidatedExtractInboundInput {
  po: { id: string; po_number: string };
  lineRows: Array<{
    extract_code_id: string;
    item_code: string;
    extract_name: string;
    quantity: number;
    uom_kg: number;
    total_kg: number;
  }>;
}

async function validateExtractInboundDeliveryNoteInput(
  supabase: SupabaseClient,
  input: CreateExtractInboundDeliveryNoteInput,
  options: ValidateExtractInboundOptions = {},
): Promise<ValidatedExtractInboundInput> {
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("id", input.po_id)
    .maybeSingle();
  if (poError) throw poError;
  if (!po) throw new Error("Purchase order not found.");
  if (po.status === "received" || po.status === "cancelled") {
    if (!options.allowClosedPoId || po.id !== options.allowClosedPoId) {
      throw new Error("Selected PO is closed.");
    }
  }
  if (input.lines.length === 0) {
    throw new Error("Add at least one line item.");
  }

  const codeIds = input.lines.map((l) => l.extract_code_id);
  const { data: codeRows, error: codeError } = await supabase
    .from("extract_codes")
    .select("id, item_code, extract_name, is_active")
    .in("id", codeIds);
  if (codeError) throw codeError;

  const codeById = new Map((codeRows ?? []).map((row) => [row.id as string, row]));
  const allowedInactive = new Set(options.allowInactiveCodeIds ?? []);

  const lineRows = input.lines.map((line) => {
    const item = codeById.get(line.extract_code_id);
    if (!item) {
      throw new Error("One or more extract codes are invalid.");
    }
    if (!item.is_active && !allowedInactive.has(line.extract_code_id)) {
      throw new Error("One or more extract codes are invalid.");
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("Quantity must be a positive number.");
    }
    if (!Number.isFinite(line.uom_kg) || line.uom_kg <= 0) {
      throw new Error("UOM (kg) must be a positive number.");
    }

    const quantity = line.quantity;
    const uom_kg = line.uom_kg;
    return {
      extract_code_id: line.extract_code_id,
      item_code: item.item_code as string,
      extract_name: item.extract_name as string,
      quantity,
      uom_kg,
      total_kg: quantity * uom_kg,
    };
  });

  return {
    po: { id: po.id as string, po_number: po.po_number as string },
    lineRows,
  };
}

function generateDnNumber(): string {
  const date = new Date();
  const stamp =
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EDN-${stamp}-${rand}`;
}

export async function getExtractInboundDnSettings(
  supabase: SupabaseClient,
): Promise<ExtractInboundDnSettings> {
  const { data, error } = await supabase
    .from("extract_inbound_dn_settings")
    .select(SETTINGS_SELECT)
    .eq("id", EXTRACT_INBOUND_DN_SETTINGS_ID)
    .single();
  if (error) throw error;
  return data as ExtractInboundDnSettings;
}

export interface UpdateExtractInboundDnSettingsInput {
  recipient_company?: string;
  recipient_address?: string;
  recipient_pic_name?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
}

export async function updateExtractInboundDnSettings(
  supabase: SupabaseClient,
  input: UpdateExtractInboundDnSettingsInput,
): Promise<ExtractInboundDnSettings> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.recipient_company !== undefined) {
    patch.recipient_company = input.recipient_company.trim();
  }
  if (input.recipient_address !== undefined) {
    patch.recipient_address = input.recipient_address.trim();
  }
  if (input.recipient_pic_name !== undefined) {
    patch.recipient_pic_name = input.recipient_pic_name?.trim() || null;
  }
  if (input.recipient_phone !== undefined) {
    patch.recipient_phone = input.recipient_phone?.trim() || null;
  }
  if (input.recipient_email !== undefined) {
    patch.recipient_email = input.recipient_email?.trim() || null;
  }

  const { data, error } = await supabase
    .from("extract_inbound_dn_settings")
    .update(patch)
    .eq("id", EXTRACT_INBOUND_DN_SETTINGS_ID)
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw error;
  return data as ExtractInboundDnSettings;
}

export async function listOpenPosForExtractInbound(
  supabase: SupabaseClient,
): Promise<ExtractInboundPoOption[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, purchase_order_lines ( skus ( name, sku_code ) )",
    )
    .not("status", "in", '("received","cancelled")')
    .order("order_date", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const lines = (row.purchase_order_lines ?? []) as Array<{
      skus:
        | { name: string | null; sku_code: string }
        | { name: string | null; sku_code: string }[]
        | null;
    }>;
    const skuNames: string[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      const skus = line.skus;
      const sku = Array.isArray(skus) ? skus[0] : skus;
      const label = sku?.name?.trim() || sku?.sku_code?.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        skuNames.push(label);
      }
    }
    return {
      id: row.id as string,
      po_number: row.po_number as string,
      status: row.status as string,
      order_date: row.order_date as string,
      sku_names: skuNames,
    };
  });
}

export async function listExtractCodes(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<ExtractCode[]> {
  let query = supabase.from("extract_codes").select(CODE_SELECT).order("extract_name");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ExtractCode[];
}

export interface ExtractCodeImportRow {
  item_code: string;
  extract_name: string;
}

export interface ExtractCodeImportResult {
  inserted: number;
  updated: number;
  total: number;
}

export interface CreateExtractCodeInput {
  item_code: string;
  extract_name: string;
}

export async function createExtractCode(
  supabase: SupabaseClient,
  input: CreateExtractCodeInput,
): Promise<ExtractCode> {
  const item_code = input.item_code.trim();
  const extract_name = fixUtf8Mojibake(input.extract_name.trim());
  if (!item_code) throw new Error("Item code is required.");
  if (!extract_name) throw new Error("Extract name is required.");

  const { data: existing, error: existingError } = await supabase
    .from("extract_codes")
    .select("id")
    .eq("item_code", item_code)
    .eq("extract_name", extract_name)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new Error(
      `"${extract_name}" with item code "${item_code}" is already in the catalog.`,
    );
  }

  const { data, error } = await supabase
    .from("extract_codes")
    .insert({ item_code, extract_name, is_active: true })
    .select(CODE_SELECT)
    .single();
  if (error) throw error;
  return data as ExtractCode;
}

export async function importExtractCodes(
  supabase: SupabaseClient,
  rows: ExtractCodeImportRow[],
): Promise<ExtractCodeImportResult> {
  if (rows.length === 0) {
    throw new Error("No valid rows to import.");
  }

  const pairKey = (row: ExtractCodeImportRow) => `${row.item_code}\0${row.extract_name}`;
  const { data: existing, error: existingError } = await supabase
    .from("extract_codes")
    .select("item_code, extract_name");
  if (existingError) throw existingError;

  const existingPairs = new Set(
    (existing ?? []).map((row) => `${row.item_code as string}\0${row.extract_name as string}`),
  );

  const { error } = await supabase.from("extract_codes").upsert(
    rows.map((row) => ({
      item_code: row.item_code,
      extract_name: row.extract_name,
      is_active: true,
    })),
    { onConflict: "item_code,extract_name" },
  );
  if (error) throw error;

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    if (existingPairs.has(pairKey(row))) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated, total: rows.length };
}

export interface UpdateExtractCodeInput {
  item_code?: string;
  extract_name?: string;
  is_active?: boolean;
}

export async function updateExtractCode(
  supabase: SupabaseClient,
  id: string,
  input: UpdateExtractCodeInput,
): Promise<ExtractCode> {
  const patch: Record<string, unknown> = {};
  if (input.item_code !== undefined) {
    const item_code = input.item_code.trim();
    if (!item_code) throw new Error("Item code is required.");
    patch.item_code = item_code;
  }
  if (input.extract_name !== undefined) {
    const extract_name = fixUtf8Mojibake(input.extract_name.trim());
    if (!extract_name) throw new Error("Extract name is required.");
    patch.extract_name = extract_name;
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("extract_codes")
    .update(patch)
    .eq("id", id)
    .select(CODE_SELECT)
    .single();
  if (error) throw error;
  return data as ExtractCode;
}

export async function listExtractInboundDeliveryNotes(
  supabase: SupabaseClient,
): Promise<ExtractInboundDeliveryNote[]> {
  const { data, error } = await supabase
    .from("extract_inbound_delivery_notes")
    .select(NOTE_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExtractInboundDeliveryNote[];
}

export async function listExtractInboundDeliveryNotesByPo(
  supabase: SupabaseClient,
  poId: string,
): Promise<ExtractInboundDeliveryNote[]> {
  const { data, error } = await supabase
    .from("extract_inbound_delivery_notes")
    .select(NOTE_SELECT)
    .eq("po_id", poId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExtractInboundDeliveryNote[];
}

export async function getExtractInboundDeliveryNote(
  supabase: SupabaseClient,
  id: string,
): Promise<ExtractInboundDeliveryNote | null> {
  const { data, error } = await supabase
    .from("extract_inbound_delivery_notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: lines, error: linesError } = await supabase
    .from("extract_inbound_delivery_note_lines")
    .select(LINE_SELECT)
    .eq("delivery_note_id", id)
    .order("item_code");
  if (linesError) throw linesError;

  return {
    ...(data as ExtractInboundDeliveryNote),
    lines: (lines ?? []) as ExtractInboundDeliveryNoteLine[],
  };
}

export async function createExtractInboundDeliveryNote(
  supabase: SupabaseClient,
  input: CreateExtractInboundDeliveryNoteInput,
): Promise<ExtractInboundDeliveryNote> {
  const { po, lineRows } = await validateExtractInboundDeliveryNoteInput(supabase, input);

  const dnNumber = generateDnNumber();
  const { data: note, error: noteError } = await supabase
    .from("extract_inbound_delivery_notes")
    .insert({
      dn_number: dnNumber,
      po_id: po.id,
      po_number: po.po_number,
      delivery_date: input.delivery_date,
      recipient_name: input.recipient_name.trim(),
      special_instruction: input.special_instruction?.trim() || null,
    })
    .select(NOTE_SELECT)
    .single();
  if (noteError) throw noteError;

  const { data: lines, error: linesError } = await supabase
    .from("extract_inbound_delivery_note_lines")
    .insert(
      lineRows.map((line) => ({
        delivery_note_id: note.id,
        ...line,
      })),
    )
    .select(LINE_SELECT);
  if (linesError) throw linesError;

  return {
    ...(note as ExtractInboundDeliveryNote),
    lines: (lines ?? []) as ExtractInboundDeliveryNoteLine[],
  };
}

export async function updateExtractInboundDeliveryNote(
  supabase: SupabaseClient,
  id: string,
  input: UpdateExtractInboundDeliveryNoteInput,
): Promise<ExtractInboundDeliveryNote> {
  const existing = await getExtractInboundDeliveryNote(supabase, id);
  if (!existing) {
    throw new Error("Delivery note not found.");
  }

  const allowInactiveCodeIds = (existing.lines ?? [])
    .map((line) => line.extract_code_id)
    .filter((extractCodeId): extractCodeId is string => Boolean(extractCodeId));

  const { po, lineRows } = await validateExtractInboundDeliveryNoteInput(supabase, input, {
    allowClosedPoId: existing.po_id ?? undefined,
    allowInactiveCodeIds,
  });

  const { data: note, error: noteError } = await supabase
    .from("extract_inbound_delivery_notes")
    .update({
      po_id: po.id,
      po_number: po.po_number,
      delivery_date: input.delivery_date,
      recipient_name: input.recipient_name.trim(),
      special_instruction: input.special_instruction?.trim() || null,
    })
    .eq("id", id)
    .select(NOTE_SELECT)
    .single();
  if (noteError) throw noteError;

  const { error: deleteLinesError } = await supabase
    .from("extract_inbound_delivery_note_lines")
    .delete()
    .eq("delivery_note_id", id);
  if (deleteLinesError) throw deleteLinesError;

  const { data: lines, error: linesError } = await supabase
    .from("extract_inbound_delivery_note_lines")
    .insert(
      lineRows.map((line) => ({
        delivery_note_id: id,
        ...line,
      })),
    )
    .select(LINE_SELECT);
  if (linesError) throw linesError;

  return {
    ...(note as ExtractInboundDeliveryNote),
    lines: (lines ?? []) as ExtractInboundDeliveryNoteLine[],
  };
}

export async function deleteExtractInboundDeliveryNote(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const existing = await getExtractInboundDeliveryNote(supabase, id);
  if (!existing) {
    throw new Error("Delivery note not found.");
  }

  const { error } = await supabase.from("extract_inbound_delivery_notes").delete().eq("id", id);
  if (error) throw error;
}
