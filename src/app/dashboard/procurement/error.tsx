"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ProcurementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Procurement] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-stone-900">
        Something went wrong
      </h2>
      <p className="max-w-sm text-sm text-stone-500">
        {error.message || "An unexpected error occurred in the procurement module."}
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
