import { NextResponse } from "next/server";
import {
  canManageLarkUsers,
  getCurrentProfile,
  requireWriteRole,
} from "@/lib/auth";
import {
  isLarkDirectoryEmail,
  LARK_DIRECTORY_EMAIL_DOMAINS,
} from "@/lib/lark/ap-form";
import { listAllContactUsers } from "@/lib/lark/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";

export const runtime = "nodejs";

function pickEmail(user: {
  email?: string | null;
  enterprise_email?: string | null;
}): string | null {
  const candidates = [user.email, user.enterprise_email]
    .map((e) => e?.trim().toLowerCase())
    .filter((e): e is string => !!e);

  const preferred = candidates.find((e) =>
    e.endsWith("@fromthisisland.com"),
  );
  if (preferred) return preferred;

  const allowed = candidates.find((e) => isLarkDirectoryEmail(e));
  return allowed ?? null;
}

function isActiveUser(user: {
  status?: {
    is_resigned?: boolean;
    is_activated?: boolean;
    is_exited?: boolean;
    is_unjoin?: boolean;
  };
}): boolean {
  const s = user.status;
  if (!s) return true;
  if (s.is_resigned || s.is_exited || s.is_unjoin) return false;
  if (s.is_activated === false) return false;
  return true;
}

/** Pull Lark contacts and upsert allowed emails → open_id into the directory. */
export async function POST() {
  const denied = await requireWriteRole();
  if (denied) return denied;

  const profile = await getCurrentProfile();
  if (!profile || !canManageLarkUsers(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  try {
    const contacts = await listAllContactUsers();
    let scanned = 0;
    let matched = 0;
    let upserted = 0;
    let skippedNoEmail = 0;
    const skippedSamples: string[] = [];
    const errors: string[] = [];

    for (const contact of contacts) {
      scanned++;
      if (!isActiveUser(contact)) continue;
      if (!contact.open_id?.startsWith("ou_")) continue;

      const email = pickEmail(contact);
      if (!email) {
        skippedNoEmail++;
        if (skippedSamples.length < 5) {
          const raw = [contact.email, contact.enterprise_email]
            .filter(Boolean)
            .join(" / ");
          skippedSamples.push(
            `${contact.name || "unknown"} (${contact.open_id})${raw ? ` emails=${raw}` : " (no email fields)"}`,
          );
        }
        continue;
      }
      matched++;

      const { error } = await supabase.from("lark_user_directory").upsert(
        {
          email,
          lark_open_id: contact.open_id,
          display_name: contact.name?.trim() || "",
        },
        { onConflict: "email" },
      );

      if (error) {
        errors.push(`${email}: ${error.message}`);
      } else {
        upserted++;
      }
    }

    return NextResponse.json({
      scanned,
      matched,
      upserted,
      skippedNoEmail,
      allowedDomains: LARK_DIRECTORY_EMAIL_DOMAINS,
      skippedSamples,
      errors: errors.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json(
      { error: errorMessage(err) || "Lark sync failed" },
      { status: 502 },
    );
  }
}
