import type { StatusUpdateScopedSku } from "@/types/database";
import { SkuProductLabel } from "@/components/status-updates/sku-product-label";

interface PoProductsListProps {
  products: StatusUpdateScopedSku[];
  compact?: boolean;
}

export function PoProductsList({
  products,
  compact = false,
}: PoProductsListProps) {
  if (products.length === 0) return null;

  return (
    <div className={compact ? "mt-1" : "mt-3"}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {products.length === 1 ? "Product on PO" : "Products on PO"}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {products.map((product) => (
          <li
            key={product.sku_id}
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
