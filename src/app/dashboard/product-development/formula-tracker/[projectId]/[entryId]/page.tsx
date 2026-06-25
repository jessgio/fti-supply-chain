"use client";

import { useParams } from "next/navigation";
import { FormulaTrackerFormPage } from "@/components/product-development/formula-tracker-form";

export default function EditFormulaTrackerEntryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const entryId = params.entryId as string;
  return (
    <FormulaTrackerFormPage projectId={projectId} entryId={entryId} />
  );
}
