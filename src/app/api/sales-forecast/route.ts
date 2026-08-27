import { NextResponse } from "next/server";
import { requireReadRole } from "@/lib/auth";
import { isSopGroup, loadSopForecast, loadSopYearForecast } from "@/lib/db/sales-forecast";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const denied = await requireReadRole();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    const group = searchParams.get("group");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Invalid year." }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!group || group === "both") {
      const payload = await loadSopYearForecast(supabase, year);
      return NextResponse.json(payload);
    }
    if (!isSopGroup(group)) {
      return NextResponse.json(
        { error: "group must be online, offline, or both." },
        { status: 400 },
      );
    }

    const payload = await loadSopForecast(supabase, year, group);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
