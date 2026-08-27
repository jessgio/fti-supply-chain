import { timingSafeEqual, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DeliveryNote,
  DeliveryNoteLine,
  DeliveryNotePortal,
  DeliveryNoteSettings,
  SecondaryPackagingInboundCosmax,
  Supplier,
} from "@/types/database";
import {
  DELIVERY_NOTE_PORTAL_ID,
  DELIVERY_NOTE_SETTINGS_ID,
  DELIVERY_NOTE_SUPPLIER_NAME,
} from "@/lib/delivery-note/constants";
import {
  createPackagingCatalogItem,
  importPackagingCatalogRows,
  listPackagingCatalogItems,
  updatePackagingCatalogItem,
  type CreatePackagingCatalogItemInput,
  type PackagingCatalogImportResult as SharedPackagingCatalogImportResult,
  type PackagingCatalogImportRow as SharedPackagingCatalogImportRow,
  type UpdatePackagingCatalogItemInput,
} from "@/lib/packaging-dn/catalog";
import { generatePackagingDnNumber } from "@/lib/packaging-dn/dn-number";
import { listOpenPosForPackagingDn } from "@/lib/packaging-dn/open-pos";
import {
  getPackagingDnSettings,
  updatePackagingDnSettings,
  type UpdatePackagingDnSettingsInput,
} from "@/lib/packaging-dn/settings";
import { validatePackagingDnPoAndLines } from "@/lib/packaging-dn/validate-lines";

export { listOpenPosForPackagingDn as listOpenPosForDeliveryNote };

const CATALOG_TABLE = "secondary_packaging_inbound_cosmax" as const;

const NOTE_SELECT =
  "id, dn_number, po_id, po_number, supplier_id, delivery_date, recipient_name, created_at";

const LINE_SELECT =
  "id, delivery_note_id, packaging_item_id, item_code, product_name, cartons, pcs_per_carton, total_pcs";

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
  po: { id: string; po_number: string; status: string };
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
  return getPackagingDnSettings(
    supabase,
    "delivery_note_settings",
    DELIVERY_NOTE_SETTINGS_ID,
  ) as Promise<DeliveryNoteSettings>;
}

export type UpdateDeliveryNoteSettingsInput = UpdatePackagingDnSettingsInput;

export async function updateDeliveryNoteSettings(
  supabase: SupabaseClient,
  input: UpdateDeliveryNoteSettingsInput,
): Promise<DeliveryNoteSettings> {
  return updatePackagingDnSettings(
    supabase,
    "delivery_note_settings",
    DELIVERY_NOTE_SETTINGS_ID,
    input,
  ) as Promise<DeliveryNoteSettings>;
}

export type CreatePackagingItemInput = CreatePackagingCatalogItemInput;
export type UpdatePackagingItemInput = UpdatePackagingCatalogItemInput;
export type PackagingCatalogImportRow = SharedPackagingCatalogImportRow;
export type PackagingCatalogImportResult = SharedPackagingCatalogImportResult;

export async function createPackagingItem(
  supabase: SupabaseClient,
  input: CreatePackagingItemInput,
): Promise<SecondaryPackagingInboundCosmax> {
  return createPackagingCatalogItem(
    supabase,
    CATALOG_TABLE,
    input,
  ) as Promise<SecondaryPackagingInboundCosmax>;
}

export async function updatePackagingItem(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePackagingItemInput,
): Promise<SecondaryPackagingInboundCosmax> {
  return updatePackagingCatalogItem(
    supabase,
    CATALOG_TABLE,
    id,
    input,
  ) as Promise<SecondaryPackagingInboundCosmax>;
}

export async function importPackagingCatalog(
  supabase: SupabaseClient,
  rows: PackagingCatalogImportRow[],
): Promise<PackagingCatalogImportResult> {
  return importPackagingCatalogRows(supabase, CATALOG_TABLE, rows);
}

export async function listPackagingItems(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<SecondaryPackagingInboundCosmax[]> {
  return listPackagingCatalogItems(
    supabase,
    CATALOG_TABLE,
    activeOnly,
  ) as Promise<SecondaryPackagingInboundCosmax[]>;
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

export async function listDeliveryNotes(
  supabase: SupabaseClient,
): Promise<DeliveryNote[]> {
  const { data, error } = await supabase
    .from("delivery_notes")
    .select(`${NOTE_SELECT}, suppliers(name)`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const notes = (data ?? []).map((row) => {
    const suppliers = row.suppliers as { name: string } | { name: string }[] | null;
    const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
    const { suppliers: _s, ...note } = row;
    return {
      ...(note as DeliveryNote),
      supplier_name: supplier?.name ?? null,
    };
  });

  return attachDeliveryNoteLines(supabase, notes);
}

async function attachDeliveryNoteLines(
  supabase: SupabaseClient,
  notes: DeliveryNote[],
): Promise<DeliveryNote[]> {
  if (notes.length === 0) return notes;

  const { data: lines, error } = await supabase
    .from("delivery_note_lines")
    .select(LINE_SELECT)
    .in(
      "delivery_note_id",
      notes.map((note) => note.id),
    )
    .order("item_code");
  if (error) throw error;

  const linesByNote = new Map<string, DeliveryNoteLine[]>();
  for (const line of (lines ?? []) as DeliveryNoteLine[]) {
    const list = linesByNote.get(line.delivery_note_id) ?? [];
    list.push(line);
    linesByNote.set(line.delivery_note_id, list);
  }

  return notes.map((note) => ({
    ...note,
    lines: linesByNote.get(note.id) ?? [],
  }));
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

  const { po, lineRows } = await validatePackagingDnPoAndLines(
    supabase,
    CATALOG_TABLE,
    input,
    options,
  );

  return { supplier, po, lineRows };
}

export async function createDeliveryNote(
  supabase: SupabaseClient,
  input: CreateDeliveryNoteInput,
): Promise<DeliveryNote> {
  const { supplier, po, lineRows } = await validateDeliveryNoteInput(supabase, input);

  const dnNumber = generatePackagingDnNumber("DN");
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
