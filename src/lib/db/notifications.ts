import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserNotification, UserNotificationSourceType } from "@/types/database";
import { listProfiles } from "@/lib/db/product-development";
import { statusUpdateBodyPreview } from "@/lib/status-updates/utils";

export async function createMentionNotifications(
  supabase: SupabaseClient,
  input: {
    recipientIds: string[];
    actorId: string;
    sourceType: UserNotificationSourceType;
    sourceId: string;
    statusUpdateId: string;
    body: string;
    poId?: string | null;
    poNumber?: string | null;
  },
): Promise<void> {
  const recipients = [
    ...new Set(
      input.recipientIds.filter(
        (id) => typeof id === "string" && id.length > 0 && id !== input.actorId,
      ),
    ),
  ];
  if (recipients.length === 0) return;

  const rows = recipients.map((recipientId) => ({
    recipient_id: recipientId,
    actor_id: input.actorId,
    source_type: input.sourceType,
    source_id: input.sourceId,
    status_update_id: input.statusUpdateId,
    body_preview: statusUpdateBodyPreview(input.body, 280),
    po_id: input.poId ?? null,
    po_number: input.poNumber ?? null,
  }));

  const { error } = await supabase
    .from("user_notifications")
    .upsert(rows, {
      onConflict: "recipient_id,source_type,source_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function notifyNewStatusUpdateMentions(
  supabase: SupabaseClient,
  input: {
    updateId: string;
    poId: string;
    body: string;
    mentionedUserIds: string[];
    actorId: string;
  },
): Promise<void> {
  const poNumber = await loadPoNumber(supabase, input.poId);
  await createMentionNotifications(supabase, {
    recipientIds: input.mentionedUserIds,
    actorId: input.actorId,
    sourceType: "status_update",
    sourceId: input.updateId,
    statusUpdateId: input.updateId,
    body: input.body,
    poId: input.poId,
    poNumber,
  });
}

export async function notifyNewReplyMentions(
  supabase: SupabaseClient,
  input: {
    replyId: string;
    statusUpdateId: string;
    body: string;
    mentionedUserIds: string[];
    actorId: string;
  },
): Promise<void> {
  const context = await loadStatusUpdateNotificationContext(
    supabase,
    input.statusUpdateId,
  );
  await createMentionNotifications(supabase, {
    recipientIds: input.mentionedUserIds,
    actorId: input.actorId,
    sourceType: "status_update_reply",
    sourceId: input.replyId,
    statusUpdateId: input.statusUpdateId,
    body: input.body,
    poId: context.poId,
    poNumber: context.poNumber,
  });
}

export async function notifyNewlyAddedMentionsOnEdit(
  supabase: SupabaseClient,
  input: {
    updateId: string;
    body: string;
    previousMentionedUserIds: string[];
    nextMentionedUserIds: string[];
    actorId: string;
  },
): Promise<void> {
  const previous = new Set(input.previousMentionedUserIds);
  const newlyMentioned = input.nextMentionedUserIds.filter(
    (id) => !previous.has(id),
  );
  if (newlyMentioned.length === 0) return;

  const context = await loadStatusUpdateNotificationContext(
    supabase,
    input.updateId,
  );
  await createMentionNotifications(supabase, {
    recipientIds: newlyMentioned,
    actorId: input.actorId,
    sourceType: "status_update",
    sourceId: input.updateId,
    statusUpdateId: input.updateId,
    body: input.body,
    poId: context.poId,
    poNumber: context.poNumber,
  });
}

async function loadPoNumber(
  supabase: SupabaseClient,
  poId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .eq("id", poId)
    .maybeSingle();
  if (error) throw error;
  return data?.po_number ?? null;
}

async function loadStatusUpdateNotificationContext(
  supabase: SupabaseClient,
  statusUpdateId: string,
): Promise<{ poId: string | null; poNumber: string | null }> {
  const { data, error } = await supabase
    .from("status_updates")
    .select("entity_type, entity_id")
    .eq("id", statusUpdateId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.entity_type !== "po") {
    return { poId: null, poNumber: null };
  }
  const poNumber = await loadPoNumber(supabase, data.entity_id);
  return { poId: data.entity_id, poNumber };
}

export async function listNotificationsForUser(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<UserNotification[]> {
  const [notificationsRes, profiles] = await Promise.all([
    supabase
      .from("user_notifications")
      .select("*")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    listProfiles(supabase),
  ]);
  if (notificationsRes.error) throw notificationsRes.error;

  const names = new Map(
    profiles.map((profile) => [profile.id, profile.full_name ?? "Someone"]),
  );

  return (notificationsRes.data ?? []).map((row) => ({
    ...row,
    actor_name: row.actor_id ? (names.get(row.actor_id) ?? null) : null,
    link_path: row.link_path ?? null,
    status_update_id: row.status_update_id ?? null,
    actor_id: row.actor_id ?? null,
  }));
}

export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

export async function notifySalesForecastOversell(
  supabase: SupabaseClient,
  input: {
    actorId: string | null;
    group: "online" | "offline";
    year: number;
    rows: Array<{
      sku_id: string;
      sku_code: string;
      remaining_year_qty: number;
      current_stock: number;
      on_order_qty: number;
      shortfall_qty: number;
      projected_stockout_date: string | null;
    }>;
  },
): Promise<void> {
  const oversell = input.rows.filter((row) => row.shortfall_qty > 0);
  if (oversell.length === 0) return;

  const profiles = await listProfiles(supabase);
  const recipients = profiles
    .filter(
      (profile) =>
        (profile.role === "supply_chain" || profile.role === "admin") &&
        profile.id !== input.actorId,
    )
    .map((profile) => profile.id);
  if (recipients.length === 0) return;

  const groupLabel = input.group === "online" ? "Online" : "Offline";
  const rows = oversell.flatMap((sku) => {
    const sourceId = `${sku.sku_id}:${input.year}:${input.group}`;
    const oos = sku.projected_stockout_date
      ? ` Projected OOS ${sku.projected_stockout_date}.`
      : "";
    const body =
      `${sku.sku_code} ${groupLabel} ${input.year} plan exceeds available stock. ` +
      `On hand ${sku.current_stock}, on order ${sku.on_order_qty}, ` +
      `remaining-year plan ${sku.remaining_year_qty}, shortfall ${sku.shortfall_qty} units.${oos}`;
    const linkPath = `/dashboard/sales-forecast?group=${input.group}&sku=${encodeURIComponent(sku.sku_code)}`;
    return recipients.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: input.actorId,
      source_type: "sales_forecast_stock" as const,
      source_id: sourceId,
      status_update_id: null,
      body_preview: statusUpdateBodyPreview(body, 280),
      po_id: null,
      po_number: null,
      link_path: linkPath,
      read_at: null,
    }));
  });

  const { error } = await supabase.from("user_notifications").upsert(rows, {
    onConflict: "recipient_id,source_type,source_id",
  });
  if (error) throw error;
}
