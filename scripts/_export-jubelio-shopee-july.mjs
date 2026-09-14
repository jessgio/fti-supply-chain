import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = fs.readFileSync(".env.local", "utf8");
function get(key) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const sb = createClient(
  get("NEXT_PUBLIC_SUPABASE_URL"),
  get("SUPABASE_SERVICE_ROLE_KEY"),
);

const { data, error } = await sb.rpc("get_sop_monthly_actuals", {
  p_start: "2026-07-01",
  p_end: "2026-07-31",
});
if (error) {
  console.error(error);
  process.exit(1);
}

const { data: channels, error: chErr } = await sb
  .from("sales_channels")
  .select("id, name")
  .eq("name", "SHOPEE");
if (chErr) {
  console.error(chErr);
  process.exit(1);
}
const shopeeId = channels[0]?.id;
const rows = (data ?? []).filter((r) => r.channel_id === shopeeId);

const { data: skus, error: skuErr } = await sb.from("skus").select("id, sku_code");
if (skuErr) {
  console.error(skuErr);
  process.exit(1);
}
const codeById = new Map(skus.map((s) => [s.id, s.sku_code]));

const bySku = new Map();
for (const r of rows) {
  if (Number(r.sale_year) !== 2026 || Number(r.sale_month) !== 7) continue;
  const sku = codeById.get(r.sku_id);
  if (!sku) continue;
  const cur = bySku.get(sku) ?? { sku, qty: 0, net: 0 };
  cur.qty += Number(r.qty);
  cur.net += Number(r.net_sales);
  bySku.set(sku, cur);
}

const out = [...bySku.values()]
  .map((r) => ({
    sku: r.sku,
    qty: Math.round(r.qty * 10000) / 10000,
    net: Math.round(r.net * 100) / 100,
  }))
  .sort((a, b) => a.sku.localeCompare(b.sku));

const dest =
  "C:/Users/jessi/.cursor/projects/c-Users-jessi-Projects-fti-supply-chain/jubelio-shopee-july.json";
fs.writeFileSync(dest, JSON.stringify(out));
console.log("wrote", out.length, "skus", "qty", out.reduce((s, r) => s + r.qty, 0), "net", out.reduce((s, r) => s + r.net, 0));
