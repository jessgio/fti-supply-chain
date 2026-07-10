import { redirect } from "next/navigation";
import { PageShell } from "@/components/dashboard/page-shell";
import { LarkUserDirectoryManager } from "@/components/lark/lark-user-directory-manager";
import { canManageLarkUsers, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LarkUserDirectoryEntry } from "@/types/database";

export default async function LarkUsersPage() {
  const profile = await getCurrentProfile();
  if (!profile || !canManageLarkUsers(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lark_user_directory")
    .select("*")
    .order("email", { ascending: true });

  if (error) {
    return (
      <PageShell>
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed to load Lark directory: {error.message}
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold text-stone-900">Lark users</h1>
        <p className="text-sm text-stone-600">
          Map @fromthisisland.com / @aerisbeaute.com emails to Lark open_ids.
          Sync from Lark, or edit names inline. Required for submitting POs to
          the Lark AP Form.
        </p>
      </div>
      <LarkUserDirectoryManager
        initialRows={(data ?? []) as LarkUserDirectoryEntry[]}
      />
    </PageShell>
  );
}
