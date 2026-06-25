import { NextResponse } from "next/server";
import { getCurrentProfile, requireSupplyChainAccess } from "@/lib/auth";
import {
  deleteFormulaTrackerBriefFile,
  getFormulaTrackerEntry,
  uploadFormulaTrackerBriefFile,
} from "@/lib/db/formula-tracker";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const profile = await getCurrentProfile();
    const { id: entryId } = await context.params;
    const entry = await getFormulaTrackerEntry(createAdminClient(), entryId);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData
      .getAll("file")
      .filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const uploaded = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `${file.name} exceeds 50 MB limit.` },
          { status: 400 },
        );
      }

      const safeName = sanitizeFileName(file.name);
      const storagePath = `product-development/${entry.project_id}/formula-tracker/${entryId}/${Date.now()}-${safeName}`;

      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("data-uploads")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const record = await uploadFormulaTrackerBriefFile(supabase, {
        project_id: entry.project_id,
        entry_id: entryId,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        uploaded_by: profile?.id ?? null,
      });
      uploaded.push(record);
    }

    return NextResponse.json({ files: uploaded }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("file_id");
    if (!fileId) {
      return NextResponse.json({ error: "file_id is required." }, { status: 400 });
    }

    await deleteFormulaTrackerBriefFile(createAdminClient(), fileId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
