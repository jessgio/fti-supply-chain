"use client";

import { useParams } from "next/navigation";
import { FormulaTrackerFormPage } from "@/components/product-development/formula-tracker-form";

export default function NewFormulaTrackerEntryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  return <FormulaTrackerFormPage projectId={projectId} />;
}
