import { NextResponse } from "next/server";
import { requireWriteRole } from "@/lib/auth";
import {
  AP_EXTRA_FILE_MAX_BYTES,
  apShipmentExtraStoragePrefix,
} from "@/lib/lark/ap-form";
import { getShipment } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 200);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
    const fileSize = Number(body.fileSize);
    if (!fileName) {
      return NextResponse.json({ error: "File name is required." }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }
    if (fileSize > AP_EXTRA_FILE_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File too large: ${fileName} (max ${Math.floor(AP_EXTRA_FILE_MAX_BYTES / (1024 * 1024))} MB each)`,
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const shipment = await getShipment(supabase, id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    const storagePath = `${apShipmentExtraStoragePrefix(id)}${Date.now()}-${sanitizeFileName(fileName)}`;
    const { data, error } = await supabase.storage
      .from("data-uploads")
      .createSignedUploadUrl(storagePath);
    if (error) throw error;

    return NextResponse.json({ path: data.path, token: data.token });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
