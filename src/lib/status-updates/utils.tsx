import Link from "next/link";
import type { StatusUpdateRelatedEntity } from "@/types/database";

export const MENTION_RECORD_TYPES = new Set(["po", "payment", "shipment"]);

export function recordMentionLabel(
  entity: Pick<StatusUpdateRelatedEntity, "entity_type" | "label">,
): string {
  switch (entity.entity_type) {
    case "po":
      return `PO ${entity.label}`;
    case "payment":
      return `Payment ${entity.label}`;
    case "shipment":
      return `Shipment ${entity.label}`;
    default:
      return entity.label;
  }
}

export function formatRecordMention(entity: StatusUpdateRelatedEntity): string {
  return `@[${recordMentionLabel(entity)}](${entity.entity_type}:${entity.id})`;
}

export function parseMentionTarget(rawId: string): {
  kind: "user" | "record";
  entityType?: string;
  id: string;
} {
  const match = rawId.match(/^(po|payment|shipment):(.+)$/);
  if (match) {
    return { kind: "record", entityType: match[1], id: match[2] };
  }
  return { kind: "user", id: rawId };
}

export function extractMentionIds(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)]
        .map((match) => match[1])
        .filter((id) => parseMentionTarget(id).kind === "user"),
    ),
  ];
}

export function renderMentionBody(
  body: string,
  profileNames: Map<string, string>,
): React.ReactNode[] {
  const parts = body.split(/(@\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    const match = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
    if (!match) {
      return <span key={index}>{part}</span>;
    }

    const label = match[1];
    const target = parseMentionTarget(match[2]);

    if (target.kind === "record" && target.entityType) {
      const href = entityHref(target.entityType, target.id, label);
      const display = label.startsWith("@") ? label : `@${label}`;
      if (href) {
        return (
          <Link
            key={index}
            href={href}
            className="font-medium text-sky-700 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {display}
          </Link>
        );
      }
      return (
        <span key={index} className="font-medium text-sky-700">
          {display}
        </span>
      );
    }

    const name = profileNames.get(target.id) ?? label;
    return (
      <span key={index} className="font-medium text-emerald-700">
        @{name}
      </span>
    );
  });
}

export function formatStatusUpdateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function statusUpdateBodyPreview(body: string, max = 140): string {
  const plain = body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trimEnd()}…`;
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  po: "PO",
  payment: "Payment",
  shipment: "Shipment",
  inbound: "Inbound",
  delivery_note: "Delivery Note",
  extract_delivery_note: "Extract DN",
};

export const ENTITY_TYPE_STYLES: Record<string, string> = {
  po: "bg-blue-100 text-blue-800",
  payment: "bg-amber-100 text-amber-800",
  shipment: "bg-violet-100 text-violet-800",
  inbound: "bg-emerald-100 text-emerald-800",
  delivery_note: "bg-rose-100 text-rose-800",
  extract_delivery_note: "bg-orange-100 text-orange-800",
};

export function entityHref(
  entityType: string,
  entityId: string,
  entityLabel?: string | null,
): string | null {
  switch (entityType) {
    case "po":
      return `/dashboard/procurement/${entityId}`;
    case "payment": {
      const term = (entityLabel ?? "")
        .replace(/^Payment\s+/i, "")
        .trim();
      return `/dashboard/payments?search=${encodeURIComponent(term || entityId)}`;
    }
    case "shipment":
      return `/dashboard/shipments/${entityId}`;
    case "inbound":
      return `/dashboard/inbound?search=${encodeURIComponent(entityLabel ?? "")}`;
    case "delivery_note":
      return `/dashboard/delivery-notes/${entityId}/edit`;
    case "extract_delivery_note":
      return `/dashboard/extract-inbound-delivery-notes`;
    default:
      return null;
  }
}

export function mentionRecordSearchHaystack(
  entity: StatusUpdateRelatedEntity,
): string {
  return [
    recordMentionLabel(entity),
    entity.label,
    entity.sublabel ?? "",
    ENTITY_TYPE_LABELS[entity.entity_type] ?? entity.entity_type,
  ]
    .join(" ")
    .toLowerCase();
}
