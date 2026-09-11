/**
 * features/application/services/domainEventDispatcher.ts
 *
 * Server-only domain event dispatcher.
 * Kept isolated from client-imported lifecycle metadata to prevent next/headers from bundling into client components.
 */

import { ApplicationDomainEvent } from './applicationLifecycle';

export async function dispatchApplicationDomainEvent(event: ApplicationDomainEvent): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    console.info(`[DomainEvent][${event.eventType}] Application: ${event.applicationId}`, event.payload);
  }

  // Phase 5: Hook into financial ledger & investment service
  try {
    const { InvestmentService } = await import('@/features/finance/services/investmentService');
    const { createClient } = await import('@/lib/supabase/server');

    const supabase = await createClient();
    const { data: rawApp } = await supabase
      .from("ipo_applications")
      .select("id, user_id, applicant_id, ipo_id, application_amount, blocked_amount, refund_amount")
      .eq("id", event.applicationId)
      .single();

    type AppRow = {
      id: string;
      user_id: string;
      applicant_id: string;
      ipo_id: string;
      application_amount: number;
      blocked_amount: number;
      refund_amount: number;
    };

    const app = rawApp as unknown as AppRow | null;
    if (!app) return;

    if (event.eventType === 'funds_blocked') {
      await InvestmentService.handleFundsBlockedEvent({
        eventId: event.eventId,
        applicationId: app.id,
        userId: app.user_id,
        applicantId: app.applicant_id,
        blockedAmount: Number(app.blocked_amount || app.application_amount || 0),
        blockedDate: event.timestamp.split('T')[0] || new Date().toISOString().split('T')[0],
      });
    } else if (event.eventType === 'allotted' || event.eventType === 'partially_allotted' || event.eventType === 'not_allotted') {
      const sharesAllotted = Number(event.payload?.sharesAllotted || 0);
      const allotmentPrice = Number(event.payload?.allotmentPrice || 0);

      await InvestmentService.handleAllotmentRecordedEvent({
        eventId: event.eventId,
        applicationId: app.id,
        userId: app.user_id,
        applicantId: app.applicant_id,
        ipoId: app.ipo_id,
        allotmentStatus: event.eventType,
        sharesAllotted,
        allotmentPrice,
        amountBlocked: Number(app.blocked_amount || app.application_amount || 0),
        allotmentDate: event.timestamp.split('T')[0] || new Date().toISOString().split('T')[0],
      });
    } else if (event.eventType === 'funds_unblocked' || event.eventType === 'refund_completed') {
      const refundAmount = Number(event.payload?.refundAmount ?? app.refund_amount ?? 0);
      if (refundAmount > 0) {
        await InvestmentService.handleFundsUnblockedEvent({
          eventId: event.eventId,
          applicationId: app.id,
          userId: app.user_id,
          applicantId: app.applicant_id,
          refundAmount,
          unblockedDate: event.timestamp.split('T')[0] || new Date().toISOString().split('T')[0],
        });
      }
    }
  } catch (err) {
    console.error(`[dispatchApplicationDomainEvent] Failed to dispatch finance event ${event.eventType}:`, err);
  }
}
