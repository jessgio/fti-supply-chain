import Link from "next/link";
import { ArrowLeft, FileText, Settings, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DeliveryNoteModule = "extract" | "primary" | "secondary";

const MODULE_PATHS: Record<
  DeliveryNoteModule,
  { notes: string; catalog: string; settings: string; label: string }
> = {
  extract: {
    notes: "/dashboard/extract-inbound-delivery-notes",
    catalog: "/dashboard/extract-inbound-delivery-notes/codes",
    settings: "/dashboard/extract-inbound-delivery-notes/settings",
    label: "Extract Inbound",
  },
  primary: {
    notes: "/dashboard/primary-packaging-delivery-notes",
    catalog: "/dashboard/primary-packaging-delivery-notes/catalog",
    settings: "/dashboard/primary-packaging-delivery-notes/settings",
    label: "Primary Packaging Inbound",
  },
  secondary: {
    notes: "/dashboard/delivery-notes",
    catalog: "/dashboard/delivery-notes/catalog",
    settings: "/dashboard/delivery-notes/settings",
    label: "Secondary Packaging Inbound",
  },
};

interface DeliveryNoteModuleHeaderProps {
  module: DeliveryNoteModule;
  title: string;
  description: string;
  /** Which page this header sits on — controls which actions are shown. */
  page: "notes" | "catalog" | "settings" | "edit";
}

export function DeliveryNoteModuleHeader({
  module,
  title,
  description,
  page,
}: DeliveryNoteModuleHeaderProps) {
  const paths = MODULE_PATHS[module];

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {page === "settings" && (
          <Link
            href={paths.catalog}
            className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {paths.label} Catalog
          </Link>
        )}
        {page === "edit" && (
          <Link
            href={paths.notes}
            className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {paths.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        <p className="mt-1 text-sm text-stone-600">{description}</p>
      </div>

      {(page === "notes" || page === "catalog") && (
        <div className="flex flex-wrap gap-2">
          {page === "catalog" && (
            <Link href={paths.notes}>
              <Button type="button" variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Delivery notes
              </Button>
            </Link>
          )}
          {page === "notes" && (
            <Link href={paths.catalog}>
              <Button type="button" variant="outline" size="sm">
                <Boxes className="mr-2 h-4 w-4" />
                Catalog
              </Button>
            </Link>
          )}
          <Link href={paths.settings}>
            <Button type="button" variant="outline" size="sm">
              <Settings className="mr-2 h-4 w-4" />
              Recipient settings
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
