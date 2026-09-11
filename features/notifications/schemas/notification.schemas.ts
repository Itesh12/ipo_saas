/**
 * features/notifications/schemas/notification.schemas.ts
 *
 * Zod validation schemas for Phase 7 notification requests and preference updates.
 */

import { z } from "zod";

export const notificationCategoryEnum = z.enum([
  "ipo_milestone",
  "application_lifecycle",
  "allotment_refund",
  "research_gmp",
  "portfolio_capital",
]);

export const notificationPriorityEnum = z.enum([
  "urgent",
  "high",
  "normal",
  "low",
]);

export const notificationStatusEnum = z.enum([
  "unread",
  "read",
  "archived",
  "expired",
]);

export const notificationFilterSchema = z.object({
  category: z.union([notificationCategoryEnum, z.literal("all")]).optional().default("all"),
  status: z.union([notificationStatusEnum, z.literal("all")]).optional().default("all"),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const updateNotificationPreferenceSchema = z.object({
  category: notificationCategoryEnum,
  channel_email: z.boolean(),
  channel_push: z.boolean(),
});

export const updateUserNotificationSettingSchema = z.object({
  timezone: z.string().min(1).max(50),
  quiet_hours_enabled: z.boolean(),
  quiet_hours_start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Invalid time format (HH:MM)"),
  quiet_hours_end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Invalid time format (HH:MM)"),
  min_priority_during_quiet: notificationPriorityEnum.optional().default("urgent"),
});

export type NotificationFilterInput = z.infer<typeof notificationFilterSchema>;
export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
export type UpdateUserNotificationSettingInput = z.infer<typeof updateUserNotificationSettingSchema>;
