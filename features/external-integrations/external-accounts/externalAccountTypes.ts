/**
 * features/external-integrations/external-accounts/externalAccountTypes.ts
 *
 * External account reference models and types.
 *
 * STRICT INVARIANT:
 * - Separates masked reference (safe for UI) from encrypted identifier.
 * - Zero storage of trading passwords, PINs, TPINs, or OTPs.
 * - Stage 1 accounts remain informational (pending_verification).
 */

import { ExternalProviderType } from '../providers/providerTypes';
import { DepositoryType } from '../depositories/depositoryTypes';

export type ExternalAccountStatus =
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'revoked';

export interface ExternalAccountRecord {
  id: string;
  userId: string;
  providerId: string;
  providerType: ExternalProviderType;
  depositoryType?: DepositoryType;
  accountReferenceMasked: string;
  accountReferenceEncrypted?: string;
  status: ExternalAccountStatus;
  verifiedAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountReferenceParams {
  userId: string;
  providerId: string;
  providerType: ExternalProviderType;
  depositoryType?: DepositoryType;
  rawReference: string;
  metadata?: Record<string, unknown>;
}

export interface ExternalConsentRecord {
  id: string;
  userId: string;
  providerId: string;
  consentVersion: string;
  requestedScopes: string[];
  grantedScopes: string[];
  ipAddress?: string;
  userAgent?: string;
  grantedAt: string;
  revokedAt?: string;
}
