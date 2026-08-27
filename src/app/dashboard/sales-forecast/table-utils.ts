import { cn } from "@/lib/utils";

/** Sticky left offsets: identity + stock + L3M qty + L6M qty. */
export const FREEZE = {
  id: "left-0 min-w-[18rem] w-[18rem] px-5",
  stock: "left-[18rem] min-w-[5.75rem] w-[5.75rem] px-3 tabular-nums",
  l3m: "left-[23.75rem] min-w-[6.25rem] w-[6.25rem] px-3 tabular-nums",
  l6m: "left-[30rem] min-w-[6.25rem] w-[6.25rem] px-3 tabular-nums",
} as const;

export const FREEZE_EDGE = "shadow-[4px_0_8px_-4px_rgba(28,25,23,0.18)]";

export function freezeHead(col: string): string {
  return cn(
    "sticky top-0 z-30 bg-stone-50 py-2.5 font-medium shadow-[inset_0_-1px_0_#e7e5e4]",
    col,
  );
}

export function freezeBody(col: string, bg: string): string {
  return cn("sticky z-20 py-2.5", col, bg);
}

export function draftKey(skuId: string, month: number): string {
  return `${skuId}:${month}`;
}

/** Blank so the qty/disc placeholders stay visible when the plan is zero. */
export function planDraftValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "";
  return String(value);
}

export function isPlanMonth(
  month: number,
  currentMonth: number,
  readOnly: boolean,
): boolean {
  if (readOnly) return false;
  return month >= currentMonth;
}
