"use client";

import { PackagingDnSettingsPage } from "@/components/packaging-dn/packaging-dn-settings-page";

export default function DeliveryNoteSettingsPage() {
  return (
    <PackagingDnSettingsPage
      module="secondary"
      description="SHIP TO details for secondary packaging delivery note PDFs. The form's Penerima field overrides the recipient name per submission."
      cardDescription="Default Cosmax distribution center information for delivery note PDFs."
      picPlaceholder="Used when no Penerima is set on the form"
      settingsUrl="/api/delivery-notes/settings"
    />
  );
}
