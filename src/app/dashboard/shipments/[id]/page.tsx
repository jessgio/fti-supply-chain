"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ShipmentDetailView } from "@/components/shipments/shipment-detail-view";
import { shipmentReturnLabel, parseShipmentReturnTo } from "@/lib/shipments/shipment-navigation";

export default function ShipmentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-stone-500">Loading…</div>}>
      <ShipmentPageInner />
    </Suspense>
  );
}

function ShipmentPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const shipmentId = params.id as string;
  const returnTo = parseShipmentReturnTo(searchParams.get("returnTo"));

  return (
    <ShipmentDetailView
      shipmentId={shipmentId}
      backHref={returnTo ?? "/dashboard/shipments"}
      backLabel={
        returnTo ? shipmentReturnLabel(returnTo) : "Back to shipments"
      }
    />
  );
}
