/**
 * features/external-integrations/actions/ingestionActions.ts
 *
 * Phase 9 Stage 3A: Server Actions for Broker-Independent IPO Ingestion.
 * Enforces admin authorization via requireRole('admin') and Phase 8 audit logging.
 */

'use server';

import { requireRole } from '@/lib/security/auth-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { ipoIngestionService } from '../services/ipoIngestionService';
import { SebiPublicIssuesExtractor } from '../adapters/sebiExtractor';
import { AuditLoggingService } from '@/features/admin/services/auditLoggingService';

export interface IngestionTriggerParams {
  source: 'sebi' | 'nse' | 'bse' | 'upstox' | 'all';
}

export async function triggerIpoIngestion(params: IngestionTriggerParams) {
  const adminUser = await requireRole('admin');
  const results: Record<string, unknown> = {};

  try {
    // 1. SEBI Ingestion (Tier 1 Regulatory)
    if (params.source === 'sebi' || params.source === 'all') {
      try {
        const response = await fetch(SebiPublicIssuesExtractor.BASE_URL, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          next: { revalidate: 0 },
        });

        if (response.ok) {
          const html = await response.text();
          const extractions = SebiPublicIssuesExtractor.parseHtml(html);
          let ingestedCount = 0;
          for (const ext of extractions.slice(0, 10)) { // Ingest top 10 latest
            await ipoIngestionService.ingestObservation(ext);
            ingestedCount++;
          }
          results.sebi = { success: true, count: ingestedCount };
        } else {
          results.sebi = { success: false, status: response.status };
        }
      } catch (err: unknown) {
        results.sebi = { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    // 2. Audit Trail
    await AuditLoggingService.recordAudit({
      actorId: adminUser.id,
      action: 'TRIGGER_IPO_INGESTION',
      resourceType: 'INGESTION_INBOX',
      resourceId: 'batch',
      newValues: { params, results },
    });

    return { success: true, results };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getPendingInboxItems() {
  await requireRole('admin');
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('ipo_ingestion_inbox')
    .select(`
      *,
      latest_observation:ipo_ingestion_observations!fk_inbox_latest_observation(
        id, source, document_type, observation_version, normalized_payload, provenance, observed_at
      )
    `)
    .in('review_status', ['pending', 'promoted_to_draft'])
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Retrieves the full canonical review queue with 7-field gatekeeper evaluation.
 */
export async function getCanonicalReviewQueueAction() {
  await requireRole('admin');
  const { ipoCanonicalPromotionService } = await import('../services/ipoCanonicalPromotionService');
  return await ipoCanonicalPromotionService.getCanonicalReviewQueue();
}

/**
 * Promotes a candidate to Canonical Master as a DRAFT.
 * Does NOT publish to the public catalog.
 */
export async function promoteCandidateToDraftAction(inboxId: string) {
  const adminUser = await requireRole('admin');
  const { ipoCanonicalPromotionService } = await import('../services/ipoCanonicalPromotionService');
  const result = await ipoCanonicalPromotionService.promoteCandidateToDraft(inboxId, adminUser.id);

  await AuditLoggingService.recordAudit({
    actorId: adminUser.id,
    action: 'PROMOTE_CANDIDATE_TO_DRAFT',
    resourceType: 'INGESTION_INBOX',
    resourceId: inboxId,
    newValues: { ipoId: result.ipoId, slug: result.slug },
  });

  return result;
}

/**
 * Explicit Admin Approval: Promotes and PUBLISHES an eligible candidate to public catalog.
 * Strict Gate: Fails closed if 7-field gate is not satisfied.
 */
export async function approveAndPublishCandidateAction(inboxId: string) {
  const adminUser = await requireRole('admin');
  const { ipoCanonicalPromotionService } = await import('../services/ipoCanonicalPromotionService');
  const result = await ipoCanonicalPromotionService.approveAndPublishCandidate(inboxId, adminUser.id);

  await AuditLoggingService.recordAudit({
    actorId: adminUser.id,
    action: 'APPROVE_AND_PUBLISH_CANDIDATE',
    resourceType: 'INGESTION_INBOX',
    resourceId: inboxId,
    newValues: { ipoId: result.ipoId, slug: result.slug, status: result.businessStatus },
  });

  return result;
}

/**
 * Explicit Admin Rejection with documented reason.
 */
export async function rejectCandidateAction(inboxId: string, reason: string) {
  const adminUser = await requireRole('admin');
  const { ipoCanonicalPromotionService } = await import('../services/ipoCanonicalPromotionService');
  await ipoCanonicalPromotionService.rejectCandidate(inboxId, adminUser.id, reason);

  await AuditLoggingService.recordAudit({
    actorId: adminUser.id,
    action: 'REJECT_CANDIDATE',
    resourceType: 'INGESTION_INBOX',
    resourceId: inboxId,
    newValues: { reason },
  });

  return { success: true };
}

// Backwards-compatible aliases
export async function promoteInboxItemToDraft(inboxId: string) {
  const res = await promoteCandidateToDraftAction(inboxId);
  return { success: true, ipoId: res.ipoId };
}

export async function directPublishInboxItem(inboxId: string) {
  const res = await approveAndPublishCandidateAction(inboxId);
  return { success: true, ipoId: res.ipoId };
}
