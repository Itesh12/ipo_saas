/**
 * features/finance/workers/stage4OutboxConsumer.ts
 *
 * Stage 5 Durable Outbox Consumer.
 * Reads pending AllotmentVerifiedEvents from Stage 4 outbox and passes them to
 * InvestmentService.processAllotmentVerifiedFinancialEvent.
 *
 * Preserves the architectural boundary:
 * Stage 4 does NOT call Stage 5; Stage 5 / external consumer polls or processes the outbox.
 */

import { Stage4OutboxService } from '@/features/allotment-verification/services/stage4OutboxService';
import { InvestmentService } from '@/features/finance/services/investmentService';
import { AllotmentVerifiedEvent } from '@/features/allotment-verification/types/verificationTypes';

export class Stage4OutboxConsumer {
  /**
   * Processes pending events from the Stage 4 durable outbox.
   * Delivers to Stage 5 InvestmentService.
   */
  static async processPendingQueue(batchSize = 20): Promise<{
    processed: number;
    acknowledged: number;
    failed: number;
  }> {
    return Stage4OutboxService.processPendingOutboxQueue(async (event: AllotmentVerifiedEvent) => {
      // Map outbox event to Stage 5 domain event structure
      const stage5Event = {
        eventId: event.eventId,
        eventType: 'allotment_verified' as const,
        aggregateType: 'ipo_application' as const,
        aggregateId: event.payload.applicationId,
        idempotencyKey: event.idempotencyKey,
        timestamp: event.occurredAt,
        actorId: event.payload.userId,
        payload: {
          allotmentId: event.payload.allotmentId,
          ipoId: event.payload.ipoId,
          applicationId: event.payload.applicationId,
          status: (event.payload.sharesAllotted > 0 ? 'allotted' : 'not_allotted') as 'allotted' | 'partially_allotted' | 'not_allotted',
          sharesApplied: event.payload.sharesAllotted,
          sharesAllotted: event.payload.sharesAllotted,
          allotmentPrice: event.payload.allotmentPrice,
          reportedRefundAmount: event.payload.refundAmount,
          evidenceClassification: event.payload.evidenceClassification,
          verifiedAt: event.occurredAt,
        },
      };

      // Stage 5 idempotent financial consumption
      const result = await InvestmentService.processAllotmentVerifiedFinancialEvent(stage5Event);
      return {
        success: result.success,
        status: result.status,
        error: result.errorMessage,
      };
    }, batchSize);
  }
}
