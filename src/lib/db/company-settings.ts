import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanySettings } from "@/types/database";

export const COMPANY_ASSETS_BUCKET = "company-assets";
export const COMPANY_LOGO_PREFIX = "company-settings/logo";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

const SELECT =
  "id, company_name, address, pic_name, pic_email, pic_phone, logo_path, updated_at";

export async function getCompanySettings(
  supabase: SupabaseClient,
): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from("company_settings")
    .select(SELECT)
    .eq("id", SETTINGS_ID)
    .single();
  if (error) throw error;
  return data as CompanySettings;
}

export interface UpdateCompanySettingsInput {
  company_name?: string;
  address?: string | null;
  pic_name?: string | null;
  pic_email?: string | null;
  pic_phone?: string | null;
  logo_path?: string | null;
}

export async function updateCompanySettings(
  supabase: SupabaseClient,
  input: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.company_name !== undefined) patch.company_name = input.company_name;
  if (input.address !== undefined) patch.address = input.address;
  if (input.pic_name !== undefined) patch.pic_name = input.pic_name;
  if (input.pic_email !== undefined) patch.pic_email = input.pic_email;
  if (input.pic_phone !== undefined) patch.pic_phone = input.pic_phone;
  if (input.logo_path !== undefined) patch.logo_path = input.logo_path;

  const { data, error } = await supabase
    .from("company_settings")
    .update(patch)
    .eq("id", SETTINGS_ID)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as CompanySettings;
}

export async function downloadCompanyLogo(
  supabase: SupabaseClient,
  logoPath: string,
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage
    .from(COMPANY_ASSETS_BUCKET)
    .download(logoPath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function removeCompanyLogoFiles(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove(paths);
}
