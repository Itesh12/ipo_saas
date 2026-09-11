"use client";

/**
 * features/notifications/hooks/useNotificationRealtime.ts
 *
 * Dedicated hook for managing Supabase Realtime channel subscription,
 * events buffer, and status lifecycle.
 */

import { useEffect, useState, useRef } from "react";
import { RealtimeConnectionStatus, NotificationRealtimeEvent } from "../services/realtime/realtimeTypes";
import { NotificationRealtimeService } from "../services/realtime/notificationRealtimeService";

interface UseNotificationRealtimeOptions {
  userId?: string;
  onEvent: (event: NotificationRealtimeEvent) => void;
  enabled?: boolean;
}

export function useNotificationRealtime({
  userId,
  onEvent,
  enabled = true,
}: UseNotificationRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("disconnected");
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    const service = NotificationRealtimeService.getInstance();
    const handle = service.subscribe({
      userId,
      onEvent: (e) => onEventRef.current(e),
      onStatusChange: setStatus,
    });

    return () => {
      handle.unsubscribe();
      setStatus("disconnected");
    };
  }, [userId, enabled]);

  return { status };
}
