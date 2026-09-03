import { formatDateShort, formatNumber } from "@/lib/utils";

export function OnOrderCell({
  qty,
  date,
  freeze,
}: {
  qty: number;
  date: string | null;
  freeze: string;
}) {
  return (
    <td className={freeze}>
      {qty > 0 ? (
        <div className="leading-tight">
          <div>{formatNumber(qty)}</div>
          <div className="text-[11px] font-normal text-stone-500">
            {date ? formatDateShort(date) : "No ETA"}
          </div>
        </div>
      ) : (
        "—"
      )}
    </td>
  );
}
