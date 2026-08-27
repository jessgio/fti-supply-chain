import type { PoStatus, PurchaseOrderLine } from "@/types/database";
import { DEFAULT_PO_CURRENCY } from "@/lib/procurement/currencies";
import { resolvePaymentSchedule } from "@/lib/procurement/committed-payment-amounts";
import {
  isBalancePaymentPurpose,
  isDownPaymentPurpose,
  paymentFulfillmentStatus,
} from "@/lib/procurement/po-payment-status";

/** Shipment statuses that keep a PO linked to an active shipping schedule. */
export const PO_ACTIVE_SHIPMENT_STATUSES = new Set(["planned", "in_transit"]);

export interface PoLifecycleShipmentRef {
  status: string;
  estimated_departure_date: string;
  expected_delivery_date: string;
}

export interface PoLifecyclePaymentRef {
  payment_date: string;
  purpose: string;
  amount: number;
  currency?: string;
}

export interface PoLifecycleInput {
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  created_at: string;
  down_payment_pct: number;
  discount_amount: number;
  tax_pct: number;
  pph_pct: number;
  other_charges: number;
  currency: string;
  committed_invoice_total?: number | null;
  committed_down_payment?: number | null;
  committed_balance?: number | null;
  payment_amounts_committed_at?: string | null;
  lines: Array<
    Pick<PurchaseOrderLine, "qty_ordered" | "qty_received" | "unit_cost" | "is_closed">
  >;
  payments: PoLifecyclePaymentRef[];
  shipments: PoLifecycleShipmentRef[];
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const datePart = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const date = startOfDay(new Date(`${datePart}T00:00:00`));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = startOfDay(new Date(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateInRange(day: Date, start: Date, end: Date): boolean {
  return day.getTime() >= start.getTime() && day.getTime() <= end.getTime();
}

function resolveEarliestDownPaymentDate(
  payments: PoLifecyclePaymentRef[],
): Date | null {
  if (payments.length === 0) return null;
  const downPayments = payments.filter((p) =>
    isDownPaymentPurpose(p.purpose),
  );
  const relevant = downPayments.length > 0 ? downPayments : payments;
  const parsed = relevant
    .map((p) => parseDate(p.payment_date))
    .filter((d): d is Date => d != null);
  if (parsed.length === 0) return null;
  return new Date(Math.min(...parsed.map((d) => d.getTime())));
}

function resolveProductionWindow(
  input: PoLifecycleInput,
): { start: Date; end: Date } | null {
  const productionEnd = parseDate(input.expected_date);
  const paymentStart = resolveEarliestDownPaymentDate(input.payments);
  const orderStart = parseDate(input.order_date);
  const createdStart = parseDate(input.created_at);
  const productionStart = paymentStart ?? orderStart ?? createdStart;

  if (!productionStart || !productionEnd) return null;
  if (productionEnd.getTime() < productionStart.getTime()) return null;

  return { start: productionStart, end: productionEnd };
}

function isWithinProductionWindow(input: PoLifecycleInput, today: Date): boolean {
  const window = resolveProductionWindow(input);
  if (!window) return false;
  return isDateInRange(today, window.start, window.end);
}

function productionWindowNotYetStarted(
  input: PoLifecycleInput,
  today: Date,
): boolean {
  const window = resolveProductionWindow(input);
  if (!window) return false;
  return today.getTime() < window.start.getTime();
}

function activeShipments(shipments: PoLifecycleShipmentRef[]) {
  return shipments.filter((s) => PO_ACTIVE_SHIPMENT_STATUSES.has(s.status));
}

function isWithinShippingWindow(
  shipments: PoLifecycleShipmentRef[],
  today: Date,
): boolean {
  return activeShipments(shipments).some((shipment) => {
    const start = parseDate(shipment.estimated_departure_date);
    const end = parseDate(shipment.expected_delivery_date);
    if (!start || !end) return false;
    return isDateInRange(today, start, end);
  });
}

function sumLifecyclePaymentsInPoCurrency(
  payments: PoLifecyclePaymentRef[],
  poCurrency: string,
  purposeMatcher?: (purpose: string) => boolean,
): number {
  return payments
    .filter(
      (payment) =>
        (payment.currency ?? poCurrency) === poCurrency &&
        (!purposeMatcher || purposeMatcher(payment.purpose)),
    )
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function paymentSummary(input: PoLifecycleInput) {
  const poCurrency = input.currency ?? DEFAULT_PO_CURRENCY;
  const schedule = resolvePaymentSchedule({
    down_payment_pct: input.down_payment_pct,
    discount_amount: input.discount_amount,
    tax_pct: input.tax_pct,
    pph_pct: input.pph_pct,
    other_charges: input.other_charges,
    committed_invoice_total: input.committed_invoice_total,
    committed_down_payment: input.committed_down_payment,
    committed_balance: input.committed_balance,
    payment_amounts_committed_at: input.payment_amounts_committed_at,
    lines: input.lines.map(
      (line) =>
        ({
          qty_ordered: line.qty_ordered,
          qty_received: line.qty_received,
          unit_cost: line.unit_cost ?? null,
          is_closed: line.is_closed ?? false,
        }) as PurchaseOrderLine,
    ),
  });

  const paidDown = sumLifecyclePaymentsInPoCurrency(
    input.payments,
    poCurrency,
    isDownPaymentPurpose,
  );
  const paidBalance = sumLifecyclePaymentsInPoCurrency(
    input.payments,
    poCurrency,
    isBalancePaymentPurpose,
  );

  return {
    downStatus: paymentFulfillmentStatus(
      schedule.downPayment,
      paidDown,
      poCurrency,
    ),
    balanceStatus: paymentFulfillmentStatus(
      schedule.balance,
      paidBalance,
      poCurrency,
    ),
  };
}

function receiptState(
  lines: PoLifecycleInput["lines"],
): { anyReceived: boolean; allReceived: boolean } {
  const anyReceived = lines.some((l) => Number(l.qty_received) > 0);
  const allReceived = lines.every(
    (l) =>
      l.is_closed || Number(l.qty_received) >= Number(l.qty_ordered),
  );
  return { anyReceived, allReceived };
}

export function derivePoStatus(
  input: PoLifecycleInput,
  today: Date = startOfDay(new Date()),
): PoStatus {
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "planned") return "planned";

  const { anyReceived, allReceived } = receiptState(input.lines);
  if (allReceived && anyReceived) return "received";
  if (anyReceived) return "in_transit";

  const { downStatus, balanceStatus } = paymentSummary(input);
  const downPaid = downStatus !== "underpaid";
  const balancePaid = balanceStatus !== "underpaid";

  const shipments = activeShipments(input.shipments);
  const hasActiveShipment = shipments.length > 0;
  const inShippingWindow = isWithinShippingWindow(input.shipments, today);

  if (balancePaid && inShippingWindow) return "in_transit";

  if (!downPaid) return "ordered";

  if (isWithinProductionWindow(input, today)) return "in_production";
  if (hasActiveShipment && !inShippingWindow) return "in_production";
  if (productionWindowNotYetStarted(input, today)) return "ordered";

  return "in_production";
}

export function derivePoDisplayStatus(
  input: PoLifecycleInput,
  today: Date = startOfDay(new Date()),
): string {
  if (input.status === "cancelled") return "cancelled";

  const { anyReceived, allReceived } = receiptState(input.lines);
  if (input.status === "received" || (allReceived && anyReceived)) {
    return "received";
  }
  if (anyReceived && !allReceived) return "partially_received";

  return derivePoStatus(input, today);
}
