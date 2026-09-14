/**
 * features/external-integrations/gmp/gmpCompliance.ts
 *
 * Phase 9 Stage 3D: Centralized Compliance & Regulatory Contract (Revision 2).
 * Single source of truth for mandatory SEBI compliance disclaimers and data classifications.
 */

export const GMP_DISCLAIMER_V1 =
  "Grey Market Premium (GMP) is an unofficial, unregulated market sentiment indicator based on non-exchange OTC trades. It does not represent an official NSE/BSE quote and does not guarantee listing price or trading returns." as const;

export type DataAuthoritativeness =
  | 'official_regulatory'        // SEBI filings, statutory circulars
  | 'exchange_cleared'           // Official BSE/NSE cumulative bidding
  | 'derived_estimate'           // Pre-basis mathematical lottery odds
  | 'unofficial_otc_sentiment';  // Grey Market Premium, Kostak, Subject to Sauda

export interface CompliantGMPPayload<T> {
  data: T;
  authoritativeness: 'unofficial_otc_sentiment';
  disclaimer: typeof GMP_DISCLAIMER_V1;
  policyVersion: string;
  isOfficialExchangeData: false;
}

/**
 * Wraps any raw or calculated GMP structure with canonical compliance metadata.
 */
export function wrapCompliantGMPPayload<T>(
  data: T,
  policyVersion: string = 'GMP_POLICY_V1_2026_09'
): CompliantGMPPayload<T> {
  return {
    data,
    authoritativeness: 'unofficial_otc_sentiment',
    disclaimer: GMP_DISCLAIMER_V1,
    policyVersion,
    isOfficialExchangeData: false,
  };
}
