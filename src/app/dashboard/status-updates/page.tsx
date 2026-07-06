import { getCurrentProfile } from "@/lib/auth";
import { StatusUpdatesFeed } from "@/components/status-updates/status-updates-feed";

export default async function StatusUpdatesPage() {
  const profile = await getCurrentProfile();
  return (
    <StatusUpdatesFeed
      currentUserId={profile?.id ?? null}
      currentUserRole={profile?.role ?? null}
    />
  );
}
