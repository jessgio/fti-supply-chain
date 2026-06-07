import * as fs from "node:fs";
import * as path from "node:path";
import * as XLSX from "xlsx";

const outDir = path.join(process.cwd(), "samples");
fs.mkdirSync(outDir, { recursive: true });

const franchises = [
  { sku_code: "SKU-TEA-50", sku_name: "Island Tea 50g", franchise_name: "Island Tea" },
  { sku_code: "SKU-TEA-100", sku_name: "Island Tea 100g", franchise_name: "Island Tea" },
  { sku_code: "SKU-SOAP-01", sku_name: "Coconut Soap", franchise_name: "Island Bath" },
  { sku_code: "SKU-OIL-30", sku_name: "Body Oil 30ml", franchise_name: "Island Bath" },
];

const bundles = [
  { bundle_sku_code: "BUNDLE-GIFT-A", component_sku_code: "SKU-TEA-50", qty_per_bundle: 1 },
  { bundle_sku_code: "BUNDLE-GIFT-A", component_sku_code: "SKU-SOAP-01", qty_per_bundle: 2 },
];

const mappingWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  mappingWb,
  XLSX.utils.json_to_sheet(franchises),
  "Franchises",
);
XLSX.utils.book_append_sheet(
  mappingWb,
  XLSX.utils.json_to_sheet(bundles),
  "Bundles",
);
XLSX.writeFile(mappingWb, path.join(outDir, "sample-mappings.xlsx"));

const channels = ["Shopee", "Tokopedia", "Offline Retail"];
const skus = ["SKU-TEA-50", "SKU-TEA-100", "SKU-SOAP-01", "SKU-OIL-30", "BUNDLE-GIFT-A"];
const sales: Record<string, string | number>[] = [];

for (let month = 0; month < 6; month++) {
  for (let day = 1; day <= 28; day += 7) {
    const date = new Date(2025, month, day);
    const dateStr = date.toISOString().slice(0, 10);
    for (const channel of channels) {
      for (const sku of skus) {
        const base = sku.startsWith("BUNDLE") ? 3 : 8;
        const qty = base + ((month + day) % 5);
        sales.push({
          sale_date: dateStr,
          channel,
          sku_code: sku,
          qty_sold: qty,
          net_sales: qty * (sku.startsWith("BUNDLE") ? 185000 : 65000),
        });
      }
    }
  }
}

const salesWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(salesWb, XLSX.utils.json_to_sheet(sales), "Sales");
XLSX.writeFile(salesWb, path.join(outDir, "sample-sales.xlsx"));

console.log("Sample files written to samples/");
console.log("Sales: use samples/FTI Sales.xlsx (WMS export template)");
console.log("Stock: use samples/FTI Stock.xlsx (WMS export template)");
