/**
 * features/external-integrations/depositories/depositoryTypes.ts
 *
 * Depository (CDSL / NSDL) types, contracts, and format validators.
 * Depository accounts are demat beneficiary references. They are NOT broker trading accounts.
 */

import { IExternalProvider } from '../providers/providerTypes';

export type DepositoryType = 'cdsl' | 'nsdl';

export interface DematFormatValidationResult {
  valid: boolean;
  depositoryType?: DepositoryType;
  dpId?: string;
  clientId?: string;
  maskedReference?: string;
  errorMessage?: string;
}

export interface BeneficiaryAccountVerificationRequest {
  depositoryType: DepositoryType;
  rawReference: string; // CDSL 16-digit or NSDL IN-format
  panNumber?: string;
}

export interface BeneficiaryAccountVerificationResult {
  verified: boolean;
  status: 'informational_valid' | 'invalid_format' | 'unverified_stage1';
  depositoryType: DepositoryType;
  maskedReference: string;
  message: string;
}

export interface IDepositoryProvider extends IExternalProvider {
  readonly providerType: 'depository';
  readonly depositoryType: DepositoryType;

  /**
   * Validates local structural format of depository account numbers.
   */
  validateFormat(rawReference: string): DematFormatValidationResult;

  /**
   * Produces masked representation safe for UI presentation.
   */
  maskReference(rawReference: string): string;

  /**
   * Stage 1 informational verification.
   * STRICT GUARDRAIL: Does not make live calls and does not mark accounts as externally verified.
   */
  verifyAccountInformational(
    request: BeneficiaryAccountVerificationRequest
  ): Promise<BeneficiaryAccountVerificationResult>;
}

/**
 * Validates CDSL 16-digit numeric Beneficiary Owner ID (BO ID).
 * Format: exactly 16 numeric digits.
 */
export function validateCdslBoId(raw: string): DematFormatValidationResult {
  const cleaned = raw.replace(/[\s-]/g, '');
  if (!/^\d{16}$/.test(cleaned)) {
    return {
      valid: false,
      depositoryType: 'cdsl',
      errorMessage: 'CDSL BO ID must be exactly 16 numeric digits.',
    };
  }

  const dpId = cleaned.slice(0, 8);
  const clientId = cleaned.slice(8, 16);
  const maskedReference = `${dpId.slice(0, 4)}XXXX${clientId.slice(4, 8)}`;

  return {
    valid: true,
    depositoryType: 'cdsl',
    dpId,
    clientId,
    maskedReference,
  };
}

/**
 * Validates NSDL 16-character account number.
 * Format: 'IN' followed by 6 numeric digits (DP ID) and 8 numeric digits (Client ID).
 */
export function validateNsdlAccountId(raw: string): DematFormatValidationResult {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!/^IN\d{14}$/.test(cleaned)) {
    return {
      valid: false,
      depositoryType: 'nsdl',
      errorMessage: "NSDL Account Number must begin with 'IN' followed by 14 numeric digits.",
    };
  }

  const dpId = cleaned.slice(0, 8); // 'IN' + 6 digits
  const clientId = cleaned.slice(8, 16); // 8 digits
  const maskedReference = `${dpId.slice(0, 4)}XXXX${clientId.slice(4, 8)}`;

  return {
    valid: true,
    depositoryType: 'nsdl',
    dpId,
    clientId,
    maskedReference,
  };
}

/**
 * Auto-detects and validates either CDSL or NSDL demat identifier.
 */
export function validateDematReference(raw: string): DematFormatValidationResult {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (cleaned.startsWith('IN')) {
    return validateNsdlAccountId(cleaned);
  }
  return validateCdslBoId(cleaned);
}
