"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, MessageSquareText } from "lucide-react";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatStatusUpdateTime } from "@/lib/status-updates/utils";
import type { UserNotification } from "@/types/database";

function notificationTitle(notification: UserNotification): string {
  const actor = notification.actor_name ?? "Someone";
  if (notification.source_type === "status_update_reply") {
    return `${actor} mentioned you in a reply`;
  }
  return `${actor} mentioned you in a status update`;
}

function statusUpdateHref(statusUpdateId: string): string {
  return `/dashboard/status-updates?note=${statusUpdateId}`;
}

export function NotificationsPageClient() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load notifications");
      }
      setNotifications(data.notifications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  );

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to mark all as read");
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          read_at: notification.read_at ?? new Date().toISOString(),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark all as read");
    } finally {
      setMarkingAll(false);
    }
  }

  async function openNotification(notification: UserNotification) {
    if (!notification.read_at) {
      try {
        await fetch(`/api/notifications/${notification.id}`, {
          method: "PATCH",
        });
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? { ...item, read_at: new Date().toISOString() }
              : item,
          ),
        );
      } catch {
        // still navigate
      }
    }
    router.push(statusUpdateHref(notification.status_update_id));
  }

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <Bell className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">
              Notifications
            </h1>
            <p className="text-sm text-stone-600">
              Mentions from status updates and replies across the supply chain.
            </p>
          </div>
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={markingAll}
          >
            Mark all as read
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your mentions</CardTitle>
          <CardDescription>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You're all caught up."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <MessageSquareText className="h-10 w-10 text-stone-300" />
              <p className="text-sm text-stone-600">
                No mentions yet. When someone @mentions you in a status update,
                it will show up here.
              </p>
              <Link
                href="/dashboard/status-updates"
                className="text-sm font-medium text-emerald-700 hover:underline"
              >
                Go to Status Updates
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {notifications.map((notification) => {
                const unread = !notification.read_at;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`flex w-full items-start gap-3 px-1 py-4 text-left transition-colors hover:bg-stone-50 ${
                        unread ? "bg-emerald-50/40" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          unread ? "bg-emerald-600" : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900">
                          {notificationTitle(notification)}
                          {notification.po_number ? (
                            <span className="font-normal text-stone-500">
                              {" "}
                              · {notification.po_number}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-stone-600">
                          {notification.body_preview}
                        </p>
                        <p className="mt-2 text-xs text-stone-400">
                          {formatStatusUpdateTime(notification.created_at)}
                          {notification.source_type === "status_update_reply"
                            ? " · Reply"
                            : " · Status update"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
