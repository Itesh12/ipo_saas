/**
 * features/notifications/types/notification.types.ts
 *
 * Domain types for Phase 7: Notifications & Event-Driven Delivery.
 * Maps directly to PostgreSQL enums and tables created in 20260910000007_phase7_notifications.sql.
 */

export type NotificationCategory =
  | "ipo_milestone"
  | "application_lifecycle"
  | "allotment_refund"
  | "research_gmp"
  | "portfolio_capital";

export type NotificationPriority = "urgent" | "high" | "normal" | "low";

export type NotificationStatus = "unread" | "read" | "archived" | "expired";

export type NotificationEventStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed"
  | "dead_letter";

export type NotificationDeliveryChannel =
  | "in_app"
  | "email"
  | "push"
  | "sms"
  | "whatsapp";

export type NotificationDeliveryStatus =
  | "pending"
  | "simulated"
  | "mock_delivered"
  | "delivered"
  | "failed";

export type DeliveryChannel = NotificationDeliveryChannel;
export type DeliveryStatus = NotificationDeliveryStatus;

export type NotificationEventClass = "transaction_driven" | "condition_driven";

export interface NotificationRow {
  id: string;
  user_id: string;
  event_id: string | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  message: string;
  action_url: string | null;
  action_label: string | null;
  metadata: Record<string, unknown>;
  is_mandatory: boolean;
  read_at: string | null;
  archived_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface NotificationEventRow {
  id: string;
  event_type: string;
  event_class: NotificationEventClass;
  idempotency_key: string;
  aggregate_type: string;
  aggregate_id: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  schema_version: string;
  occurred_at: string;
  created_at: string;
  status: NotificationEventStatus;
  attempt_count: number;
  max_attempts: number;
  concurrency_lock_id: string | null;
  locked_at: string | null;
  available_at: string;
  processed_at: string | null;
  failed_at: string | null;
  last_error: string | null;
}

export interface NotificationPreferenceRow {
  id: string;
  user_id: string;
  category: NotificationCategory;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_push: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationSettingRow {
  user_id: string;
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  min_priority_during_quiet: NotificationPriority;
  created_at: string;
  updated_at: string;
}

export interface NotificationDeliveryRow {
  id: string;
  notification_id: string;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  attempt_count: number;
  provider_name: string;
  provider_reference: string | null;
  error_details: string | null;
  dispatched_at: string;
}

export interface NotificationContent {
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  priority: NotificationPriority;
  category: NotificationCategory;
  isMandatory?: boolean;
  metadata?: Record<string, unknown>;
}

export interface NotificationFilterParams {
  category?: NotificationCategory | "all";
  status?: NotificationStatus | "all";
  limit?: number;
  offset?: number;
}
