import {
  resolveProductLineLabel,
  showSkuCodeSubline,
} from "@/lib/procurement/product-line-label";

interface SkuProductLabelProps {
  sku_code: string;
  sku_name: string | null;
  suffix?: string;
  layout?: "inline" | "stacked";
}

export function SkuProductLabel({
  sku_code,
  sku_name,
  suffix = "",
  layout = "inline",
}: SkuProductLabelProps) {
  const label = resolveProductLineLabel({ sku_code, sku_name });
  const showCode = showSkuCodeSubline({ sku_code, sku_name });

  if (layout === "stacked") {
    return (
      <span className="min-w-0">
        <span className="font-medium text-stone-900">
          {label}
          {suffix}
        </span>
        {showCode ? (
          <span className="block truncate text-xs text-stone-500">{sku_code}</span>
        ) : null}
      </span>
    );
  }

  return (
    <span>
      <span className="font-medium text-stone-900">
        {label}
        {suffix}
      </span>
      {showCode ? (
        <span className="text-stone-500"> · {sku_code}</span>
      ) : null}
    </span>
  );
}
