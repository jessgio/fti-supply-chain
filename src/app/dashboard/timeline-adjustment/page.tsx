"use client";

import { CalendarRange } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { TimelineAdjustmentWorkspace } from "@/components/timeline-adjustment/timeline-adjustment-workspace";

export default function TimelineAdjustmentPage() {
  return (
    <PageShell wide>
      <div className="mb-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-6 w-6 text-emerald-700" />
          <h1 className="text-2xl font-semibold text-stone-900">
            Timeline Adjustment
          </h1>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Plan production milestones backwards from a warehouse delivery date, or
          forwards from a project start date. Save timelines per product and adjust
          lead times to match each SKU.
        </p>
      </div>

      <TimelineAdjustmentWorkspace />
    </PageShell>
  );
}
