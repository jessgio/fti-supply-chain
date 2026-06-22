"use client";

import { PoHoverLink } from "@/components/procurement/po-hover-link";

export interface PoTimelineLineItem {
  sku_code: string;
  sku_name: string | null;
  qty_ordered: number;
  qty_received?: number;
}

interface PoTimelinePoLinkProps {
  poId: string;
  poNumber: string;
  lineItems: PoTimelineLineItem[];
  className?: string;
}

export function PoTimelinePoLink(props: PoTimelinePoLinkProps) {
  return <PoHoverLink {...props} />;
}
