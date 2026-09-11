"use server";

/**
 * features/notifications/actions/notificationActions.ts
 *
 * Next.js Server Actions for Notification State Transitions.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  archiveNotification,
  getUnreadNotificationCount,
} from "../services/notificationService";
import { NotificationCategory } from "../types/notification.types";

async function getAuthenticatedUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized: Authentication required.");
  }
  return user.id;
}

export async function markAsReadAction(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await markNotificationAsRead(userId, notificationId);
    revalidatePath("/notifications");
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark notification as read.";
    return { success: false, error: message };
  }
}

export async function markAllAsReadAction(category?: NotificationCategory): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await markAllNotificationsAsRead(userId, category);
    revalidatePath("/notifications");
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to mark all notifications as read.";
    return { success: false, error: message };
  }
}

export async function archiveNotificationAction(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await archiveNotification(userId, notificationId);
    revalidatePath("/notifications");
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to archive notification.";
    return { success: false, error: message };
  }
}

export async function getUnreadCountAction(): Promise<{ count: number }> {
  try {
    const userId = await getAuthenticatedUserId();
    const count = await getUnreadNotificationCount(userId);
    return { count };
  } catch {
    return { count: 0 };
  }
}

export async function fetchNotificationsAction(limit: number = 50): Promise<{
  notifications: import("../types/notification.types").NotificationRow[];
  unreadCount: number;
}> {
  try {
    const userId = await getAuthenticatedUserId();
    const { getUserNotifications } = await import("../services/notificationService");
    const result = await getUserNotifications({ userId, limit });
    return result;
  } catch {
    return { notifications: [], unreadCount: 0 };
  }
}

