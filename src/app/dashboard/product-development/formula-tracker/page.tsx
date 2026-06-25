import { Suspense } from "react";
import FormulaTrackerPageClient from "./formula-tracker-client";

export default function FormulaTrackerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-stone-500">Loading…</div>
      }
    >
      <FormulaTrackerPageClient />
    </Suspense>
  );
}
