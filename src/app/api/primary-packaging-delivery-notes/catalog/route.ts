import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPrimaryPackagingItem,
  listPrimaryPackagingItems,
} from "@/lib/db/primary-packaging-delivery-notes";
import { requireReadRole, requireWriteRole } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    const supabase = createAdminClient();
    const items = await listPrimaryPackagingItems(supabase, !all);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const supabase = createAdminClient();
    const item = await createPrimaryPackagingItem(supabase, {
      item_code: String(body.item_code ?? ""),
      product_name: String(body.product_name ?? ""),
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
