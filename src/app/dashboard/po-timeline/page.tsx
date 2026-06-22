"use client";

import { useCallback, useEffect, useState } from "react";
import { GanttChart } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { MasterPoTimelineGantt } from "@/components/procurement/master-po-timeline-gantt";
import type { PoTimelineEntry } from "@/types/database";

export default function PoTimelinePage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PoTimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/timeline");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load timeline");
      setPurchaseOrders(data.purchase_orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  return (
    <PageShell wide>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <GanttChart className="h-6 w-6 text-emerald-700" />
          <h1 className="text-2xl font-semibold text-stone-900">PO Timeline</h1>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Master Gantt view of production and shipping for all ongoing purchase
          orders.
        </p>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-stone-500">Loading timeline…</p>
      ) : error ? (
        <p className="py-12 text-center text-sm text-rose-600">{error}</p>
      ) : (
        <MasterPoTimelineGantt purchaseOrders={purchaseOrders} />
      )}
    </PageShell>
  );
}
