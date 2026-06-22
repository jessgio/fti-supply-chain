import { NextResponse } from "next/server";
import { requireSupplyChainAccess } from "@/lib/auth";
import { suggestShipmentNumber } from "@/lib/db/shipments";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { ShipmentType } from "@/types/database";
import { SHIPMENT_TYPES } from "@/lib/shipments/constants";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const poIds = searchParams.getAll("po_id");
    const shipmentType = searchParams.get("shipment_type") as ShipmentType;
    const departureDate = searchParams.get("departure_date");

    if (!poIds.length || !departureDate) {
      return NextResponse.json(
        { error: "po_id and departure_date are required." },
        { status: 400 },
      );
    }
    if (!SHIPMENT_TYPES.includes(shipmentType)) {
      return NextResponse.json(
        { error: "Invalid shipment_type." },
        { status: 400 },
      );
    }

    const shipment_number = await suggestShipmentNumber(
      createAdminClient(),
      poIds,
      shipmentType,
      departureDate,
    );
    return NextResponse.json({ shipment_number });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
