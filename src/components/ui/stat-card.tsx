import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "danger" | "warning" | "info" | "success";

const TONE_CLASS: Record<Tone, string> = {
  default: "text-stone-900",
  danger: "text-rose-700",
  warning: "text-amber-700",
  info: "text-sky-700",
  success: "text-emerald-700",
};

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  active = false,
  onClick,
}: StatCardProps) {
  const interactive = Boolean(onClick);

  return (
    <Card
      className={cn(
        interactive && "cursor-pointer transition-shadow hover:shadow-md",
        active && "ring-2 ring-emerald-600 ring-offset-2",
      )}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <CardContent className="p-5">
        <p className="text-sm text-stone-500">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold", TONE_CLASS[tone])}>
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}
