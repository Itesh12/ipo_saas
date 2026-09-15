/**
 * features/external-integrations/news/newsCompliance.ts
 *
 * Phase 9 Stage 3E: Centralized Compliance & Regulatory Contract (Revision 2).
 * Single source of truth for news and regulatory disclosure compliance disclaimers.
 */

export const NEWS_REGULATORY_DISCLAIMER =
  "Official statutory regulatory announcements are sourced from SEBI, BSE, and NSE public disclosures. Third-party media articles represent external journalistic commentary and do not constitute official exchange filings or investment recommendations." as const;

export interface CompliantNewsPayload<T> {
  data: T;
  disclaimer: typeof NEWS_REGULATORY_DISCLAIMER;
  policyVersion: string;
  isOfficialRegulatory: boolean;
}

/**
 * Wraps any news or announcement structure with mandatory compliance metadata.
 */
export function wrapCompliantNewsPayload<T>(
  data: T,
  isOfficialRegulatory: boolean,
  policyVersion: string = 'NEWS_POLICY_V1_2026_09'
): CompliantNewsPayload<T> {
  return {
    data,
    disclaimer: NEWS_REGULATORY_DISCLAIMER,
    policyVersion,
    isOfficialRegulatory,
  };
}
