import { createClient } from "@/lib/supabase/client";

const BUCKET = "data-uploads";

export async function uploadToSignedDataUploads(
  path: string,
  token: string,
  file: File,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw error;
}
