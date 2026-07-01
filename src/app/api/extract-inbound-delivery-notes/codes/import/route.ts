import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { importExtractCodes } from "@/lib/db/extract-inbound-delivery-notes";
import { parseExtractCodesFile } from "@/lib/extract-inbound-delivery-note/parse-extract-codes";
import { requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing CSV file." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseExtractCodesFile(buffer);

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            parsed.errors[0]?.message ??
            'No valid rows found. Use headers "Item No" and "Extract Name".',
          errors: parsed.errors,
        },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const result = await importExtractCodes(supabase, parsed.rows);

    return NextResponse.json({
      ...result,
      errors: parsed.errors,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
