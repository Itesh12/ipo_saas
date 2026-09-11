"use client";

/**
 * features/notifications/context/NotificationContext.tsx
 *
 * Authoritative React Context for Phase 7C:
 *  - Real-Time Notification Stream
 *  - Monotonic Status Reconciler
 *  - Canonical Unread Count Engine
 *  - Auth & Network Lifecycle Management
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { NotificationRow, NotificationCategory } from "../types/notification.types";
import { RealtimeConnectionStatus } from "../services/realtime/realtimeTypes";
import { NotificationRealtimeService } from "../services/realtime/notificationRealtimeService";
import {
  computeUnreadCount,
  reconcileNotification,
  drainBufferedEvents,
} from "../services/realtime/realtimeReconciler";
import { createClient } from "@/lib/supabase/client";
import {
  markAsReadAction,
  markAllAsReadAction,
  archiveNotificationAction,
  fetchNotificationsAction,
} from "../actions/notificationActions";

interface NotificationContextValue {
  notifications: NotificationRow[];
  unreadCount: number;
  connectionStatus: RealtimeConnectionStatus;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (category?: NotificationCategory) => Promise<void>;
  archive: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps {
  children: React.ReactNode;
  initialNotifications?: NotificationRow[];
  initialUnreadCount?: number;
  userId?: string;
}

export function NotificationProvider({
  children,
  initialNotifications = [],
  userId: propUserId,
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationRow[]>(initialNotifications);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>("connecting");
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(propUserId);

  const bufferRef = useRef<NotificationRow[]>([]);
  const isHydratedRef = useRef(false);
  const lastSyncTimestampRef = useRef<number>(0);
  const supabase = useMemo(() => createClient(), []);

  // Compute canonical unread count from authoritative notifications list
  const unreadCount = useMemo(() => computeUnreadCount(notifications), [notifications]);

  // Sync prop updates if server components re-render with new initial notifications
  useEffect(() => {
    if (initialNotifications.length > 0 && !isHydratedRef.current) {
      setNotifications(initialNotifications);
    }
  }, [initialNotifications]);

  // Refresh notifications snapshot from server
  const refreshNotifications = useCallback(async () => {
    try {
      const result = await fetchNotificationsAction(50);
      lastSyncTimestampRef.current = Date.now();

      setNotifications(() => {
        // Reconcile server snapshot with any buffered realtime events
        if (bufferRef.current.length > 0) {
          const drained = drainBufferedEvents(result.notifications, bufferRef.current);
          bufferRef.current = [];
          return drained;
        }
        return result.notifications;
      });
    } catch (err) {
      console.warn("[NotificationContext] Refresh snapshot error:", err);
    }
  }, []);

  // Resolve current authenticated user if not passed in props
  useEffect(() => {
    if (!currentUserId) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          setCurrentUserId(user.id);
        } else {
          setConnectionStatus("disconnected");
        }
      });
    }
  }, [currentUserId, supabase]);

  // Setup Realtime subscription and auth listener
  useEffect(() => {
    if (!currentUserId) return;

    const realtimeService = NotificationRealtimeService.getInstance(supabase);

    const subscription = realtimeService.subscribe({
      userId: currentUserId,
      onEvent: (event) => {
        if (!event.new) return;

        const incoming = event.new;

        // If snapshot hydration is still ongoing, buffer the incoming event
        if (!isHydratedRef.current) {
          bufferRef.current.push(incoming);
        }

        // Apply progressive monotonic reconciliation
        setNotifications((prev) => reconcileNotification(prev, incoming));
      },
      onStatusChange: (status) => {
        setConnectionStatus(status);
        if (status === "connected") {
          isHydratedRef.current = true;
          // Drain any buffered events into current state
          if (bufferRef.current.length > 0) {
            setNotifications((prev) => {
              const drained = drainBufferedEvents(prev, bufferRef.current);
              bufferRef.current = [];
              return drained;
            });
          }
        }
      },
      onError: (err) => {
        console.warn("[NotificationContext] Realtime transport error:", err);
        setConnectionStatus("degraded");
      },
    });

    // Supabase Auth lifecycle handler
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "TOKEN_REFRESHED" && session?.access_token) {
        await realtimeService.setAuthToken(session.access_token);
      } else if (event === "SIGNED_OUT") {
        await realtimeService.unsubscribe();
        setNotifications([]);
        bufferRef.current = [];
        setCurrentUserId(undefined);
        setConnectionStatus("disconnected");
      } else if (event === "SIGNED_IN" && session?.user?.id) {
        if (session.user.id !== currentUserId) {
          // User switched accounts: teardown prior state and re-initialize
          await realtimeService.unsubscribe();
          setNotifications([]);
          bufferRef.current = [];
          setCurrentUserId(session.user.id);
          refreshNotifications();
        }
      }
    });

    // Browser network events
    const handleOnline = () => {
      setConnectionStatus("reconnecting");
      refreshNotifications();
    };

    const handleOffline = () => {
      setConnectionStatus("offline");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastSyncTimestampRef.current;
        if (elapsed > 60_000) {
          refreshNotifications();
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      authSub.unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUserId, refreshNotifications, supabase]);

  // Mark single notification as read (Optimistic + Action)
  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id && item.status === "unread"
          ? { ...item, status: "read", read_at: new Date().toISOString() }
          : item
      )
    );
    await markAsReadAction(id);
  }, []);

  // Mark all notifications as read (Optimistic + Action)
  const markAllAsRead = useCallback(async (category?: NotificationCategory) => {
    setNotifications((prev) =>
      prev.map((item) => {
        if (category && item.category !== category) return item;
        return item.status === "unread"
          ? { ...item, status: "read", read_at: new Date().toISOString() }
          : item;
      })
    );
    await markAllAsReadAction(category);
  }, []);

  // Archive notification (Optimistic + Action)
  const archive = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: "archived", archived_at: new Date().toISOString() }
          : item
      )
    );
    await archiveNotificationAction(id);
  }, []);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      connectionStatus,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      archive,
    }),
    [
      notifications,
      unreadCount,
      connectionStatus,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      archive,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
