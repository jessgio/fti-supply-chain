import * as fs from "node:fs";
import { createAdminClient } from "../src/lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const supabase = createAdminClient();
  for (const grain of ["month", "day"] as const) {
    console.time(`rpc-${grain}`);
    const { data, error } = await supabase.rpc("get_franchise_period_totals", {
      p_grain: grain,
      p_from: null,
      p_to: null,
      p_channel_id: null,
      p_franchise_id: null,
    });
    console.timeEnd(`rpc-${grain}`);
    if (error) {
      console.error(grain, error);
      continue;
    }
    console.log(grain, "rows", data?.length ?? 0);
  }

  console.time("rpc-paginated-month");
  const { fetchAllRpc } = await import("../src/lib/supabase/fetch-all");
  const all = await fetchAllRpc(supabase, "get_franchise_period_totals", {
    p_grain: "month",
    p_from: null,
    p_to: null,
    p_channel_id: null,
    p_franchise_id: null,
  });
  console.timeEnd("rpc-paginated-month");
  console.log("paginated total", all.length);
}

main().catch(console.error);
