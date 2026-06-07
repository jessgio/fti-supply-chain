import * as fs from "node:fs";
import * as XLSX from "xlsx";

const wb = XLSX.read(fs.readFileSync("samples/FTI Sales.xlsx"), {
  type: "buffer",
  cellDates: true,
  sheetRows: 20,
});
console.log("Sheets:", wb.SheetNames);
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    defval: "",
  });
  console.log("\nSheet:", name, "preview rows:", rows.length);
  console.log("Header:", rows[0]);
  for (let i = 1; i < Math.min(6, rows.length); i++) {
    console.log("Row", i + 1, ":", rows[i]);
  }
}

// Read more rows for bundle example
const fullWb = XLSX.read(fs.readFileSync("samples/FTI Sales.xlsx"), {
  type: "buffer",
  cellDates: true,
});
const sheet = fullWb.Sheets[fullWb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
  defval: "",
});
console.log("\nTotal rows:", rows.length);
const bundle = rows.filter((r) =>
  String(r.SKU ?? r.sku ?? "").startsWith("BND-"),
).slice(0, 3);
console.log("Bundle samples:", bundle);
const withHarga = rows.filter((r) => Number(r.Harga) > 0).slice(0, 3);
console.log("With Harga:", withHarga);
