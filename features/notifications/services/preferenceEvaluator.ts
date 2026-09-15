/**
 * features/notifications/services/preferenceEvaluator.ts
 *
 * Phase 7B: Notification Preferences & Quiet-Hours Evaluation Engine
 * Enforces mandatory in-app delivery invariants, category channel rules,
 * and user timezone-aware quiet hours suppression.
 */

import { NotificationPriority, NotificationCategory } from '../types/notification.types';

export interface UserPreferenceSettings {
  category: NotificationCategory;
  channelInApp: boolean;
  channelEmail: boolean;
  channelPush: boolean;
}

export interface UserQuietHoursSettings {
  timezone: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm:ss
  quietHoursEnd: string;   // HH:mm:ss
  minPriorityDuringQuiet: NotificationPriority;
}

export interface ChannelEvaluationResult {
  deliverInApp: boolean;
  deliverEmail: boolean;
  deliverPush: boolean;
  isHeldDueToQuietHours: boolean;
  deferredUntil: string | null;
  reason: string;
}

export class PreferenceEvaluator {
  /**
   * Evaluates which channels should deliver the notification based on user preferences,
   * mandatory transactional rules, and quiet hours.
   */
  static evaluateChannels(params: {
    category: NotificationCategory;
    priority: NotificationPriority;
    isMandatory: boolean;
    preferences?: UserPreferenceSettings | null;
    quietHours?: UserQuietHoursSettings | null;
    now?: Date;
  }): ChannelEvaluationResult {
    const { priority, isMandatory, preferences, quietHours, now = new Date() } = params;

    // 1. Mandatory In-App Invariant vs External Channel Privacy
    // Transactional receipts (mandate pending, funds blocked, allotment, refund, capital)
    // MUST always be delivered in-app. External channels strictly respect user preferences.
    const deliverInApp = isMandatory ? true : (preferences?.channelInApp ?? true);
    let deliverEmail = preferences ? preferences.channelEmail : true;
    let deliverPush = preferences ? preferences.channelPush : false;

    // 2. Quiet Hours Evaluation & Deferral
    const inQuietHours = quietHours?.quietHoursEnabled
      ? this.isCurrentTimeInQuietHours(quietHours, now)
      : false;

    let isHeldDueToQuietHours = false;
    let deferredUntil: string | null = null;
    let reason = 'Normal delivery schedule';

    if (inQuietHours) {
      // Urgent alerts strictly bypass quiet hours
      const isUrgent = priority === 'urgent';

      if (isUrgent) {
        reason = 'Urgent priority alert bypassed quiet hours';
      } else {
        // Non-urgent alerts have external channels deferred until quiet hours conclude
        isHeldDueToQuietHours = true;
        deliverEmail = false;
        deliverPush = false;

        // Calculate deferral timestamp (quietHoursEnd)
        deferredUntil = this.computeQuietHoursEndTimestamp(quietHours!, now);
        reason = `Deferred until conclusion of user quiet hours (${quietHours?.quietHoursEnd} ${quietHours?.timezone || 'Asia/Kolkata'})`;
      }
    }

    return {
      deliverInApp,
      deliverEmail,
      deliverPush,
      isHeldDueToQuietHours,
      deferredUntil,
      reason,
    };
  }

  /**
   * Computes the ISO timestamp when the current quiet-hours window concludes.
   */
  static computeQuietHoursEndTimestamp(settings: UserQuietHoursSettings, now: Date = new Date()): string {
    const endStr = settings.quietHoursEnd || '07:00:00';
    const [endH, endM] = endStr.split(':').map(Number);
    const deferredDate = new Date(now);
    deferredDate.setHours(endH, endM, 0, 0);
    if (deferredDate.getTime() <= now.getTime()) {
      deferredDate.setDate(deferredDate.getDate() + 1);
    }
    return deferredDate.toISOString();
  }

  /**
   * Deterministically checks if current time falls within configured quiet hours
   * respecting the user's IANA timezone.
   */
  static isCurrentTimeInQuietHours(settings: UserQuietHoursSettings, date: Date = new Date()): boolean {
    if (!settings.quietHoursEnabled) return false;

    try {
      const tz = settings.timezone || 'Asia/Kolkata';
      // Format current time in user's timezone as HH:mm:ss
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const currentTimeStr = formatter.format(date); // e.g. "23:15:00"

      const start = settings.quietHoursStart || '22:00:00';
      const end = settings.quietHoursEnd || '07:00:00';

      if (start <= end) {
        // Range within same calendar day (e.g. 13:00 to 15:00)
        return currentTimeStr >= start && currentTimeStr < end;
      } else {
        // Range spans midnight (e.g. 22:00 to 07:00)
        return currentTimeStr >= start || currentTimeStr < end;
      }
    } catch {
      // Fallback: if timezone is invalid, return false
      return false;
    }
  }
}
