/**
 * features/external-integrations/actions/ingestionActions.ts
 *
 * Phase 9 Stage 3A: Server Actions for Broker-Independent IPO Ingestion.
 * Enforces admin authorization via requireRole('admin') and Phase 8 audit logging.
 */

'use server';

import { requireRole } from '@/lib/security/auth-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { ipoIngestionService, IpoIngestionService } from '../services/ipoIngestionService';
import { SebiPublicIssuesExtractor } from '../adapters/sebiExtractor';
import { AuditLoggingService } from '@/features/admin/services/auditLoggingService';
import { IngestionObservationRecord } from '../ipo-master/ipoMasterTypes';

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

export async function promoteInboxItemToDraft(inboxId: string) {
  const adminUser = await requireRole('admin');
  const ipoId = await ipoIngestionService.promoteToDraft(inboxId, adminUser.id);

  await AuditLoggingService.recordAudit({
    actorId: adminUser.id,
    action: 'PROMOTE_INBOX_TO_DRAFT',
    resourceType: 'INGESTION_INBOX',
    resourceId: inboxId,
    newValues: { promotedIpoId: ipoId },
  });

  return { success: true, ipoId };
}

export async function directPublishInboxItem(inboxId: string) {
  const adminUser = await requireRole('admin');
  const admin = createAdminClient();

  const { data: inbox } = await admin
    .from('ipo_ingestion_inbox')
    .select('*, latest_observation:ipo_ingestion_observations!fk_inbox_latest_observation(*)')
    .eq('id', inboxId)
    .single();

  if (!inbox) throw new Error('Inbox item not found');
  const obs = inbox.latest_observation as unknown as IngestionObservationRecord;
  if (!obs) throw new Error('No observation attached to inbox item');

  // Verify strict 6-point criteria
  const validation = IpoIngestionService.validateDirectPublish(inbox, obs.normalized_payload);
  if (!validation.canPublish) {
    throw new Error(`Direct publish blocked: ${validation.reasons.join(', ')}`);
  }

  // Promote to draft first, then set status = 'open' or 'upcoming'
  const ipoId = await ipoIngestionService.promoteToDraft(inboxId, adminUser.id);

  await admin
    .from('ipos')
    .update({ status: obs.normalized_payload.business_status || 'upcoming' })
    .eq('id', ipoId);

  await admin
    .from('ipo_ingestion_inbox')
    .update({ review_status: 'promoted_to_published' })
    .eq('id', inboxId);

  await AuditLoggingService.recordAudit({
    actorId: adminUser.id,
    action: 'DIRECT_PUBLISH_INBOX_ITEM',
    resourceType: 'INGESTION_INBOX',
    resourceId: inboxId,
    newValues: { ipoId },
  });

  return { success: true, ipoId };
}
