export type PoGanttPhase = "production" | "shipping";

export interface PoGanttBar {
  id: string;
  phase: PoGanttPhase;
  label: string;
  detail?: string;
  startMarkerLabel: string;
  endMarkerLabel: string;
  start: Date;
  end: Date;
  delayStart?: Date;
}

export interface PoGanttChart {
  bars: PoGanttBar[];
  rangeStart: Date;
  rangeEnd: Date;
  today: Date;
  ticks: Date[];
}

export interface PoGanttPaymentRef {
  payment_date: string;
  purpose?: string;
}

export interface PoGanttInput {
  created_at: string;
  expected_date: string | null;
  payments?: PoGanttPaymentRef[];
  shipments: Array<{
    id: string;
    shipment_number: string;
    estimated_departure_date: string;
    expected_delivery_date: string;
    delay_days?: number;
  }>;
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = startOfDay(new Date(`${value}T00:00:00`));
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildTicks(rangeStart: Date, rangeEnd: Date, tickCount = 5): Date[] {
  const span = rangeEnd.getTime() - rangeStart.getTime();
  if (span <= 0) return [rangeStart];
  const ticks: Date[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    ticks.push(new Date(rangeStart.getTime() + (span * i) / tickCount));
  }
  return ticks;
}

function subtractDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() - days);
  return startOfDay(date);
}

function resolveEarliestDownPaymentDate(
  payments: PoGanttPaymentRef[],
): Date | null {
  if (payments.length === 0) return null;
  const downPayments = payments.filter((p) =>
    (p.purpose ?? "").toLowerCase().includes("down payment"),
  );
  const relevant = downPayments.length > 0 ? downPayments : payments;
  const parsed = relevant
    .map((p) => parseDate(p.payment_date))
    .filter((d): d is Date => d != null);
  if (parsed.length === 0) return null;
  return new Date(Math.min(...parsed.map((d) => d.getTime())));
}

export function buildPoGanttBars(
  input: PoGanttInput,
  idPrefix = "",
): PoGanttBar[] {
  const prefix = idPrefix ? `${idPrefix}-` : "";
  const bars: PoGanttBar[] = [];

  const productionEnd = parseDate(input.expected_date);
  const paymentStart = resolveEarliestDownPaymentDate(input.payments ?? []);
  const createdStart = parseDate(input.created_at);
  const productionStart = paymentStart ?? createdStart;
  const productionUsesPayment = paymentStart != null;

  if (productionStart && productionEnd && productionEnd >= productionStart) {
    bars.push({
      id: `${prefix}production`,
      phase: "production",
      label: "Production",
      detail: productionUsesPayment
        ? "First payment → finished"
        : "Created → finished",
      startMarkerLabel: productionUsesPayment ? "First payment" : "Created",
      endMarkerLabel: "Finished date",
      start: productionStart,
      end: productionEnd,
    });
  }

  const shipmentCount = input.shipments.length;
  for (const shipment of input.shipments) {
    const shippingStart = parseDate(shipment.estimated_departure_date);
    const shippingEnd = parseDate(shipment.expected_delivery_date);
    if (!shippingStart || !shippingEnd || shippingEnd < shippingStart) continue;

    const delayDays = Math.max(0, shipment.delay_days ?? 0);
    let delayStart: Date | undefined;
    if (delayDays > 0) {
      const computed = subtractDays(shippingEnd, delayDays);
      delayStart =
        computed.getTime() >= shippingStart.getTime()
          ? computed
          : shippingStart;
    }

    bars.push({
      id: shipment.id,
      phase: "shipping",
      label: shipmentCount === 1 ? "Shipping" : shipment.shipment_number,
      detail: shipmentCount === 1 ? shipment.shipment_number : undefined,
      startMarkerLabel: "Expected departure",
      endMarkerLabel: "Expected delivery",
      start: shippingStart,
      end: shippingEnd,
      delayStart,
    });
  }

  return bars;
}

function computeGanttRange(bars: PoGanttBar[]): {
  rangeStart: Date;
  rangeEnd: Date;
  today: Date;
  ticks: Date[];
} | null {
  if (bars.length === 0) return null;
  const today = startOfDay(new Date());
  const datePoints = bars.flatMap((bar) => [bar.start, bar.end]);
  datePoints.push(today);

  let rangeStart = new Date(
    Math.min(...datePoints.map((d) => d.getTime())),
  );
  let rangeEnd = new Date(Math.max(...datePoints.map((d) => d.getTime())));

  const rangeMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 86400000);
  const padMs = Math.max(rangeMs * 0.06, 2 * 86400000);
  rangeStart = new Date(rangeStart.getTime() - padMs);
  rangeEnd = new Date(rangeEnd.getTime() + padMs);

  return {
    rangeStart,
    rangeEnd,
    today,
    ticks: buildTicks(rangeStart, rangeEnd),
  };
}

export interface MasterGanttPoGroup {
  po_id: string;
  po_number: string;
  supplier_name: string;
  status: string;
  display_status: string;
  bars: PoGanttBar[];
}

export interface MasterGanttChart {
  groups: MasterGanttPoGroup[];
  rangeStart: Date;
  rangeEnd: Date;
  today: Date;
  ticks: Date[];
}

export interface MasterGanttPoInput extends PoGanttInput {
  po_id: string;
  po_number: string;
  supplier_name: string;
  status: string;
  display_status: string;
}

export function buildMasterGanttChart(
  pos: MasterGanttPoInput[],
): MasterGanttChart | null {
  const groups: MasterGanttPoGroup[] = [];
  const allBars: PoGanttBar[] = [];

  for (const po of pos) {
    const bars = buildPoGanttBars(
      {
        created_at: po.created_at,
        expected_date: po.expected_date,
        payments: po.payments,
        shipments: po.shipments,
      },
      po.po_id,
    );
    if (bars.length === 0) continue;

    groups.push({
      po_id: po.po_id,
      po_number: po.po_number,
      supplier_name: po.supplier_name,
      status: po.status,
      display_status: po.display_status,
      bars,
    });
    allBars.push(...bars);
  }

  const range = computeGanttRange(allBars);
  if (!range || groups.length === 0) return null;

  return { groups, ...range };
}

export function getPoGanttPosition(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
): number | null {
  const span = rangeEnd.getTime() - rangeStart.getTime();
  if (span <= 0) return null;
  const pct = ((date.getTime() - rangeStart.getTime()) / span) * 100;
  if (pct < 0 || pct > 100) return null;
  return pct;
}

export function getGanttMarkerAlign(position: number): string {
  if (position <= 10) return "translateX(0)";
  if (position >= 90) return "translateX(-100%)";
  return "translateX(-50%)";
}

export function shouldHideGanttTickLabel(
  tickPosition: number,
  todayPosition: number | null,
  threshold = 9,
): boolean {
  if (todayPosition == null) return false;
  return Math.abs(tickPosition - todayPosition) < threshold;
}

export function getPoGanttBarStyle(
  bar: PoGanttBar,
  rangeStart: Date,
  rangeEnd: Date,
  segment: "full" | "main" | "delay" = "full",
): { left: number; width: number } {
  let segmentStart = bar.start;
  let segmentEnd = bar.end;

  if (segment === "main" && bar.delayStart) {
    segmentEnd = bar.delayStart;
  } else if (segment === "delay" && bar.delayStart) {
    segmentStart = bar.delayStart;
  } else if (segment === "delay") {
    return { left: 0, width: 0 };
  }

  const span = rangeEnd.getTime() - rangeStart.getTime();
  if (span <= 0) return { left: 0, width: 0 };

  const left = ((segmentStart.getTime() - rangeStart.getTime()) / span) * 100;
  let width = ((segmentEnd.getTime() - segmentStart.getTime()) / span) * 100;
  width = Math.max(width, segment === "delay" ? 0 : 2);

  return {
    left: Math.max(0, Math.min(left, 100)),
    width: Math.min(width, 100 - Math.max(0, left)),
  };
}

export function getPoGanttBarEndPosition(
  bar: PoGanttBar,
  rangeStart: Date,
  rangeEnd: Date,
): number | null {
  const { left, width } = getPoGanttBarStyle(bar, rangeStart, rangeEnd, "full");
  const end = left + width;
  if (end < 0 || end > 100) return null;
  return Math.min(end, 100);
}

export function formatPoGanttDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPoGanttRange(start: Date, end: Date): string {
  return `${formatPoGanttDate(start)} – ${formatPoGanttDate(end)}`;
}

export function formatPoGanttMilestoneLabel(label: string, date: Date): string {
  return `${label} · ${formatPoGanttDate(date)}`;
}
