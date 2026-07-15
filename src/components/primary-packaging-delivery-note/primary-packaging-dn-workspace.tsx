"use client";

import { useSearchParams } from "next/navigation";
import { PackagingDnWorkspace } from "@/components/packaging-dn/packaging-dn-workspace";

interface PrimaryPackagingDnWorkspaceProps {
  initialEditNoteId?: string;
  returnTo?: string;
}

const PRIMARY_API = {
  bootstrapUrl: "/api/primary-packaging-delivery-notes/bootstrap",
  notesUrl: "/api/primary-packaging-delivery-notes",
  noteUrl: (id: string) => `/api/primary-packaging-delivery-notes/${id}`,
  pdfUrl: (id: string) => `/api/primary-packaging-delivery-notes/${id}/pdf`,
};

const PRIMARY_LABELS = {
  loadingMessage: "Loading primary packaging delivery note form…",
  emptyBootstrapMessage: "Failed to load form data.",
  formTitleNew: "New Primary Packaging Inbound",
  formTitleEdit: "Edit Primary Packaging Inbound",
  formDescription:
    "Ship primary packaging to Cosmax. Select the related PO, choose items from the catalog, and generate a PDF for signing.",
  lineItemsDescription:
    "Search by item code or product name. Cartons × pcs/carton = total pcs.",
  historyDescription:
    "Previously created primary packaging delivery notes. Edit, delete, or download the PDF as needed.",
  catalogHref: "/dashboard/primary-packaging-delivery-notes/catalog",
  catalogLinkLabel: "Upload the primary packaging catalog",
};

export function PrimaryPackagingDnWorkspace({
  initialEditNoteId,
  returnTo,
}: PrimaryPackagingDnWorkspaceProps = {}) {
  const searchParams = useSearchParams();
  const preselectedPoId = searchParams.get("po") ?? "";

  return (
    <PackagingDnWorkspace
      api={PRIMARY_API}
      labels={PRIMARY_LABELS}
      initialEditNoteId={initialEditNoteId}
      returnTo={returnTo}
      preselectedPoId={preselectedPoId}
      linkPosInHistory
    />
  );
}
