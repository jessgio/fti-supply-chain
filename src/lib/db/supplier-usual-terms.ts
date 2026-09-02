import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSupplierUsualTerms,
  type SupplierPoTermRow,
  type SupplierUsualTerms,
} from "@/lib/procurement/supplier-usual-terms";

const TERM_SELECT =
  "id, down_payment_pct, tax_pct, order_date, created_at, status";

const HISTORY_LIMIT = 200;

export async function getSupplierUsualTerms(
  supabase: SupabaseClient,
  supplierId: string,
  options?: { excludePoId?: string | null },
): Promise<SupplierUsualTerms | null> {
  let query = supabase
    .from("purchase_orders")
    .select(TERM_SELECT)
    .eq("supplier_id", supplierId)
    .neq("status", "cancelled")
    .order("order_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const excludePoId = options?.excludePoId?.trim();
  if (excludePoId) {
    query = query.neq("id", excludePoId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: SupplierPoTermRow[] = (data ?? []).map((row) => ({
    down_payment_pct:
      row.down_payment_pct == null ? null : Number(row.down_payment_pct),
    tax_pct: row.tax_pct == null ? null : Number(row.tax_pct),
    order_date: (row.order_date as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  }));

  return computeSupplierUsualTerms(supplierId, rows);
}
