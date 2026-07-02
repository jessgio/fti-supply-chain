"use client";

import { useParams } from "next/navigation";
import { ShipmentDetailView } from "@/components/shipments/shipment-detail-view";

export default function ShipmentPage() {
  const params = useParams();
  const shipmentId = params.id as string;

  return <ShipmentDetailView shipmentId={shipmentId} />;
}
