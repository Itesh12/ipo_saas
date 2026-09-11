"use client";

/**
 * features/notifications/components/NotificationBell.tsx
 *
 * Live dynamic notification bell with real-time unread badge,
 * accessible screen-reader live region, and platform theme compatibility.
 */

import React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "../context/NotificationContext";

interface NotificationBellProps {
  className?: string;
  fallbackCount?: number;
}

export function NotificationBell({
  className = "",
  fallbackCount = 0,
}: NotificationBellProps) {
  let unreadCount = fallbackCount;

  try {
    // Attempt to consume live notification context
    const context = useNotifications();
    unreadCount = context.unreadCount;
  } catch {
    // Outside NotificationProvider fallback
    unreadCount = fallbackCount;
  }

  const hasUnread = unreadCount > 0;
  const displayCount = unreadCount > 99 ? "99+" : unreadCount.toString();
  const accessibleLabel = hasUnread
    ? `Notifications, ${unreadCount} unread ${unreadCount === 1 ? "alert" : "alerts"}`
    : "Notifications, no unread alerts";

  return (
    <Link
      href="/notifications"
      className={`relative p-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/50 ${className}`}
      aria-label={accessibleLabel}
      id="notification-bell-button"
    >
      <Bell className="w-4 h-4" aria-hidden="true" />

      {hasUnread && (
        <span
          className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--brand-primary)] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--bg-surface)] animate-in fade-in zoom-in duration-200"
          aria-hidden="true"
        >
          {displayCount}
        </span>
      )}

      {/* Screen reader live announcement */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {hasUnread ? `${unreadCount} unread notifications` : "No unread notifications"}
      </span>
    </Link>
  );
}
