import * as fs from "node:fs";
import * as XLSX from "xlsx";

const files = [
  "samples/FTI Stock.xlsx",
  "samples/FTI Product Franchises.xlsx",
  "samples/FTI Bundles and Components.xlsx",
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log("MISSING", file);
    continue;
  }
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true });
  console.log("\n===", file, "===");
  console.log("Sheets:", wb.SheetNames);
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      defval: "",
      header: 1,
    });
    console.log("Sheet:", name, "rows:", rows.length);
    console.log("Header:", rows[0]);
    console.log("Sample:", rows[1]);
    console.log("Sample2:", rows[2]);
  }
}

const stockWb = XLSX.read(fs.readFileSync("samples/FTI Stock.xlsx"), {
  type: "buffer",
});
const stockRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  stockWb.Sheets["Data1"],
  { defval: "" },
);
const withSku = stockRows.filter((r) => r.SKU && r.SKU !== "-").slice(0, 3);
const withQty = stockRows
  .filter((r) => Number(r.Tersedia) > 0)
  .slice(0, 3);
const bundles = stockRows
  .filter((r) => String(r.is_bundle).toLowerCase() !== "tidak")
  .slice(0, 3);
const locations = [...new Set(stockRows.map((r) => r.Lokasi))];
console.log("\n--- FTI Stock analysis ---");
console.log("withSku:", withSku);
console.log("withQty:", withQty);
console.log("bundles:", bundles);
console.log("locations:", locations);
console.log(
  "counts:",
  stockRows.length,
  "sku",
  stockRows.filter((r) => r.SKU && r.SKU !== "-").length,
  "tersedia>0",
  stockRows.filter((r) => Number(r.Tersedia) > 0).length,
);
