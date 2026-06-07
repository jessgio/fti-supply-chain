/** WMS column used for on-hand quantity (do not use QTY or other columns). */
export const STOCK_QTY_COLUMN = "Tersedia";

/** WMS locations included when aggregating on-hand stock for forecasting. */
export const STOCK_AGGREGATE_LOCATIONS = [
  "Gudang Finished Goods",
  "Gudang Inventory",
  "Gudang Inventory Offline",
] as const;

/** Raw-material warehouse used by the Packaging Materials module only. */
export const PACKAGING_STOCK_LOCATION = "Gudang Raw Material" as const;

/** All WMS locations persisted on stock upload (forecast + packaging). */
export const STOCK_IMPORT_LOCATIONS = [
  ...STOCK_AGGREGATE_LOCATIONS,
  PACKAGING_STOCK_LOCATION,
] as const;

const STOCK_AGGREGATE_LOCATION_SET = new Set<string>(
  STOCK_AGGREGATE_LOCATIONS,
);

const STOCK_IMPORT_LOCATION_SET = new Set<string>(STOCK_IMPORT_LOCATIONS);

export function isStockAggregateLocation(location: string): boolean {
  return STOCK_AGGREGATE_LOCATION_SET.has(location.trim());
}

export function isPackagingStockLocation(location: string): boolean {
  return location.trim() === PACKAGING_STOCK_LOCATION;
}

export function isStockImportLocation(location: string): boolean {
  return STOCK_IMPORT_LOCATION_SET.has(location.trim());
}

/** Human-readable list for forecast-specific UI copy. */
export function stockAggregateLocationsLabel(): string {
  return STOCK_AGGREGATE_LOCATIONS.join(", ");
}

/** Human-readable list for stock upload errors and UI copy. */
export function stockImportLocationsLabel(): string {
  return STOCK_IMPORT_LOCATIONS.join(", ");
}
