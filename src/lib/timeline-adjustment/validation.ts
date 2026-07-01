import { z } from "zod";
import { DEFAULT_LEAD_TIMES } from "@/lib/timeline-adjustment/schedule";

const leadTimeField = z.coerce.number().int().min(1).max(999);

const timelineProductSchema = z.object({
  product_name: z.string().trim().min(1, "Product name is required."),
  sku_id: z
    .union([z.string().uuid(), z.null()])
    .optional()
    .transform((value) => value ?? null),
});

export const productTimelineBodySchema = z.object({
  products: z
    .array(timelineProductSchema)
    .min(1, "Add at least one product to the timeline."),
  anchor: z.enum(["start", "warehouse_delivery"]),
  anchor_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
  primary_packaging_days: leadTimeField.default(DEFAULT_LEAD_TIMES.primary_packaging),
  secondary_packaging_days: leadTimeField.default(DEFAULT_LEAD_TIMES.secondary_packaging),
  extract_days: leadTimeField.default(DEFAULT_LEAD_TIMES.extract),
  send_to_manufacturer_days: leadTimeField.default(DEFAULT_LEAD_TIMES.send_to_manufacturer),
  manufacturer_filling_days: leadTimeField.default(DEFAULT_LEAD_TIMES.manufacturer_filling),
});

export type ProductTimelineBody = z.infer<typeof productTimelineBodySchema>;
