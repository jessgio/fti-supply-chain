import { UploadCard } from "@/components/dashboard/upload-card";
import { stockAggregateLocationsLabel } from "@/lib/stock/locations";

export default function UploadsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Data uploads</h1>
        <p className="mt-1 text-stone-600">
          Import franchise mappings first, then sales and stock snapshots from
          Excel.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <UploadCard
          title="Franchise & bundle mappings"
          description="Upload FTI Product Franchises.xlsx first, then FTI Bundles and Components.xlsx. Or upload the combined bundles file (includes both sheets)."
          endpoint="/api/upload/mappings"
        />
        <UploadCard
          title="Sales transactions"
          description="Upload FTI Sales.xlsx (WMS) for the last 3 months (current month plus the two prior). Older sales are kept; overlapping dates in the file replace existing records. FAKTUR rows only; CANCELED orders are excluded."
          endpoint="/api/upload/sales"
        />
        <UploadCard
          title="Stock levels"
          description={`Upload your WMS export (FTI Stock.xlsx): sheet Data1 with SKU, Lokasi, and Tersedia (not QTY). Negative Tersedia is kept — it reflects on-order qty, not available stock. Only ${stockAggregateLocationsLabel()} are imported. Archived rows are skipped; snapshot date = upload day.`}
          endpoint="/api/upload/stock"
        />
      </div>
    </div>
  );
}
