"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShipmentApRequestForm } from "@/components/lark/shipment-ap-request-form";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { isApFormCurrency, type ApFormCurrency } from "@/lib/lark/ap-form";
import {
  SHIPMENT_AP_INVOICE_LABELS,
  shipmentPaymentParts,
} from "@/lib/lark/shipment-ap";
import type { ShipmentApContext } from "@/lib/db/shipment-lark";
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUS_STYLES,
  type ShipmentStatus,
} from "@/lib/shipments/constants";
import { formatNumber } from "@/lib/utils";
import type { Supplier } from "@/types/database";

type ApPayload = ShipmentApContext & { suppliers: Supplier[] };

export default function ShipmentPaymentDetailPage() {
  const params = useParams();
  const shipmentId = params.id as string;
  const [data, setData] = useState<ApPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/ap`);
      const payload = (await res.json()) as ApPayload & { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Failed to load shipment");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [shipmentId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading) {
    return (
      <PageShell wide>
        <p className="py-12 text-center text-sm text-stone-500">
          Loading shipment payment…
        </p>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell wide>
        <Link
          href="/dashboard/shipment-payments"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to shipment payments
        </Link>
        <p className="py-12 text-center text-sm text-rose-600">
          {error ?? "Shipment not found."}
        </p>
      </PageShell>
    );
  }

  const { shipment, remarks, project, taxAmount, taxCurrency, poSuppliers, taxSupplierText, submissions, suppliers } =
    data;
  const taxCurrencySafe: ApFormCurrency = isApFormCurrency(taxCurrency)
    ? taxCurrency
    : "IDR";
  const { productNames, qty } = shipmentPaymentParts(shipment);
  const taxSubs = submissions.filter((s) => s.invoice_kind === "tax");
  const shippingSubs = submissions.filter((s) => s.invoice_kind === "shipping");

  return (
    <PageShell wide>
      <Link
        href="/dashboard/shipment-payments"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to shipment payments
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-stone-900">
              {shipment.shipment_number}
            </h1>
            <Badge
              className={
                SHIPMENT_STATUS_STYLES[shipment.status as ShipmentStatus]
              }
            >
              {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {productNames.join(", ") || "Shipment"}
            {qty > 0 ? ` · ${formatNumber(qty)} pcs` : ""}
          </p>
          <p className="mt-2 text-sm text-stone-600">
            {(shipment.purchase_orders ?? []).map((po, index) => (
              <span key={po.id}>
                {index > 0 ? ", " : null}
                <PoHoverLink poId={po.id} poNumber={po.po_number} />
              </span>
            ))}
          </p>
        </div>
        <Link
          href={`/dashboard/shipments/${shipment.id}`}
          className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Open shipment
        </Link>
      </div>

      <p className="mb-6 max-w-3xl text-sm text-stone-600">
        Request a tax invoice and a shipping invoice independently for the same
        shipment. Remarks are prefilled as{" "}
        <span className="font-medium text-stone-800">{remarks}</span>.
      </p>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{SHIPMENT_AP_INVOICE_LABELS.tax}</CardTitle>
            <CardDescription>
              Goods value for this shipment, paid to the PO supplier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShipmentApRequestForm
              shipmentId={shipment.id}
              invoiceKind="tax"
              remarks={remarks}
              project={project}
              suppliers={suppliers}
              poSuppliers={poSuppliers}
              taxSupplierText={taxSupplierText}
              taxAmount={taxAmount}
              taxCurrency={taxCurrencySafe}
              submissions={taxSubs}
              onSubmitted={() => void load()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{SHIPMENT_AP_INVOICE_LABELS.shipping}</CardTitle>
            <CardDescription>
              Freight / forwarder invoice. Pick a supplier and fill payment
              details like a purchase order.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ShipmentApRequestForm
              shipmentId={shipment.id}
              invoiceKind="shipping"
              remarks={remarks}
              project={project}
              suppliers={suppliers}
              poSuppliers={poSuppliers}
              taxSupplierText={taxSupplierText}
              taxAmount={0}
              taxCurrency="IDR"
              submissions={shippingSubs}
              onSubmitted={() => void load()}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
