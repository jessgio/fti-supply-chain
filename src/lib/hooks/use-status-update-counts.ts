"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  StatusUpdateEntityCount,
  StatusUpdateRecordEntityType,
} from "@/types/database";

export function useStatusUpdateCounts(
  entityType: StatusUpdateRecordEntityType,
  entityIds: string[],
  refreshKey = 0,
): Map<string, StatusUpdateEntityCount> {
  const idsKey = useMemo(
    () => [...new Set(entityIds.filter(Boolean))].sort().join(","),
    [entityIds],
  );
  const [counts, setCounts] = useState<Map<string, StatusUpdateEntityCount>>(
    new Map(),
  );

  useEffect(() => {
    if (!idsKey) {
      setCounts(new Map());
      return;
    }

    let active = true;
    async function load() {
      try {
        const params = new URLSearchParams({
          entity_type: entityType,
          ids: idsKey,
        });
        const res = await fetch(`/api/status-updates/counts?${params.toString()}`);
        const data = await res.json();
        if (!active || !res.ok) return;
        const next = new Map<string, StatusUpdateEntityCount>();
        for (const entry of data.counts ?? []) {
          next.set(entry.entity_id, entry);
        }
        setCounts(next);
      } catch {
        if (active) setCounts(new Map());
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [entityType, idsKey, refreshKey]);

  return counts;
}
