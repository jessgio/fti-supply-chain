import { formatTimelineDisplayName } from "@/lib/timeline-adjustment/products";

export type TimelineAnchor = "start" | "warehouse_delivery";

export interface TimelineLeadTimes {
  primary_packaging: number;
  secondary_packaging: number;
  extract: number;
  send_to_manufacturer: number;
  manufacturer_filling: number;
}

export const DEFAULT_LEAD_TIMES: TimelineLeadTimes = {
  primary_packaging: 65,
  secondary_packaging: 30,
  extract: 60,
  send_to_manufacturer: 3,
  manufacturer_filling: 30,
};

export interface TimelineProcessDef {
  id: keyof TimelineLeadTimes | "warehouse_delivery";
  label: string;
  leadTimeKey?: keyof TimelineLeadTimes;
  /** Runs in parallel with other parallel processes from project start. */
  parallel?: boolean;
}

export const TIMELINE_PROCESS_DEFS: TimelineProcessDef[] = [
  {
    id: "primary_packaging",
    label: "Primary packaging production (incl. shipping)",
    leadTimeKey: "primary_packaging",
    parallel: true,
  },
  {
    id: "secondary_packaging",
    label: "Secondary packaging production",
    leadTimeKey: "secondary_packaging",
    parallel: true,
  },
  {
    id: "extract",
    label: "Extract production",
    leadTimeKey: "extract",
    parallel: true,
  },
  {
    id: "send_to_manufacturer",
    label: "Send all parts to manufacturer for filling",
    leadTimeKey: "send_to_manufacturer",
  },
  {
    id: "manufacturer_filling",
    label: "Manufacturer filling",
    leadTimeKey: "manufacturer_filling",
  },
  {
    id: "warehouse_delivery",
    label: "Warehouse delivery",
  },
];

/** @deprecated Use TIMELINE_PROCESS_DEFS */
export const TIMELINE_PROCESSES = TIMELINE_PROCESS_DEFS;

export interface TimelineProcessSchedule {
  id: string;
  label: string;
  leadTimeDays: number;
  parallel: boolean;
  start: Date;
  end: Date;
}

export interface TimelineScheduleProduct {
  productName: string;
  skuId?: string | null;
}

export interface TimelineSchedule {
  products: TimelineScheduleProduct[];
  /** Comma-separated label for headers and saved timeline lists. */
  displayName: string;
  /** @deprecated Use displayName */
  productName: string;
  anchor: TimelineAnchor;
  anchorDate: Date;
  projectStart: Date;
  warehouseDelivery: Date;
  processes: TimelineProcessSchedule[];
  totalCalendarDays: number;
  leadTimes: TimelineLeadTimes;
}

const MS_PER_DAY = 86_400_000;

export function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addCalendarDays(d: Date, days: number): Date {
  const next = startOfDay(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** Inclusive span: a 30-day process starting Mon ends 30 calendar days later. */
export function endFromStart(start: Date, leadTimeDays: number): Date {
  if (leadTimeDays <= 1) return startOfDay(start);
  return addCalendarDays(start, leadTimeDays - 1);
}

export function startFromEnd(end: Date, leadTimeDays: number): Date {
  if (leadTimeDays <= 1) return startOfDay(end);
  return addCalendarDays(end, -(leadTimeDays - 1));
}

function nextDay(d: Date): Date {
  return addCalendarDays(d, 1);
}

function prevDay(d: Date): Date {
  return addCalendarDays(d, -1);
}

function maxDate(...dates: Date[]): Date {
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

export function formatTimelineDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTimelineIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildProcessSchedule(
  id: string,
  label: string,
  leadTimeDays: number,
  start: Date,
  parallel: boolean,
): TimelineProcessSchedule {
  const normalizedStart = startOfDay(start);
  return {
    id,
    label,
    leadTimeDays,
    parallel,
    start: normalizedStart,
    end: endFromStart(normalizedStart, leadTimeDays),
  };
}

function labelForProcess(id: TimelineProcessDef["id"]): string {
  return TIMELINE_PROCESS_DEFS.find((p) => p.id === id)?.label ?? id;
}

export function buildTimelineFromStart(
  projectStart: Date,
  products: TimelineScheduleProduct[],
  leadTimes: TimelineLeadTimes = DEFAULT_LEAD_TIMES,
): TimelineSchedule {
  const displayName = formatTimelineDisplayName(products);
  const parallelStart = startOfDay(projectStart);

  const primary = buildProcessSchedule(
    "primary_packaging",
    labelForProcess("primary_packaging"),
    leadTimes.primary_packaging,
    parallelStart,
    true,
  );
  const secondary = buildProcessSchedule(
    "secondary_packaging",
    labelForProcess("secondary_packaging"),
    leadTimes.secondary_packaging,
    parallelStart,
    true,
  );
  const extract = buildProcessSchedule(
    "extract",
    labelForProcess("extract"),
    leadTimes.extract,
    parallelStart,
    true,
  );

  const parallelEnd = maxDate(primary.end, secondary.end, extract.end);
  const sendStart = nextDay(parallelEnd);
  const send = buildProcessSchedule(
    "send_to_manufacturer",
    labelForProcess("send_to_manufacturer"),
    leadTimes.send_to_manufacturer,
    sendStart,
    false,
  );

  const mfgStart = nextDay(send.end);
  const mfg = buildProcessSchedule(
    "manufacturer_filling",
    labelForProcess("manufacturer_filling"),
    leadTimes.manufacturer_filling,
    mfgStart,
    false,
  );

  const warehouseDelivery = mfg.end;
  const warehouse = buildProcessSchedule(
    "warehouse_delivery",
    labelForProcess("warehouse_delivery"),
    1,
    warehouseDelivery,
    false,
  );

  const totalCalendarDays =
    Math.round(
      (warehouseDelivery.getTime() - parallelStart.getTime()) / MS_PER_DAY,
    ) + 1;

  return {
    products,
    displayName,
    productName: displayName,
    anchor: "start",
    anchorDate: parallelStart,
    projectStart: parallelStart,
    warehouseDelivery,
    processes: [primary, secondary, extract, send, mfg, warehouse],
    totalCalendarDays,
    leadTimes,
  };
}

export function buildTimelineFromWarehouseDelivery(
  warehouseDelivery: Date,
  products: TimelineScheduleProduct[],
  leadTimes: TimelineLeadTimes = DEFAULT_LEAD_TIMES,
): TimelineSchedule {
  const displayName = formatTimelineDisplayName(products);
  const delivery = startOfDay(warehouseDelivery);

  const mfgEnd = delivery;
  const mfgStart = startFromEnd(mfgEnd, leadTimes.manufacturer_filling);
  const sendEnd = prevDay(mfgStart);
  const sendStart = startFromEnd(sendEnd, leadTimes.send_to_manufacturer);
  const parallelEnd = prevDay(sendStart);

  const primaryStart = startFromEnd(parallelEnd, leadTimes.primary_packaging);
  const secondaryStart = startFromEnd(parallelEnd, leadTimes.secondary_packaging);
  const extractStart = startFromEnd(parallelEnd, leadTimes.extract);
  const projectStart = primaryStart;

  const primary = buildProcessSchedule(
    "primary_packaging",
    labelForProcess("primary_packaging"),
    leadTimes.primary_packaging,
    primaryStart,
    true,
  );
  const secondary = buildProcessSchedule(
    "secondary_packaging",
    labelForProcess("secondary_packaging"),
    leadTimes.secondary_packaging,
    secondaryStart,
    true,
  );
  const extract = buildProcessSchedule(
    "extract",
    labelForProcess("extract"),
    leadTimes.extract,
    extractStart,
    true,
  );
  const send = buildProcessSchedule(
    "send_to_manufacturer",
    labelForProcess("send_to_manufacturer"),
    leadTimes.send_to_manufacturer,
    sendStart,
    false,
  );
  const mfg = buildProcessSchedule(
    "manufacturer_filling",
    labelForProcess("manufacturer_filling"),
    leadTimes.manufacturer_filling,
    mfgStart,
    false,
  );
  const warehouse = buildProcessSchedule(
    "warehouse_delivery",
    labelForProcess("warehouse_delivery"),
    1,
    delivery,
    false,
  );

  const totalCalendarDays =
    Math.round((delivery.getTime() - projectStart.getTime()) / MS_PER_DAY) + 1;

  return {
    products,
    displayName,
    productName: displayName,
    anchor: "warehouse_delivery",
    anchorDate: delivery,
    projectStart,
    warehouseDelivery: delivery,
    processes: [primary, secondary, extract, send, mfg, warehouse],
    totalCalendarDays,
    leadTimes,
  };
}

export function buildTimelineSchedule(input: {
  products: TimelineScheduleProduct[];
  anchor: TimelineAnchor;
  anchorDate: Date;
  leadTimes?: TimelineLeadTimes;
}): TimelineSchedule {
  const leadTimes = input.leadTimes ?? DEFAULT_LEAD_TIMES;
  if (input.anchor === "start") {
    return buildTimelineFromStart(input.anchorDate, input.products, leadTimes);
  }
  return buildTimelineFromWarehouseDelivery(
    input.anchorDate,
    input.products,
    leadTimes,
  );
}

export function leadTimesFromProductTimeline(row: {
  primary_packaging_days: number;
  secondary_packaging_days: number;
  extract_days: number;
  send_to_manufacturer_days: number;
  manufacturer_filling_days: number;
}): TimelineLeadTimes {
  return {
    primary_packaging: row.primary_packaging_days,
    secondary_packaging: row.secondary_packaging_days,
    extract: row.extract_days,
    send_to_manufacturer: row.send_to_manufacturer_days,
    manufacturer_filling: row.manufacturer_filling_days,
  };
}

export function getGanttPosition(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number | null {
  const span = rangeEnd.getTime() - rangeStart.getTime();
  if (span <= 0) return null;
  const pos =
    ((startOfDay(date).getTime() - rangeStart.getTime()) / span) * 100;
  return Math.min(100, Math.max(0, pos));
}

export function getBarStyle(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): { left: number; width: number } {
  const left = getGanttPosition(start, rangeStart, rangeEnd) ?? 0;
  const right = getGanttPosition(end, rangeStart, rangeEnd) ?? left;
  const width = Math.max(right - left, 0.8);
  return { left, width };
}
