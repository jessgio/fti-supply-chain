/** WMS column used for on-hand quantity (do not use QTY or other columns). */
export const STOCK_QTY_COLUMN = "Tersedia";

/** WMS locations included when aggregating on-hand stock for forecasting. */
export const STOCK_AGGREGATE_LOCATIONS = [
  "Gudang Finished Goods",
  "Gudang Inventory",
  "Gudang Inventory Offline",
] as const;

const STOCK_AGGREGATE_LOCATION_SET = new Set<string>(
  STOCK_AGGREGATE_LOCATIONS,
);

export function isStockAggregateLocation(location: string): boolean {
  return STOCK_AGGREGATE_LOCATION_SET.has(location.trim());
}

/** Human-readable list for upload errors and UI copy. */
export function stockAggregateLocationsLabel(): string {
  return STOCK_AGGREGATE_LOCATIONS.join(", ");
}
