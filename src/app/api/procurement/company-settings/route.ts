import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCompanySettings,
  updateCompanySettings,
} from "@/lib/db/company-settings";
import { errorMessage } from "@/lib/errors";
import { requireWriteRole } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const settings = await getCompanySettings(supabase);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    if (body?.company_name !== undefined && !String(body.company_name).trim()) {
      return NextResponse.json(
        { error: "Company name is required." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const settings = await updateCompanySettings(supabase, {
      company_name:
        body?.company_name !== undefined
          ? String(body.company_name).trim()
          : undefined,
      address: body?.address ?? undefined,
      pic_name: body?.pic_name ?? undefined,
      pic_email: body?.pic_email ?? undefined,
      pic_phone: body?.pic_phone ?? undefined,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
