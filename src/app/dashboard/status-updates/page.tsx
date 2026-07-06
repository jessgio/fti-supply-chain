import { Suspense } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { StatusUpdatesFeed } from "@/components/status-updates/status-updates-feed";

export default async function StatusUpdatesPage() {
  const profile = await getCurrentProfile();
  return (
    <Suspense fallback={<p className="p-8 text-sm text-stone-500">Loading…</p>}>
      <StatusUpdatesFeed
        currentUserId={profile?.id ?? null}
        currentUserRole={profile?.role ?? null}
      />
    </Suspense>
  );
}
