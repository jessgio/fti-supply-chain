import type { ProductPackagingLink } from "@/types/database";

export interface PackagingBomExportRow {
  "Finished Good SKU": string;
  "Finished Good Name": string;
  "Packaging SKU": string;
  "Packaging Name": string;
  "Qty / FG Unit": number;
}

export function buildPackagingBomExportRows(
  links: ProductPackagingLink[],
): PackagingBomExportRow[] {
  return [...links]
    .sort((a, b) => {
      const byProduct = a.product_sku_code.localeCompare(b.product_sku_code);
      if (byProduct !== 0) return byProduct;
      return a.packaging_sku_code.localeCompare(b.packaging_sku_code);
    })
    .map((link) => ({
      "Finished Good SKU": link.product_sku_code,
      "Finished Good Name": link.product_name ?? "",
      "Packaging SKU": link.packaging_sku_code,
      "Packaging Name": link.packaging_name ?? "",
      "Qty / FG Unit": link.qty_per_unit,
    }));
}

export async function downloadPackagingBomXlsx(
  links: ProductPackagingLink[],
  filename?: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = buildPackagingBomExportRows(links);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Packaging BOM");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(
    workbook,
    filename ?? `packaging-bom-export-${stamp}.xlsx`,
  );
}
