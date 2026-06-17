import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import { getExtractDetail } from "@/lib/db/extracts";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import {
  EXTRACT_CATEGORIES,
} from "@/lib/extracts/categories";
import type {
  ExtractCategory,
  ExtractTxnSortKey,
} from "@/types/database";

const TXN_SORT_KEYS: ExtractTxnSortKey[] = [
  "txn_date",
  "order_no",
  "from_to",
  "category",
  "received",
  "issued",
  "balance",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sortParam = searchParams.get("sort");
    const categoryParam = searchParams.get("category");

    const detail = await getExtractDetail(createAdminClient(), id, {
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      category:
        categoryParam && EXTRACT_CATEGORIES.includes(categoryParam as ExtractCategory)
          ? (categoryParam as ExtractCategory)
          : undefined,
      search: searchParams.get("search") ?? undefined,
      sort:
        sortParam && TXN_SORT_KEYS.includes(sortParam as ExtractTxnSortKey)
          ? (sortParam as ExtractTxnSortKey)
          : undefined,
      sortDir: searchParams.get("sort_dir") === "desc" ? "desc" : "asc",
    });

    if (!detail) {
      return NextResponse.json({ error: "Extract not found" }, { status: 404 });
    }

    return NextResponse.json({ detail });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const { error } = await createAdminClient()
      .from("extracts")
      .delete()
      .eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
