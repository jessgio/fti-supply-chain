import * as fs from "node:fs";
import { parseStockExcel } from "../src/lib/excel/parse";

const buffer = fs.readFileSync("samples/FTI Stock.xlsx").buffer;
const rows = parseStockExcel(buffer.slice(0), "2025-06-06");
const locations = new Set(rows.map((r) => r.location));
const withStock = rows.filter((r) => r.qty_on_hand > 0);

console.log("Parsed rows:", rows.length);
console.log("Rows with Tersedia > 0:", withStock.length);
console.log("Unique SKUs:", new Set(rows.map((r) => r.sku_code)).size);
console.log("Warehouses:", locations.size);
console.log("Sample:", rows.find((r) => r.qty_on_hand > 0));
