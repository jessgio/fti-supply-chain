import { NextResponse } from "next/server";
import {
  getCurrentProfile,
  requireCommercialWrite,
} from "@/lib/auth";
import { isSopGroup, upsertMonthlyTargets } from "@/lib/db/sales-forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import { parseNumericInput } from "@/lib/utils";

export async function PUT(request: Request) {
  try {
    const denied = await requireCommercialWrite();
    if (denied) return denied;
    const profile = await getCurrentProfile();

    const body = await request.json();
    const year = Number(body.year);
    const group = String(body.group ?? "");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year." }, { status: 400 });
    }
    if (!isSopGroup(group)) {
      return NextResponse.json(
        { error: "group must be online or offline." },
        { status: 400 },
      );
    }
    if (year < new Date().getFullYear()) {
      return NextResponse.json(
        { error: "Past years are read-only." },
        { status: 400 },
      );
    }

    const rawTargets: unknown[] = Array.isArray(body.targets) ? body.targets : [];
    const targets = rawTargets.map((row) => {
      const item = row as {
        month?: number;
        target_net_sales_post_tax?: number | string;
      };
      return {
        month: Number(item.month),
        target_net_sales_post_tax: parseNumericInput(
          item.target_net_sales_post_tax,
        ),
      };
    });
    const supabase = createAdminClient();
    await upsertMonthlyTargets(supabase, {
      year,
      group,
      targets,
      userId: profile?.id ?? null,
    });
    return NextResponse.json({ ok: true, year, group, targets });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
