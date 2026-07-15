"use client";

import { PackagingDnCatalogPage } from "@/components/packaging-dn/packaging-dn-catalog-page";

export default function PrimaryPackagingCatalogPage() {
  return (
    <PackagingDnCatalogPage
      module="primary"
      title="Primary Packaging Inbound Catalog"
      description="Manage the 12-digit item codes and product names used on primary packaging delivery notes."
      listUrl="/api/primary-packaging-delivery-notes/catalog?all=true"
      createUrl="/api/primary-packaging-delivery-notes/catalog"
      itemUrl={(id) => `/api/primary-packaging-delivery-notes/catalog/${id}`}
      importUrl="/api/primary-packaging-delivery-notes/catalog/import"
    />
  );
}
