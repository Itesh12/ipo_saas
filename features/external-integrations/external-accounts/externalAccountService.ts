/**
 * features/external-integrations/external-accounts/externalAccountService.ts
 *
 * External account service managing depository references.
 *
 * GUARDRAIL 1 ENFORCEMENT:
 * - External account references in Stage 1 are strictly manual/informational.
 * - Under NO circumstances can an account be marked 'verified' via external calls in Stage 1.
 * - Stores masked references for UI and envelope-encrypted values for future API access.
 * - Prohibits trading PINs, passwords, and OTPs.
 */

import crypto from 'crypto';
import {
  ExternalAccountRecord,
  CreateAccountReferenceParams,
  ExternalAccountStatus,
} from './externalAccountTypes';
import {
  validateCdslBoId,
  validateNsdlAccountId,
  validateDematReference,
} from '../depositories/depositoryTypes';
import { assertNoProhibitedCredentials } from '../security/prohibitedCredentials';

// Symmetric key for envelope encryption (derives from env or fallback for local dev)
const ENCRYPTION_SECRET =
  process.env.ENCRYPTION_KEY || 'default-stage1-external-integration-secret-32b';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

export function encryptAccountReference(rawReference: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(rawReference, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptAccountReference(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted account reference format.');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class ExternalAccountService {
  public encryptAccountReference(rawReference: string): string {
    return encryptAccountReference(rawReference);
  }

  public decryptAccountReference(encryptedPayload: string): string {
    return decryptAccountReference(encryptedPayload);
  }

  /**
   * Enforces Guardrail 1: Stage 1 external accounts cannot be marked 'verified'.
   */
  public assertStage1AccountStatus(status: ExternalAccountStatus): void {
    if (status === 'verified') {
      throw new Error(
        'Stage 1 Restriction: External account verification is deferred to Stage 3. Accounts remain informational (pending_verification).'
      );
    }
  }

  /**
   * Prepares and validates a manual account reference record.
   * STRICT: Does not connect externally; validates format locally.
   */
  public prepareAccountReference(params: CreateAccountReferenceParams): Omit<
    ExternalAccountRecord,
    'id' | 'createdAt' | 'updatedAt'
  > {
    // 1. Prohibit credentials in metadata
    if (params.metadata) {
      assertNoProhibitedCredentials(params.metadata);
    }

    // 2. Validate format according to provider / depository type
    let masked = '';
    let resolvedDepositoryType = params.depositoryType;

    if (params.providerType === 'depository') {
      if (params.depositoryType === 'cdsl') {
        const val = validateCdslBoId(params.rawReference);
        if (!val.valid) throw new Error(val.errorMessage || 'Invalid CDSL BO ID format.');
        masked = val.maskedReference!;
      } else if (params.depositoryType === 'nsdl') {
        const val = validateNsdlAccountId(params.rawReference);
        if (!val.valid) throw new Error(val.errorMessage || 'Invalid NSDL Account format.');
        masked = val.maskedReference!;
      } else {
        const val = validateDematReference(params.rawReference);
        if (!val.valid) throw new Error(val.errorMessage || 'Invalid demat format.');
        masked = val.maskedReference!;
        resolvedDepositoryType = val.depositoryType;
      }
    } else {
      // Non-depository provider fallback masking
      masked = params.rawReference.length > 8
        ? `${params.rawReference.slice(0, 4)}XXXX${params.rawReference.slice(-4)}`
        : 'XXXX-REF';
    }

    // 3. Encrypt raw reference
    const encrypted = encryptAccountReference(params.rawReference.trim());

    // 4. Invariant: Status starts strictly at 'pending_verification' in Stage 1
    const status: ExternalAccountStatus = 'pending_verification';

    return {
      userId: params.userId,
      providerId: params.providerId,
      providerType: params.providerType,
      depositoryType: resolvedDepositoryType,
      accountReferenceMasked: masked,
      accountReferenceEncrypted: encrypted,
      status,
      metadata: params.metadata || {},
    };
  }
}

export const externalAccountService = new ExternalAccountService();
