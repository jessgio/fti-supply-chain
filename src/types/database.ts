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
  sop_group?: SopChannelGroup | null;
}

export type SopChannelGroup = "online" | "offline";

export interface SopMonthActual {
  qty: number;
  post_tax_net: number;
  /** Implied avg discount % from qty × RSP vs WMS net; null if unknown. */
  avg_discount_pct?: number | null;
}

export interface SopMonthPlan {
  projected_qty: number;
  avg_discount_pct: number;
  vat_in_net: number;
  post_tax_net: number;
  upload_id: string | null;
}

export interface SopBomComponent {
  sku_id: string;
  sku_code: string;
  qty_per_bundle: number;
  /** Component franchise; null when unmapped / packaging / unknown. */
  franchise_name: string | null;
  /** Component RSP for allocating bundle net sales across franchises. */
  retail_price: number | null;
}

export interface SopSkuRow {
  sku_id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  /** BOM lines for bundles; empty for singles. */
  bom_components: SopBomComponent[];
  franchise_name: string | null;
  retail_price: number | null;
  /** RSP in force for each calendar month of the loaded year. */
  rsp_by_month: Record<number, number | null>;
  current_stock: number;
  on_order_qty: number;
  projected_stockout_date: string | null;
  l3m_qty: number;
  l3m_post_tax: number;
  l6m_qty: number;
  l6m_post_tax: number;
  /** Count of L3M calendar months with qty &gt; 0 (0–3). */
  l3m_months_with_sales: number;
  /** True when L3M has fewer than 3 months with sales. */
  is_npd: boolean;
  remaining_year_qty: number;
  shortfall_qty: number;
  months: Record<
    number,
    {
      actual: SopMonthActual;
      plan: SopMonthPlan;
    }
  >;
}

export interface SopEligibleSkuRef {
  sku_id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  franchise_name: string | null;
}

export interface SopMonthlyTarget {
  month: number;
  target_net_sales_post_tax: number;
  planned_post_tax: number;
  gap: number;
}

export interface SopForecastUpload {
  id: string;
  sop_group: SopChannelGroup;
  year: number;
  filename: string;
  row_count: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface SopForecastPayload {
  year: number;
  group: SopChannelGroup;
  current_month: number;
  read_only: boolean;
  unmapped_channel_count: number;
  channels: Array<{
    id: string;
    name: string;
    sop_group: SopChannelGroup | null;
  }>;
  targets: SopMonthlyTarget[];
  rows: SopSkuRow[];
  /** Channel-inactive SKUs kept for sales reference (not in the main plan table). */
  inactive_rows: SopSkuRow[];
  uploads: SopForecastUpload[];
  inactive_sku_ids: string[];
}

export interface SopYearForecast {
  year: number;
  current_month: number;
  read_only: boolean;
  unmapped_channel_count: number;
  channels: SopForecastPayload["channels"];
  eligible_skus: SopEligibleSkuRef[];
  inactive_sku_ids: Record<SopChannelGroup, string[]>;
  groups: Record<SopChannelGroup, SopForecastPayload>;
}

export interface SalesAccuracySkuRow {
  sku_id: string;
  sku_code: string;
  name: string | null;
  is_bundle: boolean;
  franchise_name: string | null;
  plan_qty: number;
  actual_qty: number;
  plan_post_tax: number;
  actual_post_tax: number;
  wmape_qty: number | null;
  bias_qty: number | null;
  wmape_post_tax: number | null;
  bias_post_tax: number | null;
  sku_month_count: number;
}

/** Team (or SKU-set) accuracy metrics for one period. */
export interface SalesAccuracyMetrics {
  plan_qty: number;
  actual_qty: number;
  plan_post_tax: number;
  actual_post_tax: number;
  wmape_qty: number | null;
  bias_qty: number | null;
  wmape_post_tax: number | null;
  bias_post_tax: number | null;
  sku_count: number;
  sku_month_count: number;
}

export interface SalesAccuracyMonthSlice extends SalesAccuracyMetrics {
  month: number;
  skus: SalesAccuracySkuRow[];
}

/** Cumulative YTD accuracy through `through_month` (team totals only). */
export interface SalesAccuracyYtdRunningSlice extends SalesAccuracyMetrics {
  through_month: number;
}

export interface SalesAccuracyGroupSummary extends SalesAccuracyMetrics {
  group: SopChannelGroup | "combined";
  /** Full year-to-date (all completed months) SKU drill-down. */
  skus: SalesAccuracySkuRow[];
  /** One slice per completed calendar month. */
  months: SalesAccuracyMonthSlice[];
  /** Running annual: cumulative metrics after each completed month. */
  ytd_running: SalesAccuracyYtdRunningSlice[];
}

export interface SalesAccuracyPayload {
  year: number;
  current_month: number;
  completed_months: number[];
  groups: Record<SopChannelGroup, SalesAccuracyGroupSummary>;
  combined: SalesAccuracyGroupSummary;
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
  /** Extract / raw material from the extract catalog — PO + extract inbound. */
  is_extract: boolean;
  /** Flushing stock — keep visible, never recommend reorder. */
  is_clearance: boolean;
  retail_price: number | null;
  unit_cogs: number | null;
}

export interface SkuCogsRow {
  sku_id: string;
  sku_code: string;
  product_name: string | null;
  franchise_name: string | null;
  retail_price: number | null;
  unit_cogs: number | null;
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

/** Packaging material linked to a finished-good SKU (inventory forecast expand row). */
export interface ProductLinkedPackagingRow {
  packaging_sku_code: string;
  packaging_name: string | null;
  qty_per_unit: number;
  qty_on_hand: number;
  on_order_qty: number;
  /** Packaging units implied by this FG's restock or on-order batch. */
  need_from_product: number;
  /** Net PO qty for the packaging SKU across all linked finished goods. */
  recommended_po_qty: number;
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

/** Persisted bundle BOM row for UI editing (ids + display fields). */
export interface BundleBomLink {
  id: string;
  bundle_sku_id: string;
  bundle_sku_code: string;
  bundle_name: string | null;
  component_sku_id: string;
  component_sku_code: string;
  component_name: string | null;
  qty_per_bundle: number;
}

export interface BundleSkuOption {
  id: string;
  sku_code: string;
  name: string | null;
  is_active: boolean;
  component_count: number;
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

export type ContributionWindow = "mtd" | "ytd";

export interface FranchiseProductContribution {
  window_type: ContributionWindow;
  franchise_id: string;
  franchise_name: string;
  sku_code: string;
  product_name: string;
  total_qty: number;
  total_net_sales: number;
}

export interface ProductContributionMeta {
  as_of: string | null;
  mtd_from: string | null;
  ytd_from: string | null;
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
  /** Flushing stock — suppress reorder badges and restock qty. */
  is_clearance: boolean;
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

/**
 * Upcoming NPD: a SKU that has physical stock in the forecast locations but no
 * sales history, so it is excluded from the demand forecast. Surfaced on its
 * own so on-hand stock and incoming PO batches are still visible.
 */
export interface NpdStockRow {
  sku_code: string;
  sku_name: string | null;
  franchise_name: string | null;
  qty_on_hand: number;
  stock_as_of: string | null;
  /** Total open (un-received) qty across the SKU's incoming PO batches. */
  incoming_qty: number;
  /** Earliest expected arrival across open PO batches, if any has a date. */
  earliest_incoming_batch_date: string | null;
  /** Number of open PO batches (incl. those without an expected date). */
  open_batch_count: number;
}

export type PoStatus =
  | "planned"
  | "ordered"
  | "in_production"
  | "in_transit"
  | "received"
  | "cancelled";

export interface Supplier {
  id: string;
  name: string;
  lead_time_days: number;
  contact: string | null;
  address: string | null;
  pic_name: string | null;
  pic_email: string | null;
  pic_phone: string | null;
  payment_terms: string | null;
  lead_time_note: string | null;
  delivery_time: string | null;
  packaging_notes: string | null;
  beneficiary_name: string | null;
  beneficiary_account_number: string | null;
  swift_code: string | null;
  beneficiary_country: string | null;
  beneficiary_address: string | null;
  beneficiary_bank: string | null;
  beneficiary_bank_address: string | null;
  bank_code: string | null;
  branch_code: string | null;
  notes: string | null;
  created_at?: string;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  address: string | null;
  pic_name: string | null;
  pic_email: string | null;
  pic_phone: string | null;
  logo_path: string | null;
  updated_at?: string;
}

export interface SkuProductName {
  sku_id: string;
  sku_code: string;
  product_name: string | null;
}

export interface PurchaseOrderLine {
  id: string;
  po_id: string;
  sku_id: string;
  sku_code?: string;
  sku_name?: string | null;
  /** First placeholder SKU if this line was later remapped to an official SKU. */
  original_sku_id?: string | null;
  original_sku_code?: string | null;
  original_sku_name?: string | null;
  qty_ordered: number;
  qty_received: number;
  is_closed: boolean;
  unit_cost: number | null;
  receipts?: PoReceipt[];
}

export type LarkApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELED"
  | "DELETED";

export interface LarkUserDirectoryEntry {
  email: string;
  lark_open_id: string;
  display_name: string;
  is_default_approver: boolean;
  created_at?: string;
  updated_at?: string;
}

export type LarkPaymentPlanScope = "both" | "down_payment" | "balance";

export interface PurchaseOrderLarkSubmission {
  id: string;
  purchase_order_id: string;
  lark_instance_code: string;
  lark_serial_number: string | null;
  lark_approval_status: LarkApprovalStatus | null;
  lark_status_synced_at: string | null;
  payment_scope: LarkPaymentPlanScope;
  lark_expense_category: string | null;
  /** Total amount filed on this AP Form; frozen after submit/link. */
  submitted_amount: number | null;
  submitted_currency: string | null;
  /** Snapshot of plan rows sent to Lark. */
  plan_rows: Array<{
    dateYmd: string;
    amount: number;
    currency: string;
    remarks: string;
  }> | null;
  submitted_at: string;
}

export type ShipmentApInvoiceKind = "tax" | "shipping";

export interface ShipmentLarkSubmission {
  id: string;
  shipment_id: string;
  invoice_kind: ShipmentApInvoiceKind;
  supplier_id: string | null;
  supplier_name?: string | null;
  lark_instance_code: string;
  lark_serial_number: string | null;
  lark_approval_status: LarkApprovalStatus | null;
  lark_status_synced_at: string | null;
  lark_expense_category: string | null;
  submitted_amount: number | null;
  submitted_currency: string | null;
  plan_rows: Array<{
    dateYmd: string;
    amount: number;
    currency: string;
    remarks: string;
  }> | null;
  submitted_at: string;
}

export type PoDocumentType = "proforma_invoice";

export interface PoDocument {
  id: string;
  purchase_order_id: string;
  document_type: PoDocumentType;
  version_number: number;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  down_payment_pct: number;
  discount_amount: number;
  tax_pct: number;
  pph_pct: number;
  other_charges: number;
  currency: string;
  notes: string | null;
  /**
   * Frozen payment schedule after AP Form submit and/or first logged payment.
   * Expected DP/balance and PDF payment section use these instead of live lines.
   */
  committed_invoice_total?: number | null;
  committed_down_payment?: number | null;
  committed_balance?: number | null;
  payment_amounts_committed_at?: string | null;
  /** Optional FK to a pd_projects row — links this PO to a product development launch. */
  pd_project_id: string | null;
  pd_project_name?: string | null;
  pd_project_product_name?: string | null;
  /** Lark AP Form instance code after submission. */
  lark_instance_code?: string | null;
  /** Lark AP Form serial/reference number. */
  lark_serial_number?: string | null;
  lark_submitted_at?: string | null;
  lark_expense_category?: string | null;
  lark_approval_status?: LarkApprovalStatus | null;
  lark_status_synced_at?: string | null;
  created_at?: string;
  updated_at?: string;
  lines?: PurchaseOrderLine[];
  payments?: PoPayment[];
}

export interface PoReceipt {
  id: string;
  po_line_id: string;
  qty_received: number;
  received_date: string;
  location: string;
  batch_code?: string | null;
  expiry_date?: string | null;
}

export interface StockBatch {
  id: string;
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  batch_code: string | null;
  expiry_date: string | null;
  qty_received: number;
  location: string;
  received_date: string;
  po_number: string | null;
}

export interface PoPayment {
  id: string;
  po_id: string;
  payment_date: string;
  amount: number;
  payment_request_number: string;
  currency: string;
  exchange_rate: number | null;
  purpose: string;
  created_at?: string;
  updated_at?: string;
}

export type ExtractCategory =
  | "quality_control"
  | "rnd"
  | "production"
  | "inbound_supplier"
  | "destroy_defect"
  | "waste"
  | "uncategorized";

/** Whether a category's movement is an inbound (received) or outbound (issued). */
export type ExtractFlow = "in" | "out" | "neutral";

export interface ExtractCategoryRule {
  id: string;
  pattern: string;
  category: ExtractCategory;
  priority: number;
}

/** Manufacturer action code mapped to an internal category. */
export interface ExtractActionCodeMapping {
  id: string;
  action_code: string;
  category: ExtractCategory;
  created_at: string;
}

/** Manufacturer item name mapped to an FTI extract record. */
export interface ExtractItemNameMapping {
  id: string;
  manufacturer_name: string;
  extract_id: string;
  created_at: string;
}

/** A single ledger row parsed from a manufacturer screenshot. */
export interface ExtractTransaction {
  id: string;
  extract_id: string;
  txn_date: string;
  seq: number;
  order_no: string | null;
  tran_code: string | null;
  from_to: string | null;
  category: ExtractCategory;
  lot_no: string | null;
  entered_qty: number | null;
  received: number;
  issued: number;
  balance: number | null;
  status: string | null;
  remark: string | null;
  source_filename: string | null;
}

/** Per-category in/out totals over a window. */
export interface ExtractCategoryTotal {
  category: ExtractCategory;
  received: number;
  issued: number;
  txn_count: number;
}

/** Aggregate roll-up for one extract (optionally within a date range). */
export interface ExtractSummary {
  id: string;
  item_no: string;
  description: string | null;
  /** Manufacturer item name(s) from extract_item_name_mappings. */
  manufacturer_name: string | null;
  unit: string;
  txn_count: number;
  first_date: string | null;
  last_date: string | null;
  /** Running balance just before the window (or opening balance all-time). */
  starting_balance: number;
  /** Running balance at the end of the window (latest recorded balance). */
  ending_balance: number;
  total_received: number;
  total_issued: number;
  waste_issued: number;
  /** waste_issued / (starting_balance + total_received), as a percentage. */
  waste_pct: number | null;
  /** Outbound in the window, scaled to kg per year from the observation span. */
  usage_kg_per_year: number | null;
}

/** Extract detail payload: summary + filtered ledger + category breakdown. */
export interface ExtractDetail extends ExtractSummary {
  transactions: ExtractTransaction[];
  category_totals: ExtractCategoryTotal[];
}

/** A row coming back from the OCR parser, before it is committed. */
export interface ParsedExtractRow {
  txn_date: string;
  order_no: string | null;
  tran_code: string | null;
  from_to: string | null;
  lot_no: string | null;
  entered_qty: number | null;
  received: number;
  issued: number;
  balance: number | null;
  status: string | null;
  remark: string | null;
  /** Server-assigned: resolved category and checksum status for review. */
  category?: ExtractCategory;
  checksum_ok?: boolean;
  /** Balance implied by the running chain (prev + received - issued), if known. */
  expected_balance?: number | null;
}

export interface ParsedExtract {
  item_no: string;
  description: string | null;
  unit: string;
  rows: ParsedExtractRow[];
  source_path: string | null;
  source_filename: string | null;
  /** Manual entry only: opening balance when the ledger is empty. */
  opening_balance?: number;
  /** Manual entry only: linked ledger extract when known. */
  extract_id?: string;
}

export type ExtractSortKey =
  | "item_no"
  | "manufacturer_name"
  | "ending_balance"
  | "total_received"
  | "total_issued"
  | "waste_pct"
  | "txn_count"
  | "last_date";

export type ExtractTxnSortKey =
  | "txn_date"
  | "order_no"
  | "from_to"
  | "category"
  | "received"
  | "issued"
  | "balance";

export type ShipmentType = "sea" | "air" | "local";

export type ShipmentStatus = "planned" | "in_transit" | "delivered" | "closed";

export type InboundReceiveStatus =
  | "pending"
  | "partial"
  | "complete"
  | "short_received";

export type PoShortfallResolution = "leave_as_is" | "adjust_ordered";

export interface ShipmentItemRef {
  id: string;
  po_line_id: string;
  po_id: string;
  po_number: string;
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  quantity: number;
  qty_ordered: number;
  /** Qty already received against this shipment (open-inbound list only). */
  qty_previously_received?: number;
}

export interface ShipmentPoRef {
  id: string;
  po_number: string;
  supplier_name: string | null;
  items: ShipmentItemRef[];
}

export interface Shipment {
  id: string;
  shipment_number: string;
  shipment_type: ShipmentType;
  status: ShipmentStatus;
  estimated_departure_date: string;
  transit_days: number;
  delay_days: number;
  expected_delivery_date: string;
  notes: string | null;
  /** Ship-time shortfall intent; leave_as_is applied when inbound closes shipment. */
  po_shortfall_resolution?: PoShortfallResolution | null;
  created_at?: string;
  updated_at?: string;
  purchase_orders?: ShipmentPoRef[];
  required_documents?: ShipmentDocumentType[];
  missing_document_count?: number;
}

export type ShipmentDocumentType =
  | "commercial_invoice"
  | "packing_list"
  | "bill_of_lading"
  | "awb_label"
  | "coo_form_fe"
  | "pib"
  | "sppb"
  | "forwarder_invoice"
  | "lartas";

export type ShipmentDocumentVersionStatus = "draft" | "final";

export interface ShipmentDocumentVersion {
  id: string;
  shipment_id: string;
  document_type: ShipmentDocumentType;
  version_number: number;
  status: ShipmentDocumentVersionStatus;
  file_name: string;
  mime_type: string | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface ShipmentDocumentSummary {
  document_type: ShipmentDocumentType;
  required: boolean;
  latest_version: ShipmentDocumentVersion | null;
  version_count: number;
  has_final: boolean;
}

export interface ShipmentLineAllocation {
  po_line_id: string;
  po_id: string;
  po_number: string;
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  qty_ordered: number;
  qty_allocated: number;
  qty_available: number;
}

export interface InboundReceiveItem {
  id: string;
  po_line_id: string | null;
  sku_id: string | null;
  sku_code?: string;
  sku_name?: string | null;
  ordered_qty: number;
  received_qty: number;
  discrepancy: number;
}

export interface InboundReceive {
  id: string;
  receive_number: string | null;
  po_id: string | null;
  po_number?: string | null;
  supplier_name?: string | null;
  shipment_id: string | null;
  shipment_number?: string | null;
  receive_date: string;
  status: InboundReceiveStatus;
  received_by: string | null;
  notes: string | null;
  created_at?: string;
  items?: InboundReceiveItem[];
}

export interface PoTimelineEntry {
  id: string;
  po_number: string;
  supplier_name: string | null;
  status: PoStatus;
  display_status: string;
  created_at: string;
  order_date: string | null;
  expected_date: string | null;
  payments: Array<{ payment_date: string; purpose: string }>;
  shipments: Array<{
    id: string;
    shipment_number: string;
    estimated_departure_date: string;
    expected_delivery_date: string;
    delay_days: number;
    line_items: Array<{
      sku_code: string;
      sku_name: string | null;
      quantity: number;
    }>;
  }>;
  line_items: Array<{
    sku_code: string;
    sku_name: string | null;
    qty_ordered: number;
    qty_received: number;
  }>;
}

export type UserRole = "admin" | "supply_chain" | "sales_marketing" | "viewer";

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
}

// ── Product Development ──────────────────────────────────────────────────────

export type PdProjectStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export type PdPhaseStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "delayed";

export type PdDurationMode = "effective_days" | "working_days";

export type PdPhaseLinkType = "depends_on" | "parallel_with";

export interface PdPhaseLink {
  id: string;
  project_id: string;
  from_phase_id: string;
  to_phase_id: string;
  link_type: PdPhaseLinkType;
  created_at: string;
}

export type PdComponentType =
  | "formula"
  | "shades"
  | "ingredients"
  | "scents"
  | "packaging"
  | "unit_box"
  | "primary_packaging"
  | "secondary_packaging"
  | "applicator"
  | "other";

export interface PdProject {
  id: string;
  name: string;
  description: string | null;
  status: PdProjectStatus;
  product_name: string | null;
  launch_date: string | null;
  manufacturer: string | null;
  product_claim: string | null;
  net_weight: string | null;
  volume_test_result: string | null;
  retail_price: number | null;
  asp: number | null;
  pricing_rmb_rate: number | null;
  pricing_usd_rate: number | null;
  pricing_note: string | null;
  currency: string;
  key_ingredients: string | null;
  extract: string | null;
  full_inci_list: string | null;
  shades_list: string | null;
  ingredient_claims: string | null;
  ingredient_concept: string | null;
  colorant_source: string | null;
  scent_fragrance: string | null;
  precautions: string | null;
  halal_certification: string | null;
  stability_test: string | null;
  hript: string | null;
  efficacy_test: string | null;
  technical_sheet: string | null;
  master_view_data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdPhase {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_root_task: boolean;
  parent_phase_id: string | null;
  depends_on_phase_id: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  duration_text: string | null;
  duration_mode: PdDurationMode;
  actual_end_date: string | null;
  status: PdPhaseStatus;
  cycle_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdPhasePic {
  id: string;
  phase_id: string;
  profile_id: string;
  profile_name?: string | null;
}

export interface PdPhaseComponent {
  id: string;
  phase_id: string;
  component_type: PdComponentType;
  name: string;
  description: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PdPackagingItem {
  id: string;
  project_id: string;
  part_name: string;
  part_type: string | null;
  supplier_code: string | null;
  material_spec: string | null;
  sort_order: number;
}

export interface PdShadeFile {
  id: string;
  project_id: string;
  shade_name: string;
  lab_no: string | null;
  mpd_confirmation: string | null;
  bpom: string | null;
  gs1: string | null;
  sort_order: number;
}

export interface PdMasterShade {
  id: string;
  project_id: string;
  shade_name: string;
  lab_no: string | null;
  gs1: string | null;
  sort_order: number;
  created_at: string;
}

export type PdPricingLineKey =
  | "cogm"
  | "primary"
  | "secondary"
  | "extract"
  | "lartas";

export interface PdPricingLine {
  id: string;
  project_id: string;
  line_key: PdPricingLineKey;
  amount: number | null;
  moq: string | null;
  supplier_id: string | null;
  offer_note: string | null;
  sort_order: number;
  supplier_name?: string | null;
  supplier_pic_name?: string | null;
  supplier_pic_phone?: string | null;
  offer_letter?: PdFile | null;
  statement_letter?: PdFile | null;
}

export interface PdPantoneSwatch {
  id: string;
  project_id: string;
  color_name: string;
  pantone_code: string;
  sort_order: number;
  hex_color?: string | null;
  created_at: string;
  swatch_file?: PdFile | null;
}

export interface PdFile {
  id: string;
  project_id: string;
  phase_id: string | null;
  component_id: string | null;
  shade_file_id: string | null;
  master_shade_id: string | null;
  formula_tracker_entry_id: string | null;
  pricing_line_id: string | null;
  pantone_swatch_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_category: string | null;
  uploaded_by: string | null;
  created_at: string;
  download_url?: string | null;
}

export interface PdChatMessage {
  id: string;
  project_id: string;
  body: string;
  mentioned_user_ids: string[];
  author_id: string;
  author_name?: string | null;
  created_at: string;
}

export interface PdCycleNote {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string | null;
  notes: string;
  created_by: string | null;
  author_name?: string | null;
  created_at: string;
  updated_at: string;
}

export type StatusUpdateEntityType =
  | "po"
  | "payment"
  | "shipment"
  | "inbound"
  | "delivery_note"
  | "extract_delivery_note"
  | "primary_packaging_delivery_note";

export interface StatusUpdatePoProduct {
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  qty_ordered: number;
}

export interface StatusUpdateScopedSku {
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
}

export interface StatusUpdateEntityRef {
  entity_type: StatusUpdateEntityType;
  entity_id: string;
  entity_label?: string | null;
}

export interface StatusUpdate {
  id: string;
  sku_id: string;
  entity_type: StatusUpdateEntityType;
  entity_id: string;
  body: string;
  mentioned_user_ids: string[];
  author_id: string;
  author_name?: string | null;
  created_at: string;
  updated_at?: string | null;
  reply_count?: number;
  entity_label?: string | null;
  connected_refs?: StatusUpdateEntityRef[];
  applies_to_all_po_products?: boolean;
  scoped_skus?: StatusUpdateScopedSku[];
  /** Products this note applies to (resolved for display). */
  associated_products?: StatusUpdateScopedSku[];
}

export interface StatusUpdateReply {
  id: string;
  status_update_id: string;
  body: string;
  mentioned_user_ids: string[];
  author_id: string;
  author_name?: string | null;
  created_at: string;
}

export interface StatusUpdateSkuSummary {
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  franchise_name: string | null;
  update_count: number;
  latest_at: string;
  latest_preview: string | null;
}

export interface StatusUpdateSkuGroup {
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  franchise_name: string | null;
  latest_at: string;
  updates: StatusUpdate[];
}

export interface StatusUpdatePoGroup {
  po_id: string;
  po_number: string;
  supplier_name: string | null;
  latest_at: string;
  products: StatusUpdateScopedSku[];
  updates: StatusUpdate[];
}

export interface StatusUpdateRelatedEntity {
  id: string;
  entity_type: StatusUpdateEntityType;
  label: string;
  sublabel?: string | null;
  status?: string | null;
  date?: string | null;
  /** Parent PO when this record is connected to a purchase order. */
  po_id?: string | null;
}

export interface StatusUpdateEntityCount {
  entity_id: string;
  count: number;
  latest_at: string | null;
  latest_id: string | null;
}

export type StatusUpdateRecordEntityType = "po" | "payment" | "shipment";

export type UserNotificationSourceType =
  | "status_update"
  | "status_update_reply"
  | "sales_forecast_stock";

export interface UserNotification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  actor_name?: string | null;
  source_type: UserNotificationSourceType;
  source_id: string;
  status_update_id: string | null;
  body_preview: string;
  po_id: string | null;
  po_number: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
}

export interface PdPhaseInput {
  id?: string;
  /** Client-side id used to wire dependencies before rows exist in the DB. */
  client_id?: string;
  name: string;
  description?: string | null;
  sort_order: number;
  is_root_task?: boolean;
  parent_phase_id?: string | null;
  depends_on_phase_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_days?: number | null;
  duration_text?: string | null;
  duration_mode?: PdDurationMode;
  status?: PdPhaseStatus;
  depends_on_phase_ids?: string[];
  parallel_with_phase_ids?: string[];
  pic_profile_ids?: string[];
  components?: PdComponentInput[];
}

export interface PdComponentInput {
  id?: string;
  component_type: PdComponentType;
  name: string;
  description?: string | null;
  sort_order?: number;
}

export interface PdPhaseDetail extends PdPhase {
  pics: PdPhasePic[];
  components: PdPhaseComponent[];
  files: PdFile[];
  depends_on_phase_ids: string[];
  parallel_with_phase_ids: string[];
}

export interface PdProjectDetail extends PdProject {
  phases: PdPhaseDetail[];
  phase_links: PdPhaseLink[];
  packaging_items: PdPackagingItem[];
  shade_files: PdShadeFile[];
  master_shades: PdMasterShade[];
  pricing_lines: PdPricingLine[];
  packaging_asset_fields: Record<string, string | null>;
  pantone_swatches: PdPantoneSwatch[];
  files: PdFile[];
  cycle_notes: PdCycleNote[];
  npd_approved_entry: PdFormulaTrackerEntryDetail | null;
}

export interface PdGanttBar {
  phaseId: string;
  label: string;
  start: Date;
  end: Date;
  status: PdPhaseStatus;
  isShifted: boolean;
  dependsOnLabel: string | null;
  picNames: string[];
  isHeader: boolean;
  parentPhaseId: string | null;
  childCount: number;
}

export interface PdUpcomingPhase {
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export interface PdProjectSummary extends PdProject {
  phase_count: number;
  completed_phases: number;
  next_phase_name: string | null;
  estimated_end_date: string | null;
  cover_image_url: string | null;
  cover_image_id: string | null;
  days_until_launch: number | null;
  upcoming_phases_7d: PdUpcomingPhase[];
}

export interface PdFormulaTrackerEntry {
  id: string;
  project_id: string;
  brief_concept: string | null;
  target_ingredient: string | null;
  product_name: string | null;
  product_project_id: string | null;
  parent_items: string | null;
  sample_date: string | null;
  sample_trial_no: string | null;
  lab_no: string | null;
  texture_review: string | null;
  scent: string | null;
  texture_benchmark: string | null;
  color_benchmark: string | null;
  benchmark_change_confirmation: string | null;
  benchmark_change_reason: string | null;
  efficacy_result: string | null;
  main_feedback: string | null;
  benchmark_changed_from_previous_feedback: string | null;
  benchmark_change_from_previous_explanation: string | null;
  texture_feedback: string | null;
  scent_feedback: string | null;
  scent_review: string | null;
  efficacy_feedback: string | null;
  summary: string | null;
  npd_confirmation: string | null;
  confirmation_date: string | null;
  confirmed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PdFormulaTrackerEntryDetail extends PdFormulaTrackerEntry {
  brief_files: PdFile[];
  project_name?: string | null;
}

export type PdFormulaTrackerEntryInput = Omit<
  PdFormulaTrackerEntry,
  "id" | "project_id" | "created_by" | "created_at" | "updated_at"
>;

export interface PdFormulaTrackerMasterProject {
  project_id: string;
  project_name: string;
  product_name: string | null;
  project_status: string;
  trial_count: number;
  first_trial_date: string | null;
  last_trial_date: string | null;
  total_span_days: number | null;
  /** Days from first sample_date to the latest approved confirmation_date, if any. */
  days_first_sample_to_approval: number | null;
  /** Days from last sample_date before approval to the approved confirmation_date. */
  days_last_sample_to_approval: number | null;
  /** The confirmation_date of the most recent approved entry, if any. */
  approved_confirmation_date: string | null;
  entries: PdFormulaTrackerEntryDetail[];
}

// ─── Timeline Adjustment ──────────────────────────────────────────────────────

export type TimelineAnchor = "start" | "warehouse_delivery";

export interface ProductTimelineItem {
  id: string;
  timeline_id: string;
  product_name: string;
  sku_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProductTimeline {
  id: string;
  products: ProductTimelineItem[];
  anchor: TimelineAnchor;
  anchor_date: string;
  primary_packaging_days: number;
  secondary_packaging_days: number;
  extract_days: number;
  send_to_manufacturer_days: number;
  manufacturer_filling_days: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductTimelineInput = Pick<
  ProductTimeline,
  | "anchor"
  | "anchor_date"
  | "primary_packaging_days"
  | "secondary_packaging_days"
  | "extract_days"
  | "send_to_manufacturer_days"
  | "manufacturer_filling_days"
> & {
  products: Array<Pick<ProductTimelineItem, "product_name" | "sku_id">>;
};

export interface TimelineProductOption {
  id: string;
  sku_code: string;
  name: string | null;
  franchise_name: string | null;
  is_active: boolean;
  projected_stockout_date: string | null;
  days_until_stockout: number | null;
  current_stock: number;
}

export interface SecondaryPackagingInboundCosmax {
  id: string;
  item_code: string;
  product_name: string;
  is_active: boolean;
  created_at?: string;
}

export interface DeliveryNoteSettings {
  id: string;
  recipient_company: string;
  recipient_address: string;
  recipient_pic_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  updated_at?: string;
}

export interface DeliveryNotePortal {
  id: string;
  access_token: string;
  label: string;
  updated_at?: string;
}

export interface DeliveryNoteLine {
  id: string;
  delivery_note_id: string;
  packaging_item_id: string | null;
  item_code: string;
  product_name: string;
  cartons: number;
  pcs_per_carton: number;
  total_pcs: number;
}

export interface DeliveryNote {
  id: string;
  dn_number: string;
  po_id: string | null;
  po_number: string;
  supplier_id: string | null;
  delivery_date: string;
  recipient_name: string;
  created_at?: string;
  lines?: DeliveryNoteLine[];
  supplier_name?: string | null;
}

export interface ExtractCode {
  id: string;
  item_code: string;
  extract_name: string;
  is_active: boolean;
  extract_id?: string | null;
  created_at?: string;
}

export interface ExtractInboundDeliveryNoteLine {
  id: string;
  delivery_note_id: string;
  extract_code_id: string | null;
  item_code: string;
  extract_name: string;
  quantity: number;
  uom_kg: number;
  total_kg: number;
}

export interface ExtractInboundDeliveryNote {
  id: string;
  dn_number: string;
  po_id: string | null;
  po_number: string;
  delivery_date: string;
  recipient_name: string;
  special_instruction: string | null;
  created_at?: string;
  lines?: ExtractInboundDeliveryNoteLine[];
}

export interface ExtractInboundDnSettings {
  id: string;
  recipient_company: string;
  recipient_address: string;
  recipient_pic_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  updated_at?: string;
}

export interface ExtractInboundPoOption {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  sku_names: string[];
}

export interface PrimaryPackagingInboundCosmax {
  id: string;
  item_code: string;
  product_name: string;
  is_active: boolean;
  created_at?: string;
}

export interface PrimaryPackagingDnSettings {
  id: string;
  recipient_company: string;
  recipient_address: string;
  recipient_pic_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
  updated_at?: string;
}

export interface PrimaryPackagingDeliveryNoteLine {
  id: string;
  delivery_note_id: string;
  packaging_item_id: string | null;
  item_code: string;
  product_name: string;
  cartons: number;
  pcs_per_carton: number;
  total_pcs: number;
}

export interface PrimaryPackagingDeliveryNote {
  id: string;
  dn_number: string;
  po_id: string | null;
  po_number: string;
  delivery_date: string;
  recipient_name: string;
  created_at?: string;
  lines?: PrimaryPackagingDeliveryNoteLine[];
}

export interface ProductExtractFormula {
  id: string;
  product_sku_id: string;
  product_sku_code: string;
  product_name: string | null;
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  extract_kg_per_unit: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductExtractFormulaInput {
  product_sku_id: string;
  extract_id: string;
  extract_kg_per_unit: number;
  notes?: string | null;
}

export interface ManufacturerProductionReport {
  id: string;
  po_id: string;
  po_number: string;
  manufacturer: string;
  invoice_number: string | null;
  report_date: string;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ManufacturerProductionReportLine {
  id: string;
  report_id: string;
  po_line_id: string | null;
  sku_id: string;
  sku_code: string;
  sku_name: string | null;
  qty_produced: number;
  uom: string;
  created_at?: string;
}

export interface ProductionExtractAllocation {
  id: string;
  report_id: string;
  extract_transaction_id: string;
  allocated_kg: number;
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  txn_date: string;
  order_no: string | null;
  issued_kg: number;
  created_at?: string;
}

export interface ProductionReconciliationRow {
  extract_id: string;
  actual_kg: number;
  expected_kg: number;
  variance_kg: number;
  variance_pct: number | null;
  total_pcs: number;
  actual_kg_per_unit: number | null;
  expected_kg_per_unit: number | null;
}

export interface ProductionReconciliationSkuRow {
  sku_id: string;
  qty_produced: number;
  extract_id: string;
  extract_kg_per_unit: number;
  expected_kg: number;
}

export interface ManufacturerProductionReportDetail
  extends ManufacturerProductionReport {
  lines: ManufacturerProductionReportLine[];
  allocations: ProductionExtractAllocation[];
  reconciliation: ProductionReconciliationRow[];
  reconciliation_by_sku: ProductionReconciliationSkuRow[];
}

export interface ManufacturerProductionReportLineInput {
  po_line_id?: string | null;
  sku_id: string;
  qty_produced: number;
  uom?: string;
}

export interface ManufacturerProductionReportInput {
  po_id: string;
  po_number: string;
  manufacturer?: string;
  invoice_number?: string | null;
  report_date: string;
  notes?: string | null;
  lines: ManufacturerProductionReportLineInput[];
}

export interface SuggestedProductionTransaction {
  id: string;
  extract_id: string;
  extract_item_no: string;
  extract_name: string | null;
  txn_date: string;
  order_no: string | null;
  issued_kg: number;
  remark: string | null;
  already_allocated: boolean;
}

