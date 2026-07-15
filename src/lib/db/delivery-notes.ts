import { timingSafeEqual, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryNote,
  DeliveryNoteLine,
  DeliveryNotePortal,
  DeliveryNoteSettings,
  ExtractInboundPoOption,
  SecondaryPackagingInboundCosmax,
  Supplier,
} from "@/types/database";
import {
  DELIVERY_NOTE_PORTAL_ID,
  DELIVERY_NOTE_SETTINGS_ID,
  DELIVERY_NOTE_SUPPLIER_NAME,
} from "@/lib/delivery-note/constants";
import { fixUtf8Mojibake } from "@/lib/text/fix-mojibake";

const NOTE_SELECT =
  "id, dn_number, po_id, po_number, supplier_id, delivery_date, recipient_name, created_at";

const LINE_SELECT =
  "id, delivery_note_id, packaging_item_id, item_code, product_name, cartons, pcs_per_carton, total_pcs";

const PACKAGING_SELECT = "id, item_code, product_name, is_active, created_at";

const SETTINGS_SELECT =
  "id, recipient_company, recipient_address, recipient_pic_name, recipient_phone, recipient_email, updated_at";

export interface DeliveryNoteLineInput {
  packaging_item_id: string;
  cartons: number;
  pcs_per_carton: number;
}

export interface CreateDeliveryNoteInput {
  po_id: string;
  delivery_date: string;
  recipient_name: string;
  lines: DeliveryNoteLineInput[];
}

export type UpdateDeliveryNoteInput = CreateDeliveryNoteInput;

interface ValidatedDeliveryNoteInput {
  supplier: Supplier;
  po: { id: string; po_number: string; supplier_id: string; status: string };
  lineRows: Array<{
    packaging_item_id: string;
    item_code: string;
    product_name: string;
    cartons: number;
    pcs_per_carton: number;
    total_pcs: number;
  }>;
}

interface ValidateDeliveryNoteOptions {
  allowClosedPoId?: string;
  allowInactivePackagingIds?: string[];
}

function generateDnNumber(): string {
  const date = new Date();
  const stamp =
    `${date.getFullYear()}` +
    `${String(date.getMonth() + 1).padStart(2, "0")}` +
    `${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DN-${stamp}-${rand}`;
}

export function tokensMatch(stored: string, provided: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function getPortalByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<DeliveryNotePortal | null> {
  const { data, error } = await supabase
    .from("delivery_note_portal")
    .select("id, access_token, label, updated_at")
    .eq("id", DELIVERY_NOTE_PORTAL_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data || !tokensMatch(data.access_token, token)) return null;
  return data as DeliveryNotePortal;
}

export async function getPortal(
  supabase: SupabaseClient,
): Promise<DeliveryNotePortal> {
  const { data, error } = await supabase
    .from("delivery_note_portal")
    .select("id, access_token, label, updated_at")
    .eq("id", DELIVERY_NOTE_PORTAL_ID)
    .single();
  if (error) throw error;
  return data as DeliveryNotePortal;
}

export async function regeneratePortalToken(
  supabase: SupabaseClient,
): Promise<DeliveryNotePortal> {
  const token = randomBytes(32).toString("hex");
  return updatePortalToken(supabase, token);
}

export async function updatePortalToken(
  supabase: SupabaseClient,
  token: string,
): Promise<DeliveryNotePortal> {
  const normalized = token.trim();
  if (normalized.length < 16) {
    throw new Error("Access token must be at least 16 characters.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error("Access token may only contain letters, numbers, hyphens, and underscores.");
  }

  const { data, error } = await supabase
    .from("delivery_note_portal")
    .update({ access_token: normalized, updated_at: new Date().toISOString() })
    .eq("id", DELIVERY_NOTE_PORTAL_ID)
    .select("id, access_token, label, updated_at")
    .single();
  if (error) throw error;
  return data as DeliveryNotePortal;
}

export async function getDeliveryNoteSettings(
  supabase: SupabaseClient,
): Promise<DeliveryNoteSettings> {
  const { data, error } = await supabase
    .from("delivery_note_settings")
    .select(SETTINGS_SELECT)
    .eq("id", DELIVERY_NOTE_SETTINGS_ID)
    .single();
  if (error) throw error;
  return data as DeliveryNoteSettings;
}

export interface UpdateDeliveryNoteSettingsInput {
  recipient_company?: string;
  recipient_address?: string;
  recipient_pic_name?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
}

export async function updateDeliveryNoteSettings(
  supabase: SupabaseClient,
  input: UpdateDeliveryNoteSettingsInput,
): Promise<DeliveryNoteSettings> {
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
    .from("delivery_note_settings")
    .update(patch)
    .eq("id", DELIVERY_NOTE_SETTINGS_ID)
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw error;
  return data as DeliveryNoteSettings;
}

export interface CreatePackagingItemInput {
  item_code: string;
  product_name: string;
}

export interface UpdatePackagingItemInput {
  item_code?: string;
  product_name?: string;
  is_active?: boolean;
}

function normalizeItemCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function createPackagingItem(
  supabase: SupabaseClient,
  input: CreatePackagingItemInput,
): Promise<SecondaryPackagingInboundCosmax> {
  const item_code = normalizeItemCode(input.item_code);
  const product_name = fixUtf8Mojibake(input.product_name.trim());
  if (item_code.length !== 12) {
    throw new Error("Item code must be exactly 12 characters.");
  }
  if (!product_name) {
    throw new Error("Product name is required.");
  }

  const { data, error } = await supabase
    .from("secondary_packaging_inbound_cosmax")
    .insert({ item_code, product_name })
    .select(PACKAGING_SELECT)
    .single();
  if (error) throw error;
  return data as SecondaryPackagingInboundCosmax;
}

export async function updatePackagingItem(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePackagingItemInput,
): Promise<SecondaryPackagingInboundCosmax> {
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
    .from("secondary_packaging_inbound_cosmax")
    .update(patch)
    .eq("id", id)
    .select(PACKAGING_SELECT)
    .single();
  if (error) throw error;
  return data as SecondaryPackagingInboundCosmax;
}

export interface PackagingCatalogImportRow {
  item_code: string;
  product_name: string;
}

export interface PackagingCatalogImportResult {
  inserted: number;
  updated: number;
  total: number;
}

export async function importPackagingCatalog(
  supabase: SupabaseClient,
  rows: PackagingCatalogImportRow[],
): Promise<PackagingCatalogImportResult> {
  if (rows.length === 0) {
    throw new Error("No valid rows to import.");
  }

  const codes = rows.map((row) => row.item_code);
  const { data: existing, error: existingError } = await supabase
    .from("secondary_packaging_inbound_cosmax")
    .select("item_code")
    .in("item_code", codes);
  if (existingError) throw existingError;

  const existingCodes = new Set((existing ?? []).map((row) => row.item_code as string));

  const { error } = await supabase.from("secondary_packaging_inbound_cosmax").upsert(
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

export async function listPackagingItems(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<SecondaryPackagingInboundCosmax[]> {
  let query = supabase
    .from("secondary_packaging_inbound_cosmax")
    .select(PACKAGING_SELECT)
    .order("item_code");
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SecondaryPackagingInboundCosmax[];
}

export async function getMargasetaSupplier(
  supabase: SupabaseClient,
): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, lead_time_days, contact, address, pic_name, pic_email, pic_phone, " +
        "payment_terms, lead_time_note, delivery_time, packaging_notes, " +
        "beneficiary_name, beneficiary_account_number, swift_code, beneficiary_country, " +
        "beneficiary_address, beneficiary_bank, beneficiary_bank_address, bank_code, branch_code, notes",
    )
    .eq("name", DELIVERY_NOTE_SUPPLIER_NAME)
    .maybeSingle();
  if (error) throw error;
  return data as Supplier | null;
}

export async function listOpenPosForDeliveryNote(
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

export async function listDeliveryNotes(
  supabase: SupabaseClient,
): Promise<DeliveryNote[]> {
  const { data, error } = await supabase
    .from("delivery_notes")
    .select(`${NOTE_SELECT}, suppliers(name)`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => {
    const suppliers = row.suppliers as { name: string } | { name: string }[] | null;
    const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
    const { suppliers: _s, ...note } = row;
    return {
      ...(note as DeliveryNote),
      supplier_name: supplier?.name ?? null,
    };
  });
}

export async function getDeliveryNote(
  supabase: SupabaseClient,
  id: string,
): Promise<DeliveryNote | null> {
  const { data, error } = await supabase
    .from("delivery_notes")
    .select(`${NOTE_SELECT}, suppliers(name)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const suppliers = data.suppliers as { name: string } | { name: string }[] | null;
  const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
  const { suppliers: _s, ...note } = data;

  const { data: lines, error: linesError } = await supabase
    .from("delivery_note_lines")
    .select(LINE_SELECT)
    .eq("delivery_note_id", id)
    .order("item_code");
  if (linesError) throw linesError;

  return {
    ...(note as DeliveryNote),
    supplier_name: supplier?.name ?? null,
    lines: (lines ?? []) as DeliveryNoteLine[],
  };
}

async function validateDeliveryNoteInput(
  supabase: SupabaseClient,
  input: CreateDeliveryNoteInput,
  options: ValidateDeliveryNoteOptions = {},
): Promise<ValidatedDeliveryNoteInput> {
  const supplier = await getMargasetaSupplier(supabase);
  if (!supplier) {
    throw new Error(`Supplier "${DELIVERY_NOTE_SUPPLIER_NAME}" was not found.`);
  }

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
    .from("secondary_packaging_inbound_cosmax")
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

  return { supplier, po, lineRows };
}

export async function createDeliveryNote(
  supabase: SupabaseClient,
  input: CreateDeliveryNoteInput,
): Promise<DeliveryNote> {
  const { supplier, po, lineRows } = await validateDeliveryNoteInput(supabase, input);

  const dnNumber = generateDnNumber();
  const { data: note, error: noteError } = await supabase
    .from("delivery_notes")
    .insert({
      dn_number: dnNumber,
      po_id: po.id,
      po_number: po.po_number,
      supplier_id: supplier.id,
      delivery_date: input.delivery_date,
      recipient_name: input.recipient_name.trim(),
    })
    .select(NOTE_SELECT)
    .single();
  if (noteError) throw noteError;

  const { data: lines, error: linesError } = await supabase
    .from("delivery_note_lines")
    .insert(
      lineRows.map((line) => ({
        delivery_note_id: note.id,
        ...line,
      })),
    )
    .select(LINE_SELECT);
  if (linesError) throw linesError;

  return {
    ...(note as DeliveryNote),
    supplier_name: supplier.name,
    lines: (lines ?? []) as DeliveryNoteLine[],
  };
}

export async function updateDeliveryNote(
  supabase: SupabaseClient,
  id: string,
  input: UpdateDeliveryNoteInput,
): Promise<DeliveryNote> {
  const existing = await getDeliveryNote(supabase, id);
  if (!existing) {
    throw new Error("Delivery note not found.");
  }

  const allowInactivePackagingIds = (existing.lines ?? [])
    .map((line) => line.packaging_item_id)
    .filter((packagingItemId): packagingItemId is string => Boolean(packagingItemId));

  const { supplier, po, lineRows } = await validateDeliveryNoteInput(supabase, input, {
    allowClosedPoId: existing.po_id ?? undefined,
    allowInactivePackagingIds,
  });

  const { data: note, error: noteError } = await supabase
    .from("delivery_notes")
    .update({
      po_id: po.id,
      po_number: po.po_number,
      supplier_id: supplier.id,
      delivery_date: input.delivery_date,
      recipient_name: input.recipient_name.trim(),
    })
    .eq("id", id)
    .select(NOTE_SELECT)
    .single();
  if (noteError) throw noteError;

  const { error: deleteLinesError } = await supabase
    .from("delivery_note_lines")
    .delete()
    .eq("delivery_note_id", id);
  if (deleteLinesError) throw deleteLinesError;

  const { data: lines, error: linesError } = await supabase
    .from("delivery_note_lines")
    .insert(
      lineRows.map((line) => ({
        delivery_note_id: id,
        ...line,
      })),
    )
    .select(LINE_SELECT);
  if (linesError) throw linesError;

  return {
    ...(note as DeliveryNote),
    supplier_name: supplier.name,
    lines: (lines ?? []) as DeliveryNoteLine[],
  };
}

export async function deleteDeliveryNote(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const existing = await getDeliveryNote(supabase, id);
  if (!existing) {
    throw new Error("Delivery note not found.");
  }

  const { error } = await supabase.from("delivery_notes").delete().eq("id", id);
  if (error) throw error;
}

export async function getSupplierForDeliveryNote(
  supabase: SupabaseClient,
  supplierId: string | null,
): Promise<Supplier | null> {
  if (!supplierId) return null;
  const { data, error } = await supabase
    .from("suppliers")
    .select(
      "id, name, lead_time_days, contact, address, pic_name, pic_email, pic_phone, " +
        "payment_terms, lead_time_note, delivery_time, packaging_notes, " +
        "beneficiary_name, beneficiary_account_number, swift_code, beneficiary_country, " +
        "beneficiary_address, beneficiary_bank, beneficiary_bank_address, bank_code, branch_code, notes",
    )
    .eq("id", supplierId)
    .maybeSingle();
  if (error) throw error;
  return data as Supplier | null;
}
