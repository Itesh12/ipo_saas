"use client";

/**
 * features/notifications/components/NotificationList.tsx
 *
 * Tabbed in-app notification center with category filtering,
 * archive viewing, bulk mark-all-as-read, and pagination.
 */

import React, { useState, useTransition } from "react";
import {
  NotificationRow,
  NotificationCategory,
} from "../types/notification.types";
import { NotificationItem } from "./NotificationItem";
import { markAllAsReadAction } from "../actions/notificationActions";
import { useNotifications } from "../context/NotificationContext";
import { NotificationConnectionStatus } from "./NotificationConnectionStatus";
import {
  Bell,
  CheckCheck,
  Archive,
  Inbox,
} from "lucide-react";

interface NotificationListProps {
  initialNotifications: NotificationRow[];
  unreadCount?: number;
}

type TabKey = "all" | NotificationCategory | "archived";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All Alerts" },
  { key: "ipo_milestone", label: "IPO Milestones" },
  { key: "application_lifecycle", label: "Applications" },
  { key: "allotment_refund", label: "Allotments & Refunds" },
  { key: "research_gmp", label: "Research & GMP" },
  { key: "portfolio_capital", label: "Capital & Ledger" },
  { key: "archived", label: "Archived" },
];

export function NotificationList({
  initialNotifications,
}: NotificationListProps) {
  let contextNotifications: NotificationRow[] | null = null;
  let contextMarkAllRead: ((cat?: NotificationCategory) => Promise<void>) | null = null;

  try {
    const ctx = useNotifications();
    contextNotifications = ctx.notifications;
    contextMarkAllRead = ctx.markAllAsRead;
  } catch {
    // Graceful fallback if rendered outside NotificationProvider
  }

  const [localNotifications, setLocalNotifications] = useState<NotificationRow[]>(initialNotifications);
  const notifications = contextNotifications ?? localNotifications;
  const setNotifications = setLocalNotifications;

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [isPending, startTransition] = useTransition();

  // Filter items according to active tab
  const filteredItems = notifications.filter((item) => {
    if (activeTab === "archived") {
      return item.status === "archived";
    }
    // For non-archived tabs, hide archived
    if (item.status === "archived") {
      return false;
    }
    if (activeTab === "all") {
      return true;
    }
    return item.category === activeTab;
  });

  const unreadCount = notifications.filter(
    (n) => n.status === "unread"
  ).length;

  const handleMarkAllRead = () => {
    startTransition(async () => {
      const categoryParam =
        activeTab !== "all" && activeTab !== "archived"
          ? (activeTab as NotificationCategory)
          : undefined;

      if (contextMarkAllRead) {
        await contextMarkAllRead(categoryParam);
      } else {
        await markAllAsReadAction(categoryParam);
        // Optimistically update local state
        setNotifications((prev) =>
          prev.map((item) => {
            if (
              categoryParam ? item.category === categoryParam : true
            ) {
              return item.status === "unread" ? { ...item, status: "read" } : item;
            }
            return item;
          })
        );
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)] p-4 rounded-xl border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Notification Inbox
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {unreadCount > 0
                ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""} requiring attention`
                : "All notifications are up to date"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationConnectionStatus />
          {unreadCount > 0 && activeTab !== "archived" && (
            <button
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--brand-primary)]/40 text-[var(--text-primary)] transition-all disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4 text-emerald-500" />
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-[var(--border-subtle)]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count =
            tab.key === "archived"
              ? notifications.filter((n) => n.status === "archived").length
              : tab.key === "all"
              ? notifications.filter((n) => n.status !== "archived").length
              : notifications.filter((n) => n.category === tab.key && n.status !== "archived").length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? "bg-[var(--brand-primary)] text-white font-semibold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              }`}
            >
              {tab.label}
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[var(--bg-surface-hover)] text-[var(--text-muted)]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Notification List */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)]">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-surface-hover)] flex items-center justify-center mx-auto mb-3 text-[var(--text-muted)]">
            {activeTab === "archived" ? (
              <Archive className="w-6 h-6" />
            ) : (
              <Inbox className="w-6 h-6" />
            )}
          </div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {activeTab === "archived"
              ? "No archived notifications"
              : "No notifications in this category"}
          </h4>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
            {activeTab === "archived"
              ? "When you archive past alerts, they are safely preserved here for audit reference."
              : "Upcoming IPO milestones, allotment outcomes, and financial ledger receipts will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <NotificationItem
              key={item.id}
              notification={item}
              onStateChange={() => {
                // Update local state when single item marks read/archive
                setNotifications((prev) =>
                  prev.map((n) =>
                    n.id === item.id ? { ...n, status: "read" } : n
                  )
                );
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
