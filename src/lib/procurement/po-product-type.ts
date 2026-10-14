/**
 * Product type for a purchase-order line.
 *
 * Packaging SKUs are stored with a single `is_packaging` flag. Primary vs
 * secondary follows the component in the SKU code or name, matching the
 * Cosmax inbound catalogs:
 * - Primary: the container and closure (jar, bottle, tube, pump, cap,
 *   dropper, plug, lid, nozzle).
 * - Secondary: the outer pack (unit box, eflute, blister, sleeve, sticker,
 *   shipping box, and other merch packs).
 * Extracts use `is_extract`. Everything else is a finished good bought as
 * mixing / filling.
 */

export type PoLineProductType =
  | "primary_packaging"
  | "secondary_packaging"
  | "extract"
  | "mixing_filling";

export const PO_LINE_PRODUCT_TYPE_LABELS: Record<PoLineProductType, string> = {
  primary_packaging: "Primary packaging",
  secondary_packaging: "Secondary packaging",
  extract: "Extract",
  mixing_filling: "Mixing / filling",
};

export const PO_PRODUCT_TYPE_HINT =
  "Primary packaging is the container and closure (jar, bottle, tube, pump, cap, dropper, plug, lid). Secondary packaging is the outer pack (unit box, eflute, blister, sleeve, sticker, shipper).";

const VERSIONED_COMPONENT =
  /\b(BOTTLE|CAPTUBE|CAPSPRAY|DROPPER|EFLUTE|NOZZLE|PUMP|TUBE|PLUG|LID|JAR|CAP|UB)\s*V\d+\b/g;

const SECONDARY_NEEDLES = [
  " UNIT BOX ",
  " UNITBOX ",
  " EFLUTE ",
  " BLISTER ",
  " SHIPPING BOX ",
  " SHIPPINGBOX ",
  " SHOPPING BAG ",
  " SHOPPINGBAG ",
  " HOLIDAY BOX ",
  " HOLIDAYBOX ",
  " GIFT BOX ",
  " GIFTBOX ",
  " SLEEVE ",
  " STICKER ",
];

const PRIMARY_NEEDLES = [
  " CAPTUBE ",
  " CAPSPRAY ",
  " BOTTLE ",
  " DROPPER ",
  " NOZZLE ",
  " PUMP ",
  " TUBE ",
  " PLUG ",
  " LID ",
  " JAR ",
  " CAP ",
];

function packagingText(skuCode: string, skuName: string | null | undefined): string {
  const raw = `${skuCode} ${skuName ?? ""}`.toUpperCase();
  const spaced = raw
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(VERSIONED_COMPONENT, "$1")
    .replace(/\bUB\b/g, "UNITBOX")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${spaced} `;
}

/** Primary or secondary when the code/name names a packaging component. */
export function packagingTypeFromSku(
  skuCode: string | null | undefined,
  skuName: string | null | undefined,
): "primary_packaging" | "secondary_packaging" | null {
  const text = packagingText(skuCode ?? "", skuName);
  if (SECONDARY_NEEDLES.some((needle) => text.includes(needle))) {
    return "secondary_packaging";
  }
  if (PRIMARY_NEEDLES.some((needle) => text.includes(needle))) {
    return "primary_packaging";
  }

  const code = (skuCode ?? "").trim().toUpperCase();
  if (
    code.startsWith("BOX-") ||
    code.startsWith("MER-") ||
    code.startsWith("PKG-STC")
  ) {
    return "secondary_packaging";
  }
  return null;
}

export function classifyPoLineProductType(input: {
  skuCode?: string | null;
  skuName?: string | null;
  isPackaging?: boolean | null;
  isExtract?: boolean | null;
}): PoLineProductType {
  if (input.isExtract) return "extract";

  const fromText = packagingTypeFromSku(input.skuCode, input.skuName);
  if (input.isPackaging) {
    return fromText ?? "primary_packaging";
  }
  if (input.isPackaging === false) return "mixing_filling";
  return fromText ?? "mixing_filling";
}

export function distinctProductTypes(
  types: Array<PoLineProductType | null | undefined>,
): PoLineProductType[] {
  const seen = new Set<PoLineProductType>();
  const ordered: PoLineProductType[] = [];
  for (const type of types) {
    if (!type || seen.has(type)) continue;
    seen.add(type);
    ordered.push(type);
  }
  return ordered;
}
