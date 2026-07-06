import { createAdminClient } from "@/lib/supabase/admin";
import { getPortal } from "@/lib/db/delivery-notes";
import { DeliveryNoteWorkspace } from "@/components/delivery-note/delivery-note-workspace";
import { PageShell } from "@/components/dashboard/page-shell";

export const metadata = {
  title: "Edit Delivery Note | From This Island",
};

export default async function EditDeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const portal = await getPortal(supabase);

  return (
    <PageShell className="max-w-5xl">
      <DeliveryNoteWorkspace
        token={portal.access_token}
        initialEditNoteId={id}
        returnTo="/dashboard/delivery-notes"
      />
    </PageShell>
  );
}
