export type UploadType = "sales" | "stock" | "mappings";

export type TimeGrain = "day" | "week" | "month" | "year";

export interface ProductFranchise {
  id: string;
  name: string;
  slug: string;
}

export interface SalesChannel {
  id: string;
  name: string;
}

export interface Sku {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_id: string | null;
  is_bundle: boolean;
  is_active: boolean;
  /** Primary packaging material (UB, EFLUTE, JAR, PUMP, etc.) — supply chain only. */
  is_packaging: boolean;
  retail_price: number | null;
}

export interface PackagingSkuRow {
  id: string;
  sku_code: string;
  name: string | null;
  is_packaging: boolean;
  qty_on_hand: number;
  on_order_qty: number;
  stock_as_of: string | null;
  /** Packaging qty implied by linked finished-goods restock batches. */
  suggested_from_fg_restock: number;
  /** Net PO qty after on-hand and on-order packaging stock. */
  recommended_po_qty: number;
  linked_products: PackagingLinkContribution[];
}

export interface PackagingLinkContribution {
  product_sku_code: string;
  product_name: string | null;
  qty_per_unit: number;
  fg_restock_qty: number | null;
  contribution: number;
}

export interface ProductPackagingLink {
  id: string;
  product_sku_id: string;
  product_sku_code: string;
  product_name: string | null;
  packaging_sku_id: string;
  packaging_sku_code: string;
  packaging_name: string | null;
  qty_per_unit: number;
}

export interface PackagingPoLine {
  po_id: string;
  po_number: string;
  po_status: PoStatus;
  supplier_name: string | null;
  expected_date: string | null;
  sku_code: string;
  qty_ordered: number;
  qty_received: number;
  qty_open: number;
}

export interface BundleComponent {
  bundle_sku_code: string;
  component_sku_code: string;
  qty_per_bundle: number;
}

export interface SalesRow {
  sale_date: string;
  channel: string;
  sku_code: string;
  qty_sold: number;
  net_sales: number;
  retail_price?: number;
}

export interface StockRow {
  sku_code: string;
  location: string;
  qty_on_hand: number;
  as_of_date: string;
  retail_price?: number;
}

export interface MappingRow {
  sku_code: string;
  franchise_name: string;
  sku_name?: string;
}

export interface FranchiseGrowthPoint {
  period: string;
  franchise_id: string;
  franchise_name: string;
  channel_id: string;
  channel_name: string;
  total_qty: number;
  total_net_sales: number;
  /** Run-rate EOM projection when the period is still in progress. */
  projected_qty?: number | null;
  projected_net_sales?: number | null;
  is_partial?: boolean;
  /** Raw MTD comparison vs prior period. */
  qty_mom_mtd_pct?: number | null;
  sales_mom_mtd_pct?: number | null;
  qty_yoy_mtd_pct?: number | null;
  sales_yoy_mtd_pct?: number | null;
  /** Run-rate projected comparison vs prior period (same as MoM/YoY when period is complete). */
  qty_mom_eom_pct?: number | null;
  sales_mom_eom_pct?: number | null;
  qty_yoy_eom_pct?: number | null;
  sales_yoy_eom_pct?: number | null;
  qty_mom_pct: number | null;
  sales_mom_pct: number | null;
  qty_yoy_pct: number | null;
  sales_yoy_pct: number | null;
}

/** Coverage of sales data within a period (from daily rows). */
export interface PeriodCoverage {
  period: string;
  isPartial: boolean;
  lastSaleDate: string | null;
  daysElapsed: number;
  daysInPeriod: number;
}

export type VelocityClass = "fast" | "normal" | "slow";
export type DemandPattern = "npd" | "volatile" | "steady";

export interface RestockRecommendation {
  sku_code: string;
  franchise_name: string | null;
  /** Fast / normal / slow vs other SKUs in the same franchise (Fcst/day tertiles). */
  velocity_class: VelocityClass;
  /** NPD (< 3 mo since launch), volatile, or steady monthly demand. */
  demand_pattern: DemandPattern;
  first_sale_date: string | null;
  current_stock: number;
  on_order_qty: number;
  covered_by_po: boolean;
  /** True when on-hand + on-order inventory is at or below the reorder point. */
  needs_reorder: boolean;
  avg_daily_demand: number;
  /** L3M/L6M blend before Ramadan / Q4 uplift. */
  base_forecast_daily_demand: number;
  forecast_daily_demand: number;
  /** 1 = no uplift; >1 when reorder window overlaps Ramadan or Q4. */
  seasonal_uplift_multiplier: number;
  seasonal_uplift_reasons: string[];
  days_until_stockout: number | null;
  projected_stockout_date: string | null;
  /** Expected arrival of the earliest open PO batch (when POs exist). */
  earliest_incoming_batch_date: string | null;
  /**
   * True when on-hand stock empties before the earliest incoming batch arrives,
   * i.e. there is a projected out-of-stock period with no coverage in between.
   */
  has_stockout_gap: boolean;
  /** Expected arrival of the latest open PO batch (when POs exist). */
  incoming_batch_arrival_date: string | null;
  /** When the latest incoming PO batch runs out after current stock is consumed (FIFO). */
  incoming_batch_stockout_date: string | null;
  recommended_restock_qty: number;
  reorder_point: number;
  safety_stock: number;
  lead_time_days: number;
  reorder_lead_days: number;
  confidence: "low" | "medium" | "high";
}

export interface ForecastInsight {
  summary: string;
  highlights: string[];
  risks: string[];
}

export type PoStatus =
  | "planned"
  | "ordered"
  | "in_transit"
  | "received"
  | "cancelled";

export interface Supplier {
  id: string;
  name: string;
  lead_time_days: number;
  contact: string | null;
  notes: string | null;
  created_at?: string;
}

export interface PurchaseOrderLine {
  id: string;
  po_id: string;
  sku_id: string;
  sku_code?: string;
  sku_name?: string | null;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number | null;
  receipts?: PoReceipt[];
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  lines?: PurchaseOrderLine[];
}

export interface PoReceipt {
  id: string;
  po_line_id: string;
  qty_received: number;
  received_date: string;
  location: string;
}

export type UserRole = "admin" | "supply_chain" | "sales_marketing" | "viewer";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
}
