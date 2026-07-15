import type { SupabaseClient } from "@supabase/supabase-js";

export type PackagingDnSettingsTable =
  | "delivery_note_settings"
  | "primary_packaging_dn_settings";

export const PACKAGING_DN_SETTINGS_SELECT =
  "id, recipient_company, recipient_address, recipient_pic_name, recipient_phone, recipient_email, updated_at";

export interface PackagingDnSettingsRow {
  id: string;
  recipient_company: string;
  recipient_address: string;
  recipient_pic_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  updated_at: string;
}

export interface UpdatePackagingDnSettingsInput {
  recipient_company?: string;
  recipient_address?: string;
  recipient_pic_name?: string | null;
  recipient_phone?: string | null;
  recipient_email?: string | null;
}

export function buildPackagingDnSettingsPatch(
  input: UpdatePackagingDnSettingsInput,
): Record<string, unknown> {
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
  return patch;
}

/** Returns an error message if company/address are present but blank. */
export function packagingDnSettingsPatchError(body: {
  recipient_company?: unknown;
  recipient_address?: unknown;
} | null | undefined): string | null {
  if (body?.recipient_company !== undefined && !String(body.recipient_company).trim()) {
    return "Recipient company is required.";
  }
  if (body?.recipient_address !== undefined && !String(body.recipient_address).trim()) {
    return "Recipient address is required.";
  }
  return null;
}

export async function getPackagingDnSettings(
  supabase: SupabaseClient,
  table: PackagingDnSettingsTable,
  settingsId: string,
): Promise<PackagingDnSettingsRow> {
  const { data, error } = await supabase
    .from(table)
    .select(PACKAGING_DN_SETTINGS_SELECT)
    .eq("id", settingsId)
    .single();
  if (error) throw error;
  return data as PackagingDnSettingsRow;
}

export async function updatePackagingDnSettings(
  supabase: SupabaseClient,
  table: PackagingDnSettingsTable,
  settingsId: string,
  input: UpdatePackagingDnSettingsInput,
): Promise<PackagingDnSettingsRow> {
  const { data, error } = await supabase
    .from(table)
    .update(buildPackagingDnSettingsPatch(input))
    .eq("id", settingsId)
    .select(PACKAGING_DN_SETTINGS_SELECT)
    .single();
  if (error) throw error;
  return data as PackagingDnSettingsRow;
}
