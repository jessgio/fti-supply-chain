"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PrimaryPackagingDnWorkspace } from "@/components/primary-packaging-delivery-note/primary-packaging-dn-workspace";
import { DeliveryNoteModuleHeader } from "@/components/delivery-note/delivery-note-module-header";
import { PageShell } from "@/components/dashboard/page-shell";

export default function PrimaryPackagingDeliveryNotesPage() {
  return (
    <PageShell className="max-w-4xl">
      <div className="flex flex-col gap-6">
        <DeliveryNoteModuleHeader
          module="primary"
          page="notes"
          title="Primary Packaging Inbound"
          description="Delivery notes for shipping primary packaging to Cosmax."
        />

        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center text-stone-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading…
            </div>
          }
        >
          <PrimaryPackagingDnWorkspace />
        </Suspense>
      </div>
    </PageShell>
  );
}
