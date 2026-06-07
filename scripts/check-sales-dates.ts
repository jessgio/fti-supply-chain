import * as fs from "node:fs";
import { parseSalesExcel } from "../src/lib/excel/parse";
import { createAdminClient } from "../src/lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const buffer = fs.readFileSync("samples/FTI Sales.xlsx").buffer;
  console.time("parse");
  const rows = await parseSalesExcel(buffer.slice(0));
  console.timeEnd("parse");

  const byYear = new Map<string, number>();
  let min = "9999-99-99";
  let max = "0000-00-00";
  for (const r of rows) {
    byYear.set(r.sale_date.slice(0, 4), (byYear.get(r.sale_date.slice(0, 4)) ?? 0) + 1);
    if (r.sale_date < min) min = r.sale_date;
    if (r.sale_date > max) max = r.sale_date;
  }
  console.log("Parsed range:", min, "to", max);
  console.log("By year:", Object.fromEntries([...byYear.entries()].sort()));

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sales_records")
    .select("sale_date")
    .order("sale_date", { ascending: true });
  if (error) throw error;

  const dbByYear = new Map<string, number>();
  let dbMin = "9999-99-99";
  let dbMax = "0000-00-00";
  for (const r of data ?? []) {
    const d = r.sale_date as string;
    dbByYear.set(d.slice(0, 4), (dbByYear.get(d.slice(0, 4)) ?? 0) + 1);
    if (d < dbMin) dbMin = d;
    if (d > dbMax) dbMax = d;
  }
  console.log("DB rows:", data?.length ?? 0);
  console.log("DB range:", dbMin, "to", dbMax);
  console.log("DB by year:", Object.fromEntries([...dbByYear.entries()].sort()));
}

main().catch(console.error);
