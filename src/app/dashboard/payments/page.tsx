"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageShell } from "@/components/dashboard/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { PaymentHoverLink } from "@/components/procurement/payment-hover-link";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatNumber } from "@/lib/utils";
import { formatPoMoney } from "@/lib/procurement/currencies";
import { PO_PAYMENT_PURPOSES } from "@/lib/procurement/po-payment-purposes";
import type {
  PaymentDashboardSummary,
  PaymentLedgerRow,
  PaymentLedgerSortKey,
} from "@/lib/db/payments";

type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  columnKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  columnKey: PaymentLedgerSortKey;
  activeKey: PaymentLedgerSortKey;
  sortDir: SortDir;
  onSort: (key: PaymentLedgerSortKey) => void;
}) {
  const active = activeKey === columnKey;
  return (
    <th className="py-2 pr-4">
      <button
        type="button"
        className="flex items-center gap-1 whitespace-nowrap text-left font-medium text-stone-500 hover:text-stone-800"
        onClick={() => onSort(columnKey)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}

function fmtIdr(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatPoMoney(value, "IDR");
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentLedgerRow[]>([]);
  const [summary, setSummary] = useState<PaymentDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [purpose, setPurpose] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<PaymentLedgerSortKey>("payment_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (purpose) params.set("purpose", purpose);
      params.set("sort", sortKey);
      params.set("sort_dir", sortDir);

      const res = await fetch(`/api/payments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load payments");
      setPayments(data.payments ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, purpose, sortKey, sortDir]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const mismatchCount = useMemo(() => {
    if (!summary) return 0;
    return (
      summary.down_payment_under +
      summary.down_payment_over +
      summary.balance_payment_under +
      summary.balance_payment_over
    );
  }, [summary]);

  const mismatchHint = useMemo(() => {
    if (!summary || mismatchCount === 0) {
      return "Down and balance payments match expected amounts";
    }
    const parts: string[] = [];
    if (summary.down_payment_under > 0) {
      parts.push(`${summary.down_payment_under} under on down payment`);
    }
    if (summary.down_payment_over > 0) {
      parts.push(`${summary.down_payment_over} over on down payment`);
    }
    if (summary.balance_payment_under > 0) {
      parts.push(`${summary.balance_payment_under} under on balance`);
    }
    if (summary.balance_payment_over > 0) {
      parts.push(`${summary.balance_payment_over} over on balance`);
    }
    return parts.join(" · ");
  }, [summary, mismatchCount]);

  function handleSort(key: PaymentLedgerSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "payment_date" ? "desc" : "desc");
    }
  }

  const groupedByPo = useMemo(() => {
    const map = new Map<
      string,
      {
        po_id: string;
        po_number: string;
        supplier_name: string | null;
        payments: PaymentLedgerRow[];
        totalIdr: number;
      }
    >();
    for (const payment of payments) {
      const existing = map.get(payment.po_id);
      if (existing) {
        existing.payments.push(payment);
        existing.totalIdr += payment.amount_idr ?? 0;
      } else {
        map.set(payment.po_id, {
          po_id: payment.po_id,
          po_number: payment.po_number,
          supplier_name: payment.supplier_name,
          payments: [payment],
          totalIdr: payment.amount_idr ?? 0,
        });
      }
    }
    return Array.from(map.values())
      .map((group) => ({
        ...group,
        payments: [...group.payments].sort((a, b) =>
          b.payment_date.localeCompare(a.payment_date),
        ),
      }))
      .sort((a, b) =>
        (b.payments[0]?.payment_date ?? "").localeCompare(
          a.payments[0]?.payment_date ?? "",
        ),
      );
  }, [payments]);

  function togglePo(poId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(poId)) next.delete(poId);
      else next.add(poId);
      return next;
    });
  }

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-stone-900">
            <Banknote className="h-6 w-6 text-stone-500" />
            PO payments
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            All supplier payments logged against purchase orders, converted to
            IDR using the recorded exchange rate or order-date FX fallback.
          </p>
        </div>
        <Link
          href="/dashboard/procurement"
          className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Procurement
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={`Payments this month${summary ? ` (${summary.month_label})` : ""}`}
          value={summary ? fmtIdr(summary.month_payments_idr) : "—"}
          hint="Total IDR paid in the current calendar month"
          tone="info"
        />
        <StatCard
          label="Balance remaining"
          value={summary ? fmtIdr(summary.balance_remaining_idr) : "—"}
          hint={
            summary
              ? `${summary.unpaid_po_count} PO${summary.unpaid_po_count === 1 ? "" : "s"} not fully paid`
              : "Outstanding invoice balance across active POs"
          }
          tone={
            summary && summary.balance_remaining_idr > 0 ? "warning" : "success"
          }
        />
        <StatCard
          label="Payment mismatches"
          value={summary ? String(mismatchCount) : "—"}
          hint={mismatchHint}
          tone={mismatchCount > 0 ? "danger" : "success"}
        />
      </div>

      {summary && mismatchCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Down / balance payment flags
            </CardTitle>
            <CardDescription>
            Compared in each PO&apos;s invoice currency; IDR amounts are for internal spend tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {summary.down_payment_issues.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-stone-700">Down payment</p>
                <ul className="space-y-1 text-stone-600">
                  {summary.down_payment_issues.map((issue) => (
                    <li key={`down-${issue.po_id}`} className="flex flex-wrap gap-x-2">
                      <span className="font-medium text-stone-900">
                        {issue.po_number}
                      </span>
                      <span
                        className={
                          issue.status === "underpaid"
                            ? "text-amber-800"
                            : "text-rose-700"
                        }
                      >
                        {issue.status === "underpaid" ? "Underpaid" : "Overpaid"}{" "}
                        by {formatPoMoney(Math.abs(issue.variance_amount), issue.po_currency)}
                        {issue.po_currency !== "IDR" && (
                          <span className="text-stone-500">
                            {" "}
                            ({fmtIdr(Math.abs(issue.variance_idr))})
                          </span>
                        )}
                      </span>
                      <span className="text-stone-400">
                        (paid {formatPoMoney(issue.paid_amount, issue.po_currency)}{" "}
                        vs expected{" "}
                        {formatPoMoney(issue.expected_amount, issue.po_currency)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.balance_payment_issues.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-stone-700">Balance payment</p>
                <ul className="space-y-1 text-stone-600">
                  {summary.balance_payment_issues.map((issue) => (
                    <li
                      key={`balance-${issue.po_id}`}
                      className="flex flex-wrap gap-x-2"
                    >
                      <span className="font-medium text-stone-900">
                        {issue.po_number}
                      </span>
                      <span
                        className={
                          issue.status === "underpaid"
                            ? "text-amber-800"
                            : "text-rose-700"
                        }
                      >
                        {issue.status === "underpaid" ? "Underpaid" : "Overpaid"}{" "}
                        by {formatPoMoney(Math.abs(issue.variance_amount), issue.po_currency)}
                        {issue.po_currency !== "IDR" && (
                          <span className="text-stone-500">
                            {" "}
                            ({fmtIdr(Math.abs(issue.variance_idr))})
                          </span>
                        )}
                      </span>
                      <span className="text-stone-400">
                        (paid {formatPoMoney(issue.paid_amount, issue.po_currency)}{" "}
                        vs expected{" "}
                        {formatPoMoney(issue.expected_amount, issue.po_currency)})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment ledger</CardTitle>
          <CardDescription>
            Search by PO number, request number, supplier, or purpose.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[12rem] flex-1 text-sm">
              <span className="mb-1 block text-stone-600">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="PO, request #, supplier…"
                />
              </div>
            </label>
            <label className="w-48 text-sm">
              <span className="mb-1 block text-stone-600">Purpose</span>
              <Select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="">All purposes</option>
                {PO_PAYMENT_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </label>
            {(search.trim() || purpose) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setPurpose("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {loading ? (
            <p className="text-sm text-stone-500">Loading payments…</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-stone-500">No payments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500">
                    <th className="w-8 py-2" />
                    <th className="py-2 pr-4">PO</th>
                    <th className="py-2 pr-4">Supplier</th>
                    <th className="py-2 pr-4">Payments</th>
                    <th className="py-2 pr-4 text-right">Total IDR</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedByPo.map((group) => {
                    const isOpen = expanded.has(group.po_id);
                    return (
                      <Fragment key={group.po_id}>
                        <tr className="border-b border-stone-100 hover:bg-stone-50/50">
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => togglePo(group.po_id)}
                              className="flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-stone-100"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-2 pr-4">
                            <PoHoverLink
                              poId={group.po_id}
                              poNumber={group.po_number}
                            />
                          </td>
                          <td className="py-2 pr-4 text-stone-600">
                            {group.supplier_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-stone-600">
                            {group.payments.length}
                          </td>
                          <td className="py-2 pr-4 text-right font-semibold text-stone-900">
                            {fmtIdr(group.totalIdr)}
                          </td>
                        </tr>
                        {isOpen &&
                          group.payments.map((payment) => (
                            <tr
                              key={payment.id}
                              className="border-b border-stone-100 bg-stone-50/60"
                            >
                              <td />
                              <td className="py-2 pr-4 pl-2 text-stone-700">
                                {payment.payment_date}
                              </td>
                              <td className="py-2 pr-4">
                                <PaymentHoverLink
                                  paymentId={payment.id}
                                  poId={payment.po_id}
                                  label={payment.payment_request_number}
                                />
                              </td>
                              <td className="py-2 pr-4 text-stone-700">
                                {payment.purpose}
                              </td>
                              <td className="py-2 pr-4 text-right font-medium text-stone-900">
                                {formatPoMoney(payment.amount, payment.currency)}
                                <span className="ml-2 text-xs text-stone-500">
                                  ({fmtIdr(payment.amount_idr)})
                                </span>
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
