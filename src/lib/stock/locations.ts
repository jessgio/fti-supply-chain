/** WMS column used for on-hand quantity (do not use QTY or other columns). */
export const STOCK_QTY_COLUMN = "Tersedia";

/** WMS locations included when aggregating on-hand stock for forecasting. */
export const STOCK_AGGREGATE_LOCATIONS = [
  "Gudang Finished Goods",
  "Gudang Inventory",
  "Gudang Inventory Offline",
] as const;

/** Warehouses used by the Packaging Materials module only. */
export const PACKAGING_STOCK_LOCATIONS = [
  "Gudang Cosmax",
  "Gudang Raw Material",
] as const;

/** All WMS locations persisted on stock upload (forecast + packaging). */
export const STOCK_IMPORT_LOCATIONS = [
  ...STOCK_AGGREGATE_LOCATIONS,
  ...PACKAGING_STOCK_LOCATIONS,
] as const;

const STOCK_AGGREGATE_LOCATION_SET = new Set<string>(
  STOCK_AGGREGATE_LOCATIONS,
);

const PACKAGING_STOCK_LOCATION_SET = new Set<string>(
  PACKAGING_STOCK_LOCATIONS,
);

const STOCK_IMPORT_LOCATION_SET = new Set<string>(STOCK_IMPORT_LOCATIONS);

export function isStockAggregateLocation(location: string): boolean {
  return STOCK_AGGREGATE_LOCATION_SET.has(location.trim());
}

export function isPackagingStockLocation(location: string): boolean {
  return PACKAGING_STOCK_LOCATION_SET.has(location.trim());
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

/** Human-readable list for packaging inventory UI copy. */
export function packagingStockLocationsLabel(): string {
  return PACKAGING_STOCK_LOCATIONS.join(" and ");
}
