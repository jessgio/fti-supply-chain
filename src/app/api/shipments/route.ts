import { NextResponse } from "next/server";
import { requireSupplyChainAccess, requireWriteRole } from "@/lib/auth";
import {
  createShipment,
  getLineAllocations,
  listShipments,
  suggestShipmentNumber,
  type ShipmentListParams,
} from "@/lib/db/shipments";
import { invalidateForecastCache } from "@/lib/forecast/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import type { ShipmentStatus, ShipmentType } from "@/types/database";
import {
  SHIPMENT_STATUSES,
  SHIPMENT_TYPES,
} from "@/lib/shipments/constants";

export async function GET(request: Request) {
  try {
    const denied = await requireSupplyChainAccess();
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const params: ShipmentListParams = {
      search: searchParams.get("search") ?? undefined,
    };
    const status = searchParams.get("status");
    const type = searchParams.get("shipment_type");
    if (status && SHIPMENT_STATUSES.includes(status as ShipmentStatus)) {
      params.status = status as ShipmentStatus;
    }
    if (type && SHIPMENT_TYPES.includes(type as ShipmentType)) {
      params.shipment_type = type as ShipmentType;
    }

    const shipments = await listShipments(createAdminClient(), params);
    return NextResponse.json({ shipments });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireWriteRole();
    if (denied) return denied;

    const body = await request.json();
    const shipment = await createShipment(createAdminClient(), body);
    invalidateForecastCache();
    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
