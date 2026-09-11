"use client";

/**
 * features/notifications/components/NotificationItem.tsx
 *
 * Renders an individual notification with priority badges, contextual deep links,
 * read/unread state toggles, and non-destructive archiving.
 */

import React, { useTransition } from "react";
import Link from "next/link";
import {
  NotificationRow,
  NotificationPriority,
  NotificationCategory,
} from "../types/notification.types";
import {
  markAsReadAction,
  archiveNotificationAction,
} from "../actions/notificationActions";
import {
  CheckCircle,
  Archive,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Clock,
} from "lucide-react";

interface NotificationItemProps {
  notification: NotificationRow;
  onStateChange?: () => void;
}

function getPriorityBadge(priority: NotificationPriority) {
  switch (priority) {
    case "urgent":
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          Urgent
        </span>
      );
    case "high":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
          <AlertCircle className="w-3 h-3" />
          High
        </span>
      );
    case "normal":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20">
          Normal
        </span>
      );
    case "low":
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-surface-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
          Info
        </span>
      );
  }
}

function getCategoryLabel(category: NotificationCategory): string {
  switch (category) {
    case "ipo_milestone":
      return "IPO Milestone";
    case "application_lifecycle":
      return "Application";
    case "allotment_refund":
      return "Allotment & Refund";
    case "research_gmp":
      return "Research & GMP";
    case "portfolio_capital":
      return "Capital & Ledger";
    default:
      return "Update";
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function NotificationItem({ notification, onStateChange }: NotificationItemProps) {
  const [isPending, startTransition] = useTransition();
  const isUnread = notification.status === "unread";

  const handleMarkRead = () => {
    startTransition(async () => {
      await markAsReadAction(notification.id);
      onStateChange?.();
    });
  };

  const handleArchive = () => {
    startTransition(async () => {
      await archiveNotificationAction(notification.id);
      onStateChange?.();
    });
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isUnread
          ? "bg-[var(--bg-surface)] border-[var(--brand-primary)]/30 shadow-sm"
          : "bg-[var(--bg-surface-subtle)] border-[var(--border-subtle)] opacity-90"
      } hover:border-[var(--border-strong)]`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-2">
          {getPriorityBadge(notification.priority)}
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
            {getCategoryLabel(notification.category)}
          </span>
          {notification.is_mandatory && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 px-2 py-0.5 rounded">
              <ShieldCheck className="w-3 h-3" />
              Mandatory Receipt
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Clock className="w-3 h-3" />
          {formatDate(notification.created_at)}
        </div>
      </div>

      <h4 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] mb-1">
        {notification.title}
      </h4>

      <p className="text-xs sm:text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed mb-3">
        {notification.message}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
        <div>
          {notification.action_url && (
            <Link
              href={notification.action_url}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[var(--brand-primary)] hover:underline"
            >
              {notification.action_label || "View Details"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isUnread && (
            <button
              onClick={handleMarkRead}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Mark as read
            </button>
          )}

          <button
            onClick={handleArchive}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            title="Archive notification (remains available in archive tab)"
          >
            <Archive className="w-3.5 h-3.5" />
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
