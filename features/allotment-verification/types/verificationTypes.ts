/**
 * features/allotment-verification/types/verificationTypes.ts
 *
 * Domain types for Phase 10 / Stage 4: Registrar Allotment Verification Gateway.
 * Strictly adheres to Revision 3 specification:
 * - Deterministic issue bindings
 * - Zero raw PII retention (SHA-256 hashes + masked identifiers)
 * - Strict evidence classification and separation from Phase 5 financial mutation
 */

export type RegistrarVerificationMode =
  | 'automated_api'
  | 'user_assisted'
  | 'cas_statement_upload'
  | 'bank_mandate_evidence'
  | 'manual_admin_entry';

export type EvidenceSourceType =
  | 'REGISTRAR_DIRECT'
  | 'REGISTRAR_USER_ASSISTED'
  | 'CAS_DOCUMENT'
  | 'DEPOSITORY_STATEMENT'
  | 'BANK_NOTIFICATION'
  | 'USER_SCREENSHOT'
  | 'USER_ENTERED'
  | 'ADMIN_ENTERED';

export type VerificationEvidenceClassification =
  | 'REGISTRAR_CONFIRMED'
  | 'DEPOSITORY_CONFIRMED'
  | 'BANK_CONFIRMED'
  | 'USER_PROVIDED'
  | 'MANUAL_ADMIN'
  | 'CONFLICTED'
  | 'UNVERIFIED';

export type VerificationAttemptStatus =
  | 'completed'
  | 'record_not_found'
  | 'challenge_required'
  | 'portal_unavailable'
  | 'parse_error'
  | 'network_error';

export type VerificationResultType =
  | 'allotted'
  | 'partially_allotted'
  | 'not_allotted'
  | 'unknown';

export type LookupType = 'pan' | 'application_no' | 'dp_client_id';

/**
 * Normalized Allotment Outcome (Sanitized, NO RAW PII)
 */
export interface NormalizedAllotmentResult {
  resultType: VerificationResultType;
  sharesApplied: number;
  sharesAllotted: number;
  lotsAllotted?: number;
  allotmentPrice?: number;
  reportedRefundAmount: number;
  sourceObservedAt?: string;
  applicantNameMasked?: string;
  categoryCode?: string;
  depositoryClientIdMasked?: string;
  applicationNumberMasked?: string;
  registrarReference?: string;
}

/**
 * Registrar Issue Binding Record
 */
export interface RegistrarIssueBinding {
  id: string;
  ipo_id: string;
  registrar_code: string;
  registrar_issue_id: string;
  company_name_at_source: string;
  source_portal_url: string;
  lookup_parameters: Record<string, unknown>;
  is_active: boolean;
  discovered_at: string;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Registrar Capability Configuration
 */
export interface RegistrarCapability {
  id: string;
  registrar_code: string;
  display_name: string;
  supports_pan_lookup: boolean;
  supports_application_no_lookup: boolean;
  supports_dp_client_id_lookup: boolean;
  is_headless_api_available: boolean;
  requires_interactive_challenge: boolean;
  terms_access_status: string;
  source_url: string;
  last_verified_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Immutable Allotment Verification Attempt
 */
export interface AllotmentVerificationAttempt {
  id: string;
  application_id: string;
  applicant_id: string;
  ipo_id: string;
  registrar_code: string;
  registrar_binding_id?: string | null;
  attempt_number: number;
  verification_mode: RegistrarVerificationMode;
  attempt_status: VerificationAttemptStatus;
  verification_result: VerificationResultType;
  lookup_type: LookupType;
  lookup_identifier_masked: string;
  lookup_identifier_hash: string;
  normalized_result: NormalizedAllotmentResult | null;
  raw_response_hash: string;
  raw_response_retention: 'none';
  evidence_source_type: EvidenceSourceType;
  evidence_classification: VerificationEvidenceClassification;
  source_observed_at?: string | null;
  verified_at?: string | null;
  idempotency_key: string;
  error_code?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

/**
 * Application Allotment Projection (Current verified view)
 */
export interface ApplicationAllotmentProjection {
  application_id: string;
  applicant_id: string;
  ipo_id: string;
  evidence_classification: VerificationEvidenceClassification;
  last_verified_attempt_id?: string | null;
  shares_applied: number;
  shares_allotted: number;
  lots_allotted: number;
  allotment_price?: number | null;
  reported_refund_amount: number;
  has_conflict: boolean;
  conflict_details?: string | null;
  source_observed_at?: string | null;
  first_verified_at?: string | null;
  last_verified_at?: string | null;
  updated_at: string;
}

export interface SubmitUserAssistedResultInput {
  applicationId: string;
  resultType: 'allotted' | 'partially_allotted' | 'not_allotted';
  sharesAllotted: number;
  allotmentPrice?: number;
  reportedRefundAmount?: number;
  observedAt?: string;
  registrarReference?: string;
  notes?: string;
}

/**
 * Adapter Query Input
 */
export interface RegistrarQueryInput {
  ipoId: string;
  registrarIssueId: string;
  lookupType: LookupType;
  lookupValue: string; // Plain PAN or Application No to be masked + hashed before persistence
  captchaAnswer?: string;
  captchaToken?: string;
  sessionCookies?: Record<string, string>;
}

/**
 * Adapter Query Response
 */
export interface RegistrarAdapterResponse {
  success: boolean;
  status: VerificationAttemptStatus;
  normalizedResult?: NormalizedAllotmentResult;
  rawResponseHash: string; // SHA-256 of raw response (HTML/JSON is NOT stored)
  sourceObservedAt?: string;
  challengeRequired?: boolean;
  challengePayload?: {
    type: 'captcha_image' | 'turnstile' | 'portal_redirect';
    captchaImageUrl?: string;
    sessionId?: string;
    portalUrl?: string;
    instructions: string;
  };
  errorCode?: string;
  errorMessage?: string;
}
