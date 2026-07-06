import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Profile,
  StatusUpdate,
  StatusUpdateEntityCount,
  StatusUpdateEntityRef,
  StatusUpdateEntityType,
  StatusUpdatePoGroup,
  StatusUpdatePoProduct,
  StatusUpdateRecordEntityType,
  StatusUpdateRelatedEntity,
  StatusUpdateReply,
  StatusUpdateScopedSku,
  StatusUpdateSkuGroup,
  StatusUpdateSkuSummary,
} from "@/types/database";
import { listProfiles } from "@/lib/db/product-development";
import { extractMentionIds } from "@/lib/status-updates/utils";

function authorNameMap(profiles: Profile[]): Map<string, string> {
  return new Map(profiles.map((p) => [p.id, p.full_name ?? "Unknown"]));
}

export async function listStatusUpdatesForSku(
  supabase: SupabaseClient,
  skuId: string,
): Promise<StatusUpdate[]> {
  const updateIds = await getStatusUpdateIdsForSku(supabase, skuId);
  if (updateIds.length === 0) return [];
  return enrichStatusUpdates(supabase, updateIds);
}

async function getStatusUpdateIdsForSku(
  supabase: SupabaseClient,
  skuId: string,
): Promise<string[]> {
  const { data: poLines, error: poLinesError } = await supabase
    .from("purchase_order_lines")
    .select("po_id")
    .eq("sku_id", skuId);
  if (poLinesError) throw poLinesError;

  const poIds = [...new Set((poLines ?? []).map((line) => line.po_id))];

  const [directRes, scopedRes, allPoRes] = await Promise.all([
    supabase.from("status_updates").select("id").eq("sku_id", skuId),
    supabase
      .from("status_update_skus")
      .select("status_update_id")
      .eq("sku_id", skuId),
    poIds.length > 0
      ? supabase
          .from("status_updates")
          .select("id")
          .eq("entity_type", "po")
          .in("entity_id", poIds)
          .eq("applies_to_all_po_products", true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (directRes.error) throw directRes.error;
  if (scopedRes.error) throw scopedRes.error;
  if (allPoRes.error) throw allPoRes.error;

  const candidateIds = new Set<string>();
  for (const row of directRes.data ?? []) candidateIds.add(row.id);
  for (const row of scopedRes.data ?? []) candidateIds.add(row.status_update_id);
  for (const row of allPoRes.data ?? []) candidateIds.add(row.id);

  if (candidateIds.size === 0) return [];

  const ids = [...candidateIds];
  const [updatesRes, scopedSkusRes] = await Promise.all([
    supabase
      .from("status_updates")
      .select("id, sku_id, entity_type, entity_id, applies_to_all_po_products")
      .in("id", ids),
    supabase
      .from("status_update_skus")
      .select("status_update_id, sku_id")
      .in("status_update_id", ids),
  ]);
  if (updatesRes.error) throw updatesRes.error;
  if (scopedSkusRes.error) throw scopedSkusRes.error;

  const scopedByUpdate = new Map<string, Set<string>>();
  for (const row of scopedSkusRes.data ?? []) {
    const set = scopedByUpdate.get(row.status_update_id) ?? new Set();
    set.add(row.sku_id);
    scopedByUpdate.set(row.status_update_id, set);
  }

  const visible: string[] = [];
  for (const update of updatesRes.data ?? []) {
    if (update.applies_to_all_po_products) {
      if (
        update.entity_type === "po" &&
        update.entity_id &&
        poIds.includes(update.entity_id)
      ) {
        visible.push(update.id);
      }
      continue;
    }

    const scoped = scopedByUpdate.get(update.id);
    if (scoped && scoped.size > 0) {
      if (scoped.has(skuId)) visible.push(update.id);
      continue;
    }

    if (update.sku_id === skuId) visible.push(update.id);
  }

  return visible;
}

async function enrichStatusUpdates(
  supabase: SupabaseClient,
  updateIds: string[],
): Promise<StatusUpdate[]> {
  const [updatesRes, profiles] = await Promise.all([
    supabase
      .from("status_updates")
      .select("*")
      .in("id", updateIds)
      .order("created_at", { ascending: false }),
    listProfiles(supabase),
  ]);
  if (updatesRes.error) throw updatesRes.error;

  const updates = updatesRes.data ?? [];
  if (updates.length === 0) return [];

  const [repliesRes, refsRes, scopedSkusRes] = await Promise.all([
    supabase
      .from("status_update_replies")
      .select("status_update_id")
      .in("status_update_id", updateIds),
    supabase
      .from("status_update_refs")
      .select("status_update_id, entity_type, entity_id")
      .in("status_update_id", updateIds),
    supabase
      .from("status_update_skus")
      .select("status_update_id, sku_id, skus(sku_code, name)")
      .in("status_update_id", updateIds),
  ]);
  if (repliesRes.error) throw repliesRes.error;
  if (refsRes.error) throw refsRes.error;
  if (scopedSkusRes.error) throw scopedSkusRes.error;

  const allRefs: Array<{ entity_type: StatusUpdateEntityType; entity_id: string }> =
    [
      ...updates.map((u) => ({
        entity_type: u.entity_type as StatusUpdateEntityType,
        entity_id: u.entity_id,
      })),
      ...(refsRes.data ?? []).map((ref) => ({
        entity_type: ref.entity_type as StatusUpdateEntityType,
        entity_id: ref.entity_id,
      })),
    ];
  const entityLabels = await resolveEntityLabels(supabase, allRefs);

  const refsByUpdate = new Map<string, StatusUpdateEntityRef[]>();
  for (const ref of refsRes.data ?? []) {
    const list = refsByUpdate.get(ref.status_update_id) ?? [];
    list.push({
      entity_type: ref.entity_type as StatusUpdateEntityType,
      entity_id: ref.entity_id,
      entity_label:
        entityLabels.get(`${ref.entity_type}:${ref.entity_id}`) ?? null,
    });
    refsByUpdate.set(ref.status_update_id, list);
  }

  const scopedByUpdate = new Map<string, StatusUpdateScopedSku[]>();
  for (const row of scopedSkusRes.data ?? []) {
    const sku = row.skus as unknown as
      | { sku_code: string; name: string | null }
      | null;
    const list = scopedByUpdate.get(row.status_update_id) ?? [];
    list.push({
      sku_id: row.sku_id,
      sku_code: sku?.sku_code ?? row.sku_id,
      sku_name: sku?.name ?? null,
    });
    scopedByUpdate.set(row.status_update_id, list);
  }

  const replyCounts = new Map<string, number>();
  for (const reply of repliesRes.data ?? []) {
    replyCounts.set(
      reply.status_update_id,
      (replyCounts.get(reply.status_update_id) ?? 0) + 1,
    );
  }

  const names = authorNameMap(profiles);
  return updates.map((update) => ({
    ...update,
    mentioned_user_ids: update.mentioned_user_ids ?? [],
    author_name: names.get(update.author_id) ?? null,
    reply_count: replyCounts.get(update.id) ?? 0,
    entity_label:
      entityLabels.get(`${update.entity_type}:${update.entity_id}`) ?? null,
    connected_refs: refsByUpdate.get(update.id) ?? [],
    applies_to_all_po_products: Boolean(update.applies_to_all_po_products),
    scoped_skus: scopedByUpdate.get(update.id) ?? [],
  }));
}

export async function listStatusUpdateSkuSummaries(
  supabase: SupabaseClient,
): Promise<StatusUpdateSkuSummary[]> {
  const { data: updates, error } = await supabase
    .from("status_updates")
    .select(
      "id, sku_id, body, created_at, entity_type, entity_id, applies_to_all_po_products",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!updates?.length) return [];

  const updateIds = updates.map((update) => update.id);
  const { data: scopedRows, error: scopedError } = await supabase
    .from("status_update_skus")
    .select("status_update_id, sku_id")
    .in("status_update_id", updateIds);
  if (scopedError) throw scopedError;

  const scopedByUpdate = new Map<string, string[]>();
  for (const row of scopedRows ?? []) {
    const list = scopedByUpdate.get(row.status_update_id) ?? [];
    list.push(row.sku_id);
    scopedByUpdate.set(row.status_update_id, list);
  }

  const allPoIds = [
    ...new Set(
      updates
        .filter(
          (update) =>
            update.applies_to_all_po_products && update.entity_type === "po",
        )
        .map((update) => update.entity_id),
    ),
  ];

  const skusByPo = new Map<string, string[]>();
  if (allPoIds.length > 0) {
    const { data: poLines, error: poLinesError } = await supabase
      .from("purchase_order_lines")
      .select("po_id, sku_id")
      .in("po_id", allPoIds);
    if (poLinesError) throw poLinesError;
    for (const line of poLines ?? []) {
      const list = skusByPo.get(line.po_id) ?? [];
      if (!list.includes(line.sku_id)) list.push(line.sku_id);
      skusByPo.set(line.po_id, list);
    }
  }

  const bySku = new Map<
    string,
    { count: number; latest_at: string; latest_preview: string }
  >();

  for (const update of updates) {
    let targetSkuIds: string[];
    if (update.applies_to_all_po_products && update.entity_type === "po") {
      targetSkuIds = skusByPo.get(update.entity_id) ?? [];
    } else {
      const scoped = scopedByUpdate.get(update.id);
      targetSkuIds = scoped?.length ? scoped : [update.sku_id];
    }

    for (const skuId of targetSkuIds) {
      const existing = bySku.get(skuId);
      if (!existing) {
        bySku.set(skuId, {
          count: 1,
          latest_at: update.created_at,
          latest_preview: update.body.slice(0, 120),
        });
      } else {
        existing.count += 1;
        if (new Date(update.created_at) > new Date(existing.latest_at)) {
          existing.latest_at = update.created_at;
          existing.latest_preview = update.body.slice(0, 120);
        }
      }
    }
  }

  const skuIds = [...bySku.keys()];
  const { data: skus, error: skuError } = await supabase
    .from("skus")
    .select("id, sku_code, name, product_franchises(name)")
    .in("id", skuIds);
  if (skuError) throw skuError;

  const skuMap = new Map(
    (skus ?? []).map((row) => {
      const franchise = row.product_franchises as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const franchiseName = Array.isArray(franchise)
        ? (franchise[0]?.name ?? null)
        : (franchise?.name ?? null);
      return [
        row.id,
        {
          sku_code: row.sku_code,
          sku_name: row.name,
          franchise_name: franchiseName,
        },
      ];
    }),
  );

  return skuIds
    .map((skuId) => {
      const stats = bySku.get(skuId)!;
      const sku = skuMap.get(skuId);
      return {
        sku_id: skuId,
        sku_code: sku?.sku_code ?? skuId,
        sku_name: sku?.sku_name ?? null,
        franchise_name: sku?.franchise_name ?? null,
        update_count: stats.count,
        latest_at: stats.latest_at,
        latest_preview: stats.latest_preview,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime(),
    );
}

export async function listStatusUpdatePoGroups(
  supabase: SupabaseClient,
): Promise<StatusUpdatePoGroup[]> {
  const { data: rawUpdates, error } = await supabase
    .from("status_updates")
    .select("id, entity_type, entity_id, created_at")
    .eq("entity_type", "po")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rawUpdates?.length) return [];

  const updateIdsByPo = new Map<string, string[]>();
  const latestAtByPo = new Map<string, string>();

  for (const update of rawUpdates) {
    const poId = update.entity_id;
    const list = updateIdsByPo.get(poId) ?? [];
    if (!list.includes(update.id)) {
      list.push(update.id);
    }
    updateIdsByPo.set(poId, list);

    const existingLatest = latestAtByPo.get(poId);
    if (
      !existingLatest ||
      new Date(update.created_at).getTime() > new Date(existingLatest).getTime()
    ) {
      latestAtByPo.set(poId, update.created_at);
    }
  }

  const poIds = [...updateIdsByPo.keys()];
  const allUpdateIds = [...updateIdsByPo.values()].flat();

  const [enriched, poHeaders, poProductsByPo] = await Promise.all([
    enrichStatusUpdates(supabase, allUpdateIds),
    loadPoHeaders(supabase, poIds),
    loadPoProductsByPoIds(supabase, poIds),
  ]);

  const primarySkuIds = [
    ...new Set(
      enriched
        .filter(
          (update) =>
            !update.applies_to_all_po_products &&
            (update.scoped_skus?.length ?? 0) === 0,
        )
        .map((update) => update.sku_id),
    ),
  ];
  const primarySkuById = await loadSkuSummariesById(supabase, primarySkuIds);

  const enrichedById = new Map(
    enriched.map((update) => [
      update.id,
      attachAssociatedProducts(update, primarySkuById),
    ]),
  );

  return poIds
    .map((poId) => {
      const header = poHeaders.get(poId);
      const updateIds = updateIdsByPo.get(poId) ?? [];
      return {
        po_id: poId,
        po_number: header?.po_number ?? poId,
        supplier_name: header?.supplier_name ?? null,
        latest_at: latestAtByPo.get(poId) ?? "",
        products: poProductsByPo.get(poId) ?? [],
        updates: updateIds
          .map((id) => enrichedById.get(id))
          .filter((update): update is StatusUpdate => Boolean(update)),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime(),
    );
}

async function loadPoHeaders(
  supabase: SupabaseClient,
  poIds: string[],
): Promise<Map<string, { po_number: string; supplier_name: string | null }>> {
  if (poIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, suppliers ( name )")
    .in("id", poIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => {
      const supplier = row.suppliers as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const supplierName = Array.isArray(supplier)
        ? (supplier[0]?.name ?? null)
        : (supplier?.name ?? null);
      return [
        row.id,
        { po_number: row.po_number, supplier_name: supplierName },
      ];
    }),
  );
}

async function loadPoProductsByPoIds(
  supabase: SupabaseClient,
  poIds: string[],
): Promise<Map<string, StatusUpdateScopedSku[]>> {
  if (poIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select("po_id, sku_id, skus ( sku_code, name )")
    .in("po_id", poIds)
    .order("sku_id");
  if (error) throw error;

  const byPo = new Map<string, StatusUpdateScopedSku[]>();
  for (const line of data ?? []) {
    const sku = line.skus as unknown as
      | { sku_code: string; name: string | null }
      | null;
    const list = byPo.get(line.po_id) ?? [];
    if (list.some((entry) => entry.sku_id === line.sku_id)) continue;
    list.push({
      sku_id: line.sku_id,
      sku_code: sku?.sku_code ?? line.sku_id,
      sku_name: sku?.name ?? null,
    });
    byPo.set(line.po_id, list);
  }
  return byPo;
}

async function loadSkuSummariesById(
  supabase: SupabaseClient,
  skuIds: string[],
): Promise<Map<string, StatusUpdateScopedSku>> {
  if (skuIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("skus")
    .select("id, sku_code, name")
    .in("id", skuIds);
  if (error) throw error;

  return new Map(
    (data ?? []).map((row) => [
      row.id,
      {
        sku_id: row.id,
        sku_code: row.sku_code,
        sku_name: row.name,
      },
    ]),
  );
}

function attachAssociatedProducts(
  update: StatusUpdate,
  primarySkuById: Map<string, StatusUpdateScopedSku>,
): StatusUpdate {
  let associatedProducts: StatusUpdateScopedSku[] = [];

  if (update.applies_to_all_po_products && update.entity_type === "po") {
    associatedProducts = [];
  } else if ((update.scoped_skus?.length ?? 0) > 0) {
    associatedProducts = update.scoped_skus ?? [];
  } else {
    const primary = primarySkuById.get(update.sku_id);
    associatedProducts = primary ? [primary] : [];
  }

  return { ...update, associated_products: associatedProducts };
}

export async function createStatusUpdate(
  supabase: SupabaseClient,
  input: {
    sku_id: string;
    po_id: string;
    body: string;
    author_id: string;
    mentioned_user_ids?: string[];
    connected_refs?: Array<{
      entity_type: StatusUpdateEntityType;
      entity_id: string;
    }>;
    applies_to_all_po_products?: boolean;
    scoped_sku_ids?: string[];
  },
): Promise<StatusUpdate> {
  const appliesToAll = Boolean(input.applies_to_all_po_products);
  const scopedSkuIds = [
    ...new Set(
      (input.scoped_sku_ids ?? []).filter(
        (id) => typeof id === "string" && id.length > 0,
      ),
    ),
  ];

  const { data, error } = await supabase
    .from("status_updates")
    .insert({
      sku_id: input.sku_id,
      entity_type: "po",
      entity_id: input.po_id,
      body: input.body,
      author_id: input.author_id,
      mentioned_user_ids: input.mentioned_user_ids ?? [],
      applies_to_all_po_products: appliesToAll,
    })
    .select("*")
    .single();
  if (error) throw error;

  const connectedRefs = dedupeConnectedRefs(input.connected_refs ?? []);
  if (connectedRefs.length > 0) {
    const { error: refsError } = await supabase.from("status_update_refs").insert(
      connectedRefs.map((ref) => ({
        status_update_id: data.id,
        entity_type: ref.entity_type,
        entity_id: ref.entity_id,
      })),
    );
    if (refsError) throw refsError;
  }

  if (!appliesToAll && scopedSkuIds.length > 0) {
    const { error: scopedError } = await supabase.from("status_update_skus").insert(
      scopedSkuIds.map((skuId) => ({
        status_update_id: data.id,
        sku_id: skuId,
      })),
    );
    if (scopedError) throw scopedError;
  }

  const allUpdates = await listStatusUpdatesForSku(supabase, input.sku_id);
  return (
    allUpdates.find((update) => update.id === data.id) ?? (data as StatusUpdate)
  );
}

function dedupeConnectedRefs(
  refs: Array<{ entity_type: StatusUpdateEntityType; entity_id: string }>,
): Array<{ entity_type: StatusUpdateEntityType; entity_id: string }> {
  const seen = new Set<string>();
  const result: Array<{ entity_type: StatusUpdateEntityType; entity_id: string }> =
    [];
  for (const ref of refs) {
    if (ref.entity_type === "po") continue;
    const key = `${ref.entity_type}:${ref.entity_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

const CONNECTED_ENTITY_TYPES = new Set<StatusUpdateEntityType>([
  "payment",
  "shipment",
  "inbound",
  "delivery_note",
  "extract_delivery_note",
]);

export function parseConnectedRefs(
  value: unknown,
): Array<{ entity_type: StatusUpdateEntityType; entity_id: string }> {
  if (!Array.isArray(value)) return [];
  const refs: Array<{ entity_type: StatusUpdateEntityType; entity_id: string }> =
    [];
  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      CONNECTED_ENTITY_TYPES.has(item.entity_type as StatusUpdateEntityType) &&
      typeof item.entity_id === "string"
    ) {
      refs.push({
        entity_type: item.entity_type as StatusUpdateEntityType,
        entity_id: item.entity_id,
      });
    }
  }
  return refs;
}

export async function getStatusUpdateById(
  supabase: SupabaseClient,
  id: string,
): Promise<StatusUpdate | null> {
  const { data, error } = await supabase
    .from("status_updates")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [update] = await enrichStatusUpdates(supabase, [id]);
  return update ?? null;
}

export async function updateStatusUpdate(
  supabase: SupabaseClient,
  id: string,
  input: {
    body?: string;
    mentioned_user_ids?: string[];
    connected_refs?: Array<{
      entity_type: StatusUpdateEntityType;
      entity_id: string;
    }>;
    applies_to_all_po_products?: boolean;
    scoped_sku_ids?: string[];
  },
): Promise<StatusUpdate> {
  const { data: existing, error: existingError } = await supabase
    .from("status_updates")
    .select("id, sku_id")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Status update not found.");

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.body !== undefined) {
    patch.body = input.body;
    patch.mentioned_user_ids =
      input.mentioned_user_ids ?? extractMentionIds(input.body);
  }

  if (input.applies_to_all_po_products !== undefined) {
    patch.applies_to_all_po_products = input.applies_to_all_po_products;
  }

  const { error: updateError } = await supabase
    .from("status_updates")
    .update(patch)
    .eq("id", id);
  if (updateError) throw updateError;

  if (input.connected_refs !== undefined) {
    const { error: deleteRefsError } = await supabase
      .from("status_update_refs")
      .delete()
      .eq("status_update_id", id);
    if (deleteRefsError) throw deleteRefsError;

    const connectedRefs = dedupeConnectedRefs(input.connected_refs);
    if (connectedRefs.length > 0) {
      const { error: refsError } = await supabase.from("status_update_refs").insert(
        connectedRefs.map((ref) => ({
          status_update_id: id,
          entity_type: ref.entity_type,
          entity_id: ref.entity_id,
        })),
      );
      if (refsError) throw refsError;
    }
  }

  if (
    input.applies_to_all_po_products !== undefined ||
    input.scoped_sku_ids !== undefined
  ) {
    const { data: current, error: currentError } = await supabase
      .from("status_updates")
      .select("applies_to_all_po_products")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    const appliesToAll =
      input.applies_to_all_po_products ?? current.applies_to_all_po_products;
    const scopedSkuIds = [
      ...new Set(
        (input.scoped_sku_ids ?? []).filter(
          (skuId) => typeof skuId === "string" && skuId.length > 0,
        ),
      ),
    ];

    const { error: deleteScopedError } = await supabase
      .from("status_update_skus")
      .delete()
      .eq("status_update_id", id);
    if (deleteScopedError) throw deleteScopedError;

    if (!appliesToAll && scopedSkuIds.length > 0) {
      const { error: scopedError } = await supabase.from("status_update_skus").insert(
        scopedSkuIds.map((skuId) => ({
          status_update_id: id,
          sku_id: skuId,
        })),
      );
      if (scopedError) throw scopedError;
    }
  }

  const updated = await getStatusUpdateById(supabase, id);
  if (!updated) throw new Error("Status update not found after save.");
  return updated;
}

export async function deleteStatusUpdate(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("status_updates").delete().eq("id", id);
  if (error) throw error;
}

export async function listStatusUpdateReplies(
  supabase: SupabaseClient,
  statusUpdateId: string,
): Promise<StatusUpdateReply[]> {
  const [repliesRes, profiles] = await Promise.all([
    supabase
      .from("status_update_replies")
      .select("*")
      .eq("status_update_id", statusUpdateId)
      .order("created_at", { ascending: true }),
    listProfiles(supabase),
  ]);
  if (repliesRes.error) throw repliesRes.error;
  const names = authorNameMap(profiles);
  return (repliesRes.data ?? []).map((reply) => ({
    ...reply,
    mentioned_user_ids: reply.mentioned_user_ids ?? [],
    author_name: names.get(reply.author_id) ?? null,
  }));
}

export async function createStatusUpdateReply(
  supabase: SupabaseClient,
  input: {
    status_update_id: string;
    body: string;
    author_id: string;
    mentioned_user_ids?: string[];
  },
): Promise<StatusUpdateReply> {
  const { data, error } = await supabase
    .from("status_update_replies")
    .insert({
      status_update_id: input.status_update_id,
      body: input.body,
      author_id: input.author_id,
      mentioned_user_ids: input.mentioned_user_ids ?? [],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as StatusUpdateReply;
}

async function resolveEntityLabels(
  supabase: SupabaseClient,
  refs: Array<{ entity_type: StatusUpdateEntityType; entity_id: string }>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (refs.length === 0) return labels;

  const poIds = refs.filter((r) => r.entity_type === "po").map((r) => r.entity_id);
  const paymentIds = refs
    .filter((r) => r.entity_type === "payment")
    .map((r) => r.entity_id);
  const shipmentIds = refs
    .filter((r) => r.entity_type === "shipment")
    .map((r) => r.entity_id);
  const inboundIds = refs
    .filter((r) => r.entity_type === "inbound")
    .map((r) => r.entity_id);
  const deliveryNoteIds = refs
    .filter((r) => r.entity_type === "delivery_note")
    .map((r) => r.entity_id);
  const extractDeliveryNoteIds = refs
    .filter((r) => r.entity_type === "extract_delivery_note")
    .map((r) => r.entity_id);

  const [pos, payments, shipments, inbound, deliveryNotes, extractDeliveryNotes] =
    await Promise.all([
    poIds.length
      ? supabase.from("purchase_orders").select("id, po_number").in("id", poIds)
      : Promise.resolve({ data: [], error: null }),
    paymentIds.length
      ? supabase
          .from("po_payments")
          .select("id, payment_request_number")
          .in("id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
    shipmentIds.length
      ? supabase
          .from("shipments")
          .select("id, shipment_number")
          .in("id", shipmentIds)
      : Promise.resolve({ data: [], error: null }),
    inboundIds.length
      ? supabase
          .from("inbound_receives")
          .select("id, receive_number")
          .in("id", inboundIds)
      : Promise.resolve({ data: [], error: null }),
    deliveryNoteIds.length
      ? supabase
          .from("delivery_notes")
          .select("id, dn_number")
          .in("id", deliveryNoteIds)
      : Promise.resolve({ data: [], error: null }),
    extractDeliveryNoteIds.length
      ? supabase
          .from("extract_inbound_delivery_notes")
          .select("id, dn_number")
          .in("id", extractDeliveryNoteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const row of pos.data ?? []) {
    labels.set(`po:${row.id}`, row.po_number);
  }
  for (const row of payments.data ?? []) {
    labels.set(
      `payment:${row.id}`,
      row.payment_request_number || "Payment",
    );
  }
  for (const row of shipments.data ?? []) {
    labels.set(`shipment:${row.id}`, row.shipment_number);
  }
  for (const row of inbound.data ?? []) {
    labels.set(`inbound:${row.id}`, row.receive_number);
  }
  for (const row of deliveryNotes.data ?? []) {
    labels.set(`delivery_note:${row.id}`, row.dn_number);
  }
  for (const row of extractDeliveryNotes.data ?? []) {
    labels.set(`extract_delivery_note:${row.id}`, row.dn_number);
  }

  return labels;
}

export async function listRelatedEntitiesForSku(
  supabase: SupabaseClient,
  skuId: string,
): Promise<StatusUpdateRelatedEntity[]> {
  const { data: lines, error: linesError } = await supabase
    .from("purchase_order_lines")
    .select("id, po_id")
    .eq("sku_id", skuId);
  if (linesError) throw linesError;

  const poIds = [...new Set((lines ?? []).map((l) => l.po_id))];
  const lineIds = (lines ?? []).map((l) => l.id);
  const entities: StatusUpdateRelatedEntity[] = [];

  if (poIds.length > 0) {
    const { data: pos, error: poError } = await supabase
      .from("purchase_orders")
      .select("id, po_number, status, order_date")
      .in("id", poIds)
      .order("order_date", { ascending: false });
    if (poError) throw poError;
    for (const po of pos ?? []) {
      entities.push({
        id: po.id,
        entity_type: "po",
        label: po.po_number,
        sublabel: "Purchase order",
        status: po.status,
        date: po.order_date,
      });
    }

    const { data: payments, error: payError } = await supabase
      .from("po_payments")
      .select(
        "id, payment_date, amount, payment_request_number, purpose, currency, po_id",
      )
      .in("po_id", poIds)
      .order("payment_date", { ascending: false });
    if (payError) throw payError;
    for (const payment of payments ?? []) {
      entities.push({
        id: payment.id,
        entity_type: "payment",
        label: payment.payment_request_number || "Payment",
        sublabel: `${payment.purpose} · ${payment.currency} ${Number(payment.amount).toLocaleString()}`,
        date: payment.payment_date,
        po_id: payment.po_id,
      });
    }

    const { data: shipmentPos, error: spError } = await supabase
      .from("shipment_purchase_orders")
      .select(
        "po_id, shipment_id, shipments(id, shipment_number, status, estimated_departure_date)",
      )
      .in("po_id", poIds);
    if (spError) throw spError;

    const shipmentMap = new Map<string, StatusUpdateRelatedEntity>();
    for (const row of shipmentPos ?? []) {
      const shipment = row.shipments as unknown as {
        id: string;
        shipment_number: string;
        status: string;
        estimated_departure_date: string;
      } | null;
      if (!shipment) continue;
      shipmentMap.set(`${shipment.id}:${row.po_id}`, {
        id: shipment.id,
        entity_type: "shipment",
        label: shipment.shipment_number,
        sublabel: "Shipment",
        status: shipment.status,
        date: shipment.estimated_departure_date,
        po_id: row.po_id,
      });
    }

    if (lineIds.length > 0) {
      const { data: shipmentItems, error: siError } = await supabase
        .from("shipment_items")
        .select(
          "shipment_id, po_line_id, shipments(id, shipment_number, status, estimated_departure_date), purchase_order_lines(po_id)",
        )
        .in("po_line_id", lineIds);
      if (siError) throw siError;
      for (const row of shipmentItems ?? []) {
        const shipment = row.shipments as unknown as {
          id: string;
          shipment_number: string;
          status: string;
          estimated_departure_date: string;
        } | null;
        const poLine = row.purchase_order_lines as unknown as {
          po_id: string;
        } | null;
        if (!shipment || !poLine?.po_id) continue;
        shipmentMap.set(`${shipment.id}:${poLine.po_id}`, {
          id: shipment.id,
          entity_type: "shipment",
          label: shipment.shipment_number,
          sublabel: "Shipment",
          status: shipment.status,
          date: shipment.estimated_departure_date,
          po_id: poLine.po_id,
        });
      }
    }
    entities.push(...shipmentMap.values());

    const { data: inboundByPo, error: inboundPoError } = await supabase
      .from("inbound_receives")
      .select("id, receive_number, status, receive_date, po_id")
      .in("po_id", poIds)
      .order("receive_date", { ascending: false });
    if (inboundPoError) throw inboundPoError;
    for (const receive of inboundByPo ?? []) {
      entities.push({
        id: receive.id,
        entity_type: "inbound",
        label: receive.receive_number ?? "Inbound receive",
        sublabel: "Inbound receive",
        status: receive.status,
        date: receive.receive_date,
        po_id: receive.po_id,
      });
    }

    const { data: deliveryNotes, error: dnError } = await supabase
      .from("delivery_notes")
      .select("id, dn_number, delivery_date, po_id")
      .in("po_id", poIds)
      .order("delivery_date", { ascending: false });
    if (dnError) throw dnError;
    for (const note of deliveryNotes ?? []) {
      entities.push({
        id: note.id,
        entity_type: "delivery_note",
        label: note.dn_number,
        sublabel: "Delivery note",
        date: note.delivery_date,
        po_id: note.po_id,
      });
    }

    const { data: extractDeliveryNotes, error: ednError } = await supabase
      .from("extract_inbound_delivery_notes")
      .select("id, dn_number, delivery_date, po_id")
      .in("po_id", poIds)
      .order("delivery_date", { ascending: false });
    if (ednError) throw ednError;
    for (const note of extractDeliveryNotes ?? []) {
      entities.push({
        id: note.id,
        entity_type: "extract_delivery_note",
        label: note.dn_number,
        sublabel: "Extract delivery note",
        date: note.delivery_date,
        po_id: note.po_id,
      });
    }
  }

  const { data: inboundItems, error: inboundError } = await supabase
    .from("inbound_receive_items")
    .select(
      "inbound_receive_id, inbound_receives(id, receive_number, status, receive_date, po_id)",
    )
    .eq("sku_id", skuId);
  if (inboundError) throw inboundError;

  const inboundMap = new Map<string, StatusUpdateRelatedEntity>();
  for (const row of inboundItems ?? []) {
    const receive = row.inbound_receives as unknown as {
      id: string;
      receive_number: string;
      status: string;
      receive_date: string;
      po_id: string | null;
    } | null;
    if (!receive) continue;
    if (inboundMap.has(receive.id)) continue;
    inboundMap.set(receive.id, {
      id: receive.id,
      entity_type: "inbound",
      label: receive.receive_number ?? "Inbound receive",
      sublabel: "Inbound receive",
      status: receive.status,
      date: receive.receive_date,
      po_id: receive.po_id,
    });
  }
  for (const inbound of inboundMap.values()) {
    if (!entities.some((entity) => entity.entity_type === "inbound" && entity.id === inbound.id)) {
      entities.push(inbound);
    }
  }

  return entities;
}

export async function listPoProducts(
  supabase: SupabaseClient,
  poId: string,
): Promise<StatusUpdatePoProduct[]> {
  const { data, error } = await supabase
    .from("purchase_order_lines")
    .select("sku_id, qty_ordered, skus(sku_code, name)")
    .eq("po_id", poId)
    .order("sku_id");
  if (error) throw error;

  return (data ?? []).map((line) => {
    const sku = line.skus as unknown as
      | { sku_code: string; name: string | null }
      | null;
    return {
      sku_id: line.sku_id,
      sku_code: sku?.sku_code ?? line.sku_id,
      sku_name: sku?.name ?? null,
      qty_ordered: Number(line.qty_ordered),
    };
  });
}

export { extractMentionIds } from "@/lib/status-updates/utils";

async function getStatusUpdateIdsForEntity(
  supabase: SupabaseClient,
  entityType: StatusUpdateRecordEntityType,
  entityId: string,
): Promise<string[]> {
  if (entityType === "po") {
    const { data, error } = await supabase
      .from("status_updates")
      .select("id")
      .eq("entity_type", "po")
      .eq("entity_id", entityId);
    if (error) throw error;
    return (data ?? []).map((row) => row.id);
  }

  const { data, error } = await supabase
    .from("status_update_refs")
    .select("status_update_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.status_update_id))];
}

export async function listStatusUpdatesForEntity(
  supabase: SupabaseClient,
  entityType: StatusUpdateRecordEntityType,
  entityId: string,
  limit = 5,
): Promise<{ updates: StatusUpdate[]; total: number }> {
  const updateIds = await getStatusUpdateIdsForEntity(
    supabase,
    entityType,
    entityId,
  );
  if (updateIds.length === 0) {
    return { updates: [], total: 0 };
  }

  const { data: orderedRows, error } = await supabase
    .from("status_updates")
    .select("id")
    .in("id", updateIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const orderedIds = (orderedRows ?? []).map((row) => row.id);
  const updates = await enrichStatusUpdates(supabase, orderedIds);
  return { updates, total: updateIds.length };
}

export async function listStatusUpdateCountsByEntity(
  supabase: SupabaseClient,
  entityType: StatusUpdateRecordEntityType,
  entityIds: string[],
): Promise<StatusUpdateEntityCount[]> {
  const uniqueIds = [
    ...new Set(entityIds.filter((id) => typeof id === "string" && id.length > 0)),
  ];
  if (uniqueIds.length === 0) return [];

  const counts = new Map<string, { count: number; latest_at: string | null }>();

  if (entityType === "po") {
    const { data, error } = await supabase
      .from("status_updates")
      .select("entity_id, created_at")
      .eq("entity_type", "po")
      .in("entity_id", uniqueIds);
    if (error) throw error;

    for (const row of data ?? []) {
      const existing = counts.get(row.entity_id) ?? { count: 0, latest_at: null };
      existing.count += 1;
      if (
        !existing.latest_at ||
        new Date(row.created_at).getTime() > new Date(existing.latest_at).getTime()
      ) {
        existing.latest_at = row.created_at;
      }
      counts.set(row.entity_id, existing);
    }
  } else {
    const { data, error } = await supabase
      .from("status_update_refs")
      .select("entity_id, status_updates ( created_at )")
      .eq("entity_type", entityType)
      .in("entity_id", uniqueIds);
    if (error) throw error;

    for (const row of data ?? []) {
      const update = row.status_updates as unknown as
        | { created_at: string }
        | { created_at: string }[]
        | null;
      const createdAt = Array.isArray(update)
        ? (update[0]?.created_at ?? null)
        : (update?.created_at ?? null);
      if (!createdAt) continue;

      const existing = counts.get(row.entity_id) ?? { count: 0, latest_at: null };
      existing.count += 1;
      if (
        !existing.latest_at ||
        new Date(createdAt).getTime() > new Date(existing.latest_at).getTime()
      ) {
        existing.latest_at = createdAt;
      }
      counts.set(row.entity_id, existing);
    }
  }

  return uniqueIds
    .map((entity_id) => {
      const entry = counts.get(entity_id);
      return {
        entity_id,
        count: entry?.count ?? 0,
        latest_at: entry?.latest_at ?? null,
      };
    })
    .filter((entry) => entry.count > 0);
}
