import type { SupabaseClient } from "@supabase/supabase-js";
import type { PurchaseOrder } from "@/types/database";
import { DEFAULT_PO_CURRENCY } from "@/lib/procurement/currencies";
import { paymentAmountIdr } from "@/lib/procurement/payment-idr";
import { getRateToIdr } from "@/lib/procurement/fx-rates";
import { poFxDate } from "@/lib/procurement/open-po-value";
import { computePoInvoiceTotals } from "@/lib/procurement/po-totals";
import { listPurchaseOrders } from "@/lib/db/procurement";

export type PaymentLedgerSortKey =
  | "payment_date"
  | "amount_idr"
  | "po_number"
  | "purpose"
  | "payment_request_number";

export interface PaymentLedgerRow {
  id: string;
  payment_date: string;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  amount_idr: number | null;
  payment_request_number: string;
  purpose: string;
  po_id: string;
  po_number: string;
  supplier_name: string | null;
  po_currency: string;
  po_status: string;
}

export interface PaymentPurposeIssue {
  po_id: string;
  po_number: string;
  po_currency: string;
  expected_amount: number;
  paid_amount: number;
  variance_amount: number;
  variance_idr: number;
  status: "underpaid" | "overpaid";
}

export interface PaymentDashboardSummary {
  month_label: string;
  month_payments_idr: number;
  balance_remaining_idr: number;
  unpaid_po_count: number;
  down_payment_under: number;
  down_payment_over: number;
  balance_payment_under: number;
  balance_payment_over: number;
  down_payment_issues: PaymentPurposeIssue[];
  balance_payment_issues: PaymentPurposeIssue[];
}

export interface ListPaymentLedgerParams {
  search?: string;
  purpose?: string;
  month?: string;
  sort?: PaymentLedgerSortKey;
  sortDir?: "asc" | "desc";
}

type PaymentRow = {
  id: string;
  po_id: string;
  payment_date: string;
  amount: number;
  payment_request_number: string;
  currency: string;
  exchange_rate: number | null;
  purpose: string;
  purchase_orders: {
    po_number: string;
    currency: string;
    status: string;
    suppliers: { name: string } | null;
  } | null;
};

function normalizePurpose(purpose: string): string {
  return purpose.trim().toLowerCase();
}

function isDownPaymentPurpose(purpose: string): boolean {
  return normalizePurpose(purpose) === "down payment";
}

function isBalancePaymentPurpose(purpose: string): boolean {
  return normalizePurpose(purpose) === "balance payment";
}

function matchesSearch(row: PaymentLedgerRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    row.po_number.toLowerCase().includes(q) ||
    row.payment_request_number.toLowerCase().includes(q) ||
    row.purpose.toLowerCase().includes(q) ||
    (row.supplier_name?.toLowerCase().includes(q) ?? false)
  );
}

function compareRows(
  a: PaymentLedgerRow,
  b: PaymentLedgerRow,
  key: PaymentLedgerSortKey,
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;
  let cmp = 0;
  switch (key) {
    case "payment_date":
      cmp = a.payment_date.localeCompare(b.payment_date);
      break;
    case "amount_idr":
      cmp = (a.amount_idr ?? 0) - (b.amount_idr ?? 0);
      break;
    case "po_number":
      cmp = a.po_number.localeCompare(b.po_number);
      break;
    case "purpose":
      cmp = a.purpose.localeCompare(b.purpose);
      break;
    case "payment_request_number":
      cmp = a.payment_request_number.localeCompare(b.payment_request_number);
      break;
  }
  return cmp * sign;
}

export async function listPaymentLedger(
  supabase: SupabaseClient,
  params: ListPaymentLedgerParams = {},
): Promise<PaymentLedgerRow[]> {
  const sort = params.sort ?? "payment_date";
  const sortDir = params.sortDir ?? "desc";

  let query = supabase
    .from("po_payments")
    .select(
      "id, po_id, payment_date, amount, payment_request_number, currency, exchange_rate, purpose, " +
        "purchase_orders(po_number, currency, status, suppliers(name))",
    );

  if (params.month) {
    const [year, month] = params.month.split("-").map(Number);
    if (year && month) {
      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      query = query.gte("payment_date", from).lte("payment_date", to);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: PaymentLedgerRow[] = [];
  for (const row of (data ?? []) as unknown as PaymentRow[]) {
    const po = row.purchase_orders;
    if (!po) continue;

    const amountIdr = await paymentAmountIdr({
      amount: Number(row.amount),
      currency: row.currency ?? "IDR",
      exchange_rate:
        row.exchange_rate === null ? null : Number(row.exchange_rate),
      payment_date: row.payment_date,
    });

    const ledgerRow: PaymentLedgerRow = {
      id: row.id,
      payment_date: row.payment_date,
      amount: Number(row.amount),
      currency: row.currency ?? "IDR",
      exchange_rate:
        row.exchange_rate === null ? null : Number(row.exchange_rate),
      amount_idr: amountIdr,
      payment_request_number: row.payment_request_number,
      purpose: row.purpose,
      po_id: row.po_id,
      po_number: po.po_number,
      supplier_name: po.suppliers?.name ?? null,
      po_currency: po.currency ?? DEFAULT_PO_CURRENCY,
      po_status: po.status,
    };

    if (params.purpose?.trim()) {
      if (
        normalizePurpose(ledgerRow.purpose) !==
        normalizePurpose(params.purpose)
      ) {
        continue;
      }
    }
    if (params.search?.trim() && !matchesSearch(ledgerRow, params.search)) {
      continue;
    }

    rows.push(ledgerRow);
  }

  rows.sort((a, b) => compareRows(a, b, sort, sortDir));
  return rows;
}

const PAYMENT_VARIANCE_TOLERANCE_IDR = 1000;

type RawPayment = {
  amount: number;
  currency: string;
  exchange_rate: number | null;
  purpose: string;
  payment_date: string;
};

function poCurrencyTolerance(currency: string): number {
  if (currency === "IDR" || currency === "JPY" || currency === "KRW") return 1;
  return 0.01;
}

function sumPurposePaymentsInPoCurrency(
  payments: RawPayment[],
  poCurrency: string,
  purposeMatcher: (purpose: string) => boolean,
): number {
  return payments
    .filter(
      (payment) =>
        purposeMatcher(payment.purpose) &&
        (payment.currency ?? DEFAULT_PO_CURRENCY) === poCurrency,
    )
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
}

/** Prefer logged exchange rates from matching payments; fall back to PO order-date FX. */
function idrRateForVariance(
  payments: RawPayment[],
  poCurrency: string,
  poFxRate: number,
  purposeMatcher: (purpose: string) => boolean,
): number {
  if (poCurrency === "IDR") return 1;

  const relevant = payments.filter(
    (payment) =>
      purposeMatcher(payment.purpose) &&
      payment.currency === poCurrency &&
      payment.exchange_rate != null &&
      payment.exchange_rate > 0,
  );

  if (relevant.length === 0) return poFxRate;

  let totalAmount = 0;
  let weightedRate = 0;
  for (const payment of relevant) {
    const amount = Number(payment.amount);
    totalAmount += amount;
    weightedRate += amount * Number(payment.exchange_rate);
  }
  return totalAmount > 0 ? weightedRate / totalAmount : poFxRate;
}

function purposeIssue(
  po: PurchaseOrder,
  poCurrency: string,
  expectedAmount: number,
  paidAmount: number,
  idrRate: number,
): PaymentPurposeIssue | null {
  const variance = paidAmount - expectedAmount;
  if (Math.abs(variance) <= poCurrencyTolerance(poCurrency)) return null;

  const varianceIdr =
    poCurrency === "IDR"
      ? Math.round(variance)
      : Math.round(variance * idrRate);

  return {
    po_id: po.id,
    po_number: po.po_number,
    po_currency: poCurrency,
    expected_amount: expectedAmount,
    paid_amount: paidAmount,
    variance_amount: variance,
    variance_idr: varianceIdr,
    status: variance < 0 ? "underpaid" : "overpaid",
  };
}

export async function computePaymentDashboardSummary(
  supabase: SupabaseClient,
): Promise<PaymentDashboardSummary> {
  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [monthRows, purchaseOrders, allPaymentsResult] = await Promise.all([
    listPaymentLedger(supabase, { month: monthKey }),
    listPurchaseOrders(supabase),
    supabase
      .from("po_payments")
      .select(
        "id, po_id, payment_date, amount, currency, exchange_rate, purpose",
      ),
  ]);

  if (allPaymentsResult.error) throw allPaymentsResult.error;

  const paymentsByPo = new Map<string, (typeof allPaymentsResult.data)[number][]>();
  for (const payment of allPaymentsResult.data ?? []) {
    const list = paymentsByPo.get(payment.po_id) ?? [];
    list.push(payment);
    paymentsByPo.set(payment.po_id, list);
  }

  const monthPaymentsIdr = monthRows.reduce(
    (sum, row) => sum + (row.amount_idr ?? 0),
    0,
  );

  let balanceRemainingIdr = 0;
  let unpaidPoCount = 0;
  const downPaymentIssues: PaymentPurposeIssue[] = [];
  const balancePaymentIssues: PaymentPurposeIssue[] = [];

  const rateCache = new Map<string, number>();
  async function poRate(po: PurchaseOrder): Promise<number> {
    const currency = po.currency ?? DEFAULT_PO_CURRENCY;
    if (currency === "IDR") return 1;
    const date = poFxDate(po);
    const key = `${currency}:${date}`;
    if (!rateCache.has(key)) {
      rateCache.set(key, await getRateToIdr(currency, date));
    }
    return rateCache.get(key)!;
  }

  for (const po of purchaseOrders) {
    if (po.status === "cancelled") continue;

    const poCurrency = po.currency ?? DEFAULT_PO_CURRENCY;
    const totals = computePoInvoiceTotals(po);
    const rate = await poRate(po);
    const invoiceIdr = Math.round(totals.invoiceTotal * rate);

    const poPayments = (paymentsByPo.get(po.id) ?? []).map((payment) => ({
      amount: Number(payment.amount),
      currency: payment.currency ?? DEFAULT_PO_CURRENCY,
      exchange_rate:
        payment.exchange_rate === null
          ? null
          : Number(payment.exchange_rate),
      purpose: payment.purpose,
      payment_date: payment.payment_date,
    }));

    let paidTotalIdr = 0;
    for (const payment of poPayments) {
      paidTotalIdr += await paymentAmountIdr({
        amount: payment.amount,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        payment_date: payment.payment_date,
      });
    }

    const paidDownPoCurrency = sumPurposePaymentsInPoCurrency(
      poPayments,
      poCurrency,
      isDownPaymentPurpose,
    );
    const paidBalancePoCurrency = sumPurposePaymentsInPoCurrency(
      poPayments,
      poCurrency,
      isBalancePaymentPurpose,
    );

    const remaining = Math.max(0, invoiceIdr - paidTotalIdr);
    if (remaining > PAYMENT_VARIANCE_TOLERANCE_IDR) {
      balanceRemainingIdr += remaining;
      unpaidPoCount += 1;
    }

    const downIdrRate = idrRateForVariance(
      poPayments,
      poCurrency,
      rate,
      isDownPaymentPurpose,
    );
    const balanceIdrRate = idrRateForVariance(
      poPayments,
      poCurrency,
      rate,
      isBalancePaymentPurpose,
    );

    const downIssue = purposeIssue(
      po,
      poCurrency,
      totals.downPayment,
      paidDownPoCurrency,
      downIdrRate,
    );
    if (downIssue) downPaymentIssues.push(downIssue);

    const balanceIssue = purposeIssue(
      po,
      poCurrency,
      totals.finalPayment,
      paidBalancePoCurrency,
      balanceIdrRate,
    );
    if (balanceIssue) balancePaymentIssues.push(balanceIssue);
  }

  return {
    month_label: monthLabel,
    month_payments_idr: monthPaymentsIdr,
    balance_remaining_idr: balanceRemainingIdr,
    unpaid_po_count: unpaidPoCount,
    down_payment_under: downPaymentIssues.filter((i) => i.status === "underpaid")
      .length,
    down_payment_over: downPaymentIssues.filter((i) => i.status === "overpaid")
      .length,
    balance_payment_under: balancePaymentIssues.filter(
      (i) => i.status === "underpaid",
    ).length,
    balance_payment_over: balancePaymentIssues.filter(
      (i) => i.status === "overpaid",
    ).length,
    down_payment_issues: downPaymentIssues,
    balance_payment_issues: balancePaymentIssues,
  };
}
