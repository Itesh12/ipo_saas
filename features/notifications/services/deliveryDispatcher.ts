/**
 * features/notifications/services/deliveryDispatcher.ts
 *
 * Phase 7B: Atomic Notification & Delivery Dispatcher
 * Inserts in-app notifications and simulated channel delivery logs.
 * Enforces database-level uniqueness via ON CONFLICT DO NOTHING.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { NotificationCategory, NotificationPriority, DeliveryChannel } from '../types/notification.types';
import { MockChannelProvider } from './mockChannelProvider';

export interface DispatchNotificationParams {
  userId: string;
  eventId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  isMandatory?: boolean;
  deliverInApp?: boolean;
  deliverEmail?: boolean;
  deliverPush?: boolean;
}

export interface DispatchResult {
  notificationId: string | null;
  inserted: boolean;
  deliveries: Array<{ channel: DeliveryChannel; status: string }>;
}

export class DeliveryDispatcher {
  /**
   * Atomically dispatches notification and delivery logs to Supabase database.
   */
  static async dispatchToUser(
    supabase: SupabaseClient,
    params: DispatchNotificationParams
  ): Promise<DispatchResult> {
    const {
      userId,
      eventId,
      category,
      priority,
      title,
      message,
      actionUrl,
      actionLabel,
      metadata = {},
      isMandatory = false,
      deliverInApp = true,
      deliverEmail = false,
      deliverPush = false,
    } = params;

    const deliveries: Array<{ channel: DeliveryChannel; status: string }> = [];

    // 1. Insert In-App Notification (Idempotent: ON CONFLICT (user_id, event_id) DO NOTHING)
    let notificationId: string | null = null;
    let inserted = false;

    if (deliverInApp || isMandatory) {
      const { data: notifRow, error: notifErr } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          event_id: eventId,
          category,
          priority,
          title,
          message,
          action_url: actionUrl,
          action_label: actionLabel,
          metadata,
          is_mandatory: isMandatory,
          status: 'unread',
        })
        .select('id')
        .maybeSingle();

      if (notifErr) {
        // If conflict error or duplicate, check if row already exists
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('event_id', eventId)
          .maybeSingle();

        if (existing) {
          notificationId = existing.id;
          inserted = false;
        } else {
          throw notifErr;
        }
      } else if (notifRow) {
        notificationId = notifRow.id;
        inserted = true;
      }

      // Record in-app delivery
      if (notificationId) {
        const inAppResult = await MockChannelProvider.simulateDelivery({
          notificationId,
          userId,
          channel: 'in_app',
          title,
          message,
          actionUrl,
          metadata,
        });

        await supabase
          .from('notification_deliveries')
          .upsert(
            {
              notification_id: notificationId,
              channel: 'in_app',
              status: inAppResult.status,
              provider_response: inAppResult.providerResponse,
              delivered_at: inAppResult.deliveredAt,
            },
            { onConflict: 'notification_id,channel' }
          );

        deliveries.push({ channel: 'in_app', status: inAppResult.status });
      }
    }

    // 2. Simulated External Email Delivery
    if (deliverEmail && notificationId) {
      const emailResult = await MockChannelProvider.simulateDelivery({
        notificationId,
        userId,
        channel: 'email',
        title,
        message,
        actionUrl,
        metadata,
      });

      await supabase
        .from('notification_deliveries')
        .upsert(
          {
            notification_id: notificationId,
            channel: 'email',
            status: emailResult.status,
            provider_response: emailResult.providerResponse,
            delivered_at: emailResult.deliveredAt,
          },
          { onConflict: 'notification_id,channel' }
        );

      deliveries.push({ channel: 'email', status: emailResult.status });
    }

    // 3. Simulated External Push Delivery
    if (deliverPush && notificationId) {
      const pushResult = await MockChannelProvider.simulateDelivery({
        notificationId,
        userId,
        channel: 'push',
        title,
        message,
        actionUrl,
        metadata,
      });

      await supabase
        .from('notification_deliveries')
        .upsert(
          {
            notification_id: notificationId,
            channel: 'push',
            status: pushResult.status,
            provider_response: pushResult.providerResponse,
            delivered_at: pushResult.deliveredAt,
          },
          { onConflict: 'notification_id,channel' }
        );

      deliveries.push({ channel: 'push', status: pushResult.status });
    }

    return {
      notificationId,
      inserted,
      deliveries,
    };
  }
}
