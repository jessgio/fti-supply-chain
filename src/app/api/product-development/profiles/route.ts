import { NextResponse } from "next/server";
import { listProfiles } from "@/lib/db/product-development";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const profiles = await listProfiles(createAdminClient());
    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
