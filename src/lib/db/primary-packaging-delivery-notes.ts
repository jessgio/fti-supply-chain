import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PrimaryPackagingDeliveryNote,
  PrimaryPackagingDeliveryNoteLine,
  PrimaryPackagingDnSettings,
  PrimaryPackagingInboundCosmax,
} from "@/types/database";
import { PRIMARY_PACKAGING_DN_SETTINGS_ID } from "@/lib/primary-packaging-delivery-note/constants";
import {
  createPackagingCatalogItem,
  importPackagingCatalogRows,
  listPackagingCatalogItems,
  updatePackagingCatalogItem,
  type CreatePackagingCatalogItemInput,
  type PackagingCatalogImportResult,
  type PackagingCatalogImportRow,
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

export { listOpenPosForPackagingDn as listOpenPosForPrimaryPackaging };

const CATALOG_TABLE = "primary_packaging_inbound_cosmax" as const;

const NOTE_SELECT =
  "id, dn_number, po_id, po_number, delivery_date, recipient_name, created_at";

const LINE_SELECT =
  "id, delivery_note_id, packaging_item_id, item_code, product_name, cartons, pcs_per_carton, total_pcs";

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

async function validateInput(
  supabase: SupabaseClient,
  input: CreatePrimaryPackagingDeliveryNoteInput,
  options: ValidateOptions = {},
) {
  const { po, lineRows } = await validatePackagingDnPoAndLines(
    supabase,
    CATALOG_TABLE,
    input,
    options,
  );
  return {
    po: { id: po.id, po_number: po.po_number },
    lineRows,
  };
}

export async function getPrimaryPackagingDnSettings(
  supabase: SupabaseClient,
): Promise<PrimaryPackagingDnSettings> {
  return getPackagingDnSettings(
    supabase,
    "primary_packaging_dn_settings",
    PRIMARY_PACKAGING_DN_SETTINGS_ID,
  ) as Promise<PrimaryPackagingDnSettings>;
}

export type UpdatePrimaryPackagingDnSettingsInput = UpdatePackagingDnSettingsInput;

export async function updatePrimaryPackagingDnSettings(
  supabase: SupabaseClient,
  input: UpdatePrimaryPackagingDnSettingsInput,
): Promise<PrimaryPackagingDnSettings> {
  return updatePackagingDnSettings(
    supabase,
    "primary_packaging_dn_settings",
    PRIMARY_PACKAGING_DN_SETTINGS_ID,
    input,
  ) as Promise<PrimaryPackagingDnSettings>;
}

export async function listPrimaryPackagingItems(
  supabase: SupabaseClient,
  activeOnly = true,
): Promise<PrimaryPackagingInboundCosmax[]> {
  return listPackagingCatalogItems(
    supabase,
    CATALOG_TABLE,
    activeOnly,
  ) as Promise<PrimaryPackagingInboundCosmax[]>;
}

export type CreatePrimaryPackagingItemInput = CreatePackagingCatalogItemInput;

export async function createPrimaryPackagingItem(
  supabase: SupabaseClient,
  input: CreatePrimaryPackagingItemInput,
): Promise<PrimaryPackagingInboundCosmax> {
  return createPackagingCatalogItem(
    supabase,
    CATALOG_TABLE,
    input,
  ) as Promise<PrimaryPackagingInboundCosmax>;
}

export type UpdatePrimaryPackagingItemInput = UpdatePackagingCatalogItemInput;

export async function updatePrimaryPackagingItem(
  supabase: SupabaseClient,
  id: string,
  input: UpdatePrimaryPackagingItemInput,
): Promise<PrimaryPackagingInboundCosmax> {
  return updatePackagingCatalogItem(
    supabase,
    CATALOG_TABLE,
    id,
    input,
  ) as Promise<PrimaryPackagingInboundCosmax>;
}

export type PrimaryPackagingCatalogImportRow = PackagingCatalogImportRow;
export type PrimaryPackagingCatalogImportResult = PackagingCatalogImportResult;

export async function importPrimaryPackagingCatalog(
  supabase: SupabaseClient,
  rows: PrimaryPackagingCatalogImportRow[],
): Promise<PrimaryPackagingCatalogImportResult> {
  return importPackagingCatalogRows(supabase, CATALOG_TABLE, rows);
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

  const dnNumber = generatePackagingDnNumber("PPDN");
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
