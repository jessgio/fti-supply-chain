import * as fs from "node:fs";
import { parseSalesExcel } from "../src/lib/excel/parse";
import * as XLSX from "xlsx";

async function main() {
const file = "samples/FTI Sales.xlsx";
console.log("File size MB:", (fs.statSync(file).size / 1e6).toFixed(1));

const buffer = fs.readFileSync(file).buffer;
const start = Date.now();
const rows = await parseSalesExcel(buffer.slice(0));
console.log("Parsed rows:", rows.length, "in", Date.now() - start, "ms");
console.log("Sample:", rows[0]);

const wb = XLSX.read(fs.readFileSync(file), { type: "buffer", cellDates: true });
console.log("Sheets:", wb.SheetNames);
const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  wb.Sheets[wb.SheetNames[0]],
  { defval: "", raw: false },
);
console.log("Raw row count:", raw.length);
console.log("Raw keys:", Object.keys(raw[0] ?? {}));
console.log("Raw row 0:", raw[0]);
}

main().catch(console.error);
