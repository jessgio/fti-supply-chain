import type { PoStatus } from "@/types/database";

export const STATUS_LABELS: Record<PoStatus, string> = {
  planned: "Planned",
  ordered: "Ordered",
  in_production: "In production",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

export const STATUS_STYLES: Record<PoStatus, string> = {
  planned: "bg-stone-100 text-stone-700",
  ordered: "bg-sky-100 text-sky-800",
  in_production: "bg-indigo-100 text-indigo-800",
  in_transit: "bg-amber-100 text-amber-800",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-700",
};

export const STATUS_FLOW: PoStatus[] = [
  "planned",
  "ordered",
  "in_production",
  "in_transit",
  "received",
];

export function nextStatus(status: PoStatus): PoStatus | null {
  const idx = STATUS_FLOW.indexOf(status);
  return idx >= 0 && idx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[idx + 1]
    : null;
}

export async function downloadPoPdf(
  poId: string,
  poNumber: string,
): Promise<void> {
  const res = await fetch(`/api/procurement/pos/${poId}/pdf`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Failed to generate PDF",
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${poNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
