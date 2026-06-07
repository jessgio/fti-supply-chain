import * as fs from "node:fs";
import { parseStockExcel } from "../src/lib/excel/parse";
import { importStock } from "../src/lib/db/uploads";
import { createAdminClient } from "../src/lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const limit = Number(process.argv[2] ?? 0);
  const buffer = fs.readFileSync("samples/FTI Stock.xlsx").buffer;
  console.time("parse");
  let rows = parseStockExcel(buffer.slice(0));
  console.timeEnd("parse");
  console.log("parsed", rows.length);
  if (limit > 0) rows = rows.slice(0, limit);

  const supabase = createAdminClient();
  console.time("import");
  try {
    const result = await importStock(supabase, rows, "FTI Stock.xlsx");
    console.timeEnd("import");
    console.log("ok", result);
  } catch (err) {
    console.timeEnd("import");
    console.error("failed", err);
    if (err && typeof err === "object") {
      console.error("details", JSON.stringify(err, null, 2));
    }
    process.exit(1);
  }
}

main();
