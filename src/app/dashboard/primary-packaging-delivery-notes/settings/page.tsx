"use client";

import { PackagingDnSettingsPage } from "@/components/packaging-dn/packaging-dn-settings-page";

export default function PrimaryPackagingDnSettingsPage() {
  return (
    <PackagingDnSettingsPage
      module="primary"
      description="SHIP TO details for primary packaging delivery note PDFs (Cosmax CDC)."
      cardDescription="Default recipient block on the PDF. The form's Penerima field overrides the recipient name per delivery note."
      settingsUrl="/api/primary-packaging-delivery-notes/settings"
    />
  );
}
