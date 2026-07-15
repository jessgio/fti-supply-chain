import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PrimaryPackagingDnWorkspace } from "@/components/primary-packaging-delivery-note/primary-packaging-dn-workspace";
import { DeliveryNoteModuleHeader } from "@/components/delivery-note/delivery-note-module-header";
import { PageShell } from "@/components/dashboard/page-shell";

export const metadata = {
  title: "Edit Primary Packaging Inbound | From This Island",
};

export default async function EditPrimaryPackagingDeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell className="max-w-4xl">
      <div className="flex flex-col gap-6">
        <DeliveryNoteModuleHeader
          module="primary"
          page="edit"
          title="Edit Primary Packaging Inbound"
          description="Update an existing primary packaging delivery note and regenerate the PDF."
        />

        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center text-stone-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          }
        >
          <PrimaryPackagingDnWorkspace
            initialEditNoteId={id}
            returnTo="/dashboard/primary-packaging-delivery-notes"
          />
        </Suspense>
      </div>
    </PageShell>
  );
}
