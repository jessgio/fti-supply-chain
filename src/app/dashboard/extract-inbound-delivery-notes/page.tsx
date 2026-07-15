"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ExtractInboundDnWorkspace } from "@/components/extract-inbound-delivery-note/extract-inbound-dn-workspace";
import { DeliveryNoteModuleHeader } from "@/components/delivery-note/delivery-note-module-header";
import { PageShell } from "@/components/dashboard/page-shell";

export default function ExtractInboundDeliveryNotesPage() {
  return (
    <PageShell className="max-w-4xl">
      <div className="flex flex-col gap-6">
        <DeliveryNoteModuleHeader
          module="extract"
          page="notes"
          title="Extract Inbound"
          description="Internal delivery notes for shipping extract to the manufacturer."
        />

        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center text-stone-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          }
        >
          <ExtractInboundDnWorkspace />
        </Suspense>
      </div>
    </PageShell>
  );
}
