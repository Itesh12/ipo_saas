/**
 * features/notifications/services/realtime/realtimeTypes.ts
 *
 * Domain types for Phase 7C: Real-Time Notification Delivery & Live Transport.
 */

import { NotificationRow } from "../../types/notification.types";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "degraded"
  | "disconnected";

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";

export interface NotificationRealtimeEvent {
  eventType: RealtimeEventType;
  new: NotificationRow | null;
  old: Partial<NotificationRow> | null;
  timestamp: string;
}

export interface RealtimeSubscriptionOptions {
  userId: string;
  onEvent: (event: NotificationRealtimeEvent) => void;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onError?: (error: Error) => void;
}

export interface RealtimeSubscriptionHandle {
  channelName: string;
  unsubscribe: () => Promise<void>;
  getStatus: () => RealtimeConnectionStatus;
}
