import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ExtractInboundDnWorkspace } from "@/components/extract-inbound-delivery-note/extract-inbound-dn-workspace";
import { PageShell } from "@/components/dashboard/page-shell";

export const metadata = {
  title: "Edit Extract Delivery Note | From This Island",
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
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Edit Extract Inbound Delivery Note
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Update an existing extract delivery note and regenerate the PDF.
          </p>
        </div>

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
