import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupplier, updateSupplier } from "@/lib/db/procurement";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

function nullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const supplier = await getSupplier(supabase, id);
    if (!supplier) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ supplier });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    if (body?.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json(
        { error: "Supplier name is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const supplier = await updateSupplier(supabase, id, {
      name: body?.name !== undefined ? String(body.name).trim() : undefined,
      lead_time_days:
        body?.lead_time_days != null ? Number(body.lead_time_days) : undefined,
      contact: nullableString(body?.contact),
      address: nullableString(body?.address),
      pic_name: nullableString(body?.pic_name),
      pic_email: nullableString(body?.pic_email),
      pic_phone: nullableString(body?.pic_phone),
      payment_terms: nullableString(body?.payment_terms),
      lead_time_note: nullableString(body?.lead_time_note),
      delivery_time: nullableString(body?.delivery_time),
      packaging_notes: nullableString(body?.packaging_notes),
      beneficiary_name: nullableString(body?.beneficiary_name),
      beneficiary_account_number: nullableString(body?.beneficiary_account_number),
      swift_code: nullableString(body?.swift_code),
      beneficiary_country: nullableString(body?.beneficiary_country),
      beneficiary_address: nullableString(body?.beneficiary_address),
      beneficiary_bank: nullableString(body?.beneficiary_bank),
      beneficiary_bank_address: nullableString(body?.beneficiary_bank_address),
      bank_code: nullableString(body?.bank_code),
      branch_code: nullableString(body?.branch_code),
      notes: nullableString(body?.notes),
    });
    return NextResponse.json({ supplier });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
