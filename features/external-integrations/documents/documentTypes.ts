/**
 * features/external-integrations/documents/documentTypes.ts
 *
 * Phase 9 Stage 3B: Document Intelligence Type Definitions.
 */

import { IPODocType } from "@/types/database.types";

export interface DiscoveredDocument {
  url: string;
  title: string;
  source: 'sebi' | 'nse' | 'bse' | 'registrar' | 'company';
  externalId?: string;
  sourceObservationId?: string;
  filingDate?: string | null;
  rawCategory?: string | null;
  probeHash?: string | null;
}

export interface DocumentClassificationResult {
  documentType: IPODocType;
  subType: string;
  confidence: number; // 0.0 to 1.0
  classificationReason: string;
  sourceLabel: string;
  hasConflict: boolean;
  conflictDetails?: string;
}

export interface DocumentSecurityCheckResult {
  isSafe: boolean;
  sanitizedUrl?: string;
  resolvedHostname?: string;
  errorReason?: string;
}

export interface DocumentValidationResult {
  isValid: boolean;
  httpStatus: number;
  contentType?: string;
  contentLength?: number;
  probeHash?: string;
  fullSha256?: string;
  isPdfMagicValid: boolean;
  errorReason?: string;
}

export interface DocumentReconciliationResult {
  ipoId?: string;
  canonicalName?: string;
  score: number; // 0.0 to 1.0 (>= 0.95 required for auto-association)
  reason: string;
  isAssociated: boolean;
  candidateIpoIds?: string[];
}

export interface ExtractedOfferMetadata {
  brlms: string[];
  registrarName?: string | null;
  freshIssueCr?: number | null;
  ofsCr?: number | null;
  faceValue?: number | null;
  issueObjects?: string[];
  extractionSource?: string;
}

export interface DocumentSyncResult {
  discoveredCount: number;
  associatedCount: number;
  unassociatedCount: number;
  conflictedCount: number;
  versionUpdatedCount: number;
  errors: string[];
}
