/**
 * features/notifications/services/mockChannelProvider.ts
 *
 * Phase 7B: Simulated External Channel Transport Provider
 * Implements non-production simulated transport for email, push, SMS, and WhatsApp.
 * Strictly avoids external HTTP calls, credentials, and real carrier API keys.
 */

import { DeliveryChannel, DeliveryStatus } from '../types/notification.types';

export interface ChannelDeliveryPayload {
  notificationId: string;
  userId: string;
  channel: DeliveryChannel;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelDeliveryResult {
  channel: DeliveryChannel;
  status: DeliveryStatus;
  providerResponse: Record<string, unknown>;
  deliveredAt: string;
}

export class MockChannelProvider {
  /**
   * Simulates channel dispatch without third-party network egress.
   */
  static async simulateDelivery(payload: ChannelDeliveryPayload): Promise<ChannelDeliveryResult> {
    const deliveredAt = new Date().toISOString();

    if (payload.channel === 'in_app') {
      return {
        channel: 'in_app',
        status: 'delivered',
        providerResponse: {
          transport: 'native_in_app',
          rendered: true,
        },
        deliveredAt,
      };
    }

    // External channels: simulation only
    return {
      channel: payload.channel,
      status: 'simulated',
      providerResponse: {
        transport: 'simulated_mock',
        channel: payload.channel,
        mock_gateway: `mock_${payload.channel}_gateway`,
        recipient_id: payload.userId,
        sanitized_summary: `${payload.title.slice(0, 40)}...`,
      },
      deliveredAt,
    };
  }
}
