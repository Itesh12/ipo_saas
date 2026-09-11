/**
 * features/notifications/services/realtime/notificationRealtimeService.ts
 *
 * Authoritative Supabase Realtime subscription manager for Phase 7C.
 *
 * Responsibilities:
 *  - Establishes user-scoped channel on `public.notifications`
 *  - Enforces client filter `user_id=eq.<userId>` (optimization layer over RLS)
 *  - Emits normalized INSERT and UPDATE payloads
 *  - Manages subscription lifecycle, token refreshes, and graceful teardown
 */

import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { NotificationRow } from "../../types/notification.types";
import {
  NotificationRealtimeEvent,
  RealtimeConnectionStatus,
  RealtimeSubscriptionHandle,
  RealtimeSubscriptionOptions,
} from "./realtimeTypes";

export class NotificationRealtimeService {
  private static instance: NotificationRealtimeService | null = null;
  private client: SupabaseClient;
  private activeChannel: RealtimeChannel | null = null;
  private activeUserId: string | null = null;
  private currentStatus: RealtimeConnectionStatus = "disconnected";

  private constructor(client?: SupabaseClient) {
    this.client = client || createClient();
  }

  public static getInstance(client?: SupabaseClient): NotificationRealtimeService {
    if (client) {
      NotificationRealtimeService.instance = new NotificationRealtimeService(client);
    } else if (!NotificationRealtimeService.instance) {
      NotificationRealtimeService.instance = new NotificationRealtimeService();
    }
    return NotificationRealtimeService.instance;
  }

  /**
   * Subscribes to realtime notifications for the specified authenticated user.
   */
  public subscribe(options: RealtimeSubscriptionOptions): RealtimeSubscriptionHandle {
    const { userId, onEvent, onStatusChange, onError } = options;

    if (!userId) {
      throw new Error("Cannot subscribe to realtime notifications without an authenticated userId.");
    }

    // If channel is already active for this exact user, return handle
    if (this.activeChannel && this.activeUserId === userId) {
      return {
        channelName: this.activeChannel.topic,
        unsubscribe: () => this.unsubscribe(),
        getStatus: () => this.currentStatus,
      };
    }

    // Clean up any prior channel for a different user
    if (this.activeChannel) {
      this.unsubscribe();
    }

    this.activeUserId = userId;
    this.updateStatus("connecting", onStatusChange);

    const channelTopic = `user-notifications:${userId}`;
    const channel = this.client.channel(channelTopic);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try {
          const eventType = payload.eventType as NotificationRealtimeEvent["eventType"];
          const newRecord = (payload.new && Object.keys(payload.new).length > 0)
            ? (payload.new as NotificationRow)
            : null;
          const oldRecord = (payload.old && Object.keys(payload.old).length > 0)
            ? (payload.old as Partial<NotificationRow>)
            : null;

          const event: NotificationRealtimeEvent = {
            eventType,
            new: newRecord,
            old: oldRecord,
            timestamp: payload.commit_timestamp || new Date().toISOString(),
          };

          onEvent(event);
        } catch (err) {
          console.error("[NotificationRealtimeService] Error processing event:", err);
          if (onError && err instanceof Error) {
            onError(err);
          }
        }
      }
    );

    channel.subscribe((status, err) => {
      if (err) {
        console.error("[NotificationRealtimeService] Subscription error:", err);
        this.updateStatus("degraded", onStatusChange);
        if (onError) onError(err);
        return;
      }

      switch (status) {
        case "SUBSCRIBED":
          this.updateStatus("connected", onStatusChange);
          break;
        case "TIMED_OUT":
          this.updateStatus("reconnecting", onStatusChange);
          break;
        case "CLOSED":
          this.updateStatus("disconnected", onStatusChange);
          break;
        case "CHANNEL_ERROR":
          this.updateStatus("degraded", onStatusChange);
          break;
        default:
          break;
      }
    });

    this.activeChannel = channel;

    return {
      channelName: channelTopic,
      unsubscribe: () => this.unsubscribe(),
      getStatus: () => this.currentStatus,
    };
  }

  /**
   * Refreshes the auth token on the active realtime socket without reconnecting.
   */
  public async setAuthToken(token: string): Promise<void> {
    try {
      if (this.client.realtime && typeof this.client.realtime.setAuth === "function") {
        await this.client.realtime.setAuth(token);
      }
    } catch (err) {
      console.warn("[NotificationRealtimeService] setAuth error:", err);
    }
  }

  /**
   * Teardown active channel, reset in-memory state and clear active user.
   */
  public async unsubscribe(): Promise<void> {
    if (this.activeChannel) {
      const channelToClean = this.activeChannel;
      this.activeChannel = null;
      this.activeUserId = null;
      this.currentStatus = "disconnected";

      try {
        await channelToClean.unsubscribe();
        if (this.client && typeof this.client.removeChannel === "function") {
          this.client.removeChannel(channelToClean);
        }
      } catch (err) {
        console.warn("[NotificationRealtimeService] Unsubscribe error:", err);
      }
    }
  }

  public getStatus(): RealtimeConnectionStatus {
    return this.currentStatus;
  }

  public getActiveUserId(): string | null {
    return this.activeUserId;
  }

  private updateStatus(
    status: RealtimeConnectionStatus,
    callback?: (status: RealtimeConnectionStatus) => void
  ) {
    this.currentStatus = status;
    if (callback) {
      callback(status);
    }
  }
}
