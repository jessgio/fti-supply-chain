import * as fs from "node:fs";
import { createAdminClient } from "../src/lib/supabase/admin";
import { buildRestockPlanFromSeries, type SkuForecastInput } from "../src/lib/forecast/demand";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const supabase = createAdminClient();
  console.time("rpc");
  const { data, error } = await supabase.rpc("get_sku_forecast_base", {
    p_history_days: 90,
    p_ewma_days: 30,
  });
  console.timeEnd("rpc");
  if (error) throw error;

  const inputs: SkuForecastInput[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      sku_code: String(row.sku_code),
      franchise_name: row.franchise_name ? String(row.franchise_name) : null,
      qty_on_hand: Number(row.qty_on_hand),
      stock_as_of: row.stock_as_of ? String(row.stock_as_of) : null,
      history_days: Number(row.history_days ?? 0),
      demand_start_date: row.demand_start_date
        ? String(row.demand_start_date)
        : null,
      first_sale_date: row.first_sale_date
        ? String(row.first_sale_date)
        : null,
      demand_qtys: (row.demand_qtys as number[] | null)?.map(Number) ?? [],
    }),
  );

  console.log("skus", inputs.length);
  console.time("plan");
  const plan = buildRestockPlanFromSeries(inputs);
  console.timeEnd("plan");
  console.log("recommendations", plan.length);
  console.log("urgent", plan.filter((r) => (r.days_until_stockout ?? 999) <= 14).length);
}

main().catch(console.error);
