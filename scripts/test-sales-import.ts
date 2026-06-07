import * as fs from "node:fs";
import { parseSalesExcel } from "../src/lib/excel/parse";
import { importSales } from "../src/lib/db/uploads";
import { createAdminClient } from "../src/lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const limit = Number(process.argv[2] ?? 0);
  const buffer = fs.readFileSync("samples/FTI Sales.xlsx").buffer;
  console.time("parse");
  let rows = await parseSalesExcel(buffer.slice(0));
  console.timeEnd("parse");
  console.log("parsed", rows.length);
  if (limit > 0) rows = rows.slice(0, limit);

  const supabase = createAdminClient();
  console.time("import");
  try {
    const result = await importSales(supabase, rows, "FTI Sales.xlsx");
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
