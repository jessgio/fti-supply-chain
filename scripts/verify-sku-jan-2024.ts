import * as fs from "node:fs";
import { parseMappingsExcel, parseSalesExcel } from "../src/lib/excel/parse";

const EXPECTED_JAN_2024: Record<string, number> = {
  "FCR-PRF-PLUMPINGCREAM-30ML": 677,
  "FCR-TGV-BARRIERMOISTUREGEL-20ML": 364,
  "FCR-TGV-BARRIERMOISTUREGEL-50ML": 196,
  "FSE-MGT-BRIGHTENINGSERUM-15ML": 336,
  "FWA-JBT-SOOTHINGGELCLEANSER-100ML": 472,
};

function sumSkuQty(
  sales: Awaited<ReturnType<typeof parseSalesExcel>>,
  bundles: {
    bundle_sku_code: string;
    component_sku_code: string;
    qty_per_bundle: number;
  }[],
  skuCode: string,
  yearMonth: string,
) {
  const inMonth = (d: string) => d.startsWith(yearMonth);
  const direct = sales
    .filter((r) => r.sku_code === skuCode && inMonth(r.sale_date))
    .reduce((s, r) => s + r.qty_sold, 0);

  let fromBundles = 0;
  for (const b of bundles.filter((b) => b.component_sku_code === skuCode)) {
    fromBundles += sales
      .filter((r) => r.sku_code === b.bundle_sku_code && inMonth(r.sale_date))
      .reduce((s, r) => s + r.qty_sold * b.qty_per_bundle, 0);
  }

  return direct + fromBundles;
}

async function main() {
  const salesBuf = fs.readFileSync("samples/FTI Sales.xlsx");
  console.log("Parsing sales (streaming)...");
  const sales = await parseSalesExcel(
    salesBuf.buffer.slice(
      salesBuf.byteOffset,
      salesBuf.byteOffset + salesBuf.byteLength,
    ),
  );
  console.log("Parsed rows:", sales.length);

  const mapBuf = fs.readFileSync("samples/FTI Bundles and Components.xlsx");
  const { bundles } = parseMappingsExcel(
    mapBuf.buffer.slice(
      mapBuf.byteOffset,
      mapBuf.byteOffset + mapBuf.byteLength,
    ),
  );

  console.log("\nJan 2024 SKU totals (singles + bundles), CANCELED excluded:");
  for (const [sku, expected] of Object.entries(EXPECTED_JAN_2024)) {
    const actual = Math.round(sumSkuQty(sales, bundles, sku, "2024-01"));
    const diff = actual - expected;
    console.log(
      `${sku}: expected=${expected} actual=${actual} diff=${diff >= 0 ? "+" : ""}${diff}`,
    );
  }
}

main().catch(console.error);
