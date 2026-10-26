import { createAdminClient } from "@/lib/supabase/admin";

export async function purchaseOrderOwnsLarkInstance(
  purchaseOrderId: string,
  instanceCode: string,
): Promise<boolean> {
  const code = instanceCode.trim();
  if (!code) return false;
  const supabase = createAdminClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("lark_instance_code")
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (po?.lark_instance_code === code) return true;

  const { data: rows } = await supabase
    .from("purchase_order_lark_submissions")
    .select("id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("lark_instance_code", code)
    .limit(1);
  return (rows?.length ?? 0) > 0;
}
