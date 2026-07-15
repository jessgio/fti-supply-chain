"use client";

import { PackagingDnWorkspace } from "@/components/packaging-dn/packaging-dn-workspace";

interface DeliveryNoteWorkspaceProps {
  token: string;
  initialEditNoteId?: string;
  returnTo?: string;
}

export function DeliveryNoteWorkspace({
  token,
  initialEditNoteId,
  returnTo,
}: DeliveryNoteWorkspaceProps) {
  return (
    <PackagingDnWorkspace
      api={{
        bootstrapUrl: `/api/delivery-note/${token}/bootstrap`,
        notesUrl: `/api/delivery-note/${token}/notes`,
        noteUrl: (id) => `/api/delivery-note/${token}/notes/${id}`,
        pdfUrl: (id) => `/api/delivery-note/${token}/notes/${id}/pdf`,
      }}
      labels={{
        loadingMessage: "Loading delivery note form…",
        emptyBootstrapMessage: "This delivery note link is invalid.",
        formTitleNew: "Shipment details",
        formTitleEdit: "Edit shipment details",
        formDescription:
          "Search or select an open packaging or filling PO, set the delivery date, and name the recipient (Penerima).",
        lineItemsDescription:
          "Search secondary packaging items by 12-digit code or product name. Cartons × pcs/carton = total pcs.",
        historyDescription:
          "Previously submitted delivery notes. Edit, delete, or download the PDF as needed.",
      }}
      initialEditNoteId={initialEditNoteId}
      returnTo={returnTo}
      showPortalTitle
    />
  );
}
