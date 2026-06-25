"use client";

import { useSearchParams } from "next/navigation";
import { FormulaTrackerMasterTable } from "@/components/product-development/formula-tracker-master-table";

export default function FormulaTrackerPageClient() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? undefined;
  return <FormulaTrackerMasterTable highlightProjectId={projectId} />;
}
