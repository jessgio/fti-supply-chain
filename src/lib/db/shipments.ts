import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PoShortfallResolution,
  Shipment,
  ShipmentLineAllocation,
  ShipmentStatus,
  ShipmentType,
  ShipmentDocumentType,
} from "@/types/database";
import {
  calculateExpectedDeliveryDate,
  resolveShipmentStatusFromDeparture,
} from "@/lib/shipments/shipment-dates";
import {
  appendShipmentDuplicateSuffix,
  defaultShipmentNumberFromPoNumber,
  generateFallbackShipmentNumber,
  nextShipmentDuplicateIndex,
  shipmentNumberPrefix,
  stripShipmentDuplicateSuffix,
} from "@/lib/shipments/shipment-number";
import { recalculatePoStatus, syncPoStatusesAfterShipmentChange } from "@/lib/db/po-lifecycle";
import {
  deleteShipmentDocuments,
  getMissingDocumentCountsByShipmentId,
  getRequiredDocuments,
  setRequiredDocuments,
} from "@/lib/db/shipment-documents";
import { defaultRequiredDocuments } from "@/lib/shipments/document-types";
import {
  adjustPoOrderedToAllocated,
  isPoShortfallResolution,
} from "@/lib/procurement/po-shortfall";

export interface CreateShipmentInput {
  shipment_number?: string;
  shipment_type: ShipmentType;
  estimated_departure_date: string;
  transit_days?: number;
  delay_days?: number;
  expected_delivery_date?: string;
  notes?: string | null;
  po_ids: string[];
  items: Array<{ po_line_id: string; quantity: number }>;
  required_documents?: ShipmentDocumentType[];
  /**
   * When shipping less than remaining PO qty:
   * omit/undefined = leave open for another shipment
   * leave_as_is = store on shipment; apply close after inbound closes it
   * adjust_ordered = set qty_ordered to total allocated after this save
   */
  po_resolution?: PoShortfallResolution;
}

export interface UpdateShipmentInput {
  shipment_number?: string;
  shipment_type?: ShipmentType;
  status?: ShipmentStatus;
  estimated_departure_date?: string;
  transit_days?: number;
  delay_days?: number;
  expected_delivery_date?: string;
  notes?: string | null;
  po_ids?: string[];
  items?: Array<{ po_line_id: string; quantity: number }>;
  required_documents?: ShipmentDocumentType[];
  po_resolution?: PoShortfallResolution | null;
}

export interface ShipmentListParams {
  search?: string;
  status?: ShipmentStatus;
  shipment_type?: ShipmentType;
}

const SHIPMENT_SELECT = `
  id,
  shipment_number,
  shipment_type,
  status,
  estimated_departure_date,
  transit_days,
  delay_days,
  expected_delivery_date,
  notes,
  po_shortfall_resolution,
  created_at,
  updated_at,
  shipment_purchase_orders (
    po_id,
    purchase_orders (
      id,
      po_number,
      suppliers ( name )
    )
  ),
  shipment_items (
    id,
    po_line_id,
    quantity,
    purchase_order_lines (
      id,
      po_id,
      sku_id,
      qty_ordered,
      skus ( sku_code, name ),
      purchase_orders ( id, po_number )
    )
  )
`;

type ShipmentRow = {
  id: string;
  shipment_number: string;
  shipment_type: ShipmentType;
  status: ShipmentStatus;
  estimated_departure_date: string;
  transit_days: number;
  delay_days: number;
  expected_delivery_date: string;
  notes: string | null;
  po_shortfall_resolution?: PoShortfallResolution | null;
  created_at?: string;
  updated_at?: string;
  shipment_purchase_orders?: Array<{
    po_id: string;
    purchase_orders: {
      id: string;
      po_number: string;
      suppliers: { name: string } | null;
    } | null;
  }>;
  shipment_items?: Array<{
    id: string;
    po_line_id: string;
    quantity: number;
    purchase_order_lines: {
      id: string;
      po_id: string;
      sku_id: string;
      qty_ordered: number;
      skus: { sku_code: string; name: string | null } | null;
      purchase_orders: { id: string; po_number: string } | null;
    } | null;
  }>;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapShipmentRow(row: ShipmentRow): Shipment {
  const poMap = new Map<
    string,
    {
      id: string;
      po_number: string;
      supplier_name: string | null;
      items: Shipment["purchase_orders"] extends (infer T)[] | undefined
        ? T extends { items: infer I }
          ? I
          : never
        : never;
    }
  >();

  for (const link of row.shipment_purchase_orders ?? []) {
    const po = link.purchase_orders;
    if (!po) continue;
    poMap.set(po.id, {
      id: po.id,
      po_number: po.po_number,
      supplier_name: po.suppliers?.name ?? null,
      items: [],
    });
  }

  for (const item of row.shipment_items ?? []) {
    const line = item.purchase_order_lines;
    if (!line) continue;
    const poId = line.po_id;
    let po = poMap.get(poId);
    if (!po) {
      po = {
        id: poId,
        po_number: line.purchase_orders?.po_number ?? "",
        supplier_name: null,
        items: [],
      };
      poMap.set(poId, po);
    }
    po.items.push({
      id: item.id,
      po_line_id: item.po_line_id,
      po_id: poId,
      po_number: po.po_number,
      sku_id: line.sku_id,
      sku_code: line.skus?.sku_code ?? "",
      sku_name: line.skus?.name ?? null,
      quantity: Number(item.quantity),
      qty_ordered: Number(line.qty_ordered),
    });
  }

  return {
    id: row.id,
    shipment_number: row.shipment_number,
    shipment_type: row.shipment_type,
    status: row.status,
    estimated_departure_date: row.estimated_departure_date,
    transit_days: row.transit_days,
    delay_days: row.delay_days,
    expected_delivery_date: row.expected_delivery_date,
    notes: row.notes,
    po_shortfall_resolution: row.po_shortfall_resolution ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    purchase_orders: Array.from(poMap.values()),
  };
}

function withResolvedStatus(shipment: Shipment): Shipment {
  return {
    ...shipment,
    status: resolveShipmentStatusFromDeparture(
      shipment.status,
      shipment.estimated_departure_date,
    ),
  };
}

function shipmentMatchesSearch(shipment: Shipment, query: string): boolean {
  const q = query.toLowerCase();
  if (shipment.shipment_number.toLowerCase().includes(q)) return true;

  for (const po of shipment.purchase_orders ?? []) {
    if (po.po_number.toLowerCase().includes(q)) return true;
    if ((po.supplier_name ?? "").toLowerCase().includes(q)) return true;

    for (const item of po.items ?? []) {
      if (item.sku_code.toLowerCase().includes(q)) return true;
      if ((item.sku_name ?? "").toLowerCase().includes(q)) return true;
    }
  }

  return false;
}

export async function listShipments(
  supabase: SupabaseClient,
  params: ShipmentListParams = {},
): Promise<Shipment[]> {
  let query = supabase
    .from("shipments")
    .select(SHIPMENT_SELECT)
    .order("estimated_departure_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (params.status) query = query.eq("status", params.status);
  if (params.shipment_type) query = query.eq("shipment_type", params.shipment_type);

  const { data, error } = await query;
  if (error) throw error;

  let rows = ((data ?? []) as unknown as ShipmentRow[]).map(mapShipmentRow);

  if (params.search?.trim()) {
    const q = params.search.trim();
    rows = rows.filter((s) => shipmentMatchesSearch(s, q));
  }

  const missingCounts = await getMissingDocumentCountsByShipmentId(
    supabase,
    rows.map((s) => s.id),
  );

  return rows.map((s) =>
    withResolvedStatus({
      ...s,
      missing_document_count: missingCounts.get(s.id) ?? 0,
    }),
  );
}

export async function getShipment(
  supabase: SupabaseClient,
  id: string,
): Promise<Shipment | null> {
  const { data, error } = await supabase
    .from("shipments")
    .select(SHIPMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const shipment = withResolvedStatus(mapShipmentRow(data as unknown as ShipmentRow));
  shipment.required_documents = await getRequiredDocuments(supabase, id);
  return shipment;
}

export async function getLineAllocations(
  supabase: SupabaseClient,
  poIds: string[],
  excludeShipmentId?: string,
): Promise<ShipmentLineAllocation[]> {
  if (poIds.length === 0) return [];

  const { data: lines, error: linesError } = await supabase
    .from("purchase_order_lines")
    .select(
      "id, po_id, sku_id, qty_ordered, is_closed, skus(sku_code, name), purchase_orders!inner(id, po_number)",
    )
    .in("po_id", poIds);
  if (linesError) throw linesError;

  const lineIds = (lines ?? []).map((l) => l.id as string);
  if (lineIds.length === 0) return [];

  const { data: allocated, error: allocError } = await supabase
    .from("shipment_items")
    .select("po_line_id, quantity, shipment_id")
    .in("po_line_id", lineIds);
  if (allocError) throw allocError;

  const allocatedByLine = new Map<string, number>();
  const currentByLine = new Map<string, number>();
  for (const row of allocated ?? []) {
    const id = row.po_line_id as string;
    const qty = Number(row.quantity);
    allocatedByLine.set(id, (allocatedByLine.get(id) ?? 0) + qty);
    if (excludeShipmentId && row.shipment_id === excludeShipmentId) {
      currentByLine.set(id, (currentByLine.get(id) ?? 0) + qty);
    }
  }

  return (lines ?? []).map((line) => {
    const po = unwrapRelation(
      line.purchase_orders as
        | { id: string; po_number: string }
        | { id: string; po_number: string }[]
        | null,
    );
    const sku = unwrapRelation(
      line.skus as
        | { sku_code: string; name: string | null }
        | { sku_code: string; name: string | null }[]
        | null,
    );
    if (!po) {
      throw new Error("Missing purchase order for line allocation.");
    }
    const lineId = line.id as string;
    const qtyOrdered = Number(line.qty_ordered);
    const qtyAllocated = allocatedByLine.get(lineId) ?? 0;
    const currentQty = currentByLine.get(lineId) ?? 0;
    const isClosed = Boolean(line.is_closed);
    return {
      po_line_id: lineId,
      po_id: po.id,
      po_number: po.po_number,
      sku_id: line.sku_id as string,
      sku_code: sku?.sku_code ?? "",
      sku_name: sku?.name ?? null,
      qty_ordered: qtyOrdered,
      qty_allocated: qtyAllocated,
      qty_available: isClosed
        ? 0
        : Math.max(0, qtyOrdered - qtyAllocated + currentQty),
    };
  });
}

export async function suggestShipmentNumber(
  supabase: SupabaseClient,
  poIds: string[],
  shipmentType: ShipmentType,
  departureDate: string,
): Promise<string> {
  if (poIds.length === 0) {
    return generateFallbackShipmentNumber(shipmentType);
  }

  const { data: pos, error } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .in("id", poIds)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const dateStr = departureDate.replace(/-/g, "");
  for (const po of pos ?? []) {
    const derived = defaultShipmentNumberFromPoNumber(
      po.po_number as string,
      shipmentType,
      dateStr,
    );
    if (derived) {
      const prefix = shipmentNumberPrefix(
        shipmentType,
        derived.split("-")[2],
        dateStr,
      );
      const { data: existing } = await supabase
        .from("shipments")
        .select("shipment_number")
        .ilike("shipment_number", `${stripShipmentDuplicateSuffix(derived)}%`);
      const numbers = (existing ?? []).map(
        (r) => r.shipment_number as string,
      );
      const index = nextShipmentDuplicateIndex(numbers);
      return appendShipmentDuplicateSuffix(derived, index);
    }
  }

  return generateFallbackShipmentNumber(shipmentType);
}

async function validateShipmentItems(
  supabase: SupabaseClient,
  items: Array<{ po_line_id: string; quantity: number }>,
  excludeShipmentId?: string,
): Promise<void> {
  if (items.length === 0) {
    throw new Error("A shipment needs at least one line item.");
  }

  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("Each shipment line must have a positive quantity.");
    }
  }

  const lineIds = items.map((i) => i.po_line_id);
  const allocations = await getLineAllocationsForLines(
    supabase,
    lineIds,
    excludeShipmentId,
  );

  for (const item of items) {
    const alloc = allocations.get(item.po_line_id);
    if (!alloc) throw new Error("Invalid PO line selected.");
    if (alloc.is_closed && item.quantity > alloc.current) {
      throw new Error(
        `Cannot ship more on ${alloc.sku_code}: the PO line is already closed.`,
      );
    }
    const maxQty = alloc.available + (excludeShipmentId ? alloc.current : 0);
    if (item.quantity > maxQty) {
      throw new Error(
        `Quantity for ${alloc.sku_code} exceeds available (${maxQty} units).`,
      );
    }
  }
}

async function getLineAllocationsForLines(
  supabase: SupabaseClient,
  lineIds: string[],
  excludeShipmentId?: string,
): Promise<
  Map<
    string,
    {
      sku_code: string;
      allocated: number;
      available: number;
      current: number;
      is_closed: boolean;
    }
  >
> {
  const { data: lines, error: linesError } = await supabase
    .from("purchase_order_lines")
    .select("id, qty_ordered, is_closed, skus(sku_code)")
    .in("id", lineIds);
  if (linesError) throw linesError;

  const { data: allocated, error: allocError } = await supabase
    .from("shipment_items")
    .select("po_line_id, quantity, shipment_id")
    .in("po_line_id", lineIds);
  if (allocError) throw allocError;

  const allocatedByLine = new Map<string, number>();
  const currentByLine = new Map<string, number>();
  for (const row of allocated ?? []) {
    const id = row.po_line_id as string;
    const qty = Number(row.quantity);
    allocatedByLine.set(id, (allocatedByLine.get(id) ?? 0) + qty);
    if (excludeShipmentId && row.shipment_id === excludeShipmentId) {
      currentByLine.set(id, (currentByLine.get(id) ?? 0) + qty);
    }
  }

  const result = new Map<
    string,
    {
      sku_code: string;
      allocated: number;
      available: number;
      current: number;
      is_closed: boolean;
    }
  >();
  for (const line of lines ?? []) {
    const id = line.id as string;
    const qtyOrdered = Number(line.qty_ordered);
    const qtyAllocated = allocatedByLine.get(id) ?? 0;
    const isClosed = Boolean(line.is_closed);
    const sku = unwrapRelation(
      line.skus as
        | { sku_code: string }
        | { sku_code: string }[]
        | null,
    );
    result.set(id, {
      sku_code: sku?.sku_code ?? "",
      allocated: qtyAllocated,
      available: isClosed ? 0 : Math.max(0, qtyOrdered - qtyAllocated),
      current: currentByLine.get(id) ?? 0,
      is_closed: isClosed,
    });
  }
  return result;
}

type ShortShipAdjustment = {
  po_line_id: string;
  available: number;
  shipQty: number;
  totalAllocated: number;
};

async function findShortShipLines(
  supabase: SupabaseClient,
  items: Array<{ po_line_id: string; quantity: number }>,
  excludeShipmentId?: string,
): Promise<ShortShipAdjustment[]> {
  const allocations = await getLineAllocationsForLines(
    supabase,
    items.map((i) => i.po_line_id),
    excludeShipmentId,
  );
  const short: ShortShipAdjustment[] = [];

  for (const item of items) {
    const alloc = allocations.get(item.po_line_id);
    if (!alloc || alloc.is_closed) continue;
    const availableForInput =
      alloc.available + (excludeShipmentId ? alloc.current : 0);
    if (item.quantity <= 0 || item.quantity >= availableForInput) continue;
    short.push({
      po_line_id: item.po_line_id,
      available: availableForInput,
      shipQty: item.quantity,
      totalAllocated: alloc.allocated - alloc.current + item.quantity,
    });
  }
  return short;
}

function requirePoResolutionForShortShip(
  shortLines: ShortShipAdjustment[],
  poResolution: PoShortfallResolution | null | undefined,
): PoShortfallResolution | null {
  if (shortLines.length === 0) {
    return null;
  }
  if (poResolution == null) {
    // Leave open for further shipment
    return null;
  }
  if (!isPoShortfallResolution(poResolution)) {
    throw new Error("Invalid purchase order shortfall resolution.");
  }
  return poResolution;
}

async function applyShipPoResolution(
  supabase: SupabaseClient,
  shortLines: ShortShipAdjustment[],
  poResolution: PoShortfallResolution | null,
  poIds: string[],
): Promise<void> {
  if (!poResolution || shortLines.length === 0) return;

  if (poResolution === "adjust_ordered") {
    await adjustPoOrderedToAllocated(
      supabase,
      shortLines.map((line) => ({
        po_line_id: line.po_line_id,
        qty_ordered: line.totalAllocated,
      })),
    );
  }

  for (const poId of poIds) {
    await recalculatePoStatus(supabase, poId);
  }
}

export async function createShipment(
  supabase: SupabaseClient,
  input: CreateShipmentInput,
): Promise<Shipment> {
  if (!input.po_ids.length) {
    throw new Error("Select at least one purchase order.");
  }

  await validateShipmentItems(supabase, input.items);

  const shortLines = await findShortShipLines(supabase, input.items);
  const poResolution = requirePoResolutionForShortShip(
    shortLines,
    input.po_resolution,
  );

  const transitDays = input.transit_days ?? 21;
  const delayDays = input.delay_days ?? 0;
  const expectedDelivery =
    input.expected_delivery_date ??
    calculateExpectedDeliveryDate(
      input.estimated_departure_date,
      transitDays,
      delayDays,
    );

  const shipmentNumber =
    input.shipment_number?.trim() ||
    (await suggestShipmentNumber(
      supabase,
      input.po_ids,
      input.shipment_type,
      input.estimated_departure_date,
    ));

  const status = resolveShipmentStatusFromDeparture(
    "planned",
    input.estimated_departure_date,
  );

  const { data: shipment, error: shipError } = await supabase
    .from("shipments")
    .insert({
      shipment_number: shipmentNumber,
      shipment_type: input.shipment_type,
      status,
      estimated_departure_date: input.estimated_departure_date,
      transit_days: transitDays,
      delay_days: delayDays,
      expected_delivery_date: expectedDelivery,
      notes: input.notes ?? null,
      po_shortfall_resolution: poResolution,
    })
    .select("id")
    .single();
  if (shipError) throw shipError;

  const poLinks = input.po_ids.map((po_id) => ({
    shipment_id: shipment.id,
    po_id,
  }));
  const { error: linkError } = await supabase
    .from("shipment_purchase_orders")
    .insert(poLinks);
  if (linkError) throw linkError;

  const itemRows = input.items.map((item) => ({
    shipment_id: shipment.id,
    po_line_id: item.po_line_id,
    quantity: item.quantity,
  }));
  const { error: itemsError } = await supabase
    .from("shipment_items")
    .insert(itemRows);
  if (itemsError) throw itemsError;

  if (input.required_documents !== undefined) {
    await setRequiredDocuments(
      supabase,
      shipment.id,
      input.required_documents,
    );
  } else {
    await setRequiredDocuments(
      supabase,
      shipment.id,
      defaultRequiredDocuments(input.shipment_type),
    );
  }

  await applyShipPoResolution(
    supabase,
    shortLines,
    poResolution,
    input.po_ids,
  );
  await syncPoStatusesAfterShipmentChange(supabase, input.po_ids);

  const created = await getShipment(supabase, shipment.id);
  if (!created) throw new Error("Failed to load created shipment.");
  return created;
}

export async function updateShipment(
  supabase: SupabaseClient,
  id: string,
  input: UpdateShipmentInput,
): Promise<Shipment> {
  const existing = await getShipment(supabase, id);
  if (!existing) throw new Error("Shipment not found.");
  if (existing.status === "closed") {
    throw new Error("Cannot edit a closed shipment.");
  }

  const departureDate =
    input.estimated_departure_date ?? existing.estimated_departure_date;
  const transitDays = input.transit_days ?? existing.transit_days;
  const delayDays = input.delay_days ?? existing.delay_days;
  const expectedDelivery =
    input.expected_delivery_date ??
    calculateExpectedDeliveryDate(departureDate, transitDays, delayDays);

  if (input.items) {
    await validateShipmentItems(supabase, input.items, id);
  }

  const shortLines = input.items
    ? await findShortShipLines(supabase, input.items, id)
    : [];
  const poResolution = input.items
    ? requirePoResolutionForShortShip(shortLines, input.po_resolution)
    : (existing.po_shortfall_resolution ?? null);

  const status = resolveShipmentStatusFromDeparture(
    input.status ?? existing.status,
    departureDate,
  );

  const { error: updateError } = await supabase
    .from("shipments")
    .update({
      shipment_number: input.shipment_number ?? existing.shipment_number,
      shipment_type: input.shipment_type ?? existing.shipment_type,
      status,
      estimated_departure_date: departureDate,
      transit_days: transitDays,
      delay_days: delayDays,
      expected_delivery_date: expectedDelivery,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      ...(input.items
        ? { po_shortfall_resolution: poResolution }
        : input.po_resolution !== undefined
          ? { po_shortfall_resolution: poResolution }
          : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateError) throw updateError;

  const poIds =
    input.po_ids ??
    (existing.purchase_orders ?? []).map((po) => po.id);

  if (input.po_ids) {
    await supabase
      .from("shipment_purchase_orders")
      .delete()
      .eq("shipment_id", id);
    const links = input.po_ids.map((po_id) => ({ shipment_id: id, po_id }));
    const { error: linkError } = await supabase
      .from("shipment_purchase_orders")
      .insert(links);
    if (linkError) throw linkError;
  }

  if (input.items) {
    await supabase.from("shipment_items").delete().eq("shipment_id", id);
    const itemRows = input.items.map((item) => ({
      shipment_id: id,
      po_line_id: item.po_line_id,
      quantity: item.quantity,
    }));
    const { error: itemsError } = await supabase
      .from("shipment_items")
      .insert(itemRows);
    if (itemsError) throw itemsError;

    await applyShipPoResolution(supabase, shortLines, poResolution, poIds);
  }

  if (input.required_documents !== undefined) {
    await setRequiredDocuments(supabase, id, input.required_documents);
  }

  await syncPoStatusesAfterShipmentChange(supabase, poIds);

  const updated = await getShipment(supabase, id);
  if (!updated) throw new Error("Failed to load updated shipment.");
  return updated;
}

export async function deleteShipment(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const existing = await getShipment(supabase, id);
  if (!existing) throw new Error("Shipment not found.");

  const { data: receives, error: receiveError } = await supabase
    .from("inbound_receives")
    .select("id")
    .eq("shipment_id", id)
    .limit(1);
  if (receiveError) throw receiveError;
  if ((receives ?? []).length > 0) {
    throw new Error(
      "Cannot delete a shipment that has an inbound receive. Delete the receive first.",
    );
  }

  const poIds = (existing.purchase_orders ?? []).map((po) => po.id);
  await deleteShipmentDocuments(supabase, id);
  const { error } = await supabase.from("shipments").delete().eq("id", id);
  if (error) throw error;

  if (poIds.length) {
    await syncPoStatusesAfterShipmentChange(supabase, poIds);
  }
}

export async function listOpenShipmentsForInbound(
  supabase: SupabaseClient,
): Promise<Shipment[]> {
  const { data, error } = await supabase
    .from("shipments")
    .select(SHIPMENT_SELECT)
    .neq("status", "closed")
    .order("expected_delivery_date", { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as unknown as ShipmentRow[]).map(mapShipmentRow);
  const eligible: Shipment[] = [];

  for (const shipment of rows) {
    const { data: priorReceives, error: priorError } = await supabase
      .from("inbound_receives")
      .select("inbound_receive_items ( po_line_id, received_qty )")
      .eq("shipment_id", shipment.id);
    if (priorError) throw priorError;

    const receivedByLine = new Map<string, number>();
    for (const receive of priorReceives ?? []) {
      const items = receive.inbound_receive_items as Array<{
        po_line_id: string;
        received_qty: number;
      }> | null;
      for (const item of items ?? []) {
        receivedByLine.set(
          item.po_line_id,
          (receivedByLine.get(item.po_line_id) ?? 0) + Number(item.received_qty),
        );
      }
    }

    const hasRemaining = (shipment.purchase_orders ?? []).some((po) =>
      (po.items ?? []).some((item) => {
        const shipped = Number(item.quantity);
        const received = receivedByLine.get(item.po_line_id) ?? 0;
        return received < shipped;
      }),
    );

    if (hasRemaining) {
      const enriched: Shipment = {
        ...shipment,
        purchase_orders: (shipment.purchase_orders ?? []).map((po) => ({
          ...po,
          items: (po.items ?? []).map((item) => ({
            ...item,
            qty_previously_received: receivedByLine.get(item.po_line_id) ?? 0,
          })),
        })),
      };
      eligible.push(enriched);
    }
  }

  return eligible;
}
