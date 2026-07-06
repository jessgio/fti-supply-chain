import { getCurrentProfile } from "@/lib/auth";
import { PoTimelinePageClient } from "./po-timeline-page-client";

export default async function PoTimelinePage() {
  const profile = await getCurrentProfile();
  return (
    <PoTimelinePageClient
      currentUserId={profile?.id ?? null}
      currentUserRole={profile?.role ?? null}
    />
  );
}
