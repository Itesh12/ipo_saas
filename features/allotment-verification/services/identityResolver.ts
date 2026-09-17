/**
 * features/allotment-verification/services/identityResolver.ts
 *
 * Deterministic Identity Resolution Layer for Candidate B.
 * Maps Candidate A application records and applicant profiles to registrar-compliant
 * query parameters according to the registrar's declared capability matrix.
 *
 * Prevents redundant or blind multi-identifier queries.
 */

import crypto from 'crypto';
import {
  LookupType,
  RegistrarCapability,
  RegistrarIssueBinding,
  ResolvedLookupQuery,
} from '../types/verificationTypes';

export interface ApplicantProfileData {
  pan_masked?: string | null;
  pan_plain?: string | null;
  demat_dp_id_masked?: string | null;
  demat_account_no_masked?: string | null;
  demat_dp_id_plain?: string | null;
  demat_account_no_plain?: string | null;
}

export interface CandidateAApplicationData {
  id: string;
  application_number: string;
  applicant: ApplicantProfileData;
}

/**
 * Computes SHA-256 hash for secure matching without persisting raw PII
 */
export function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

/**
 * Masks identifier according to regulatory privacy standards
 */
export function maskIdentifier(type: LookupType, value: string): string {
  const clean = value.trim().toUpperCase();
  if (type === 'pan') {
    if (clean.length === 10) {
      return `${clean.slice(0, 5)}****${clean.slice(9)}`;
    }
    return clean.slice(0, 3) + '****' + clean.slice(-2);
  }
  if (type === 'application_no') {
    if (clean.length > 6) {
      return `${clean.slice(0, 4)}***${clean.slice(-2)}`;
    }
    return '***' + clean.slice(-2);
  }
  if (type === 'dp_client_id') {
    if (clean.length >= 8) {
      return `${clean.slice(0, 4)}****${clean.slice(-4)}`;
    }
    return '****' + clean.slice(-4);
  }
  return '****';
}

/**
 * Resolves the primary valid identifier according to registrar capability priority:
 * Priority: PAN -> Application Number -> DP/Client ID
 */
export function resolveRegistrarLookupQuery(params: {
  application: CandidateAApplicationData;
  binding: RegistrarIssueBinding;
  capabilities: RegistrarCapability;
  preferredLookupType?: LookupType;
}): { success: boolean; query?: ResolvedLookupQuery; error?: string } {
  const { application, binding, capabilities, preferredLookupType } = params;

  const applicant = application.applicant;

  // Build candidate map
  const candidates: Partial<Record<LookupType, string>> = {};

  if (applicant.pan_plain || applicant.pan_masked) {
    candidates.pan = applicant.pan_plain || applicant.pan_masked || undefined;
  }

  if (application.application_number) {
    candidates.application_no = application.application_number;
  }

  const dpId = applicant.demat_dp_id_plain || applicant.demat_dp_id_masked;
  const clientId = applicant.demat_account_no_plain || applicant.demat_account_no_masked;
  if (dpId && clientId) {
    candidates.dp_client_id = `${dpId}${clientId}`;
  }

  // Determine priority order
  const order: LookupType[] = preferredLookupType
    ? [preferredLookupType, 'pan', 'application_no', 'dp_client_id']
    : ['pan', 'application_no', 'dp_client_id'];

  for (const lookupType of order) {
    // Check if registrar supports this lookup type
    let isSupported = false;
    if (lookupType === 'pan' && capabilities.supports_pan_lookup) isSupported = true;
    if (lookupType === 'application_no' && capabilities.supports_application_no_lookup) isSupported = true;
    if (lookupType === 'dp_client_id' && capabilities.supports_dp_client_id_lookup) isSupported = true;

    if (isSupported && candidates[lookupType]) {
      const rawValue = candidates[lookupType]!;
      return {
        success: true,
        query: {
          registrarCode: binding.registrar_code,
          registrarIssueId: binding.registrar_issue_id,
          lookupType,
          identifierValue: rawValue,
          identifierMasked: maskIdentifier(lookupType, rawValue),
          identifierHash: hashIdentifier(rawValue),
        },
      };
    }
  }

  return {
    success: false,
    error: `No compatible lookup identifier found for registrar '${binding.registrar_code}'. Supported modes: PAN (${capabilities.supports_pan_lookup}), AppNo (${capabilities.supports_application_no_lookup}), DP (${capabilities.supports_dp_client_id_lookup}).`,
  };
}
