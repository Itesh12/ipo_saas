/**
 * features/external-integrations/documents/documentSyncService.ts
 *
 * Core Orchestrator for Phase 9 Stage 3B Document Intelligence.
 *
 * Decoupled Architecture:
 * - Operates independently from IPO promotions.
 * - Extracts filings from `public.ipo_ingestion_observations`.
 * - Classifies, validates (PDF magic bytes, anti-HTML), reconciles with canonical `ipos`.
 * - Handles immutable versioning and routes unassociated/conflicting filings to review queue.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { Json } from '@/types/database.types';
import { DiscoveredDocument, DocumentSyncResult } from './documentTypes';
import { documentUrlSecurity } from './documentUrlSecurity';
import { documentClassifier } from './documentClassifier';
import { documentContentValidator } from './documentContentValidator';
import { documentIpoReconciler } from './documentIpoReconciler';
import { documentMetadataExtractor } from './documentMetadataExtractor';

export class DocumentSyncService {
  /**
   * Synchronizes documents for a single canonical IPO on-demand.
   */
  public async syncDocumentsForIpo(
    ipoId: string,
    adminClient?: SupabaseClient
  ): Promise<DocumentSyncResult> {
    const admin = adminClient || createAdminClient();

    // 1. Fetch the canonical IPO details
    const { data: ipo, error: ipoErr } = await admin
      .from('ipos')
      .select('id, company_name, symbol')
      .eq('id', ipoId)
      .single();

    if (ipoErr || !ipo) {
      throw new Error(`Cannot sync documents: IPO ${ipoId} not found: ${ipoErr?.message || 'not found'}`);
    }

    // 2. Discover related observations from ipo_ingestion_observations
    // By company name or symbol or isin
    const { data: observations } = await admin
      .from('ipo_ingestion_observations')
      .select('id, source, document_type, normalized_payload, observed_at');

    const relevantDocs: DiscoveredDocument[] = [];
    if (observations) {
      for (const obs of observations) {
        const p = (obs.normalized_payload || {}) as Record<string, unknown>;
        const compName = typeof p.company_name === 'string' ? p.company_name : '';
        if (
          documentIpoReconciler.normalizeCompanyName(compName) ===
          documentIpoReconciler.normalizeCompanyName(ipo.company_name)
        ) {
          if (typeof p.drhp_url === 'string') {
            relevantDocs.push({
              url: p.drhp_url,
              title: `Draft Red Herring Prospectus of ${ipo.company_name}`,
              source: (obs.source as DiscoveredDocument['source']) || 'sebi',
              sourceObservationId: obs.id,
              filingDate: obs.observed_at,
              rawCategory: obs.document_type,
            });
          }
          if (typeof p.rhp_url === 'string') {
            relevantDocs.push({
              url: p.rhp_url,
              title: `Red Herring Prospectus of ${ipo.company_name}`,
              source: (obs.source as DiscoveredDocument['source']) || 'sebi',
              sourceObservationId: obs.id,
              filingDate: obs.observed_at,
              rawCategory: obs.document_type,
            });
          }
          if (typeof p.prospectus_url === 'string') {
            relevantDocs.push({
              url: p.prospectus_url,
              title: `Prospectus of ${ipo.company_name}`,
              source: (obs.source as DiscoveredDocument['source']) || 'sebi',
              sourceObservationId: obs.id,
              filingDate: obs.observed_at,
              rawCategory: obs.document_type,
            });
          }
        }
      }
    }

    return this.processDiscoveredDocuments(admin, relevantDocs, ipo.id);
  }

  /**
   * Scans all recent observations in `public.ipo_ingestion_observations`
   * and synchronizes discovered offer documents.
   */
  public async syncAllDiscoveredObservations(
    adminClient?: SupabaseClient
  ): Promise<DocumentSyncResult> {
    const admin = adminClient || createAdminClient();

    const { data: observations, error } = await admin
      .from('ipo_ingestion_observations')
      .select('id, source, document_type, normalized_payload, observed_at')
      .order('observed_at', { ascending: false })
      .limit(100);

    if (error || !observations) {
      return {
        discoveredCount: 0,
        associatedCount: 0,
        unassociatedCount: 0,
        conflictedCount: 0,
        versionUpdatedCount: 0,
        errors: [error ? error.message : 'No observations found'],
      };
    }

    const discoveredDocs: DiscoveredDocument[] = [];

    for (const obs of observations) {
      const p = (obs.normalized_payload || {}) as Record<string, unknown>;
      const companyName = typeof p.company_name === 'string' ? p.company_name : 'Unknown Issuer';
      const obsSource = (obs.source as DiscoveredDocument['source']) || 'sebi';

      if (typeof p.drhp_url === 'string') {
        discoveredDocs.push({
          url: p.drhp_url,
          title: `Draft Red Herring Prospectus of ${companyName}`,
          source: obsSource,
          sourceObservationId: obs.id,
          filingDate: obs.observed_at,
          rawCategory: obs.document_type,
        });
      }
      if (typeof p.rhp_url === 'string') {
        discoveredDocs.push({
          url: p.rhp_url,
          title: `Red Herring Prospectus of ${companyName}`,
          source: obsSource,
          sourceObservationId: obs.id,
          filingDate: obs.observed_at,
          rawCategory: obs.document_type,
        });
      }
      if (typeof p.prospectus_url === 'string') {
        discoveredDocs.push({
          url: p.prospectus_url,
          title: `Prospectus of ${companyName}`,
          source: obsSource,
          sourceObservationId: obs.id,
          filingDate: obs.observed_at,
          rawCategory: obs.document_type,
        });
      }
    }

    return this.processDiscoveredDocuments(admin, discoveredDocs);
  }

  /**
   * Processes an array of discovered document candidates.
   */
  public async processDiscoveredDocuments(
    admin: SupabaseClient,
    docs: DiscoveredDocument[],
    targetIpoId?: string
  ): Promise<DocumentSyncResult> {
    let associatedCount = 0;
    let unassociatedCount = 0;
    let conflictedCount = 0;
    let versionUpdatedCount = 0;
    const errors: string[] = [];

    for (const doc of docs) {
      try {
        // 1. SSRF Security Check
        const secCheck = documentUrlSecurity.validateUrl(doc.url);
        if (!secCheck.isSafe) {
          errors.push(`Skipping unsafe URL "${doc.url}": ${secCheck.errorReason}`);
          continue;
        }

        // 2. Document Classification
        const classification = documentClassifier.classify(
          doc.title,
          doc.url,
          doc.source,
          doc.rawCategory
        );

        // Conflict Freeze
        if (classification.hasConflict) {
          conflictedCount++;
          await this.recordUnassociatedDocument(admin, doc, {
            score: 0.0,
            reason: `Classification Conflict: ${classification.conflictDetails}`,
            isAssociated: false,
          });
          continue;
        }

        // 3. Document Content Probe (Magic Bytes & Validation)
        let validationStatus: 'verified' | 'unverified' = 'unverified';
        let probeHash: string | null = doc.probeHash || null;
        let fileSize: number | null = null;

        // Perform probe if URL is reachable
        try {
          const probe = await documentContentValidator.probeDocument(doc.url);
          if (probe.isValid && probe.isPdfMagicValid) {
            validationStatus = 'verified';
            probeHash = probe.probeHash || probeHash;
            fileSize = probe.contentLength || null;
          }
        } catch {
          validationStatus = 'unverified'; // User Invariant: unverified if validation fails!
        }

        // 4. Extract Structured Offer Metadata (BRLMs, Registrar, etc.)
        const extractedMeta = documentMetadataExtractor.extractMetadata(doc.title);

        // 5. Document-to-IPO Reconciliation Gate
        let resolvedIpoId = targetIpoId;
        if (!resolvedIpoId) {
          const reconciliation = await documentIpoReconciler.reconcileDocument(
            admin,
            doc.title
          );

          if (reconciliation.isAssociated && reconciliation.ipoId) {
            resolvedIpoId = reconciliation.ipoId;
          } else {
            // Unassociated -> Route to ipo_unassociated_documents
            unassociatedCount++;
            await this.recordUnassociatedDocument(admin, doc, reconciliation);
            continue;
          }
        }

        // 6. Canonical Association with Versioning
        // Check if an existing version of this file_url exists for this ipo_id
        const { data: existingVersions } = await admin
          .from('ipo_documents')
          .select('id, version_number, probe_hash, sha256_hash, file_size_bytes')
          .eq('ipo_id', resolvedIpoId)
          .eq('file_url', doc.url)
          .order('version_number', { ascending: false });

        if (existingVersions && existingVersions.length > 0) {
          const latest = existingVersions[0];

          // Positive content change detection: only increment version if both hashes exist and differ
          const isContentUpdated =
            Boolean(probeHash) &&
            Boolean(latest.probe_hash) &&
            probeHash !== latest.probe_hash;

          if (!isContentUpdated) {
            // Same document: update verification timestamp and attributes without creating duplicates
            await admin
              .from('ipo_documents')
              .update({
                last_verified_at: new Date().toISOString(),
                validation_status: validationStatus,
                probe_hash: probeHash || latest.probe_hash,
                file_size_bytes: fileSize || latest.file_size_bytes,
              })
              .eq('id', latest.id);
            associatedCount++;
            continue;
          }

          // If probe hash definitely differs -> upstream amended document!
          // Increment version_number to retain immutable history
          const nextVersion = (latest.version_number || 1) + 1;
          await admin.from('ipo_documents').insert({
            ipo_id: resolvedIpoId,
            source_observation_id: doc.sourceObservationId || null,
            title: doc.title,
            document_type: classification.documentType,
            file_url: doc.url,
            version_number: nextVersion,
            probe_hash: probeHash,
            mime_type: 'application/pdf',
            validation_status: validationStatus,
            file_size_bytes: fileSize,
            source: classification.sourceLabel,
            metadata: extractedMeta as unknown as Json,
            published_at: doc.filingDate || null,
          });

          versionUpdatedCount++;
          associatedCount++;
        } else {
          // New Document Record
          await admin.from('ipo_documents').insert({
            ipo_id: resolvedIpoId,
            source_observation_id: doc.sourceObservationId || null,
            title: doc.title,
            document_type: classification.documentType,
            file_url: doc.url,
            version_number: 1,
            probe_hash: probeHash,
            mime_type: 'application/pdf',
            validation_status: validationStatus,
            file_size_bytes: fileSize,
            source: classification.sourceLabel,
            metadata: extractedMeta as unknown as Json,
            published_at: doc.filingDate || null,
          });

          associatedCount++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error processing document "${doc.url}": ${msg}`);
      }
    }

    return {
      discoveredCount: docs.length,
      associatedCount,
      unassociatedCount,
      conflictedCount,
      versionUpdatedCount,
      errors,
    };
  }

  /**
   * Persists an unassociated or conflicted document to public.ipo_unassociated_documents.
   */
  private async recordUnassociatedDocument(
    admin: SupabaseClient,
    doc: DiscoveredDocument,
    reconciliation: { score: number; reason: string; candidateIpoIds?: string[]; isAssociated?: boolean }
  ): Promise<void> {
    const extractedName = documentIpoReconciler.extractIssuerName(doc.title);

    await admin.from('ipo_unassociated_documents').insert({
      source_observation_id: doc.sourceObservationId || null,
      filing_title: doc.title,
      document_type: 'other',
      file_url: doc.url,
      extracted_company_name: extractedName,
      reconciliation_score: reconciliation.score,
      reconciliation_reason: reconciliation.reason,
      candidate_ipo_ids: reconciliation.candidateIpoIds || [],
      status: 'pending_review',
    });
  }
}

export const documentSyncService = new DocumentSyncService();
