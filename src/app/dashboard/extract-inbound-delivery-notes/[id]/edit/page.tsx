import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ExtractInboundDnWorkspace } from "@/components/extract-inbound-delivery-note/extract-inbound-dn-workspace";
import { DeliveryNoteModuleHeader } from "@/components/delivery-note/delivery-note-module-header";
import { PageShell } from "@/components/dashboard/page-shell";

export const metadata = {
  title: "Edit Extract Inbound | From This Island",
};

export default async function EditExtractInboundDeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PageShell className="max-w-4xl">
      <div className="flex flex-col gap-6">
        <DeliveryNoteModuleHeader
          module="extract"
          page="edit"
          title="Edit Extract Inbound"
          description="Update an existing extract delivery note and regenerate the PDF."
        />

        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center text-stone-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          }
        >
          <ExtractInboundDnWorkspace
            initialEditNoteId={id}
            returnTo="/dashboard/extract-inbound-delivery-notes"
          />
        </Suspense>
      </div>
    </PageShell>
  );
}
