/**
 * features/notifications/services/notificationService.ts
 *
 * Authoritative in-app notification center service.
 * Handles inbox queries, unread counts, mark-as-read, mark-all-read, and archiving.
 * Zero physical deletes permitted.
 */

import { createClient } from "@/lib/supabase/server";
import {
  NotificationRow,
  NotificationCategory,
  NotificationStatus,
  NotificationContent,
} from "../types/notification.types";

export interface GetNotificationsParams {
  userId: string;
  category?: NotificationCategory | "all";
  status?: NotificationStatus | "all";
  limit?: number;
  offset?: number;
}

export interface GetNotificationsResult {
  notifications: NotificationRow[];
  totalCount: number;
  unreadCount: number;
}

/**
 * Retrieves paginated in-app notifications for the authenticated user.
 */
export async function getUserNotifications(
  params: GetNotificationsParams
): Promise<GetNotificationsResult> {
  const { userId, category = "all", status = "all", limit = 20, offset = 0 } = params;
  const supabase = await createClient();

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  } else {
    // By default, exclude archived unless explicitly requested
    query = query.neq("status", "archived");
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error("[getUserNotifications] Query error:", error);
    return { notifications: [], totalCount: 0, unreadCount: 0 };
  }

  // Fast count for unread badge
  const unreadCount = await getUnreadNotificationCount(userId);

  return {
    notifications: (data as unknown as NotificationRow[]) || [],
    totalCount: count || 0,
    unreadCount,
  };
}

/**
 * Fast aggregate query for unread notification count.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "unread");

  if (error) {
    console.error("[getUnreadNotificationCount] Count error:", error);
    return 0;
  }

  return count || 0;
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    } as never)
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Marks all unread notifications as read for a user.
 */
export async function markAllNotificationsAsRead(
  userId: string,
  category?: NotificationCategory
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString(),
    } as never)
    .eq("user_id", userId)
    .eq("status", "unread");

  if (category) {
    query = query.eq("category", category);
  }

  const { error } = await query;
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Transitions a notification to archived status. Zero physical deletions.
 */
export async function archiveNotification(
  userId: string,
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
    } as never)
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Inserts an authoritative in-app notification for a user.
 */
export async function createInAppNotification(params: {
  userId: string;
  content: NotificationContent;
  eventId?: string | null;
}): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  const { userId, content, eventId = null } = params;
  const supabase = await createClient();

  const payload = {
    user_id: userId,
    event_id: eventId,
    category: content.category,
    priority: content.priority,
    status: "unread",
    title: content.title,
    message: content.message,
    action_url: content.actionUrl || null,
    action_label: content.actionLabel || null,
    metadata: content.metadata || {},
    is_mandatory: Boolean(content.isMandatory),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("notifications")
    .insert(payload as never)
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  type InsertedRow = { id: string };
  return { success: true, notificationId: (data as unknown as InsertedRow)?.id };
}
