import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createItemNameMapping,
  loadItemNameMappings,
} from "@/lib/db/extract-mappings";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export async function GET() {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const mappings = await loadItemNameMappings(createAdminClient());
    return NextResponse.json({ mappings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const manufacturer_name = String(body?.manufacturer_name ?? "").trim();
    const item_no = String(body?.item_no ?? "").trim();
    const description =
      body?.description === undefined || body?.description === null
        ? null
        : String(body.description).trim() || null;

    if (!manufacturer_name) {
      return NextResponse.json(
        { error: "Manufacturer item name is required." },
        { status: 400 },
      );
    }
    if (!item_no) {
      return NextResponse.json(
        { error: "Item No is required." },
        { status: 400 },
      );
    }

    const mapping = await createItemNameMapping(createAdminClient(), {
      manufacturer_name,
      item_no,
      description,
    });
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
