"use client";

import { cn } from "@/lib/utils";
import { ENTITY_TYPE_LABELS } from "@/lib/status-updates/utils";
import type { StatusUpdateRelatedEntity } from "@/types/database";

interface ConnectedRecordsPickerProps {
  entities: StatusUpdateRelatedEntity[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}

function entityKey(entity: StatusUpdateRelatedEntity): string {
  return `${entity.entity_type}:${entity.id}`;
}

export function ConnectedRecordsPicker({
  entities,
  selectedKeys,
  onToggle,
  disabled = false,
}: ConnectedRecordsPickerProps) {
  const grouped = new Map<string, StatusUpdateRelatedEntity[]>();
  for (const entity of entities) {
    const list = grouped.get(entity.entity_type) ?? [];
    list.push(entity);
    grouped.set(entity.entity_type, list);
  }

  if (entities.length === 0) {
    return (
      <p className="text-xs text-stone-500">
        No payments, shipments, inbound receives, or delivery notes linked to this
        PO yet.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "max-h-56 space-y-3 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3",
        disabled && "opacity-60",
      )}
    >
      {[...grouped.entries()].map(([type, typeEntities]) => (
        <div key={type}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-stone-500">
            {ENTITY_TYPE_LABELS[type] ?? type}
          </p>
          <div className="space-y-1">
            {typeEntities.map((entity) => {
              const key = entityKey(entity);
              const checked = selectedKeys.includes(key);
              return (
                <label
                  key={key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white",
                    checked && "bg-white ring-1 ring-emerald-200",
                    disabled && "cursor-not-allowed",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-600"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(key)}
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-stone-900">
                      {entity.label}
                    </span>
                    {entity.sublabel && (
                      <span className="block text-xs text-stone-500">
                        {entity.sublabel}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
