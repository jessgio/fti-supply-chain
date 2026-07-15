import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PrimaryPackagingDeliveryNote,
  PrimaryPackagingDeliveryNoteLine,
  PrimaryPackagingDnSettings,
  PrimaryPackagingInboundCosmax,
} from "@/types/database";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";
import { PRIMARY_PACKAGING_DN_SETTINGS_ID } from "@/lib/primary-packaging-delivery-note/constants";
import { listOpenPosForPackagingDn } from "@/lib/packaging-dn/open-pos";

export { listOpenPosForPackagingDn as listOpenPosForPrimaryPackaging };

const NOTE_SELECT =
  "id, dn_number, po_id, po_number, delivery_date, recipient_name, created_at";

const LINE_SELECT =
  "id, delivery_note_id, packaging_item_id, item_code, product_name, cartons, pcs_per_carton, total_pcs";

const PACKAGING_SELECT = "id, item_code, product_name, is_active, created_at";

const SETTINGS_SELECT =
  "id, recipient_company, recipient_address, recipient_pic_name, recipient_phone, recipient_email, updated_at";

export interface PrimaryPackagingLineInput {
  packaging_item_id: string;
  cartons: number;
  pcs_per_carton: number;
}

export interface CreatePrimaryPackagingDeliveryNoteInput {
  po_id: string;
  delivery_date: string;
  recipient_name: string;
  lines: PrimaryPackagingLineInput[];
}

export type UpdatePrimaryPackagingDeliveryNoteInput =
  CreatePrimaryPackagingDeliveryNoteInput;

interface ValidateOptions {
  allowClosedPoId?: string;
  allowInactivePackagingIds?: string[];
}

interface ValidatedInput {
  po: { id: string; po_number: string };
  lineRows: Array<{
    packaging_item_id: string;
    item_code: string;
    product_name: string;
    cartons: number;
    pcs_per_carton: number;
    total_pcs: number;
  }>;
}

function generateDnNumber(): string {
  const date = new Date();
  const stamp =
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PPDN-${stamp}-${rand}`;
}

function normalizeItemCode(code: string): string {
  return code.trim().toUpperCase();
}

async function validateInput(
  supabase: SupabaseClient,
  input: CreatePrimaryPackagingDeliveryNoteInput,
  options: ValidateOptions = {},
): Promise<ValidatedInput> {
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

  const packagingIds = input.lines.map((l) => l.packaging_item_id);
  const { data: packagingRows, error: packagingError } = await supabase
    .from("primary_packaging_inbound_cosmax")
    .select("id, item_code, product_name, is_active")
    .in("id", packagingIds);
  if (packagingError) throw packagingError;

  const packagingById = new Map(
    (packagingRows ?? []).map((row) => [row.id as string, row]),
  );
  const allowedInactive = new Set(options.allowInactivePackagingIds ?? []);

  const lineRows = input.lines.map((line) => {
    const item = packagingById.get(line.packaging_item_id);
    if (!item) {
      throw new Error("One or more packaging items are invalid.");
    }
    if (!item.is_active && !allowedInactive.has(line.packaging_item_id)) {
      throw new Error("One or more packaging items are invalid.");
    }
    if (!Number.isInteger(line.cartons) || line.cartons <= 0) {
      throw new Error("Carton count must be a positive whole number.");
    }
    if (!Number.isInteger(line.pcs_per_carton) || line.pcs_per_carton <= 0) {
      throw new Error("Pieces per carton must be a positive whole number.");
    }

    return {
      packaging_item_id: line.packaging_item_id,
      item_code: item.item_code as string,
      product_name: item.product_name as string,
      cartons: line.cartons,
      pcs_per_carton: line.pcs_per_carton,
      total_pcs: line.cartons * line.pcs_per_carton,
    };
  });

  return {
    po: { id: po.id as string, po_number: po.po_number as string },
    lineRows,
  };
}

export async function getPrimaryPackagingDnSettings(
  supabase: SupabaseClient,
): Promise<PrimaryPackagingDnSettings> {
  const { data, error } = await supabase
    .from("primary_packaging_dn_settings")
    .select(SETTINGS_SELECT)
    .eq("id", PRIMARY_PACKAGING_DN_SETTINGS_ID)
    .single();
  if (error) throw error;
  return data as PrimaryPackagingDnSettings;
}

export interface UpdatePrimaryPackagingDnSettingsInput {
  recipient_company?: string;
  recipient_address?: string;
  recipient_pic_name?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
}

export async function updatePrimaryPackagingDnSettings(
  supabase: SupabaseClient,
  input: UpdatePrimaryPackagingDnSettingsInput,
): Promise<PrimaryPackagingDnSettings> {
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
    .from("primary_packaging_dn_settings")
    .update(patch)
    .eq("id", PRIMARY_PACKAGING_DN_SETTINGS_ID)
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw error;
  return data as PrimaryPackagingDnSettings;
}

export async function listPrimaryPackagingItems(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<PrimaryPackagingInboundCosmax[]> {
  let query = supabase
    .from("primary_packaging_inbound_cosmax")
    .select(PACKAGING_SELECT)
    .order("item_code");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PrimaryPackagingInboundCosmax[];
}

export interface CreatePrimaryPackagingItemInput {
  item_code: string;
  product_name: string;
}

export async function createPrimaryPackagingItem(
  supabase: SupabaseClient,
  input: CreatePrimaryPackagingItemInput,
): Promise<PrimaryPackagingInboundCosmax> {
  const item_code = normalizeItemCode(input.item_code);
  const product_name = fixUtf8Mojibake(input.product_name.trim());
  if (item_code.length !== 12) {
    throw new Error("Item code must be exactly 12 characters.");
  }
  if (!product_name) {
    throw new Error("Product name is required.");
  }

  const { data, error } = await supabase
    .from("primary_packaging_inbound_cosmax")
    .insert({ item_code, product_name })
    .select(PACKAGING_SELECT)
    .single();
  if (error) throw error;
  return data as PrimaryPackagingInboundCosmax;
}

export interface UpdatePrimaryPackagingItemInput {
  item_code?: string;
  product_name?: string;
  is_active?: boolean;
}

export async function updatePrimaryPackagingItem(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePrimaryPackagingItemInput,
): Promise<PrimaryPackagingInboundCosmax> {
  const patch: Record<string, unknown> = {};
  if (input.item_code !== undefined) {
    const item_code = normalizeItemCode(input.item_code);
    if (item_code.length !== 12) {
      throw new Error("Item code must be exactly 12 characters.");
    }
    patch.item_code = item_code;
  }
  if (input.product_name !== undefined) {
    const product_name = fixUtf8Mojibake(input.product_name.trim());
    if (!product_name) throw new Error("Product name is required.");
    patch.product_name = product_name;
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data, error } = await supabase
    .from("primary_packaging_inbound_cosmax")
    .update(patch)
    .eq("id", id)
    .select(PACKAGING_SELECT)
    .single();
  if (error) throw error;
  return data as PrimaryPackagingInboundCosmax;
}

export interface PrimaryPackagingCatalogImportRow {
  item_code: string;
  product_name: string;
}

export interface PrimaryPackagingCatalogImportResult {
  inserted: number;
  updated: number;
  total: number;
}

export async function importPrimaryPackagingCatalog(
  supabase: SupabaseClient,
  rows: PrimaryPackagingCatalogImportRow[],
): Promise<PrimaryPackagingCatalogImportResult> {
  if (rows.length === 0) {
    throw new Error("No valid rows to import.");
  }

  const codes = rows.map((row) => row.item_code);
  const { data: existing, error: existingError } = await supabase
    .from("primary_packaging_inbound_cosmax")
    .select("item_code")
    .in("item_code", codes);
  if (existingError) throw existingError;

  const existingCodes = new Set((existing ?? []).map((row) => row.item_code as string));

  const { error } = await supabase.from("primary_packaging_inbound_cosmax").upsert(
    rows.map((row) => ({
      item_code: row.item_code,
      product_name: row.product_name,
      is_active: true,
    })),
    { onConflict: "item_code" },
  );
  if (error) throw error;

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    if (existingCodes.has(row.item_code)) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated, total: rows.length };
}

export async function listPrimaryPackagingDeliveryNotes(
  supabase: SupabaseClient,
): Promise<PrimaryPackagingDeliveryNote[]> {
  const { data, error } = await supabase
    .from("primary_packaging_delivery_notes")
    .select(NOTE_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PrimaryPackagingDeliveryNote[];
}

export async function getPrimaryPackagingDeliveryNote(
  supabase: SupabaseClient,
  id: string,
): Promise<PrimaryPackagingDeliveryNote | null> {
  const { data, error } = await supabase
    .from("primary_packaging_delivery_notes")
    .select(NOTE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: lines, error: linesError } = await supabase
    .from("primary_packaging_delivery_note_lines")
    .select(LINE_SELECT)
    .eq("delivery_note_id", id)
    .order("item_code");
  if (linesError) throw linesError;

  return {
    ...(data as PrimaryPackagingDeliveryNote),
    lines: (lines ?? []) as PrimaryPackagingDeliveryNoteLine[],
  };
}

export async function createPrimaryPackagingDeliveryNote(
  supabase: SupabaseClient,
  input: CreatePrimaryPackagingDeliveryNoteInput,
): Promise<PrimaryPackagingDeliveryNote> {
  const { po, lineRows } = await validateInput(supabase, input);

  const dnNumber = generateDnNumber();
  const { data: note, error: noteError } = await supabase
    .from("primary_packaging_delivery_notes")
    .insert({
      dn_number: dnNumber,
      po_id: po.id,
      po_number: po.po_number,
      delivery_date: input.delivery_date,
      recipient_name: input.recipient_name.trim(),
    })
    .select(NOTE_SELECT)
    .single();
  if (noteError) throw noteError;

  const { data: lines, error: linesError } = await supabase
    .from("primary_packaging_delivery_note_lines")
    .insert(
      lineRows.map((line) => ({
        delivery_note_id: note.id,
        ...line,
      })),
    )
    .select(LINE_SELECT);
  if (linesError) throw linesError;

  return {
    ...(note as PrimaryPackagingDeliveryNote),
    lines: (lines ?? []) as PrimaryPackagingDeliveryNoteLine[],
  };
}

export async function updatePrimaryPackagingDeliveryNote(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePrimaryPackagingDeliveryNoteInput,
): Promise<PrimaryPackagingDeliveryNote> {
  const existing = await getPrimaryPackagingDeliveryNote(supabase, id);
  if (!existing) {
    throw new Error("Delivery note not found.");
  }

  const allowInactivePackagingIds = (existing.lines ?? [])
    .map((line) => line.packaging_item_id)
    .filter((packagingItemId): packagingItemId is string => Boolean(packagingItemId));

  const { po, lineRows } = await validateInput(supabase, input, {
    allowClosedPoId: existing.po_id ?? undefined,
    allowInactivePackagingIds,
  });

  const { data: note, error: noteError } = await supabase
    .from("primary_packaging_delivery_notes")
    .update({
      po_id: po.id,
      po_number: po.po_number,
      delivery_date: input.delivery_date,
      recipient_name: input.recipient_name.trim(),
    })
    .eq("id", id)
    .select(NOTE_SELECT)
    .single();
  if (noteError) throw noteError;

  const { error: deleteLinesError } = await supabase
    .from("primary_packaging_delivery_note_lines")
    .delete()
    .eq("delivery_note_id", id);
  if (deleteLinesError) throw deleteLinesError;

  const { data: lines, error: linesError } = await supabase
    .from("primary_packaging_delivery_note_lines")
    .insert(
      lineRows.map((line) => ({
        delivery_note_id: id,
        ...line,
      })),
    )
    .select(LINE_SELECT);
  if (linesError) throw linesError;

  return {
    ...(note as PrimaryPackagingDeliveryNote),
    lines: (lines ?? []) as PrimaryPackagingDeliveryNoteLine[],
  };
}

export async function deletePrimaryPackagingDeliveryNote(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const existing = await getPrimaryPackagingDeliveryNote(supabase, id);
  if (!existing) {
    throw new Error("Delivery note not found.");
  }

  const { error } = await supabase
    .from("primary_packaging_delivery_notes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
