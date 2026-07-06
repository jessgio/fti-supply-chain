"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  userId?: string | null;
  collapsed?: boolean;
}

export function NotificationBell({
  userId,
  collapsed = false,
}: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch("/api/notifications/unread-count");
      const data = await res.json();
      if (res.ok) {
        setUnreadCount(data.unread_count ?? 0);
      }
    } catch {
      // optional badge
    }
  }, [userId]);

  useEffect(() => {
    void loadCount();
    const interval = window.setInterval(() => {
      void loadCount();
    }, 60_000);
    const handleFocus = () => {
      void loadCount();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadCount]);

  if (!userId) return null;

  const label =
    unreadCount > 0
      ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
      : "Notifications";

  return (
    <Link
      href="/dashboard/notifications"
      title={label}
      aria-label={label}
      className={cn(
        "relative shrink-0 rounded-md p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800",
        unreadCount > 0 && "text-emerald-700 hover:text-emerald-800",
      )}
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-none text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
      {collapsed ? null : (
        <span className="sr-only">{label}</span>
      )}
    </Link>
  );
}
