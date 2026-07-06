import { SkuProductLabel } from "@/components/status-updates/sku-product-label";
import type { PoTimelineLineItem } from "@/components/procurement/po-timeline-po-link";

interface PoTimelineProductsProps {
  products: PoTimelineLineItem[];
}

export function PoTimelineProducts({ products }: PoTimelineProductsProps) {
  if (products.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {products.length === 1 ? "Product on PO" : "Products on PO"}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {products.map((product) => (
          <li
            key={product.sku_code}
            className="rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700"
          >
            <SkuProductLabel
              sku_code={product.sku_code}
              sku_name={product.sku_name}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
