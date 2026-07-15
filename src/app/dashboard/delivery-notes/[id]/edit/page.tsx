import { createAdminClient } from "@/lib/supabase/admin";
import { getPortal } from "@/lib/db/delivery-notes";
import { DeliveryNoteWorkspace } from "@/components/delivery-note/delivery-note-workspace";
import { DeliveryNoteModuleHeader } from "@/components/delivery-note/delivery-note-module-header";
import { PageShell } from "@/components/dashboard/page-shell";

export const metadata = {
  title: "Edit Secondary Packaging Inbound | From This Island",
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
      <div className="flex flex-col gap-6">
        <DeliveryNoteModuleHeader
          module="secondary"
          page="edit"
          title="Edit Secondary Packaging Inbound"
          description="Update an existing secondary packaging delivery note and regenerate the PDF."
        />
        <DeliveryNoteWorkspace
          token={portal.access_token}
          initialEditNoteId={id}
          returnTo="/dashboard/delivery-notes"
        />
      </div>
    </PageShell>
  );
}
