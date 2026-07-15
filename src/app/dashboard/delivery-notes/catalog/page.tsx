"use client";

import { PackagingDnCatalogPage } from "@/components/packaging-dn/packaging-dn-catalog-page";

export default function DeliveryNoteCatalogPage() {
  return (
    <PackagingDnCatalogPage
      module="secondary"
      title="Secondary Packaging Inbound Catalog"
      description="Manage the 12-digit item codes and product names used on secondary packaging delivery notes."
      listUrl="/api/delivery-notes/packaging"
      createUrl="/api/delivery-notes/packaging"
      itemUrl={(id) => `/api/delivery-notes/packaging/${id}`}
      importUrl="/api/delivery-notes/packaging/import"
    />
  );
}
