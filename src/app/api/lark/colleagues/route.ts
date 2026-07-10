import { NextResponse } from "next/server";
import { requireReadRole, getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type DirectoryRow = {
  email: string;
  lark_open_id: string;
  display_name: string;
  is_default_approver: boolean;
};

function emailRank(email: string): number {
  const lower = email.toLowerCase();
  if (lower.endsWith("@fromthisisland.com")) return 0;
  if (lower.endsWith("@aerisbeaute.com")) return 1;
  return 2;
}

/** One row per open_id; prefer FTI email, then named display, then default flag. */
function dedupeByOpenId(rows: DirectoryRow[]): DirectoryRow[] {
  const byOpenId = new Map<string, DirectoryRow>();

  for (const row of rows) {
    const openId = row.lark_open_id?.trim();
    if (!openId) continue;

    const existing = byOpenId.get(openId);
    if (!existing) {
      byOpenId.set(openId, {
        ...row,
        is_default_approver: !!row.is_default_approver,
      });
      continue;
    }

    const mergedDefault =
      existing.is_default_approver || !!row.is_default_approver;

    const preferNew =
      emailRank(row.email) < emailRank(existing.email) ||
      (emailRank(row.email) === emailRank(existing.email) &&
        !existing.display_name?.trim() &&
        !!row.display_name?.trim());

    if (preferNew) {
      byOpenId.set(openId, {
        ...row,
        is_default_approver: mergedDefault,
      });
    } else {
      byOpenId.set(openId, {
        ...existing,
        is_default_approver: mergedDefault,
      });
    }
  }

  return [...byOpenId.values()].sort((a, b) => {
    const nameA = (a.display_name || a.email).toLowerCase();
    const nameB = (b.display_name || b.email).toLowerCase();
    return nameA.localeCompare(nameB) || a.email.localeCompare(b.email);
  });
}

function envDefaultOpenIds(): string[] {
  const fromList = (process.env.LARK_DEFAULT_APPROVER_OPEN_IDS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^ou_[a-zA-Z0-9]+$/.test(s));
  const single = process.env.LARK_DEFAULT_APPROVER_OPEN_ID?.trim() ?? "";
  if (single && /^ou_[a-zA-Z0-9]+$/.test(single)) {
    fromList.push(single);
  }
  return [...new Set(fromList)];
}

/**
 * Current user (submitter) + deduped Lark directory for approver multi-select.
 */
export async function GET() {
  const denied = await requireReadRole();
  if (denied) return denied;

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const myEmail = (profile.email ?? "").toLowerCase();

  const { data: myMapping } = myEmail
    ? await supabase
        .from("lark_user_directory")
        .select("lark_open_id, display_name")
        .eq("email", myEmail)
        .maybeSingle()
    : { data: null };

  const { data: directory, error } = await supabase
    .from("lark_user_directory")
    .select("email, lark_open_id, display_name, is_default_approver")
    .order("display_name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deduped = dedupeByOpenId((directory ?? []) as DirectoryRow[]);
  const envDefaults = envDefaultOpenIds();

  const colleagues = deduped.map((row) => ({
    id: row.lark_open_id,
    email: row.email,
    full_name: row.display_name || null,
    lark_open_id: row.lark_open_id,
    is_default_approver:
      row.is_default_approver || envDefaults.includes(row.lark_open_id),
  }));

  const defaultApproverOpenIds = [
    ...new Set(
      colleagues
        .filter((c) => c.is_default_approver && c.lark_open_id)
        .map((c) => c.lark_open_id),
    ),
  ];

  return NextResponse.json({
    me: {
      id: profile.id,
      email: profile.email,
      full_name: myMapping?.display_name || profile.fullName,
      lark_open_id: myMapping?.lark_open_id ?? null,
    },
    colleagues,
    defaultApproverOpenIds,
  });
}
