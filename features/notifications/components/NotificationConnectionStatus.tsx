"use client";

/**
 * features/notifications/components/NotificationConnectionStatus.tsx
 *
 * Subtle non-intrusive operational connection indicator for Phase 7C.
 */

import React from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useNotifications } from "../context/NotificationContext";

export function NotificationConnectionStatus() {
  const { connectionStatus, refreshNotifications } = useNotifications();

  if (connectionStatus === "connected") {
    return null; // Silent when healthy
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
      role="status"
      aria-label={`Realtime status: ${connectionStatus}`}
    >
      {connectionStatus === "offline" ? (
        <>
          <WifiOff className="w-3 h-3 text-[var(--accent-danger)]" aria-hidden="true" />
          <span>Offline</span>
        </>
      ) : connectionStatus === "reconnecting" || connectionStatus === "connecting" ? (
        <>
          <RefreshCw className="w-3 h-3 animate-spin text-[var(--brand-primary)]" aria-hidden="true" />
          <span>Syncing...</span>
        </>
      ) : connectionStatus === "degraded" ? (
        <button
          onClick={() => refreshNotifications()}
          className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
          title="Click to manually refresh"
        >
          <Wifi className="w-3 h-3 text-[var(--accent-warning)]" aria-hidden="true" />
          <span>Degraded (Click to refresh)</span>
        </button>
      ) : null}
    </div>
  );
}
